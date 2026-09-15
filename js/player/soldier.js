// A co-op soldier's body: the shipped zombie rig, calibrated to 1.78 m,
// re-skinned and dressed. Its pose layer and held weapon are in
// soldier-pose.js and soldier-weapon.js.
import * as THREE from 'three';
import { clamp, damp, installMixins } from '../utils.js';
import { clone as skClone } from '../../vendor/SkeletonUtils.js';
import { assets } from '../assets.js';
import { measureStandingBounds, measureNeutralBounds } from '../zombies.js';
import { humaniseSoldierFace } from '../render/SoldierFace.js';
import { attachSoldierGear, detachSoldierGear, setSoldierGearLOD, SOLDIER_LOOKS } from '../render/SoldierGear.js';
import { soldierAtlas } from './atlas.js';
import { SoldierVisualPose } from './soldier-pose.js';
import { SoldierVisualWeapon } from './soldier-weapon.js';

// How tall a marine stands, measured on the skinned body with the head brought
// down to human proportion. Headgear is allowed above this.
const SOLDIER_HEIGHT = 1.78;
// Human band for the calibration post-condition below. Deliberately tighter
// than the zombies' [1.60, 2.00]: every marine is authored to one height, so
// any spread at all is a bug rather than variation.
const SOLDIER_MIN_H = 1.70;
const SOLDIER_MAX_H = 1.86;

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

// SoldierVisual's pose layer and its held weapon are in js/player/soldier-*.js.
// Each file is a class whose methods are copied onto SoldierVisual.prototype
// here, as ZombieManager's are; a name defined twice fails at load.
installMixins(SoldierVisual, [SoldierVisualPose, SoldierVisualWeapon]);
