// View-models for the modern rifles.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, torusGeo, plateGeo, latheGeo, barrel, perfShroud, flashHider,
  frontSight, railRearSight, ejectionPort, triggerGroup, magazine, rail, chargingHandle, selector,
  bipod,
} from '../../render/WeaponParts.js';
import { supportHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, redDotSight, rearAperture } from './kit.js';

function acr({ pap, P, A, T, ST, STD, STL }) {
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
  return -0.586;
}

function famas({ pap, parts, P, A, T, STD, STL, SH }) {
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
  return -0.596;
}

function galil({ pap, parts, P, A, T, ST, STD, STL, SH }) {
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
  return -0.648;
}

function commando({ P, A, T, ST, STD, STL, SH }) {
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
  return -0.656;
}

export const MODERN_RIFLES = { acr, famas, galil, commando };
