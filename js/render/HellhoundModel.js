// The hellhound, as an actual animal.
//
// The previous hound was ~91 loose meshes stacked into a flat group: a slab
// chest, a jaw and a tail that were never parented to anything and so floated
// clear of the body the moment the pose function touched them, and sixteen
// orange boxes pasted on the flanks that read as painted-on panels. It cost 728
// draw calls for a pack of eight and still looked like a crate with ears.
//
// This rebuilds it around three ideas:
//
//  1. SILHOUETTE FIRST. The torso is a single swept tube through a table of
//     elliptical stations, so the animal has a real profile — high withers, a
//     deep narrow brisket, a hard abdominal tuck, a topline that falls away to
//     low haunches. That shape is what makes a hellhound read at twenty metres
//     in the dark, and no amount of surface detail substitutes for it.
//
//  2. ONE MESH PER BONE. Everything that rides a given bone — hide, ember
//     fissures, exposed bone, fur — is merged into a single geometry with one
//     material group per surface. A hound is ~14 meshes instead of ~91, and
//     because the geometry is built once per variant and SHARED, a pack of
//     eight allocates nothing but the Mesh wrappers.
//
//  3. NOTHING FIGHTS THE POSE. Every part is parented to the bone group that
//     applyHellhoundPose() drives, so attachments inherit the gait, the head
//     sway and the tail whip for free. This file writes no transform per frame.
//
// Coordinate frame: +X is the nose, +Y is up, +Z is the animal's left. Metres.
import * as THREE from 'three';
import { houndMaterials } from './HellhoundModel/materials.js';
import { spike, ribbon, placed, pack } from './HellhoundModel/primitives.js';
import { buildTorso } from './HellhoundModel/body.js';
import { buildNeck, buildHead, buildJaw } from './HellhoundModel/head.js';

export { houndMaterials };

/** Distinct builds, so a pack of eight never reads as one model duplicated. */
export const HOUND_VARIANTS = 5;

// ---------------------------------------------------------------------------
// deterministic RNG — a given variant index always builds the same hound
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

/** A tapered limb segment along -Y, origin at the joint. */
function limb(len, rTop, rBot, depthTop, depthBot, sides = 6) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, sides, 1);
  g.scale(1, 1, 1);
  g.translate(0, -len / 2, 0);
  // Fore-aft depth: a thigh is a blade, not a dowel.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (-p.getY(i)) / len;         // 0 at the joint, 1 at the far end
    const d = depthTop + (depthBot - depthTop) * Math.min(1, Math.max(0, t));
    p.setX(i, p.getX(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** One tail segment. `i` selects taper; the last one carries the ember tip. */
function buildTailSeg(rnd, i, n, len) {
  const bag = { hide: [], ember: [] };
  const r0 = 0.048 - i * 0.012, r1 = 0.048 - (i + 1) * 0.012;
  const g = new THREE.CylinderGeometry(Math.max(0.009, r1), r0, len, 6, 1);
  g.rotateZ(Math.PI / 2);          // along +X, which the tail root flips to -X
  g.translate(len / 2, 0, 0);
  bag.hide.push(g);
  // Coarse brush along the tail, heaviest at the base — a wolf's tail is
  // mostly hair, and a bare rod reads as a rat's.
  for (let k = 0; k < 9; k++) {
    const t = rnd();
    const a = rnd() * Math.PI * 2;
    const r = (r0 + (r1 - r0) * t) * 0.8;
    const s = spike(0.075 + rnd() * 0.05 - i * 0.014, 0.022, 0.003, 4);
    s.scale(1, 1, 0.7);
    bag.hide.push(placed(s, len * t, Math.cos(a) * r, Math.sin(a) * r, a, 0, -1.9 - rnd() * 0.4));
  }
  if (i === n - 1) {
    // Only the tip burns, and only the tip carries the ember slot: a crack on
    // a tail link is not worth a second draw call on three meshes per hound.
    const tip = spike(0.085, 0.024, 0.002, 5);
    bag.ember.push(placed(tip, len * 0.9, 0, 0, 0, 0, -Math.PI / 2));
    const pts = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      const r = (r0 + (r1 - r0) * t) + 0.003;
      pts.push(new THREE.Vector3(len * t, Math.cos(0.6 + t) * r, Math.sin(0.6 + t) * r));
    }
    const rb = ribbon(pts, 0.006);
    if (rb) bag.ember.push(rb);
  }
  return pack(bag);
}

// ---- legs -----------------------------------------------------------------
// Long and rangy. Front and rear share geometry — the difference between them
// lives in the rig's rest angles and hip height, not in two sets of meshes.
const UPPER_LEN = 0.40;
const LOWER_LEN = 0.48;

function buildUpperLeg(rnd) {
  // Deliberately ONE slot. Every extra material slot on a leg costs four draw
  // calls per hound, and a thigh has nothing on it worth that at any distance
  // the player will ever see one from.
  const bag = { hide: [] };
  bag.hide.push(limb(UPPER_LEN, 0.082, 0.036, 1.55, 1.1, 6));
  // A little muscle belly on the front of the thigh.
  bag.hide.push(placed(new THREE.SphereGeometry(0.055, 6, 5), 0.02, -0.10, 0, 0, 0, 0, 1.15, 1.7, 0.8));
  // Feathering down the back of the leg.
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + rnd() * 0.7;
    bag.hide.push(placed(spike(0.06 + rnd() * 0.04, 0.011, 0.001, 3),
      -0.03 - rnd() * 0.02, -UPPER_LEN * t, (rnd() - 0.5) * 0.05, 0, 0, 2.3 + rnd() * 0.6));
  }
  return pack(bag);
}

function buildLowerLeg(rnd) {
  const bag = { hide: [] };
  // Cannon bone: deliberately thin. The gap between a heavy thigh and a wire
  // shin is what makes an animal look fast.
  bag.hide.push(limb(LOWER_LEN * 0.86, 0.036, 0.023, 1.4, 1.05, 5));
  // Hock/pastern: the bare tendon running to the foot.
  bag.hide.push(placed(new THREE.CylinderGeometry(0.013, 0.016, LOWER_LEN * 0.30, 4),
    0.004, -LOWER_LEN * 0.86, 0, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    bag.hide.push(placed(spike(0.05 + rnd() * 0.03, 0.010, 0.001, 3),
      -0.022, -LOWER_LEN * (0.1 + rnd() * 0.4), (rnd() - 0.5) * 0.03, 0, 0, 2.4));
  }
  return pack(bag);
}

function buildPaw(rnd) {
  const bag = { hide: [], bone: [] };
  // Origin is the ground contact, so the rig's paw-plant clamp stays exact.
  bag.hide.push(placed(new THREE.SphereGeometry(0.052, 6, 5), 0.028, 0.038, 0, 0, 0, 0, 1.5, 0.7, 1.05));
  for (const off of [-0.038, 0, 0.038]) {
    const toe = off === 0 ? 0.075 : 0.062;
    bag.hide.push(placed(new THREE.SphereGeometry(0.024, 5, 4), 0.055 + toe * 0.3, 0.026, off, 0, 0, 0, 1.9, 0.85, 0.9));
    // Claws ride the HIDE slot: keratin is dark horn, and bone-white toes read
    // as socks at any distance. It also keeps a paw down to one draw call.
    bag.hide.push(placed(spike(0.038, 0.0085, 0.0, 4),
      0.055 + toe + 0.018, 0.020, off, 0, 0, -2.0 - rnd() * 0.2));
  }
  return pack(bag);
}

// ---------------------------------------------------------------------------
// the shared geometry pool
// ---------------------------------------------------------------------------
let _pool = null;
function pool() {
  if (_pool) return _pool;
  _pool = [];
  for (let v = 0; v < HOUND_VARIANTS; v++) {
    const rnd = mulberry32(0x5eed + v * 2654435761);
    _pool.push({
      torso: buildTorso(rnd),
      neck: buildNeck(rnd),
      head: buildHead(rnd),
      jaw: buildJaw(rnd),
      tail: [0, 1, 2].map((i) => buildTailSeg(rnd, i, 3, [0.19, 0.17, 0.15][i])),
      upper: buildUpperLeg(rnd),
      lower: buildLowerLeg(rnd),
      paw: buildPaw(rnd),
    });
  }
  return _pool;
}

/** Warm the geometry pool before the first dog round, off the spawn frame. */
export function prewarmHellhounds() { pool(); houndMaterials(); }

function meshFor(part, M, parent, name) {
  if (!part) return null;
  const mats = part.slots.map((k) => M[k]);
  const m = new THREE.Mesh(part.geo, mats.length === 1 ? mats[0] : mats);
  m.castShadow = true;
  m.name = name;
  parent.add(m);
  return m;
}

/**
 * Build a hellhound.
 *
 * Returns a group whose userData carries exactly the contract
 * applyHellhoundPose() and the cinematic director expect: `legs`, `legChains`,
 * `head`, `jaw`, `tail`, `body`.
 *
 * @param {number} variant which prebuilt geometry set to use
 */
export function buildHellhound(variant = Math.floor(Math.random() * HOUND_VARIANTS)) {
  const M = houndMaterials();
  const V = pool()[((variant | 0) % HOUND_VARIANTS + HOUND_VARIANTS) % HOUND_VARIANTS];
  const g = new THREE.Group();
  const detail = [];

  // ---- torso ---------------------------------------------------------------
  const body = new THREE.Group();
  body.name = 'HoundBody';
  g.add(body);
  meshFor(V.torso, M, body, 'HoundTorso');

  // ---- neck -> head -> jaw -------------------------------------------------
  const neck = new THREE.Group();
  neck.name = 'HoundNeck';
  neck.position.set(0.565, 0.855, 0);
  g.add(neck);
  meshFor(V.neck, M, neck, 'HoundNeckMesh');

  const head = new THREE.Group();
  head.name = 'HoundHead';
  head.position.set(0.295, 0.155, 0);     // lands the skull at ~(0.86, 1.01)
  neck.add(head);
  meshFor(V.head, M, head, 'HoundHeadMesh');

  const jaw = new THREE.Group();
  jaw.name = 'HoundJaw';
  jaw.position.set(-0.012, -0.058, 0);
  head.add(jaw);
  meshFor(V.jaw, M, jaw, 'HoundJawMesh');

  // ---- tail ----------------------------------------------------------------
  // rotation.y = PI points the chain backward, which means a POSITIVE
  // rotation.z on any link raises the tail — the sign the pose grammar wants.
  const tailSegs = [];
  let attach = g;
  for (let i = 0; i < V.tail.length; i++) {
    const seg = new THREE.Group();
    seg.name = `HoundTail${i}`;
    if (i === 0) seg.position.set(-0.660, 0.688, 0);
    else seg.position.set([0.19, 0.17, 0.15][i - 1], 0, 0);
    // Carried low off the croup, drooping, with a sabre flick at the tip —
    // the way a running wolf holds it, and the shape that stops the tail
    // reading as a rod continuing the topline.
    seg.userData.baseZ = [-0.30, -0.22, 0.20][i] ?? -0.2;
    seg.userData.baseY = i === 0 ? Math.PI : 0;
    seg.rotation.set(0, seg.userData.baseY, seg.userData.baseZ);
    attach.add(seg);
    meshFor(V.tail[i], M, seg, `HoundTailMesh${i}`);
    tailSegs.push(seg);
    attach = seg;
  }

  // ---- legs ----------------------------------------------------------------
  const legs = [], legChains = [];
  const LEGS = [
    [0.300, 0.775, 0.108, 1],
    [0.300, 0.775, -0.108, 1],
    [-0.415, 0.700, 0.102, 0],
    [-0.415, 0.700, -0.102, 0],
  ];
  for (const [lx, ly, lz, front] of LEGS) {
    const phase = front ? (lz > 0 ? 0 : Math.PI) : (lz > 0 ? Math.PI : 0);
    const hip = new THREE.Group(), knee = new THREE.Group(), paw = new THREE.Group();
    hip.name = `DirectorDogHip_${front ? 'F' : 'R'}_${lz > 0 ? 'L' : 'R'}`;
    knee.name = hip.name.replace('Hip', 'Knee');
    paw.name = hip.name.replace('Hip', 'Paw');
    hip.position.set(lx, ly, lz);
    knee.position.y = -UPPER_LEN;
    paw.position.y = -LOWER_LEN;
    const upper = meshFor(V.upper, M, hip, 'HoundUpper');
    const lower = meshFor(V.lower, M, knee, 'HoundLower');
    meshFor(V.paw, M, paw, 'HoundPaw');
    hip.add(knee);
    knee.add(paw);
    g.add(hip);
    // Front legs bend backward at the elbow, rear legs forward at the stifle.
    const baseUpper = front ? 0.26 : -0.34, baseLower = front ? -0.40 : 0.48;
    hip.rotation.z = baseUpper;
    knee.rotation.z = baseLower;
    legChains.push({
      hip, knee, paw, upper, lower,
      upperLen: UPPER_LEN, lowerLen: LOWER_LEN,
      phase, baseUpper, baseLower, front: !!front, side: lz > 0 ? 1 : -1,
    });
    legs.push({ mesh: hip, base: baseUpper, phase }, { mesh: knee, base: baseLower, phase: phase + 0.4 });
  }

  g.userData = {
    legs, legChains, head, jaw, neck, body,
    tail: tailSegs[0], tailSegs, detail,
    jawRestY: jaw.position.y,
    dog: true, directorRig: true, variant,
  };
  return g;
}

/**
 * Distance LOD.
 *
 * A hound is ~14 meshes, most of them casting shadows, and a dog round puts
 * eight of them on screen at once. The shadow pass is the expensive half, and
 * a hound past ~18 m contributes a shadow nobody can resolve — so the far tier
 * keeps the full silhouette (popping geometry would be far more visible than a
 * missing shadow) and drops shadow casting from everything except the torso.
 *
 * @param {THREE.Object3D} model
 * @param {number} d2 squared distance to the camera
 */
export function setHellhoundLOD(model, d2) {
  const tier = d2 < 330 ? 0 : d2 < 2000 ? 1 : 2;
  if (model.userData.lodTier === tier) return;
  model.userData.lodTier = tier;
  const u = model.userData;
  model.traverse((o) => { if (o.isMesh) o.castShadow = tier === 0; });
  if (u.body) u.body.traverse((o) => { if (o.isMesh) o.castShadow = tier < 2; });
  // Past ~45 m the last two tail links are a couple of pixels of noise.
  if (u.tailSegs) for (let i = 1; i < u.tailSegs.length; i++) u.tailSegs[i].visible = tier < 2;
}
