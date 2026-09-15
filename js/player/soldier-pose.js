// SoldierVisual's pose layer: the corpse rig stood up into a soldier, the
// rifle-carry arms solved once at build time, and the corrections put back
// over the clip every frame.
// Methods of SoldierVisual: js/player/soldier.js copies them onto SoldierVisual.prototype.
import * as THREE from 'three';
import { clamp } from '../utils.js';
import { HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX } from '../render/SoldierGear.js';

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

export class SoldierVisualPose {
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
}
