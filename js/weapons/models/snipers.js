// View-models for the sniper rifles.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, latheGeo, barrel, frontSight, rearTangent, scope,
  triggerGroup, slingLoop, bipod,
} from '../../render/WeaponParts.js';
import { supportHand } from '../../render/WeaponHands.js';
import { profileZY, at, hand } from './kit.js';

function mosinOrSpringfield({ id, P, A, ST, STD, W }) {
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
  return -0.935;
}

function ptrs41({ parts, P, A, ST, STD, STL, W, WD, CK }) {
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
  return -0.995;
}

export const SNIPERS = { mosin: mosinOrSpringfield, springfield: mosinOrSpringfield, ptrs41 };
