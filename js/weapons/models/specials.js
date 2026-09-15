// View-models for the launcher, the wonder weapons, the knife and the Monkey Bomb.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, plateGeo, latheGeo, frontSight, triggerGroup,
} from '../../render/WeaponParts.js';
import { supportHand, foreGripHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, rearNotch } from './kit.js';
import { buildMonkey } from '../monkey.js';

function panzerschreck({ P, A, ST, STD, SH, WD, CK }) {
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
  return -0.870;
}

function raygun({ pap, g, parts, P, A, GR, BR }) {
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
  return -0.560;
}

function dg2({ pap, P, A, W, WD, CK }) {
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
  return -0.940;
}

function bowie({ pap, P, STD, STL, W, WD, BR }) {
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
  return -0.26;
}

function monkey({ P }) {
  const mk = buildMonkey();
  mk.scale.setScalar(0.9);
  mk.position.set(0.05, -0.14, -0.16);
  P('monkeyProp', mk);
  P('hand_r', foreGripHand(0.052, -0.150, -0.060, 0.10, { curl: 0.85, side: 1 }));
  return -0.3;
}

export const SPECIALS = { panzerschreck, raygun, dg2, bowie, monkey };
