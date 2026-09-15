// Where the dressing goes: the headroom tests, the room-by-room table, the
// wall-hugging placer and its level-aware tests, the room loop, and the three
// hand-placed hero set pieces. decorateMap() in js/map-props.js calls
// placeDressing once per build, after it makes the prop builders, passing the
// names in its parameter list.
import { MAP_WALKWAYS, MAP_TRAVERSAL_ZONES } from '../map-layout.js';

export function placeDressing({
  R, RI, rnd, place, G, isClear, againstWall, propFree, solid,
  crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
  wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
}) {
  // -------------------------------------------------------------------------
  // overhead clearance
  // -------------------------------------------------------------------------
  // Ground props are kept off interactables by `isClear`. Overhead dressing had
  // no equivalent test at all: it is positioned from the room rect at a height
  // fixed per room, so a duct, chain or cable happily materialised in mid-air
  // over a staircase, a doorway or the catwalk. See MAP_WALKWAYS for the case
  // that prompted this. Nothing decorative may occupy a walkway's headroom.

  /** The walkway a point intrudes on, or null. */
  function inWalkway(x, z, y, pad = 0.35) {
    for (const w of MAP_WALKWAYS) {
      // Below the surface is fine — that is the soffit of the deck, not its
      // headroom — as is anything above the volume a player's head sweeps.
      if (y <= w.floorY + 0.02 || y >= w.clearTop) continue;
      if (x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad) return w;
    }
    return null;
  }

  /** True when a straight run at height `y` touches no walkway along its length. */
  function runClear(ax, az, bx, bz, y, pad = 0.35) {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (inWalkway(ax + (bx - ax) * t, az + (bz - az) * t, y, pad)) return false;
    }
    return true;
  }

  /**
   * Slide a hall-spanning run along z until `test` passes, starting from where
   * it wanted to be and stepping outward. Returns null when the hall offers no
   * clear line at that height, in which case the caller drops the run — an
   * empty ceiling reads as unfinished, but a duct through a staircase is worse.
   */
  function slideZ(want, lo, hi, test) {
    if (test(want)) return want;
    for (let s = 0.25; s <= hi - lo; s += 0.25) {
      if (want + s <= hi && test(want + s)) return want + s;
      if (want - s >= lo && test(want - s)) return want - s;
    }
    return null;
  }

  /**
   * The lowest elevated deck directly over a ground-level point, if any.
   *
   * Both corridor rooms run under a balcony for half their length, so their
   * single room-wide "ceiling height" is wrong for that half: a wall lamp at
   * 3.1m sat 20cm ABOVE the balcony floor it was supposed to hang below. Lamps
   * tuck under whatever is actually overhead instead of being deleted, so the
   * space under the balcony stays lit.
   */
  function deckAbove(x, z, y) {
    let best = null;
    for (const w of MAP_WALKWAYS) {
      if (w.floorY <= y + 0.1) continue;
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (best === null || w.floorY < best) best = w.floorY;
    }
    return best;
  }

  // =========================================================================
  // placement
  // =========================================================================
  // Rooms are laid out as axis-aligned rects; each entry describes how densely
  // to dress the walls and floor of that space and what it is used for.
  const ROOM_DRESSING = [
    { id: 'mainframe', rect: [-10, 10, 14, 26], y: 0, outdoor: true, crates: 3, drums: 3, rubble: 2, lamps: 0, bags: 2 },
    { id: 'leftcorridor', rect: [-14, -6, -22, 14], y: 0, ceilingY: 4.375, crates: 5, drums: 4, rubble: 3, lamps: 4, pipes: true, ducts: true },
    { id: 'garageentrance', rect: [6, 14, -22, 14], y: 0, ceilingY: 4.375, crates: 5, drums: 4, rubble: 3, lamps: 4, pipes: true, ducts: true },
    { id: 'animallab', rect: [-32, -14, -20, -6], y: 0, ceilingY: 4.375, crates: 4, drums: 3, rubble: 2, fluoro: 4, benches: 2, machines: 1, pipes: true },
    { id: 'genroom', rect: [-44, -32, -20, -6], y: 0, ceilingY: 4.375, crates: 3, drums: 5, rubble: 2, lamps: 2, machines: 2, pipes: true, cables: true },
    { id: 'autogarage', rect: [14, 32, -20, -6], y: 0, ceilingY: 4.375, crates: 5, drums: 5, rubble: 3, lamps: 3, benches: 2, spools: 2, pipes: true },
    { id: 'courtyard', rect: [-16, 10, -42, -22], y: 0, outdoor: true, crates: 6, drums: 6, rubble: 5, bags: 3, lamps: 3, spools: 1 },
    { id: 'factory', rect: [-14, 14, -62, -42], y: 0, ceilingY: 6.875, crates: 8, drums: 7, rubble: 4, lamps: 4, machines: 3, benches: 2, beams: true, pipes: true, ducts: true, cables: true, spools: 2 },
    { id: 'chemtesting', rect: [10, 24, -38, -22], y: 2.9, ceilingY: 5.875, fluoro: 3, drums: 4, crates: 2, machines: 1, benches: 1 },
  ];

  // Underside of each room's ceiling slab (see the `ceil()` calls in map.js).
  // Overhead dressing is clamped below it: Chemical Testing's fluorescents were
  // computed as roomY + 3.25 = 6.15, which put all three inside a ceiling whose
  // underside is at 5.875, so the room's only fixtures were buried in concrete.
  const ceilLimit = (room, want, gap) =>
    (room.ceilingY === undefined ? want : Math.min(want, room.ceilingY - gap));

  // Keep dressing out of the middle of rooms so nothing blocks a fighting lane
  // or a spawn approach: props hug the walls with a margin from each corner.
  // `clearance` is the prop's own footprint radius. It used to default to 0 AND
  // to gate the keep-clear test itself, so every caller that did not pass one
  // skipped the test completely — which is how a rusted plate ended up standing
  // on Teleporter A's pad and a slab ended up at eye height in front of the
  // power switch. The test now always runs, with a floor under the radius.
  // Set per room before its dressing runs, so the helpers below know which
  // level they are placing on without threading it through every call site.
  let roomY = 0;

  /**
   * Is a footprint clear of every walkway ON THIS LEVEL?
   *
   * `isClear` covers interactables and doorways, but nothing described the
   * staircases, so a crate or rubble pile could be dropped straight onto the
   * lab flight: `alongWalls` runs the corridor's west edge at x = -13.15 and
   * the stairwell sits at x -13.2..-8.8, so any candidate whose z landed in the
   * flight passed both tests and spawned on the steps. Decks belonging to other
   * levels are skipped — a crate parked UNDER the balcony is fine.
   */
  function walkwayFree(x, z, radius) {
    for (const w of MAP_WALKWAYS) {
      if (w.floorY > roomY + 0.1) continue;
      if (x > w.minX - radius && x < w.maxX + radius && z > w.minZ - radius && z < w.maxZ + radius) return false;
    }
    return true;
  }

  /**
   * Is a footprint clear of every route that must stay walkable end to end?
   *
   * `walkwayFree` covers the surfaces a player stands on; this covers getting
   * ONTO them — the apron at the foot and head of each flight — and the wall
   * openings that are routes but carry no door record, which `isClear` only
   * knows about through MAP_DOOR_DEFS. Both gaps had the same symptom: a solid
   * prop against a real wall, passing every existing test, parked in the single
   * lane to the stairs or squarely in the courtyard exit.
   */
  function zoneFree(x, z, radius) {
    for (const zone of MAP_TRAVERSAL_ZONES) {
      if (zone.floorY > roomY + 0.1 || zone.floorY < roomY - 0.1) continue;
      if (x > zone.minX - radius && x < zone.maxX + radius
        && z > zone.minZ - radius && z < zone.maxZ + radius) return false;
    }
    return true;
  }

  function alongWalls(rect, count, fn, inset = 0.85, clearance = 0.8) {
    const [x0, x1, z0, z1] = rect;
    for (let i = 0; i < count; i++) {
      // A few attempts per prop: if every candidate lands on something that
      // must stay reachable, drop the prop rather than block the level.
      for (let attempt = 0; attempt < 8; attempt++) {
        const side = RI(0, 3);
        let x, z, ry;
        if (side === 0) { x = R(x0 + 1.6, x1 - 1.6); z = z0 + inset; ry = 0; }
        else if (side === 1) { x = R(x0 + 1.6, x1 - 1.6); z = z1 - inset; ry = Math.PI; }
        else if (side === 2) { x = x0 + inset; z = R(z0 + 1.6, z1 - 1.6); ry = Math.PI / 2; }
        else { x = x1 - inset; z = R(z0 + 1.6, z1 - 1.6); ry = -Math.PI / 2; }
        if (!isClear(x, z, Math.max(0.8, clearance))) continue;
        if (!walkwayFree(x, z, Math.max(0.5, clearance * 0.6))) continue;
        if (!zoneFree(x, z, Math.max(0.5, clearance * 0.6))) continue;
        if (!againstWall(x, z)) continue;
        if (!propFree(x, z, roomY)) continue;
        // A builder may reject the spot itself (see `pallet`); treat that like
        // any other failed clearance test and try another candidate, so the
        // room keeps its authored prop count.
        if (fn(x, z, ry, i) === false) continue;
        break;
      }
    }
  }

  for (const room of ROOM_DRESSING) {
    const [x0, x1, z0, z1] = room.rect;
    const y = room.y;
    roomY = y;
    const w = x1 - x0, d = z1 - z0;

    // ---- crates, sometimes stacked two high ----
    alongWalls(room.rect, room.crates || 0, (x, z, ry) => {
      const s = R(0.62, 0.95);
      crate(x, y, z, s, R(-0.4, 0.4));
      let top = s;
      if (rnd() < 0.42) { const s2 = s * R(0.72, 0.92); crate(x + R(-0.14, 0.14), y + s * R(0.85, 1.05), z + R(-0.14, 0.14), s2, R(-0.6, 0.6)); top = s + s2; }
      solid(x, z, s * 0.62, s * 0.62, top, y);
    }, 0.85, 1.1);

    // ---- drums ----
    alongWalls(room.rect, room.drums || 0, (x, z, ry) => {
      const tipped = rnd() < 0.22;
      drum(x, y, z, R(Math.PI * 2), tipped);
      solid(x, z, 0.31, 0.31, tipped ? 0.6 : 0.9, y);
      if (!tipped && rnd() < 0.35) {
        // Stand the neighbour off the HOOPS, which are the widest part of a
        // drum, not off the barrel. At the old 0.50-0.66m the two barrels
        // interpenetrated and both pairs of rolling hoops landed in the same
        // two horizontal planes, so every paired drum in the map fought.
        const gap = R(DRUM_HOOP_R * 2 + 0.02, DRUM_HOOP_R * 2 + 0.2);
        const ang = R(-0.32, 0.32);
        const ox = x + Math.cos(ang) * gap, oz = z + Math.sin(ang) * gap;
        // Standing clear of its OWN primary is not enough — the offset can put
        // it on top of a drum some earlier iteration already placed.
        if (propFree(ox, oz, y)) {
          drum(ox, y, oz, R(Math.PI * 2), false);
          solid(ox, oz, 0.31, 0.31, 0.9, y);
        }
      }
    }, 0.85, 1.2);

    // ---- rubble ----
    alongWalls(room.rect, room.rubble || 0, (x, z) => rubble(x, y, z, R(0.5, 0.85), RI(6, 12)), 1.6, 0.9);

    // ---- sandbags ----
    alongWalls(room.rect, room.bags || 0, (x, z, ry) => {
      const len = R(1.6, 2.8), rows = RI(2, 4);
      sandbags(x, y, z, len, ry + Math.PI / 2, rows);
      const along = Math.abs(Math.cos(ry + Math.PI / 2));
      solid(x, z, along > 0.5 ? len / 2 : 0.28, along > 0.5 ? 0.28 : len / 2, 0.12 + rows * 0.19, y);
    }, 1.1, 1.5);

    // ---- pallets + spools ----
    alongWalls(room.rect, room.spools || 0, (x, z, ry) => {
      spool(x, y, z, ry);
      solid(x, z, 0.48, 0.3, 0.95, y);
      if (rnd() < 0.5) pallet(x + R(-1, 1), y, z + R(-0.6, 0.6), R(Math.PI));
    }, 0.85, 1.3);
    alongWalls(room.rect, Math.round((room.crates || 0) * 0.4), (x, z, ry) => pallet(x, y, z, ry + R(-0.3, 0.3)), 0.85, 1.0);

    // ---- workbenches ----
    alongWalls(room.rect, room.benches || 0, (x, z, ry) => {
      const len = R(1.5, 2.2);
      workbench(x, y, z, ry, len);
      const along = Math.abs(Math.cos(ry));
      solid(x, z, along > 0.5 ? len / 2 : 0.34, along > 0.5 ? 0.34 : len / 2, 0.95, y);
    }, 0.95, 1.4);

    // ---- machines: pulled off the wall a little so they read in the round ----
    alongWalls(room.rect, room.machines || 0, (x, z, ry) => {
      const w = R(1.3, 1.9), h = R(1.2, 1.7), d = R(0.9, 1.2);
      machine(x, y, z, ry, w, h, d);
      const along = Math.abs(Math.cos(ry));
      solid(x, z, along > 0.5 ? w / 2 : d / 2, along > 0.5 ? d / 2 : w / 2, h + 0.2, y);
    }, 1.35, 1.7);

    // ---- wall lamps ----
    const lampY = ceilLimit(room, y + (room.id === 'factory' ? 4.6 : 3.1), 0.35);
    alongWalls(room.rect, room.lamps || 0, (x, z, ry) => {
      // Tuck under a balcony rather than hovering above its floor.
      const deck = deckAbove(x, z, y);
      const ly = deck === null ? lampY : Math.min(lampY, deck - 0.55);
      if (inWalkway(x, z, ly, 0.2)) return;
      wallLamp(x, ly, z, ry, 0xffb765, {
        distance: room.id === 'factory' ? 17 : 13,
        on: room.id === 'factory' ? 66 : 44,
        off: room.outdoor ? 0 : 26,
      });
    }, 0.35);

    // ---- fluorescents ----
    const fluoY = ceilLimit(room, y + 3.25, 0.25);
    alongWalls(room.rect, room.fluoro || 0, (x, z, ry) => {
      if (inWalkway(x, z, fluoY, 0.2)) return;
      fluorescent(x, fluoY, z, ry + Math.PI / 2, R(1.2, 1.9));
    }, 1.6);

    // ---- emergency lights: one per interior room, near a corner ----
    if (!room.outdoor) emergencyLight(x0 + 0.32, y + 2.65, z0 + R(2, d - 2), Math.PI / 2);

    // ---- wall pipe runs at head height ----
    if (room.pipes) {
      // Both corridor rooms run under a balcony for half their length. A pipe at
      // 2.75 was threaded straight through that slab (2.65-2.90) — a third of
      // each run vanished into the floor above. Drop the run under the soffit
      // when the room has one; elsewhere head height is unchanged.
      let py = y + 2.75;
      const deck = deckAbove((x0 + x1) / 2, (z0 + z1) / 2, y) ?? deckAbove(x0 + 0.42, z0 + 1.2, y);
      if (deck !== null) py = Math.min(py, deck - 0.125 - 0.24);
      pipeRun(x0 + 0.42, py, z0 + 1.2, x0 + 0.42, z1 - 1.2, R(0.055, 0.09));
      pipeRun(x1 - 0.42, py - 0.22, z0 + 1.6, x1 - 0.42, z1 - 1.6, R(0.04, 0.07));
      if (w > 12) pipeRun(x0 + 1.4, py + 0.25, z0 + 0.42, x1 - 1.4, z0 + 0.42, R(0.05, 0.08));
    }

    // ---- ceiling ducts ----
    if (room.ducts) {
      const dy = ceilLimit(room, y + (room.id === 'factory' ? 5.9 : 3.55), 0.45);
      const dx = (x0 + x1) / 2 + R(-1, 1), len = Math.min(d * 0.42, 10), sec = R(0.4, 0.6);
      // This run is what used to cross both balcony stairwells. Slide it along
      // the hall until its whole length is clear rather than trusting z0+0.4d.
      const dz = slideZ(z0 + d * 0.4, z0 + len / 2, z1 - len / 2,
        (cz) => runClear(dx, cz - len / 2, dx, cz + len / 2, dy));
      if (dz !== null) duct(dx, dy, dz, len, Math.PI / 2, sec);
    }

    // ---- structural beams ----
    if (room.beams) {
      for (let i = 0; i < 4; i++) {
        const bz = z0 + ((i + 0.5) / 4) * d;
        ibeam((x0 + x1) / 2, y + 6.35, bz, w * 0.80, 0, 0.3, 0.4);
      }
    }

    // ---- hanging cables + chains ----
    if (room.cables) {
      const cy = ceilLimit(room, y + 3.3, 0.3);
      for (let i = 0; i < 3; i++) {
        const sag = R(0.4, 0.9);
        // The factory's middle run landed on the catwalk's centre line and read
        // as a pole through the top of its staircase; every hall is checked now.
        const cz = slideZ(z0 + ((i + 0.5) / 3) * d, z0 + 1.5, z1 - 1.5,
          (z) => runClear(x0 + 1.6, z, x1 - 1.6, z, cy - sag));
        if (cz !== null) cable(x0 + 1.6, cy, cz, x1 - 1.6, cy - 0.05, cz, sag, 10, 0.018);
      }
    }
    if (!room.outdoor) {
      const chy = ceilLimit(room, y + (room.id === 'factory' ? 6.1 : 3.5), 0.3);
      for (let i = 0; i < 2; i++) {
        // A chain hangs, so both its anchor and its free end have to be clear.
        for (let attempt = 0; attempt < 8; attempt++) {
          const cx = R(x0 + 2, x1 - 2), cz = R(z0 + 2, z1 - 2), len = R(0.7, 1.8);
          if (inWalkway(cx, cz, chy) || inWalkway(cx, cz, chy - len)) continue;
          chain(cx, chy, cz, len);
          break;
        }
      }
    }

    // ---- floor drains + oil stains ----
    if (!room.outdoor && rnd() < 0.8) {
      const dnx = R(x0 + 2.5, x1 - 2.5), dnz = R(z0 + 2.5, z1 - 2.5);
      // A floor grate is flat, but it still cannot be let onto a stair tread.
      if (walkwayFree(dnx, dnz, 0.4)) drain(dnx, y, dnz);
    }
  }

  // ---- courtyard hero dressing: a wrecked truck chassis and a barricade ----
  {
    const cx = -11.5, cz = -37, cy = 0;
    place('metal', G.box, cx, cy + 0.95, cz, 0, 0.38, 0, 2.1, 0.7, 4.4);       // bed
    place('metal', G.box, cx + 0.55, cy + 1.5, cz - 1.6, 0, 0.38, 0, 1.9, 1.3, 1.5); // cab
    place('dark', G.box, cx + 0.55, cy + 1.75, cz - 2.28, 0, 0.38, 0, 1.5, 0.7, 0.08); // windscreen frame
    for (const [ox, oz] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.4], [0.85, -1.4]]) {
      place('rubber', G.cyl12,
        cx + ox * Math.cos(0.38) - oz * Math.sin(0.38), cy + 0.42, cz + ox * Math.sin(0.38) + oz * Math.cos(0.38),
        0, 0.38, Math.PI / 2, 0.84, 0.32, 0.84);
    }
    rubble(cx + 2.4, cy, cz + 1.2, 1.6, 16);
    sandbags(cx + 3.6, cy, cz - 2.2, 3.2, 0.38, 3);
    solid(cx, cz, 1.6, 2.6, 2.1, cy);              // truck body
    solid(cx + 3.6, cz - 2.2, 1.5, 0.3, 0.7, cy);  // barricade
  }

  // ---- factory hero dressing: overhead crane rail + gantry ----
  {
    const fy = 5.6;
    // The rail runs along the hall, clear of the catwalk deck (z -53.1..-50.9).
    ibeam(0, fy, -54, 15, Math.PI / 2, 0.36, 0.5);
    for (const bz of [-60.5, -47.5]) {
      place('plate', G.box, 0, fy - 1.6, bz, 0, 0, 0, 0.34, 3.2, 0.34);
    }
    // Crane trolley + hook block. This used to sit at z = -52 with the hook at
    // y = 2.25 — which is exactly the catwalk's deck height, so the hook block
    // hung in the middle of the walkway and players ran into it. It now hangs
    // over open floor well north of the catwalk, and the hook stops at 3.4m so
    // it cannot reach head height on any walkable surface.
    place('plate', G.box, 0, fy - 0.55, -58.5, 0, 0, 0, 1.1, 0.7, 1.5);
    chain(0, fy - 0.9, -58.5, 1.4);
    place('metal', G.box, 0, fy - 2.5, -58.5, 0, 0.3, 0, 0.34, 0.5, 0.34);
  }

  // ---- generator room hero: the generator itself, humming ----
  {
    // This used to be hard-coded at (-38, -13) — which is Teleporter A's pad,
    // so the generator was built straight through the teleporter and its
    // controls. Hero props are positioned by hand and therefore skip the
    // wall-hugging placer, which means they also skip its keep-clear test: the
    // one check that would have caught it.
    //
    // So pick from candidate anchors along the room's walls and take the first
    // that is actually clear. A hero prop is scenery — if the room genuinely
    // has no room for it, dropping it is strictly better than building it
    // through something the player needs to use.
    const anchor = [
      [-42.4, -18.4], [-42.4, -8.2], [-34.6, -18.4], [-42.4, -13.0], [-38.0, -18.6],
    ].find(([cx, cz]) => isClear(cx, cz, 1.8));
    if (anchor) {
      const [gx, gz] = anchor;
      machine(gx, 0, gz, Math.PI / 2, 2.6, 1.9, 1.5);
      solid(gx, gz, 0.85, 1.45, 2.1, 0);
      pipeRun(gx + 1.4, 1.4, gz - 2.4, gx + 1.4, gz + 2.4, 0.11);
    }
    const gx = anchor ? anchor[0] : -38, gz = anchor ? anchor[1] : -13;
    for (let i = 0; i < 3; i++) {
      const dx2 = gx + R(-2.6, 2.6), dz2 = gz + R(-3, 3);
      if (!isClear(dx2, dz2, 1.2)) continue;
      // These three are scattered freehand rather than through `alongWalls`, so
      // they need the same test: two drums in one spot put both pairs of
      // rolling hoops in the same two planes.
      if (!propFree(dx2, dz2, 0)) continue;
      drum(dx2, 0, dz2, R(Math.PI * 2), false);
      solid(dx2, dz2, 0.31, 0.31, 0.9, 0);
    }
  }
}
