// Local player controller (FPS) + remote player avatar rendering.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, damp, textTexture } from './utils.js';
import { audio } from './audio.js';
import { buildPerkBottle } from './weapons.js';
import { PERK_DRINK_TIMELINE, perkDrinkPhase } from './gameplay-rules.js';

export { LocalPlayer } from './player/local.js';

// ---------------- remote avatar (animated soldier, CC0 rig, per-player uniform) ----------------
import { clone as skClone } from '../vendor/SkeletonUtils.js';
import { assets } from './assets.js';
import { measureStandingBounds, measureNeutralBounds } from './zombies.js';
import { buildDisplayWeapon } from './weapons.js';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { humaniseSoldierFace } from './render/SoldierFace.js';
import {
  attachSoldierGear, detachSoldierGear, setSoldierGearLOD,
  SOLDIER_LOOKS, HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX,
} from './render/SoldierGear.js';
import { soldierAtlas } from './player/atlas.js';

// How tall a marine stands, measured on the skinned body with the head brought
// down to human proportion. Headgear is allowed above this.
const SOLDIER_HEIGHT = 1.78;
// Human band for the calibration post-condition below. Deliberately tighter
// than the zombies' [1.60, 2.00]: every marine is authored to one height, so
// any spread at all is a bug rather than variation.
const SOLDIER_MIN_H = 1.70;
const SOLDIER_MAX_H = 1.86;

// ---------------------------------------------------------------------------
// pose helpers
// ---------------------------------------------------------------------------

const _pv = new THREE.Vector3();
const _pv2 = new THREE.Vector3();
const _pv3 = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pm = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _wm = new THREE.Matrix4();

/**
 * Point a bone's own +Y axis (every joint in this rig runs +Y toward its child)
 * along a world direction, keeping the bone's +Z as close to `ref` as it can.
 * Writes the LOCAL quaternion, so the result still rides the parent.
 */
function aimBoneY(bone, dirWorld, ref) {
  _by.copy(dirWorld).normalize();
  _bz.copy(ref).addScaledVector(_by, -ref.dot(_by));
  if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  _pm.makeBasis(_bx, _by, _bz);
  _pq.setFromRotationMatrix(_pm);
  bone.parent.updateWorldMatrix(true, false);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(_pq);
  bone.updateWorldMatrix(false, false);
}

/**
 * Two-bone IK, used ONCE at build time to derive the rifle-carry arm pose from
 * hand positions rather than from guessed Euler angles. Solving it means the
 * pose stays correct if the spine correction is ever retuned, which hand-typed
 * angles emphatically would not.
 */
function solveArm(upper, lower, hand, target, pole, lengths = null) {
  upper.updateWorldMatrix(true, false);
  const S = upper.getWorldPosition(new THREE.Vector3());
  const E0 = lower.getWorldPosition(new THREE.Vector3());
  const l1 = lengths ? lengths[0] : S.distanceTo(E0);
  const l2 = lengths ? lengths[1]
    : E0.distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  if (l1 < 1e-4 || l2 < 1e-4) return;
  _pv.copy(target).sub(S);
  const d = clamp(_pv.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _pv.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _pv2.copy(pole).sub(S);
  _pv2.addScaledVector(_pv, -_pv2.dot(_pv));
  if (_pv2.lengthSq() < 1e-8) _pv2.set(0, -1, 0).addScaledVector(_pv, -(-_pv.y));
  _pv2.normalize();
  const E = new THREE.Vector3().copy(S).addScaledVector(_pv, a).addScaledVector(_pv2, h);
  aimBoneY(upper, _pv3.copy(E).sub(S), _pv2);
  aimBoneY(lower, _pv3.copy(target).sub(E), _pv2);
}

/**
 * Collapse a built weapon into one mesh per material.
 *
 * The viewmodels are assembled from sixty-odd individually placed parts, which
 * is exactly right in the player's own hands — the rig animates the bolt, the
 * magazine, the charging handle. On a teammate across the room none of that
 * moves and none of it is legible, so it is sixty-odd draw calls for nothing:
 * three armed teammates cost more than the entire rest of the frame. Flattened
 * once at build time and cached, a held weapon costs a handful of calls.
 *
 * The muzzle anchor is re-created afterwards, because remote fire effects are
 * placed on it and it must survive the flatten.
 */
function flattenWeapon(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const muzzle = group.userData.muzzle;
  let muzzleLocal = null;
  if (muzzle) {
    muzzle.updateWorldMatrix(true, false);
    muzzleLocal = new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld).applyMatrix4(inv);
  }
  const byMaterial = new Map();
  const keep = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (Array.isArray(o.material)) { keep.push(o); return; }   // rare; leave alone
    const geo = o.geometry.clone();
    geo.applyMatrix4(_wm.multiplyMatrices(inv, o.matrixWorld));
    let list = byMaterial.get(o.material);
    if (!list) { list = []; byMaterial.set(o.material, list); }
    list.push(geo);
  });
  const out = new THREE.Group();
  out.userData = { ...group.userData };
  for (const [material, list] of byMaterial) {
    // mergeGeometries refuses a set whose attributes differ, so reduce every
    // member to the attributes they all share before merging.
    let common = null;
    for (const g of list) {
      const names = new Set(Object.keys(g.attributes));
      common = common ? new Set([...common].filter((n) => names.has(n))) : names;
    }
    for (const g of list) {
      for (const name of Object.keys(g.attributes)) if (!common.has(name)) g.deleteAttribute(name);
      if (g.index && !list.every((x) => x.index)) g.setIndex(null);
    }
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (list.length > 1) for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    out.add(mesh);
  }
  for (const o of keep) out.add(o);
  if (muzzleLocal) {
    const anchor = new THREE.Object3D();
    anchor.position.copy(muzzleLocal);
    out.add(anchor);
    out.userData.muzzle = anchor;
  }
  return out;
}

/** Rotate about the bone's own X axis, which is the world X axis at rest for
 *  every bone this is used on (the spine and the legs). */
function tiltX(bone, radians) {
  if (bone && radians) bone.rotateX(radians);
}

/**
 * How far the pelvis is lifted out of the shipped rig's permanent half-crouch,
 * in the skeleton's own root units (so it survives both height calibrations).
 * The legs are IK'd back down onto the clip's foot bones afterwards.
 */
const HIP_LIFT = 0.100;

/**
 * Leg proportions. The shipped rig is built to cartoon proportions — short
 * legs under a long broad torso, which is most of what reads as "toy soldier"
 * once the figure is standing upright.
 *
 * The thigh is lengthened by MOVING THE KNEE BONE, not by scaling it: a
 * non-uniform scale on a parent shears every rotated child below it, and the
 * knee is rotated in every frame of every locomotion clip. The ankle is then
 * dropped by the matching amount, and because the legs are IK'd onto the
 * ankles the shin follows and the foot still plants where the animator put it.
 */
const LEG_STRETCH = 1.45;       // multiplies the hip-to-knee bone offset
const FOOT_DROP = 0.190;        // root-space units the ankle is lowered by

const _footTarget = new THREE.Vector3();
const _kneePole = new THREE.Vector3();

/** The knuckle joints — scaling these scales the whole digit. */
const FINGER_ROOTS = [];
/** Every finger joint, both hands. Curled into a fist at build time. */
const FINGER_BONES = [];
for (const side of ['L', 'R']) {
  for (const digit of ['Index', 'Middle', 'Pinky', 'Thumb']) FINGER_ROOTS.push(`${digit}1${side}`);
  for (const digit of ['Index', 'Middle', 'Pinky']) {
    for (let j = 1; j <= 3; j++) FINGER_BONES.push(`${digit}${j}${side}`);
  }
  for (let j = 1; j <= 2; j++) FINGER_BONES.push(`Thumb${j}${side}`);
}

/** Every bone SoldierVisual writes to. Their pure clip rotations are cached
 *  each frame and put back before the next mixer update — see _applyRig. */
const POSED_BONES = [
  'Hips', 'Abdomen', 'Torso', 'Neck', 'Head',
  'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR',
  'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR',
  ...FINGER_BONES,
];

export class SoldierVisual {
  constructor(variant = 0, { gear = true } = {}) {
    const src = assets.models.zombie1;
    this.ok = false;
    this.variant = variant | 0;
    this.look = SOLDIER_LOOKS[this.variant % SOLDIER_LOOKS.length];
    this.group = new THREE.Group();
    this.inner = skClone(src.scene);
    // Close the mouth, bury the teeth, tuck the ears. Runs on a CLONE of the
    // geometry, so the horde keeps its scream — see js/render/SoldierFace.js.
    if (gear) humaniseSoldierFace(this.inner);
    this.group.add(this.inner);
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.actions = {};
    for (const clip of src.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    // Kept for callers that used to hide the old box rifle. The real weapon
    // now lives on `weaponGroup` and is only built when one is equipped.
    this.gun = null;
    this.aimPitch = 0;
    this.crouch = 0;
    this.armWeight = 1;
    this._armTarget = 1;
    this.lod = 0;

    const tex = soldierAtlas(this.variant);
    this.inner.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        if (tex) { o.material.map = tex; o.material.color = new THREE.Color(0xffffff); }
        o.material.roughness = 0.92;
      }
    });

    // Pass one: normalise the shipped rig off a neutral standing pose. This
    // leaves the skeleton holding Idle, which is the pose the gear is fitted
    // against below.
    const m = measureStandingBounds(this.inner, this.mixer, this.actions.Idle || this.actions.Walk);
    if (!(m && m.h > 0.1)) return;
    const f = SOLDIER_HEIGHT / m.h;
    this.inner.scale.setScalar(f);
    this.inner.position.y -= m.minY * f;
    this.ok = true;

    this.bones = {};
    this.inner.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    // Segment lengths, measured on the untouched rig. The foot is an IK bone
    // parented to the root rather than to the shin, so the shin's length has
    // to be measured to it explicitly.
    this.legLengths = null;
    this._restKneeY = this.bones.LowerLegL ? this.bones.LowerLegL.position.y : null;

    // Straighten the shambler and bring the cartoon skull down to human
    // proportion BEFORE fitting anything, so the gear is measured against the
    // silhouette that will actually be on screen.
    this.group.updateMatrixWorld(true);
    this._applyRig(0, 1);
    this.inner.updateMatrixWorld(true);

    // The rifle-carry arm pose, solved from where the hands need to be rather
    // than authored as angles. Captured as local quaternions and blended in
    // every frame, so the legs keep running while the upper body holds a gun.
    this.armPose = null;
    if (gear) this._buildArmPose();

    // Pass two: the corrections above changed the standing height (a straighter
    // spine is taller, a human-sized head is shorter). Re-normalise so a marine
    // is 1.78 m whatever the corrections end up being.
    this.inner.updateMatrixWorld(true);
    const m2 = this._measureBody();
    if (m2 && m2.h > 0.1) {
      const f2 = SOLDIER_HEIGHT / m2.h;
      this.inner.scale.multiplyScalar(f2);
      this.inner.position.y = (this.inner.position.y - m2.minY) * f2;
      this.group.updateMatrixWorld(true);
      this.inner.updateMatrixWorld(true);
    }

    // Post-condition on the height, measured with the SHARED neutral sampler
    // rather than with _measureBody's world-space sweep.
    //
    // This exists because the two passes above cannot verify themselves.
    // _measureBody() double-applies the rig's transform (see the hazard note on
    // it), so its `h` is inflated by whatever scale pass one had already
    // applied, and pass two's multiplyScalar then divides that back out. The
    // two errors cancel and a marine does land at 1.78 m — but by cancellation,
    // not by construction, and nothing downstream would notice if they stopped
    // cancelling. This is the same shape of bug that shipped ground-riser
    // zombies at 2.4-2.8 m, silent until someone measured a horde.
    //
    // So: measure the finished rig on a ruler that is independent of both
    // passes, and if it is outside a human band, discard the compounded result
    // and derive the scale directly from the neutral height. That is a strictly
    // better fallback than the pair of factors that produced the failure.
    const check = measureNeutralBounds(this.inner, this.group);
    if (check) {
      const nativeH = check.max.y - check.min.y;
      const finalH = nativeH * this.inner.scale.y;
      if (nativeH > 0.1 && !(finalH >= SOLDIER_MIN_H && finalH <= SOLDIER_MAX_H)) {
        const s = clamp(SOLDIER_HEIGHT / nativeH, SOLDIER_MIN_H / nativeH, SOLDIER_MAX_H / nativeH);
        this.inner.scale.setScalar(s);
        this.inner.position.y = -check.min.y * s;
        this.group.updateMatrixWorld(true);
        this.inner.updateMatrixWorld(true);
        console.warn(`[soldier] calibration produced ${finalH.toFixed(2)}m; fell back to ${(nativeH * s).toFixed(2)}m`);
      }
    }

    // Leg segment lengths, measured LAST — after the height calibration above,
    // because that rescales the whole rig and the IK solves in world metres.
    // Measuring before it leaves the solver reaching for targets in the wrong
    // units, and the knees splay out sideways looking for them.
    if (this.bones.UpperLegL && this.bones.LowerLegL && this.bones.FootL) {
      const hip = this.bones.UpperLegL.getWorldPosition(new THREE.Vector3());
      const knee = this.bones.LowerLegL.getWorldPosition(new THREE.Vector3());
      const ankle = this.bones.FootL.getWorldPosition(new THREE.Vector3());
      this.legLengths = [hip.distanceTo(knee), knee.distanceTo(ankle)];
    }

    // Uniform, webbing, headgear — merged geometry parented to the bones that
    // already animate. See js/render/SoldierGear.js.
    this.gear = gear ? attachSoldierGear(this, this.variant) : null;

    // Where a held weapon hangs. Parented to the right forearm at the hand
    // joint, so it inherits the arm exactly and cannot drift off it.
    this._buildWeaponMount();
    this.mixer.stopAllAction();
    this.current = null;
  }

  /** Skinned-body bounds in group space, with the current corrections applied. */
  /**
   * HAZARD — this sweep is correct only by accident. Do not copy it.
   *
   * It measures skinned bounds straight into world space: getVertexPosition()
   * skins the vertex, and then matrixWorld is applied on top. Whether that is
   * a DOUBLE application of the ancestor chain depends on whether the rig's
   * transform is identity at the moment of the call, and it is silent when it
   * is. That exact pattern is what produced the giant-zombie bug: a ground
   * riser was measured while animate() had pitched the group up to 54 degrees,
   * the chain got squared, a folded body measured 0.70 m against a true 1.23 m,
   * and the resulting scale factor locked in permanently. 68 of 260 rigs came
   * out between 2.0 m and 2.85 m. See js/zombies.js, where measureNeutralBounds()
   * is the fixed sampler: it zeroes inner.position/scale AND the group's
   * position, scale and full QUATERNION (not just yaw) before sampling, so the
   * frame is genuinely identity and the second application is a no-op.
   *
   * Why this call site survives today: it runs inside the constructor, and both
   * the group and inner are still untouched at that point. But it is called at
   * pass TWO, after pass one has already done inner.scale.setScalar(f) — so it
   * is one stale updateMatrixWorld, or one reordering of these passes, away
   * from the same failure. It is load-bearing that nothing moves this call.
   *
   * The proper fix is to route this through the shared neutralising sampler
   * rather than keep a second copy of the sweep. That was deliberately NOT done
   * in the same pass that fixed the zombies, because SoldierGear.js fits its
   * merged gear against the calibration this produces, and changing the
   * calibration and the gear fitting simultaneously would make a regression in
   * either one impossible to attribute.
   */
  _measureBody() {
    const bb = new THREE.Box3();
    const v = new THREE.Vector3();
    let found = false;
    this.inner.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.skeleton?.update();
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 600));
      for (let i = 0; i < pos.count; i += step) {
        o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        bb.expandByPoint(v);
      }
      found = true;
    });
    if (!found || bb.isEmpty()) return null;
    return { h: bb.max.y - bb.min.y, minY: bb.min.y };
  }

  _buildArmPose() {
    const B = this.bones;
    const need = ['UpperArmL', 'LowerArmL', 'Middle1L', 'UpperArmR', 'LowerArmR', 'Middle1R', 'Torso', 'Neck'];
    if (!need.every((n) => B[n])) return;
    B.Torso.updateWorldMatrix(true, false);
    const chest = B.Neck.getWorldPosition(new THREE.Vector3());
    // Both hands forward of the chest, right on the grip and left across on
    // the fore-end — the low-ready every rifleman in the period photographs
    // stands in, and the pose the weapon mount below is aligned to.
    const rightHand = new THREE.Vector3(chest.x - 0.17, chest.y - 0.30, chest.z + 0.20);
    const leftHand = new THREE.Vector3(chest.x + 0.06, chest.y - 0.24, chest.z + 0.40);
    const poleR = new THREE.Vector3(chest.x - 0.62, chest.y - 0.72, chest.z - 0.10);
    const poleL = new THREE.Vector3(chest.x + 0.62, chest.y - 0.68, chest.z - 0.10);
    solveArm(B.UpperArmR, B.LowerArmR, B.Middle1R, rightHand, poleR);
    solveArm(B.UpperArmL, B.LowerArmL, B.Middle1L, leftHand, poleL);
    this.armPose = {
      UpperArmR: B.UpperArmR.quaternion.clone(),
      LowerArmR: B.LowerArmR.quaternion.clone(),
      UpperArmL: B.UpperArmL.quaternion.clone(),
      LowerArmL: B.LowerArmL.quaternion.clone(),
    };
    // Close the hands. The shipped rig's fingers are splayed open like claws,
    // which is right for a corpse reaching for you and completely wrong for a
    // man holding a rifle — it was the single loudest remaining zombie tell.
    // Curling them costs nothing: the finger bones are already in the rig.
    for (const s of ['L', 'R']) {
      for (const digit of ['Index', 'Middle', 'Pinky']) {
        for (let j = 1; j <= 3; j++) {
          const bone = B[`${digit}${j}${s}`];
          if (bone) bone.rotateX(j === 1 ? 1.05 : 1.25);
        }
      }
      for (let j = 1; j <= 2; j++) {
        const bone = B[`Thumb${j}${s}`];
        if (bone) bone.rotateX(j === 1 ? 0.45 : 0.75);
      }
    }
    this.handPose = {};
    for (const name of FINGER_BONES) {
      if (B[name]) this.handPose[name] = B[name].quaternion.clone();
    }
  }

  _buildWeaponMount() {
    const fore = this.bones?.LowerArmR;
    const hand = this.bones?.Middle1R;
    if (!fore || !hand) return;
    const anchor = new THREE.Object3D();
    anchor.position.copy(hand.position);       // the hand joint, in forearm space
    fore.updateWorldMatrix(true, false);
    // The viewmodels are authored with the bore down -Z; the avatar faces +Z.
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    anchor.quaternion.copy(fore.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(want);
    fore.add(anchor);
    // A separate node carries aim pitch, so the weapon can lead the spine
    // without the spine correction having to fight it.
    const pitchNode = new THREE.Object3D();
    anchor.add(pitchNode);
    this.weaponAnchor = anchor;
    this.weaponPitch = pitchNode;
    this.weaponGroup = null;
    this.weaponId = null;
    this.weaponPap = null;
    this.muzzle = null;
  }

  /**
   * Show the weapon the player is actually carrying.
   *
   * Uses buildDisplayWeapon, which is the hands-free build — a viewmodel would
   * drag first-person gloves into the world and put a second pair of hands on
   * every teammate. Cached per id+PaP so swapping back and forth is free.
   */
  setWeapon(id, pap = false) {
    if (!this.weaponPitch) return;
    if (this.weaponId === id && this.weaponPap === !!pap) return;
    if (this.weaponGroup) this.weaponPitch.remove(this.weaponGroup);
    this.weaponId = id;
    this.weaponPap = !!pap;
    this.muzzle = null;
    this.weaponGroup = null;
    if (!id) return;
    this._weaponCache = this._weaponCache || new Map();
    const key = id + (pap ? '+' : '');
    let g = this._weaponCache.get(key);
    if (!g) {
      try { g = buildDisplayWeapon(id, !!pap); } catch (e) { g = null; }
      if (!g) return;
      // buildDisplayWeapon presents the gun broadside on a rack. Undo that:
      // held weapons want their own authored metres and their own axes.
      const view = g.userData.viewNode;
      if (view) { view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.scale.setScalar(1); }
      g = flattenWeapon(g);
      // Sit the grip in the fist. Authored viewmodels put the trigger group
      // near the origin, so the offset is small and the same for every class;
      // the long guns only need dropping a little to clear the forearm.
      // The anchor's +Z runs backwards in world (the weapon's bore is -Z and
      // the avatar faces +Z), so a positive `back` pulls the gun in toward the
      // body. Long guns need more of it than a pistol to keep the receiver in
      // the fist rather than out past the fingertips.
      const cls = g.userData.cls || 'rifle';
      const drop = cls === 'pistol' ? -0.005 : -0.02;
      const back = cls === 'pistol' ? 0.0 : 0.15;
      g.position.set(0, drop, back);
      this._weaponCache.set(key, g);
    }
    if (g.parent) g.parent.remove(g);
    this.weaponPitch.add(g);
    this.weaponGroup = g;
    this.muzzle = g.userData?.muzzle || null;
  }

  /** World position of the equipped weapon's muzzle, for remote fire effects. */
  muzzleWorld(out = new THREE.Vector3()) {
    if (this.muzzle) {
      this.muzzle.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.muzzle.matrixWorld);
    }
    if (this.weaponAnchor) {
      this.weaponAnchor.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.weaponAnchor.matrixWorld);
    }
    return out.set(0, 0, 0);
  }

  /** Aim pitch in radians, positive looking up. */
  setAim(pitch) { this.aimPitch = clamp(pitch || 0, -1.3, 1.3); }

  /** 0 stand, 1 crouch, 2 prone. Blended, not snapped, by the caller. */
  setCrouch(amount) { this.crouch = clamp(amount || 0, 0, 1); }

  /**
   * Distance LOD. A teammate across the courtyard does not need his puttees.
   */
  setLOD(distance) {
    const level = distance > 34 ? 2 : distance > 15 ? 1 : 0;
    if (level === this.lod) return;
    this.lod = level;
    setSoldierGearLOD(this.gear, level);
    if (this.weaponGroup) this.weaponGroup.visible = level < 2;
  }

  play(name, { loop = true, fade = 0.18, timeScale = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === name) { a.timeScale = timeScale; return; }
    const prev = this.current ? this.actions[this.current] : null;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    a.play();
    this.current = name;
    // The carry pose is a lie during a death, a crawl or a melee — those clips
    // need their arms. Everything else keeps the rifle up.
    this._armTarget = /Death|Crawl|HitReact|Punch|Wave|Jump/.test(name) ? 0 : 1;
  }

  /**
   * Re-apply every correction the animation overwrote.
   *
   * THE TRAP: it is not enough that every clip here keys every bone.
   * three's PropertyMixer only writes a bone when the value it just
   * accumulated differs from the value it wrote last time. Post-multiply an
   * offset onto a bone whose clip value happens to be momentarily still — the
   * chest during an idle, say — and the mixer sees "no change", skips the
   * write, and the offset lands on top of the previous frame's offset. Within
   * a couple of seconds the spine has rolled through 180 degrees.
   *
   * So the pure clip pose is snapshotted here and restored in update() before
   * the mixer next runs. That keeps the mixer's change detection honest while
   * still letting the clip drive every one of these bones.
   */
  _applyRig(dt, armWeight) {
    const B = this.bones;
    if (!B) return;
    const clip = this._clipQ || (this._clipQ = {});
    for (const name of POSED_BONES) {
      const b = B[name];
      if (!b) continue;
      (clip[name] || (clip[name] = new THREE.Quaternion())).copy(b.quaternion);
    }
    // The pelvis carries root motion, so its position is cached and restored
    // for exactly the same reason the rotations are.
    // Ankles are keyed by the locomotion clips, so their offsets are cached and
    // restored exactly like the rotations are.
    for (const s of ['L', 'R']) {
      const foot = B['Foot' + s];
      if (!foot) continue;
      (this._clipFootY ??= {})[s] = foot.position.y;
      foot.position.y -= FOOT_DROP;
    }
    // The knee offset is a constant set, so it cannot accumulate whether the
    // mixer writes it or not.
    if (this._restKneeY) {
      for (const s of ['L', 'R']) {
        const knee = B['LowerLeg' + s];
        if (knee) knee.position.y = this._restKneeY * LEG_STRETCH;
      }
    }
    if (B.Body) {
      (this._clipBodyY ??= { y: 0 }).y = B.Body.position.y;
      // Stand him up out of the corpse's permanent half-crouch. The legs are
      // then IK'd back down onto the clip's own footfalls below, so the feet
      // still land where the animator put them — they just do it on straighter
      // legs, which is most of the difference between a marine and a gnome.
      B.Body.position.y += HIP_LIFT;
    }
    if (B.Head) B.Head.scale.set(HEAD_SCALE * HEAD_SHAPE[0], HEAD_SCALE * HEAD_SHAPE[1], HEAD_SCALE * HEAD_SHAPE[2]);
    for (const name in LIMB_SHAPE) {
      const b = B[name];
      if (b) b.scale.set(LIMB_SHAPE[name][0], LIMB_SHAPE[name][1], LIMB_SHAPE[name][2]);
    }
    for (const name of FINGER_ROOTS) {
      const b = B[name];
      if (b) b.scale.setScalar(HAND_SCALE);
    }
    // The tongue is its own five-bone chain and it hangs out of the mouth. No
    // amount of reshaping the head geometry touches it, and a marine with his
    // tongue lolling is not a marine. Collapsing the root collapses the chain.
    if (B.Tongue1) B.Tongue1.scale.setScalar(0.001);
    for (const s of ['L', 'R']) {
      const foot = B['Foot' + s];
      if (foot) foot.scale.setScalar(FOOT_SCALE);
    }
    // Posture: undo the shamble.
    tiltX(B.Abdomen, SPINE_FIX.Abdomen);
    tiltX(B.Torso, SPINE_FIX.Torso);
    tiltX(B.Neck, SPINE_FIX.Neck);
    tiltX(B.Head, SPINE_FIX.Head);
    // Aim: a teammate shooting at the catwalk should visibly be looking up.
    // Split down the chain so the whole upper body leads the shot.
    const p = this.aimPitch;
    if (p) {
      tiltX(B.Abdomen, -p * 0.10);
      tiltX(B.Torso, -p * 0.32);
      tiltX(B.Neck, -p * 0.30);
      tiltX(B.Head, -p * 0.28);
    }
    // Crouch: bend at the hip and knee rather than squashing the model, which
    // is what the old scale.y trick did and why crouching teammates looked
    // like they were being stood on.
    const c = this.crouch;
    if (c > 0.01) {
      tiltX(B.Hips, c * 0.30);
      tiltX(B.Torso, -c * 0.16);
      for (const s of ['L', 'R']) {
        tiltX(B['UpperLeg' + s], c * 0.55);
        tiltX(B['LowerLeg' + s], -c * 0.95);
      }
    }
    // Rifle carry, blended so a dying man drops his arms.
    if (this.armPose && armWeight > 0.001) {
      for (const name in this.armPose) {
        const bone = B[name];
        if (bone) bone.quaternion.slerp(this.armPose[name], armWeight);
      }
    }
    // Fists stay closed a little longer than the arms do — a hand only opens
    // when he is genuinely letting go.
    if (this.handPose) {
      const w = Math.max(armWeight, 0.55);
      for (const name in this.handPose) {
        const bone = B[name];
        if (bone) bone.quaternion.slerp(this.handPose[name], w);
      }
    }
    // Legs last: the hips have moved, so re-solve knee and ankle to put the
    // feet back exactly where the clip's own foot bones are. Skipped while
    // crawling or dead, where the clip owns the whole body.
    if (this.legLengths && armWeight > 0.5) {
      this.inner.updateMatrixWorld(true);
      for (const s of ['L', 'R']) {
        const upper = B['UpperLeg' + s], lower = B['LowerLeg' + s], foot = B['Foot' + s];
        if (!upper || !lower || !foot) continue;
        foot.updateWorldMatrix(true, false);
        _footTarget.setFromMatrixPosition(foot.matrixWorld);
        upper.updateWorldMatrix(true, false);
        // Knees point forward, always. Without a pole the solver is free to
        // fold the leg sideways and occasionally does.
        _kneePole.setFromMatrixPosition(upper.matrixWorld);
        _kneePole.z += 2.0;
        _kneePole.y -= 0.6;
        solveArm(upper, lower, null, _footTarget, _kneePole, this.legLengths);
      }
    }
    // The weapon leads the rest of the aim the spine did not take.
    if (this.weaponPitch) this.weaponPitch.rotation.x = this.aimPitch * 0.30 * armWeight;
  }

  update(dt) {
    // Hand the skeleton back exactly as the clip left it, then animate, then
    // re-pose. See _applyRig for why the restore is not optional.
    const clip = this._clipQ;
    if (clip) {
      for (const name in clip) {
        const b = this.bones[name];
        if (b) b.quaternion.copy(clip[name]);
      }
    }
    if (this._clipBodyY && this.bones.Body) this.bones.Body.position.y = this._clipBodyY.y;
    if (this._clipFootY) {
      for (const s of ['L', 'R']) {
        const foot = this.bones['Foot' + s];
        if (foot) foot.position.y = this._clipFootY[s];
      }
    }
    this.mixer.update(dt);
    this.armWeight = damp(this.armWeight, this._armTarget, 9, dt || 0.016);
    this._applyRig(dt, this.armWeight);
  }

  dispose() {
    detachSoldierGear(this.gear);
    this.gear = null;
    if (this.weaponGroup) this.weaponPitch?.remove(this.weaponGroup);
    for (const g of this._weaponCache?.values() || []) {
      g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); } });
    }
    this._weaponCache = null;
    this.weaponGroup = null;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.inner);
  }
}

export class RemotePlayer {
  constructor(scene, info) {
    this.id = info.id;
    this.name = info.name;
    this.colorIdx = info.c || 0;
    this.personaIdx = (info.persona >= 0 ? info.persona : this.colorIdx);
    const g = new THREE.Group();
    this.visual = null;
    try {
      if (assets.models.zombie1) {
        this.visual = new SoldierVisual(this.personaIdx);
        if (this.visual.ok) g.add(this.visual.group);
        else this.visual = null;
      }
    } catch (e) { this.visual = null; }
    if (!this.visual) {
      // fallback: minimal capsule figure
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.1, 0.26), mat); torso.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: 0xc9a486 })); head.position.y = 1.62;
      g.add(torso, head);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
    // name tag (small, subtle)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(info.name, { w: 256, h: 64, bg: 'rgba(0,0,0,0)', fg: CFG.COLORS[this.colorIdx % 4], font: 'bold 34px Arial' }), transparent: true, depthTest: false, opacity: 0.85 }));
    tag.scale.set(1.15, 0.29, 1);
    tag.position.y = 2.1;
    g.add(tag);
    this.group = g;
    this.x = info.x || 0; this.z = info.z || 0; this.y = 0; this.yaw = 0; this.pitch = 0;
    this.prev = null; this.next = null;
    this.down = false; this.dead = false;
    this.anim = 0; this.speed = 0;
    this.hp = 100; this.points = 500; this.kills = 0; this.downs = 0; this.revives = 0;
    this.perks = []; this.weaponId = 'm1911'; this.weaponPap = false; this.bowie = false;
    // On the host this is the authoritative remote loadout. Unreliable player
    // snapshots may choose movement/cosmetics, but never add weapons or PaP.
    this.ownedWeapons = new Map([['m1911', false]]);
    this.bleed = 0; this.crouch = 0; this.sprint = 0;
    this.perkDrink = null;
    scene.add(g);
  }

  startPerkDrink(perkId) {
    if (this.perkDrink) return false;
    const bottle = buildPerkBottle(perkId);
    // Raise-start pose before the first render: an unposed bottle sits at the
    // actor's origin, so it pops from between their boots on frame one.
    bottle.position.set(0.34, 0.7, -0.1);
    bottle.rotation.set(0, 0, -0.25);
    this.group.add(bottle);
    this.perkDrink = { id: perkId, bottle, elapsed: 0, broke: false, belched: false };
    audio.play('drink', { pos: { x: this.x, y: this.y + 1.5, z: this.z } });
    return true;
  }

  setAuthoritativeLoadout(loadout) {
    const entries = Array.isArray(loadout) ? loadout.slice(0, 2) : [];
    this.ownedWeapons = new Map(entries
      .filter((weapon) => weapon && typeof weapon.id === 'string')
      .map((weapon) => [weapon.id, !!weapon.pap]));
    if (!this.ownedWeapons.size) this.ownedWeapons.set('m1911', false);
    const first = this.ownedWeapons.entries().next().value;
    this.weaponId = first[0];
    this.weaponPap = first[1];
  }

  authorizeWeapon(id, pap = false, replaceCurrent = true) {
    if (typeof id !== 'string') return false;
    if (!this.ownedWeapons.has(id) && this.ownedWeapons.size >= 2 && replaceCurrent) {
      this.ownedWeapons.delete(this.weaponId);
    }
    this.ownedWeapons.set(id, !!pap);
    this.weaponId = id;
    this.weaponPap = !!pap;
    return true;
  }

  equipAuthorizedWeapon(id) {
    if (!this.ownedWeapons.has(id)) return false;
    this.weaponId = id;
    this.weaponPap = !!this.ownedWeapons.get(id);
    return true;
  }

  updatePerkDrink(dt) {
    const drink = this.perkDrink;
    if (!drink) return;
    drink.elapsed += dt;
    const t = drink.elapsed, b = drink.bottle, phase = perkDrinkPhase(t);
    const ease = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
    if (phase === 'raise') {
      const q = ease(t / PERK_DRINK_TIMELINE.raiseEnd);
      b.position.set(lerp(0.34, 0.12, q), lerp(0.7, 1.56, q), lerp(-0.1, 0.04, q));
      b.rotation.set(lerp(0, 1.15, q), 0, lerp(-0.25, 0.1, q));
    } else if (phase === 'drink') {
      const q = (t - PERK_DRINK_TIMELINE.raiseEnd) / (PERK_DRINK_TIMELINE.gulpEnd - PERK_DRINK_TIMELINE.raiseEnd);
      b.position.set(0.12, 1.56 + Math.sin(q * 14) * 0.015, 0.04);
      b.rotation.set(1.15 + Math.sin(q * Math.PI) * 0.18, 0, 0.1);
    } else if (phase === 'lower') {
      const q = ease((t - PERK_DRINK_TIMELINE.gulpEnd) / (PERK_DRINK_TIMELINE.throwAt - PERK_DRINK_TIMELINE.gulpEnd));
      b.position.set(lerp(0.12, 0.45, q), lerp(1.56, 1.05, q), lerp(0.04, 0.24, q));
      b.rotation.set(lerp(1.15, 0, q), 0, lerp(0.1, -0.4, q));
    } else if (phase === 'throw') {
      const q = (t - PERK_DRINK_TIMELINE.throwAt) / (PERK_DRINK_TIMELINE.breakAt - PERK_DRINK_TIMELINE.throwAt);
      b.position.set(0.45 + q * 0.8, 1.05 + q * 0.35 - q * q * 1.25, 0.24 + q * 0.65);
      b.rotation.set(q * 8, q * 5, -0.4 - q * 4);
    } else b.visible = false;
    if (!drink.broke && t >= PERK_DRINK_TIMELINE.breakAt) {
      drink.broke = true;
      const pos = b.getWorldPosition(new THREE.Vector3());
      audio.play('bottle_break', { pos });
    }
    if (!drink.belched && t >= PERK_DRINK_TIMELINE.belchAt) {
      drink.belched = true;
      audio.play('belch', { pos: { x: this.x, y: this.y + 1.55, z: this.z } });
    }
    if (t >= PERK_DRINK_TIMELINE.duration) {
      this.group.remove(b);
      this.perkDrink = null;
    }
  }

  applyState(s, now) {
    if (!this.next) {
      this.prev = { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, t: now };
      this.next = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, t: now + (window.__snapInterval || 66) / 1000 };
    } else {
      const prev = this.prev;
      prev.x = this.next.x; prev.y = this.next.y; prev.z = this.next.z;
      prev.yaw = this.next.yaw; prev.pitch = this.next.pitch; prev.t = this.next.t;
      this.next.x = s.x; this.next.y = s.y; this.next.z = s.z;
      this.next.yaw = s.yaw; this.next.pitch = s.pitch;
      this.next.t = now + (window.__snapInterval || 66) / 1000;
    }
    this.down = !!s.down; this.dead = !!s.dead;
    this.hp = s.hp; this.points = s.points; this.kills = s.kills; this.downs = s.downs; this.revives = s.revives;
    this.perks = s.perks || []; this.weaponId = s.w; this.weaponPap = !!s.pap; this.bleed = s.bleed;
    this.crouch = s.crouch; this.sprint = s.sprint;
    this.name = s.name; this.colorIdx = s.c;
  }

  interpolate(now, dt, camera) {
    const step = dt || 0.016;
    if (this.prev && this.next) {
      const span = Math.max(1e-3, this.next.t - this.prev.t);
      const t = clamp((now - this.prev.t) / span, 0, 1);
      this.x = lerp(this.prev.x, this.next.x, t);
      this.y = lerp(this.prev.y, this.next.y, t);
      this.z = lerp(this.prev.z, this.next.z, t);
      let dy = this.next.yaw - this.prev.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw = this.prev.yaw + dy * t;
      this.pitch = lerp(this.prev.pitch, this.next.pitch, t);
      const moved = Math.hypot(this.next.x - this.prev.x, this.next.z - this.prev.z);
      this.speed = lerp(this.speed, clamp(moved / Math.max(1e-3, span), 0, 8), 0.3);
      if (moved > 0.002) this.anim += step * (this.sprint ? 10 : 6);
    }
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.y = this.yaw + Math.PI; // model faces +z; forward is -z at yaw 0
    this.updatePerkDrink(step);
    const stance = this.crouch | 0;
    if (!this.visual) {
      if (this.down || this.dead) {
        g.rotation.x = 0;
        g.position.y = this.y - 0.9;
        g.rotation.z = 1.4;
      } else {
        g.rotation.z = 0;
        g.position.y = this.y - (this.crouch ? 0.5 : 0);
      }
      return;
    }

    const v = this.visual;
    // Show what he is actually carrying. `w`/`pap` come straight off the wire,
    // so host and guest resolve the same weapon from the same field.
    v.setWeapon(this.weaponId, this.weaponPap);
    // Aim and stance are transmitted and were previously thrown away. Damped,
    // never snapped, because snapshots land at 15 Hz and the eye reads a jump
    // in a head or a barrel instantly.
    this._aim = damp(this._aim ?? 0, this.down || this.dead ? 0 : this.pitch, 12, step);
    this._crouchBlend = damp(this._crouchBlend ?? 0, this.down || this.dead ? 0 : (stance >= 1 ? 1 : 0), 8, step);
    v.setAim(this._aim);
    v.setCrouch(this._crouchBlend);
    if (camera) {
      v.setLOD(Math.hypot(camera.position.x - this.x, camera.position.y - this.y, camera.position.z - this.z));
    }

    if (this.dead) {
      v.play('Death', { loop: false, fade: 0.12 });
    } else if (this.down) {
      v.play('Crawl', { timeScale: 0.45 });
    } else if (stance === 2) {
      v.play('Crawl', { timeScale: clamp(this.speed / 1.2, 0.4, 1.4) });
    } else if (this.sprint && this.speed > 3.2) {
      // Sprinting drops the rifle out of the shoulder and swings the arms —
      // Run_Arms is the clip with the arm swing, and the carry pose stands
      // aside for it (see SoldierVisual.play).
      v.play('Run_Arms', { timeScale: clamp(this.speed / 6.4, 0.85, 1.45) });
    } else if (this.speed > 4.2) {
      v.play('Run', { timeScale: clamp(this.speed / 5.5, 0.9, 1.4) });
    } else if (this.speed > 0.4) {
      v.play('Walk', { timeScale: clamp(this.speed / 1.6, 0.7, 2) });
    } else {
      v.play('Idle', { timeScale: 1 });
    }
    v.update(step);
    // A crouched man is lower, but he is lower because his knees are bent —
    // the bend is in the pose, so only the residual hip drop belongs here.
    g.position.y = this.y - this._crouchBlend * 0.16;
  }

  /** World position of this player's weapon muzzle, or null if he has no rig. */
  muzzleWorld(out) {
    if (!this.visual?.ok) return null;
    this.group.updateMatrixWorld(true);
    return this.visual.muzzleWorld(out);
  }

  dispose(scene) {
    if (this.perkDrink?.bottle) this.group.remove(this.perkDrink.bottle);
    this.perkDrink = null;
    this.visual?.dispose?.();
    this.visual = null;
    scene.remove(this.group);
  }
}
