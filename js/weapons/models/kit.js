// Small helpers shared by the view-model builders in this folder.
import { WM, matSet } from '../../render/WeaponMaterials.js';
import {
  mesh, plateGeo, redDot, rearNotch as rearNotchSight, rearAperture as rearApertureSight,
} from '../../render/WeaponParts.js';
import { triggerHand } from '../../render/WeaponHands.js';

/** Side-profile plate in the ZY plane. Points are [z, y]; thickness runs on X. */
export function profileZY(id, pts, thick, mat, x = 0, y = 0, z = 0, bevel = 0.0035) {
  const m = mesh(plateGeo(id, pts, thick, bevel), mat, x, y, z);
  m.rotation.y = -Math.PI / 2;
  return m;
}

/** Place an already-built sub-assembly. */
export function at(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
}

/** Trigger hand on a pistol grip. Kept call-compatible with the old helper. */
export function hand(x, y, z, rx = 0, rz = 0, opts) {
  return triggerHand(x, y, z, rx, { roll: rz, ...opts });
}

export function redDotSight(y = 0.075, z = -0.1, mats = null) {
  const T = mats || matSet(false);
  return redDot(T.dark, WM.glass, WM.lens, WM.dot, { aimY: y, z, r: 0.019 });
}

export function rearNotch(y, z, mat, w = 0.032, mount = null) {
  return rearNotchSight(mat, { aimY: y, z, w, mount });
}
export function rearAperture(y, z, mat) {
  return rearApertureSight(mat, { aimY: y, z });
}
