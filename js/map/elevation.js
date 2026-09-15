// The map's raised floors: the floor zones and ramps floorY() walks, the balcony,
// chem and bridge decks, the spawn platform, and the two balcony stair flights.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { MAP_RAMPS, MAINFRAME_PLATFORM, MAINFRAME_STEPS, FACTORY_CATWALK, stairFlightColliders } from '../map-layout.js';

export function buildElevation({ group, colliders, solidGeos, pushBox, matMetal }) {
  // ---------- elevation: floor zones + ramps ----------
  const floorZones = [
    MAINFRAME_PLATFORM,                                         // mainframe platform (clear of both 750 doors at x=±8)
    ...MAINFRAME_STEPS,                                         // individually walkable/jumpable spawn steps
    { minX: -14, maxX: -6, minZ: -22, maxZ: -8, y: 2.9, holes: [{ minX: -13.2, maxX: -8.8, minZ: -13.2, maxZ: -10.8 }] },      // lab balcony (stairwell hole)
    { minX: 6, maxX: 14, minZ: -22, maxZ: -8, y: 2.9, holes: [{ minX: 8.8, maxX: 13.2, minZ: -13.2, maxZ: -10.8 }] },        // garage balcony (stairwell hole)
    { minX: 10, maxX: 24, minZ: -38, maxZ: -22, y: 2.9 },      // chem testing
    { minX: -6, maxX: 6, minZ: -13, maxZ: -11, y: 2.9 },       // bridge
    FACTORY_CATWALK,                                            // factory catwalk begins at the stair landing
  ];
  const ramps = MAP_RAMPS;
  function floorY(x, z, curY = 0, tol = 1.6) {
    let y = 0;
    for (const r of ramps) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const tt = r.axis === 'x' ? (r.dir > 0 ? (x - r.minX) / (r.maxX - r.minX) : (r.maxX - x) / (r.maxX - r.minX))
                                : (r.dir > 0 ? (z - r.minZ) / (r.maxZ - r.minZ) : (r.maxZ - z) / (r.maxZ - r.minZ));
      const ry = r.y0 + (r.y1 - r.y0) * Math.min(1, Math.max(0, tt));
      if (ry > y && curY >= ry - tol) y = ry;
    }
    for (const zn of floorZones) {
      if (x < zn.minX || x > zn.maxX || z < zn.minZ || z > zn.maxZ) continue;
      if (zn.holes) {
        let inHole = false;
        for (const h of zn.holes) if (x >= h.minX && x <= h.maxX && z >= h.minZ && z <= h.maxZ) { inHole = true; break; }
        if (inHole) continue;
      }
      if (zn.y > y && curY >= zn.y - tol) y = zn.y;
    }
    return y;
  }

  // ---------- elevated floors: balcony slabs (stairwell holes), chem, bridge ----
  const slabHole = (x0, x1, z0, z1, hx0, hx1, hz0, hz1, y) => {
    pushBox(solidGeos.plate, (x0 + hx0) / 2, y, (z0 + z1) / 2, hx0 - x0, 0.25, z1 - z0);
    pushBox(solidGeos.plate, (hx1 + x1) / 2, y, (z0 + z1) / 2, x1 - hx1, 0.25, z1 - z0);
    pushBox(solidGeos.plate, (hx0 + hx1) / 2, y, (z0 + hz0) / 2, hx1 - hx0, 0.25, hz0 - z0);
    pushBox(solidGeos.plate, (hx0 + hx1) / 2, y, (hz1 + z1) / 2, hx1 - hx0, 0.25, z1 - hz1);
  };
  slabHole(-14, -6, -22, -8, -13.2, -8.8, -13.2, -10.8, 2.775);   // lab balcony
  slabHole(6, 14, -22, -8, 8.8, 13.2, -13.2, -10.8, 2.775);       // garage balcony
  pushBox(solidGeos.plate, 17, 2.775, -30, 14, 0.25, 16);          // chem testing floor
  pushBox(solidGeos.plate, 0, 2.775, -12, 12, 0.25, 2.2);          // bridge deck
  colliders.push({ minX: -6, maxX: 6, minZ: -13, maxZ: -11, y0: 2.65, h: 0.25, prop: true }); // bridge underside
  // The bridge is now a true upper connector. Continuous rails close the old
  // fall-through mouths into the purposeless underbridge pocket; players enter
  // through the two deliberate balcony doors at its east and west ends.
  {
    const railMat = matMetal.clone();
    for (const rz of [-12.95, -11.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.05), railMat);
      rail.position.set(0, 3.85, rz);
      const railMid = rail.clone(); railMid.position.y = 3.4;
      group.add(rail, railMid);
      colliders.push({
        minX: -6, maxX: 6,
        minZ: rz - 0.08, maxZ: rz + 0.08,
        y0: 2.9, h: 1.1, prop: true,
      });
      for (const x of [-5.8, -3.7, -1.25, 1.25, 3.7, 5.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), railMat);
        post.position.set(x, 3.4, rz);
        group.add(post);
      }
    }
  }
  // mainframe platform steps (visual) + the actual raised platform deck
  // (narrower than the wall span: the two 750 doorways at x=±8 stay at ground level)
  pushBox(solidGeos.concrete, 0, 0.45, 16.25, 12, 0.9, 4.5);    // the spawn platform (visible!)
  pushBox(solidGeos.concrete, 0, 0.3, 19.2, 12, 0.6, 1.1);
  pushBox(solidGeos.concrete, 0, 0.15, 20.4, 12, 0.3, 1.1);
  // Step nosings. Each riser faces south, away from the moon, so it renders at
  // roughly half the luminance of the treads either side of it (measured 31 vs
  // 65). Three of those, each spanning the full 12m and perfectly straight,
  // stack up into what reads as black bars painted across the screen rather
  // than as steps — this is the first thing every player sees at spawn.
  //
  // A nosing lip fixes it the way real architecture does: the lip's top face
  // is UPWARD, so it catches the sky and draws a bright line along each step
  // edge, breaking the dark band and giving the eye the cue that this is a
  // stair. Purely visual — the colliders and floorY ramp are untouched.
  //
  // The lip stands 4mm PROUD of the tread. Flush with it, its top face and the
  // concrete's top face were the same plane over 12m x 0.16m, and the depth
  // buffer picked a winner per pixel per frame — so the nosing meant to break
  // up the dark band drew its own hard line across all three steps instead. A
  // real nosing stands proud anyway.
  for (const [ny, nz] of [[0.9, 18.55], [0.6, 18.68], [0.3, 19.79]]) {
    pushBox(solidGeos.plate, 0, ny - 0.021, nz, 12, 0.05, 0.16);
  }
  // The platform sides are intentionally open. floorY() drops a player cleanly
  // to the surrounding courtyard when they run or jump over an edge. One-way
  // fascia colliders still stop a ground-level player walking through the slab.
  // Match each fascia collider to the actual deck/step height. Previously the
  // full stair run inherited the 0.9m deck wall, so only the top stair could
  // be jumped off. Each step now remains solid from ground level while its own
  // ledge can be deliberately jumped or vaulted in either direction.
  for (const [ex0, ez0, ex1, ez1, h, deckTop] of [
    // Tall player-only side volumes keep a lower-tier jump from clearing the
    // collision test at its apex; oneWayDeckTop still releases outward travel
    // for players who actually launched from the 0.9m deck.
    [-6.12, 14, -6, 18.5, 2.2, MAINFRAME_PLATFORM.y],
    [6, 14, 6.12, 18.5, 2.2, MAINFRAME_PLATFORM.y],
    [-6.12, 18.5, -6, 19.75, 0.65],
    [6, 18.5, 6.12, 19.75, 0.65],
  ]) colliders.push({
    minX: ex0, maxX: ex1, minZ: ez0, maxZ: ez1,
    y0: 0, h, playerOnly: true, oneWayPlatformSide: true,
    ...(Number.isFinite(deckTop) ? { oneWayDeckTop: deckTop } : {}),
  });
  // The lowest 0.3m step is deliberately a true step: it has no vertical side
  // collider, so players can run onto it from the front, sides, or diagonals.

  // Close in a stair flight that climbs along X. The geometry itself lives in
  // map-layout.js (Three-free) so scripts/validate-movement-feel.mjs can walk a
  // real player circle up a real flight instead of asserting on source text.
  const encloseStairFlight = (flight) => colliders.push(
    ...stairFlightColliders({ ...flight, playerRadius: CFG.PLAYER_RADIUS }),
  );

  // Balcony flight treads. The movement scaffolding around them is `bulletPass`
  // (see stairFlightColliders) precisely because it is invisible, so the treads
  // have to carry the flight's bullet collision themselves: without this a shot
  // would pass through the visible plates as well as the open air around them.
  // `shootOk` is the bullet-only tier — players, zombies and the navmesh all
  // ignore it, which is right, because the plates are drawn geometry the
  // scaffolding already handles physically.
  const stairTread = (cx, cy) => colliders.push({
    minX: cx - 0.275, maxX: cx + 0.275, minZ: -13.1, maxZ: -10.9,
    y0: cy - 0.18, h: 0.36, shootOk: true,
  });
  for (let i = 0; i < 8; i++) {
    pushBox(solidGeos.plate, -12.9 + i * 0.55, 0.18 + i * 0.35, -12, 0.55, 0.36, 2.2);
    stairTread(-12.9 + i * 0.55, 0.18 + i * 0.35);
  }
  for (let i = 0; i < 8; i++) {
    pushBox(solidGeos.plate, 12.9 - i * 0.55, 0.18 + i * 0.35, -12, 0.55, 0.36, 2.2);
    stairTread(12.9 - i * 0.55, 0.18 + i * 0.35);
  }
  // Both balcony flights sit in a hole in the slab and had no colliders at
  // all: you could walk in from either side or from under the landing and end
  // up inside the staircase. Their treads span x -13.175..-8.775 (mirrored for
  // the garage) and z -13.1..-10.9, climbing 2.9m in 8 steps.
  encloseStairFlight({ xLow: -13.175, xHigh: -8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true });
  encloseStairFlight({ xLow: 13.175, xHigh: 8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true });
  // balcony drop ledge trims (reads as an opening you can drop from)
  pushBox(solidGeos.plate, -10, 2.95, -22, 2.2, 0.1, 0.5);
  pushBox(solidGeos.plate, 8, 2.95, -22, 2.2, 0.1, 0.5);
  pushBox(solidGeos.plate, 10, 2.95, -30, 0.5, 0.1, 2.4); // Chemical Testing -> courtyard escape
  return { floorZones, ramps, floorY, encloseStairFlight };
}
