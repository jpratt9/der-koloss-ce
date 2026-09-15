// The hellhound's geometry kit: the spikes, ribbons and placement every part
// is built from, and the merge that makes one mesh per bone.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/utils/BufferGeometryUtils.js';
import { SLOTS } from './materials.js';

// ---------------------------------------------------------------------------
// primitive builders
// ---------------------------------------------------------------------------

/**
 * A tapered cone-ish spike along +Y, origin at its base.
 * Used for every fur tuft, hackle, ear and fang in the model.
 */
function spike(len, r0, r1 = 0, sides = 4) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, r1 <= 0.0001);
  g.translate(0, len / 2, 0);
  return g;
}

/**
 * A ribbon that follows a list of points — the shape a crack in a burnt hide
 * actually has. Tapers to nothing at both ends so it never reads as a decal
 * with hard corners.
 */
function ribbon(points, width, up = new THREE.Vector3(0, 1, 0), normals = null) {
  const n = points.length;
  if (n < 2) return null;
  const pos = [], idx = [];
  const dir = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    dir.copy(b).sub(a).normalize();
    // Widening across the SURFACE normal is what keeps a crack lying in the
    // hide. Widening across world up leaves it standing off the body as a
    // blade whenever the body curves away, which is exactly how the first
    // pass grew 30 cm orange shards off the shoulder.
    side.copy(dir).cross(normals ? normals[i] : up);
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1); else side.normalize();
    if (!Number.isFinite(side.x)) side.set(0, 0, 1);
    const t = i / (n - 1);
    const w = width * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) ** 0.55;
    pos.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
    pos.push(p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  geo.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  ));
  return geo;
}

/**
 * Merge a {slot: [geometry, ...]} bag into ONE geometry with one material
 * group per slot, plus the matching material list. This is where the draw-call
 * saving comes from: everything riding a bone becomes a single object.
 */
function pack(bag) {
  const keys = SLOTS.filter((k) => bag[k]?.length);
  if (!keys.length) return null;
  const per = keys.map((k) => {
    // Position and normal only. The creature shader samples its detail
    // triplanarly in world space, so nothing here needs UVs — and mixing
    // UV'd primitives with hand-built geometry is what makes a merge fail.
    for (const g of bag[k]) {
      g.deleteAttribute('uv');
      g.deleteAttribute('uv1');
      g.deleteAttribute('uv2');
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.index) {
        const n = g.attributes.position.count;
        g.setIndex(Array.from({ length: n }, (_, i) => i));
      }
    }
    const merged = mergeGeometries(bag[k], false);
    for (const g of bag[k]) g.dispose();
    return merged;
  }).filter(Boolean);
  if (!per.length) return null;
  if (per.length === 1) return { geo: per[0], slots: [keys[0]] };
  const merged = mergeGeometries(per, true);
  for (const g of per) g.dispose();
  return merged ? { geo: merged, slots: keys } : null;
}

export { spike, ribbon, placed, pack };
