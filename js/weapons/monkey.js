// The Monkey Bomb prop, shared by the mystery box, the thrown entity and the
// first-person wind-up.
import * as THREE from 'three';
import { WM } from '../render/WeaponMaterials.js';
import { mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, latheGeo } from '../render/WeaponParts.js';

/**
 * The Monkey Bomb.
 *
 * A 1940s wind-up cymbal monkey — red felt jacket and fez, pale muzzle and
 * ears, brass cymbals in both fists, key in its back — with four demolition
 * charges taped round its middle and wired to a detonator on its chest. It is
 * a MONKEY, not a bear: long limbs, a projecting muzzle with a brow over it,
 * and big side-mounted ears.
 *
 * Authored at true size (~0.32m tall, seated) because it is used at three
 * different scales: the mystery-box display, the thrown entity, and the
 * first-person wind-up prop. `userData.armL/armR/key` are the animated nodes —
 * arms rest at rotation.z = -+0.5 and swing to the centre for the clash, and
 * the key spins about its own Z.
 */
export function buildMonkey() {
  const F = WM.toyFur, FP = WM.toyFurPale, FL = WM.toyFelt, FD = WM.toyFeltDark;
  const GD = WM.toyGold, CY = WM.toyCymbal;
  const g = new THREE.Group();
  const add = (...m) => { for (const x of m) g.add(x); return m[0]; };

  // ---- seated body -------------------------------------------------------
  add(mesh(sphereGeo(0.062, 14, 11), FD, 0, 0.052, -0.004)).scale.set(1.22, 0.82, 1.10); // hips
  const torso = add(mesh(sphereGeo(0.070, 16, 12), FL, 0, 0.142, 0));
  torso.scale.set(1.02, 1.28, 0.90);
  // jacket: hem, collar, front placket, gold braid and buttons
  add(mesh(torusGeo(0.070, 0.008, 6, 20), FD, 0, 0.078, 0)).scale.set(1.02, 1, 0.92);
  add(mesh(torusGeo(0.052, 0.009, 6, 20), FD, 0, 0.212, 0)).scale.set(1.05, 1, 0.95);
  add(mesh(bevelBoxGeo(0.024, 0.130, 0.010, 0.003), FD, 0, 0.145, 0.062));
  for (const sx of [1, -1]) add(mesh(bevelBoxGeo(0.005, 0.128, 0.006, 0.0015), GD, sx * 0.015, 0.145, 0.066));
  for (const y of [0.192, 0.152, 0.112]) {
    add(mesh(sphereGeo(0.0072, 8, 6), GD, 0, y, 0.070)).scale.z = 0.6;
  }
  // epaulettes
  for (const sx of [1, -1]) {
    add(mesh(bevelBoxGeo(0.030, 0.008, 0.026, 0.003), FD, sx * 0.062, 0.196, 0.004, 0, 0, sx * -0.35));
    add(mesh(torusGeo(0.011, 0.0026, 4, 12), GD, sx * 0.072, 0.192, 0.004, Math.PI / 2, 0, sx * -0.35));
  }

  // ---- head --------------------------------------------------------------
  const head = add(mesh(sphereGeo(0.062, 16, 12), F, 0, 0.268, -0.002));
  head.scale.set(1.0, 0.98, 0.96);
  const face = add(mesh(sphereGeo(0.050, 14, 11), FP, 0, 0.262, 0.026));
  face.scale.set(0.94, 0.92, 0.66);
  // projecting muzzle — the single biggest monkey-vs-bear tell
  const snout = add(mesh(sphereGeo(0.030, 12, 9), FP, 0, 0.245, 0.058));
  snout.scale.set(1.22, 0.80, 1.10);
  add(mesh(sphereGeo(0.0125, 8, 6), FP, 0, 0.258, 0.072)).scale.set(1.5, 0.7, 0.7); // nose bridge
  for (const sx of [1, -1]) add(mesh(sphereGeo(0.0032, 6, 5), WM.toyPupil, sx * 0.008, 0.256, 0.082));
  // open grin with the painted teeth line
  add(mesh(torusGeo(0.017, 0.0038, 5, 14, Math.PI), WM.toyDet, 0, 0.238, 0.072, 0, 0, Math.PI));
  add(mesh(bevelBoxGeo(0.026, 0.005, 0.004, 0.001), WM.toyEye, 0, 0.2385, 0.079));
  // heavy brow ridge over deep-set eyes
  add(mesh(bevelBoxGeo(0.062, 0.010, 0.014, 0.003), F, 0, 0.292, 0.040, -0.25));
  for (const sx of [1, -1]) {
    add(mesh(sphereGeo(0.0105, 9, 7), WM.toyEye, sx * 0.021, 0.279, 0.049)).scale.z = 0.7;
    add(mesh(sphereGeo(0.0056, 8, 6), WM.toyPupil, sx * 0.022, 0.278, 0.056)).scale.z = 0.6;
    // big side-set ears with a pale inner cup
    add(mesh(torusGeo(0.0175, 0.0055, 5, 14), F, sx * 0.062, 0.272, -0.004, 0, Math.PI / 2, 0));
    add(mesh(sphereGeo(0.0135, 9, 7), FP, sx * 0.064, 0.272, -0.004)).scale.set(0.42, 1, 1);
  }
  // ---- fez ---------------------------------------------------------------
  add(mesh(cylGeo(0.034, 0.041, 0.050, 18), FL, 0, 0.332, -0.002));
  add(mesh(cylGeo(0.034, 0.034, 0.004, 18), FD, 0, 0.357, -0.002));
  add(mesh(torusGeo(0.0415, 0.0035, 5, 20), GD, 0, 0.310, -0.002));
  add(mesh(cylGeo(0.0022, 0.0022, 0.055, 6), GD, 0.026, 0.340, -0.002, 0, 0, -0.5));
  add(mesh(sphereGeo(0.0085, 8, 6), GD, 0.049, 0.322, -0.002));

  // ---- arms + cymbals ----------------------------------------------------
  // Long monkey arms. The cymbal faces sideways so the pair meets in front of
  // the chest when the animation swings both arms inward.
  const makeArm = (side) => {
    const a = new THREE.Group();
    const upper = mesh(sphereGeo(0.021, 10, 8), FL, 0, -0.030, 0);
    upper.scale.set(1, 2.0, 1);
    const fore = mesh(sphereGeo(0.017, 10, 8), F, 0, -0.082, 0);
    fore.scale.set(1, 1.7, 1);
    const fist = mesh(sphereGeo(0.019, 10, 8), FP, 0, -0.108, 0.004);
    fist.scale.set(1, 0.95, 1.05);
    a.add(upper, mesh(torusGeo(0.020, 0.005, 5, 14), FD, 0, -0.056, 0), fore, fist);
    // cymbal: shallow dish with a raised bell, axis along X so the faces clap
    const cym = new THREE.Group();
    cym.add(mesh(latheGeo('monkey_cym', [
      [0.0010, 0.0140], [0.0090, 0.0138], [0.0128, 0.0100], [0.0138, 0.0078],
      [0.0470, 0.0005], [0.0470, -0.0017], [0.0132, 0.0056], [0.0120, 0.0078],
      [0.0085, 0.0117], [0.0010, 0.0119],
    ], 24), CY));
    cym.add(mesh(torusGeo(0.0405, 0.0011, 4, 24), CY, 0, 0.0024, 0));  // hammered rings
    cym.add(mesh(torusGeo(0.0270, 0.0010, 4, 24), CY, 0, 0.0052, 0));
    cym.add(mesh(cylGeo(0.0042, 0.0042, 0.017, 8), GD, 0, 0.018, 0));  // strap post
    cym.rotation.z = side * -Math.PI / 2;
    cym.position.set(side * 0.008, -0.118, 0.006);
    a.add(cym);
    // Arms carried forward and out so the cymbals sit clear of the charge
    // bundle, held APART at rest with a hand's width of daylight between the
    // rims — the animation closes that gap for the clash.
    a.position.set(side * 0.106, 0.196, 0.030);
    a.rotation.set(-0.18, side * 0.62, side * -0.5);
    return a;
  };
  const armL = makeArm(1), armR = makeArm(-1);
  g.add(armL, armR);

  // ---- legs (seated, splayed forward) ------------------------------------
  for (const sx of [1, -1]) {
    const thigh = add(mesh(sphereGeo(0.026, 10, 8), FD, sx * 0.042, 0.032, 0.036));
    thigh.scale.set(1, 0.95, 1.9);
    add(mesh(sphereGeo(0.021, 10, 8), F, sx * 0.046, 0.020, 0.086)).scale.set(1, 0.9, 1.5);
    const foot = add(mesh(sphereGeo(0.020, 10, 8), FP, sx * 0.048, 0.014, 0.118));
    foot.scale.set(0.9, 0.62, 1.35);
    // long monkey toes
    for (let i = 0; i < 3; i++) {
      add(mesh(sphereGeo(0.0052, 6, 5), FP, sx * (0.040 + i * 0.008), 0.011, 0.134)).scale.z = 1.5;
    }
  }
  // tail curling out behind
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    add(mesh(sphereGeo(0.0105 - t * 0.004, 8, 6), F,
      Math.sin(t * 2.2) * 0.032, 0.048 + t * 0.055, -0.070 - Math.sin(t * 1.4) * 0.028));
  }

  // ---- wind-up key -------------------------------------------------------
  add(mesh(cylGeo(0.0055, 0.0065, 0.030, 10), GD, 0, 0.168, -0.070, Math.PI / 2));
  add(mesh(torusGeo(0.013, 0.0026, 5, 14), GD, 0, 0.168, -0.062, Math.PI / 2)); // escutcheon
  const key = new THREE.Group();
  for (const sx of [1, -1]) {
    key.add(mesh(torusGeo(0.0135, 0.0030, 5, 14), GD, sx * 0.0155, 0, 0));
    key.add(mesh(bevelBoxGeo(0.017, 0.0055, 0.0045, 0.0012), GD, sx * 0.0075, 0, 0));
  }
  key.position.set(0, 0.168, -0.087);
  g.add(key);

  // ---- the bomb ----------------------------------------------------------
  // Four waxed-paper charges taped round the jacket, wired up to a detonator.
  const CH = WM.toyCharge, TP = WM.toyTape;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.sin(a) * 0.072, cz = Math.cos(a) * 0.064;
    add(mesh(cylGeo(0.0135, 0.0135, 0.098, 12), CH, cx, 0.146, cz, 0, 0, 0));
    add(mesh(cylGeo(0.0140, 0.0140, 0.006, 12), TP, cx, 0.188, cz));
    add(mesh(cylGeo(0.0140, 0.0140, 0.006, 12), TP, cx, 0.104, cz));
  }
  // two tape wraps holding the whole bundle on
  for (const y of [0.176, 0.114]) {
    const band = add(mesh(torusGeo(0.079, 0.0055, 5, 24), TP, 0, y, 0));
    band.scale.set(1.0, 1, 0.92);
  }
  // detonator block on the chest, with wiring into the charges
  add(mesh(bevelBoxGeo(0.040, 0.030, 0.018, 0.003), WM.toyDet, 0, 0.150, 0.078, 0.12));
  add(mesh(bevelBoxGeo(0.030, 0.014, 0.004, 0.001), WM.toyEye, 0, 0.156, 0.088, 0.12));
  add(mesh(sphereGeo(0.0048, 8, 6), WM.toyLamp, 0, 0.138, 0.088, 0.12));
  add(mesh(cylGeo(0.0035, 0.0035, 0.012, 8), WM.machined, 0.014, 0.138, 0.088, 0, 0, Math.PI / 2));
  for (const [mat, sx, rot] of [[WM.toyWireRed, 1, 0.9], [WM.toyWireBlue, -1, -0.9]]) {
    add(mesh(torusGeo(0.048, 0.0022, 4, 16, Math.PI * 0.85), mat,
      sx * 0.016, 0.150, 0.040, 0.35, sx * 0.9, rot));
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  g.userData = { armL, armR, key };
  return g;
}
