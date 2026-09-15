// The skinned-bounds ruler: the extent of a posed rig, measured with every
// transform between its skeleton and the ruler neutralised. The zombie and
// soldier rigs both calibrate their height against it.
import * as THREE from 'three';

// Scratch for the bounds sampler. Reused, not allocated per call: this runs
// once per zombie on a spawn frame, and spawn frames are already the spikiest
// ones in a wave.
const _boundsBox = new THREE.Box3();
const _boundsVec = new THREE.Vector3();
const _neutralPos = new THREE.Vector3();
const _neutralScale = new THREE.Vector3();
const _neutralGPos = new THREE.Vector3();
const _neutralGScale = new THREE.Vector3();
const _neutralGQuat = new THREE.Quaternion();

/**
 * Bounds of the skin AS CURRENTLY POSED, measured with every transform between
 * the skeleton and the ruler set to identity: `inner`'s own offset and scale,
 * and the whole `group` placement.
 *
 * This neutralisation IS the fix. The shipped sampler measured in world space
 * and only zeroed the group's position and YAW. `animate()` pitches a rising
 * corpse's group up to 0.95rad forward (`m.rotation.x = 0.95 * lean`) and rolls
 * it, on the very frame calibration runs — and because `getVertexPosition`
 * skins through `bone.matrixWorld`, which already carries that pitch, the extra
 * `applyMatrix4(o.matrixWorld)` applied it a SECOND time. A body folded ~1.9rad
 * measured 0.70m instead of 1.23m, so `targetH / h` came out roughly double and
 * the corpse was permanently 2.4-2.9m tall. Only ground risers were pitched —
 * about 6% of a wave — which is exactly why it read as "some zombies are huge"
 * rather than "all zombies are huge".
 *
 * Measuring at unit scale also makes the result a pure property of the posed
 * skeleton, so it means the same thing before and after a scale is applied.
 *
 * Returns a SHARED Box3 — read what you need before calling again.
 */
// Exported so the soldier avatars can post-condition their own calibration
// against the same ruler the zombies use, rather than keeping a third copy of
// a skinned-bounds sweep. See _measureBody() in js/player.js.
export function measureNeutralBounds(inner, group) {
  _neutralPos.copy(inner.position);
  _neutralScale.copy(inner.scale);
  inner.position.set(0, 0, 0);
  inner.scale.setScalar(1);
  if (group) {
    _neutralGPos.copy(group.position);
    _neutralGScale.copy(group.scale);
    _neutralGQuat.copy(group.quaternion);
    group.position.set(0, 0, 0);
    group.scale.setScalar(1);
    group.quaternion.identity();      // quaternion, so rotation.order cannot matter
  }
  (group || inner).updateWorldMatrix(true, true);

  const bb = _boundsBox.makeEmpty();
  const v = _boundsVec;
  let found = false;
  inner.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton?.update(); // renderer hasn't run yet — fill boneMatrices ourselves
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 500));
    for (let i = 0; i < pos.count; i += step) {
      o.getVertexPosition(i, v);      // skinned
      v.applyMatrix4(o.matrixWorld);  // -> the (now identity) rig frame
      bb.expandByPoint(v);
    }
    found = true;
  });

  inner.position.copy(_neutralPos);
  inner.scale.copy(_neutralScale);
  if (group) {
    group.position.copy(_neutralGPos);
    group.scale.copy(_neutralGScale);
    group.quaternion.copy(_neutralGQuat);
  }
  (group || inner).updateWorldMatrix(true, true);
  return found && !bb.isEmpty() ? bb : null;
}

// Force a neutral standing pose on a cloned rig and measure accurate skinned
// bounds. Shared by ZombieVisual and SoldierVisual — never call this while an
// animation you care about is playing (it stops all actions).
export function measureStandingBounds(inner, mixer, idleAction) {
  if (!idleAction) return null;
  mixer.stopAllAction();
  idleAction.reset();
  idleAction.setLoop(THREE.LoopOnce, 1);
  idleAction.clampWhenFinished = true;
  idleAction.play();
  idleAction.time = 0.35;
  mixer.update(0);
  const bb = measureNeutralBounds(inner, inner.parent);
  mixer.stopAllAction();
  if (!bb) return null;
  return { h: bb.max.y - bb.min.y, minY: bb.min.y, maxY: bb.max.y };
}
