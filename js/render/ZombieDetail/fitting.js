// fitting to the corpse
//
// All of this used to be placed from bone positions and authored radii, and
// the two models are nothing alike under the skin. Rendered alone (see
// docs/model-audit) every piece was wrong: the tunic a tube buried inside the
// Basic's chest and a sail off the Chubby's back, the coat skirt swallowed by
// the models' own shorts — floating over a crawler's back as a ring, because
// the Hips bone sits a hand's width behind the pelvis it drives — and the
// sleeve tatters and skull damage inside the arms and head. So the skin is
// measured, once per model, in the rest pose the rig is attached in, and every
// piece is fitted to that surface.
import * as THREE from 'three';

export const X_AXIS = new THREE.Vector3(1, 0, 0);
export const Y_AXIS = new THREE.Vector3(0, 1, 0);

// The body part a skin triangle belongs to, by the bone that mostly drives it.
const REGION_OF = {
  Torso: 'trunk', Abdomen: 'trunk', ShoulderL: 'trunk', ShoulderR: 'trunk', Neck: 'trunk',
  Hips: 'pelvis', UpperLegL: 'pelvis', UpperLegR: 'pelvis',
  UpperArmL: 'armL', UpperArmR: 'armR', Head: 'head',
};

/**
 * The rig's skin in its rest pose: world-space triangles per body part, and the
 * heights the garments hang between (the top of the belt, the top of the
 * shoulders, the bottom of the shorts).
 */
export function measureSkin(visual) {
  const tris = { trunk: [], pelvis: [], armL: [], armR: [], head: [] };
  let beltTop = -Infinity, trunkTop = -Infinity, legBottom = Infinity;
  const v = new THREE.Vector3();
  visual.inner.updateMatrixWorld(true);
  visual.inner.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = o.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) return;
    o.skeleton.update();
    const world = new Float64Array(position.count * 3);
    const owner = new Array(position.count);
    for (let i = 0; i < position.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z;
      let joint = skinIndex.getComponent(i, 0), weight = skinWeight.getComponent(i, 0);
      for (let k = 1; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > weight) { weight = w; joint = skinIndex.getComponent(i, k); }
      }
      const name = owner[i] = o.skeleton.bones[joint]?.name;
      if (name === 'Hips') beltTop = Math.max(beltTop, v.y);
      else if (REGION_OF[name] === 'trunk') trunkTop = Math.max(trunkTop, v.y);
      else if (name === 'UpperLegL' || name === 'UpperLegR') legBottom = Math.min(legBottom, v.y);
    }
    const idx = o.geometry.index;
    const count = idx ? idx.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
      // Two votes of three: a triangle on a seam goes with the side it mostly is.
      const ra = REGION_OF[owner[a]], rb = REGION_OF[owner[b]], rc = REGION_OF[owner[c]];
      const region = ra && (ra === rb || ra === rc) ? ra : rb && rb === rc ? rb : null;
      if (!region) continue;
      tris[region].push(world[a * 3], world[a * 3 + 1], world[a * 3 + 2],
        world[b * 3], world[b * 3 + 1], world[b * 3 + 2], world[c * 3], world[c * 3 + 1], world[c * 3 + 2]);
    }
  });
  return { tris, beltTop, trunkTop, legBottom };
}

/** Distance along a ray to the farthest triangle of `tris` it crosses, or -1. */
export function farthestHit(tris, o, d) {
  let far = -1;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az;
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az;
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const sx = o.x - ax, sy = o.y - ay, sz = o.z - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (w < 0 || u + w > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > far) far = t;
  }
  return far;
}

/** Horizontal centre of a set of triangles. */
export function centreOf(tris) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]);
    z0 = Math.min(z0, tris[i + 2]); z1 = Math.max(z1, tris[i + 2]);
  }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/**
 * The outline of a body part round a vertical axis: at each of `rows` heights
 * and `cols` bearings, how far out its skin reaches. A bearing that finds no
 * skin was looking out through a gap — between the legs, or where an arm
 * leaves the chest — and is closed at that height's mean, the way cloth
 * bridges it.
 */
export function bodyProfile(tris, cx, cz, y0, y1, rows = 9, cols = 24) {
  const R = new Float64Array(rows * cols);
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    o.set(cx, y0 + (y1 - y0) * (r / (rows - 1)), cz);
    let sum = 0, n = 0;
    for (let c = 0; c < cols; c++) {
      const a = (c / cols) * Math.PI * 2;
      const reach = farthestHit(tris, o, d.set(Math.sin(a), 0, Math.cos(a)));
      R[r * cols + c] = reach;
      if (reach > 0) { sum += reach; n++; }
    }
    for (let c = 0; c < cols; c++) if (!(R[r * cols + c] > 0)) R[r * cols + c] = n ? sum / n : NaN;
  }
  // A height with no skin at all takes the nearest height that has some.
  for (let r = 0; r < rows; r++) {
    if (!Number.isNaN(R[r * cols])) continue;
    for (let k = 1; k < rows; k++) {
      const from = [r - k, r + k].find((j) => j >= 0 && j < rows && !Number.isNaN(R[j * cols]));
      if (from !== undefined) { R.copyWithin(r * cols, from * cols, (from + 1) * cols); break; }
    }
  }
  return { R, rows, cols, y0, y1, cx, cz };
}

/** How far out the skin reaches on a bearing (radians round from +Z) at a world height. */
export function reachAt(p, bearing, y) {
  const fr = Math.min(p.rows - 1, Math.max(0, ((y - p.y0) / (p.y1 - p.y0)) * (p.rows - 1)));
  const r0 = Math.floor(fr), r1 = Math.min(p.rows - 1, r0 + 1), tr = fr - r0;
  const fc = ((((bearing / (Math.PI * 2)) % 1) + 1) % 1) * p.cols;
  const c0 = Math.floor(fc) % p.cols, c1 = (c0 + 1) % p.cols, tc = fc - Math.floor(fc);
  const at = (r) => p.R[r * p.cols + c0] * (1 - tc) + p.R[r * p.cols + c1] * tc;
  return at(r0) * (1 - tr) + at(r1) * tr;
}

/**
 * Wrap a unit-radius garment round a body profile, `clear` [top, hem] off the
 * skin. The garment is `fit`-scaled local units about its own middle; the
 * profile is world units about the axis that middle sits on.
 */
export function fitToBody(geo, p, fit, clear) {
  const pos = geo.attributes.position;
  const mid = (p.y0 + p.y1) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const bearing = Math.atan2(x, z), slack = Math.hypot(x, z);
    const wy = mid + y * fit;
    const t = Math.min(1, Math.max(0, (wy - p.y0) / (p.y1 - p.y0)));
    const reach = reachAt(p, bearing, wy) / fit + clear[1] + (clear[0] - clear[1]) * t;
    pos.setX(i, Math.sin(bearing) * reach * slack);
    pos.setZ(i, Math.cos(bearing) * reach * slack);
  }
  geo.computeVertexNormals();
  return geo;
}
