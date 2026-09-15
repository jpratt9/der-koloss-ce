// Shots stop on what is drawn, not on the box a body walks into.
//
// A prop's collider is shaped for movement: a square around a round drum so a
// body slides off it cleanly, one solid block around a cage of bars, a
// railing's full height and length as a single slab, and — for the props that
// are built turned — a footprint that never turned with them. Tested as bullet
// cover, all of that slack was wall. A third of every drum's box and most of
// every cage's stopped shots in empty air, a round past a table's edge or
// between its legs never reached the zombie behind it, and the ends of a turned
// sandbag wall that stood outside its box were shot straight through.
//
// So each prop collider also carries the triangles drawn for it, grouped by the
// piece they were built from, and shots are tested against those. Movement,
// navigation, grenades and sound occlusion keep the box. Kept free of Three.js
// so the validators can build and query covers directly.

// A piece is the prop's if it reaches into the prop's box, give or take this
// much — not only if its centre is inside. The courtyard generator's flywheel
// is centred outside its box, and a cage built turned inside an unturned box
// stands its end bars and corner posts 5cm beyond it.
const SLACK = 0.1;
// ...and it overhangs the box by no more than this in plan. A turned sandbag
// wall overhangs its box by a metre; a floor slab or a wall run that happens to
// cross a small box is scenery, not the prop.
const OVERHANG = 1.05;
// Boxes grow by this much so a flat piece (a plane, a plate) never lies exactly
// on the face of its own bound and slips through the slab test.
const BOX_EPS = 1e-3;

/**
 * Give every bullet-solid prop collider a `cover`: the triangles of the pieces
 * drawn for it. `pieces` are `{ geometry, matrix }` — a BufferGeometry-shaped
 * object (`attributes.position.array`, optional `index.array`) and a
 * column-major 4x4 `matrix` to world, or null when it is already in world
 * space. A piece goes to the smallest prop box holding its centre, or failing
 * that the box it reaches furthest into. Pieces must not move after this —
 * leave doors, boards and the like out. Colliders that nothing drawn belongs to
 * keep testing as boxes; so does the mystery box's, which moves with the box.
 *
 * @returns {number} how many colliders were given a cover
 */
export function attachShotCover(colliders, pieces) {
  const props = colliders.filter((c) => c.prop && !c.noRaycast && !c.bulletPass && !c.boxCollider);
  if (!props.length) return 0;
  const owned = new Map(); // collider -> [{ tris, box }]
  for (const piece of pieces) {
    const box = worldBounds(piece);
    if (!box) continue;
    const cx = (box[0] + box[3]) / 2, cy = (box[1] + box[4]) / 2, cz = (box[2] + box[5]) / 2;
    let best = null, bestHolds = false, bestScore = -Infinity;
    for (const c of props) {
      const y0 = c.y0 || 0, top = y0 + (c.h || 3);
      const ox = Math.min(box[3], c.maxX + SLACK) - Math.max(box[0], c.minX - SLACK);
      const oy = Math.min(box[4], top + SLACK) - Math.max(box[1], y0 - SLACK);
      const oz = Math.min(box[5], c.maxZ + SLACK) - Math.max(box[2], c.minZ - SLACK);
      if (ox < 0 || oy < 0 || oz < 0) continue;
      if (box[0] < c.minX - OVERHANG || box[3] > c.maxX + OVERHANG
        || box[2] < c.minZ - OVERHANG || box[5] > c.maxZ + OVERHANG) continue;
      // Reaching in from the side is a part of the prop; grazing it from above
      // or below is not — the bridge deck's box is kissed by both ornate door
      // frames at its ends, which are 3.3m tall and belong to the walls.
      const inHeight = cy >= y0 - SLACK && cy <= top + SLACK;
      if (!inHeight && oy < 0.5 * (box[4] - box[1])) continue;
      const holds = inHeight && cx >= c.minX - SLACK && cx <= c.maxX + SLACK && cz >= c.minZ - SLACK && cz <= c.maxZ + SLACK;
      if (bestHolds && !holds) continue;
      // Holding the centre: the smallest box wins. Otherwise: the deepest
      // overlap (a millimetre of thickness each way, so flat pieces still count).
      const score = holds
        ? -(c.maxX - c.minX) * (c.maxZ - c.minZ) * (c.h || 3)
        : (ox + BOX_EPS) * (oy + BOX_EPS) * (oz + BOX_EPS);
      if ((holds && !bestHolds) || score > bestScore) { best = c; bestHolds = holds; bestScore = score; }
    }
    if (!best) continue;
    let list = owned.get(best);
    if (!list) owned.set(best, list = []);
    list.push({ tris: worldTriangles(piece), box });
  }
  for (const [c, list] of owned) c.cover = packCover(list);
  return owned.size;
}

// Plain position arrays only; an interleaved attribute is not a map piece.
function positionsOf(piece) {
  const attr = piece.geometry?.attributes?.position;
  return attr && !attr.isInterleavedBufferAttribute && attr.itemSize === 3 ? attr.array : null;
}

// World point i of a piece, into out[o..o+2].
function worldPoint(pos, v, e, out, o) {
  const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
  if (e) {
    out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  } else {
    out[o] = x; out[o + 1] = y; out[o + 2] = z;
  }
}

function worldBounds(piece) {
  const pos = positionsOf(piece);
  if (!pos || pos.length < 9) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (let v = 0; v < pos.length / 3; v++) {
    worldPoint(pos, v, piece.matrix, p, 0);
    for (let a = 0; a < 3; a++) {
      if (p[a] < b[a]) b[a] = p[a];
      if (p[a] > b[a + 3]) b[a + 3] = p[a];
    }
  }
  return b;
}

function worldTriangles(piece) {
  const pos = positionsOf(piece);
  const idx = piece.geometry.index?.array || null;
  const n = idx ? idx.length : pos.length / 3;
  const usable = n - (n % 3);
  const out = new Array(usable * 3);
  for (let i = 0; i < usable; i++) worldPoint(pos, idx ? idx[i] : i, piece.matrix, out, i * 3);
  return out;
}

function packCover(list) {
  let triCount = 0;
  for (const p of list) triCount += p.tris.length / 9;
  const tris = new Float32Array(triCount * 9);
  const boxes = new Float32Array(list.length * 6);
  const starts = new Uint32Array(list.length + 1);
  const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  let t = 0;
  list.forEach((p, i) => {
    starts[i] = t;
    tris.set(p.tris, t * 9);
    t += p.tris.length / 9;
    for (let a = 0; a < 3; a++) {
      boxes[i * 6 + a] = p.box[a] - BOX_EPS;
      boxes[i * 6 + a + 3] = p.box[a + 3] + BOX_EPS;
      bounds[a] = Math.min(bounds[a], boxes[i * 6 + a]);
      bounds[a + 3] = Math.max(bounds[a + 3], boxes[i * 6 + a + 3]);
    }
  });
  starts[list.length] = t;
  return { bounds, boxes, starts, tris };
}

// Does the ray [0, maxDist] cross the box stored at b[o..o+5] (min xyz, max xyz)?
function rayCrossesBox(b, o, ox, oy, oz, dx, dy, dz, maxDist) {
  let t0 = 0, t1 = maxDist;
  for (let a = 0; a < 3; a++) {
    const org = a === 0 ? ox : a === 1 ? oy : oz;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    if (Math.abs(d) < 1e-12) {
      if (org < b[o + a] || org > b[o + a + 3]) return false;
      continue;
    }
    let near = (b[o + a] - org) / d, far = (b[o + a + 3] - org) / d;
    if (near > far) { const s = near; near = far; far = s; }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return false;
  }
  return true;
}

// Möller–Trumbore, both faces: distance along the ray to triangle t, or -1.
function rayTriangle(T, t, ox, oy, oz, dx, dy, dz) {
  const ax = T[t], ay = T[t + 1], az = T[t + 2];
  const e1x = T[t + 3] - ax, e1y = T[t + 4] - ay, e1z = T[t + 5] - az;
  const e2x = T[t + 6] - ax, e2y = T[t + 7] - ay, e2z = T[t + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const inv = 1 / det;
  const sx = ox - ax, sy = oy - ay, sz = oz - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return d > 1e-6 ? d : -1;
}

/**
 * Distance along a world ray (unit `d`) to the first drawn triangle of a cover
 * nearer than `maxDist`, or -1. With `normal`, the struck face's unit normal,
 * turned to face the shooter, is written into it. Allocates nothing: this runs
 * per bullet and per pellet against every prop the ray crosses.
 */
export function coverRayDistance(cover, ox, oy, oz, dx, dy, dz, maxDist, normal = null) {
  if (!rayCrossesBox(cover.bounds, 0, ox, oy, oz, dx, dy, dz, maxDist)) return -1;
  const { boxes, starts, tris } = cover;
  let best = maxDist, struck = -1;
  for (let p = 0; p + 1 < starts.length; p++) {
    if (!rayCrossesBox(boxes, p * 6, ox, oy, oz, dx, dy, dz, best)) continue;
    for (let t = starts[p], end = starts[p + 1]; t < end; t++) {
      const d = rayTriangle(tris, t * 9, ox, oy, oz, dx, dy, dz);
      if (d >= 0 && d < best) { best = d; struck = t * 9; }
    }
  }
  if (struck < 0) return -1;
  if (normal) {
    const e1x = tris[struck + 3] - tris[struck], e1y = tris[struck + 4] - tris[struck + 1], e1z = tris[struck + 5] - tris[struck + 2];
    const e2x = tris[struck + 6] - tris[struck], e2y = tris[struck + 7] - tris[struck + 1], e2z = tris[struck + 8] - tris[struck + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    const facing = nx * dx + ny * dy + nz * dz > 0 ? -1 : 1;
    normal.x = nx / len * facing; normal.y = ny / len * facing; normal.z = nz / len * facing;
  }
  return best;
}
