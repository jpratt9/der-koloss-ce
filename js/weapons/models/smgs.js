// View-models for the submachine guns.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, torusGeo, plateGeo, latheGeo, barrel, perfShroud, muzzleCone,
  suppressor, frontSight, railRearSight, ejectionPort, triggerGroup, magazine, rail, slingLoop,
  chargingHandle, selector,
} from '../../render/WeaponParts.js';
import { supportHand, foreGripHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, redDotSight, rearNotch, rearAperture } from './kit.js';

function mp40({ P, A, ST, STD, STL, SH, GR }) {
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
  return -0.648;
}

function thompson({ P, A, ST, STD, STL, SH, W, WD, CK }) {
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
  return -0.532;
}

function ppsh({ P, A, ST, STD, STL, SH, W }) {
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
  return -0.590;
}

function type100({ P, A, ST, STD, STL, SH, W }) {
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
  return -0.680;
}

function ump45({ P, A, T, STD, STL }) {
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
  return -0.485;
}

function ak74u({ P, A, T, STD, STL, SH, WD, GR }) {
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
  return -0.470;
}

export const SMGS = { mp40, thompson, ppsh, type100, ump45, ak74u };
