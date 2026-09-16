// Primitive helpers — everything in metres, everything merged before it ships.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/utils/BufferGeometryUtils.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Position/rotate/scale a geometry in place and hand it back. */
export function put(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _m4.compose(
    new THREE.Vector3(x, y, z),
    _q.setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geo.applyMatrix4(_m4);
  return geo;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** A garment tube. `flat` squashes the cross-section front-to-back — human
 *  torsos and legs are ovals, and a true circle reads as a barrel. */
export function tube(rTop, rBot, h, { segs = 12, flat = 1, open = true, thetaStart = 0, thetaLength = Math.PI * 2 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, open, thetaStart, thetaLength);
  if (flat !== 1) g.scale(1, 1, flat);
  return g;
}

/** A dome: helmets, crowns, shoulders. `phi` under PI leaves it open below. */
export const dome = (r, phi = Math.PI * 0.55, segs = 14) =>
  new THREE.SphereGeometry(r, segs, Math.max(4, Math.round(segs * 0.5)), 0, Math.PI * 2, 0, phi);

/**
 * A shell spanning two WORLD points — the workhorse for sleeves, trouser legs
 * and puttees. Because each mount cancels its bone's rest rotation, "world"
 * here means the frame the geometry is authored in, so a limb shell can be
 * described by the two joints it covers and will always land on the limb.
 */
export function span(from, to, rFrom, rTo, { t0 = 0, t1 = 1, flat = 1, segs = 10 } = {}) {
  const dir = _v.copy(to).sub(from);
  const len = dir.length() || 1e-4;
  dir.multiplyScalar(1 / len);
  const h = len * (t1 - t0);
  const g = tube(rTo, rFrom, h, { segs, flat, open: false });
  // Cylinders are built along +Y; rotate that onto the joint-to-joint axis.
  const quat = new THREE.Quaternion().setFromUnitVectors(_up, dir);
  const mid = new THREE.Vector3().copy(from).addScaledVector(dir, len * (t0 + t1) * 0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** A strap between two world points: thin, flat, and actually touching both. */
export function strap(from, to, width, thick) {
  const dir = new THREE.Vector3().copy(to).sub(from);
  const len = dir.length() || 1e-4;
  dir.multiplyScalar(1 / len);
  const g = box(width, len, thick);
  const quat = new THREE.Quaternion().setFromUnitVectors(_up, dir);
  const mid = new THREE.Vector3().copy(from).add(to).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1)));
  return g;
}

/**
 * Merge a list of `[materialKey, geometry]` into ONE geometry with one material
 * group per key, so a jacket with webbing, buttons and a pack still costs a
 * single draw call rather than four.
 */
export function mergeByMaterial(parts) {
  const byKey = new Map();
  for (const [key, geo] of parts) {
    if (!geo) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(geo);
  }
  if (!byKey.size) return null;
  const keys = [...byKey.keys()];
  const merged = [];
  for (const key of keys) {
    const list = byKey.get(key);
    const one = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (list.length > 1) for (const g of list) g.dispose();
    if (!one) return null;
    merged.push(one);
  }
  if (merged.length === 1) return { geo: merged[0], mats: keys };
  const out = mergeGeometries(merged, true);
  for (const g of merged) g.dispose();
  return out ? { geo: out, mats: keys } : null;
}
