// Which body an enemy gets: the GLB corpse, the procedural hellhound or the plain
// fallback humanoid, and the guard that stops a zombie from rendering as a hound.
import * as THREE from 'three';
import { assets } from '../assets.js';
import { attachZombieDetail } from '../render/ZombieDetail.js';
import { buildHellhound, HOUND_VARIANTS } from '../render/HellhoundModel.js';
import { ZombieVisual } from './visual.js';

// ---------- procedural hellhound ----------
// The hound's geometry, materials and rig live in render/HellhoundModel.js and
// render/HellhoundModel/: it is a merged, bone-parented build shared across
// every instance, so a pack of eight costs a handful of draw calls instead of
// ~90 loose meshes each.
const fallbackZombieClothMat = new THREE.MeshStandardMaterial({ color: 0x444b4d, roughness: 1 });
const fallbackZombieSkinMat = new THREE.MeshStandardMaterial({ color: 0x879078, roughness: 1 });

function dpart(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

export function createZombieModel(dog = false, { directorRig = false, variant = null } = {}) {
  if (dog) {
    // Merged, bone-parented hellhound. `directorRig` is now implicit — the
    // planted-paw hip -> knee -> paw chain is the only rig there is, and both
    // gameplay and the cinematic director consume the same one.
    return buildHellhound(variant == null ? Math.floor(Math.random() * HOUND_VARIANTS) : variant);
  }
  const g = new THREE.Group();
  // A normal zombie model failing to load must never turn into a hellhound.
  // This low-poly humanoid is deliberately simple, but it preserves the entity's
  // silhouette and audio/behavior identity while the match remains playable.
  const torso = dpart(0.48, 0.72, 0.26, fallbackZombieClothMat); torso.position.y = 1.12;
  const head = dpart(0.3, 0.34, 0.28, fallbackZombieSkinMat); head.position.y = 1.68;
  const armL = dpart(0.15, 0.72, 0.15, fallbackZombieSkinMat); armL.position.set(-0.34, 1.12, 0);
  const armR = dpart(0.15, 0.72, 0.15, fallbackZombieSkinMat); armR.position.set(0.34, 1.12, 0);
  const legL = dpart(0.19, 0.82, 0.2, fallbackZombieClothMat); legL.position.set(-0.13, 0.42, 0);
  const legR = dpart(0.19, 0.82, 0.2, fallbackZombieClothMat); legR.position.set(0.13, 0.42, 0);
  g.add(torso, head, armL, armR, legL, legR);
  g.userData = { dog: false, fallbackZombie: true, torso, head, armL, armR, legL, legR };
  return g;
}

export function enforceEnemyVisualIdentity(z) {
  const renderedAsDog = z.model?.userData?.dog === true;
  if (renderedAsDog === !!z.dog) return;

  // Self-heal if a future asset/fallback refactor mismatches gameplay identity.
  // A basic fallback is preferable to corrupting the wave or lying to the player
  // about what enemy they are fighting.
  console.error('Enemy visual identity mismatch; replacing with safe fallback', {
    id: z.id,
    gameplayDog: !!z.dog,
    renderedAsDog,
  });
  z.visual = null;
  z.model = createZombieModel(!!z.dog, { directorRig: !!z.dog });
}

export function createZombieVisual() {
  const hasBasic = !!assets.models.zombie1;
  const hasChubby = !!assets.models.zombie2;
  if (!hasBasic && !hasChubby) return null;

  // Partial asset availability must remain safe: never select a missing
  // variant merely because the other zombie model loaded successfully.
  const variant = hasChubby && (!hasBasic || Math.random() >= 0.75) ? 1 : 0;
  const visual = new ZombieVisual(variant);
  // Bone-attached damage geometry: torn coat, exposed ribs, hanging flesh.
  // Parented to bones the rig already animates, so it follows the pose without
  // touching the skeleton — see js/render/ZombieDetail.js for why that matters.
  visual.detail = attachZombieDetail(visual);
  return visual;
}
