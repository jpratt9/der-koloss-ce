// Weapons: the catalog, the view-models and their finishes, and the first-person
// rig. The code is in js/weapons/; this file re-exports the names callers import,
// so no caller has to know which module defines one.
export { WEAPONS, getStats, BOX_POOL, CASING_BY_SFX } from './weapons/catalog.js';
export { buildMonkey } from './weapons/monkey.js';
export { buildPerkBottle } from './weapons/perk-bottle.js';
export { buildViewmodel } from './weapons/viewmodel.js';
export {
  buildDisplayWeapon, buildPapDisplayWeapon, updatePapDisplayWeapon, disposePapDisplayWeapon,
} from './weapons/world-display.js';
export { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';
export { WeaponRig } from './weapons/rig.js';
