// Pure map topology shared by the runtime and deterministic route checks.
// Keep this module free of DOM/Three.js dependencies so CI can import it.
// The tables and checks are in js/map-layout/, one module per question, under
// the same rule. This file re-exports them.
export { MAP_ROOMS, DOOR_FIT, cappedWallRuns, MAP_DOOR_DEFS, MAP_WALL_RUNS } from './map-layout/shell.js';
export {
  MAP_WALLBUYS, MAP_PERKS, INITIAL_MYSTERY_BOX, MAP_TELEPORTERS, PAP_ENERGY_VISUAL, papEnergyEnvelope,
  teleporterPromptState,
} from './map-layout/interactables.js';
export {
  MAINFRAME_PLATFORM, MAINFRAME_STEPS, MAINFRAME_EAST_ENTRY_KEEP_CLEAR, FACTORY_CATWALK,
  stairFlightColliders, platformSideBlocksAtFeet, MAP_RAMPS, MAP_WALKWAYS, MAP_OPEN_EXITS, MAP_STAIR_MOUTHS,
  MAP_TRAVERSAL_ZONES, MAP_NAV_LINKS, roomDepthsToPlayers, roomsThatCanReachPlayers, elevationAwareRiseCandidate,
} from './map-layout/traversal.js';
export {
  auditInteractableApproaches, auditKeepClearZone, auditMapStructure, auditMapEgress,
} from './map-layout/audits.js';
