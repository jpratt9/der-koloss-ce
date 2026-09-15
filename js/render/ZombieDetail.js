// Bone-attached geometry detail for zombies.
//
// The shipped corpse is a clean low-poly humanoid. Shading alone got it a long
// way, but a remastered-WaW corpse needs actual silhouette damage: a shredded
// greatcoat, exposed ribs where the flesh is gone, hanging strips, torn
// sleeves, a wrecked jaw.
//
// CRITICAL CONSTRAINT: this parents plain meshes to EXISTING bones. It adds no
// clips, no additive layers, no head-look, no retargeting, and never writes a
// bone transform. Attachments inherit their bone's motion for free, so they
// cannot desync the skeleton — which is what produced the rolling heads when
// this was previously attempted through the animation system.
//
// Memory shape matters here. Zombies are spawned and thrown away every round
// and the spawn path never disposes geometry, so anything generated per corpse
// would leak GPU memory for the whole session. Instead a small fixed pool of
// damage variants is built once and every corpse gets cheap Meshes POINTING AT
// the shared geometry — nothing per-instance to free but the meshes themselves.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';
import { enhanceCreatureMaterial } from './CreatureShading.js';

/** How many distinct damage builds exist. Enough that a horde never twins. */
const VARIANTS = 8;

const _scratchScale = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchCentre = new THREE.Vector3();

/**
 * Hips-to-head distance, in world units, of the rig everything below was
 * authored against (a calibrated in-game corpse standing 1.78 m tall).
 *
 * Sizes here are expressed relative to THIS rather than in absolute metres
 * because attachment happens before ZombieVisual calibrates: at attach time
 * the rig is still at its authored scale and only later gets multiplied up to
 * the target height. Anything measured in absolute metres therefore came out
 * ~1.6x too big, which is what put the tunic down around the knees.
 *
 * Measuring a ratio sidesteps the ordering entirely — both the measurement and
 * the bone scale get multiplied by the same factor, so they cancel.
 */
const REFERENCE_SPAN = 0.71;

// How far cloth stands off the skin it is fitted to, at the top and at the hem
// of each garment, in the same reference units. Enough to ride over the chest
// and belly as the spine bends and the proportion presets rescale the bones
// under it; a hem hangs looser than a collar.
const TUNIC_CLEAR = [0.035, 0.045];
const SKIRT_CLEAR = [0.018, 0.035];
const RAG_CLEAR = 0.012;
// Width, in reference units, of the head the skull damage was authored for.
const HEAD_WIDTH = 0.45;

// ---------------------------------------------------------------------------
// deterministic RNG — a given variant index always builds the same corpse
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _mats = null;
function materials() {
  if (_mats) return _mats;
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x2b2e2b, roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide,
  });
  const bone = new THREE.MeshStandardMaterial({
    color: 0x9a927c, roughness: 0.62, metalness: 0.0,
  });
  const flesh = new THREE.MeshStandardMaterial({
    color: 0x4a1512, roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide,
  });
  // Same rim/wrap treatment as the body, so the additions sit in the same
  // light instead of reading as pasted-on props.
  enhanceCreatureMaterial(cloth, {
    rimStrength: 0.34, rimPower: 3.6, wrap: 0.2, sssStrength: 0.05,
    fleshAmount: 0.35, grime: 0.6, wet: 0.05, tintA: 0x3a3d38, tintB: 0x242623,
  });
  enhanceCreatureMaterial(bone, {
    rimStrength: 0.5, rimPower: 3.2, wrap: 0.3, sssColor: 0xd8b090, sssStrength: 0.2,
    fleshAmount: 0.3, grime: 0.45, wet: 0.15, tintA: 0xa79d86, tintB: 0x8b8271,
  });
  enhanceCreatureMaterial(flesh, {
    rimStrength: 0.45, rimPower: 3.0, wrap: 0.35, sssColor: 0xa02818, sssStrength: 0.55,
    fleshAmount: 0.5, grime: 0.3, wet: 0.55, tintA: 0x5a1a15, tintB: 0x3a0f0c,
  });
  _mats = { cloth, bone, flesh };
  return _mats;
}

// ---------------------------------------------------------------------------
// primitive builders — all in metres, all merged before they reach the scene
// ---------------------------------------------------------------------------

/** A ragged hanging strip: a cloth tatter or a strand of flesh. */
function stripGeo(w, len, taper, rnd) {
  const g = new THREE.PlaneGeometry(w, len, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 0.5 - p.getY(i) / len;              // 0 at the root, 1 at the tip
    p.setX(i, p.getX(i) * (1 - t * taper) + (rnd() - 0.5) * w * 0.25 * t);
    // Curl it so it does not read as a flat rectangle.
    p.setZ(i, p.getZ(i) + Math.sin(t * 3.1) * len * 0.10 * (rnd() - 0.5) * 2);
  }
  g.translate(0, -len / 2, 0);                    // hang from the origin
  g.computeVertexNormals();
  return g;
}

/**
 * An open tube with a torn-off hem, used for the tunic and the coat.
 *
 * `thetaLength` below a full turn leaves a vertical gap — that is the rip the
 * ribs show through, so the exposed bone reads as a wound in clothing rather
 * than as bones stuck onto bare skin.
 *
 * Built at unit radius: fitToBody() gives it the corpse's own outline, and the
 * slack and the flared hem carry over as proportions of that.
 */
function garmentGeo(h, thetaStart, thetaLength, rnd, tear = 0.34) {
  const segs = Math.max(8, Math.round((thetaLength / (Math.PI * 2)) * 24));
  const g = new THREE.CylinderGeometry(1, 1, h, segs, 6, true, thetaStart, thetaLength);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -h * 0.49) {
      // Bottom ring: tear it upward by a random amount so the hem is ragged
      // instead of a machine-cut circle.
      p.setY(i, y + h * tear * rnd());
      p.setX(i, x * (1 + rnd() * 0.10));
      p.setZ(i, z * (1 + rnd() * 0.10));
    } else {
      // Everywhere else: a little slack so the cloth is not a perfect cylinder.
      const slack = 1 + (rnd() - 0.5) * 0.07;
      p.setX(i, x * slack);
      p.setZ(i, z * slack);
    }
  }
  return g;
}

function placed(geo, x, y, z, rx, ry, rz) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  return geo;
}

/** Turn by `q`, then move to (x, y, z). */
function oriented(geo, q, x, y, z) {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

function mergeOne(list) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged || null;
}

// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

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
function measureSkin(visual) {
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
function farthestHit(tris, o, d) {
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
function centreOf(tris) {
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
function bodyProfile(tris, cx, cz, y0, y1, rows = 9, cols = 24) {
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
function reachAt(p, bearing, y) {
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
function fitToBody(geo, p, fit, clear) {
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

// ---------------------------------------------------------------------------
// variant construction (once per model)
// ---------------------------------------------------------------------------

function buildVariant(seed, body) {
  const rnd = mulberry32(seed);
  const { fit } = body;
  // How mauled this build is. Most are ragged; a few are wrecked.
  const damage = rnd() < 0.25 ? 0.85 + rnd() * 0.15 : 0.25 + rnd() * 0.5;
  const v = { hips: null, torso: null, shoulderL: null, shoulderR: null, head: null };

  // ---- hips: the torn-off skirt of a greatcoat ----------------------------
  {
    const S = body.skirt;
    const h = (S.y1 - S.y0) / fit;
    const parts = [];
    // The skirt itself, as one continuous piece of cloth with a shredded hem.
    // Doing this as a garment rather than as loose strips is what stops it
    // reading as a grass skirt. It is open down the front, as a greatcoat's
    // skirt is below the buttons, so a striding thigh comes out through the
    // opening instead of through the cloth.
    const opening = 1.4;
    parts.push(fitToBody(garmentGeo(h, opening / 2, Math.PI * 2 - opening, rnd), S, fit, SKIRT_CLEAR));
    // A few strips torn loose below the hem. Short and wide: long thin ones
    // read as sticks hanging off the model, not fabric.
    for (let i = 0, n = 3 + Math.floor(rnd() * 4); i < n; i++) {
      const a = opening / 2 + rnd() * (Math.PI * 2 - opening);
      const r = reachAt(S, a, S.y0) / fit + SKIRT_CLEAR[1] + rnd() * 0.03;
      parts.push(placed(
        stripGeo(0.13 + rnd() * 0.10, 0.10 + rnd() * 0.14, 0.5 + rnd() * 0.3, rnd),
        Math.sin(a) * r, -h * 0.5, Math.cos(a) * r,
        (rnd() - 0.5) * 0.25, a, (rnd() - 0.5) * 0.3,
      ));
    }
    // A thin surviving belt strap round the top, drawn in to the waist rather
    // than a hoop standing off it.
    const strap = new THREE.CylinderGeometry(1, 1, 0.028, 24, 1, true).translate(0, h * 0.5 - 0.02, 0);
    parts.push(fitToBody(strap, S, fit, [SKIRT_CLEAR[0] + 0.008, SKIRT_CLEAR[0] + 0.008]));
    v.hips = mergeOne(parts);
  }

  // ---- torso: exposed ribs, wound cavity, hanging flesh -------------------
  // One mesh, two material groups (bone then flesh), so a torn-open torso
  // costs a single draw call instead of two.
  {
    const T = body.tunic;
    const h = (T.y1 - T.y0) / fit;
    const skinAt = (bearing, y) => reachAt(T, bearing, (T.y0 + T.y1) / 2 + y * fit) / fit;
    const clothParts = [];
    const boneParts = [];
    const fleshParts = [];
    const side = rnd() < 0.5 ? 1 : -1;
    const ribs = damage > 0.6 ? 4 : damage > 0.35 ? 2 : 0;
    // Bearings run round from the front, so the mirror of one is its negative.
    // `PI - x` mirrored front to back instead and cut half the rips between the
    // shoulder blades, nowhere near the ribs they were meant to show.
    const gapCentre = side * 0.35;

    // A ripped tunic. The base model is bare-chested, which reads as an
    // unfinished character rather than a corpse; clothing it is the single
    // biggest step toward a WaW-era soldier silhouette. The rip is placed on
    // the same side as the ribs so the two damage features agree.
    {
      const gap = ribs ? 0.55 + damage * 0.55 : 0.16;
      // Torn less deep than the coat skirt: its hem tucks under the skirt, and a
      // deep tear there only opens a window onto bare belly.
      clothParts.push(fitToBody(garmentGeo(h, gapCentre + gap / 2, Math.PI * 2 - gap, rnd, 0.2), T, fit, TUNIC_CLEAR));
    }
    // Ribs arc round the chest in the rip, their crowns just proud of the skin.
    const q = new THREE.Quaternion();
    const flat = new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI / 2);
    for (let i = 0; i < ribs; i++) {
      const r = 0.085 - i * 0.006, arc = 1.5 + rnd() * 0.4, y = 0.12 - i * 0.045;
      const reach = skinAt(gapCentre, y) + 0.010 - r;
      q.setFromAxisAngle(Y_AXIS, gapCentre - Math.PI / 2 + arc / 2).multiply(flat);
      boneParts.push(oriented(new THREE.TorusGeometry(r, 0.009, 4, 8, arc), q,
        Math.sin(gapCentre) * reach, y, Math.cos(gapCentre) * reach));
    }
    if (ribs) {
      // A dark cavity behind the ribs, so they read as a hole rather than
      // as bones stuck onto an intact chest.
      const reach = skinAt(gapCentre, 0.06) + 0.004 - 0.085;
      q.setFromAxisAngle(Y_AXIS, gapCentre).multiply(flat);
      fleshParts.push(oriented(new THREE.SphereGeometry(0.085, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), q,
        Math.sin(gapCentre) * reach, 0.06, Math.cos(gapCentre) * reach));
    }
    for (let i = 0, n = Math.round(damage * 4); i < n; i++) {
      const a = gapCentre + (rnd() - 0.5) * 0.9, y = 0.02 - rnd() * 0.12;
      const reach = skinAt(a, y) + 0.008;
      fleshParts.push(placed(
        stripGeo(0.03 + rnd() * 0.025, 0.10 + rnd() * 0.14, 0.7, rnd),
        Math.sin(a) * reach, y, Math.cos(a) * reach,
        0.3 + rnd() * 0.4, a + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5,
      ));
    }
    // One mesh for the whole torso, with a material group per surface type, so
    // a clothed and torn-open chest still costs a single draw call.
    const layers = [
      ['cloth', mergeOne(clothParts)],
      ['bone', mergeOne(boneParts)],
      ['flesh', mergeOne(fleshParts)],
    ].filter(([, g]) => g);
    if (layers.length === 1) {
      v.torso = { geo: layers[0][1], mats: [layers[0][0]] };
    } else if (layers.length > 1) {
      const merged = mergeGeometries(layers.map(([, g]) => g), true);
      for (const [, g] of layers) g.dispose();
      if (merged) v.torso = { geo: merged, mats: layers.map(([k]) => k) };
    }
  }

  // ---- shoulders: torn sleeve tatters -------------------------------------
  // Hung round the top of the upper arm they were torn from, and carried by it
  // rather than by the collarbone, which the arm swings away from.
  for (const key of ['shoulderL', 'shoulderR']) {
    if (rnd() > 0.75) continue;                   // some sleeves survive intact
    const parts = [];
    for (let i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) {
      // Short: they lie along the arm, and a zombie walks with its arms held
      // out, so anything long enough to hang reads as a flag.
      const strip = stripGeo(0.055 + rnd() * 0.04, 0.06 + rnd() * 0.08, 0.6, rnd);
      // down the arm from the shoulder joint, and round it from its outside
      parts.push(body[key].tatter(strip, 0.12 + rnd() * 0.25, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 0.5));
    }
    v[key] = mergeOne(parts.filter(Boolean));
  }

  // ---- head: jaw and skull damage ------------------------------------------
  if (damage > 0.55) {
    const parts = [];
    const side = rnd() < 0.5 ? 1 : -1;
    // Exposed cheekbone, low on the side of the face along the jaw.
    parts.push(body.head.stud(new THREE.SphereGeometry(0.032, 6, 5, 0, Math.PI * 1.1, 0, Math.PI * 0.6),
      new THREE.Vector3(side * 0.8, -0.35, 0.5), 0.016));
    if (rnd() < 0.6) {
      // A patch of bare skull above the ear, scalp gone.
      parts.push(body.head.stud(new THREE.SphereGeometry(0.047, 7, 5, 0, Math.PI * 0.9, 0, Math.PI * 0.45),
        new THREE.Vector3(side * 0.55, 0.75, -0.35), 0.020));
    }
    v.head = mergeOne(parts.filter(Boolean));
  }

  return v;
}

/** A sleeve's worth of frame: the upper arm's axis and the skin round it. */
function armFrame(skin, B, s, fit) {
  const origin = B['UpperArm' + s].getWorldPosition(new THREE.Vector3());
  const axis = B['LowerArm' + s].getWorldPosition(new THREE.Vector3()).sub(origin);
  const length = axis.length();
  axis.divideScalar(length);
  // The model faces +Z, so its left is +X: `outward` is away from the body.
  const outward = new THREE.Vector3(s === 'L' ? 1 : -1, 0, 0);
  outward.addScaledVector(axis, -outward.dot(axis)).normalize();
  const across = new THREE.Vector3().crossVectors(axis, outward);
  const tris = skin.tris['arm' + s];
  const base = new THREE.Vector3(), dir = new THREE.Vector3(), basis = new THREE.Matrix4(), twist = new THREE.Matrix4();
  return {
    bone: 'UpperArm' + s,
    origin,
    /**
     * Hang a strip off the arm's surface `t` of the way to the elbow, `around`
     * radians round from its outside, running down the arm.
     */
    tatter(geo, t, around, turn) {
      dir.copy(outward).multiplyScalar(Math.cos(around)).addScaledVector(across, Math.sin(around));
      base.copy(origin).addScaledVector(axis, t * length);
      const reach = farthestHit(tris, base, dir);
      if (reach < 0) { geo.dispose(); return null; }
      // A strip hangs down its own -Y: point that down the arm, and its face out.
      const up = axis.clone().negate();
      basis.makeBasis(new THREE.Vector3().crossVectors(up, dir), up, dir);
      basis.premultiply(twist.makeRotationAxis(dir, turn));
      basis.setPosition(base.addScaledVector(dir, reach + RAG_CLEAR * fit).sub(origin).divideScalar(fit));
      return geo.applyMatrix4(basis);
    },
  };
}

/** The skull the head damage is stood on. */
function headFrame(skin, B, fit) {
  const tris = skin.tris.head;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < tris.length; i += 3) { y0 = Math.min(y0, tris[i]); y1 = Math.max(y1, tris[i]); }
  const { cx, cz } = centreOf(tris);
  const centre = new THREE.Vector3(cx, (y0 + y1) / 2, cz);
  const origin = B.Head.getWorldPosition(new THREE.Vector3());
  // Damage is sized to the skull it is on. Both heads are cartoon-large, the
  // Basic's twice the Chubby's for the same body, and a cheekbone authored
  // against a human skull was a speck on it.
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); }
  const size = (x1 - x0) / fit / HEAD_WIDTH;
  return {
    bone: 'Head',
    origin,
    /** Stand a spherical cap on the skin out along `dir`, its crown `proud` above it. */
    stud(geo, dir, proud) {
      dir.normalize();
      const reach = farthestHit(tris, centre, dir);
      if (reach < 0) { geo.dispose(); return null; }
      geo.scale(size, size, size);
      const sink = (geo.parameters.radius - proud) * size * fit;
      const at = centre.clone().addScaledVector(dir, reach - sink).sub(origin).divideScalar(fit);
      return oriented(geo, new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir), at.x, at.y, at.z);
    },
  };
}

// Source model -> its fitted variants and where they mount, or null if the rig
// is missing a bone they need. Built on first attach.
const _fitted = new WeakMap();

function fittedFor(visual) {
  const key = visual.src || visual.inner;
  if (_fitted.has(key)) return _fitted.get(key);
  const B = visual.bones;
  let fitted = null;
  const needed = ['Hips', 'Torso', 'Head', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'];
  const skin = needed.every((n) => B[n]) ? measureSkin(visual) : null;
  if (skin && skin.beltTop > skin.legBottom && skin.trunkTop > skin.beltTop) {
    const fit = B.Head.getWorldPosition(new THREE.Vector3()).distanceTo(B.Hips.getWorldPosition(new THREE.Vector3())) / REFERENCE_SPAN;
    // The skirt runs from just over the belt most of the way down the shorts;
    // the tunic from below the belt, so its hem laps over the top of the skirt,
    // to the top of the shoulders. Both are fitted round the axis of the body
    // under them — not the Hips bone, which on these rigs is behind the pelvis.
    const around = [...skin.tris.pelvis, ...skin.tris.trunk];
    const pelvis = centreOf(skin.tris.pelvis);
    const skirt = bodyProfile(around, pelvis.cx, pelvis.cz,
      skin.legBottom + (skin.beltTop - skin.legBottom) * 0.2, skin.beltTop + 0.01 * fit);
    const trunk = centreOf(skin.tris.trunk);
    const tunic = bodyProfile(around, trunk.cx, trunk.cz, skin.beltTop - 0.10 * fit, skin.trunkTop - 0.05 * fit);
    const body = {
      fit, skirt, tunic,
      shoulderL: armFrame(skin, B, 'L', fit), shoulderR: armFrame(skin, B, 'R', fit), head: headFrame(skin, B, fit),
    };
    const middle = (p) => new THREE.Vector3(p.cx, (p.y0 + p.y1) / 2, p.cz);
    // Mount points are kept in their bone's own space, so they hold for every
    // clone of this model whatever it has been scaled to.
    const local = (bone, world) => B[bone].worldToLocal(world.clone());
    fitted = {
      variants: Array.from({ length: VARIANTS }, (_, i) => buildVariant(0x9e37 + i * 2654435761, body)),
      slots: {
        hips: { bone: 'Hips', at: local('Hips', middle(skirt)) },
        torso: { bone: 'Torso', at: local('Torso', middle(tunic)) },
        shoulderL: { bone: body.shoulderL.bone, at: local(body.shoulderL.bone, body.shoulderL.origin) },
        shoulderR: { bone: body.shoulderR.bone, at: local(body.shoulderR.bone, body.shoulderR.origin) },
        head: { bone: 'Head', at: local('Head', body.head.origin) },
      },
    };
  }
  _fitted.set(key, fitted);
  return fitted;
}

// ---------------------------------------------------------------------------
// attachment
// ---------------------------------------------------------------------------

/**
 * Attach damage detail to a zombie visual.
 *
 * Call it before the rig's first animated frame — as createZombieVisual does —
 * because the first attach per model measures the skin in its rest pose.
 *
 * @param {object} visual the ZombieVisual (needs `.bones`, `.inner`, `.src`)
 * @param {number} [variantIndex] which prebuilt damage build to use
 * @returns {THREE.Mesh[]} the attachments, for {@link detachZombieDetail}
 */
export function attachZombieDetail(visual, variantIndex = Math.floor(Math.random() * VARIANTS)) {
  const B = visual?.bones;
  if (!B || !visual.inner) return [];
  const fitted = fittedFor(visual);
  if (!fitted) return [];
  const M = materials();
  const v = fitted.variants[((variantIndex % VARIANTS) + VARIANTS) % VARIANTS];
  const out = [];

  // Measure this rig so every attachment is sized as a proportion of the body
  // rather than in absolute metres. See REFERENCE_SPAN.
  let fit = 1;
  B.Head.getWorldPosition(_scratchCentre);
  const span = _scratchCentre.distanceTo(B.Hips.getWorldPosition(_scratchScale));
  if (span > 1e-3) fit = span / REFERENCE_SPAN;

  /**
   * Parent to a bone, cancelling that bone's rest transform so the geometry
   * above can be authored in plain world-aligned metres.
   *
   * Both halves matter:
   *
   * - SCALE. The rig is scaled to hit a target height, so raw bone space is
   *   not metres. Divided out here, uniformly — a component-wise inverse does
   *   not commute with the rotation below and shears the mesh.
   *
   * - ROTATION. Bone axes are NOT world axes: the spine bones lean, so a
   *   local -Y offset travels down AND backwards. Without this the tunic and
   *   the coat hung roughly 0.2 m behind the body, floating clear of the back.
   *
   * Cancelling the rest rotation is not the same as pinning the mesh in world
   * space — the mesh still inherits every subsequent bone transform, so it
   * animates with the pose exactly as intended. It just starts from square.
   */
  const mount = (slot, geo, material) => {
    const bone = B[slot.bone];
    if (!bone || !geo) return;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    bone.updateWorldMatrix(true, false);
    bone.getWorldScale(_scratchScale);
    bone.getWorldQuaternion(_scratchQuat);
    const s = (_scratchScale.x + _scratchScale.y + _scratchScale.z) / 3;
    mesh.quaternion.copy(_scratchQuat).invert();
    mesh.scale.setScalar(fit / Math.max(1e-4, s));
    mesh.position.copy(slot.at);
    bone.add(mesh);
    out.push(mesh);
  };

  mount(fitted.slots.hips, v.hips, M.cloth);
  mount(fitted.slots.shoulderL, v.shoulderL, M.cloth);
  mount(fitted.slots.shoulderR, v.shoulderR, M.cloth);
  mount(fitted.slots.head, v.head, M.bone);
  if (v.torso) {
    const mats = v.torso.mats.map((k) => M[k]);
    mount(fitted.slots.torso, v.torso.geo, mats.length === 1 ? mats[0] : mats);
  }
  return out;
}

/**
 * Unparent a corpse's detail meshes.
 *
 * Deliberately does NOT dispose geometry: it is shared by every zombie using
 * the same variant and lives for the process. Disposing here would blank the
 * detail on every other corpse in the horde.
 */
export function detachZombieDetail(list) {
  for (const m of list || []) m.parent?.remove(m);
}

/** Toggle detail for LOD, so distant corpses skip the extra draw calls. */
export function setZombieDetailVisible(list, visible) {
  for (const m of list || []) m.visible = visible;
}
