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
//
// The parts are built in js/render/HellhoundModel/. This file builds the five
// variants from them, rigs a hound and sets its LOD.
import * as THREE from 'three';
import { houndMaterials } from './HellhoundModel/materials.js';
import { buildTorso } from './HellhoundModel/body.js';
import { buildNeck, buildHead, buildJaw } from './HellhoundModel/head.js';
import { buildTailSeg, UPPER_LEN, LOWER_LEN, buildUpperLeg, buildLowerLeg, buildPaw } from './HellhoundModel/limbs.js';

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
