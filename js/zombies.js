// Zombies: animated CC0 models (Quaternius, CC0) driven by the AI state machine,
// classic round structure with health scaling, hellhounds, crawlers.
// The code is in js/zombies/. This file re-exports the names callers import.
export { ZSTATES } from './zombies/states.js';
export { measureNeutralBounds, measureStandingBounds } from './zombies/bounds.js';
export { rayHitZombieBody, zombieAimPoint } from './zombies/hit-volumes.js';
export { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
export { ZombieVisual } from './zombies/visual.js';
export { createZombieModel, createZombieVisual } from './zombies/models.js';
export { isZombieSpawnRoomAllowed } from './zombies/manager-spawning.js';
export { ZombieManager } from './zombies/manager.js';
