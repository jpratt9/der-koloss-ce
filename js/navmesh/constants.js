// Enemy body radius. Matches the circle `moveZombie` resolves with, so a cell
// this grid calls walkable is a cell the mover can actually hold.
export const NAV_RADIUS = 0.3;
// Cell size. Small enough that a 1.6m window gap and a 1.9m doorway both get
// several clear cells across; large enough that a full build stays in the tens
// of milliseconds. Do not raise this without re-running the reachability check
// in scripts/validate-enemy-navigation.mjs.
export const NAV_CELL = 0.45;
// Distinct standing heights a single column may carry. The map's deepest stack
// is ground -> balcony (2 levels); the mainframe steps make 3 in one column.
export const MAX_LEVELS = 3;
// Vertical band a standing enemy occupies, relative to its feet. Identical to
// the filter `moveZombie` applies, so "blocked here" means the same thing to the
// grid and to the collision resolver.
export const BODY_LOW = 0.25;
export const BODY_HIGH = 1.1;
// How far an enemy may fall to reach a lower cell. The authored balcony drops
// are 2.9m and the catwalk is 3.1m; anything beyond this is a pit, not a route.
export const MAX_DROP = 3.4;
// A height gain larger than this is a climb, not a step. `floorY`'s own 1.6m
// tolerance already refuses to hand back a surface further above the enemy than
// that, so this only has to agree with it.
export const MAX_STEP_UP = 1.55;
export const NO_LINK = 255;

// 8-connected, orthogonals first so a tie in the heap prefers a straight line.
export const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
// Diagonal d requires both of these orthogonal neighbours to be traversable,
// otherwise the path cuts the corner of a wall or squeezes a body diagonally
// between two crates that touch.
export const DIAG_GUARD = [null, null, null, null, [0, 2], [0, 3], [1, 2], [1, 3]];

