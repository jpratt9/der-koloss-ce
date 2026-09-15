// The map layout's own decisions: what js/map-layout.js and js/map-layout/
// work out beyond the tables audit-map-egress pins and the flights
// validate-movement-feel walks.
//
// - roomDepthsToPlayers() rings the rooms by how many transitions separate each
//   one from the nearest player. The spawner fills the nearest ring first, so a
//   wave is born near the players rather than anywhere on the map. An open door
//   works both ways and a nav link only the way it points, so a balcony drop
//   never becomes a ladder. It reaches exactly the rooms
//   roomsThatCanReachPlayers() does.
// - The keep-clear volumes come from the tables they guard: a walkway over
//   every ramp, doorway and deck, all with the same headroom, and a traversal
//   zone over every ramp, with an apron at each end of a flight that declares
//   an approach.
// - The clearance audits count only what can be in the way: props, never a
//   flight's own exempt structure, and only on the floor a zone names.
//   auditInteractableApproaches() skips standing points outside a room or on
//   another floor, and colliders a player's body can't touch.
// - The structure audits reject each class of mistake audit-map-egress doesn't
//   already try, and with no arguments they audit the tables js/map-layout.js
//   exports.
// - cappedWallRuns(), papEnergyEnvelope() and elevationAwareRiseCandidate()
//   behave on shapes of their own, not only on the map's.
import assert from 'node:assert/strict';
import {
  MAP_ROOMS, MAP_DOOR_DEFS, MAP_WALL_RUNS, MAP_WALLBUYS, MAP_PERKS, MAP_RAMPS, MAP_NAV_LINKS, MAP_WALKWAYS,
  MAP_TRAVERSAL_ZONES, MAP_STAIR_MOUTHS, MAP_OPEN_EXITS, FACTORY_CATWALK, PAP_ENERGY_VISUAL,
  roomDepthsToPlayers, roomsThatCanReachPlayers, auditKeepClearZone, auditInteractableApproaches, auditMapStructure,
  auditMapEgress, cappedWallRuns, papEnergyEnvelope, stairFlightColliders, elevationAwareRiseCandidate,
} from '../js/map-layout.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const rect = (box) => [box.minX, box.maxX, box.minZ, box.maxZ];

// ---------------------------------------------------------------------------
// roomDepthsToPlayers() rings the rooms by hops to the nearest player.
// ---------------------------------------------------------------------------
{
  const depths = (...args) => Object.fromEntries(roomDepthsToPlayers(...args));
  const doors = (...ids) => MAP_DOOR_DEFS.filter((door) => ids.includes(door.id));

  assert.deepEqual(depths(['courtyard']), {
    courtyard: 0, upstairsa: 1, upstairsg: 1, leftcorridor: 2, garageentrance: 2, animallab: 3,
  }, 'with every door shut, only the balconies drop into the courtyard, and the corridors climb to them first');
  assert.deepEqual(depths(['upstairsg']), { upstairsg: 0, garageentrance: 1 },
    'the courtyard is no source for a balcony player: a drop only goes down');
  assert.deepEqual(depths(['upstairsg'], doors('d_pwrR')), {
    upstairsg: 0, garageentrance: 1, courtyard: 2, upstairsa: 3, leftcorridor: 4, animallab: 5,
  }, 'an open door must join its two rooms in both directions');
  assert.deepEqual(depths(['mainframe'], MAP_DOOR_DEFS), {
    mainframe: 0, leftcorridor: 1, garageentrance: 1, courtyard: 2, animallab: 2, upstairsa: 2, autogarage: 2,
    upstairsg: 2, factory: 3, genroom: 3, bridge: 3, chemtesting: 3, catwalk: 4,
  }, 'with every door open, each room must be rung at its shortest route to the player');
  assert.deepEqual(depths(['factory', 'catwalk', null, 'factory']), { factory: 0, catwalk: 0 },
    'every player room is ring 0, once, and an empty slot is skipped');
  assert.deepEqual(depths(['mainframe'], [{ rooms: ['mainframe'] }, null], [{ from: 'mainframe' }, null]), { mainframe: 0 },
    'a door without two rooms and a link without both ends must join nothing');
  assert.deepEqual(depths(['courtyard'], [], null), { courtyard: 0 }, 'null links must mean no links');
  assert.deepEqual([...roomDepthsToPlayers(['courtyard'])], [...roomDepthsToPlayers(['courtyard'], [], MAP_NAV_LINKS)],
    'a caller that passes no links must get MAP_NAV_LINKS');

  for (const room of MAP_ROOMS) {
    for (const open of [[], doors('d_fact', 'd_pwrL'), MAP_DOOR_DEFS]) {
      assert.deepEqual(new Set(roomDepthsToPlayers([room.id], open).keys()), roomsThatCanReachPlayers([room.id], open),
        `the rooms rung around a player in ${room.id} must be exactly the rooms that can reach it`);
    }
  }
}

// ---------------------------------------------------------------------------
// The keep-clear volumes come from the tables they guard.
// ---------------------------------------------------------------------------
{
  const walkways = new Map(MAP_WALKWAYS.map((w) => [w.id, w]));
  assert.equal(walkways.size, MAP_WALKWAYS.length, 'walkway ids must be unique');
  assert.equal(MAP_WALKWAYS.length, MAP_RAMPS.length + MAP_DOOR_DEFS.length + 4,
    'there must be a walkway for every ramp and every door, the catwalk deck and the three elevated decks');

  const catwalk = walkways.get('catwalkDeck');
  const headroom = catwalk.clearTop - catwalk.floorY;
  assert.ok(headroom >= 2, `walkway headroom ${headroom} must clear a standing player`);
  assert.deepEqual([...rect(catwalk), catwalk.floorY], [...rect(FACTORY_CATWALK), FACTORY_CATWALK.y],
    'the catwalk deck walkway must be the catwalk itself');
  for (const [deck, room] of [['labBalconyDeck', 'upstairsa'], ['garageBalconyDeck', 'upstairsg'], ['bridgeDeck', 'bridge']]) {
    assert.deepEqual(rect(walkways.get(deck)), rect(MAP_ROOMS.find((r) => r.id === room).rect),
      `${deck} must cover the whole of ${room}, so nothing hung for the room below surfaces through it`);
  }

  for (const ramp of MAP_RAMPS) {
    const w = walkways.get(ramp.id);
    assert.deepEqual(rect(w), rect(ramp), `${ramp.id}'s walkway must be its footprint`);
    assert.equal(w.floorY, Math.min(ramp.y0, ramp.y1), `${ramp.id}'s walkway must start at the foot of the flight`);
    assert.ok(near(w.clearTop, Math.max(ramp.y0, ramp.y1) + headroom), `${ramp.id} must keep full headroom above its top`);
  }
  for (const door of MAP_DOOR_DEFS) {
    const w = walkways.get(door.id);
    const [along0, along1, alongAt] = door.vert ? [w.minZ, w.maxZ, door.z] : [w.minX, w.maxX, door.x];
    const [across0, across1, acrossAt] = door.vert ? [w.minX, w.maxX, door.x] : [w.minZ, w.maxZ, door.z];
    assert.ok(near(along1 - along0, door.w || 1.9) && near((along0 + along1) / 2, alongAt),
      `${door.id}'s walkway must span its opening along the wall`);
    assert.ok(near(across1 - across0, 1.8) && near((across0 + across1) / 2, acrossAt),
      `${door.id}'s walkway must reach 0.9m out from the wall on both sides`);
    assert.equal(w.floorY, door.y || 0, `${door.id}'s walkway must be on the door's floor`);
    assert.ok(near(w.clearTop - w.floorY, headroom), `${door.id} must keep the same headroom as the decks`);
  }

  const zones = new Map(MAP_TRAVERSAL_ZONES.map((z) => [z.id, z]));
  assert.equal(zones.size, MAP_TRAVERSAL_ZONES.length, 'traversal zone ids must be unique');
  for (const ramp of MAP_RAMPS) {
    assert.deepEqual([...rect(zones.get(ramp.id)), zones.get(ramp.id).floorY], [...rect(ramp), Math.min(ramp.y0, ramp.y1)],
      `${ramp.id}'s traversal zone must be its footprint, from its foot`);
    const foot = zones.get(`${ramp.id}Foot`);
    const landing = zones.get(`${ramp.id}Landing`);
    if (!ramp.approach) {
      assert.equal(foot || landing, undefined, `${ramp.id} declares no approach, so it has no aprons`);
      continue;
    }
    const alongX = ramp.axis === 'x';
    const [low, high] = alongX ? [ramp.minX, ramp.maxX] : [ramp.minZ, ramp.maxZ];
    const [start, end] = ramp.dir > 0 ? [low, high] : [high, low];
    const [footAt, footY, landingAt, landingY] = ramp.y0 <= ramp.y1
      ? [start, ramp.y0, end, ramp.y1] : [end, ramp.y1, start, ramp.y0];
    for (const [apron, at, y] of [[foot, footAt, footY], [landing, landingAt, landingY]]) {
      const [a0, a1, c0, c1] = alongX ? rect(apron) : [apron.minZ, apron.maxZ, apron.minX, apron.maxX];
      const [side0, side1] = alongX ? [ramp.minZ, ramp.maxZ] : [ramp.minX, ramp.maxX];
      assert.ok(near(a0, at - ramp.approach) && near(a1, at + ramp.approach),
        `${apron.id} must reach ${ramp.approach}m either side of the end of the flight`);
      assert.ok(near(c0, side0 - ramp.approach) && near(c1, side1 + ramp.approach),
        `${apron.id} must reach ${ramp.approach}m past both sides of the flight`);
      assert.equal(apron.floorY, y, `${apron.id} must be on the floor at that end of the flight`);
    }
  }
  assert.equal(MAP_TRAVERSAL_ZONES.length,
    MAP_RAMPS.reduce((n, ramp) => n + (ramp.approach ? 3 : 1), 0) + MAP_STAIR_MOUTHS.length + MAP_OPEN_EXITS.length,
    'the traversal zones must be the ramps with their aprons, the stair mouths and the open exits, and nothing else');
  for (const zone of [...MAP_STAIR_MOUTHS, ...MAP_OPEN_EXITS]) {
    assert.ok(MAP_TRAVERSAL_ZONES.includes(zone), `${zone.id} must be a traversal zone`);
  }
}

// ---------------------------------------------------------------------------
// The clearance audits count only what can be in the way.
// ---------------------------------------------------------------------------
{
  const zone = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
  const prop = (o) => ({ minX: 1, maxX: 2, minZ: 1, maxZ: 2, y0: 0, h: 1, prop: true, ...o });
  const blocked = (z, colliders) => !auditKeepClearZone(z, colliders).ok;
  assert.equal(blocked(zone, [prop()]), true, 'a prop inside a zone must block it');
  assert.equal(blocked(zone, [prop({ prop: false })]), false, 'a collider that is not dressing, like a wall, must not block');
  assert.equal(blocked(zone, [prop({ keepClearExempt: true })]), false, 'an exempt prop, like a stair stringer, must not block');
  assert.equal(blocked(zone, [prop({ minX: 4, maxX: 5 })]), false, 'a prop that only touches the edge is outside the zone');
  assert.deepEqual(auditKeepClearZone(zone, [prop({ id: 'a' }), prop({ prop: false }), prop({ id: 'b' })]).blockers.map((c) => c.id),
    ['a', 'b'], 'the audit must name every prop that blocks, and only those');

  const upstairs = { ...zone, floorY: 2.9 };
  assert.equal(blocked(upstairs, [prop()]), false, 'a prop on the floor below the deck is no obstacle on the deck');
  assert.equal(blocked(upstairs, [prop({ y0: 5 })]), false, 'a prop 2m or more above the floor is overhead');
  assert.equal(blocked(upstairs, [prop({ y0: 2.9 })]), true, 'a prop standing on the zone\'s floor must block');
  assert.equal(blocked(upstairs, [prop({ h: 3.5 })]), true, 'a prop rising through the zone\'s floor must block');
  assert.equal(blocked(upstairs, [prop({ y0: undefined })]), true, 'a prop with no base height is on every floor');
  assert.equal(blocked(zone, [prop({ y0: 20 })]), true, 'a zone that names no floor must count props on every floor');

  // The flights js/map/elevation.js encloses, and the catwalk flight validate-movement-feel walks.
  for (const flight of [
    { xLow: -13.175, xHigh: -8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true },
    { xLow: 13.175, xHigh: 8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true },
    { xLow: -12.6, xHigh: -8.4, zMin: -53.3, zMax: -50.7, yTop: 3.1, steps: 9 },
  ]) {
    const pieces = stairFlightColliders(flight);
    assert.equal(pieces.length, flight.steps * 2 + (flight.closeHighEnd ? 1 : 0),
      'a flight is two stringer segments per step, plus a wall at the top when its high end is closed');
    assert.ok(pieces.every((c) => c.prop && c.keepClearExempt && c.bulletPass && c.oneWayPlatformSide),
      'every piece of a flight must be an exempt, shoot-through, one-way prop');
    for (const z of MAP_TRAVERSAL_ZONES) {
      assert.equal(auditKeepClearZone(z, pieces).ok, true, `a flight's own structure must not block ${z.id}`);
    }
  }

  const control = (o) => ({ id: 'switch', pos: { x: 0, y: 1.2, z: 0 }, radius: 2.2, ...o });
  const approach = (items, o = {}) => auditInteractableApproaches({ interactables: items, roomAt: () => 'room', floorY: () => 0, ...o });
  const enclosure = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  assert.deepEqual(approach([control(), control({ id: undefined }), null, control({ radius: NaN })]), {
    ok: false,
    issues: [
      '(unknown) has incomplete interaction geometry',
      '(unknown) has incomplete interaction geometry',
      'switch has incomplete interaction geometry',
    ],
    checked: 4,
  }, 'an interactable without an id, a position or a finite radius must be reported, and a sound one pass');
  const noApproach = { ok: false, issues: ['switch has no clear player approach inside its use radius'], checked: 1 };
  assert.deepEqual(approach([control()], { roomAt: () => null }), noApproach, 'a standing point outside every room must not count');
  assert.deepEqual(approach([control()], { floorY: () => 5 }), noApproach, 'a standing point on another floor must not count');
  assert.deepEqual(approach([control()], { colliders: [enclosure] }), noApproach, 'a collider over every standing point must fail it');
  for (const [what, o] of [
    ['a bullet-only collider', { shootOk: true }],
    ['a collider rays ignore', { noRaycast: true }],
    ['a collider above head height', { y0: 2, h: 1 }],
    ['a collider below the floor', { y0: -2, h: 1 }],
  ]) {
    assert.equal(approach([control()], { colliders: [{ ...enclosure, ...o }] }).ok, true, `${what} must not block the approach`);
  }
  assert.equal(auditInteractableApproaches({ interactables: [control()] }).ok, true,
    'with no room or floor lookup, every standing point on the control\'s floor counts');
}

// ---------------------------------------------------------------------------
// The structure audits reject each class of mistake, and default to the
// tables js/map-layout.js exports.
// ---------------------------------------------------------------------------
let rejected = 0;
{
  assert.deepEqual(auditMapStructure(),
    auditMapStructure({ rooms: MAP_ROOMS, doors: MAP_DOOR_DEFS, walls: MAP_WALL_RUNS, wallbuys: MAP_WALLBUYS, perks: MAP_PERKS }),
    'auditMapStructure() must audit the exported tables');
  assert.deepEqual(auditMapEgress(), auditMapEgress({ rooms: MAP_ROOMS, doors: MAP_DOOR_DEFS, navLinks: MAP_NAV_LINKS, ramps: MAP_RAMPS }),
    'auditMapEgress() must audit the exported tables');

  const byId = (list, id) => list.find((item) => item.id === id);
  const buy = (t, weapon) => t.wallbuys.find((b) => b.weapon === weapon);
  const structure = [
    [(t) => t.walls.push({ ...byId(t.walls, 'mainframe_west') }), 'wall id mainframe_west must be unique'],
    [(t) => t.walls.push({ id: 'diagonal', x1: 0, z1: 0, x2: 2, z2: 2, h: 3, gaps: [] }), 'wall diagonal must be a positive axis-aligned run'],
    [(t) => byId(t.walls, 'left_inner').gaps.push({ at: 21.5, w: 1.9, kind: 'passage' }), 'gap on left_inner extends beyond its wall'],
    [(t) => byId(t.walls, 'mainframe_north').gaps.push({ at: 6.5, w: 1.9, kind: 'passage' }), 'gaps overlap on mainframe_north'],
    [(t) => { byId(t.walls, 'animal_south').gaps[0].room = 'lab'; }, 'window on animal_south references unknown room lab'],
    [(t) => { byId(t.walls, 'mainframe_north').y0 = 2.9; }, 'window on mainframe_north is elevated; zombie barrier logic is ground-level only'],
    [(t) => { byId(t.walls, 'mainframe_south').gaps[0].doorId = 'd_nowhere'; }, 'door gap on mainframe_south references unknown d_nowhere'],
    [(t) => byId(t.walls, 'left_inner').gaps.push({ at: 5, w: 1, kind: 'hatch' }), 'gap on left_inner has unsupported kind hatch'],
    [(t) => { byId(t.doors, 'd_gen').vert = false; }, 'door d_gen orientation does not match animal_west'],
    [(t) => { byId(t.doors, 'd_chem').y = 0; }, 'door d_chem elevation does not match chem_north_upper'],
    [(t) => { byId(t.doors, 'd_fact').w = 2.6; }, 'door d_fact width does not match factory_north'],
    [(t) => { byId(t.doors, 'd_mainL').cost = -1; }, 'door d_mainL must have a direct finite interaction cost'],
    [(t) => { buy(t, 'thompson').wallId = 'auto_far'; }, 'wallbuy thompson references unknown wall auto_far'],
    [(t) => { buy(t, 'kar98').x = -8; }, 'wallbuy kar98 is not mounted on mainframe_west'],
    [(t) => { buy(t, 'type100').y = 0; }, 'wallbuy type100 elevation does not match chem_south_upper'],
  ];
  for (const [edit, issue] of structure) {
    const tables = structuredClone({ rooms: MAP_ROOMS, doors: MAP_DOOR_DEFS, walls: MAP_WALL_RUNS, wallbuys: MAP_WALLBUYS, perks: MAP_PERKS });
    edit(tables);
    const audit = auditMapStructure(tables);
    assert.ok(!audit.ok && audit.issues.includes(issue), `auditMapStructure() must report "${issue}", got: ${audit.issues.join('; ')}`);
  }

  const vault = { id: 'vault', name: 'Vault', rect: { minX: 50, maxX: 52, minZ: 50, maxZ: 52 } };
  const egress = [
    [(t) => { byId(t.doors, 'd_gen').rooms = ['animallab']; }, ['door d_gen must join exactly two rooms']],
    [(t) => { byId(t.doors, 'd_gen').rooms = ['animallab', 'boilerroom']; }, ['route d_gen references an unknown room']],
    [(t) => { t.ramps = t.ramps.filter((r) => r.id !== 'catwalkStairs'); }, ['stair factory->catwalk has no matching physical ramp']],
    [(t) => { t.navLinks = t.navLinks.filter((l) => !(l.from === 'factory' && l.to === 'catwalk')); },
      ['stair catwalkStairs is missing factory->catwalk', 'catwalk has no entrance']],
    [(t) => t.rooms.push(vault), ['vault has no exit', 'vault has no entrance', 'vault cannot return to mainframe']],
    [(t) => { byId(t.rooms, 'factory').minExits = 3; }, ['factory needs 3 independent exits; found 2']],
  ];
  for (const [edit, issues] of egress) {
    const tables = structuredClone({ rooms: MAP_ROOMS, doors: MAP_DOOR_DEFS, navLinks: MAP_NAV_LINKS, ramps: MAP_RAMPS });
    edit(tables);
    const audit = auditMapEgress(tables);
    for (const issue of issues) {
      assert.ok(!audit.ok && audit.issues.includes(issue), `auditMapEgress() must report "${issue}", got: ${audit.issues.join('; ')}`);
    }
  }
  const twoExits = structuredClone({ rooms: MAP_ROOMS });
  byId(twoExits.rooms, 'factory').minExits = 2;
  assert.equal(auditMapEgress(twoExits).ok, true, 'the factory\'s door and its catwalk stair are two independent exits');
  rejected = structure.length + egress.length;
}

// ---------------------------------------------------------------------------
// cappedWallRuns(), papEnergyEnvelope() and elevationAwareRiseCandidate() on
// shapes of their own.
// ---------------------------------------------------------------------------
{
  const run = (id, o) => ({ id, x1: 0, z1: 0, x2: 8, z2: 0, h: 3, gaps: [], ...o });
  assert.deepEqual([...cappedWallRuns([run('ground'), run('upper', { y0: 3 })])], ['ground'],
    'a run another run stands on must be capped, and the run on top must not');
  assert.deepEqual([...cappedWallRuns([run('ground', { x2: 0, z2: 8 }), run('upper', { x2: 0, z2: 8, y0: 3 })])], ['ground'],
    'a run along Z is capped the same way');
  assert.deepEqual([...cappedWallRuns([run('ground'), run('upper', { y0: 3.2 })])], [],
    'a run hanging clear above another does not cap it');
  assert.deepEqual([...cappedWallRuns([run('ground'), run('upper', { x1: 8, x2: 16, y0: 3 })])], [],
    'a run that only meets another end to end shares no top with it');

  const wideBolts = papEnergyEnvelope({
    ...PAP_ENERGY_VISUAL, ringRadii: [0.05, 0.1], ringTube: 0.01, boltHalfWidth: 0.3, boltDepth: 0.12,
    centerY: 2, centerZ: 0.5, coreOffsetZ: 0.4, coreRadius: 0.1,
  });
  assert.ok(near(wideBolts.minX, -0.3) && near(wideBolts.maxX, 0.3), 'bolts wider than the rings must set the width');
  assert.ok(near(wideBolts.minY, 1.89) && near(wideBolts.maxY, 2.11), 'the outer ring and its tube must set the height, about centerY');
  assert.ok(near(wideBolts.maxZ, 1), 'a core reaching past the rings and bolts must set the front');
  const wideRings = papEnergyEnvelope({
    ...PAP_ENERGY_VISUAL, ringRadii: [0.4], ringTube: 0.02, boltHalfWidth: 0.1, boltDepth: 0.5,
    centerZ: 0, coreOffsetZ: 0, coreRadius: 0.05,
  });
  assert.ok(near(wideRings.maxX, 0.42) && near(wideRings.maxZ, 0.54), 'wider rings must set the width, and deeper bolts the front');

  const room = () => 'hall';
  const flat = () => 0;
  const target = { x: 0, y: 0, z: 0 };
  const candidates = [{ x: 1, z: 1 }];
  assert.equal(elevationAwareRiseCandidate({ candidates, roomAt: room, floorY: flat }), null, 'no target means no rise');
  assert.equal(elevationAwareRiseCandidate({ target, candidates, floorY: flat }), null, 'without a room lookup there is no rise');
  assert.equal(elevationAwareRiseCandidate({ target, candidates, roomAt: room }), null, 'without a floor lookup there is no rise');
  assert.equal(elevationAwareRiseCandidate({ target, candidates, roomAt: () => null, floorY: flat }), null,
    'a target outside every room gets no rise');
  assert.deepEqual(elevationAwareRiseCandidate({
    target: { x: 0, y: '2.9', z: 0 }, candidates: [null, { x: NaN, z: 0 }, { x: 1, z: 2 }], roomAt: room, floorY: (x, z, y) => y,
  }), { x: 1, z: 2, y: 2.9, room: 'hall' }, 'unusable candidates must be skipped, and the target\'s height read as a number');
}

console.log('Map layout OK: room depths ring every room by its shortest route to a player, open doors both ways and drops '
  + `one way, and match the rooms that can reach them; ${MAP_WALKWAYS.length} walkways and ${MAP_TRAVERSAL_ZONES.length} `
  + 'traversal zones follow the ramps, doors and decks they guard; the clearance audits count only props in reach on the '
  + `zone's floor, never a flight's own structure; the structure audits reject ${rejected} kinds of mistake and default to `
  + 'the exported tables; capped runs, the Pack-a-Punch envelope and the rise candidate hold on shapes of their own.');
