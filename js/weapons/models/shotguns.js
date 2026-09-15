// View-models for the shotguns.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, perfShroud, frontSight, ejectionPort,
  triggerGroup, slingLoop,
} from '../../render/WeaponParts.js';
import { foreGripHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand, rearNotch } from './kit.js';

function trench({ P, A, ST, STD, SH, W, WD }) {
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
  return -0.592;
}

function dbshotgun({ P, A, ST, STD, STL, W, CK }) {
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
  return -0.560;
}

export const SHOTGUNS = { trench, dbshotgun };
