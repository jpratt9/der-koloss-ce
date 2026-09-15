// Weapons shown in the world rather than in hand: the mystery box and
// Pack-a-Punch display models, and the Pack-a-Punch prize's living finish.
import * as THREE from 'three';
import { buildViewmodel } from './viewmodel.js';
import { applyPapLivingFinish, advancePapLivingFinish } from './finishes.js';

// ---------------------------------------------------------------------------
// World display presentation
//
// buildViewmodel() returns the FIRST-PERSON authoring frame and nothing else:
// origin at the camera-relative grip, no display transform. What it does NOT
// return is the gloves — those are built into a detached container that only
// WeaponRig.equip() re-attaches, so anything that puts a weapon in the world
// (the mystery box, Pack-a-Punch, the cinematic) gets the weapon ALONE without
// having to hunt hand meshes out of the tree.
//
// presentForDisplay() is the shared "make it hero-shot" step: pivot on the
// weapon's own centre so a spin does not swing it through the prop it is
// floating over, normalise the longest axis so a Colt and a Panzerschreck read
// at the same size, and sit it at a three-quarter angle.
const _dispBox = new THREE.Box3();
const _dispV = new THREE.Vector3();
const DISPLAY_LEN = 0.95;       // metres, tuned to the mystery-box crate width
// The PaP prize hangs in open air right off the machine face rather than inside
// a crate, so the crate-width figure read as an oversized prop bolted to the
// cabinet. This is a hair under the 0.66m aperture width: the reward still
// reads as the hero of the shot without dwarfing the mouth it came out of.
const PAP_DISPLAY_LEN = 0.62;

/**
 * @param inner  the node holding the weapon meshes
 * @param len    world length the longest axis is normalised to
 * @param yaw/pitch/roll  presentation angle, applied about the weapon's centre
 */
function presentForDisplay(inner, { len = DISPLAY_LEN, yaw = Math.PI / 2, pitch = 0.10, roll = 0.06 } = {}) {
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.scale.setScalar(1);
  _dispBox.setFromObject(inner);
  if (!isFinite(_dispBox.min.x) || _dispBox.isEmpty()) return;
  _dispBox.getSize(_dispV);
  const longest = Math.max(_dispV.x, _dispV.y, _dispV.z, 1e-3);
  inner.scale.setScalar(len / longest);
  // YXZ: the hero tilt is about the weapon's OWN lateral axis, applied before
  // the presentation yaw. With the default XYZ order the pitch happens in world
  // space after the yaw and shows up as an apparent roll.
  inner.rotation.order = 'YXZ';
  inner.rotation.set(pitch, yaw, roll);
  // Pivot on the weapon's own centre, so `rotation.y += dt` orbits nothing.
  _dispBox.setFromObject(inner);
  _dispBox.getCenter(_dispV);
  inner.position.set(-_dispV.x, -_dispV.y, -_dispV.z);
}

/**
 * A weapon built for DISPLAY IN THE WORLD — mystery box, Pack-a-Punch output,
 * any pedestal. No hands, no sleeve; normalised to `len` metres on its longest
 * axis and pivoting about its own centre, so the caller only has to place it
 * and spin it. Presented broadside with a slight display-rack tilt, which is
 * the readable angle from a standing player's eye line.
 */
export function buildDisplayWeapon(id, pap = false, len = DISPLAY_LEN) {
  const group = buildViewmodel(id, pap);
  group.userData.handsGroup = null;
  presentForDisplay(group.userData.viewNode, { len });
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return group;
}

// A real upgraded weapon model for the PaP output aperture. This deliberately
// uses the same builder and living finish as the first-person weapon; only the
// viewmodel hands are hidden for the world presentation.
export function buildPapDisplayWeapon(id) {
  const group = buildViewmodel(id, true);
  // buildViewmodel() keeps the gloves out of the returned tree; drop the
  // detached container so nothing can re-attach them to a world prop, then run
  // the same hero presentation the mystery box uses. Unlike the box, this one
  // is placed at unit scale by game.js: PAP_DISPLAY_LEN is the final world
  // length, so there is no builder/placement scale factor to keep in sync.
  group.userData.handsGroup = null;
  presentForDisplay(group.userData.viewNode, { len: PAP_DISPLAY_LEN, yaw: 0, pitch: 0.06, roll: 0 });
  const parts = group.userData.parts || {};
  if (parts.hand_l) parts.hand_l.visible = false;
  if (parts.hand_r) parts.hand_r.visible = false;
  group.userData.papDisplayCamo = applyPapLivingFinish(group, id, 0, true);
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return group;
}

export function updatePapDisplayWeapon(group, dt) {
  const camo = group?.userData?.papDisplayCamo;
  if (camo) advancePapLivingFinish(camo, dt);
}

export function disposePapDisplayWeapon(group) {
  if (!group) return;
  group.removeFromParent();
  group.userData?.papDisplayCamo?.ownedTexture?.dispose();
  // Geometries from the shared WeaponParts cache and materials from the shared
  // WeaponMaterials library are used by every other weapon in the game; only
  // the per-display clones this builder actually owns may be released.
  const free = (m) => { if (m && !m.userData?.wmShared) m.dispose(); };
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry?.userData?.wpShared) o.geometry?.dispose();
    if (Array.isArray(o.material)) for (const m of o.material) free(m);
    else free(o.material);
  });
}
