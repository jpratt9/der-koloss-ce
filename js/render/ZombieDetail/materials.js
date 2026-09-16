// The three materials every damage build is drawn with, made once, and the
// seeded PRNG a variant is built from.
import * as THREE from 'three';
import { enhanceCreatureMaterial } from '../CreatureShading.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _mats = null;
export function materials() {
  if (_mats) return _mats;
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x2b2e2b, roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide,
  });
  const bone = new THREE.MeshStandardMaterial({
    color: 0x9a927c, roughness: 0.62, metalness: 0.0,
  });
  const flesh = new THREE.MeshStandardMaterial({
    color: 0x4a1512, roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide,
  });
  // Same rim/wrap treatment as the body, so the additions sit in the same
  // light instead of reading as pasted-on props.
  enhanceCreatureMaterial(cloth, {
    rimStrength: 0.34, rimPower: 3.6, wrap: 0.2, sssStrength: 0.05,
    fleshAmount: 0.35, grime: 0.6, wet: 0.05, tintA: 0x3a3d38, tintB: 0x242623,
  });
  enhanceCreatureMaterial(bone, {
    rimStrength: 0.5, rimPower: 3.2, wrap: 0.3, sssColor: 0xd8b090, sssStrength: 0.2,
    fleshAmount: 0.3, grime: 0.45, wet: 0.15, tintA: 0xa79d86, tintB: 0x8b8271,
  });
  enhanceCreatureMaterial(flesh, {
    rimStrength: 0.45, rimPower: 3.0, wrap: 0.35, sssColor: 0xa02818, sssStrength: 0.55,
    fleshAmount: 0.5, grime: 0.3, wet: 0.55, tintA: 0x5a1a15, tintB: 0x3a0f0c,
  });
  _mats = { cloth, bone, flesh };
  return _mats;
}
