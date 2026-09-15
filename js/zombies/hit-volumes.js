// Zombie hit volumes: hulls fitted to each bone's share of the skin, and the
// ray test and aim point that read them.
import * as THREE from 'three';

// ---- hit volumes -----------------------------------------------------------
// What a bullet hits is what is drawn. The shipped test was three fixed spheres
// stacked above a zombie's feet — head at 1.5m, r 0.23 — and the corpse was
// almost never inside them: the walk and run cycles carry the skull 0.1-0.2m
// higher and 0.2m forward of the feet, the proportion presets draw heads from
// 0.2m to 0.66m wide, and a crawler's skull lies a metre in front of its feet
// with its "head" sphere sitting on its back. The bottom of the head scored as
// body, the top and sides were clean misses, and crawlers were headshot by
// aiming at their spine.
//
// So every bone that owns part of the skin gets a hull, fitted once per model in
// that bone's own bind space and carried by its world matrix. Pose, hunch,
// preset proportions, calibrated height and a riser's pitch all come for free,
// and there is no per-clip table to go stale when an animation changes.

// Bones that own a hull. A skinned vertex is filed under the nearest of these at
// or above its heaviest joint: fingers under the forearm, eyelids under the
// head, the neck under the torso. The jaw and tongue keep their own hulls
// because they leave the skull — a tongue lolls a hand's width below the chin.
// (GLTFLoader strips the dots, so 'Shoulder.L' arrives as 'ShoulderL'.)
const HIT_BONES = [
  'Head', 'TopMouth', 'BottomMouth', 'Tongue1', 'Tongue2', 'Tongue3', 'Tongue4', 'Tongue5',
  'Torso', 'Hips', 'ShoulderL', 'ShoulderR', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR',
  'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR',
];
// The slab normals a hull is fitted along: the three axes, the six edge
// diagonals and the four corner diagonals, a 26-sided hull. Not a box: a skull
// pitched 45 degrees over a barricade put its bounding box's corner 16cm proud
// of the scalp, a headshot on thin air. The diagonals shave the corners back to
// the pad.
const S2 = Math.SQRT1_2, S3 = 1 / Math.sqrt(3);
const HIT_AXES = new Float64Array([
  1, 0, 0, 0, 1, 0, 0, 0, 1,
  S2, S2, 0, S2, -S2, 0, S2, 0, S2, S2, 0, -S2, 0, S2, S2, 0, S2, -S2,
  S3, S3, S3, S3, S3, -S3, S3, -S3, S3, S3, -S3, -S3,
]);
const HIT_SLABS = HIT_AXES.length / 3;
// Bind-pose skin hulls grow by this much, in bone units, to hold the vertices
// that blend across a joint and drift out of a rigid fit as it bends: measured
// at under 0.05 (about 3cm) across every clip gameplay plays.
const HIT_HULL_PAD = 0.05;
// Every pose fits inside this sphere around the model's hips height — a jump's
// raised arms, a crawler's head, a riser pitched forward — so a ray that misses
// it never pays for the per-bone test.
const HIT_REACH = 2.3;
const HIT_REACH_Y = 0.9;

const _skinHulls = new WeakMap();
const _meshHulls = new WeakMap();
const _hitPoint = new THREE.Vector3();

const emptyHull = () => ({ min: new Array(HIT_SLABS).fill(Infinity), max: new Array(HIT_SLABS).fill(-Infinity) });
function hullAdd(hull, p) {
  for (let a = 0; a < HIT_SLABS; a++) {
    const d = HIT_AXES[a * 3] * p.x + HIT_AXES[a * 3 + 1] * p.y + HIT_AXES[a * 3 + 2] * p.z;
    if (d < hull.min[a]) hull.min[a] = d;
    if (d > hull.max[a]) hull.max[a] = d;
  }
}

// Hulls per SOURCE model, shared by every clone of it: skClone shares the
// geometry and bind data, so the fit is one pass over the skin per GLTF.
function skinHitHulls(src) {
  if (_skinHulls.has(src)) return _skinHulls.get(src);
  const found = new Map(); // bone name -> { head, min, max } in that bone's bind space
  src?.scene?.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const { bones, boneInverses } = o.skeleton;
    const { position, skinIndex, skinWeight } = o.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) return;
    const owner = bones.map((b) => {
      for (let p = b; p?.isBone; p = p.parent) if (HIT_BONES.includes(p.name)) return bones.indexOf(p);
      return -1;
    });
    for (let i = 0; i < position.count; i++) {
      let joint = skinIndex.getComponent(i, 0), weight = skinWeight.getComponent(i, 0);
      for (let k = 1; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > weight) { weight = w; joint = skinIndex.getComponent(i, k); }
      }
      const j = owner[joint];
      if (j < 0) continue;
      let entry = found.get(bones[j].name);
      if (!entry) {
        let head = false;
        for (let p = bones[j]; p?.isBone; p = p.parent) if (p.name === 'Head') head = true;
        found.set(bones[j].name, entry = { head, ...emptyHull() });
      }
      hullAdd(entry, _hitPoint.fromBufferAttribute(position, i).applyMatrix4(o.bindMatrix).applyMatrix4(boneInverses[j]));
    }
  });
  const table = Object.freeze(HIT_BONES.filter((name) => found.has(name)).map((name) => {
    const { head, min, max } = found.get(name);
    return Object.freeze({
      name, head,
      min: Object.freeze(min.map((d) => d - HIT_HULL_PAD)),
      max: Object.freeze(max.map((d) => d + HIT_HULL_PAD)),
    });
  }));
  _skinHulls.set(src, table);
  return table;
}

// A rigid mesh riding a bone (damage detail, the fallback body's parts) is the
// hull of its own geometry. Geometry is shared, so each is fitted once.
function meshHitVolume(mesh, head) {
  let hull = _meshHulls.get(mesh.geometry);
  if (!hull) {
    hull = emptyHull();
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) hullAdd(hull, _hitPoint.fromBufferAttribute(pos, i));
    _meshHulls.set(mesh.geometry, hull);
  }
  return { node: mesh, head, min: hull.min, max: hull.max, inv: new THREE.Matrix4() };
}

// Built on first use and kept on the model, so a model swap starts fresh. Hounds
// have none: dogHitZones is their anatomy.
function zombieHitVolumes(z) {
  const model = z.model;
  if (!model || z.dog) return null;
  const u = model.userData;
  if (u.hitVolumes !== undefined) return u.hitVolumes;
  const vols = [];
  const v = z.visual;
  if (v) {
    for (const hull of skinHitHulls(v.src)) {
      const bone = v.bones[hull.name];
      if (bone) vols.push({ node: bone, head: hull.head, min: hull.min, max: hull.max, inv: new THREE.Matrix4() });
    }
    for (const mesh of v.detail || []) vols.push(meshHitVolume(mesh, mesh.parent === v.bones.Head));
  } else if (u.fallbackZombie) {
    for (const part of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) vols.push(meshHitVolume(u[part], part === 'head'));
  }
  // Head volumes first (a stable sort, so the skull stays first of them): once
  // one is hit, no body volume can change the answer and the rest are skipped.
  vols.sort((a, b) => b.head - a.head);
  u.hitVolumes = vols.length ? vols : null;
  u.hitBounds = new Float64Array(6); // posed world box around every hull: min xyz, max xyz
  u.hitSerial = undefined;
  return u.hitVolumes;
}

// Re-derive the posed matrices, their inverses and the world box once per
// animate() — which bumps z.poseSerial — not once per pellet: re-walking every
// corpse's skeleton per pellet cost a shotgun blast into a packed horde 1.9ms,
// against 0.45ms like this. Re-derived rather than trusted to the renderer at
// all, because the host's watchdog keeps simulating a background tab without
// drawing, and the last drawn frame would lag the zombie it is judging.
function refreshHitPose(z, vols) {
  const u = z.model.userData;
  if (z.poseSerial !== undefined && u.hitSerial === z.poseSerial) return;
  z.model.updateMatrixWorld(true);
  const b = u.hitBounds;
  b[0] = b[1] = b[2] = Infinity;
  b[3] = b[4] = b[5] = -Infinity;
  for (let i = 0; i < vols.length; i++) {
    const vol = vols[i];
    const e = vol.node.matrixWorld.elements;
    vol.inv.copy(vol.node.matrixWorld).invert();
    // The hull's own box, in world: centre through the matrix, half-size
    // through its absolute value.
    const cx = (vol.min[0] + vol.max[0]) / 2, cy = (vol.min[1] + vol.max[1]) / 2, cz = (vol.min[2] + vol.max[2]) / 2;
    const hx = (vol.max[0] - vol.min[0]) / 2, hy = (vol.max[1] - vol.min[1]) / 2, hz = (vol.max[2] - vol.min[2]) / 2;
    for (let a = 0; a < 3; a++) {
      const c = e[a] * cx + e[a + 4] * cy + e[a + 8] * cz + e[a + 12];
      const h = Math.abs(e[a]) * hx + Math.abs(e[a + 4]) * hy + Math.abs(e[a + 8]) * hz;
      if (c - h < b[a]) b[a] = c - h;
      if (c + h > b[a + 3]) b[a + 3] = c + h;
    }
  }
  u.hitSerial = z.poseSerial;
}

// Does a world ray cross a world box [min xyz, max xyz] within maxDist?
function rayCrossesBounds(b, origin, dir, maxDist) {
  let t0 = 0, t1 = maxDist;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
    const d = a === 0 ? dir.x : a === 1 ? dir.y : dir.z;
    if (Math.abs(d) < 1e-9) {
      if (o < b[a] || o > b[a + 3]) return false;
      continue;
    }
    let near = (b[a] - o) / d, far = (b[a + 3] - o) / d;
    if (near > far) { const s = near; near = far; far = s; }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return false;
  }
  return true;
}

// Entry distance of a world ray into a volume's hull, or -1. The ray is taken
// into the node's own space by the inverse world matrix; an affine map keeps
// the ray parameter, so t there is still metres along the world ray.
function rayHullEntry(vol, origin, dir, maxDist) {
  const e = vol.inv.elements;
  const ox = e[0] * origin.x + e[4] * origin.y + e[8] * origin.z + e[12];
  const oy = e[1] * origin.x + e[5] * origin.y + e[9] * origin.z + e[13];
  const oz = e[2] * origin.x + e[6] * origin.y + e[10] * origin.z + e[14];
  const dx = e[0] * dir.x + e[4] * dir.y + e[8] * dir.z;
  const dy = e[1] * dir.x + e[5] * dir.y + e[9] * dir.z;
  const dz = e[2] * dir.x + e[6] * dir.y + e[10] * dir.z;
  let t0 = 0, t1 = maxDist;
  for (let a = 0; a < HIT_SLABS; a++) {
    const nx = HIT_AXES[a * 3], ny = HIT_AXES[a * 3 + 1], nz = HIT_AXES[a * 3 + 2];
    const o = nx * ox + ny * oy + nz * oz;
    const d = nx * dx + ny * dy + nz * dz;
    if (Math.abs(d) < 1e-9) {
      if (o < vol.min[a] || o > vol.max[a]) return -1;
      continue;
    }
    let near = (vol.min[a] - o) / d, far = (vol.max[a] - o) / d;
    if (near > far) { const s = near; near = far; far = s; }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return -1;
  }
  return t0;
}

/**
 * Cast a ray against a zombie's posed body. Returns null when there is no body
 * to test (no model yet, or a hound), false on a miss, and true on a hit with
 * `out.dist` (entry distance along the ray) and `out.head` written. A ray
 * through the skull is a headshot even if it clipped a shoulder on the way in,
 * the same head-first rule the sphere test had.
 */
export function rayHitZombieBody(z, origin, dir, maxDist, out) {
  const vols = zombieHitVolumes(z);
  if (!vols) return null;
  const p = z.model.position;
  const cx = p.x - origin.x, cy = p.y + HIT_REACH_Y - origin.y, cz = p.z - origin.z;
  const tc = cx * dir.x + cy * dir.y + cz * dir.z;
  if (tc < -HIT_REACH || tc > maxDist + HIT_REACH) return false;
  if (cx * cx + cy * cy + cz * cz - tc * tc > HIT_REACH * HIT_REACH) return false;
  refreshHitPose(z, vols);
  if (!rayCrossesBounds(z.model.userData.hitBounds, origin, dir, maxDist)) return false;
  let head = Infinity, body = Infinity;
  for (let i = 0; i < vols.length; i++) {
    const vol = vols[i];
    if (!vol.head && head !== Infinity) break;
    if (!vol.node.visible) continue;
    const t = rayHullEntry(vol, origin, dir, maxDist);
    if (t < 0) continue;
    if (vol.head) { if (t < head) head = t; } else if (t < body) body = t;
  }
  if (head === Infinity && body === Infinity) return false;
  out.head = head !== Infinity;
  out.dist = out.head ? head : body;
  return true;
}

/**
 * World centre of the posed skull (`head`) or the mean centre of the body's
 * hulls, written into `out`; null when there is no body to measure. The skull
 * is the first head volume — the Head bone's own hull, not a jaw or a tongue.
 * A hull's first three slabs are its box, so their midpoints are its centre.
 */
export function zombieAimPoint(z, head, out) {
  const vols = zombieHitVolumes(z);
  if (!vols) return null;
  refreshHitPose(z, vols);
  let n = 0;
  out.set(0, 0, 0);
  for (const vol of vols) {
    if (vol.head !== head) continue;
    _hitPoint.set((vol.min[0] + vol.max[0]) / 2, (vol.min[1] + vol.max[1]) / 2, (vol.min[2] + vol.max[2]) / 2);
    out.add(_hitPoint.applyMatrix4(vol.node.matrixWorld));
    n++;
    if (head) break;
  }
  return n ? out.divideScalar(n) : null;
}
