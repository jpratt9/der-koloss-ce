// The map's physical shell: the rooms, the wall runs with their windows, doors
// and passages, the doors that fill those openings, and how a door fits its
// opening. No DOM and no Three.js, so CI can import it.

export const MAP_ROOMS = [
  // Stacked areas must precede their ground-level footprints.
  { id: 'upstairsa', name: 'Lab Balcony', rect: { minX: -14, maxX: -6, minZ: -22, maxZ: -8 }, yMin: 2.0 },
  { id: 'upstairsg', name: 'Garage Balcony', rect: { minX: 6, maxX: 14, minZ: -22, maxZ: -8 }, yMin: 2.0 },
  { id: 'chemtesting', name: 'Chemical Testing', rect: { minX: 10, maxX: 24, minZ: -38, maxZ: -22 }, yMin: 2.0 },
  { id: 'bridge', name: 'Bridge', rect: { minX: -6, maxX: 6, minZ: -13, maxZ: -11 }, yMin: 2.0 },
  { id: 'catwalk', name: 'Catwalk', rect: { minX: -12, maxX: 12, minZ: -53.1, maxZ: -50.9 }, yMin: 2.2 },
  { id: 'mainframe', name: 'Mainframe', rect: { minX: -10, maxX: 10, minZ: 14, maxZ: 26 }, outdoor: true },
  { id: 'leftcorridor', name: 'Left Corridor', rect: { minX: -14, maxX: -6, minZ: -22, maxZ: 14 } },
  { id: 'garageentrance', name: 'Garage Entrance', rect: { minX: 6, maxX: 14, minZ: -22, maxZ: 14 } },
  { id: 'animallab', name: 'Animal Testing Lab', rect: { minX: -32, maxX: -14, minZ: -20, maxZ: -6 } },
  { id: 'genroom', name: 'Generator Room', rect: { minX: -44, maxX: -32, minZ: -20, maxZ: -6 } },
  { id: 'autogarage', name: 'Automobile Garage', rect: { minX: 14, maxX: 32, minZ: -20, maxZ: -6 } },
  { id: 'courtyard', name: 'Courtyard', rect: { minX: -16, maxX: 10, minZ: -42, maxZ: -22 }, outdoor: true },
  { id: 'factory', name: 'Main Factory', rect: { minX: -14, maxX: 14, minZ: -62, maxZ: -42 } },
];

// Doorway fit, in metres. These numbers exist as data because the wall opening
// and the things that fill it are built by three different modules, and they
// used to agree EXACTLY — which is the one thing they must never do.
//
// `wallRun()` cuts the opening by leaving a gap of the door's width, so the
// brick has a cut face at exactly ±w/2. The channel-iron jamb's inner face and
// the steel leaf's edge both landed on that same plane, so three coplanar
// surfaces fought for every pixel down both sides of every doorway and along
// every lintel. That is the thin bright line players see beside a door.
//
// The jamb now REBATES into the opening, hiding the brick cut face behind it,
// and the leaf is inset far enough to sit inside that rebate. A real door jamb
// is built exactly this way, so it also reads better.
export const DOOR_FIT = {
  // How far the jamb post reaches past the wall cut plane, into the opening.
  jambRebate: 0.06,
  // Structural post section (across the opening x through the wall).
  postWidth: 0.28,
  postDepth: 0.34,
  // How much narrower/shorter the moving leaf is than the raw opening.
  leafInset: 0.06,
  // Wall thickness, mirrored from WALL_T in map.js.
  wallThickness: 0.4,
};

/**
 * Wall runs whose TOP is exactly the base of another run standing on them.
 *
 * Two stacked runs meet at a shared height, and so does the floor deck poured
 * at that height — three upward-facing surfaces in one plane. Where the upper
 * run is solid its skirt (see `wallRun` in map.js) swallows the joint, but a
 * DOOR OPENING in the upper run leaves a hole with nothing in it below the
 * lintel, and that is precisely where the player walks. On the Lab Balcony's
 * bridge doorway this put the ground wall's cap and the deck's surface in the
 * same plane right across the threshold.
 *
 * Sinking the capped run's visible top puts it inside the deck slab instead.
 * Returns a Set of run ids; `map.js` lowers their brickwork, never the
 * collider.
 * @param {Array} runs wall-run records, as in MAP_WALL_RUNS
 */
export function cappedWallRuns(runs) {
  const box = (w) => {
    const horiz = Math.abs(w.z2 - w.z1) < 0.001;
    const T = 0.4;
    return {
      minX: horiz ? Math.min(w.x1, w.x2) : w.x1 - T / 2,
      maxX: horiz ? Math.max(w.x1, w.x2) : w.x1 + T / 2,
      minZ: horiz ? w.z1 - T / 2 : Math.min(w.z1, w.z2),
      maxZ: horiz ? w.z1 + T / 2 : Math.max(w.z1, w.z2),
      y0: w.y0 || 0,
    };
  };
  const boxes = runs.map(box);
  const capped = new Set();
  for (let i = 0; i < runs.length; i++) {
    const top = boxes[i].y0 + runs[i].h;
    for (let j = 0; j < runs.length; j++) {
      if (i === j) continue;
      if (Math.abs(boxes[j].y0 - top) > 0.001) continue;
      const dx = Math.min(boxes[i].maxX, boxes[j].maxX) - Math.max(boxes[i].minX, boxes[j].minX);
      const dz = Math.min(boxes[i].maxZ, boxes[j].maxZ) - Math.max(boxes[i].minZ, boxes[j].minZ);
      if (dx > 0.05 && dz > 0.05) { capped.add(runs[i].id); break; }
    }
  }
  return capped;
}

const purchasableDoor = (door) => ({ ...door, visibilityTreatment: 'framed-lit-cost' });

export const MAP_DOOR_DEFS = [
  purchasableDoor({ id: 'd_mainL', rooms: ['mainframe', 'leftcorridor'], x: -8, z: 14, cost: 750 }),
  purchasableDoor({ id: 'd_mainR', rooms: ['mainframe', 'garageentrance'], x: 8, z: 14, cost: 750 }),
  // Animal Lab remains connected by a permanent lit opening below. Keeping a
  // second paid slab here beside d_pwrL made the Juggernog side read as two
  // adjacent doors buying the same route.
  // One deliberate Automobile Garage entrance is enough. d_gar used to sit
  // five metres north of this gate and joined the same two rooms, so opening
  // either adjacent door bought the exact same route and made the Double Tap
  // stairs look unfinished.
  purchasableDoor({ id: 'd_upG', rooms: ['autogarage', 'garageentrance'], x: 14, z: -12, cost: 1000, vert: true }),
  purchasableDoor({ id: 'd_gen', rooms: ['animallab', 'genroom'], x: -32, z: -13, cost: 1250, vert: true }),
  purchasableDoor({ id: 'd_chem', rooms: ['upstairsg', 'chemtesting'], x: 12, z: -22, cost: 750, y: 2.9 }),
  purchasableDoor({ id: 'd_fact', rooms: ['courtyard', 'factory'], x: -2, z: -42, cost: 1250, w: 2.2 }),
  purchasableDoor({ id: 'd_pwrL', rooms: ['leftcorridor', 'courtyard'], x: -10, z: -22, cost: 1000 }),
  // The Double Tap side needs a player-controlled entrance just like the
  // Juggernog route. This used to be power-sealed, which made the nearby open
  // undercroft look like the only route and led players outside the map.
  purchasableDoor({
    id: 'd_pwrR', rooms: ['garageentrance', 'courtyard'], x: 8, z: -22,
    cost: 1000, w: 3.2, openingStyle: 'wide-passage',
  }),
  purchasableDoor({ id: 'd_bridgeW', rooms: ['upstairsa', 'bridge'], x: -6, z: -12, cost: 750, vert: true, y: 2.9 }),
  purchasableDoor({ id: 'd_bridgeE', rooms: ['upstairsg', 'bridge'], x: 6, z: -12, cost: 750, vert: true, y: 2.9 }),
];

// Physical shell for the whole playable map. A gap is deliberately one of:
// - window: a board barrier with an explicit inward normal;
// - door: exactly one MAP_DOOR_DEFS entry occupies the opening;
// - passage: a permanent opening (never rendered as a misleading metal door).
// Keeping this data pure lets CI prove that visible walls, colliders, barriers,
// and door interactions all describe the same geometry.
const windowGap = (at, inward, room, w = 1.6) => ({ at, w, kind: 'window', in: inward, room });
const doorGap = (at, doorId, w = 1.9) => ({ at, w, kind: 'door', doorId });
const passageGap = (at, w = 1.9) => ({ at, w, kind: 'passage' });

export const MAP_WALL_RUNS = [
  { id: 'mainframe_north', x1: -10, z1: 26, x2: 10, z2: 26, h: 4.5, gaps: [windowGap(6, -1, 'mainframe'), windowGap(14, -1, 'mainframe')] },
  { id: 'mainframe_west', x1: -10, z1: 14, x2: -10, z2: 26, h: 4.5, gaps: [windowGap(6, 1, 'mainframe')] },
  { id: 'mainframe_east', x1: 10, z1: 14, x2: 10, z2: 26, h: 4.5, gaps: [windowGap(6, -1, 'mainframe')] },
  { id: 'mainframe_south', x1: -14, z1: 14, x2: 14, z2: 14, h: 4.5, gaps: [doorGap(6, 'd_mainL'), doorGap(22, 'd_mainR')] },

  { id: 'left_outer', x1: -14, z1: -8, x2: -14, z2: 14, h: 4.5, gaps: [windowGap(10, 1, 'leftcorridor'), windowGap(16, 1, 'leftcorridor')] },
  { id: 'left_inner', x1: -6, z1: -8, x2: -6, z2: 14, h: 4.5, gaps: [] },
  { id: 'lab_balcony_south', x1: -14, z1: -8, x2: -6, z2: -8, h: 3.2, y0: 2.9, gaps: [] },
  { id: 'lab_balcony_outer', x1: -14, z1: -22, x2: -14, z2: -8, h: 4.5, gaps: [passageGap(10, 2.4)] },
  // y0 starts where courtyard_north ENDS, not at balcony deck height. Both of
  // these sit at the same z and thickness as courtyard_north (y 0-4.5), so a
  // y0 of 2.9 put two identical brick walls in the same space from 2.9 to 4.5
  // — an 8m x 1.6m pair of coplanar faces that z-fought into a shimmering grey
  // slab across the wall at balcony height. Nothing is lost by starting at
  // 4.5: courtyard_north already blocks the balcony edge below that, and the
  // door gap there lines up with this run's passage gap.
  { id: 'lab_balcony_drop', x1: -14, z1: -22, x2: -6, z2: -22, h: 1.6, y0: 4.5, gaps: [passageGap(4)] },
  { id: 'left_alley_ground', x1: -6, z1: -22, x2: -6, z2: -8, h: 2.9, gaps: [] },
  // Elevated fake windows were removed: ground-level zombies spawned against
  // them and attacked empty air. The only opening here is the real bridge gate.
  { id: 'lab_balcony_inner', x1: -6, z1: -22, x2: -6, z2: -8, h: 3.2, y0: 2.9, gaps: [doorGap(10, 'd_bridgeW')] },

  { id: 'animal_south', x1: -32, z1: -20, x2: -14, z2: -20, h: 4.5, gaps: [windowGap(8, 1, 'animallab')] },
  { id: 'animal_west', x1: -32, z1: -20, x2: -32, z2: -6, h: 4.5, gaps: [windowGap(4, 1, 'animallab'), doorGap(7, 'd_gen'), windowGap(10, 1, 'animallab')] },
  { id: 'animal_north', x1: -32, z1: -6, x2: -14, z2: -6, h: 4.5, gaps: [] },
  { id: 'generator_west', x1: -44, z1: -20, x2: -44, z2: -6, h: 4.5, gaps: [windowGap(4, 1, 'genroom'), windowGap(10, 1, 'genroom')] },
  { id: 'generator_south', x1: -44, z1: -20, x2: -32, z2: -20, h: 4.5, gaps: [] },
  { id: 'generator_north', x1: -44, z1: -6, x2: -32, z2: -6, h: 4.5, gaps: [] },

  { id: 'garage_inner', x1: 6, z1: -8, x2: 6, z2: 14, h: 4.5, gaps: [] },
  { id: 'garage_outer', x1: 14, z1: -8, x2: 14, z2: 14, h: 4.5, gaps: [windowGap(12, -1, 'garageentrance'), windowGap(18, -1, 'garageentrance')] },
  { id: 'garage_balcony_south', x1: 6, z1: -8, x2: 14, z2: -8, h: 3.2, y0: 2.9, gaps: [] },
  // Solid bulkhead: the former underbridge pocket is deliberately not a room.
  { id: 'central_void_bulkhead', x1: -6, z1: -8, x2: 6, z2: -8, h: 4.5, gaps: [] },
  { id: 'auto_west', x1: 14, z1: -20, x2: 14, z2: -8, h: 4.5, gaps: [doorGap(8, 'd_upG')] },
  { id: 'auto_east', x1: 32, z1: -20, x2: 32, z2: -6, h: 4.5, gaps: [windowGap(4, -1, 'autogarage'), windowGap(10, -1, 'autogarage')] },
  { id: 'auto_south', x1: 14, z1: -20, x2: 32, z2: -20, h: 4.5, gaps: [] },
  { id: 'auto_north', x1: 14, z1: -6, x2: 32, z2: -6, h: 4.5, gaps: [] },
  { id: 'auto_stub', x1: 14, z1: -22, x2: 14, z2: -20, h: 4.5, gaps: [] },
  { id: 'right_alley_ground', x1: 6, z1: -22, x2: 6, z2: -8, h: 2.9, gaps: [] },
  { id: 'garage_balcony_inner', x1: 6, z1: -22, x2: 6, z2: -8, h: 3.2, y0: 2.9, gaps: [doorGap(10, 'd_bridgeE')] },
  { id: 'garage_balcony_drop', x1: 6, z1: -22, x2: 10, z2: -22, h: 1.6, y0: 4.5, gaps: [passageGap(2)] },

  { id: 'chem_north_upper', x1: 10, z1: -22, x2: 24, z2: -22, h: 3.2, y0: 2.9, gaps: [doorGap(2, 'd_chem')] },
  { id: 'chem_west_upper', x1: 10, z1: -38, x2: 10, z2: -22, h: 3.2, y0: 2.9, gaps: [passageGap(8, 2.4)] },
  { id: 'chem_south_upper', x1: 10, z1: -38, x2: 24, z2: -38, h: 3.2, y0: 2.9, gaps: [] },
  { id: 'chem_east_upper', x1: 24, z1: -38, x2: 24, z2: -22, h: 3.2, y0: 2.9, gaps: [] },
  { id: 'chem_north_ground', x1: 10, z1: -22, x2: 24, z2: -22, h: 2.9, gaps: [] },
  { id: 'chem_east_ground', x1: 24, z1: -38, x2: 24, z2: -22, h: 2.9, gaps: [] },
  { id: 'chem_south_ground', x1: 10, z1: -38, x2: 24, z2: -38, h: 2.9, gaps: [] },

  // The Courtyard holds the first mystery box but had no windows of its own, so
  // every zombie reaching it had to walk the whole way from Mainframe through a
  // door. That made the box a safe room. These two put the pressure back.
  //
  // The west perimeter is the only courtyard wall that can carry them. North
  // faces the Left Corridor and Garage Entrance, south is the Factory, and the
  // east wall backs onto Chemical Testing's undercroft — a barrier alcove
  // stands 2.8m out from the wall, so on any of those it would be a brick
  // pocket in the middle of a playable room. West of x=-16 is outside the
  // shell, which is where the other sixteen alcoves live.
  { id: 'courtyard_west', x1: -16, z1: -42, x2: -16, z2: -22, h: 4.5, gaps: [windowGap(5, 1, 'courtyard'), windowGap(14, 1, 'courtyard')] },
  { id: 'courtyard_east_south', x1: 10, z1: -42, x2: 10, z2: -38, h: 4.5, gaps: [] },
  { id: 'courtyard_east_north', x1: 10, z1: -38, x2: 10, z2: -22, h: 2.9, gaps: [] },
  { id: 'courtyard_north', x1: -16, z1: -22, x2: 10, z2: -22, h: 4.5, gaps: [doorGap(6, 'd_pwrL'), doorGap(24, 'd_pwrR', 3.2)] },
  { id: 'factory_north', x1: -16, z1: -42, x2: 14, z2: -42, h: 7, gaps: [doorGap(14, 'd_fact', 2.2)] },
  { id: 'factory_west', x1: -14, z1: -62, x2: -14, z2: -42, h: 7, gaps: [windowGap(10, 1, 'factory')] },
  { id: 'factory_east', x1: 14, z1: -62, x2: 14, z2: -42, h: 7, gaps: [windowGap(14, -1, 'factory')] },
  { id: 'factory_south', x1: -14, z1: -62, x2: 14, z2: -62, h: 7, gaps: [] },
];
