// Weapon definitions (real WWII-era firearms + sci-fi wonder weapons),
// Pack-a-Punch variants, detailed procedural view-models with reload animations.
import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';
import { PERK_DRINK_TIMELINE } from './gameplay-rules.js';
import { WM, matSet } from './render/WeaponMaterials.js';
import {
  mesh, bx, cyl, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, ringGeo, plateGeo, latheGeo,
  barrel, perfShroud, flashHider, compensator, muzzleCone, suppressor,
  frontSight, rearNotch as rearNotchSight, rearAperture as rearApertureSight, rearTangent,
  railRearSight, redDot, scope, ejectionPort, triggerGroup, magazine, rail, screw,
  slingLoop, chargingHandle, selector, bipod, FRONT_POST_H,
} from './render/WeaponParts.js';
import {
  buildHand, triggerHand, supportHand, foreGripHand, fistHand,
  crackFist, knifeHand, setHandPose, resetHandPose,
} from './render/WeaponHands.js';
import { WEAPONS, getStats } from './weapons/catalog.js';
import { buildMonkey } from './weapons/monkey.js';
import { buildPerkBottle, posePerkBottle } from './weapons/perk-bottle.js';
import {
  takesPbrFinish, wearsWeaponFinish, applyPapLivingFinish, advancePapLivingFinish, metalEnvTex,
  sparkleTex,
} from './weapons/finishes.js';
import { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';

export { WEAPONS, getStats, BOX_POOL, CASING_BY_SFX } from './weapons/catalog.js';
export { buildMonkey } from './weapons/monkey.js';
export { buildPerkBottle } from './weapons/perk-bottle.js';
export { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';

// ============================================================================
// View-model construction — detailed per-weapon silhouettes
// ============================================================================
// Shared, lazily-generated PBR library (see js/render/WeaponMaterials.js).
// `M` keeps its historical key names so the knife, fists and monkey prop below
// keep reading the way they always did.
const M = WM;

/** Side-profile plate in the ZY plane. Points are [z, y]; thickness runs on X. */
function profileZY(id, pts, thick, mat, x = 0, y = 0, z = 0, bevel = 0.0035) {
  const m = mesh(plateGeo(id, pts, thick, bevel), mat, x, y, z);
  m.rotation.y = -Math.PI / 2;
  return m;
}

/** Place an already-built sub-assembly. */
function at(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
}

/** Trigger hand on a pistol grip. Kept call-compatible with the old helper. */
function hand(x, y, z, rx = 0, rz = 0, opts) {
  return triggerHand(x, y, z, rx, { roll: rz, ...opts });
}

function redDotSight(y = 0.075, z = -0.1, mats = null) {
  const T = mats || matSet(false);
  return redDot(T.dark, WM.glass, WM.lens, WM.dot, { aimY: y, z, r: 0.019 });
}

// Returns group; animatable parts registered in group.userData.parts.
//
// AIM[id] is the AUTHORED local Y of the weapon's sight line. Every front post
// tip, rear notch floor, aperture centre and red-dot reticle below is placed on
// that one number, which is what makes the sight picture line up instead of
// merely looking close. WeaponRig drives ADS with
//   group.position.y = -(userData.sightY + 0.006)
// so whatever lands on the sight line lands on the camera's optical axis when
// fully aimed.
//
// It is the authored value and not the final one because the clearance pass at
// the end of buildViewmodel() lifts the whole sighting arrangement when the line
// does not clear the receiver it runs over — several of these were set below
// their own receiver tops. `userData.sightY` is the number that survived.
const AIM = {
  m1911: 0.077, magnum: 0.079, kar98: 0.064, gewehr43: 0.068, m1a1: 0.063, m1garand: 0.070,
  type100: 0.063, mp40: 0.059, thompson: 0.064, stg44: 0.082, fg42: 0.073, bar: 0.079,
  mg42: 0.096, browning: 0.100, ppsh: 0.063, trench: 0.066, dbshotgun: 0.060,
  ump45: 0.080, acr: 0.086, famas: 0.106, ak74u: 0.066, galil: 0.070, commando: 0.104,
  raygun: 0.082, dg2: 0.088, ptrs41: 0.084, mosin: 0.088, springfield: 0.088, panzerschreck: 0.130,
  bowie: 0.06, monkey: 0.06,
};

function rearNotch(y, z, mat, w = 0.032, mount = null) {
  return rearNotchSight(mat, { aimY: y, z, w, mount });
}
function rearAperture(y, z, mat) {
  return rearApertureSight(mat, { aimY: y, z });
}
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
const _aimBox = new THREE.Box3();
const _aimVec = new THREE.Vector3();
// The channel around the sight line that counts as "in your face" when aiming.
// Sized to the MIDDLE HALF of the ADS frame at ADS_FACE_CLEAR — the part of the
// screen you aim with. Something grazing the bottom edge of the frame is the
// gun you are looking over and always will be; something in the middle of it at
// the same distance is a wall. That distinction is the whole test: it lets a
// Kar98k's comb pass the lens at 3cm while stopping the Browning's carry handle
// and the Gewehr 43's receiver, which arrive at the same distance dead centre.
const ADS_FACE_HALF_H = 0.020;
const ADS_FACE_HALF_W = 0.047;
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

export function buildViewmodel(id, pap) {
  const s = getStats(id, pap);
  // getStats resolves an unknown id to the starting pistol; the geometry switch
  // below has no default case, so it has to switch on the RESOLVED id. Left on
  // the raw id it fell through every case and returned a group with no muzzle,
  // which equip() then dereferenced.
  id = s.id;
  const g = new THREE.Group();
  // Gloved hands live in a container that is NOT part of the returned tree.
  // Only WeaponRig.equip() re-attaches them; the mystery box and the
  // Pack-a-Punch display get the weapon alone, which is the whole point.
  const handsG = new THREE.Group();
  const T = matSet(pap);
  const ST = T.body;        // receivers, slides, frames
  const STD = T.dark;       // sights, small hardware, dark furniture
  const STL = T.bright;     // bolts, pins, machined bright parts
  const STM = T.matte;      // parkerised / phosphate
  const SH = T.sheet;       // stamped sheet steel
  const W = T.wood;
  const WD = T.woodDark;
  const CK = T.checker;     // checkered wood / stippled panels
  const GR = T.grip;        // bakelite & polymer grips
  const BR = T.brass;
  const A = AIM[id] ?? 0.08;
  let aimY = AIM[id] ?? 0.08;   // the sight line, after the clearance lift below
  const parts = {};
  const P = (name, mesh) => {
    parts[name] = mesh;
    (name === 'hand_r' || name === 'hand_l' ? handsG : g).add(mesh);
    return mesh;
  };
  let muzzleZ = -0.8;

  switch (id) {
    case 'm1911': {
      // Slide: real 1911 side profile with the dust-cover step and rounded nose.
      const slide = new THREE.Group();
      slide.add(profileZY('m1911_slide', [
        [0.072, 0.014], [0.072, 0.066], [0.048, 0.068], [-0.186, 0.068], [-0.214, 0.064],
        [-0.230, 0.052], [-0.230, 0.018], [-0.150, 0.014],
      ], 0.048, ST));
      for (let i = 0; i < 8; i++) {  // cocking serrations
        slide.add(mesh(bevelBoxGeo(0.0505, 0.034, 0.0032, 0.0008), STD, 0, 0.040, 0.062 - i * 0.0082));
      }
      slide.add(ejectionPort(ST, WM.cavity, { w: 0.05, h: 0.024, x: 0.0242, y: 0.048, z: -0.018, side: 1 }));
      slide.add(mesh(latheGeo('m1911_bushing', [
        [0.0072, -0.236], [0.0158, -0.236], [0.0168, -0.226], [0.0168, -0.208], [0.0140, -0.200],
      ], 18), STL, 0, 0.040, 0));
      slide.add(at(barrel(STL, { r: 0.0092, bore: 0.0056, len: 0.09, boreDepth: 0.05 }), 0, 0.040, -0.192));
      slide.add(mesh(cylGeo(0.0055, 0.0055, 0.20, 12), STL, 0, 0.020, -0.130, Math.PI / 2)); // recoil spring plug rod
      P('slide', slide);

      // Frame: dust cover, trigger bow, magwell, beavertail.
      P('frame', profileZY('m1911_frame', [
        [0.080, 0.030], [0.080, 0.052], [0.062, 0.056], [0.040, 0.020], [-0.006, 0.012],
        [-0.150, 0.012], [-0.150, -0.014], [-0.006, -0.018], [0.030, -0.020], [0.052, -0.010],
      ], 0.046, STM, 0, 0, 0));
      P('guard', at(triggerGroup(STM, { len: 0.062, drop: 0.034, thick: 0.012 }), 0, -0.014, -0.028));
      P('trigger', at(mesh(bevelBoxGeo(0.010, 0.026, 0.008, 0.0015), STL, 0, -0.030, -0.024), 0, -0.030, -0.024));

      // Grip frame raked back, with checkered walnut panels and a lanyard loop.
      const grip = new THREE.Group();
      grip.add(mesh(bevelBoxGeo(0.036, 0.112, 0.052, 0.009), STM, 0, 0, 0));
      // The grip frame runs on up INTO the frame. Raked back, the grip's top
      // stopped 7-13mm under the frame's belly, and the panels a good deal
      // lower, so the whole grip hung below the pistol.
      grip.add(mesh(bevelBoxGeo(0.036, 0.032, 0.050, 0.004), STM, 0, 0.066, 0));
      for (const sx of [1, -1]) {
        grip.add(mesh(bevelBoxGeo(0.0055, 0.112, 0.050, 0.004), CK, sx * 0.0195, 0.005, 0.001));
        grip.add(screw(STL, { r: 0.0035, x: sx * 0.0225, y: 0.026, z: 0.002, axis: 'x' }));
        grip.add(screw(STL, { r: 0.0035, x: sx * 0.0225, y: -0.030, z: 0.002, axis: 'x' }));
      }
      grip.add(mesh(bevelBoxGeo(0.038, 0.014, 0.058, 0.004), STM, 0, -0.062, 0));   // mainspring housing toe
      P('grip', at(grip, 0, -0.078, 0.044, -0.30));
      P('safety', at(mesh(bevelBoxGeo(0.006, 0.011, 0.028, 0.0015), STL, 0, 0, 0), 0.024, 0.020, 0.052, 0, 0, 0.25));
      P('slidestop', at(mesh(bevelBoxGeo(0.005, 0.010, 0.030, 0.0012), STL, 0, 0, 0), -0.024, 0.018, 0.006));

      const hammer = new THREE.Group();
      hammer.add(mesh(torusGeo(0.010, 0.0035, 5, 12), STM, 0, 0.010, 0));
      hammer.add(mesh(bevelBoxGeo(0.008, 0.018, 0.010, 0.002), STM, 0, -0.004, 0));
      P('hammer', at(hammer, 0, 0.050, 0.070, 0.25));

      P('mag', at(magazine(STL, STD, { w: 0.028, h: 0.100, d: 0.042, taper: 0.98, ribs: 0 }),
        0, -0.080, 0.042, -0.30));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.208, baseW: 0.016, baseH: 0.008, bladeW: 0.0055 }));
      P('sight_r', rearNotch(A, 0.044, STD, 0.024));
      P('hand_r', hand(0.014, -0.086, 0.050, -0.30));
      muzzleZ = -0.245;
      break;
    }
    case 'magnum': {
      P('barrel', at(barrel(ST, { r: 0.0135, bore: 0.0072, len: 0.30, boreDepth: 0.06 }), 0, 0.030, -0.190));
      P('barrel_rib', profileZY('magnum_rib', [
        [-0.040, 0.036], [-0.340, 0.036], [-0.340, 0.050], [-0.040, 0.052],
      ], 0.016, STD));
      for (let i = 0; i < 9; i++) {   // vent rib slots
        P('rib_v' + i, mesh(bevelBoxGeo(0.018, 0.004, 0.008, 0.0008), WM.cavity, 0, 0.049, -0.075 - i * 0.028));
      }
      // Back as far as the cylinder's front face, which is what an ejector rod
      // runs out of. It stopped 30mm short, with daylight under the barrel.
      P('ejector', at(mesh(latheGeo('magnum_ej', [
        [0.004, -0.16], [0.011, -0.16], [0.011, 0.052], [0.004, 0.052],
      ], 14), STD), 0, 0.012, -0.10));
      P('frame', profileZY('magnum_frame', [
        [0.078, 0.012], [0.078, 0.056], [0.030, 0.058], [-0.044, 0.050], [-0.044, -0.008],
        [0.010, -0.020], [0.050, -0.014],
      ], 0.046, ST));
      const cylr = new THREE.Group();
      cylr.add(mesh(cylGeo(0.0335, 0.0335, 0.072, 20), STL, 0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 6; i++) {   // fluted chambers, actually hollow
        const a = (i / 6) * Math.PI * 2;
        cylr.add(mesh(cylGeo(0.0058, 0.0058, 0.076, 8), WM.bore,
          Math.cos(a) * 0.0215, Math.sin(a) * 0.0215, 0, Math.PI / 2));
        cylr.add(mesh(bevelBoxGeo(0.008, 0.004, 0.052, 0.0008), WM.cavity,
          Math.cos(a + 0.52) * 0.032, Math.sin(a + 0.52) * 0.032, 0, 0, 0, a + 0.52));
      }
      P('cylinder', at(cylr, 0, 0.014, -0.014));
      P('crane', at(mesh(bevelBoxGeo(0.010, 0.028, 0.030, 0.003), ST, 0, 0, 0), -0.026, 0.014, -0.052));
      const grip = new THREE.Group();
      grip.add(mesh(bevelBoxGeo(0.042, 0.116, 0.070, 0.014), W, 0, 0, 0));
      grip.add(mesh(bevelBoxGeo(0.045, 0.070, 0.048, 0.010), CK, 0, -0.010, -0.004));
      // Backstrap up into the frame. The grip panels alone stopped ~20mm short
      // of it and the whole grip hung under the revolver.
      grip.add(mesh(bevelBoxGeo(0.036, 0.036, 0.056, 0.005), ST, 0, 0.066, 0.004));
      P('grip', at(grip, 0, -0.086, 0.056, -0.30));
      P('guard', at(triggerGroup(ST, { len: 0.066, drop: 0.038, thick: 0.013 }), 0, -0.008, -0.022));
      P('trigger', at(mesh(bevelBoxGeo(0.008, 0.030, 0.010, 0.0015), STL, 0, 0, 0), 0, -0.026, -0.018));
      const hammer = new THREE.Group();
      hammer.add(mesh(bevelBoxGeo(0.010, 0.030, 0.014, 0.003), ST, 0, 0, 0));
      hammer.add(mesh(bevelBoxGeo(0.016, 0.008, 0.016, 0.002), STD, 0, 0.016, 0.006)); // spur
      P('hammer', at(hammer, 0, 0.052, 0.062, 0.22));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.330, ears: 'none', baseW: 0.016, baseH: 0.008, bladeW: 0.005, mount: 0.051, band: 0 }));
      P('sight_r', rearNotch(A, 0.040, STD, 0.026, 0.055));
      P('hand_r', hand(0.014, -0.092, 0.062, -0.30));
      muzzleZ = -0.345;
      break;
    }
    case 'mp40': {
      // Tube receiver + stamped magazine housing + folding stock.
      P('receiver', at(mesh(latheGeo('mp40_rcv', [
        [0.0, 0.20], [0.026, 0.20], [0.026, -0.14], [0.023, -0.16], [0.023, -0.20], [0.0, -0.20],
      ], 20), ST), 0, 0.020, -0.24));
      for (let i = 0; i < 3; i++) {  // receiver ribs
        P('rcv_rib' + i, at(mesh(torusGeo(0.0265, 0.0022, 5, 20), STD), 0, 0.020, -0.10 - i * 0.09));
      }
      P('barrel', at(barrel(STD, { r: 0.0122, bore: 0.0062, len: 0.20, boreDepth: 0.055 }), 0, 0.020, -0.545));
      P('barrel_nut', at(mesh(latheGeo('mp40_nut', [
        [0.012, -0.03], [0.023, -0.03], [0.024, -0.018], [0.024, 0.018], [0.020, 0.028], [0.012, 0.028],
      ], 18), STL), 0, 0.020, -0.462));
      P('resting_bar', at(mesh(cylGeo(0.010, 0.010, 0.030, 12), STD, 0, 0, 0), 0, -0.002, -0.510, Math.PI / 2));
      P('housing', profileZY('mp40_house', [
        [0.100, -0.046], [0.100, 0.046], [-0.070, 0.046], [-0.096, 0.030], [-0.096, -0.030], [-0.062, -0.046],
      ], 0.046, SH, 0, -0.010, 0));
      P('magwell', at(mesh(latheGeo('mp40_well', [
        [0.020, -0.03], [0.030, -0.03], [0.030, 0.03], [0.020, 0.03],
      ], 14), SH), 0, -0.060, -0.150, Math.PI / 2 - 0.06));
      P('mag', at(magazine(SH, STD, { w: 0.030, h: 0.185, d: 0.046, taper: 0.96, ribs: 2 }),
        0, -0.076, -0.156, 0.06));
      const grip = new THREE.Group();
      grip.add(mesh(bevelBoxGeo(0.036, 0.098, 0.052, 0.010), GR, 0, 0, 0));
      grip.add(mesh(bevelBoxGeo(0.038, 0.030, 0.054, 0.008), GR, 0, -0.034, 0.002));
      P('grip', at(grip, 0, -0.092, 0.078, -0.24));
      P('panel_l', mesh(bevelBoxGeo(0.010, 0.048, 0.150, 0.004), GR, 0.026, -0.032, -0.110));
      P('panel_r', mesh(bevelBoxGeo(0.010, 0.048, 0.150, 0.004), GR, -0.026, -0.032, -0.110));
      P('guard', at(triggerGroup(SH, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, -0.038, -0.018));
      P('trigger', at(mesh(bevelBoxGeo(0.008, 0.024, 0.008, 0.0012), STL, 0, 0, 0), 0, -0.052, -0.016));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.028, y: 0.032, z: -0.150, len: 0.05, knob: 0.010 }));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.045, h: 0.020, x: 0.026, y: 0.028, z: -0.075, side: -1 }));
      // folding stock: two struts, a hinge and a shoulder plate
      P('stock_t', mesh(bevelBoxGeo(0.010, 0.016, 0.28, 0.003), STD, 0, 0.006, 0.230));
      P('stock_b', mesh(bevelBoxGeo(0.010, 0.016, 0.28, 0.003), STD, 0, -0.048, 0.230));
      P('stock_hinge', at(mesh(cylGeo(0.014, 0.014, 0.040, 12), STD, 0, 0, 0), 0, -0.020, 0.096, 0, 0, Math.PI / 2));
      P('stock_end', profileZY('mp40_butt', [
        [0.360, -0.034], [0.398, -0.030], [0.398, 0.026], [0.360, 0.022],
      ], 0.040, STD, 0, -0.010, 0));
      P('sling_f', slingLoop(STD, { r: 0.009, x: -0.026, y: 0.006, z: -0.44, ry: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.500, ears: 'wings', baseW: 0.024, baseH: 0.010 }));
      P('sight_r', rearAperture(A, -0.018, STD));   // peep ring, not an open notch
      P('hand_r', hand(0.014, -0.100, 0.082, -0.24));
      P('hand_l', foreGripHand(0.004, -0.080, -0.156, 0.06, { curl: 0.85 }));
      muzzleZ = -0.648;
      break;
    }
    case 'thompson': {
      P('receiver', profileZY('tommy_rcv', [
        [0.115, -0.030], [0.115, 0.040], [0.060, 0.048], [-0.140, 0.048],
        [-0.190, 0.038], [-0.190, -0.012], [-0.060, -0.030],
      ], 0.052, ST, 0, 0.012, 0));
      P('receiver_top', mesh(bevelBoxGeo(0.030, 0.010, 0.28, 0.003), STD, 0, 0.062, -0.040));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.05, h: 0.024, x: 0.0265, y: 0.032, z: -0.030, side: 1 }));
      // finned barrel: real machined cooling fins
      P('barrel', at(barrel(STD, { r: 0.0145, bore: 0.0072, len: 0.30, boreDepth: 0.06 }), 0, 0.022, -0.340));
      for (let i = 0; i < 11; i++) {
        P('fin' + i, at(mesh(cylGeo(0.0225, 0.0225, 0.008, 18), STL, 0, 0, 0), 0, 0.022, -0.250 - i * 0.019, Math.PI / 2));
      }
      P('comp', at(muzzleCone(STL, { r: 0.015, r2: 0.026, len: 0.05, bore: 0.0072 }), 0, 0.022, -0.505));
      for (let i = 0; i < 4; i++) {  // Cutts compensator slots
        P('comp_slot' + i, mesh(bevelBoxGeo(0.020, 0.010, 0.006, 0.0006), WM.cavity, 0, 0.041, -0.520 + i * 0.010));
      }
      // 50-round drum with a wind key
      const drum = new THREE.Group();
      drum.add(mesh(latheGeo('tommy_drum', [
        [0.0, 0.024], [0.062, 0.024], [0.070, 0.016], [0.070, -0.016], [0.062, -0.024], [0.0, -0.024],
      ], 24), SH, 0, 0, 0, Math.PI / 2));
      // The drum's axis is THIS group's Y (weapon X once it is stood on edge
      // below), so its face rings lie flat in XZ and the key runs along Y. They
      // were laid out along Z: the ring stood a quarter-turn off the face, a hoop
      // through the drum and out both sides of the receiver, and the key and its
      // wing were buried inside the drum.
      for (const fy of [0.023, -0.023]) drum.add(mesh(torusGeo(0.050, 0.005, 5, 20), STD, 0, fy, 0, Math.PI / 2));
      // Wind key, SEATED in the drum face. It used to stand 13mm proud of it.
      drum.add(mesh(cylGeo(0.014, 0.012, 0.056, 12), STD, 0, 0.006, 0));
      drum.add(mesh(bevelBoxGeo(0.030, 0.010, 0.006, 0.001), STL, 0, 0.032, 0));
      // Forward of the trigger guard, where a Thompson's drum slides in. At
      // z -0.055 the guard's front strut ran straight through it.
      P('mag', at(drum, 0, -0.078, -0.095, 0, 0, Math.PI / 2));
      // Wooden forend. It is CARRIED on a yoke that reaches up to the finned
      // barrel — the way a Thompson's forend is bolted to the frame — instead
      // of hanging 22mm below the gun with nothing joining it. That gap, plus
      // its five ring grooves and the sling swivel under it, is what the asset
      // archive showed as half a dozen loose red-brown blocks and thin slabs
      // floating under the receiver.
      P('grip_f', at((() => {
        const fg = new THREE.Group();
        fg.add(mesh(latheGeo('tommy_fg', [
          [0.020, -0.048], [0.026, -0.040], [0.024, 0.010], [0.028, 0.036], [0.022, 0.050],
        ], 16), W));
        for (let i = 0; i < 5; i++) fg.add(mesh(torusGeo(0.0265, 0.0026, 5, 16), WD, 0, 0, -0.032 + i * 0.018));
        for (const zz of [-0.032, 0.030]) {
          fg.add(mesh(bevelBoxGeo(0.020, 0.040, 0.014, 0.002), STD, 0, 0.044, zz));
        }
        return fg;
      })(), 0, -0.056, -0.240, 0.12));
      P('grip_r', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.040, 0.100, 0.056, 0.012), W, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.043, 0.052, 0.050, 0.008), CK, 0, -0.014, 0));
        gr.add(mesh(bevelBoxGeo(0.034, 0.028, 0.048, 0.003), W, 0, 0.060, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.092, 0.062, -0.26));
      P('stock', profileZY('tommy_stock', [
        [0.115, -0.034], [0.150, -0.044], [0.330, -0.060], [0.352, -0.052], [0.352, 0.028],
        [0.300, 0.028], [0.180, 0.008], [0.120, 0.010],
      ], 0.046, W, 0, 0, 0));
      P('butt', profileZY('tommy_butt', [
        [0.348, -0.056], [0.372, -0.052], [0.372, 0.026], [0.348, 0.028],
      ], 0.048, STD, 0, 0, 0));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.034, thick: 0.012 }), 0, -0.030, -0.010));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0, y: 0.066, z: -0.040, len: 0.045, knob: 0.010 }));
      P('sling_f', slingLoop(STD, { r: 0.009, x: 0, y: -0.076, z: -0.240, rx: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.480, ears: 'wings', baseW: 0.022, baseH: 0.010 }));
      P('sight_r', rearNotch(A, 0.056, STD, 0.026));  // Thompson: open notch, no peep
      P('hand_r', hand(0.014, -0.100, 0.064, -0.26));
      P('hand_l', foreGripHand(0.004, -0.086, -0.240, 0.12, { curl: 0.95 }));
      muzzleZ = -0.532;
      break;
    }
    case 'ppsh': {
      P('receiver', at(mesh(latheGeo('ppsh_rcv', [
        [0.0, 0.18], [0.026, 0.18], [0.026, -0.16], [0.0, -0.16],
      ], 20), ST), 0, 0.020, -0.16));
      P('barrel', at(barrel(STD, { r: 0.0115, bore: 0.0062, len: 0.26, boreDepth: 0.055 }), 0, 0.020, -0.470));
      // slotted cooling jacket / muzzle brake — the PPSh signature
      P('jacket', at(perfShroud(SH, { r: 0.024, len: 0.30, rows: 5, holes: 7, holeW: 0.4, band: 0.42 }), 0, 0.020, -0.430));
      P('brake', at((() => {
        const b = new THREE.Group();
        b.add(mesh(plateGeo('ppsh_brake', [
          [-0.024, 0.026], [0.024, 0.026], [0.030, 0.006], [0.030, -0.028], [-0.030, -0.028], [-0.030, 0.006],
        ], 0.048, 0.003), SH, 0, 0, 0));
        for (let i = 0; i < 3; i++) {
          b.add(mesh(bevelBoxGeo(0.030, 0.004, 0.010, 0.0008), WM.cavity, 0, 0.024, -0.012 + i * 0.012));
        }
        return b;
      })(), 0, 0.024, -0.560));
      P('drum', at((() => {
        const d = new THREE.Group();
        d.add(mesh(latheGeo('ppsh_drum', [
          [0.0, 0.026], [0.074, 0.026], [0.083, 0.016], [0.083, -0.016], [0.074, -0.026], [0.0, -0.026],
        ], 26), SH, 0, 0, 0, Math.PI / 2));
        // Same frame as the Thompson's drum: the axis is this group's Y, and
        // weapon "up" is its +X. Both rings stood a quarter-turn off the face
        // and the latch block sat 76mm out to one side of the gun.
        d.add(mesh(torusGeo(0.060, 0.005, 5, 22), STD, 0, 0.025, 0, Math.PI / 2));
        d.add(mesh(torusGeo(0.034, 0.005, 5, 18), STD, 0, 0.025, 0, Math.PI / 2));
        // Wind spindle, run THROUGH the drum rather than perched on its face.
        d.add(mesh(cylGeo(0.013, 0.011, 0.060, 12), STD, 0, 0.006, 0));
        d.add(mesh(bevelBoxGeo(0.032, 0.026, 0.030, 0.004), SH, 0.076, 0, 0));
        return d;
      })(), 0, -0.088, -0.120, 0, 0, Math.PI / 2));
      // One-piece stock. It runs forward under the trigger group to the
      // magwell, as a PPSh's does; it used to start 56mm behind the receiver
      // and hang in the air on its own.
      P('stock', profileZY('ppsh_stock', [
        [-0.030, -0.046], [0.080, -0.052], [0.130, -0.062], [0.370, -0.076], [0.400, -0.066], [0.400, 0.030],
        [0.320, 0.024], [0.170, 0.000], [0.090, 0.006], [-0.030, 0.012],
      ], 0.048, W, 0, 0, 0));
      P('butt', profileZY('ppsh_butt', [
        [0.396, -0.072], [0.418, -0.066], [0.418, 0.026], [0.396, 0.030],
      ], 0.050, STD, 0, 0, 0));
      P('forend', profileZY('ppsh_fore', [
        [-0.170, -0.030], [-0.360, -0.024], [-0.360, 0.006], [-0.170, 0.012],
      ], 0.052, W, 0, 0, 0));
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, -0.034, -0.006));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.026, y: 0.026, z: -0.060, len: 0.05, knob: 0.010 }));
      P('hinge', at(mesh(cylGeo(0.008, 0.008, 0.048, 12), STD, 0, 0, 0), 0, 0.028, -0.318, 0, 0, Math.PI / 2));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.545, ears: 'hood', baseW: 0.024, baseH: 0.010 }));
      P('sight_r', rearAperture(A, -0.030, STD));   // peep ring
      P('hand_r', hand(0.014, -0.104, 0.070, -0.26));
      P('hand_l', supportHand(0.000, -0.048, -0.270, { pitch: 0.06 }));
      muzzleZ = -0.590;
      break;
    }
    case 'type100': {
      P('receiver', profileZY('t100_rcv', [
        [0.145, -0.028], [0.145, 0.036], [-0.130, 0.040], [-0.160, 0.030], [-0.160, -0.014], [-0.080, -0.028],
      ], 0.046, ST, 0, 0.014, 0));
      P('jacket', at(perfShroud(SH, { r: 0.023, len: 0.34, rows: 5, holes: 6, holeW: 0.36, band: 0.46 }), 0, 0.028, -0.400));
      P('barrel', at(barrel(STD, { r: 0.0112, bore: 0.006, len: 0.24, boreDepth: 0.05 }), 0, 0.028, -0.560));
      P('jacket_tip', at(mesh(latheGeo('t100_tip', [
        [0.012, -0.02], [0.023, -0.02], [0.024, -0.008], [0.024, 0.016], [0.020, 0.024], [0.012, 0.024],
      ], 16), STL), 0, 0.028, -0.580));
      // Straight down its magwell. A 0.3rad roll swung the bottom of it 44mm
      // out past the right side of the receiver.
      P('mag', at(magazine(SH, STD, { w: 0.030, h: 0.150, d: 0.048, curve: 0.16, taper: 0.94, ribs: 2 }),
        0.004, -0.036, -0.100, 0.22));
      P('magwell', at(mesh(bevelBoxGeo(0.038, 0.030, 0.056, 0.005), SH, 0, 0, 0), 0.002, -0.026, -0.096, 0.22));
      P('stock', profileZY('t100_stock', [
        [0.130, -0.048], [0.180, -0.060], [0.360, -0.076], [0.388, -0.066], [0.388, 0.026],
        [0.300, 0.022], [0.170, 0.002], [0.135, 0.010],
      ], 0.046, W, 0, 0, 0));
      P('butt', profileZY('t100_butt', [
        [0.384, -0.072], [0.406, -0.066], [0.406, 0.022], [0.384, 0.026],
      ], 0.048, STD, 0, 0, 0));
      P('forend', profileZY('t100_fore', [
        [-0.150, -0.026], [-0.330, -0.020], [-0.330, 0.010], [-0.150, 0.016],
      ], 0.050, W, 0, 0, 0));
      // Wooden grip: it is carved out of the stock, so it starts at the stock's
      // underside rather than hovering 20mm below it.
      P('grip', at(mesh(bevelBoxGeo(0.038, 0.116, 0.052, 0.012), W, 0, 0, 0), 0, -0.068, 0.088, -0.24));
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, -0.030, 0.000));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.026, y: 0.026, z: -0.060, len: 0.05, knob: 0.010 }));
      P('bayonet_lug', mesh(bevelBoxGeo(0.010, 0.020, 0.050, 0.002), STD, 0.020, 0.006, -0.585));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.575, ears: 'wings', baseW: 0.022, baseH: 0.010 }));
      P('sight_r', rearNotch(A, -0.010, STD, 0.026));
      P('hand_r', hand(0.014, -0.096, 0.090, -0.24));
      P('hand_l', supportHand(0.000, -0.038, -0.260, { pitch: 0.06 }));
      muzzleZ = -0.680;
      break;
    }
    case 'ump45': {
      P('receiver', profileZY('ump_rcv', [
        [0.115, -0.034], [0.115, 0.042], [-0.150, 0.042], [-0.200, 0.030], [-0.200, -0.012], [-0.060, -0.034],
      ], 0.048, T.poly, 0, 0.010, 0));
      P('receiver_top', at(rail(STD, { len: 0.30, w: 0.021, h: 0.008, slots: 10 }), 0, 0.056, -0.070));
      P('ejection', ejectionPort(T.poly, WM.cavity, { w: 0.05, h: 0.024, x: 0.0248, y: 0.030, z: -0.060, side: 1 }));
      P('handguard', profileZY('ump_hg', [
        [-0.150, -0.030], [-0.320, -0.024], [-0.320, 0.026], [-0.150, 0.030],
      ], 0.048, T.poly, 0, 0.006, 0));
      for (let i = 0; i < 4; i++) {
        P('hg_v' + i, mesh(bevelBoxGeo(0.050, 0.006, 0.014, 0.001), WM.cavity, 0, -0.014, -0.190 - i * 0.036));
      }
      P('barrel', at(barrel(STD, { r: 0.0115, bore: 0.006, len: 0.14, boreDepth: 0.05 }), 0, 0.016, -0.360));
      P('suppressor_hint', at(suppressor(STD, { r: 0.020, len: 0.10, bore: 0.006, rings: 3 }), 0, 0.016, -0.430));
      P('mag', at(magazine(T.poly, STD, { w: 0.032, h: 0.180, d: 0.052, curve: 0.10, taper: 0.96, ribs: 3 }),
        0, -0.058, -0.100, 0.05));
      // The magazine has to go INTO something. Without a well it hung 10mm
      // clear of the receiver.
      P('magwell', at(mesh(bevelBoxGeo(0.042, 0.036, 0.060, 0.005), T.poly, 0, 0, 0), 0, -0.030, -0.098, 0.05));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.096, 0.050, 0.010), T.poly, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.038, 0.062, 0.046, 0.006), WM.grip, 0, -0.010, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), T.poly, 0, 0.058, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.086, 0.056, -0.26));
      P('guard', at(triggerGroup(T.poly, { len: 0.062, drop: 0.036, thick: 0.013 }), 0, -0.032, 0.006));
      P('stock_t', mesh(bevelBoxGeo(0.010, 0.020, 0.20, 0.003), STD, 0, 0.014, 0.196));
      P('stock_hinge', at(mesh(cylGeo(0.013, 0.013, 0.040, 12), STD, 0, 0, 0), 0, 0.014, 0.104, 0, 0, Math.PI / 2));
      P('stock_end', profileZY('ump_butt', [
        [0.290, -0.024], [0.320, -0.020], [0.320, 0.044], [0.290, 0.040],
      ], 0.040, T.poly, 0, 0, 0));
      P('charge', chargingHandle(STL, WM.cavity, { x: -0.026, y: 0.030, z: -0.130, len: 0.05, knob: 0.010 }));
      P('selector', selector(STL, { x: 0.024, y: -0.014, z: 0.020 }));
      P('sight_f', frontSight(STD, { aimY: A - 0.014, z: -0.290, ears: 'wings', baseW: 0.020, baseH: 0.008, mount: 0.031 }));
      P('sight_r', railRearSight(STD, { aimY: A - 0.014, z: 0.030 }));
      P('reddot', redDotSight(A, -0.100, T));
      P('hand_r', hand(0.014, -0.094, 0.062, -0.26));
      P('hand_l', supportHand(0.000, -0.040, -0.240, { pitch: 0.04 }));
      muzzleZ = -0.485;
      break;
    }
    case 'ak74u': {
      P('receiver', profileZY('ak74u_rcv', [
        [0.110, -0.030], [0.110, 0.040], [-0.110, 0.040], [-0.150, 0.028], [-0.150, -0.014], [-0.050, -0.030],
      ], 0.046, SH, 0, 0.012, 0));
      P('dustcover', profileZY('ak74u_cover', [
        [0.100, 0.038], [0.100, 0.056], [-0.120, 0.052], [-0.120, 0.036],
      ], 0.044, SH, 0, 0.006, 0));
      for (let i = 0; i < 6; i++) {
        P('cover_rib' + i, mesh(bevelBoxGeo(0.046, 0.005, 0.006, 0.001), STD, 0, 0.062, 0.080 - i * 0.032));
      }
      P('ejection', ejectionPort(SH, WM.cavity, { w: 0.048, h: 0.022, x: 0.024, y: 0.032, z: -0.030, side: 1 }));
      P('barrel', at(barrel(STD, { r: 0.0105, bore: 0.0058, len: 0.16, boreDepth: 0.05 }), 0, 0.020, -0.310));
      P('gasblock', at(mesh(bevelBoxGeo(0.026, 0.036, 0.036, 0.004), STD, 0, 0, 0), 0, 0.032, -0.250));
      P('gastube', at(mesh(cylGeo(0.011, 0.011, 0.14, 14), STD, 0, 0, 0), 0, 0.040, -0.190, Math.PI / 2));
      P('brake', at((() => {
        const b = new THREE.Group();
        b.add(mesh(latheGeo('ak74u_boost', [
          [0.006, -0.052], [0.020, -0.052], [0.022, -0.040], [0.022, 0.016], [0.016, 0.026], [0.010, 0.026],
        ], 18), STD));
        b.add(mesh(cylGeo(0.006, 0.006, 0.08, 12, true), WM.bore, 0, 0, 0, Math.PI / 2));
        b.add(mesh(cylGeo(0.006, 0.006, 0.002, 12), WM.bore, 0, 0, 0.02, Math.PI / 2));
        b.add(mesh(torusGeo(0.021, 0.003, 5, 16), STL, 0, 0, -0.012));
        return b;
      })(), 0, 0.020, -0.418));
      P('handguard', at((() => {
        const h = new THREE.Group();
        h.add(mesh(bevelBoxGeo(0.048, 0.044, 0.150, 0.008), WD, 0, 0, 0));
        for (const sx of [1, -1]) {
          for (let i = 0; i < 3; i++) {
            h.add(mesh(bevelBoxGeo(0.006, 0.010, 0.100, 0.0015), WM.cavity, sx * 0.024, -0.006 + i * 0.012, 0));
          }
        }
        return h;
      })(), 0, 0.004, -0.220));
      P('mag', at(magazine(GR, STD, { w: 0.038, h: 0.150, d: 0.052, curve: 0.30, taper: 0.94, ribs: 3 }),
        0, -0.040, -0.090, 0.24));
      P('magwell', at(mesh(bevelBoxGeo(0.046, 0.032, 0.060, 0.005), SH, 0, 0, 0), 0, -0.024, -0.086, 0.24));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.096, 0.050, 0.010), GR, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.060, 0.046, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), GR, 0, 0.058, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.088, 0.056, -0.26));
      P('guard', at(triggerGroup(SH, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, -0.034, 0.004));
      P('selector', at(mesh(plateGeo('ak_sel', [
        [-0.006, 0.030], [0.010, 0.030], [0.010, -0.030], [-0.006, -0.030], [-0.014, 0.006],
      ], 0.005, 0.001), SH), 0.026, 0.018, 0.030, 0, Math.PI / 2, 0));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.026, y: 0.038, z: -0.062, len: 0.05, knob: 0.010 }));
      // side-folding stock
      P('stock_t', mesh(bevelBoxGeo(0.010, 0.048, 0.18, 0.003), SH, -0.010, 0.006, 0.190));
      P('stock_pad', profileZY('ak74u_pad', [
        [0.272, -0.024], [0.296, -0.020], [0.296, 0.042], [0.272, 0.038],
      ], 0.038, STD, -0.010, 0, 0));
      P('sight_f', frontSight(STD, { aimY: A - 0.012, z: -0.262, ears: 'ring', post: 'round', baseW: 0.024, baseH: 0.012 }));
      P('sight_r', railRearSight(STD, { aimY: A - 0.012, z: -0.010 }));
      P('reddot', redDotSight(A, -0.070, T));
      P('hand_r', hand(0.014, -0.096, 0.062, -0.26));
      P('hand_l', supportHand(0.000, -0.030, -0.220, { pitch: 0.04 }));
      muzzleZ = -0.470;
      break;
    }
    case 'kar98': {
      P('stock', profileZY('kar98_stock', [
        [-0.300, -0.040], [-0.300, 0.014], [-0.060, 0.020], [0.060, 0.016], [0.140, 0.006],
        [0.230, 0.010], [0.400, 0.028], [0.500, 0.026], [0.500, -0.058], [0.470, -0.070],
        [0.360, -0.062], [0.250, -0.050], [0.150, -0.046], [0.095, -0.036], [-0.060, -0.034],
      ], 0.052, W, 0, 0, 0, 0.005));
      P('butt', profileZY('kar98_butt', [
        [0.496, -0.064], [0.522, -0.058], [0.522, 0.024], [0.496, 0.026],
      ], 0.054, STD, 0, 0, 0));
      P('forend', profileZY('kar98_fore', [
        [-0.290, -0.024], [-0.560, -0.018], [-0.600, -0.008], [-0.600, 0.014], [-0.560, 0.020], [-0.290, 0.022],
      ], 0.050, W, 0, 0.004, 0));
      P('handguard', profileZY('kar98_hg', [
        [-0.200, 0.024], [-0.560, 0.020], [-0.560, 0.044], [-0.200, 0.048],
      ], 0.044, W, 0, 0, 0));
      P('barrel', at(barrel(ST, { r: 0.0122, bore: 0.0058, len: 0.52, boreDepth: 0.06 }), 0, 0.030, -0.620));
      P('receiver', at(mesh(latheGeo('kar98_rcv', [
        [0.0, 0.120], [0.0245, 0.120], [0.0245, -0.030], [0.020, -0.060], [0.020, -0.120], [0.0, -0.120],
      ], 20), ST), 0, 0.030, -0.070));
      P('rcv_flat', mesh(bevelBoxGeo(0.030, 0.018, 0.20, 0.003), ST, 0, 0.038, -0.060));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.06, h: 0.026, x: 0.023, y: 0.036, z: -0.060, side: 1 }));
      // straight-pull bolt: shroud, body, and the classic bent-down handle
      const bolt = new THREE.Group();
      bolt.add(mesh(cylGeo(0.0125, 0.0125, 0.12, 14), STL, 0, 0, 0, Math.PI / 2));
      bolt.add(mesh(latheGeo('kar98_shroud', [
        [0.006, 0.052], [0.014, 0.052], [0.016, 0.040], [0.016, -0.006], [0.012, -0.014],
      ], 14), STD));
      P('bolt', at(bolt, 0, 0.036, 0.010));
      const knob = new THREE.Group();
      knob.add(mesh(bevelBoxGeo(0.010, 0.010, 0.046, 0.002), STL, 0, 0, -0.014, 0.55));
      knob.add(mesh(sphereGeo(0.0125, 10, 8), STL, 0, -0.024, -0.030));
      P('bolt_knob', at(knob, 0.024, 0.032, -0.006));
      // Ahead of the trigger guard, like the Mosin's: the guard hangs at z 0.015
      // to 0.089, and a magazine spanning -0.020 to 0.090 had swallowed it whole.
      P('mag', profileZY('kar98_mag', [
        [-0.130, -0.024], [-0.130, -0.070], [-0.050, -0.076], [-0.020, -0.062], [-0.020, -0.022],
      ], 0.044, ST, 0, 0, 0));
      P('floorplate', mesh(bevelBoxGeo(0.046, 0.008, 0.086, 0.002), STD, 0, -0.078, -0.078));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.030, thick: 0.012 }), 0, -0.024, 0.052));
      P('band1', at((() => {
        const b = new THREE.Group();
        b.add(mesh(latheGeo('kar98_band', [
          [0.026, -0.010], [0.030, -0.010], [0.030, 0.010], [0.026, 0.010],
        ], 18), STD));
        b.add(mesh(bevelBoxGeo(0.010, 0.012, 0.022, 0.0015), STD, 0, -0.030, 0));
        return b;
      })(), 0, 0.012, -0.320));
      P('band2', at(mesh(latheGeo('kar98_band2', [
        [0.026, -0.012], [0.031, -0.012], [0.031, 0.012], [0.026, 0.012],
      ], 18), STD), 0, 0.012, -0.545));
      P('nosecap', at(mesh(bevelBoxGeo(0.048, 0.048, 0.050, 0.004), STD, 0, 0, 0), 0, 0.016, -0.600));
      P('bayolug', mesh(bevelBoxGeo(0.012, 0.020, 0.044, 0.002), STD, 0, -0.008, -0.640));
      P('cleaningrod', at(mesh(cylGeo(0.0035, 0.0035, 0.22, 8), STL, 0, 0, 0), 0, -0.018, -0.520, Math.PI / 2));
      P('sling_r', slingLoop(STD, { r: 0.009, x: -0.028, y: -0.024, z: 0.280, ry: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.845, ears: 'hood', baseW: 0.024, baseH: 0.012, post: 'blade' }));
      P('sight_r', rearTangent(STD, { aimY: A, z: -0.200, w: 0.028, len: 0.075 }));
      P('hand_r', hand(0.016, -0.070, 0.098, -0.30, 0, { curl: 0.9 }));
      P('hand_l', supportHand(0.000, -0.028, -0.420, { pitch: 0.05 }));
      muzzleZ = -0.882;
      break;
    }
    case 'gewehr43': {
      P('stock', profileZY('g43_stock', [
        [-0.230, -0.040], [-0.230, 0.016], [-0.040, 0.020], [0.060, 0.014], [0.130, 0.004],
        [0.200, 0.010], [0.330, 0.028], [0.430, 0.026], [0.430, -0.052],
        [0.400, -0.064], [0.280, -0.052], [0.160, -0.044], [0.100, -0.036], [-0.040, -0.036],
      ], 0.050, W, 0, 0, 0, 0.005));
      P('butt', profileZY('g43_butt', [
        [0.426, -0.058], [0.452, -0.052], [0.452, 0.024], [0.426, 0.026],
      ], 0.052, STD, 0, 0, 0));
      P('forend', profileZY('g43_fore', [
        [-0.220, -0.022], [-0.520, -0.014], [-0.550, -0.004], [-0.550, 0.016], [-0.220, 0.022],
      ], 0.048, W, 0, 0.004, 0));
      P('receiver', profileZY('g43_rcv', [
        [0.070, -0.012], [0.070, 0.048], [-0.190, 0.048], [-0.215, 0.036], [-0.215, -0.010],
      ], 0.046, ST, 0, 0.028, 0));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.058, h: 0.026, x: 0.0235, y: 0.058, z: -0.060, side: 1 }));
      P('barrel', at(barrel(ST, { r: 0.0118, bore: 0.0058, len: 0.40, boreDepth: 0.06 }), 0, 0.030, -0.610));
      P('gastube', at(mesh(cylGeo(0.013, 0.013, 0.34, 14), STD, 0, 0, 0), 0, 0.052, -0.530, Math.PI / 2));
      P('gasblock', at(mesh(bevelBoxGeo(0.028, 0.044, 0.050, 0.004), STD, 0, 0, 0), 0, 0.044, -0.720));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.026, y: 0.044, z: -0.140, len: 0.06, knob: 0.011 }));
      P('mag', at(magazine(ST, STD, { w: 0.034, h: 0.098, d: 0.062, taper: 0.96, ribs: 2 }),
        0, -0.036, -0.050, 0.10));
      P('guard', at(triggerGroup(ST, { len: 0.062, drop: 0.032, thick: 0.012 }), 0, -0.014, 0.050));
      P('handguard', profileZY('g43_hg', [
        [-0.240, 0.026], [-0.520, 0.020], [-0.520, 0.046], [-0.240, 0.052],
      ], 0.042, W, 0, 0, 0));
      P('band', at(mesh(latheGeo('g43_band', [
        [0.026, -0.012], [0.031, -0.012], [0.031, 0.012], [0.026, 0.012],
      ], 18), STD), 0, 0.014, -0.500));
      P('sling_r', slingLoop(STD, { r: 0.009, x: -0.027, y: -0.026, z: 0.250, ry: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.790, ears: 'hood', baseW: 0.024, baseH: 0.012 }));
      P('sight_r', rearTangent(STD, { aimY: A, z: -0.190, w: 0.028, len: 0.07 }));
      P('hand_r', hand(0.016, -0.068, 0.096, -0.30, 0, { curl: 0.9 }));
      P('hand_l', supportHand(0.000, -0.026, -0.390, { pitch: 0.05 }));
      muzzleZ = -0.820;
      break;
    }
    case 'm1a1': {
      P('stock', profileZY('m1a1_stock', [
        [-0.260, -0.036], [-0.260, 0.014], [-0.030, 0.018], [0.070, 0.010], [0.140, 0.002],
        [0.210, 0.008], [0.340, 0.028], [0.440, 0.026], [0.440, -0.046],
        [0.410, -0.058], [0.300, -0.050], [0.170, -0.042], [0.100, -0.034], [-0.030, -0.032],
      ], 0.046, W, 0, 0, 0, 0.005));
      P('butt', profileZY('m1a1_butt', [
        [0.436, -0.052], [0.460, -0.046], [0.460, 0.024], [0.436, 0.026],
      ], 0.048, STD, 0, 0, 0));
      P('handguard', profileZY('m1a1_hg', [
        [-0.240, 0.018], [-0.480, 0.014], [-0.480, 0.040], [-0.240, 0.044],
      ], 0.042, W, 0, 0, 0));
      P('receiver', profileZY('m1a1_rcv', [
        [0.080, -0.010], [0.080, 0.042], [-0.170, 0.042], [-0.195, 0.030], [-0.195, -0.010],
      ], 0.044, ST, 0, 0.024, 0));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.05, h: 0.024, x: 0.0225, y: 0.052, z: -0.060, side: 1 }));
      P('barrel', at(barrel(ST, { r: 0.0098, bore: 0.0052, len: 0.36, boreDepth: 0.055 }), 0, 0.026, -0.570));
      P('mag', at(magazine(ST, STD, { w: 0.026, h: 0.115, d: 0.040, taper: 0.98, ribs: 2 }),
        0, -0.038, -0.086, 0.05));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.032, thick: 0.012 }), 0, -0.014, 0.044));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.024, y: 0.036, z: -0.130, len: 0.05, knob: 0.010 }));
      P('band', at(mesh(latheGeo('m1a1_band', [
        [0.024, -0.014], [0.029, -0.014], [0.029, 0.014], [0.024, 0.014],
      ], 18), STD), 0, 0.014, -0.470));
      // Bayonet lug: it hangs off the BARREL just ahead of the band, so it has
      // to reach up and touch it.
      P('bayolug', mesh(bevelBoxGeo(0.010, 0.030, 0.044, 0.002), STD, 0, 0.008, -0.505));
      P('sling_r', slingLoop(STD, { r: 0.008, x: -0.024, y: -0.024, z: 0.260, ry: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.735, ears: 'wings', baseW: 0.022, baseH: 0.010 }));
      P('sight_r', rearAperture(A, -0.180, STD));
      P('hand_r', hand(0.016, -0.066, 0.090, -0.30, 0, { curl: 0.9 }));
      P('hand_l', supportHand(0.000, -0.024, -0.360, { pitch: 0.05 }));
      muzzleZ = -0.760;
      break;
    }
    case 'm1garand': {
      P('stock', profileZY('garand_stock', [
        [-0.300, -0.042], [-0.300, 0.016], [-0.040, 0.020], [0.070, 0.014], [0.140, 0.004],
        [0.210, 0.010], [0.340, 0.028], [0.442, 0.026], [0.442, -0.056],
        [0.410, -0.068], [0.300, -0.046], [0.200, -0.040], [0.110, -0.038], [-0.040, -0.036],
      ], 0.052, W, 0, 0, 0, 0.005));
      P('butt', profileZY('garand_butt', [
        [0.438, -0.062], [0.464, -0.056], [0.464, 0.024], [0.438, 0.026],
      ], 0.054, STD, 0, 0, 0));
      P('forend', profileZY('garand_fore', [
        [-0.290, -0.024], [-0.560, -0.016], [-0.590, -0.004], [-0.590, 0.016], [-0.290, 0.024],
      ], 0.050, W, 0, 0.004, 0));
      P('handguard', profileZY('garand_hg', [
        [-0.300, 0.026], [-0.560, 0.020], [-0.560, 0.048], [-0.300, 0.052],
      ], 0.046, W, 0, 0, 0));
      P('receiver', profileZY('garand_rcv', [
        [0.090, -0.014], [0.090, 0.046], [-0.180, 0.050], [-0.210, 0.038], [-0.210, -0.010],
      ], 0.048, ST, 0, 0.026, 0));
      P('clipwell', mesh(bevelBoxGeo(0.040, 0.026, 0.070, 0.003), WM.cavity, 0, 0.038, -0.040));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.062, h: 0.026, x: 0.0245, y: 0.056, z: -0.050, side: 1 }));
      P('barrel', at(barrel(ST, { r: 0.0112, bore: 0.0056, len: 0.42, boreDepth: 0.06 }), 0, 0.030, -0.680));
      P('oprod', at(mesh(bevelBoxGeo(0.014, 0.014, 0.36, 0.002), STL, 0, 0, 0), 0.030, 0.020, -0.360));
      P('oprod_handle', at(mesh(sphereGeo(0.013, 10, 8), STL, 0, 0, 0), 0.032, 0.026, -0.150));
      P('gascyl', at(mesh(latheGeo('garand_gas', [
        [0.012, -0.060], [0.021, -0.060], [0.021, 0.055], [0.014, 0.060],
      ], 18), STD), 0, 0.014, -0.800));
      P('mag', at(mesh(bevelBoxGeo(0.042, 0.024, 0.080, 0.003), ST, 0, 0, 0), 0, -0.012, -0.040));
      P('guard', at(triggerGroup(ST, { len: 0.062, drop: 0.034, thick: 0.013 }), 0, -0.020, 0.050));
      P('band', at(mesh(latheGeo('garand_band', [
        [0.026, -0.014], [0.031, -0.014], [0.031, 0.014], [0.026, 0.014],
      ], 18), STD), 0, 0.014, -0.560));
      P('sling_r', slingLoop(STD, { r: 0.009, x: 0, y: -0.034, z: 0.260, rx: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.860, ears: 'wings', baseW: 0.024, baseH: 0.012 }));
      P('sight_r', rearAperture(A, 0.020, STD));
      P('hand_r', hand(0.016, -0.072, 0.100, -0.30, 0, { curl: 0.9 }));
      P('hand_l', supportHand(0.000, -0.028, -0.410, { pitch: 0.05 }));
      muzzleZ = -0.895;
      break;
    }
    case 'stg44': {
      P('receiver', profileZY('stg_rcv', [
        [0.115, -0.036], [0.115, 0.044], [-0.130, 0.044], [-0.180, 0.032], [-0.180, -0.014], [-0.040, -0.036],
      ], 0.050, SH, 0, 0.014, 0));
      P('rcv_top', profileZY('stg_top', [
        [0.100, 0.042], [0.100, 0.058], [-0.150, 0.054], [-0.150, 0.038],
      ], 0.046, SH, 0, 0.010, 0));
      P('ejection', ejectionPort(SH, WM.cavity, { w: 0.056, h: 0.026, x: 0.026, y: 0.038, z: -0.040, side: 1 }));
      P('barrel', at(barrel(STD, { r: 0.0115, bore: 0.0058, len: 0.24, boreDepth: 0.055 }), 0, 0.024, -0.430));
      P('gastube', at(mesh(cylGeo(0.0135, 0.0135, 0.30, 14), STL, 0, 0, 0), 0, 0.052, -0.330, Math.PI / 2));
      P('gasblock', at(mesh(bevelBoxGeo(0.028, 0.048, 0.044, 0.004), STD, 0, 0, 0), 0, 0.040, -0.470));
      P('handguard', at(perfShroud(SH, { r: 0.021, len: 0.16, rows: 3, holes: 6, holeW: 0.34, band: 0.5 }), 0, 0.024, -0.270));
      P('nut', at(mesh(latheGeo('stg_nut', [
        [0.010, -0.020], [0.020, -0.020], [0.021, -0.010], [0.021, 0.010], [0.016, 0.020], [0.010, 0.020],
      ], 16), STL), 0, 0.024, -0.545));
      P('mag', at(magazine(SH, STD, { w: 0.034, h: 0.190, d: 0.052, curve: 0.24, taper: 0.94, ribs: 4 }),
        0, -0.048, -0.060, 0.18));
      P('magwell', at(mesh(bevelBoxGeo(0.042, 0.036, 0.060, 0.005), SH, 0, 0, 0), 0, -0.032, -0.052, 0.18));
      P('magrelease', at(mesh(bevelBoxGeo(0.012, 0.020, 0.020, 0.002), STD, 0, 0, 0), 0.024, -0.030, -0.010));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.098, 0.052, 0.010), GR, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.062, 0.048, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), GR, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.088, 0.070, -0.22));
      P('guard', at(triggerGroup(SH, { len: 0.060, drop: 0.034, thick: 0.012 }), 0, -0.036, 0.008));
      P('selector', selector(STL, { x: 0.026, y: -0.024, z: 0.030 }));
      P('charge', chargingHandle(STL, WM.cavity, { x: -0.026, y: 0.040, z: -0.100, len: 0.06, knob: 0.011 }));
      P('stock', profileZY('stg_stock', [
        [0.110, -0.040], [0.150, -0.048], [0.330, -0.058], [0.360, -0.046], [0.360, 0.032],
        [0.300, 0.032], [0.170, 0.014], [0.115, 0.014],
      ], 0.046, WD, 0, 0, 0));
      P('butt', profileZY('stg_butt', [
        [0.356, -0.050], [0.380, -0.044], [0.380, 0.030], [0.356, 0.032],
      ], 0.048, STD, 0, 0, 0));
      P('sling_f', slingLoop(STD, { r: 0.009, x: -0.014, y: 0.020, z: -0.380, ry: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.500, ears: 'hood', baseW: 0.024, baseH: 0.012 }));
      P('sight_r', rearAperture(A, -0.120, STD));   // peep ring on the tangent base
      P('sight_base', rearTangent(STD, { aimY: A - 0.013, z: -0.148, w: 0.026, len: 0.055 }));
      const _rd = redDotSight(A, -0.060, T); _rd.visible = !!pap;
      if (pap) parts.sight_r.visible = false;
      P('reddot', _rd);
      P('hand_r', hand(0.014, -0.096, 0.074, -0.22));
      P('hand_l', supportHand(0.000, -0.036, -0.270, { pitch: 0.04 }));
      muzzleZ = -0.570;
      break;
    }
    case 'fg42': {
      P('receiver', profileZY('fg42_rcv', [
        [0.130, -0.032], [0.130, 0.042], [-0.180, 0.042], [-0.220, 0.030], [-0.220, -0.010], [-0.060, -0.032],
      ], 0.046, ST, 0, 0.014, 0));
      P('barrel', at(barrel(STD, { r: 0.0112, bore: 0.0056, len: 0.30, boreDepth: 0.055 }), 0, 0.024, -0.480));
      P('flash', at(muzzleCone(STL, { r: 0.012, r2: 0.022, len: 0.06, bore: 0.0056 }), 0, 0.024, -0.658));
      P('handguard', profileZY('fg42_hg', [
        [-0.200, -0.024], [-0.400, -0.020], [-0.400, 0.022], [-0.200, 0.026],
      ], 0.044, WD, 0, 0.006, 0));
      // side-mounted magazine
      P('mag', at(magazine(ST, STD, { w: 0.040, h: 0.120, d: 0.048, taper: 0.96, ribs: 3 }),
        0.052, -0.006, -0.070, 0, 0, -Math.PI / 2 + 0.10));
      P('magwell', at(mesh(bevelBoxGeo(0.030, 0.048, 0.056, 0.005), ST, 0, 0, 0), 0.034, 0.006, -0.070));
      P('stock', profileZY('fg42_stock', [
        [0.125, -0.030], [0.150, -0.036], [0.320, -0.038], [0.348, -0.028], [0.348, 0.038],
        [0.300, 0.038], [0.180, 0.026], [0.130, 0.024],
      ], 0.044, WD, 0, 0, 0));
      P('butt', profileZY('fg42_butt', [
        [0.344, -0.032], [0.368, -0.026], [0.368, 0.036], [0.344, 0.038],
      ], 0.046, WM.rubber, 0, 0, 0));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.098, 0.050, 0.010), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.060, 0.046, 0.006), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), WD, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.086, 0.058, -0.60));  // the FG42's famously raked grip
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, -0.032, 0.006));
      P('charge', chargingHandle(STL, WM.cavity, { x: -0.024, y: 0.030, z: -0.120, len: 0.05, knob: 0.010 }));
      P('bipod', at(bipod(STD, { spread: 0.42, len: 0.17, mount: -0.022, clamp: 0.0112 }), 0, -0.024, -0.420));
      [parts.bipod_l, parts.bipod_r] = parts.bipod.userData.legs;
      P('sight_f', frontSight(STD, { aimY: A, z: -0.600, ears: 'hood', baseW: 0.022, baseH: 0.010, mount: 0.035, band: 0.0112 }));
      P('sight_r', rearAperture(A, -0.190, STD));
      P('hand_r', hand(0.014, -0.094, 0.062, -0.60));
      P('hand_l', supportHand(0.000, -0.028, -0.300, { pitch: 0.04 }));
      muzzleZ = -0.690;
      break;
    }
    case 'mosin':
    case 'springfield': {
      // One bolt-action skeleton, two rifles. They used to share every part but
      // the bolt handle's angle, so the Springfield was a Mosin-Nagant under
      // another name. What tells them apart at a glance is kept apart here: the
      // Mosin's box magazine ahead of the trigger guard and its fat PU scope
      // reaching out over the barrel; the M1903A4's pistol-grip stock, flush
      // floorplate, handguard, two bands and long slim Weaver tube sitting
      // back over the receiver.
      const isMosin = id === 'mosin';
      P('stock', profileZY(id + '_stock', isMosin ? [
        [-0.320, -0.038], [-0.320, 0.012], [-0.040, 0.018], [0.070, 0.012], [0.140, 0.002],
        [0.220, 0.008], [0.400, 0.026], [0.505, 0.024], [0.505, -0.056],
        [0.470, -0.068], [0.320, -0.054], [0.180, -0.046], [0.100, -0.036], [-0.040, -0.034],
      ] : [
        [-0.320, -0.038], [-0.320, 0.012], [-0.040, 0.018], [0.070, 0.012], [0.130, 0.004],
        [0.200, 0.010], [0.380, 0.026], [0.505, 0.024], [0.505, -0.056],
        [0.470, -0.068], [0.330, -0.056], [0.205, -0.050], [0.165, -0.062], [0.135, -0.068],
        [0.105, -0.060], [0.085, -0.036], [-0.040, -0.034],
      ], 0.048, W, 0, 0, 0, 0.005));
      P('butt', profileZY(id + '_butt', [
        [0.501, -0.062], [0.526, -0.056], [0.526, 0.022], [0.501, 0.024],
      ], 0.050, STD, 0, 0, 0));
      P('forend', profileZY(id + '_fore', [
        [-0.310, -0.022], [-0.600, -0.014], [-0.630, -0.004], [-0.630, 0.014], [-0.310, 0.020],
      ], 0.046, W, 0, 0.004, 0));
      // Back INTO the receiver. It stopped 23cm short of it, so between the
      // receiver ring and the forend band there was no barrel at all, and the
      // front scope mount stood over bare wood.
      P('barrel', at(barrel(ST, { r: 0.0112, bore: 0.0054, len: 0.74, boreDepth: 0.06 }), 0, 0.028, -0.560));
      P('receiver', at(mesh(latheGeo(id + '_rcv', [
        [0.0, 0.110], [0.024, 0.110], [0.024, -0.030], [0.020, -0.070], [0.020, -0.110], [0.0, -0.110],
      ], 20), ST), 0, 0.028, -0.090));
      const scopeZ = isMosin ? -0.230 : -0.100;
      if (isMosin) {
        P('scope', at(scope(STD, WM.lens, { len: 0.26, r: 0.019, bell: 0.030 }), 0, A, scopeZ));
        // Out ahead of the receiver there is only barrel under the front mount,
        // so it reaches down and bites the barrel rather than ending in air.
        P('mount_f', mesh(bevelBoxGeo(0.016, 0.038, 0.020, 0.002), STD, 0, A - 0.036, -0.310));
        P('mount_r', mesh(bevelBoxGeo(0.016, 0.026, 0.020, 0.002), STD, 0, A - 0.030, -0.120));
      } else {
        // Weaver 330: a long 3/4in tube, hardly any objective bell, both rings
        // on bases screwed to the receiver.
        P('scope', at(scope(STD, WM.lens, { len: 0.30, r: 0.0125, bell: 0.016 }), 0, A, scopeZ));
        P('mount_f', mesh(bevelBoxGeo(0.016, 0.026, 0.020, 0.002), STD, 0, A - 0.030, -0.190));
        P('mount_r', mesh(bevelBoxGeo(0.016, 0.026, 0.020, 0.002), STD, 0, A - 0.030, -0.028));
      }
      const bh = new THREE.Group();
      bh.add(mesh(bevelBoxGeo(0.010, 0.010, 0.052, 0.002), ST, 0, 0, -0.020));
      P('bolt_h', at(bh, 0.022, 0.034, -0.050, 0, 0, isMosin ? -0.9 : -0.4));
      // The ball is on the END of an arm that reaches back into the bolt body.
      // It was a lone sphere sitting 20mm out beside the receiver with nothing
      // joining it to the rifle. The Mosin's arm is turned sharply down, the
      // Springfield's swept back nearly level.
      P('bolt_knob', at((() => {
        const k = new THREE.Group();
        k.add(mesh(sphereGeo(0.0125, 10, 8), ST, 0, 0, 0));
        const dx = 0.022 - 0.062;                    // ball -> bolt body, in weapon X/Y
        const dy = 0.034 - (isMosin ? 0.010 : 0.026);
        const armL = Math.hypot(dx, dy) + 0.014;     // overrun, so it seats INTO the bolt
        const arm = new THREE.Group();
        arm.rotation.z = Math.atan2(-dx, dy);
        arm.add(mesh(cylGeo(0.0052, 0.0044, armL, 10), ST, 0, armL / 2 - 0.005, 0));
        k.add(arm);
        return k;
      })(), 0.062, isMosin ? 0.010 : 0.026, -0.062));
      // The Mosin's box hangs AHEAD of the trigger guard. It used to fill the
      // space the guard hangs in, and the guard disappeared inside it. The
      // Springfield's magazine is inside the stock, down to a flush floorplate.
      P('mag', profileZY(id + '_mag', isMosin ? [
        [-0.160, -0.022], [-0.160, -0.076], [-0.070, -0.082], [-0.040, -0.066], [-0.040, -0.020],
      ] : [
        [-0.095, -0.018], [-0.095, -0.038], [0.000, -0.038], [0.000, -0.018],
      ], 0.042, ST, 0, 0, 0));
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.030, thick: 0.012 }), 0, -0.022, 0.040));
      if (isMosin) {
        P('band', at(mesh(latheGeo(id + '_band', [
          [0.024, -0.012], [0.029, -0.012], [0.029, 0.012], [0.024, 0.012],
        ], 18), STD), 0, 0.012, -0.560));
      } else {
        P('handguard', profileZY('springfield_hg', [
          [-0.200, 0.024], [-0.585, 0.017], [-0.585, 0.044], [-0.200, 0.048],
        ], 0.040, W, 0, 0, 0));
        // Square-sided bands clamping handguard to stock: the lower one carries
        // the sling swivel, the upper one is the M1903's long double band.
        P('band', mesh(bevelBoxGeo(0.052, 0.068, 0.020, 0.004), STD, 0, 0.015, -0.505));
        P('band_u', mesh(bevelBoxGeo(0.052, 0.062, 0.046, 0.004), STD, 0, 0.018, -0.585));
        P('sling_f', slingLoop(STD, { r: 0.009, x: 0, y: -0.030, z: -0.505, ry: Math.PI / 2 }));
      }
      P('sight_f', frontSight(STD, { aimY: A, z: -0.900, ears: 'hood', baseW: 0.022, baseH: 0.010, mount: 0.039, band: 0.0112 }));
      P('sight_r', at(new THREE.Group(), 0, A, scopeZ));
      P('hand_r', hand(0.016, -0.070, 0.092, -0.30, 0, { curl: 0.9 }));
      P('hand_l', supportHand(0.000, -0.026, -0.440, { pitch: 0.05 }));
      muzzleZ = -0.935;
      break;
    }
    case 'ptrs41': {
      P('receiver', profileZY('ptrs_rcv', [
        [0.120, -0.040], [0.120, 0.046], [-0.180, 0.046], [-0.220, 0.032], [-0.220, -0.014], [-0.040, -0.040],
      ], 0.052, ST, 0, 0.014, 0));
      // Long enough to reach back INTO the receiver. It used to stop 27mm short
      // of it, so the whole receiver-stock-grip assembly — every wooden part of
      // the rifle — floated behind a barrel it was not attached to.
      P('barrel', at(barrel(STD, { r: 0.0165, bore: 0.0088, len: 0.69, boreDepth: 0.075 }), 0, 0.022, -0.525));
      P('brake', at((() => {
        const b = new THREE.Group();
        b.add(mesh(latheGeo('ptrs_brake', [
          [0.009, -0.060], [0.030, -0.060], [0.032, -0.046], [0.032, 0.040], [0.024, 0.055], [0.014, 0.055],
        ], 20), STL));
        for (let i = 0; i < 4; i++) {
          for (const sx of [1, -1]) {
            b.add(mesh(bevelBoxGeo(0.008, 0.020, 0.014, 0.001), WM.cavity, sx * 0.030, 0, -0.032 + i * 0.020));
          }
        }
        b.add(mesh(cylGeo(0.009, 0.009, 0.12, 14, true), WM.bore, 0, 0, 0, Math.PI / 2));
        b.add(mesh(cylGeo(0.009, 0.009, 0.002, 14), WM.bore, 0, 0, 0.03, Math.PI / 2));
        return b;
      })(), 0, 0.022, -0.930));
      // Seated INTO the receiver. Standing 48mm proud of it the clip blocked the
      // rifle's own sight line, which no rear sight height could see over.
      P('clip', at(mesh(bevelBoxGeo(0.030, 0.058, 0.100, 0.004), STD, 0, 0, 0), 0, 0.062, -0.080));
      P('magbox', at(mesh(bevelBoxGeo(0.046, 0.056, 0.110, 0.005), ST, 0, 0, 0), 0, -0.038, -0.070));
      P('stock', profileZY('ptrs_stock', [
        [0.115, -0.044], [0.160, -0.052], [0.350, -0.062], [0.380, -0.050], [0.380, 0.036],
        [0.320, 0.036], [0.180, 0.018], [0.120, 0.016],
      ], 0.048, W, 0, 0, 0));
      P('butt', profileZY('ptrs_butt', [
        [0.376, -0.054], [0.402, -0.048], [0.402, 0.034], [0.376, 0.036],
      ], 0.050, WM.rubber, 0, 0, 0));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.096, 0.052, 0.010), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.058, 0.048, 0.006), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), WD, 0, 0.058, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.090, 0.076, -0.22));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.032, thick: 0.012 }), 0, -0.038, 0.012));
      P('bipod', at(bipod(STD, { spread: 0.55, len: 0.21, mount: 0.006, clamp: 0.0165 }), 0, -0.026, -0.560));
      [parts.bipod_l, parts.bipod_r] = parts.bipod.userData.legs;
      P('carryhandle', at(mesh(torusGeo(0.030, 0.005, 5, 16), STD, 0, 0, 0), 0, 0.056, -0.320, 0, Math.PI / 2, 0));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.840, ears: 'hood', baseW: 0.024, baseH: 0.012, mount: 0.038, band: 0.0165 }));
      P('sight_r', rearTangent(STD, { aimY: A, z: -0.160, w: 0.030, len: 0.08 }));
      P('hand_r', hand(0.014, -0.098, 0.080, -0.22));
      P('hand_l', supportHand(0.000, -0.036, -0.420, { pitch: 0.04 }));
      muzzleZ = -0.995;
      break;
    }
    case 'bar': {
      P('receiver', profileZY('bar_rcv', [
        [0.120, -0.044], [0.120, 0.046], [-0.150, 0.046], [-0.200, 0.034], [-0.200, -0.020], [-0.040, -0.044],
      ], 0.052, ST, 0, 0.012, 0));
      P('rcv_top', profileZY('bar_top', [
        [0.110, 0.044], [0.110, 0.060], [-0.170, 0.056], [-0.170, 0.040],
      ], 0.048, ST, 0, 0.008, 0));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.056, h: 0.026, x: 0.0272, y: 0.036, z: -0.030, side: 1 }));
      P('barrel', at(barrel(STD, { r: 0.0148, bore: 0.0068, len: 0.32, boreDepth: 0.06 }), 0, 0.024, -0.400));
      P('flash', at(muzzleCone(STL, { r: 0.015, r2: 0.024, len: 0.055, bore: 0.0068 }), 0, 0.024, -0.588));
      P('gastube', at(mesh(cylGeo(0.0135, 0.0135, 0.30, 14), STD, 0, 0, 0), 0, -0.010, -0.360, Math.PI / 2));
      P('gasblock', at(mesh(bevelBoxGeo(0.026, 0.042, 0.044, 0.004), STD, 0, 0, 0), 0, 0.006, -0.500));
      P('handguard', profileZY('bar_hg', [
        [-0.190, -0.028], [-0.360, -0.024], [-0.360, 0.014], [-0.190, 0.018],
      ], 0.046, W, 0, 0.006, 0));
      for (let i = 0; i < 6; i++) {
        P('hg_groove' + i, at(mesh(torusGeo(0.0245, 0.0025, 5, 16), WD, 0, 0, 0), 0, -0.002, -0.220 - i * 0.024));
      }
      P('mag', at(magazine(ST, STD, { w: 0.036, h: 0.115, d: 0.056, taper: 0.96, ribs: 2 }),
        0, -0.052, -0.100, 0.08));
      P('magwell', at(mesh(bevelBoxGeo(0.044, 0.030, 0.062, 0.005), ST, 0, 0, 0), 0, -0.030, -0.096, 0.08));
      P('stock', profileZY('bar_stock', [
        [0.115, -0.048], [0.160, -0.058], [0.340, -0.070], [0.372, -0.058], [0.372, 0.034],
        [0.310, 0.034], [0.180, 0.014], [0.120, 0.014],
      ], 0.048, W, 0, 0, 0));
      P('butt', profileZY('bar_butt', [
        [0.368, -0.062], [0.394, -0.056], [0.394, 0.032], [0.368, 0.034],
      ], 0.050, STD, 0, 0, 0));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.098, 0.052, 0.010), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.060, 0.048, 0.006), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), WD, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.092, 0.088, -0.20));
      P('guard', at(triggerGroup(ST, { len: 0.062, drop: 0.034, thick: 0.013 }), 0, -0.038, 0.026));
      P('charge', chargingHandle(STL, WM.cavity, { x: -0.028, y: 0.026, z: -0.090, len: 0.06, knob: 0.011 }));
      P('selector', selector(STL, { x: 0.028, y: -0.020, z: 0.050 }));
      P('bipod', at(bipod(STD, { spread: 0.46, len: 0.19 }), 0, -0.014, -0.470));
      [parts.bipod_l, parts.bipod_r] = parts.bipod.userData.legs;
      P('sight_f', frontSight(STD, { aimY: A, z: -0.545, ears: 'wings', baseW: 0.024, baseH: 0.012, mount: 0.044, band: 0.0125 }));
      P('sight_r', rearAperture(A, -0.150, STD));
      P('hand_r', hand(0.014, -0.100, 0.092, -0.20));
      P('hand_l', supportHand(0.000, -0.030, -0.280, { pitch: 0.04 }));
      muzzleZ = -0.618;
      break;
    }
    case 'mg42': {
      P('receiver', profileZY('mg42_rcv', [
        [0.150, -0.048], [0.150, 0.048], [-0.140, 0.048], [-0.200, 0.034], [-0.200, -0.024], [-0.020, -0.048],
      ], 0.056, SH, 0, 0.012, 0));
      P('cover', at((() => {
        const c = new THREE.Group();
        c.add(mesh(bevelBoxGeo(0.054, 0.024, 0.24, 0.006), SH, 0, 0, -0.070));
        for (let i = 0; i < 5; i++) c.add(mesh(bevelBoxGeo(0.050, 0.005, 0.008, 0.001), STD, 0, 0.014, 0.010 - i * 0.040));
        c.add(mesh(bevelBoxGeo(0.020, 0.014, 0.030, 0.003), STD, 0, 0.014, 0.040)); // latch
        return c;
      })(), 0, 0.070, 0.000));
      // Perforated barrel shroud with the big lightening cut-out on the right.
      // The shroud has to REACH the receiver: it used to stop 56mm short and
      // the entire front end — shroud, barrel, booster, bipod, front sight —
      // hung in front of the gun as a separate object.
      P('shroud', at(perfShroud(SH, { r: 0.031, len: 0.51, rows: 7, holes: 5, holeW: 0.45, band: 0.42 }), 0, 0.020, -0.445));
      P('shroud_cut', at(mesh(bevelBoxGeo(0.008, 0.044, 0.16, 0.003), WM.cavity, 0, 0, 0), 0.030, 0.020, -0.400));
      P('barrel', at(barrel(STD, { r: 0.0128, bore: 0.0062, len: 0.20, boreDepth: 0.06 }), 0, 0.020, -0.780));
      // Muzzle bearing. Without it the barrel hangs concentrically inside the
      // shroud, touching nothing at any point along its length.
      P('barrel_bearing', at(mesh(latheGeo('mg42_bearing', [
        [0.0124, -0.012], [0.0312, -0.012], [0.0312, 0.012], [0.0124, 0.012],
      ], 20), STD), 0, 0.020, -0.692));
      P('flash', at((() => {
        const f = new THREE.Group();
        f.add(mesh(latheGeo('mg42_booster', [
          [0.007, -0.056], [0.024, -0.056], [0.026, -0.042], [0.026, 0.030], [0.020, 0.044], [0.012, 0.044],
        ], 20), STL));
        f.add(mesh(cylGeo(0.007, 0.007, 0.10, 14, true), WM.bore, 0, 0, 0, Math.PI / 2));
        f.add(mesh(cylGeo(0.007, 0.007, 0.002, 14), WM.bore, 0, 0, 0.02, Math.PI / 2));
        return f;
      })(), 0, 0.020, -0.900));
      P('feed', at(mesh(bevelBoxGeo(0.050, 0.056, 0.100, 0.006), SH, 0, 0, 0), 0.042, 0.008, -0.030));
      P('belt_link', at((() => {
        const b = new THREE.Group();
        for (let i = 0; i < 7; i++) {
          b.add(mesh(bevelBoxGeo(0.010, 0.014, 0.014, 0.002), BR, 0, -i * 0.012, i * i * 0.0010));
          b.add(mesh(cylGeo(0.0042, 0.0034, 0.024, 10), BR, 0.010, -i * 0.012, i * i * 0.0010, 0, 0, Math.PI / 2));
        }
        return b;
      })(), 0.038, -0.010, -0.030));
      P('drum', at(mesh(latheGeo('mg42_drum', [
        [0.0, 0.020], [0.056, 0.020], [0.062, 0.012], [0.062, -0.012], [0.056, -0.020], [0.0, -0.020],
      ], 22), SH), -0.064, -0.048, -0.020, 0, 0, Math.PI / 2));
      P('drum_cap', at(mesh(latheGeo('mg42_drumcap', [
        [0.0, 0.022], [0.046, 0.022], [0.050, 0.016], [0.050, -0.016], [0.046, -0.022], [0.0, -0.022],
      ], 20), STL), -0.064, -0.048, -0.020, 0, 0, Math.PI / 2));
      P('stock', profileZY('mg42_stock', [
        [0.145, -0.042], [0.190, -0.052], [0.360, -0.058], [0.392, -0.046], [0.392, 0.038],
        [0.330, 0.038], [0.200, 0.026], [0.150, 0.026],
      ], 0.048, WD, 0, 0, 0));
      P('butt', profileZY('mg42_butt', [
        [0.388, -0.050], [0.414, -0.044], [0.414, 0.036], [0.388, 0.038],
      ], 0.050, WM.rubber, 0, 0, 0));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.100, 0.052, 0.010), GR, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.062, 0.048, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), GR, 0, 0.060, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.094, 0.104, -0.20));
      P('guard', at(triggerGroup(SH, { len: 0.062, drop: 0.036, thick: 0.013 }), 0, -0.040, 0.042));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.030, y: 0.020, z: -0.060, len: 0.07, knob: 0.012 }));
      P('bipod', at(bipod(STD, { spread: 0.50, len: 0.20, mount: -0.011, clamp: 0.031 }), 0, -0.026, -0.560));
      [parts.bipod_l, parts.bipod_r] = parts.bipod.userData.legs;
      P('sight_f', frontSight(STD, { aimY: A, z: -0.680, ears: 'wings', baseW: 0.026, baseH: 0.014, mount: 0.051, band: 0.031 }));
      P('sight_r', rearTangent(STD, { aimY: A, z: -0.140, w: 0.030, len: 0.09 }));
      P('hand_r', hand(0.014, -0.102, 0.106, -0.20));
      P('hand_l', supportHand(0.000, -0.028, -0.330, { pitch: 0.04 }));
      muzzleZ = -0.945;
      break;
    }
    case 'browning': {
      P('receiver', profileZY('brown_rcv', [
        [0.160, -0.060], [0.160, 0.056], [-0.130, 0.056], [-0.190, 0.040], [-0.190, -0.030], [0.000, -0.060],
      ], 0.062, ST, 0, 0.004, 0));
      P('cover', at((() => {
        const c = new THREE.Group();
        c.add(mesh(bevelBoxGeo(0.060, 0.026, 0.26, 0.006), ST, 0, 0, -0.060));
        for (let i = 0; i < 4; i++) c.add(mesh(bevelBoxGeo(0.056, 0.006, 0.010, 0.001), STD, 0, 0.015, 0.020 - i * 0.050));
        return c;
      })(), 0, 0.076, 0.000));
      // Reaches back into the receiver rather than stopping 17mm short of it.
      P('jacket', at(perfShroud(SH, { r: 0.030, len: 0.35, rows: 5, holes: 6, holeW: 0.40, band: 0.44 }), 0, 0.020, -0.340));
      P('barrel', at(barrel(STD, { r: 0.0142, bore: 0.0068, len: 0.24, boreDepth: 0.06 }), 0, 0.020, -0.610));
      P('barrel_bearing', at(mesh(latheGeo('brown_bearing', [
        [0.0138, -0.012], [0.0302, -0.012], [0.0302, 0.012], [0.0138, 0.012],
      ], 20), STD), 0, 0.020, -0.505));
      P('flash', at(muzzleCone(STL, { r: 0.014, r2: 0.024, len: 0.05, bore: 0.0068 }), 0, 0.020, -0.755));
      P('handle', at((() => {
        const h = new THREE.Group();
        h.add(mesh(bevelBoxGeo(0.018, 0.030, 0.110, 0.005), WD, 0, 0, 0));
        for (let i = 0; i < 4; i++) h.add(mesh(torusGeo(0.014, 0.0028, 5, 14), STD, 0, 0, -0.036 + i * 0.024, Math.PI / 2, 0, Math.PI / 2));
        return h;
        // Offset left, as an M1919A6's is, and for the same reason: on the
        // centreline this handle stood squarely between the eye and the front
        // post, and no amount of taller rear sight fixes a handle above it.
      })(), -0.026, 0.104, -0.060));
      P('feed', at(mesh(bevelBoxGeo(0.038, 0.048, 0.090, 0.005), ST, 0, 0, 0), 0.044, 0.004, -0.020));
      P('belt_link', at((() => {
        const b = new THREE.Group();
        for (let i = 0; i < 7; i++) {
          b.add(mesh(bevelBoxGeo(0.010, 0.014, 0.014, 0.002), BR, 0, -i * 0.012, i * i * 0.0010));
          b.add(mesh(cylGeo(0.0042, 0.0034, 0.024, 10), BR, 0.010, -i * 0.012, i * i * 0.0010, 0, 0, Math.PI / 2));
        }
        return b;
      })(), 0.040, -0.014, -0.020));
      P('stock', profileZY('brown_stock', [
        [0.155, -0.048], [0.200, -0.058], [0.370, -0.064], [0.404, -0.052], [0.404, 0.044],
        [0.340, 0.044], [0.210, 0.030], [0.160, 0.030],
      ], 0.052, WD, 0, 0, 0));
      P('butt', profileZY('brown_butt', [
        [0.400, -0.056], [0.428, -0.050], [0.428, 0.042], [0.400, 0.044],
      ], 0.054, WM.rubber, 0, 0, 0));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.104, 0.052, 0.010), GR, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.064, 0.048, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), GR, 0, 0.062, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.100, 0.120, -0.20));
      P('guard', at(triggerGroup(ST, { len: 0.062, drop: 0.036, thick: 0.013 }), 0, -0.046, 0.058));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.034, y: 0.010, z: -0.040, len: 0.07, knob: 0.012 }));
      P('bipod', at(bipod(STD, { spread: 0.50, len: 0.20, mount: -0.010, clamp: 0.030 }), 0, -0.036, -0.470));
      [parts.bipod_l, parts.bipod_r] = parts.bipod.userData.legs;
      P('sight_f', frontSight(STD, { aimY: A, z: -0.500, ears: 'wings', baseW: 0.026, baseH: 0.014, mount: 0.050, band: 0.030 }));
      P('sight_r', rearAperture(A, -0.130, STD));
      P('hand_r', hand(0.014, -0.108, 0.122, -0.20));
      P('hand_l', supportHand(0.000, -0.024, -0.300, { pitch: 0.04 }));
      muzzleZ = -0.800;
      break;
    }
    case 'trench': {
      P('receiver', profileZY('trench_rcv', [
        [0.120, -0.034], [0.120, 0.040], [-0.100, 0.044], [-0.140, 0.032], [-0.140, -0.020], [0.020, -0.034],
      ], 0.048, ST, 0, 0.012, 0));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.056, h: 0.028, x: 0.0235, y: 0.026, z: 0.010, side: 1 }));
      P('barrel', at(barrel(STD, { r: 0.0165, bore: 0.0125, len: 0.46, boreDepth: 0.07 }), 0, 0.030, -0.360));
      // ventilated heat shield — the M1897 Trench Gun's defining feature
      P('shield', at(perfShroud(SH, { r: 0.026, len: 0.34, rows: 6, holes: 5, holeW: 0.5, band: 0.36 }), 0, 0.030, -0.360));
      P('shield_band_f', at(mesh(torusGeo(0.0265, 0.0032, 5, 18), STD), 0, 0.030, -0.528));
      P('shield_band_r', at(mesh(torusGeo(0.0265, 0.0032, 5, 18), STD), 0, 0.030, -0.192));
      P('magtube', at(mesh(latheGeo('trench_tube', [
        [0.0, 0.19], [0.0135, 0.19], [0.0135, -0.18], [0.010, -0.19], [0.0, -0.19],
      ], 16), STD), 0, -0.004, -0.290));
      P('pump', at((() => {
        const p = new THREE.Group();
        p.add(mesh(latheGeo('trench_pump', [
          [0.014, -0.060], [0.026, -0.054], [0.028, -0.030], [0.028, 0.030], [0.026, 0.054], [0.014, 0.060],
        ], 18), W));
        for (let i = 0; i < 7; i++) p.add(mesh(torusGeo(0.0285, 0.0028, 5, 18), WD, 0, 0, -0.044 + i * 0.015));
        p.add(mesh(bevelBoxGeo(0.014, 0.010, 0.090, 0.002), STD, 0, -0.022, 0));
        return p;
      })(), 0, -0.004, -0.300));
      P('stock', profileZY('trench_stock', [
        [0.115, -0.040], [0.160, -0.052], [0.320, -0.070], [0.352, -0.058], [0.352, 0.032],
        [0.290, 0.032], [0.170, 0.010], [0.120, 0.012],
      ], 0.048, W, 0, 0, 0));
      P('butt', profileZY('trench_butt', [
        [0.348, -0.064], [0.372, -0.058], [0.372, 0.030], [0.348, 0.032],
      ], 0.050, STD, 0, 0, 0));
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.032, thick: 0.012 }), 0, -0.026, 0.062));
      P('bayolug', at((() => {
        const b = new THREE.Group();
        b.add(mesh(bevelBoxGeo(0.028, 0.030, 0.060, 0.004), STD, 0, 0, 0));
        b.add(mesh(cylGeo(0.006, 0.006, 0.040, 10), STD, 0, -0.020, -0.010, Math.PI / 2));
        return b;
      })(), 0, 0.006, -0.545));
      P('sling_f', slingLoop(STD, { r: 0.009, x: 0, y: 0.056, z: -0.520, rx: Math.PI / 2 }));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.540, ears: 'none', baseW: 0.016, baseH: 0.008, bladeW: 0.005 }));
      P('sight_r', rearNotch(A, -0.020, STD, 0.024));
      P('hand_r', hand(0.014, -0.086, 0.086, -0.26, 0, { curl: 0.9 }));
      P('hand_l', foreGripHand(0.000, -0.010, -0.300, 0.05, { curl: 0.9 }));
      muzzleZ = -0.592;
      break;
    }
    case 'dbshotgun': {
      const barrels = new THREE.Group();
      for (const sx of [-0.021, 0.021]) {
        barrels.add(at(barrel(ST, { r: 0.0182, bore: 0.0135, len: 0.52, boreDepth: 0.08 }), sx, 0, -0.290));
      }
      barrels.add(mesh(bevelBoxGeo(0.050, 0.012, 0.50, 0.002), STD, 0, 0.018, -0.290));   // top rib
      barrels.add(mesh(bevelBoxGeo(0.050, 0.010, 0.50, 0.002), STD, 0, -0.018, -0.290));  // bottom rib
      // Breech block. No chamber mouths behind it: the breech face sits inside
      // the action body whether the gun is open or shut, so all the two dark
      // chamber tubes ever showed was their outer wall, punched out through the
      // side of the receiver as a square black port.
      barrels.add(mesh(bevelBoxGeo(0.052, 0.046, 0.070, 0.006), ST, 0, 0, -0.020));
      barrels.add(mesh(torusGeo(0.019, 0.003, 5, 16), STL, -0.021, 0, -0.550));
      barrels.add(mesh(torusGeo(0.019, 0.003, 5, 16), STL, 0.021, 0, -0.550));
      P('barrels', at(barrels, 0, 0.010, 0.010));
      P('forend', at((() => {
        const f = new THREE.Group();
        // Tall enough to take the barrels INTO its top, as a splinter forend
        // does. Stopping at the bottom rib, it read as a board hanging under
        // the barrels with a dark gap along its whole length.
        f.add(mesh(bevelBoxGeo(0.052, 0.051, 0.190, 0.010), W, 0, 0.0065, 0));
        f.add(mesh(bevelBoxGeo(0.054, 0.024, 0.110, 0.006), CK, 0, -0.006, 0));
        f.add(mesh(bevelBoxGeo(0.014, 0.014, 0.030, 0.002), STD, 0, -0.018, -0.086));
        return f;
      })(), 0, -0.030, -0.290));
      P('receiver', profileZY('db_rcv', [
        [0.130, -0.034], [0.130, 0.036], [-0.040, 0.040], [-0.070, 0.030], [-0.070, -0.026], [0.030, -0.034],
      ], 0.054, ST, 0, 0.008, 0));
      P('lever', at((() => {
        const l = new THREE.Group();
        l.add(mesh(bevelBoxGeo(0.012, 0.008, 0.052, 0.002), STL, 0, 0, 0));
        l.add(mesh(cylGeo(0.008, 0.008, 0.012, 12), STL, 0, 0, 0.026));
        return l;
      })(), 0, 0.048, 0.030, 0, 0.22, 0));
      P('hammers', at((() => {
        const h = new THREE.Group();
        for (const sx of [1, -1]) {
          h.add(mesh(bevelBoxGeo(0.010, 0.026, 0.014, 0.003), ST, sx * 0.017, 0, 0, 0.30));
          h.add(mesh(bevelBoxGeo(0.014, 0.008, 0.014, 0.002), STD, sx * 0.017, 0.014, 0.006));
        }
        return h;
      })(), 0, 0.040, 0.078));
      P('stock', profileZY('db_stock', [
        [0.125, -0.038], [0.170, -0.050], [0.320, -0.072], [0.352, -0.060], [0.352, 0.030],
        [0.290, 0.030], [0.180, 0.008], [0.130, 0.012],
      ], 0.050, W, 0, 0, 0));
      P('butt', profileZY('db_butt', [
        [0.348, -0.066], [0.374, -0.060], [0.374, 0.028], [0.348, 0.030],
      ], 0.052, WM.rubber, 0, 0, 0));
      P('grip_check', at(mesh(bevelBoxGeo(0.048, 0.052, 0.090, 0.008), CK, 0, 0, 0), 0, -0.030, 0.180, -0.16));
      P('guard', at(triggerGroup(ST, { len: 0.062, drop: 0.032, thick: 0.012 }), 0, -0.028, 0.072));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.530, ears: 'none', baseW: 0.014, baseH: 0.006, bladeW: 0.004 }));
      P('sight_r', at(new THREE.Group(), 0, A, 0.05));
      P('hand_r', hand(0.014, -0.084, 0.100, -0.26, 0, { curl: 0.9 }));
      P('hand_l', foreGripHand(0.000, -0.038, -0.300, 0.05, { curl: 0.85 }));
      muzzleZ = -0.560;
      break;
    }
    case 'panzerschreck': {
      // A real tube: outer wall, muzzle lip and an 88mm bore, open at the back
      // where the rocket goes in. The rocket below lives INSIDE it.
      P('tube', at(mesh(latheGeo('pz_tube', [
        [0.044, 0.56], [0.048, 0.56], [0.048, -0.50], [0.056, -0.54], [0.062, -0.56], [0.044, -0.56],
        [0.044, 0.56],
      ], 24), ST), 0, 0.040, -0.280));
      for (let i = 0; i < 5; i++) {
        P('tube_band' + i, at(mesh(torusGeo(0.0495, 0.004, 5, 22), STD), 0, 0.040, -0.72 + i * 0.24));
      }
      P('bell', at(mesh(latheGeo('pz_bell', [
        [0.049, 0.09], [0.055, 0.06], [0.070, -0.03], [0.076, -0.06], [0.070, -0.062], [0.050, -0.02], [0.045, 0.09],
      ], 24), STD), 0, 0.040, -0.800));
      // A dark liner just inside the bore at the muzzle end. It is a lathed ring,
      // already running along Z, rather than an open cylinder: that needed a
      // quarter-turn (once lost, standing the bore on end as a rod through the
      // tube), and its outside is the face that points away from the eye
      // looking down the tube.
      P('bore', at(mesh(latheGeo('pz_bore', [
        [0.0425, -0.138], [0.0438, -0.138], [0.0438, 0.15], [0.0425, 0.15], [0.0425, -0.138],
      ], 20), WM.bore), 0, 0.040, -0.700));
      P('shield', at((() => {
        const s = new THREE.Group();
        // A vision port you can actually see through, on the CENTRELINE, on the
        // sight line. It used to be a dark inlay laid ON the plate, 5cm above
        // the aim line and 5cm to the right of it, so the shield was solid steel
        // everywhere the eye looked: aiming the Panzerschreck showed a plate and
        // nothing else. Now the plate is built as a frame AROUND the opening.
        // A real one carries port and sight offset for a right-shoulder hold; a
        // viewmodel has one eye, and it is on the axis.
        const py = 0.020, ph = 0.098, pw = 0.118;      // port, in shield space
        s.add(mesh(bevelBoxGeo(0.210, 0.085 - (py + ph / 2), 0.010, 0.004), SH, 0, (0.085 + py + ph / 2) / 2, 0));
        s.add(mesh(bevelBoxGeo(0.210, 0.085 + (py - ph / 2), 0.010, 0.004), SH, 0, (-0.085 + py - ph / 2) / 2, 0));
        for (const sx of [1, -1]) {
          s.add(mesh(bevelBoxGeo(0.105 - pw / 2, ph, 0.010, 0.004), SH, sx * (0.105 + pw / 2) / 2, py, 0));
        }
        s.add(mesh(bevelBoxGeo(pw + 0.008, ph + 0.008, 0.003, 0.001), WM.glass, 0, py, -0.005));
        for (const sx of [1, -1]) s.add(mesh(bevelBoxGeo(0.012, 0.150, 0.016, 0.003), STD, sx * 0.096, 0, 0.010));
        return s;
      })(), 0, 0.110, -0.330));
      P('grip_f', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.104, 0.050, 0.010), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.062, 0.046, 0.006), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), WD, 0, 0.062, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.048, -0.230, 0.16));
      P('grip_r', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.098, 0.050, 0.010), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.058, 0.046, 0.006), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), WD, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.044, 0.060, -0.18));
      P('guard', at(triggerGroup(ST, { len: 0.058, drop: 0.032, thick: 0.011 }), 0, 0.004, -0.010));
      P('ignitor', at(mesh(bevelBoxGeo(0.040, 0.044, 0.080, 0.005), STD, 0, 0, 0), 0, 0.000, 0.020));
      P('sight', at((() => {
        const s = new THREE.Group();
        s.add(mesh(bevelBoxGeo(0.008, 0.070, 0.006, 0.001), STD, 0, 0, 0));
        for (let i = 0; i < 4; i++) s.add(mesh(bevelBoxGeo(0.022, 0.003, 0.004, 0.0006), STD, 0, 0.026 - i * 0.016, 0));
        // bracket down onto the tube — the sight ladder used to start in mid-air
        s.add(mesh(bevelBoxGeo(0.014, 0.052, 0.014, 0.002), STD, -0.004, -0.050, 0));
        return s;
      })(), 0, 0.100, -0.300));
      // Loaded, the rocket sits wholly inside the tube, tail fins just short of
      // the open back end. It used to hang 19cm out of the back of a tube it was
      // wider than, and the inside-out tube let the warhead show through the wall.
      P('rocket', at((() => {
        const r = new THREE.Group();
        r.add(mesh(latheGeo('pz_rocket', [
          [0.0, 0.15], [0.028, 0.14], [0.032, 0.10], [0.032, -0.02], [0.041, -0.05],
          [0.041, -0.10], [0.028, -0.14], [0.0, -0.16],
        ], 20), WM.phosphate));
        r.add(mesh(latheGeo('pz_warhead', [
          [0.001, -0.20], [0.019, -0.175], [0.035, -0.14], [0.041, -0.11], [0.028, -0.10],
        ], 20), WM.copper));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          // Radial, not tangential: the 30mm dimension is the fin's DEPTH out
          // from the body, so it has to be the one the rotation sweeps round.
          r.add(mesh(bevelBoxGeo(0.030, 0.004, 0.050, 0.001), STD,
            Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.120, 0, 0, a));
        }
        return r;
      })(), 0, 0.040, 0.110));
      P('sight_f', at(new THREE.Group(), 0, A, -0.30));
      P('sight_r', at(new THREE.Group(), 0, A, 0.05));
      P('hand_r', hand(0.014, -0.052, 0.062, -0.18));
      P('hand_l', foreGripHand(0.000, -0.056, -0.230, 0.16, { curl: 0.95 }));
      muzzleZ = -0.870;
      break;
    }
    case 'raygun': {
      // WaW Ray Gun: chrome fluted body, ribbed barrel, side power dial, rear
      // fins, a glowing atomic cell and a dark bakelite grip.
      const chrome = pap ? WM.papChrome : WM.polished;
      const dark = pap ? WM.papBody : WM.ironDark;
      const glowM = pap ? WM.papCore : WM.rayGlow;
      P('receiver', at(mesh(latheGeo('ray_rcv', [
        [0.0, 0.170], [0.040, 0.170], [0.052, 0.140], [0.058, 0.060], [0.056, -0.100],
        [0.048, -0.140], [0.030, -0.152], [0.0, -0.152],
      ], 22), chrome), 0, 0.015, -0.010));
      P('receiver_cap', at(mesh(latheGeo('ray_cap', [
        [0.0, 0.050], [0.052, 0.046], [0.058, 0.020], [0.056, -0.030], [0.0, -0.034],
      ], 22), dark), 0, 0.015, 0.160));
      // Runs the full length under the accelerator rings and into the muzzle
      // bell. It used to stop after the third ring, leaving the last two rings
      // and the whole emitter assembly floating off the end of the gun.
      P('barrel', at(mesh(latheGeo('ray_barrel', [
        [0.014, -0.352], [0.024, -0.340], [0.030, -0.185], [0.034, -0.120], [0.038, 0.010], [0.042, 0.150],
      ], 22), chrome), 0, 0.020, -0.170));
      for (let i = 0; i < 5; i++) {
        P('ring' + i, at(mesh(latheGeo('ray_ring', [
          [0.022, -0.011], [0.050, -0.011], [0.052, -0.006], [0.052, 0.006], [0.050, 0.011], [0.022, 0.011],
        ], 22), dark), 0, 0.020, -0.215 - i * 0.062));
      }
      P('muzzle_bell', at(mesh(latheGeo('ray_bell', [
        [0.011, -0.040], [0.030, -0.040], [0.052, 0.020], [0.058, 0.036], [0.046, 0.036], [0.024, 0.004], [0.011, -0.010],
      ], 24), dark), 0, 0.020, -0.520));
      P('muzzle_core', at(mesh(latheGeo('ray_core', [
        [0.0, -0.028], [0.013, -0.026], [0.017, 0.000], [0.013, 0.024], [0.0, 0.026],
      ], 18), glowM), 0, 0.020, -0.528));
      for (let i = 0; i < 3; i++) {   // emitter prongs around the aperture
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        P('prong' + i, at(mesh(bevelBoxGeo(0.008, 0.008, 0.052, 0.002), chrome, 0, 0, 0),
          Math.cos(a) * 0.036, 0.020 + Math.sin(a) * 0.036, -0.545, 0, 0, -a));
      }
      {   // power dial with a needle and a hot green face
        const dial = new THREE.Group();
        // A cup, with the green face sunk inside its rim. As a solid disc it
        // covered the face completely; the face only ever showed because the
        // disc used to be drawn inside-out.
        dial.add(mesh(latheGeo('ray_dial', [
          [0.0, 0.003], [0.033, 0.003], [0.035, 0.010], [0.040, 0.010], [0.042, 0.004], [0.042, -0.008], [0.0, -0.008],
        ], 20), BR, 0, 0, 0, 0, Math.PI / 2, 0));
        dial.add(mesh(cylGeo(0.033, 0.033, 0.012, 20), pap ? WM.papCore : WM.rayGlass, 0, 0, 0, 0, 0, Math.PI / 2));
        dial.add(mesh(torusGeo(0.036, 0.004, 5, 20), BR, 0.008, 0, 0, 0, Math.PI / 2, 0));
        dial.add(mesh(bevelBoxGeo(0.004, 0.026, 0.004, 0.0008), WM.ironDark, 0.008, 0.008, 0, 0, 0, -0.5));
        parts.dial = at(dial, 0.062, 0.030, -0.050);
        g.add(parts.dial);
      }
      // Rooted deeper into the body and swept down: the dorsal fin keeps its
      // silhouette, but its tip used to stand 63mm above the sight line, dead on
      // the centreline, so aiming the Ray Gun meant aiming at its own fin. Even
      // once the sight line had been lifted the whole 20mm the lift allows, the
      // fin still crossed the aim axis nearer the eye than the front post — and
      // nearer means it eclipses the post however little it clears the line by.
      P('fin_t', at(mesh(plateGeo('ray_fin_t', [
        [0.10, 0.00], [0.10, 0.058], [-0.02, 0.036], [-0.03, 0.00],
      ], 0.012, 0.002), chrome), 0, 0.014, 0.030, 0, Math.PI / 2, 0));
      for (const sx of [1, -1]) {
        P('fin_' + (sx > 0 ? 'l' : 'r'), at(mesh(plateGeo('ray_fin_s', [
          [0.09, 0.00], [0.09, 0.062], [-0.01, 0.040], [-0.02, 0.00],
        ], 0.012, 0.002), chrome), sx * 0.048, 0.030, 0.030, 0, Math.PI / 2, sx > 0 ? 0.35 : -0.35));
      }
      // Clamped down onto the body rather than hovering above it. At 0.096 the
      // cell and its cage sat astride the sight line and hid the front post.
      P('cell', at(mesh(latheGeo('ray_cell', [
        [0.0, 0.056], [0.020, 0.052], [0.024, 0.030], [0.024, -0.030], [0.020, -0.052], [0.0, -0.056],
      ], 18), glowM), 0, 0.070, -0.020));
      P('cell_cage_f', at(mesh(torusGeo(0.026, 0.004, 5, 16), dark), 0, 0.070, -0.062));
      P('cell_cage_b', at(mesh(torusGeo(0.026, 0.004, 5, 16), dark), 0, 0.070, 0.022));
      for (const sx of [1, -1]) {
        P('cell_rod' + sx, mesh(cylGeo(0.003, 0.003, 0.090, 8), dark, sx * 0.024, 0.070, -0.020, Math.PI / 2));
      }
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.040, 0.110, 0.058, 0.012), GR, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.043, 0.070, 0.052, 0.008), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.034, 0.028, 0.050, 0.003), GR, 0, 0.065, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.092, 0.084, -0.28));
      P('guard', at(triggerGroup(dark, { len: 0.062, drop: 0.036, thick: 0.012 }), 0, -0.038, -0.010));
      P('sight_f', frontSight(dark, { aimY: A, z: -0.430, ears: 'ring', baseW: 0.018, baseH: 0.010, mount: 0.046, band: 0.026 }));
      P('sight_r', rearNotch(A, 0.050, dark, 0.026));
      P('hand_r', hand(0.014, -0.098, 0.086, -0.28));
      muzzleZ = -0.560;
      break;
    }
    case 'dg2': {
      // Wunderwaffe DG-2: walnut furniture, ribbed brass barrel, coil wrap,
      // cyan chamber, three control knobs and the tesla emitter fork.
      const brass = pap ? WM.papChrome : WM.brass;
      const brassD = pap ? WM.papBody : WM.copper;
      const steelD = pap ? WM.papBody : WM.ironDark;
      const glow = pap ? WM.papCore : WM.teslaGlow;
      const glassM = pap ? WM.papCore : WM.teslaGlass;
      P('stock', profileZY('dg2_stock', [
        [0.170, -0.060], [0.220, -0.072], [0.400, -0.086], [0.440, -0.072], [0.440, 0.048],
        [0.360, 0.048], [0.220, 0.020], [0.175, 0.020],
      ], 0.070, W, 0, 0, 0, 0.006));
      P('butt', profileZY('dg2_butt', [
        [0.436, -0.078], [0.468, -0.070], [0.468, 0.046], [0.436, 0.048],
      ], 0.072, WM.rubber, 0, 0, 0));
      P('grip_r', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.040, 0.108, 0.054, 0.012), WD, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.043, 0.066, 0.050, 0.008), CK, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.034, 0.028, 0.046, 0.003), WD, 0, 0.064, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.112, 0.140, -0.30));
      P('receiver', profileZY('dg2_rcv', [
        [0.190, -0.060], [0.190, 0.062], [-0.140, 0.062], [-0.180, 0.044], [-0.180, -0.036], [0.020, -0.060],
      ], 0.084, steelD, 0, 0.010, 0, 0.006));
      P('receiver_cap', at(mesh(bevelBoxGeo(0.090, 0.126, 0.048, 0.008), brassD, 0, 0, 0), 0, 0.010, -0.160));
      for (let i = 0; i < 6; i++) {
        P('rib_m' + i, at(mesh(bevelBoxGeo(0.096, 0.086, 0.012, 0.003), steelD, 0, 0, 0), 0, -0.044, -0.020 - i * 0.035));
      }
      P('chamber', at(mesh(bevelBoxGeo(0.048, 0.028, 0.116, 0.004), glassM, 0, 0, 0), 0, 0.086, 0.020));
      P('chamber_frame', at((() => {
        const f = new THREE.Group();
        f.add(mesh(bevelBoxGeo(0.062, 0.010, 0.140, 0.003), brassD, 0, -0.012, 0));
        for (let i = 0; i < 4; i++) f.add(mesh(bevelBoxGeo(0.064, 0.010, 0.008, 0.002), brass, 0, 0.006, -0.056 + i * 0.037));
        return f;
      })(), 0, 0.086, 0.020));
      for (let i = 0; i < 3; i++) {
        P('knob' + i, at(mesh(latheGeo('dg2_knob', [
          [0.0, 0.014], [0.014, 0.014], [0.017, 0.008], [0.017, -0.008], [0.0, -0.010],
        ], 14), brass), -0.026 + i * 0.026, 0.078, 0.142, Math.PI / 2));
      }
      for (let i = 0; i < 5; i++) {
        P('fin' + i, at(mesh(plateGeo('dg2_fin', [
          [-0.008, 0], [0.008, 0], [0.006, 0.045], [-0.006, 0.045],
        ], 0.014, 0.002), brass), 0, 0.055, -0.188 - i * 0.030, 0.30));
      }
      P('barrel_core', at(mesh(latheGeo('dg2_barrel', [
        [0.010, -0.290], [0.028, -0.285], [0.030, 0.000], [0.030, 0.250],
      ], 22), brassD), 0, 0.010, -0.430));
      for (let i = 0; i < 11; i++) {
        P('disc' + i, at(mesh(latheGeo('dg2_disc', [
          [0.028, -0.011], [0.048, -0.011], [0.050, -0.005], [0.050, 0.005], [0.048, 0.011], [0.028, 0.011],
        ], 22), brass), 0, 0.010, -0.220 - i * 0.042));
      }
      for (let i = 0; i < 5; i++) {
        // One coil per accelerator disc — they used to fall between them.
        P('coil' + i, at(mesh(torusGeo(0.052, 0.0072, 6, 20), brass), 0, 0.010, -0.354 - i * 0.042));
      }
      P('muzzle_hub', at(mesh(latheGeo('dg2_hub', [
        [0.012, -0.048], [0.036, -0.046], [0.052, 0.020], [0.056, 0.044], [0.030, 0.046], [0.012, 0.020],
      ], 22), brass), 0, 0.010, -0.700));
      P('muzzle_ring', at(mesh(torusGeo(0.056, 0.006, 6, 22), brassD), 0, 0.010, -0.672));
      for (const [ang, len] of [[-0.55, 0.20], [-0.28, 0.23], [0, 0.24], [0.28, 0.23], [0.55, 0.20]]) {
        P('fork' + ang.toFixed(2), at(mesh(latheGeo('dg2_prong' + len.toFixed(2), [
          [0.001, -len / 2], [0.005, -len / 4], [0.008, len / 4], [0.010, len / 2],
        ], 10), WM.polished),
        Math.sin(ang) * 0.075, 0.020 + Math.abs(Math.cos(ang)) * 0.020, -0.820, 0, 0, -ang * 0.9));
        // Emitter beads, ON the tips of the prongs they belong to. They used to
        // be positioned from their own splay figures rather than the prongs',
        // which left five glowing beads hanging in a diagonal line 11mm off the
        // ends of the claw — on the archive page, blue bubbles in mid-air.
        P('forktip' + ang.toFixed(2), mesh(sphereGeo(0.010, 10, 8), glow,
          Math.sin(ang) * 0.075, 0.020 + Math.abs(Math.cos(ang)) * 0.020, -0.820 - len / 2 + 0.009));
      }
      P('spike', at(mesh(latheGeo('dg2_spike', [
        [0.001, -0.06], [0.005, 0], [0.010, 0.06],
      ], 10), WM.polished), 0, 0.056, -0.760));
      for (const sx of [0.035, -0.035]) {
        // Both ends of the loop terminate ON the accelerator stack. They used
        // to stop 10mm short of it and the cable hung under the gun untethered.
        P('cable' + sx, at(mesh(torusGeo(0.163, 0.007, 6, 16, Math.PI), WM.rubber),
          sx, -0.024, -0.4225, 0, Math.PI / 2, Math.PI));
      }
      P('guard', at(triggerGroup(steelD, { len: 0.062, drop: 0.036, thick: 0.013 }), 0, -0.058, 0.030));
      P('sight_f', frontSight(brassD, { aimY: A, z: -0.640, ears: 'ring', baseW: 0.020, baseH: 0.010 }));
      P('sight_r', rearNotch(A, 0.120, steelD, 0.028));
      P('hand_r', hand(0.014, -0.116, 0.148, -0.30));
      P('hand_l', supportHand(0.000, -0.058, -0.300, { pitch: 0.04 }));
      muzzleZ = -0.940;
      break;
    }
    case 'bowie': {
      // The box can roll the Bowie Knife, and with no case here it presented as
      // an empty patch of light above the crate. Full clip-point blade, brass
      // guard and a stacked-leather handle so the prize actually reads.
      const steel = pap ? STL : WM.machined;
      const brassM = pap ? BR : WM.brass;
      // blade: straight spine, swedged clip point, deep belly
      P('blade', profileZY('bowie_blade', [
        [0.010, 0.012], [-0.150, 0.012], [-0.215, 0.007], [-0.262, -0.010],
        [-0.238, -0.020], [-0.150, -0.026], [-0.040, -0.024], [0.010, -0.020],
      ], 0.0075, steel, 0, 0.004, -0.02));
      P('swedge', profileZY('bowie_swedge', [
        [-0.150, 0.011], [-0.258, -0.008], [-0.246, -0.013], [-0.150, 0.004],
      ], 0.0042, pap ? STD : WM.ironDark, 0, 0.004, -0.02));
      P('fuller', profileZY('bowie_fuller', [
        [-0.020, 0.006], [-0.196, 0.006], [-0.196, -0.001], [-0.020, -0.001],
      ], 0.0088, pap ? STD : WM.cavity, 0, 0.004, -0.02));
      // brass cross guard with the classic down-swept quillon
      P('guard', mesh(bevelBoxGeo(0.060, 0.011, 0.014, 0.0022), brassM, 0, 0.004, -0.008));
      P('quillon', mesh(bevelBoxGeo(0.013, 0.020, 0.012, 0.0022), brassM, -0.026, -0.004, -0.008, 0, 0, 0.35));
      P('ferrule', mesh(cylGeo(0.0145, 0.0155, 0.010, 12), brassM, 0, 0.004, 0.003, Math.PI / 2));
      // stacked leather washer handle, slight coke-bottle swell
      const grip = new THREE.Group();
      for (let i = 0; i < 11; i++) {
        const r = 0.0145 + Math.sin((i / 10) * Math.PI) * 0.0032;
        grip.add(mesh(cylGeo(r, r, 0.0092, 12), i & 1 ? WM.leather ?? WD : W,
          0, 0, 0.012 + i * 0.0094, Math.PI / 2));
      }
      P('grip', at(grip, 0, 0.004, 0));
      // latheGeo already lays a profile down the Z axis. The extra quarter turn
      // about X that used to be here tipped the pommel out of the handle and
      // dropped it 65mm below the knife.
      P('pommel', mesh(latheGeo('bowie_pommel', [
        [0.0010, 0.128], [0.0140, 0.124], [0.0175, 0.114], [0.0160, 0.100], [0.0120, 0.096],
      ], 14), brassM, 0, 0.004, 0));
      P('lanyard', mesh(torusGeo(0.0065, 0.0016, 5, 12), pap ? STD : WM.ironDark, 0, 0.004, 0.127));
      muzzleZ = -0.26;
      break;
    }
    case 'monkey': {
      const mk = buildMonkey();
      mk.scale.setScalar(0.9);
      mk.position.set(0.05, -0.14, -0.16);
      P('monkeyProp', mk);
      P('hand_r', foreGripHand(0.052, -0.150, -0.060, 0.10, { curl: 0.85, side: 1 }));
      muzzleZ = -0.3;
      break;
    }
    case 'acr': {
      const body = pap ? ST : WM.polymerTan;
      P('receiver', profileZY('acr_rcv', [
        [0.120, -0.036], [0.120, 0.046], [-0.140, 0.046], [-0.190, 0.034], [-0.190, -0.014], [-0.040, -0.036],
      ], 0.048, body, 0, 0.012, 0));
      P('rail', at(rail(STD, { len: 0.44, w: 0.022, h: 0.009, slots: 16 }), 0, 0.060, -0.200));
      P('ejection', ejectionPort(body, WM.cavity, { w: 0.052, h: 0.024, x: 0.0248, y: 0.034, z: -0.040, side: 1 }));
      P('handguard', at((() => {
        const h = new THREE.Group();
        h.add(profileZY('acr_hg', [
          [-0.150, -0.030], [-0.320, -0.026], [-0.320, 0.032], [-0.150, 0.036],
        ], 0.046, body, 0, 0, 0));
        for (const sx of [1, -1]) {
          for (let i = 0; i < 5; i++) {
            h.add(mesh(bevelBoxGeo(0.006, 0.008, 0.024, 0.0012), WM.cavity, sx * 0.023, -0.006, -0.180 - i * 0.030));
          }
        }
        return h;
      })(), 0, 0.008, 0));
      P('barrel', at(barrel(STD, { r: 0.0105, bore: 0.0054, len: 0.27, boreDepth: 0.05 }), 0, 0.020, -0.395));
      P('flash', at(flashHider(STL, { r: 0.014, len: 0.055, prongs: 4, bore: 0.0054 }), 0, 0.020, -0.558));
      P('mag', at(magazine(T.poly, STD, { w: 0.032, h: 0.150, d: 0.052, curve: 0.06, taper: 0.96, ribs: 3 }),
        0, -0.052, -0.100, 0.08));
      P('magwell', at(mesh(bevelBoxGeo(0.040, 0.030, 0.058, 0.005), body, 0, 0, 0), 0, -0.030, -0.096, 0.08));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.098, 0.050, 0.010), T.poly, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.062, 0.046, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), T.poly, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.088, 0.056, -0.26));
      P('guard', at(triggerGroup(body, { len: 0.060, drop: 0.034, thick: 0.012 }), 0, -0.034, 0.006));
      P('stock', at((() => {
        const s = new THREE.Group();
        s.add(profileZY('acr_stock', [
          [0.115, -0.014], [0.290, -0.014], [0.290, 0.046], [0.250, 0.046], [0.200, 0.014], [0.115, 0.014],
        ], 0.044, body, 0, 0, 0));
        s.add(mesh(bevelBoxGeo(0.046, 0.032, 0.070, 0.006), T.poly, 0, 0.026, 0.190)); // cheek riser
        s.add(mesh(bevelBoxGeo(0.044, 0.062, 0.018, 0.004), WM.rubber, 0, 0.014, 0.298));
        return s;
      })(), 0, 0.010, 0));
      P('charge', chargingHandle(STL, WM.cavity, { x: -0.026, y: 0.034, z: -0.110, len: 0.05, knob: 0.010 }));
      P('selector', selector(STL, { x: 0.024, y: -0.014, z: 0.030 }));
      P('sight_f', frontSight(STD, { aimY: A - 0.016, z: -0.330, ears: 'wings', baseW: 0.020, baseH: 0.008 }));
      P('sight_r', railRearSight(STD, { aimY: A - 0.016, z: 0.020 }));
      P('reddot', redDotSight(A, -0.120, T));
      P('hand_r', hand(0.014, -0.096, 0.062, -0.26));
      P('hand_l', supportHand(0.000, -0.036, -0.250, { pitch: 0.04 }));
      muzzleZ = -0.586;
      break;
    }
    case 'famas': {
      // Bullpup: full-length carry handle, mag behind the grip.
      P('body', profileZY('famas_body', [
        [0.230, -0.040], [0.230, 0.044], [-0.150, 0.044], [-0.210, 0.030], [-0.210, -0.018], [0.100, -0.040],
      ], 0.052, T.poly, 0, 0.010, 0));
      // The bridge has to pass UNDER the sight line, not through it. At 0.062
      // the handle stood across the peep ring and across the bottom of the PaP
      // optic — on a real FAMAS you look through the tunnel the handle makes,
      // which is what 0.045 restores.
      P('handle', at((() => {
        const h = new THREE.Group();
        h.add(mesh(bevelBoxGeo(0.028, 0.006, 0.330, 0.002), T.poly, 0, 0.038, 0));       // top bridge
        h.add(mesh(bevelBoxGeo(0.024, 0.042, 0.014, 0.003), T.poly, 0, 0.014, -0.158));  // front leg
        h.add(mesh(bevelBoxGeo(0.024, 0.042, 0.014, 0.003), T.poly, 0, 0.014, 0.158));   // rear leg
        for (const sx of [1, -1]) h.add(mesh(bevelBoxGeo(0.005, 0.026, 0.320, 0.0015), T.poly, sx * 0.013, 0.024, 0));
        return h;
      })(), 0, 0.045, -0.030));
      P('barrel', at(barrel(STD, { r: 0.0105, bore: 0.0054, len: 0.26, boreDepth: 0.05 }), 0, 0.020, -0.400));
      P('shroud', at(perfShroud(SH, { r: 0.021, len: 0.16, rows: 3, holes: 6, holeW: 0.36, band: 0.5 }), 0, 0.020, -0.330));
      P('flash', at(flashHider(STL, { r: 0.015, len: 0.062, prongs: 3, bore: 0.0054 }), 0, 0.020, -0.560));
      P('mag', at(magazine(T.poly, STD, { w: 0.032, h: 0.130, d: 0.050, taper: 0.98, ribs: 2 }),
        0, -0.048, 0.130, 0.06));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.098, 0.050, 0.010), T.poly, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.062, 0.046, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), T.poly, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.088, -0.080, -0.26));
      P('guard', at((() => {
        const gg = new THREE.Group();  // FAMAS full-hand guard
        gg.add(mesh(plateGeo('famas_guard', [
          [-0.055, 0.010], [0.055, 0.010], [0.055, -0.075], [0.045, -0.086], [-0.045, -0.086], [-0.055, -0.075],
        ], 0.012, 0.0018, [[[-0.043, 0.000], [0.043, 0.000], [0.043, -0.066], [-0.043, -0.066]]]), T.poly, 0, 0, 0));
        return gg;
      })(), 0, -0.034, -0.070, 0, Math.PI / 2, 0));
      P('trigger', at(mesh(bevelBoxGeo(0.008, 0.026, 0.010, 0.0015), STL, 0, 0, 0), 0, -0.052, -0.086));
      P('foregrip', at((() => {
        const f = new THREE.Group();
        f.add(mesh(bevelBoxGeo(0.044, 0.050, 0.150, 0.010), T.poly, 0, 0, 0));
        for (const sx of [1, -1]) {
          for (let i = 0; i < 4; i++) {
            f.add(mesh(bevelBoxGeo(0.005, 0.008, 0.020, 0.0012), WM.cavity, sx * 0.022, -0.008, -0.052 + i * 0.034));
          }
        }
        return f;
      })(), 0, -0.006, -0.240));
      P('butt', profileZY('famas_butt', [
        [0.226, -0.036], [0.256, -0.030], [0.256, 0.042], [0.226, 0.044],
      ], 0.050, WM.rubber, 0, 0.010, 0));
      P('cheek', at(mesh(bevelBoxGeo(0.046, 0.020, 0.140, 0.004), T.poly, 0, 0, 0), 0, 0.032, 0.140));
      P('bipod', at(bipod(STD, { spread: 0.5, len: 0.09, mount: -0.001, clamp: 0.021 }), 0, -0.024, -0.380));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.180, ears: 'ring', post: 'round', baseW: 0.020, baseH: 0.010 }));
      P('sight_r', rearAperture(A, 0.140, STD));
      const _rd = redDotSight(A, -0.030, T); _rd.visible = !!pap;
      if (pap) { parts.sight_r.visible = false; parts.sight_f.visible = false; }
      P('reddot', _rd);
      P('hand_r', hand(0.014, -0.096, -0.074, -0.26));
      P('hand_l', supportHand(0.000, -0.042, -0.245, { pitch: 0.04 }));
      muzzleZ = -0.596;
      break;
    }
    case 'galil': {
      P('receiver', profileZY('galil_rcv', [
        [0.130, -0.038], [0.130, 0.044], [-0.140, 0.044], [-0.190, 0.032], [-0.190, -0.016], [-0.030, -0.038],
      ], 0.050, ST, 0, 0.012, 0));
      P('dustcover', profileZY('galil_cover', [
        [0.120, 0.042], [0.120, 0.060], [-0.160, 0.056], [-0.160, 0.038],
      ], 0.046, SH, 0, 0.006, 0));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.052, h: 0.024, x: 0.026, y: 0.034, z: -0.040, side: 1 }));
      P('handguard', at((() => {
        const h = new THREE.Group();
        h.add(profileZY('galil_hg', [
          [-0.160, -0.030], [-0.350, -0.026], [-0.350, 0.030], [-0.160, 0.034],
        ], 0.050, T.poly, 0, 0, 0));
        for (const sx of [1, -1]) {
          for (let i = 0; i < 5; i++) {
            h.add(mesh(bevelBoxGeo(0.006, 0.030, 0.014, 0.0015), WM.cavity, sx * 0.025, 0.000, -0.190 - i * 0.030));
          }
        }
        return h;
      })(), 0, 0.008, 0));
      P('barrel', at(barrel(STD, { r: 0.0112, bore: 0.0058, len: 0.26, boreDepth: 0.055 }), 0, 0.022, -0.460));
      P('gasblock', at(mesh(bevelBoxGeo(0.026, 0.040, 0.040, 0.004), STD, 0, 0, 0), 0, 0.038, -0.380));
      P('gastube', at(mesh(cylGeo(0.012, 0.012, 0.20, 14), STD, 0, 0, 0), 0, 0.046, -0.270, Math.PI / 2));
      P('flash', at(flashHider(STL, { r: 0.016, len: 0.06, prongs: 3, bore: 0.0058 }), 0, 0.022, -0.618));
      P('mag', at(magazine(SH, STD, { w: 0.038, h: 0.180, d: 0.054, curve: 0.22, taper: 0.94, ribs: 4 }),
        0, -0.050, -0.090, 0.20));
      P('magwell', at(mesh(bevelBoxGeo(0.046, 0.036, 0.062, 0.005), SH, 0, 0, 0), 0, -0.030, -0.086, 0.20));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.038, 0.098, 0.052, 0.010), T.poly, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.041, 0.062, 0.048, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.033, 0.028, 0.045, 0.003), T.poly, 0, 0.059, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.088, 0.058, -0.26));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.034, thick: 0.012 }), 0, -0.034, 0.008));
      P('bipod_folded', at(mesh(bevelBoxGeo(0.038, 0.010, 0.130, 0.003), STD, 0, 0, 0), 0, -0.029, -0.290));
      // Carry handle and bolt handle both live OUTBOARD of the sight line. On
      // the centreline they stood squarely in the peep ring and in the PaP
      // optic's window — you were aiming at your own carry handle. The real
      // Galil hangs its handle off the left of the receiver and its bolt handle
      // off the right, which is the same answer for the same reason.
      P('handle', at(mesh(bevelBoxGeo(0.012, 0.048, 0.070, 0.004), SH, 0, 0, 0), -0.028, 0.078, -0.020));
      P('charge', chargingHandle(STL, WM.cavity, { x: 0.026, y: 0.058, z: -0.060, len: 0.05, knob: 0.010 }));
      P('selector', at(mesh(plateGeo('galil_sel', [
        [-0.006, 0.028], [0.010, 0.028], [0.010, -0.028], [-0.006, -0.028], [-0.014, 0.004],
      ], 0.005, 0.001), SH), 0.027, 0.016, 0.030, 0, Math.PI / 2, 0));
      // side-folding tubular stock
      P('stock', at((() => {
        const s = new THREE.Group();
        for (const sy of [0.020, -0.024]) s.add(mesh(cylGeo(0.007, 0.007, 0.20, 10), SH, 0, sy, 0.220, Math.PI / 2));
        s.add(mesh(cylGeo(0.012, 0.012, 0.052, 12), SH, 0, -0.002, 0.126, 0, 0, Math.PI / 2));
        return s;
      })(), 0, 0.006, 0));
      P('stock_pad', profileZY('galil_pad', [
        [0.310, -0.036], [0.338, -0.030], [0.338, 0.038], [0.310, 0.034],
      ], 0.042, WM.rubber, 0, 0.006, 0));
      P('sight_f', frontSight(STD, { aimY: A, z: -0.400, ears: 'ring', post: 'round', baseW: 0.024, baseH: 0.012 }));
      P('sight_r', rearAperture(A, -0.020, STD));
      const _rd = redDotSight(A, -0.060, T); _rd.visible = !!pap;
      if (pap) parts.sight_r.visible = false;
      P('reddot', _rd);
      P('hand_r', hand(0.014, -0.096, 0.064, -0.26));
      P('hand_l', supportHand(0.000, -0.036, -0.260, { pitch: 0.04 }));
      muzzleZ = -0.648;
      break;
    }
    case 'commando': {
      P('receiver', profileZY('cmd_rcv', [
        [0.120, -0.034], [0.120, 0.040], [-0.130, 0.040], [-0.180, 0.028], [-0.180, -0.014], [-0.040, -0.034],
      ], 0.046, ST, 0, 0.014, 0));
      // The handle's height is set by the optic, not the other way round. At the
      // old 0.048 the top bridge stood 8mm INTO the sight tube and ate the
      // bottom of the dot; 0.039 tops the bridge out just under the tube, which
      // is also how a real ARMS-mount optic sits on a carry handle — clamped on
      // top of it rather than sunk through it.
      P('carryhandle', at((() => {
        const h = new THREE.Group();
        h.add(mesh(bevelBoxGeo(0.026, 0.010, 0.190, 0.002), ST, 0, 0.040, 0));
        h.add(mesh(bevelBoxGeo(0.024, 0.040, 0.014, 0.003), ST, 0, 0.018, -0.088));
        h.add(mesh(bevelBoxGeo(0.028, 0.044, 0.030, 0.004), ST, 0, 0.016, 0.080));
        for (const sx of [1, -1]) h.add(mesh(bevelBoxGeo(0.005, 0.024, 0.180, 0.0015), ST, sx * 0.012, 0.026, 0));
        return h;
      })(), 0, 0.039, -0.040));
      P('ejection', ejectionPort(ST, WM.cavity, { w: 0.05, h: 0.024, x: 0.0238, y: 0.036, z: -0.030, side: 1 }));
      P('forwardassist', at(mesh(cylGeo(0.008, 0.007, 0.020, 10), ST, 0, 0, 0), 0.026, 0.020, 0.020, 0, 0, Math.PI / 2));
      P('handguard', at((() => {
        const h = new THREE.Group();
        h.add(mesh(latheGeo('cmd_hg', [
          [0.020, -0.120], [0.029, -0.112], [0.029, 0.100], [0.020, 0.112],
        ], 20), T.poly));
        for (let i = 0; i < 4; i++) {
          for (const sx of [1, -1]) {
            h.add(mesh(bevelBoxGeo(0.006, 0.010, 0.030, 0.0012), WM.cavity, sx * 0.028, 0.004, -0.075 + i * 0.048));
          }
        }
        h.add(mesh(torusGeo(0.030, 0.004, 5, 18), STD, 0, 0, 0.112));
        return h;
      })(), 0, 0.018, -0.290));
      P('barrel', at(barrel(STD, { r: 0.0098, bore: 0.0052, len: 0.20, boreDepth: 0.05 }), 0, 0.018, -0.500));
      P('flash', at(flashHider(STL, { r: 0.014, len: 0.055, prongs: 4, bore: 0.0052 }), 0, 0.018, -0.628));
      P('mag', at(magazine(SH, STD, { w: 0.032, h: 0.155, d: 0.050, curve: 0.10, taper: 0.96, ribs: 3 }),
        0, -0.050, -0.090, 0.10));
      P('magwell', at(mesh(bevelBoxGeo(0.038, 0.032, 0.056, 0.005), ST, 0, 0, 0), 0, -0.028, -0.086, 0.10));
      P('grip', at((() => {
        const gr = new THREE.Group();
        gr.add(mesh(bevelBoxGeo(0.036, 0.096, 0.050, 0.010), T.poly, 0, 0, 0));
        gr.add(mesh(bevelBoxGeo(0.039, 0.060, 0.046, 0.006), WM.grip, 0, -0.012, 0));
        gr.add(mesh(bevelBoxGeo(0.031, 0.028, 0.043, 0.003), T.poly, 0, 0.058, 0));   // tang up into the housing
        return gr;
      })(), 0, -0.086, 0.056, -0.26));
      P('guard', at(triggerGroup(ST, { len: 0.060, drop: 0.034, thick: 0.012 }), 0, -0.032, 0.006));
      P('stock', at((() => {
        const s = new THREE.Group();
        s.add(mesh(latheGeo('cmd_stock', [
          [0.020, -0.110], [0.026, -0.100], [0.026, 0.080], [0.032, 0.090], [0.032, 0.110],
        ], 18), T.poly));
        s.add(mesh(bevelBoxGeo(0.044, 0.062, 0.018, 0.004), WM.rubber, 0, 0.004, 0.116));
        for (let i = 0; i < 3; i++) s.add(mesh(bevelBoxGeo(0.010, 0.008, 0.014, 0.0015), WM.cavity, 0, -0.026, -0.040 + i * 0.038));
        return s;
      })(), 0, 0.012, 0.230));
      P('charge', at(mesh(bevelBoxGeo(0.030, 0.012, 0.020, 0.002), STL, 0, 0, 0), 0, 0.036, 0.130));
      P('selector', selector(STL, { x: 0.024, y: -0.010, z: 0.030 }));
      P('sight_f', frontSight(STD, { aimY: A - 0.018, z: -0.380, ears: 'hood', post: 'round', baseW: 0.024, baseH: 0.014, mount: 0.047, band: 0.029 }));
      P('sight_r', rearAperture(A - 0.018, 0.040, STD));
      P('reddot', redDotSight(A, -0.080, T));
      P('hand_r', hand(0.014, -0.094, 0.062, -0.26));
      P('hand_l', supportHand(0.000, -0.026, -0.290, { pitch: 0.04 }));
      muzzleZ = -0.656;
      break;
    }
  }
  // An optic and a rear iron sight cannot both stand in the eye's path. The
  // iron sits BEHIND the glass, so its protective ears rise into the middle of
  // the window — on the AK-74u they covered the bottom half of the dot, which
  // is the whole reason you could not see the reticle. A real optic install
  // strips or folds the rear leaf and whatever base it stood on, so do that.
  // The front post stays: it is forward of the reticle, and seeing it low in
  // the glass is what looking through a red dot actually looks like.
  if (parts.reddot?.visible) {
    for (const k of ['sight_r', 'sight_base']) if (parts[k]) parts[k].visible = false;
  }
  // A sight line has to clear the weapon it runs over. These were placed from a
  // table of aim heights rather than from the receivers they sit on, and a lot of
  // them ended up BELOW their own receiver top: the Gewehr 43's by 8mm, the
  // Garand's by 10mm, the AK-74u's red dot by 17mm — which is exactly the raised
  // part in front of the dot you could not aim past. Aiming those put your eye
  // inside the gun. So measure the tallest thing standing in the eye's path and
  // lift the whole sighting arrangement until the channel you look down is clear.
  //
  // Front and rear move together, because a sight line only means anything if
  // both ends are on it, and anything left hanging gets a boss down to whatever
  // it is supposed to be bolted to.
  {
    const rd = parts.reddot?.visible ? parts.reddot : null;
    const sights = ['sight', 'sight_f', 'sight_r', 'sight_base', 'reddot', 'scope']
      .map((k) => parts[k]).filter(Boolean);
    // The channel: an optic's whole glass has to be see-through, and an iron
    // sight needs the whole FRONT POST, not just the line through its tip.
    // Clearing only the line itself, which is what this used to ask for, let gas
    // tubes and barrel bands stand a millimetre under it — and since those sit
    // out at the muzzle alongside the post, a millimetre there hides the post's
    // whole length. The post is the tallest thing that has to stay in view, so
    // it sets the clearance.
    const width = rd ? (rd.userData.opticR ?? 0.019) * 0.9 : 0.010;
    const rise = rd ? width + 0.001 : FRONT_POST_H + 0.002;
    // Obstructions count up to the near face of the sight. What lies beyond it
    // you are looking THROUGH, which is what a sight picture is.
    g.updateMatrixWorld(true);
    const boxOf = (node) => (_aimBox.setFromObject(node), _aimBox.isEmpty() ? null : _aimBox.clone());
    const front = rd ? null : (parts.sight_f && boxOf(parts.sight_f));
    const fromZ = rd ? (rd.userData.opticGlassZ ?? rd.position.z) : front?.min.z;
    const inPath = (b) => b.min.x < width && b.max.x > -width && b.max.z > fromZ;
    const others = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) if (!p.visible || sights.includes(p)) return;
      others.push({ o, b: boxOf(o) });
    });
    let top = -Infinity;
    if (fromZ != null) for (const { b } of others) if (b && inPath(b)) top = Math.max(top, b.max.y);
    // Capped, because past a couple of centimetres the answer is not a taller
    // sight boss but a part that should not be on the centreline at all. Anything
    // that needs more than this is a modelling bug, and the validator says so.
    const lift = top > -Infinity ? Math.min(0.020, Math.max(0, top + rise - A)) : 0;
    if (lift > 0) {
      for (const s of sights) {
        const b = boxOf(s);
        s.position.y += lift;
        if (!b || !s.visible) continue;
        // The lift leaves a hole exactly `lift` tall under the sight. Fill THAT,
        // rather than hunting for whatever is underneath: the vacated volume is
        // by definition still touching whatever the sight was bolted to, so a
        // boss occupying it cannot leave the sight hanging.
        // Narrow, and sunk well past where the sight used to sit: a front sight
        // stands on a ROUND barrel, so a wide flat-bottomed boss only touches at
        // its corners and a shallow one clears the crown entirely.
        const w = Math.min(0.014, (b.max.x - b.min.x) * 0.5);
        const d = Math.min(0.028, (b.max.z - b.min.z) * 0.8);
        const drop = 0.008;
        s.add(mesh(bevelBoxGeo(w, lift + drop + 0.002, d, 0.0015), STD,
          (b.min.x + b.max.x) / 2 - s.position.x,
          b.min.y + (lift - drop) / 2 - s.position.y,
          (b.min.z + b.max.z) / 2 - s.position.z));
      }
    }
    // ADS aligns the eye with the sight you are actually looking through, so it
    // is the optic's axis when one is fitted and the lifted iron line otherwise.
    aimY = rd ? rd.position.y : A + lift;
  }
  // muzzle anchor
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, muzzleZ);
  g.add(muzzle);
  const strip = (o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } };
  g.traverse(strip);
  handsG.traverse(strip);
  // The returned root carries the display transform on `g`; the rig resets it.
  const root = new THREE.Group();
  root.add(g);
  root.userData.muzzle = muzzle;
  root.userData.parts = parts;
  root.userData.cls = s.cls;
  // For true sight-picture ADS alignment: the optic's axis when one is fitted,
  // otherwise the iron sight line this weapon was authored around.
  root.userData.sightY = aimY - 0.006;
  // Where the eye goes when aiming, both in the authored view frame and before
  // any display transform. WeaponRig.adsDepth() solves the pose from these.
  //
  //   aimZ   the eye-side face of whatever you look THROUGH — optic tube, peep
  //          ring, notch leaf, scope eyepiece. A cheek weld puts the eye an
  //          eye-relief behind this, and everything else follows from that.
  //   rearZ  the back of the weapon. How far it reaches behind aimZ is what
  //          says whether there is a stock to bring to your shoulder at all.
  g.updateMatrixWorld(true);
  const eyeFaceZ = (node) => {
    if (!node?.visible) return null;
    _aimBox.setFromObject(node);
    return _aimBox.isEmpty() ? null : _aimBox.max.z;
  };
  // Rear elements only. A cheek weld needs something to weld TO — an optic tube,
  // a peep ring, a notch leaf — and a bead at the muzzle is not it. Solving the
  // weld off the front sight is how the double-barrel ended up with its own bead
  // 12cm from the eye, filling the middle of the screen with the hood that is
  // supposed to frame it, and how the Panzerschreck's ladder — which sits a foot
  // out along the tube, not against your cheek — pulled a 21cm blast shield to
  // within 12cm of the lens.
  root.userData.aimZ = [parts.reddot, parts.scope, parts.sight_r, parts.sight_base]
    .reduce((acc, p) => acc ?? eyeFaceZ(p), null);
  // Shouldering a weapon puts its butt behind your cheek, not in front of your
  // nose. The rig has no head to tuck it behind — and it cannot just drag the
  // whole weapon back, because that lands the receiver ON the lens and turns the
  // sight picture into a foreshortened close-up of the gun's own backside, which
  // is exactly as unaimable as the buttpad was. So the parts that live ENTIRELY
  // behind the sight — which is what a buttstock IS — ride back past the lens as
  // you aim, and the rest of the weapon stays where it reads.
  const tuck = [];
  if (root.userData.aimZ != null) {
    for (const node of Object.values(parts)) {
      if (!node?.parent || node.parent !== g) continue;
      _aimBox.setFromObject(node);
      if (_aimBox.isEmpty() || _aimBox.min.z < root.userData.aimZ + 0.02) continue;
      tuck.push({ node, baseZ: node.position.z, frontZ: _aimBox.min.z });
    }
  }
  root.userData.adsTuck = tuck;
  // The back of the WHOLE weapon, tuck or no tuck. This is the "is there a stock
  // to bring to a shoulder at all" question, and a stock that is about to slide
  // out of frame is still a stock.
  _aimBox.setFromObject(g);
  root.userData.rearZ = _aimBox.isEmpty() ? null : _aimBox.max.z;
  // The nearest thing to the eye that will still be ON SCREEN once the weapon is
  // shouldered — and so the thing that says how far in the cheek weld may go.
  // A one-piece stock runs forward under the barrel and cannot be tucked away on
  // its own; a receiver cover, a carry handle or a bolt cannot be tucked at all.
  // Put the eye an eye-relief behind the sight regardless and the Gewehr 43's
  // receiver lands 13mm off the lens, inside the near plane, sliced open.
  //
  // Only the channel around the sight line counts. At the clearance below, the
  // frame is about this tall and this wide, so anything outside it is off screen
  // however close it gets — which is exactly what lets a buttpad slide past your
  // cheek while a receiver cover may not.
  const tucked = new Set(tuck.map((t) => t.node));
  let faceZ = -Infinity;
  for (const child of g.children) {
    if (tucked.has(child)) continue;
    child.traverse((o) => {
      if (!o.isMesh || !o.geometry?.getAttribute('position')) return;
      for (let p = o; p && p !== g; p = p.parent) if (!p.visible) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        _aimVec.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (_aimVec.z <= faceZ) continue;
        if (Math.abs(_aimVec.y - aimY) > ADS_FACE_HALF_H) continue;
        if (Math.abs(_aimVec.x) > ADS_FACE_HALF_W) continue;
        faceZ = _aimVec.z;
      }
    });
  }
  root.userData.faceZ = faceZ > -Infinity ? faceZ : null;
  root.userData.viewNode = g;
  root.userData.handsGroup = handsG;
  root.frustumCulled = false;
  return root;
}

// Muzzle flash texture (canvas, original)
let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.3, 'rgba(255,180,80,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // spikes
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.save(); g.translate(64, 64); g.rotate((i / 6) * Math.PI * 2 + 0.3);
    const lg = g.createLinearGradient(0, 0, 60, 0);
    lg.addColorStop(0, 'rgba(255,220,150,0.9)');
    lg.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(8, -5); g.lineTo(62, 0); g.lineTo(8, 5); g.closePath(); g.fill();
    g.restore();
  }
  _flashTex = new THREE.CanvasTexture(c);
  _flashTex.colorSpace = THREE.SRGBColorSpace;
  return _flashTex;
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

// ---- ADS depth ------------------------------------------------------------
// The authored ADS depth: how far out in front of the lens a weapon is held
// when it is HELD rather than shouldered. Right for a pistol at arm's length,
// where the frame really does end two hands away from your face.
const ADS_HELD_Z = -0.26;
// A cheek weld. Shouldering a weapon puts the thing you look through about this
// far from your eye — and puts the butt PAST your cheek, behind the lens, where
// the near plane hides it. Holding a rifle out at arm's length instead is what
// left the buttpad of every shouldered weapon in the middle of the screen with
// the stock filling the bottom third of the frame.
const ADS_EYE_RELIEF = 0.095;
// A weapon that reaches further than this behind the thing you look through has
// a stock on it, and goes to the shoulder. Measured rather than declared by
// class: the Wunderwaffe is a `wonder` and the Panzerschreck a `launcher`, and
// both are shouldered, while the Ray Gun of the same class is not.
const ADS_STOCK_REACH = 0.10;
// How close anything that CANNOT be tucked out of the way may come to the lens.
// The eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
// rectilinear camera: solved outright, the Gewehr 43's receiver lands 13mm off
// the lens — a millimetre outside the near plane, sliced open — and the
// Browning's carry handle covers a third of the screen. Each weapon closes as
// far as its own back end allows and no further, which is why the Type 100 gets
// most of a cheek weld while the AK-74u, with a receiver cover reaching almost
// to its own dot, keeps its distance.
const ADS_FACE_CLEAR = 0.05;
// Clearance behind the lens for a stock that has gone to the shoulder. The near
// plane does the hiding; this is just far enough past it to stay hidden through
// the bob and the recoil settle. See WeaponRig.tuckStock().
const ADS_BUTT_CLEAR = 0.02;

// ---- recoil authority while aiming ----------------------------------------
// Hip-fire can afford to throw the weapon around: nothing on it has to stay
// registered against anything. ADS cannot. Aiming puts the sight ON the optical
// axis, so every millimetre the viewmodel moves is a millimetre the sight
// picture moves, magnified by the narrower viewmodel lens.
//
// The pose used to apply the kick at full strength either way, and `kick` never
// decays between rounds of an automatic: at the FG42's 937rpm it swung
// 0.37..1.00 fifteen times a second, which is 5.8 degrees of muzzle flip and
// 5.7cm of travel toward a lens 26cm away. That is not a recoil animation, it
// is a vibration — and the travel is why an aimed weapon appeared to pulse in
// SIZE rather than to kick.
//
// So an aimed weapon keeps the recoil it can spend along the sight line and
// gives up the part that swings the sights off it:
//   ADS_KICK_PITCH   muzzle flip. Cut hardest: rotation is what walks the front
//                    post out of the aperture.
//   ADS_KICK_PUSH    straight back along the bore. Survives better because it
//                    runs along the aim line rather than across it, but it is
//                    also the term that changes apparent size, so it is not
//                    close to free either.
//   ADS_KICK_IMPULSE a shouldered weapon is braced — each round disturbs it
//   ADS_KICK_SETTLE  less, and it returns sooner. Together these keep the kick
//                    settling between rounds instead of riding its clamp for a
//                    whole burst, which is what turned per-shot kicks into one
//                    continuous buzz.
const ADS_KICK_PITCH = 0.15;
const ADS_KICK_PUSH = 0.32;
const ADS_KICK_IMPULSE = 0.30;
const ADS_KICK_SETTLE = 11;

// The arc a freshly equipped weapon comes up out of. At equipT 0 it hangs this
// far below the rest pose, pitched this far muzzle-down — below the frame, which
// is the whole point: the exchange itself is never on screen. Shared with the
// holster drop so a swap goes down and comes back up the same axis, and with
// equip() so the model is posed on the frame it is built.
const EQUIP_RAISE_DROP = 0.35;
const EQUIP_RAISE_PITCH = 0.7;

// Handles view-model positioning, sway, bob, recoil, per-class reload animation
export class WeaponRig {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.hipPos = new THREE.Vector3(0.23, -0.205, -0.4);
    // The lens the viewmodel is filmed through, as told to us by setViewLens().
    // Identity until then, which is the right answer for anything that renders
    // the rig with the world camera.
    this.viewScale = 1;
    this.viewOffsetZ = 0;
    // Viewmodel fill. Pushed further out with a longer range and linear-ish
    // falloff: at the old 1.5m/decay-1.8 setting anything that came within
    // ~15cm of the lens (a glove, a cuff during a reload) hit the inverse-square
    // knee and blew to white. This keeps the weapon readable without a hotspot.
    this.fill = new THREE.PointLight(0xfff2e0, 0.9, 3.2, 1.15);
    this.fill.position.set(0.22, 0.06, -0.42);
    this.fill.layers.enableAll();
    camera.add(this.fill);
    this.current = null;
    this.kick = 0;
    this.reloadT = 0; this.reloadDur = 0;
    this.equipT = 1;
    // Holster phase of a weapon swap. equip() replaces the model instantly, so
    // without this the old gun VANISHES and the new one rises out of nothing —
    // read as a flicker rather than a swap. Lower first, then exchange, then
    // raise: the exchange happens while the frame is empty, so it is invisible.
    this.holsterT = 0;
    this.holsterDur = 0.13;
    this.pendingEquip = null;
    this.adsT = 0;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
    this.slideT = 0;          // 0..1 slide pose blend, damped in and out
    this.slideHit = 0;        // entry impulse, decays over the slide
    this.meleeT = 0;
    this.boltT = 0; // bolt/pump cycle after firing
    this.inspectT = 0; // weapon inspection (PaP take)
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.setScalar(0.22);
    this.flashT = 0;
    // ---- trench knife (shown only during the melee slash) ----
    this.knifeGold = false;
    this.knife = new THREE.Group();
    {
      const grip = bx(0.034, 0.04, 0.15, M.woodDark, 0, 0, 0.02);
      const pommel = bx(0.04, 0.045, 0.025, M.steelDark, 0, 0, 0.105);
      const guard = bx(0.075, 0.05, 0.014, M.steelDark, 0, 0, -0.06);
      const bladeMat = M.steelLight.clone();
      const blade = bx(0.008, 0.046, 0.34, bladeMat, 0, 0.004, -0.24);
      const tip = cyl(0.023, 0.001, 0.07, bladeMat, 0, 0.004, -0.445, Math.PI / 2, 0, 0, 4);
      this.knifeBlade = blade; this.knifeTip = tip;
      tip.scale.x = 0.35;
      const fuller = bx(0.009, 0.009, 0.26, M.steelDark, 0, 0.013, -0.23);
      const knuckles = bx(0.078, 0.014, 0.014, M.brass, 0, 0.028, -0.06);
      // A real fist on the handle, not a cube: the knife is the one time the
      // hand is the largest thing on screen.
      const fist = knifeHand(1, { scale: 0.97 });
      fist.position.set(0.002, -0.004, 0.028);
      fist.rotation.set(0.16, 0.06, -0.10);
      const knurl1 = bx(0.036, 0.044, 0.012, M.wood, 0, 0, 0.0);
      const knurl2 = bx(0.036, 0.044, 0.012, M.wood, 0, 0, 0.05);
      this.knife.add(grip, pommel, guard, blade, tip, fuller, knuckles, fist, knurl1, knurl2);
      this.knife.visible = false;
      this.root.add(this.knife);
    }
    // ---- cymbal monkey (wind-up before the throw) ----
    this.monkeyProp = buildMonkey();
    this.monkeyProp.visible = false;
    this.monkeyProp.position.set(0.16, -0.12, -0.42);
    this.root.add(this.monkeyProp);
    this.monkeyT = 0;
    // ---- empty hands for the PaP knuckle crack ----
    // Real articulated hands, not blocks: this is the one moment in the game
    // where nothing else is on screen, so every finger joint is visible.
    this.fists = new THREE.Group();
    {
      this.fistL = crackFist(-1);
      this.fistR = crackFist(1);
      this.handL = this.fistL.userData.hand;
      this.handR = this.fistR.userData.hand;
      this.fists.add(this.fistL, this.fistR);
      this.fists.visible = false;
      this.root.add(this.fists);
    }
    this.knuckleT = 0;
    this.perkBottle = null;
    this.perkDrinkT = 0;
    this.perkDrinkId = null;
  }

  // WaW PaP ritual: gun goes in, empty hands come up, two sharp cracks
  knuckleCrack() { this.knuckleT = 0.0001; }

  monkeyWindup() { this.monkeyT = 1; }

  startInspect() { this.inspectT = 0.0001; }

  startPerkDrink(perkId) {
    if (this.perkDrinkT > 0) return false;
    if (this.perkBottle) this.root.remove(this.perkBottle);
    this.perkBottle = buildPerkBottle(perkId);
    this.perkBottle.visible = true;
    // Pose and swap on THIS frame, not the next update(). A drink starts from
    // updateInteract, which runs after the rig update, so anything left for the
    // next frame gets one rendered frame of an unposed bottle sitting on the
    // camera and of the gun still in hand.
    posePerkBottle(this.perkBottle, 0);
    if (this.current) this.current.group.visible = false;
    this.root.add(this.perkBottle);
    this.perkDrinkId = perkId;
    this.perkDrinkT = 0.0001;
    this.reloadT = 0;
    this.inspectT = 0;
    this.meleeT = 0;
    return true;
  }

  get isDrinkingPerk() { return this.perkDrinkT > 0; }

  applyGoldCamo(on) {
    // BO1 gold: deep polished metal, real env reflections, slow sheen sweep + occasional glint
    if (on && this.current) {
      const mats = [];
      this.current.group.traverse((o) => {
        if (wearsWeaponFinish(o)) {
          o.material = o.material.clone();
          o.material.color.set(0xd4af37);
          o.material.metalness = 1.0;
          o.material.roughness = 0.3;
          o.material.envMap = metalEnvTex();
          o.material.envMapIntensity = 1.7;
          o.material.emissive = new THREE.Color(0x3a2a00);
          o.material.emissiveIntensity = 0.08;
          mats.push(o.material);
        }
      });
      this.goldCamo = { mats, t: Math.random() * 9 };
    } else this.goldCamo = null;
  }

  applyDiamondCamo() {
    // BO6-style diamond: platinum-white metal, hard reflections, elegant twinkling facets
    if (!this.current) return;
    const mats = [];
    this.current.group.traverse((o) => {
      if (wearsWeaponFinish(o)) {
        o.material = o.material.clone();
        o.material.color.set(0xf4f6fa);
        o.material.metalness = 1.0;
        o.material.roughness = 0.06;
        o.material.envMap = metalEnvTex();
        o.material.envMapIntensity = 1.7;
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = sparkleTex();
        o.material.emissiveIntensity = 0.2;
        mats.push(o.material);
      }
    });
    this.diamondCamo = { mats, t: 0 };
    this.flash.material.color.set(0xd8ecff); // icy muzzle flash
  }

  /**
   * Tell the rig which lens the viewmodel is filmed through.
   *
   * game.js re-parents the rig under a node that scales it and pushes it out so
   * the narrow viewmodel FOV does not double the weapon's apparent size. The
   * ADS pose has to solve for distances measured from the EYE, so it needs that
   * transform: camera-space z of an authored z is `offsetZ + scale * z`.
   */
  setViewLens(scale, offsetZ) {
    this.viewScale = scale || 1;
    this.viewOffsetZ = offsetZ || 0;
    if (this.current) this.current.adsZ = undefined;   // re-solve on the next frame
  }

  /**
   * The ADS depth for the equipped weapon, in the authored frame.
   *
   * One hardcoded number used to serve all 31 weapons, and it held every one of
   * them out at arm's length. Nobody aims a rifle at arm's length: you bring it
   * to your shoulder, which puts the rear sight a hand's width from your eye and
   * the butt BEHIND your cheek. Held out in front instead, the sight ended up
   * half a metre away — too small to aim with — and the stock, which should have
   * been behind the lens entirely, filled the bottom third of the frame.
   *
   * So solve for the cheek weld: put whatever you look THROUGH an eye-relief in
   * front of the lens. Weapons with nothing behind their sights — the pistols,
   * the Ray Gun, the knife — have no shoulder to come back to and keep the pose
   * they were authored with.
   *
   * But BOUND how far that travels by what is left behind the sight, because the
   * eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
   * rectilinear camera. Solved outright, an AK-74u comes back far enough to put
   * its receiver cover 2cm off the lens: the dot is lovely and the whole bottom
   * half of the screen is a foreshortened chrome slab of the gun's own backside,
   * which is no more aimable than the buttpad it replaced. The butt is not what
   * has to move to fix that — see tuckStock() — so each weapon closes only as
   * far as its own back end allows, and a weapon whose back end is clear (the
   * Type 100, the MP40) gets the whole cheek weld.
   */
  adsDepth(entry) {
    const { aimZ, rearZ, faceZ } = entry.group.userData;
    // Camera-space z of an authored z is `viewOffsetZ + viewScale * z`; solve
    // that for the depth landing a given authored z a given distance out.
    const depthFor = (z, dist) => (-dist - this.viewOffsetZ) / this.viewScale - z;
    const shouldered = aimZ != null && rearZ != null && rearZ - aimZ > ADS_STOCK_REACH;
    const depth = shouldered ? depthFor(aimZ, ADS_EYE_RELIEF) : ADS_HELD_Z;
    if (faceZ == null) return depth;
    return Math.min(depth, depthFor(faceZ, ADS_FACE_CLEAR));
  }

  /**
   * Send the buttstock to the shoulder as the weapon comes up.
   *
   * A shouldered stock is behind your cheek, so nothing of it should be on
   * screen — but the rig has no head, and dragging the whole weapon back far
   * enough to hide the butt puts the receiver on the lens instead, which reads
   * as a foreshortened close-up of the gun's own backside and is no easier to
   * aim than the buttpad was. Moving only the stock costs nothing in the sight
   * picture and is what the eye expects to see anyway.
   *
   * It slides straight down the view axis, away from the eye, so on screen it
   * only recedes — and it does not start until the weapon is a third of the way
   * up, which keeps the hip pose exactly as authored.
   */
  tuckStock(g, depth, t) {
    const tuck = g.userData.adsTuck;
    if (!tuck?.length) return;
    const ramp = Math.max(0, Math.min(1, (t - 0.34) / 0.66));
    const clear = (ADS_BUTT_CLEAR - this.viewOffsetZ) / this.viewScale;
    for (const { node, baseZ, frontZ } of tuck) {
      node.position.z = baseZ + ramp * Math.max(0, clear - frontZ - depth);
    }
  }

  setKnifeGold(on) {
    // golden glowing Bowie finish
    if (!this.knifeBlade) return;
    this.knifeGold = on;
    const m = this.knifeBlade.material;
    if (!takesPbrFinish(m)) return; // see takesPbrFinish: `emissive` on an unlit material throws mid-render
    if (on) {
      m.color.set(0xd8b84a);
      m.metalness = 0.9; m.roughness = 0.22;
      m.emissive = new THREE.Color(0xa87c14);
      m.emissiveIntensity = 0.9;
    } else {
      m.color.set(0x78808d); m.emissive = new THREE.Color(0x000000); m.emissiveIntensity = 0;
    }
    this.knifeTip.material = m;
  }

  /**
   * Animated weapon change: lower what is in frame, exchange the model out of
   * sight, then let equipT raise the new one. Falls through to an immediate
   * equip when the hands are empty, so first spawn and pickups stay instant.
   */
  swapTo(id, pap) {
    if (!this.current) { this.equip(id, pap); return; }
    this.holsterT = this.holsterDur;
    this.pendingEquip = { id, pap };
  }

  equip(id, pap) {
    if (this.current) this.root.remove(this.current.group);
    const group = buildViewmodel(id, pap);
    // The builder hands back a world-display presentation (centred, levelled,
    // scaled to hover over the mystery box, no hands). First person wants the
    // raw authored frame plus the gloves.
    const vm = group.userData.viewNode;
    if (vm) { vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); vm.scale.setScalar(1); }
    const hands = group.userData.handsGroup;
    if (hands) (vm || group).add(hands);
    this.root.add(group);
    this.current = { id, pap, group, parts: group.userData.parts, cls: group.userData.cls };
    // PaP living finish: clone materials, attach scrolling pattern + palette
    this.camo = null;
    this.goldCamo = null;
    this.diamondCamo = null;
    const wantDiamond = pap && (this.alwaysGold || this.diamondNext);
    this.diamondNext = false;
    if (wantDiamond) {
      this.applyDiamondCamo();
    } else if (pap) {
      this.camo = applyPapLivingFinish(group, id, Math.random() * 10);
      // Settle the finish onto the frame it is built. applyPapLivingFinish leaves
      // emissive BLACK and only advance() gives it a colour, so a PaP weapon
      // handed over by papTake() — which runs after the rig update — spent its
      // first rendered frame as an unlit grey gun that then lit up. Dimmer than
      // steady state rather than brighter, so it was never the white flash, but
      // it is the same defect: the frame that builds a model must also dress it.
      advancePapLivingFinish(this.camo, 0);
      this.flash.material.color.setHSL(this.camo.style.hues[0], 0.95, 0.62); // PaP muzzle flash tint
    } else {
      this.flash.material.color.set(0xffffff);
      if (this.alwaysGold) this.applyGoldCamo(true); // GOLD STANDARD cheat
    }
    // attach flash at muzzle
    this.flash.removeFromParent();
    group.userData.muzzle.add(this.flash);
    this.equipT = 0;
    this.reloadT = 0;
    this.kick = 0;
    this._handsPosed = false;
    // Pose it NOW, at the bottom of its own raise, rather than leaving it on the
    // identity transform for update() to find next frame. equip() is called from
    // interaction code that runs AFTER the rig update — papTake(), giveWeapon() —
    // so a model left unposed is rendered once with its authored origin ON the
    // lens: a screenful of out-of-focus receiver that reads as a flash, not as a
    // gun. One frame is plenty to see it, because the frame that builds a
    // view-model is also the frame its materials compile, so it is the longest
    // frame of the whole hand-over.
    this._poseRaiseStart(group);
  }

  /** Bottom of the equip raise: exactly what update() computes at equipT 0. */
  _poseRaiseStart(group) {
    group.position.copy(this.hipPos);
    group.position.y -= EQUIP_RAISE_DROP;
    group.rotation.set(-EQUIP_RAISE_PITCH, 0, 0);
  }

  startReload(dur) { this.reloadDur = dur; this.reloadT = 0.0001; }
  get isReloading() { return this.reloadT > 0; }
  cycleBolt() { this.boltT = 0.0001; }
  get muzzleWorld() {
    if (!this.current) return new THREE.Vector3();
    return this.current.group.userData.muzzle.getWorldPosition(new THREE.Vector3());
  }
  fire() {
    // Scaled by how far into the shoulder the weapon already is, not by whether
    // the aim key is down: a shot fired halfway into the raise should disturb
    // the weapon halfway as much, or the kick jumps the moment ADS completes.
    this.kick = Math.min(1, this.kick + lerp(0.7, ADS_KICK_IMPULSE, this.adsT));
    this.flashT = 0.045;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(0.18 + Math.random() * 0.1);
    if (this.current && (WEAPONS[this.current.id].bolt || WEAPONS[this.current.id].pump)) this.cycleBolt();
  }

  /** Authored rest transform of an animated part, captured on first touch. */
  _rest(o) {
    return o.userData.__rest ?? (o.userData.__rest = {
      p: o.position.clone(), r: o.rotation.clone(),
    });
  }

  /** Put both gloves back exactly where the view-model authored them. */
  _restHands() {
    const cur = this.current;
    if (!cur || !this._handsPosed) return;
    for (const key of ['hand_l', 'hand_r']) {
      const w = cur.parts[key];
      if (!w?.userData?.__rest) continue;
      w.position.copy(w.userData.__rest.p);
      w.rotation.copy(w.userData.__rest.r);
      if (w.userData.hand) resetHandPose(w.userData.hand);
    }
    this._handsPosed = false;
  }

  /**
   * Move a support/trigger hand onto something it is supposed to be holding.
   *
   * `amt` 0 leaves it on its authored grip, 1 puts it fully on the target.
   * `grip` re-closes the fingers, which is what stops a hand from sliding
   * around a magazine like a decal instead of taking hold of it.
   */
  _handTo(w, amt, tx, ty, tz, { roll = 0, pitch = 0, yaw = 0, grip = null, spread = 1 } = {}) {
    if (!w) return;
    const r = this._rest(w);
    this._handsPosed = true;
    const k = clamp(amt, 0, 1);
    w.position.set(
      lerp(r.p.x, tx, k),
      lerp(r.p.y, ty, k),
      lerp(r.p.z, tz, k),
    );
    w.rotation.set(r.r.x + pitch * k, r.r.y + yaw * k, r.r.z + roll * k);
    const h = w.userData.hand;
    if (h && grip !== null) {
      setHandPose(h, { curl: lerp(h.userData.baseCurl, grip, k), spread: lerp(1, spread, k) });
    }
  }

  _reloadAnim(t) {
    // t: 0..1 normalized reload progress. Returns {dip, roll} and moves parts.
    const cur = this.current;
    if (!cur) return { dip: 0, roll: 0 };
    const p = cur.parts;
    const dip = Math.sin(Math.min(t * 1.12, 1) * Math.PI);
    const cls = WEAPONS[cur.id].cls;
    const phase = (a, b) => clamp((t - a) / (b - a), 0, 1);
    const bell = (a, b) => Math.sin(phase(a, b) * Math.PI);
    // mag swap window for mag-fed weapons
    let magY = 0;
    if (p.mag && !WEAPONS[cur.id].breakAction) {
      const out = phase(0.08, 0.3), inn = phase(0.45, 0.68);
      const off = out < 1 ? -0.16 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.16 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.mag.position.y = p.mag.userData.y0 ?? (p.mag.userData.y0 = p.mag.position.y);
      p.mag.position.y += off;
      magY = off;
    }

    // ---- support hand: it has to actually HOLD what it is moving ----------
    //
    // The magazine used to slide out of the weapon on its own while the left
    // glove stayed welded to the handguard. Now the hand leaves the handguard,
    // closes on the magazine, rides it out, goes off-frame for a fresh one,
    // brings it back, seats it, slaps the floorplate, and only then goes back
    // to holding the gun.
    const hl = p.hand_l, hr = p.hand_r;
    if (hl && p.mag && !WEAPONS[cur.id].breakAction) {
      const m = p.mag.position, m0 = p.mag.userData.y0 ?? m.y;
      const reach = phase(0.04, 0.20);        // travel down to the magwell
      const carry = phase(0.20, 0.34);        // ride the mag out
      const away = phase(0.34, 0.44);         // drop it, go off-frame
      const back = phase(0.44, 0.60);         // return with a fresh one
      const seat = phase(0.60, 0.70);         // push it home
      const slap = bell(0.70, 0.80);          // palm the floorplate
      const home = phase(0.82, 1.0);          // back on the handguard
      // where the hand needs to be to have hold of the magazine body
      const gx = m.x, gy = m0 + magY - 0.055, gz = m.z + 0.012;
      let amt = 0, tx = gx, ty = gy, tz = gz, grip = 1.0;
      if (home > 0) { amt = 1 - home; grip = 1.0; }
      else if (back > 0) { amt = 1; tx = gx - 0.10 * (1 - back); ty = gy - 0.30 * (1 - back); grip = 1.0; }
      else if (away > 0) { amt = 1; tx = gx - 0.10 * away; ty = gy - 0.30 * away; grip = 1.0; }
      else if (carry > 0) { amt = 1; grip = 1.0; }
      else { amt = reach; grip = lerp(0.45, 1.0, reach); }
      if (seat > 0 && back >= 1) ty = gy + 0.012 * seat;
      this._handTo(hl, amt, tx, ty + slap * 0.016, tz, {
        roll: 0.42, pitch: -0.28, grip, spread: 0.9,
      });
    } else if (hl && (p.pump || p.magtube)) {
      // Pump gun: shells go in off-frame, then the forend is racked.
      const feed = bell(0.10, 0.62), rack = bell(0.68, 0.96);
      const rest = this._rest(hl);
      if (rack > 0.01 && p.pump) {
        this._handTo(hl, 1, rest.p.x, rest.p.y, (p.pump.userData.z0 ?? p.pump.position.z) + rack * 0.09 + 0.02, {
          grip: 1.05, spread: 0.9,
        });
      } else if (feed > 0.01) {
        this._handTo(hl, feed, rest.p.x - 0.10, rest.p.y - 0.13, rest.p.z + 0.16, {
          roll: 0.5, pitch: -0.4, grip: 0.55, spread: 1.15,
        });
      } else {
        this._restHands();
      }
    } else if (hl && !p.mag) {
      // Stripper clips, en-blocs, break actions: the hand leaves the forend,
      // loads over the open action, then comes back down.
      const load = bell(0.14, 0.70);
      if (load > 0.01) {
        const rest = this._rest(hl);
        this._handTo(hl, load, rest.p.x - 0.03, rest.p.y + 0.10, rest.p.z + 0.20, {
          roll: 0.55, pitch: -0.5, grip: 0.5, spread: 1.2,
        });
      } else {
        this._restHands();
      }
    }
    // Charging handle / bolt: the same hand comes off the handguard, yanks it
    // back and lets it fly. Sold by the hand leading the part, not trailing it.
    const charger = p.charge || p.oprod_handle || p.bolt_h || p.bolt_knob;
    if (hl && charger && p.mag && cls !== 'pistol') {
      const yank = bell(0.80, 0.94);
      if (yank > 0.01) {
        const c = charger.position;
        this._handTo(hl, yank, c.x + 0.030, c.y + 0.010, c.z + 0.030 + yank * 0.055, {
          roll: -0.55, pitch: 0.22, grip: 1.05, spread: 0.85,
        });
      }
    }
    // Pistols: the support hand comes across, cups the slide and racks it.
    if (hl && cls === 'pistol' && p.slide) {
      const rack = bell(0.60, 0.88);
      if (rack > 0.01) {
        this._handTo(hl, rack, 0.028, 0.046, 0.030 + rack * 0.05, { roll: -0.9, pitch: 0.3, grip: 1.05 });
      }
    }
    // The trigger hand stays on the grip, but the wrist rolls the weapon over
    // to present the magwell — the reason a real reload looks like one motion.
    if (hr) {
      const r = this._rest(hr);
      this._handsPosed = true;
      hr.rotation.set(r.r.x + dip * 0.10, r.r.y, r.r.z + dip * 0.14);
      const trig = hr.userData.hand;
      if (trig) setHandPose(trig, { curls: [1 - dip * 0.55, 1, 1, 1] }); // finger off the trigger
    }
    // charging / bolt / slide action near the end
    if (cur.cls === 'pistol' && p.slide) {
      p.slide.position.z = p.slide.userData.z0 ?? (p.slide.userData.z0 = p.slide.position.z);
      p.slide.position.z += t > 0.62 && t < 0.85 ? Math.sin((t - 0.62) / 0.23 * Math.PI) * 0.05 : 0;
    }
    if ((cur.id === 'kar98') && p.bolt) {
      const c = phase(0.55, 0.95);
      p.bolt.position.z = (p.bolt.userData.z0 ?? (p.bolt.userData.z0 = p.bolt.position.z)) + Math.sin(c * Math.PI) * 0.07;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + Math.sin(c * Math.PI) * 0.07;
    }
    if (p.cover && (cur.id === 'mg42' || cur.id === 'browning')) {
      p.cover.rotation.x = t > 0.1 && t < 0.6 ? -0.5 * Math.sin(phase(0.1, 0.6) * Math.PI) : 0;
    }
    if (cur.id === 'mg42' && p.drum) {
      // drum drops out, fresh drum seats home (synced to the belt foley)
      const out = phase(0.14, 0.32), inn = phase(0.52, 0.74);
      const off = out < 1 ? -0.13 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.13 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.drum.position.y = (p.drum.userData.y0 ?? (p.drum.userData.y0 = p.drum.position.y)) + off;
      p.drum_cap.position.y = (p.drum_cap.userData.y0 ?? (p.drum_cap.userData.y0 = p.drum_cap.position.y)) + off;
      if (p.belt_link) p.belt_link.visible = t < 0.14 || t > 0.74;
    }
    if (cur.id === 'ptrs41' && p.clip) {
      // spent clip pops out the top; new one pressed down
      const out = phase(0.18, 0.36), inn = phase(0.5, 0.7);
      const off = out < 1 ? 0.12 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? 0.12 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.clip.position.y = (p.clip.userData.y0 ?? (p.clip.userData.y0 = p.clip.position.y)) + off;
    }
    if (cur.id === 'dbshotgun' && p.barrels) {
      // break open then close
      const open = t < 0.55 ? phase(0.05, 0.3) - phase(0.35, 0.55) : 0;
      p.barrels.rotation.x = open * 0.55;
    }
    if (cur.id === 'panzerschreck' && p.rocket) {
      p.rocket.visible = t > 0.5;
    }
    return { dip, roll: dip * 0.30 };
  }

  _boltAnim(dt) {
    // bolt/pump cycle between shots
    if (this.boltT <= 0) return;
    this.boltT += dt;
    const cur = this.current;
    const DUR = 0.62;
    const t = Math.min(1, this.boltT / DUR);
    const p = cur.parts;
    const arc = Math.sin(t * Math.PI);
    if (cur.id === 'kar98' && p.bolt) {
      p.bolt.position.z = (p.bolt.userData.z0 ?? (p.bolt.userData.z0 = p.bolt.position.z)) + arc * 0.07;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + arc * 0.07;
      p.bolt_knob.rotation.y = arc * 0.7;
    }
    if ((cur.id === 'mosin' || cur.id === 'springfield') && p.bolt_h) {
      // handle rotates up, bolt draws back, then seats home again
      const pull = Math.sin(t * Math.PI);
      p.bolt_h.position.z = (p.bolt_h.userData.z0 ?? (p.bolt_h.userData.z0 = p.bolt_h.position.z)) + pull * 0.075;
      p.bolt_h.rotation.z = (cur.id === 'mosin' ? -0.9 : -0.4) - pull * 0.55;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + pull * 0.075;
      p.bolt_knob.position.y = (p.bolt_knob.userData.y0 ?? (p.bolt_knob.userData.y0 = p.bolt_knob.position.y)) + pull * 0.02;
    }
    if (cur.id === 'trench' && p.pump) {
      p.pump.position.z = (p.pump.userData.z0 ?? (p.pump.userData.z0 = p.pump.position.z)) + arc * 0.09;
      // the hand goes WITH the forend — it is the thing racking it
      if (p.hand_l) {
        const r = this._rest(p.hand_l);
        this._handsPosed = true;
        p.hand_l.position.set(r.p.x, r.p.y, r.p.z + arc * 0.09);
        p.hand_l.rotation.set(r.r.x, r.r.y, r.r.z - arc * 0.12);
      }
    }
    // Bolt guns: the firing hand leaves the grip, lifts the handle, draws the
    // bolt and returns. Nothing else about a bolt action reads as deliberate.
    if (p.hand_r && (cur.id === 'kar98' || cur.id === 'mosin' || cur.id === 'springfield')) {
      const knob = p.bolt_knob || p.bolt_h;
      if (knob) {
        const reach = Math.min(1, arc * 1.6);
        this._handTo(p.hand_r, reach, knob.position.x + 0.006, knob.position.y + 0.030, knob.position.z + 0.045, {
          roll: -0.75, pitch: 0.30, grip: 1.05, spread: 0.8,
        });
      }
    }
    if (t >= 1) this.boltT = 0;
  }

  update(dt, opts) {
    const { ads, moving, sprinting, sliding, mouseX, mouseY } = opts;
    this.adsT = damp(this.adsT, ads ? 1 : 0, 14, dt);
    // The camera banks into a slide (CameraRig.slideBank) but the viewmodel is
    // a child of the camera, so it inherits that roll and reads as bolt upright
    // while the world tilts behind it. The gun needs its own cant to look like
    // it belongs to a body going down. Slower in than the camera's 18 so the
    // weapon follows the head over rather than moving with it.
    this.slideT = damp(this.slideT, sliding ? 1 : 0, sliding ? 13 : 8, dt);
    if (sliding && !this._wasSliding) this.slideHit = 1;
    this._wasSliding = !!sliding;
    this.slideHit = damp(this.slideHit, 0, 4.2, dt);
    if (this.holsterT > 0) {
      this.holsterT = Math.max(0, this.holsterT - dt);
      if (this.holsterT === 0 && this.pendingEquip) {
        const { id, pap } = this.pendingEquip;
        this.pendingEquip = null;
        this.equip(id, pap);          // resets equipT, so the raise follows on
      }
    }
    this.equipT = Math.min(1, this.equipT + dt / 0.35);
    this.kick = damp(this.kick, 0, 10 + this.adsT * ADS_KICK_SETTLE, dt);
    this.meleeT = Math.max(0, this.meleeT - dt / 0.45);
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.material.opacity = Math.max(0, this.flashT / 0.045);
    }
    if (this.goldCamo) {
      const gc = this.goldCamo;
      gc.t += dt;
      // slow sheen breathing + a sharp glint sweeping past every ~3.5s
      const base = 0.08 + Math.sin(gc.t * 1.7) * 0.04;
      const cyc = (gc.t % 3.5) / 3.5;
      const glint = cyc < 0.12 ? Math.sin((cyc / 0.12) * Math.PI) * 0.55 : 0;
      for (const m of gc.mats) m.emissiveIntensity = base + glint;
    }
    if (this.diamondCamo) {
      const dc = this.diamondCamo;
      dc.t += dt;
      // elegant twinkle: sparse sharp sparkles, faint icy hue drift
      for (let i = 0; i < dc.mats.length; i++) {
        const m = dc.mats[i];
        const tw = Math.max(0, Math.sin(dc.t * 2.2 + i * 2.39)) ** 9;
        m.emissiveIntensity = 0.16 + tw * 1.5;
        m.emissive.setHSL(0.58 + Math.sin(dc.t * 0.4 + i) * 0.06, 0.25, 0.9);
      }
    }
    // PaP finish: scroll pattern + pulse palette while you play
    if (this.camo) {
      advancePapLivingFinish(this.camo, dt);
    }
    this._boltAnim(dt);
    if (this.perkDrinkT > 0 && this.perkBottle) {
      this.perkDrinkT += dt;
      const t = this.perkDrinkT;
      const b = this.perkBottle;
      posePerkBottle(b, t);
      if (t >= PERK_DRINK_TIMELINE.duration) {
        this.root.remove(b);
        this.perkBottle = null;
        this.perkDrinkT = 0;
        this.perkDrinkId = null;
      }
    }
    if (moving) this.bobPhase += dt * (sprinting ? 11 : 7);
    this.swayX = damp(this.swayX, clamp(-mouseX * 0.0006, -0.03, 0.03), 8, dt);
    this.swayY = damp(this.swayY, clamp(mouseY * 0.0006, -0.03, 0.03), 8, dt);
    if (this.reloadT > 0) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) this.reloadT = 0;
    }
    // weapon inspection: raise toward eye, roll to admire both sides, settle
    // Held while a raise is still running. papTake() starts both on the same
    // frame, and an inspect lift added to an equip lift is two curves pulling the
    // weapon up the same axis at once — it arrives too high, too early, and drops
    // back. Waiting costs 0.35s and turns it into raise, THEN present.
    let inspect = null;
    if (this.inspectT > 0 && this.equipT >= 1) {
      this.inspectT += dt;
      const D = 2.4;
      if (this.inspectT >= D) this.inspectT = 0;
      else {
        const t01 = this.inspectT / D;
        const inn = Math.min(1, t01 / 0.18), out = Math.min(1, Math.max(0, (t01 - 0.78) / 0.22));
        const env = inn * (1 - out);
        const roll = Math.sin(Math.min(1, Math.max(0, (t01 - 0.2) / 0.5)) * Math.PI);
        inspect = { env, roll };
      }
    }
    if (!this.current) return;
    const g = this.current.group;
    const t = this.adsT;
    const bobA = (1 - t * 0.85) * (moving ? 0.011 : 0.003);
    const bx2 = Math.sin(this.bobPhase) * bobA;
    const by = -Math.abs(Math.cos(this.bobPhase)) * bobA * 0.8;
    // ADS raises the gun until the rear sight (or optic) sits on your eye line
    // and pulls it back until that sight sits an eye-relief away — you look
    // THROUGH the rear aperture onto the front post, like the real thing, with
    // the stock past your cheek rather than in front of your nose.
    const sightY = g.userData.sightY ?? 0.09;
    this.current.adsZ ??= this.adsDepth(this.current);
    this.tuckStock(g, this.current.adsZ, t);
    const adsP = this._adsP || (this._adsP = new THREE.Vector3());
    adsP.set(0, -(sightY + 0.006), this.current.adsZ);
    g.position.lerpVectors(this.hipPos, adsP, t);
    g.position.x += bx2 + this.swayX * (1 - t);
    g.position.y += by + this.swayY * (1 - t);
    // See ADS_KICK_* — the aimed weapon spends its recoil down the sight line
    // rather than across it, so the sight picture survives a burst.
    g.position.z += this.kick * 0.09 * lerp(1, ADS_KICK_PUSH, t);
    let rx = this.kick * 0.16 * lerp(1, ADS_KICK_PITCH, t), ry = 0, rz = 0;
    if (inspect) {
      // bring to center-eye, tilt to admire the finish, then return
      g.position.x = lerp(g.position.x, 0.02, inspect.env * 0.85);
      g.position.y += inspect.env * 0.09;
      g.position.z += inspect.env * 0.06;
      ry += inspect.roll * 0.9 * inspect.env;
      rz += inspect.env * 0.22 - inspect.roll * 0.35 * inspect.env;
      rx += inspect.env * 0.12;
    }
    if (sprinting && !ads) { ry = 0.62; rx = 0.34; g.position.y -= 0.07; g.position.x += 0.03; }
    // Slide: cant the weapon over to the left and tuck it in, hardest at entry.
    // Additive on top of whatever pose is already running (the sprint pose
    // releases the frame the slide starts, so this is what catches it). Scaled
    // out by ADS purely defensively — a slide ends the moment you aim.
    if (this.slideT > 0.001) {
      const sl = this.slideT * (1 - t);
      rz += sl * (0.11 + this.slideHit * 0.05);
      ry += sl * 0.09;                 // muzzle drifts across the body with the lean
      rx += sl * 0.05;                 // ...and rides a touch nose-up as you go down
      g.position.y -= sl * 0.030;
      g.position.x += sl * 0.012;
      g.position.z += sl * 0.018;      // tucked in toward the chest
    }
    // Eased out, not linear. A linear raise is still travelling at full speed on
    // the frame equipT reaches 1 and then simply stops, which is the part that
    // reads as a snap; squared, it leaves the holster just as briskly and settles
    // into the rest pose with the velocity already spent.
    const eq = (1 - this.equipT) ** 2;
    g.position.y -= eq * EQUIP_RAISE_DROP; rx -= eq * EQUIP_RAISE_PITCH;
    // Holster drops along the same axis the raise comes back up, so the two
    // halves of a swap read as one continuous motion. Left linear: it hands over
    // to the raise at the bottom, where the raise is at its fastest.
    if (this.holsterT > 0) {
      const h = 1 - (this.holsterT / this.holsterDur);   // 0 at start -> 1 down
      g.position.y -= h * EQUIP_RAISE_DROP; rx -= h * EQUIP_RAISE_PITCH;
    }
    if (this.reloadT > 0) {
      const anim = this._reloadAnim(this.reloadT / this.reloadDur);
      // The old motion DROPPED the weapon. At the current view-model presence
      // that put the magwell — the only thing a reload is about — a good ten
      // degrees below the bottom of the frame. A real reload comes UP and IN
      // toward the chest and cants the magazine well toward the eye, which is
      // both what people do and what puts the animation on screen.
      g.position.y += anim.dip * 0.120 * (1 - t);
      g.position.x -= anim.dip * 0.105 * (1 - t);
      g.position.z += anim.dip * 0.045;
      rz += anim.roll; rx -= anim.dip * 0.06;
    } else {
      if (this.current.parts.barrels && WEAPONS[this.current.id].breakAction) {
        this.current.parts.barrels.rotation.x = 0;
      }
      // Nothing is driving the gloves this frame, so put them back on the gun.
      if (this.boltT <= 0) this._restHands();
    }
    // cymbal monkey wind-up: raise, key spins, arms clash, then it's thrown
    if (this.monkeyT > 0) {
      this.monkeyT = Math.max(0, this.monkeyT - dt / 0.85);
      const mt = 1 - this.monkeyT;
      const mp = this.monkeyProp;
      mp.visible = true;
      const raise = Math.min(1, mt / 0.25);
      const settle = Math.min(1, Math.max(0, (mt - 0.6) / 0.4));
      mp.position.set(0.16 - settle * 0.05, -0.22 + raise * 0.14 + settle * 0.02, -0.42);
      mp.rotation.y = Math.sin(mt * 9) * 0.2;
      mp.userData.key.rotation.z += dt * 22;
      const clash = Math.sin(mt * 22) * 0.55;
      mp.userData.armL.rotation.z = -0.5 + clash;
      mp.userData.armR.rotation.z = 0.5 - clash;
      if (this.monkeyT <= 0) mp.visible = false;
    }
    // PaP knuckle crack — the one animation with nothing else on screen.
    // Beat sheet and pose math live in poseKnuckleCrack().
    if (this.knuckleT > 0) {
      this.knuckleT += dt;
      if (this.knuckleT >= KNUCKLE_DUR) { this.knuckleT = 0; this.fists.visible = false; }
      else {
        this.fists.visible = true;
        const k = poseKnuckleCrack(this.knuckleT / KNUCKLE_DUR, this);
        // gun glides down and stays away for the whole ritual
        g.position.y -= k.gunDrop;
        rx -= k.pitchDrop;
      }
    }
    if (this.meleeT > 0) {
      // trench-knife slash: windup -> diagonal sweep across the view -> recover
      if (this.current) this.current.group.visible = false;
      const k = this.knife;
      k.visible = true;
      const t = 1 - this.meleeT; // 0..1 over 0.45s
      const windup = clamp(t / 0.18, 0, 1);
      const slash = clamp((t - 0.18) / 0.34, 0, 1);
      const recover = clamp((t - 0.52) / 0.48, 0, 1);
      const se = slash * slash * (3 - 2 * slash); // smoothstep sweep
      const re = recover * recover * (3 - 2 * recover);
      // start: low right, edge up, pulled back. sweep: up-left across center.
      k.position.set(
        0.28 - se * 0.4 + re * 0.12 + windup * 0.02,
        -0.22 + windup * 0.06 + se * 0.2 - re * 0.18,
        -0.38 - se * 0.14 + re * 0.18
      );
      k.rotation.set(
        -0.3 - se * 0.9 + re * 1.1,
        0.25 - se * 0.5,
        -0.5 - se * 1.5 + re * 1.8
      );
      g.position.z -= 0; // weapon hidden; no gun lunge
    } else {
      this.knife.visible = false;
      if (this.current) this.current.group.visible = !this.rigHidden && !this.papHide && this.knuckleT <= 0 && this.perkDrinkT <= 0;
    }
    g.rotation.set(rx, ry, rz);
  }
}
