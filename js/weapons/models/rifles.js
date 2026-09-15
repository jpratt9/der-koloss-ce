// View-models for the WWII rifles.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, sphereGeo, latheGeo, barrel, perfShroud, muzzleCone, frontSight,
  rearTangent, ejectionPort, triggerGroup, magazine, slingLoop, chargingHandle, selector, bipod,
} from '../../render/WeaponParts.js';
import { supportHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, redDotSight, rearAperture } from './kit.js';

function kar98({ P, A, ST, STD, STL, W }) {
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
  return -0.882;
}

function gewehr43({ P, A, ST, STD, STL, W }) {
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
  return -0.820;
}

function m1a1({ P, A, ST, STD, STL, W }) {
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
  return -0.760;
}

function m1garand({ P, A, ST, STD, STL, W }) {
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
  return -0.895;
}

function stg44({ pap, parts, P, A, T, STD, STL, SH, WD, GR }) {
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
  return -0.570;
}

function fg42({ parts, P, A, ST, STD, STL, WD, CK }) {
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
  return -0.690;
}

export const RIFLES = { kar98, gewehr43, m1a1, m1garand, stg44, fg42 };
