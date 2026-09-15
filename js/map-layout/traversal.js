// Where bodies can go: the raised floors and the stairs up to them, the one-way
// ledges, the volumes dressing must leave walkable, and the room graph the horde
// follows. No DOM and no Three.js, so CI can import it.
import { MAP_DOOR_DEFS } from './shell.js';

export const MAINFRAME_PLATFORM = {
  minX: -6, maxX: 6, minZ: 14, maxZ: 18.5, y: 0.9,
  sideDropOpen: true,
};

// Physical step zones leading up to the mainframe deck. These mirror the
// visible concrete boxes in map.js so the stairs are walkable from the front
// and sides instead of being decorative geometry over a flat floor.
export const MAINFRAME_STEPS = [
  { minX: -6, maxX: 6, minZ: 18.65, maxZ: 19.75, y: 0.6 },
  { minX: -6, maxX: 6, minZ: 19.85, maxZ: 20.95, y: 0.3 },
];

export const MAINFRAME_EAST_ENTRY_KEEP_CLEAR = {
  minX: 6.5, maxX: 9.8, minZ: 13.2, maxZ: 17.4,
};

// The factory stair reaches its landing at x=-8.4. The visible deck and rails
// must begin there rather than spanning back over the ascending flight.
export const FACTORY_CATWALK = {
  minX: -8.4, maxX: 12, minZ: -53.1, maxZ: -50.9, y: 3.1,
  stairLandingX: -8.4,
};

// The colliders that close in a stair flight climbing along X.
//
// A flight is visual boxes sitting over a floorY ramp: nothing about it is solid
// on its own, so without these you walk straight in from the side or from behind
// and end up standing inside the staircase, under the treads.
//
// One collider per step down each long edge rather than one wall per flight,
// following the mainframe platform fascia: each segment is only as tall as the
// stairs beside it, and is a one-way side keyed to the tread it guards.
// Approaching at floor level you launched from y=0, so every segment blocks and
// the flight reads as closed from below. Once you are on the flight you launched
// from the tread itself, so the segments release and you can run off either side
// and drop — a staircase in the open, not a trench. Zombies ignore the one-way
// flag entirely (see moveZombie), so for them a flight stays solid and the
// stairs remain the only way up.
export function stairFlightColliders({
  xLow, xHigh, zMin, zMax, yTop, steps, closeHighEnd = false, playerRadius = 0.35,
}) {
  const out = [];
  const sign = Math.sign(xHigh - xLow);
  const run = Math.abs(xHigh - xLow);
  const stepRun = run / steps, stepRise = yTop / steps;
  // Release at the tread height a player-radius BACK down the flight, so the
  // step you stand on also frees the segment of the step above — your collision
  // circle always overlaps it, and keying each segment to its own height would
  // fence you in for the lower half of every step.
  const releaseAt = (y) => Math.max(0, y - (yTop / run) * playerRadius);
  for (let i = 0; i < steps; i++) {
    const a = xLow + sign * stepRun * i, b = a + sign * stepRun;
    for (const sz of [zMin, zMax]) out.push({
      minX: Math.min(a, b), maxX: Math.max(a, b),
      minZ: sz - 0.09, maxZ: sz + 0.09,
      // Stand proud of the tread so a zombie on the flight is held on it at
      // every height, the way a full-height stringer wall would.
      y0: 0, h: stepRise * (i + 1) + 1.1, prop: true,
      // ...but a full-height stringer wall is not what you SEE. These flights
      // are drawn as eight bare tread plates with open sides, so the volume
      // this collider occupies above and below the treads is empty air to the
      // eye. It still ate every bullet crossing it, which is why shooting a
      // zombie standing in the open void under the balcony stairs — the ones by
      // Juggernog and Double Tap — never registered. Physical for bodies,
      // transparent to shots; the treads carry their own bullet collider.
      bulletPass: true,
      // A stringer is what makes the flight a flight, not clutter standing in
      // it — the traversal audit must not read its own structure as a blocker.
      keepClearExempt: true,
      oneWayPlatformSide: true, oneWayDeckTop: releaseAt(stepRise * i),
    });
  }
  // Wall off the top of the flight where it butts into a slab: the space under
  // the treads is structure, not a room to walk into from the far side. Stops
  // just under the deck so standing on the deck above can never re-activate it.
  //
  // It has to release for the climber, though. A player is a 0.35m circle, so
  // their body reaches this wall while their feet are still a step and a bit
  // below the landing — solid at that height, the wall meant the last 0.21m of
  // both balcony flights could only be cleared with a jump. Keyed the same way
  // as the side segments it opens the moment you are actually on the top of the
  // flight, and stays solid for anyone on the floor underneath.
  if (closeHighEnd) out.push({
    minX: Math.min(xHigh, xHigh + sign * 0.18), maxX: Math.max(xHigh, xHigh + sign * 0.18),
    minZ: zMin, maxZ: zMax, y0: 0, h: yTop - 0.06, prop: true, keepClearExempt: true,
    oneWayPlatformSide: true, oneWayDeckTop: releaseAt(yTop),
    bulletPass: true, // invisible, like the side segments — see the note above
  });
  return out;
}

export function platformSideBlocksAtFeet(collider, feetY, launchY = feetY) {
  if (!collider?.oneWayPlatformSide) return true;
  const top = (collider.y0 || 0) + (collider.h || 0);
  if (Number.isFinite(collider.oneWayDeckTop)) {
    // Decide by the surface the player launched from, not jump apex. Someone
    // already on the deck may leave; a courtyard jump cannot phase inward.
    return launchY < collider.oneWayDeckTop - 0.06;
  }
  // Ground-level approaches collide with the platform fascia. A player whose
  // feet are already on the deck (or airborne above it) may cross outward.
  // The 0.28m release band is below a normal jump apex but above floor-level
  // walking, so a deliberate jump can mount the 0.9m deck from either side.
  return feetY < top - 0.28;
}

export const MAP_RAMPS = [
  { id: 'mainframeSteps', minX: -6, maxX: 6, minZ: 18.5, maxZ: 21.5, axis: 'z', dir: 1, y0: 0.9, y1: 0 },
  { id: 'labStairs', minX: -13.2, maxX: -8.8, minZ: -13.2, maxZ: -10.8, axis: 'x', dir: 1, y0: 0, y1: 2.9, approach: 2.6 },
  { id: 'garageStairs', minX: 8.8, maxX: 13.2, minZ: -13.2, maxZ: -10.8, axis: 'x', dir: -1, y0: 0, y1: 2.9, approach: 2.6 },
  // The bottom of this flight used to start at x = -13.2, but factory_west sits
  // at x = -14 with a 0.4m thickness, so its inner face is at -13.8. That left
  // a 0.6m pocket at the foot of the stairs — narrower than the player's own
  // 0.7m diameter — so you could not physically stand at the bottom and the
  // flight was unclimbable. Pulled back to -12.6 for 1.2m of approach room.
  { id: 'catwalkStairs', minX: -12.6, maxX: -8.4, minZ: -53.4, maxZ: -50.8, axis: 'x', dir: 1, y0: 0, y1: 3.1, approach: 2.6 },
];

// Every volume a player actually moves through, and the headroom it needs kept
// empty. Dressing must never enter one.
//
// Decoration is placed from a room's RECTANGLE at a height fixed per room, and
// that height knows nothing about what is underneath it. A ceiling duct pinned
// 3.55m above the ground floor of the two corridor rooms crossed both balcony
// stairwells — where the top tread is already at 2.9m — so it hung 0.65m over
// the landing with nothing holding it up and nothing above it: a box floating
// in mid-air across the only route upstairs, on the Double Tap flight and its
// mirror above Juggernog. The factory catwalk had the identical bug and was
// patched on its own (the old `clearOfCatwalk`, cables only); this generalises
// the guard so it covers every walkway and every kind of dressing instead.
//
// `floorY` is the surface a player stands on, `clearTop` the height below which
// nothing decorative may sit. Elevated decks are listed too, because one room's
// floor is the room below's ceiling: a run hung at "ceiling height" for the
// lower room surfaces just above the deck of the upper one.
const WALKWAY_HEADROOM = 2.3;

const rampWalkway = (r) => ({
  id: r.id,
  minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ,
  floorY: Math.min(r.y0, r.y1),
  clearTop: Math.max(r.y0, r.y1) + WALKWAY_HEADROOM,
});

// A doorway is only as wide as its opening, but the approach on both sides has
// to stay walkable too, so the volume is padded across the wall line.
const doorWalkway = (d) => {
  const half = (d.w || 1.9) / 2, y = d.y || 0;
  return {
    id: d.id,
    minX: d.vert ? d.x - 0.9 : d.x - half,
    maxX: d.vert ? d.x + 0.9 : d.x + half,
    minZ: d.vert ? d.z - half : d.z - 0.9,
    maxZ: d.vert ? d.z + half : d.z + 0.9,
    floorY: y,
    clearTop: y + WALKWAY_HEADROOM,
  };
};

export const MAP_WALKWAYS = [
  ...MAP_RAMPS.map(rampWalkway),
  ...MAP_DOOR_DEFS.map(doorWalkway),
  {
    id: 'catwalkDeck',
    minX: FACTORY_CATWALK.minX, maxX: FACTORY_CATWALK.maxX,
    minZ: FACTORY_CATWALK.minZ, maxZ: FACTORY_CATWALK.maxZ,
    floorY: FACTORY_CATWALK.y, clearTop: FACTORY_CATWALK.y + WALKWAY_HEADROOM,
  },
  // Elevated decks — these match the slabs built in map.js (`slabHole`, and the
  // bridge deck), so dressing hung for the room underneath cannot surface here.
  { id: 'labBalconyDeck', minX: -14, maxX: -6, minZ: -22, maxZ: -8, floorY: 2.9, clearTop: 2.9 + WALKWAY_HEADROOM },
  { id: 'garageBalconyDeck', minX: 6, maxX: 14, minZ: -22, maxZ: -8, floorY: 2.9, clearTop: 2.9 + WALKWAY_HEADROOM },
  { id: 'bridgeDeck', minX: -6, maxX: 6, minZ: -13, maxZ: -11, floorY: 2.9, clearTop: 2.9 + WALKWAY_HEADROOM },
];

// Routes that carry no door record. A doorway announces itself to the dressing
// pipeline through MAP_DOOR_DEFS; an opening cut in a wall announces nothing, so
// nothing knew these existed and a workbench spawned squarely in the Chemical
// Testing courtyard exit. Each of these is the only route it serves.
export const MAP_OPEN_EXITS = [
  { id: 'chemCourtyardExit', minX: 9.2, maxX: 11.8, minZ: -31.4, maxZ: -28.6, floorY: 2.9 },
  { id: 'labBalconyDrop', minX: -11.4, maxX: -8.6, minZ: -23.0, maxZ: -21.0, floorY: 2.9 },
  { id: 'garageBalconyDrop', minX: 6.6, maxX: 9.4, minZ: -23.0, maxZ: -21.0, floorY: 2.9 },
];

// Both balcony flights are set into the outer wall of a corridor, so you meet
// them side-on: the approach is the band ACROSS the hallway in front of the
// mouth, not just the strip in line with the run that `approach` describes. A
// prop on the near wall and one on the far wall need not touch the stairs at all
// to turn that band into a chicane at the one point you most want to be running,
// and that is exactly what a machine and a crate facing each other did. Full
// room width, because the point of the band is that you can cross it.
//
// Only the balcony flights get one. The catwalk stairs open onto twenty-eight
// metres of factory floor, where there is no lane to pinch.
export const MAP_STAIR_MOUTHS = [
  { id: 'labStairsMouth', minX: -14, maxX: -6, minZ: -10.8, maxZ: -8.2, floorY: 0 },
  { id: 'garageStairsMouth', minX: 6, maxX: 14, minZ: -10.8, maxZ: -8.2, floorY: 0 },
];

// A flight is only usable if you can walk ONTO it. The ramp footprint was
// described (see rampWalkway) but the apron at each end — where you turn in off
// the floor, and where you step off onto the deck — was not, so a crate parked
// against the wall a couple of metres short of the balcony stairs stood in the
// only lane to them and nothing said that was wrong.
//
// The apron reaches the same distance in every direction, not only along the
// run: a 2.4m flight boxed in against an outer wall is approached on whatever
// heading the room gives you, and clutter beside its mouth blocks it as surely
// as clutter on the treads. Only ramps that declare an `approach` get one — the
// mainframe terrace is twelve metres wide and open on three sides, so there is
// no lane there to keep clear and a landmark 1.4m off its end blocks nothing.
const rampTraversalZones = (r) => {
  const zones = [
    { id: r.id, minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, floorY: Math.min(r.y0, r.y1) },
  ];
  if (!r.approach) return zones;
  const alongX = r.axis === 'x';
  const pad = r.approach;
  // `dir` points at the tt=1 end, which is where y1 is — not necessarily the top.
  const apron = (id, at, floorY) => zones.push({
    id,
    minX: alongX ? at - pad : r.minX - pad,
    maxX: alongX ? at + pad : r.maxX + pad,
    minZ: alongX ? r.minZ - pad : at - pad,
    maxZ: alongX ? r.maxZ + pad : at + pad,
    floorY,
  });
  const start = alongX ? (r.dir > 0 ? r.minX : r.maxX) : (r.dir > 0 ? r.minZ : r.maxZ);
  const end = alongX ? (r.dir > 0 ? r.maxX : r.minX) : (r.dir > 0 ? r.maxZ : r.minZ);
  apron(`${r.id}${r.y0 <= r.y1 ? 'Foot' : 'Landing'}`, start, r.y0);
  apron(`${r.id}${r.y0 <= r.y1 ? 'Landing' : 'Foot'}`, end, r.y1);
  return zones;
};

// Every volume that has to stay walkable end to end. Dressing is kept out of
// these at placement time (map-props) and a build-time audit fails the map if
// anything solid lands inside one anyway.
export const MAP_TRAVERSAL_ZONES = [
  ...MAP_RAMPS.flatMap(rampTraversalZones),
  ...MAP_STAIR_MOUTHS,
  ...MAP_OPEN_EXITS,
];

export const MAP_NAV_LINKS = [
  { from: 'leftcorridor', to: 'animallab', x: -14, z: -12, passage: true },
  { from: 'animallab', to: 'leftcorridor', x: -14, z: -12, passage: true },
  { from: 'leftcorridor', to: 'upstairsa', x: -11, z: -12, stair: true, route: 'labStairs' },
  { from: 'upstairsa', to: 'leftcorridor', x: -11, z: -12, stair: true, route: 'labStairs' },
  { from: 'garageentrance', to: 'upstairsg', x: 11, z: -12, stair: true, route: 'garageStairs' },
  { from: 'upstairsg', to: 'garageentrance', x: 11, z: -12, stair: true, route: 'garageStairs' },
  { from: 'upstairsa', to: 'courtyard', x: -10, z: -22, drop: true },
  { from: 'upstairsg', to: 'courtyard', x: 8, z: -22, drop: true },
  { from: 'factory', to: 'catwalk', x: -13, z: -52, stair: true, route: 'catwalkStairs' },
  { from: 'catwalk', to: 'factory', x: -13, z: -52, stair: true, route: 'catwalkStairs' },
];

// Return every room from which an enemy can follow the CURRENT directed graph
// to at least one player. Doors are bidirectional once open; nav links retain
// their declared direction (in particular, balcony drops never become ladders).
// Traversing predecessors from each player room computes that set directly.
/**
 * Same reverse walk as `roomsThatCanReachPlayers`, but keyed by how many room
 * transitions separate each room from the nearest player.
 *
 * The spawner needs the hop count, not just membership: pooling every reachable
 * window with equal weight meant the tail of a wave was routinely born at the
 * far shell of the map. Measured, with a player in the Factory on round one, the
 * sixth of six zombies spawned at a Mainframe window 76m away and walked for 80
 * seconds — the player spent the round hunting for a zombie that was still on
 * its way. Ringing by depth keeps the overflow adjacent instead of anywhere.
 *
 * Direction is preserved exactly as in the Set version: an open door is
 * bidirectional, a nav link keeps its declared direction, so a balcony drop
 * never becomes a ladder.
 *
 * @returns {Map<string, number>} room id -> hop count (0 for a player's room)
 */
export function roomDepthsToPlayers(playerRooms, openDoors = [], navLinks = MAP_NAV_LINKS) {
  const predecessors = new Map();
  const addPredecessor = (to, from) => {
    if (!predecessors.has(to)) predecessors.set(to, []);
    predecessors.get(to).push(from);
  };
  for (const door of openDoors) {
    if (!Array.isArray(door?.rooms) || door.rooms.length !== 2) continue;
    addPredecessor(door.rooms[0], door.rooms[1]);
    addPredecessor(door.rooms[1], door.rooms[0]);
  }
  for (const link of navLinks || []) {
    if (!link?.from || !link?.to) continue;
    addPredecessor(link.to, link.from);
  }
  const depth = new Map();
  const queue = [];
  for (const room of playerRooms || []) {
    if (room && !depth.has(room)) { depth.set(room, 0); queue.push(room); }
  }
  // Breadth-first, so the first time a room is reached is by a shortest path.
  for (let i = 0; i < queue.length; i++) {
    const room = queue[i];
    const next = depth.get(room) + 1;
    for (const predecessor of predecessors.get(room) || []) {
      if (depth.has(predecessor)) continue;
      depth.set(predecessor, next);
      queue.push(predecessor);
    }
  }
  return depth;
}

export function roomsThatCanReachPlayers(playerRooms, openDoors = [], navLinks = MAP_NAV_LINKS) {
  const predecessors = new Map();
  const addPredecessor = (to, from) => {
    if (!predecessors.has(to)) predecessors.set(to, []);
    predecessors.get(to).push(from);
  };
  for (const door of openDoors) {
    if (!Array.isArray(door?.rooms) || door.rooms.length !== 2) continue;
    addPredecessor(door.rooms[0], door.rooms[1]);
    addPredecessor(door.rooms[1], door.rooms[0]);
  }
  for (const link of navLinks || []) {
    if (!link?.from || !link?.to) continue;
    addPredecessor(link.to, link.from);
  }

  const reachable = new Set((playerRooms || []).filter(Boolean));
  const queue = [...reachable];
  while (queue.length) {
    const room = queue.shift();
    for (const predecessor of predecessors.get(room) || []) {
      if (reachable.has(predecessor)) continue;
      reachable.add(predecessor);
      queue.push(predecessor);
    }
  }
  return reachable;
}

// Pick a rise point on the survivor's actual floor and in their actual room.
// Stacked rectangles (balcony over corridor, catwalk over factory) make a plain
// roomAt(x,z) query resolve the ground floor and were the source of underground
// emergency spawns that could not reach an upper-only survivor.
export function elevationAwareRiseCandidate({ target, candidates, roomAt, floorY }) {
  if (!target || typeof roomAt !== 'function' || typeof floorY !== 'function') return null;
  const targetY = Number.isFinite(Number(target.y)) ? Number(target.y) : 0;
  const targetRoom = roomAt(target.x, target.z, targetY);
  if (!targetRoom) return null;
  for (const candidate of candidates || []) {
    if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) continue;
    const y = floorY(candidate.x, candidate.z, targetY);
    const room = roomAt(candidate.x, candidate.z, y);
    if (room === targetRoom) return { x: candidate.x, z: candidate.z, y, room };
  }
  return null;
}
