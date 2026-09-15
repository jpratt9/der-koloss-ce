// The hellhound's materials: the charcoal hide, the ember, eye and gullet
// glow and the scorched bone that every hound shares, and their slot order.
import * as THREE from 'three';
import { enhanceCreatureMaterial } from '../CreatureShading.js';

// ---------------------------------------------------------------------------
// materials — shared by every hound in the process
// ---------------------------------------------------------------------------
let _mats = null;
export function houndMaterials() {
  if (_mats) return _mats;
  // Charcoal, not black — and remember that enhanceCreatureMaterial MULTIPLIES
  // this by its tint pair. The old hound set both the colour and the tints near
  // black, so the product was effectively zero: every value you could see on
  // the animal came from the additive rim, which is exactly why a pack read as
  // eight identical flat orange cut-outs with no form. Keep the tints close to
  // neutral and let this colour be the charcoal.
  const hide = new THREE.MeshStandardMaterial({ color: 0x3d332c, roughness: 0.95, metalness: 0.0 });
  // Ember channels sit above the bloom threshold so they bleed light in the
  // HDR stack — but only just. Pushed harder they clip to flat yellow and stop
  // reading as heat inside a body.
  const ember = new THREE.MeshStandardMaterial({
    color: 0x2a0c04, emissive: 0xff4a12, emissiveIntensity: 4.2,
    roughness: 0.7, toneMapped: false,
  });
  // Hotter and much smaller than the fissures: the eyes and the back of the
  // throat are the two things a player tracks across a dark room.
  const eye = new THREE.MeshStandardMaterial({
    color: 0x140200, emissive: 0xffb43a, emissiveIntensity: 5.5, toneMapped: false,
  });
  const gullet = new THREE.MeshStandardMaterial({
    color: 0x2a0a02, emissive: 0xff5a10, emissiveIntensity: 2.6, toneMapped: false,
  });
  // Scorched bone: ribs, vertebrae, fangs, claws. Dirty and warm, never white —
  // bright bone on a black animal reads as beads glued to the spine.
  const bone = new THREE.MeshStandardMaterial({ color: 0x776b57, roughness: 0.6, metalness: 0.0 });

  // The hounds are lit by what is burning inside them, so their rim is ember
  // coloured rather than the moon-blue the zombies use.
  //
  // The rim is added AFTER tone mapping, so its strength is in display units:
  // the old 1.9 clipped the whole animal to white under any nearby light and
  // was the reason a pack read as pale blobs. Kept low enough that it only
  // catches the silhouette edge.
  enhanceCreatureMaterial(hide, {
    rimColor: 0xff7a2c, rimStrength: 0.22, rimPower: 3.4,
    wrap: 0.45, sssColor: 0xff3a08, sssStrength: 0.15,
    fleshScale: 13.0, fleshAmount: 0.55, grime: 0.7, wet: 0.08,
    tintA: 0xc9c1b8, tintB: 0x9a938b, tintMix: 0.45,
  });
  enhanceCreatureMaterial(bone, {
    rimColor: 0xffa060, rimStrength: 0.2, rimPower: 3.6,
    wrap: 0.35, sssColor: 0xff5a20, sssStrength: 0.1,
    fleshScale: 9.0, fleshAmount: 0.5, grime: 0.75, wet: 0.06,
    tintA: 0xd6cec2, tintB: 0xa79f93, tintMix: 0.5,
  });
  _mats = { hide, ember, eye, gullet, bone };
  return _mats;
}

/** Material slot order used by every merged geometry in this file. */
const SLOTS = ['hide', 'ember', 'bone', 'eye', 'gullet'];

export { SLOTS };
