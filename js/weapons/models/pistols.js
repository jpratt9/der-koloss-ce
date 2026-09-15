// View-models for the pistols.
// Each builder takes buildViewmodel()'s build context (js/weapons/viewmodel.js),
// adds the weapon's parts through P, and returns the z of its muzzle.
import * as THREE from 'three';
import { WM } from '../../render/WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, frontSight, ejectionPort, triggerGroup,
  magazine, screw,
} from '../../render/WeaponParts.js';
import { profileZY, at, hand, rearNotch } from './kit.js';

function m1911({ P, A, ST, STD, STL, STM, CK }) {
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
  return -0.245;
}

function magnum({ P, A, ST, STD, STL, W, CK }) {
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
  return -0.345;
}

export const PISTOLS = { m1911, magnum };
