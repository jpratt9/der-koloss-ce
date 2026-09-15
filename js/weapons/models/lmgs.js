// View-models for the light machine guns.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, perfShroud, muzzleCone, frontSight,
  rearTangent, ejectionPort, triggerGroup, magazine, chargingHandle, selector, bipod,
} from '../../render/WeaponParts.js';
import { supportHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, rearAperture } from './kit.js';

function bar({ parts, P, A, ST, STD, STL, W, WD, CK }) {
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
  return -0.618;
}

function mg42({ parts, P, A, STD, STL, SH, WD, GR, BR }) {
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
  return -0.945;
}

function browning({ parts, P, A, ST, STD, STL, SH, WD, GR, BR }) {
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
  return -0.800;
}

export const LMGS = { bar, mg42, browning };
