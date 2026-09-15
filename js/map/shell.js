// The map's shell: the wall runs and their window barriers, the rooms, the
// ceilings, and the ground and room floor slabs.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { rand, pointInBox } from '../utils.js';
import { MAP_ROOMS, MAP_WALL_RUNS, cappedWallRuns, auditMapStructure } from '../map-layout.js';

const WALL_T = 0.4;

export function buildShell({ group, colliders, barriers, solidGeos, pushBox, matWood, matDirt, matFloor }) {
  // ---------- wall builder (axis aligned) ----------
  // gap: {at (dist from start), w, kind:'door'|'window'}
  function wallRun(x1, z1, x2, z2, h, gaps = [], mat = 'wall', y0 = 0, capped = false) {
    const horiz = Math.abs(z2 - z1) < 0.001;
    const len = horiz ? x2 - x1 : z2 - z1;
    const sorted = [...gaps].sort((a, b) => a.at - b.at);
    let cur = 0;
    const segs = [];
    for (const gp of sorted) { segs.push([cur, gp.at - gp.w / 2, null]); segs.push([gp.at - gp.w / 2, gp.at + gp.w / 2, gp]); cur = gp.at + gp.w / 2; }
    segs.push([cur, len, null]);
    // An elevated run's brickwork starts SKIRT metres below its collider.
    //
    // Every stacked wall in the map has a ground run beneath it with the same
    // footprint, and a deck slab whose top is at the same height. Flush, that
    // put an upward-facing wall top and an upward-facing deck top in one plane
    // over as much as 16 metres — a strip of pure z-fight along the foot of the
    // wall, which is exactly the thin bright line players see where a wall
    // meets a floor. Dropping the visible box a few centimetres swallows both
    // of those faces inside solid geometry. Colliders and floorY still use the
    // authored y0, so nothing about movement changes.
    const skirt = y0 > 0 ? 0.06 : 0;
    // ...and a run with another run standing ON it sinks its own cap by the
    // same amount, so the joint disappears into the deck slab poured at that
    // height. Without this the cap, the deck and the upper run all shared one
    // upward-facing plane, and inside an elevated DOOR OPENING — where the
    // upper run is absent below the lintel — that plane was exposed right
    // across the threshold players walk over. See cappedWallRuns().
    const cap = capped ? 0.06 : 0;
    for (const [a, b, gp] of segs) {
      if (b - a < 0.01) continue;
      const mid = (a + b) / 2, w = b - a;
      const cx = horiz ? x1 + mid : x1;
      const cz = horiz ? z1 : z1 + mid;
      const bw = horiz ? w : WALL_T, bd = horiz ? WALL_T : w;
      if (!gp) {
        pushBox(solidGeos[mat], cx, y0 - skirt + (h + skirt - cap) / 2, cz, bw, h + skirt - cap, bd);
        colliders.push({ minX: cx - bw / 2, maxX: cx + bw / 2, minZ: cz - bd / 2, maxZ: cz + bd / 2, y0, h });
      } else if (gp.kind === 'window') {
        // sill + header
        pushBox(solidGeos[mat], cx, y0 - skirt + (0.9 + skirt) / 2, cz, bw, 0.9 + skirt, bd);
        colliders.push({ minX: cx - bw / 2, maxX: cx + bw / 2, minZ: cz - bd / 2, maxZ: cz + bd / 2, y0, h: 0.9, window: true });
        pushBox(solidGeos[mat], cx, y0 + 2.2 + (h - 2.2) / 2, cz, bw, h - 2.2, bd);
        colliders.push({ minX: cx - bw / 2, maxX: cx + bw / 2, minZ: cz - bd / 2, maxZ: cz + bd / 2, y0: y0 + 2.2, h: h - 2.2, shootOk: true });
        // The open aperture is for zombies and bullets, not players. Previously
        // a jump cleared the 0.9m sill, letting players phase through a visible
        // boarded window and escape the map shell.
        colliders.push({
          minX: cx - bw / 2, maxX: cx + bw / 2,
          minZ: cz - bd / 2, maxZ: cz + bd / 2,
          y0: y0 + 0.9, h: 1.3, playerOnly: true, noRaycast: true,
        });
        addBarrier(gp, cx, cz, horiz, y0);
      } else if (gp.kind === 'door' || gp.kind === 'passage') {
        // lintel above 3m
        if (h > 3) {
          pushBox(solidGeos[mat], cx, y0 + 3 + (h - 3) / 2, cz, bw, h - 3, bd);
          colliders.push({ minX: cx - bw / 2, maxX: cx + bw / 2, minZ: cz - bd / 2, maxZ: cz + bd / 2, y0: y0 + 3, h: h - 3, shootOk: true });
        }
      }
    }
  }

  // ---------- barriers ----------
  const boardGeoCache = new THREE.BoxGeometry(1.7, 0.16, 0.07);
  let barrierId = 0;
  function addBarrier(gp, cx, cz, horiz, y0 = 0) {
    // inward normal points into the room
    let inx = 0, inz = 0;
    if (horiz) inz = gp.in; else inx = gp.in;
    const b = {
      id: barrierId++, x: cx, z: cz, nx: inx, nz: inz,
      alcove: { x: cx - inx * 1.5, z: cz - inz * 1.5 },
      boards: 6, maxBoards: 6, room: gp.room,
      boardsMesh: new THREE.Group(), tearTimer: 0, occupant: null,
    };
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(boardGeoCache, matWood);
      const y = y0 + 1.0 + i * 0.22;
      m.position.set(cx + (horiz ? rand(-0.06, 0.06) : inx * 0.05), y, cz + (horiz ? inz * 0.05 : rand(-0.06, 0.06)));
      m.rotation.set(0, horiz ? rand(-0.14, 0.14) : Math.PI / 2 + rand(-0.14, 0.14), rand(-0.1, 0.1));
      b.boardsMesh.add(m);
    }
    updateBoardsVisual(b);
    group.add(b.boardsMesh);
    // alcove enclosure (brick shaft so it doesn't read as a black void)
    const ax = b.alcove.x, az = b.alcove.z;
    pushBox(solidGeos.concrete, ax, 0.05, az, 2.6, 0.1, 2.6);
    const wallD = 1.3;
    const sides = horiz
      ? [[ax - wallD, az, 0.12, 2.6], [ax + wallD, az, 0.12, 2.6], [ax, az - inz * wallD, 2.7, 0.12]]
      : [[ax, az - wallD, 2.6, 0.12], [ax, az + wallD, 2.6, 0.12], [ax - inx * wallD, az, 0.12, 2.7]];
    // These three panels are brickwork like any other, and until now they were
    // the only brickwork in the map with nothing behind it: no collider, so
    // players walked through them and bullets went through them.
    //
    // Sixteen of the seventeen alcoves hang off the OUTSIDE of the map shell
    // where nobody can reach them, which is why it went unnoticed. The two on
    // `animal_west` do not: that run separates two playable rooms, so its
    // windows face the Animal Lab and their alcoves stand 2.8m out into the
    // Generator Room, either side of Teleporter A's door — two free-standing
    // brick boxes you could run straight through.
    //
    // The pocket stays open on its window side only, which is the side the
    // occupant is meant to leave by. Zombies working a barrier already ignore
    // the `window` panel (see Zombies._colliders), and dedicated dog rounds
    // never claim a barrier at all, so nothing is sealed in here that was not
    // already committed to climbing out through the boards.
    for (const [sx, sz, sw, sd] of sides) {
      pushBox(solidGeos.brick, sx, 1.3, sz, sw, 2.6, sd);
      colliders.push({
        minX: sx - sw / 2, maxX: sx + sw / 2,
        minZ: sz - sd / 2, maxZ: sz + sd / 2,
        y0: 0, h: 2.6,
      });
    }
    barriers.push(b);
  }
  function updateBoardsVisual(b) {
    b.boardsMesh.children.forEach((m, i) => { m.visible = i < b.boards; });
  }

  // ---------- rooms (Waffenfabrik Der Riese — authentic floor plan) ----------
  const rooms = MAP_ROOMS;
  function roomAt(x, z, y = 0) {
    for (const r of rooms) {
      if (r.yMin !== undefined && y < r.yMin) continue;
      if (r.yMax !== undefined && y > r.yMax) continue;
      if (pointInBox(x, z, r.rect)) return r.id;
    }
    return null;
  }

  // ---------- walls ----------
  const H = 4.5, HH = 7;
  const structureAudit = auditMapStructure();
  if (!structureAudit.ok) throw new Error(`Map structure invariant failed: ${structureAudit.issues.join('; ')}`);
  // Ground-level shell below Chemical Testing is part of MAP_WALL_RUNS; keep
  // this named invariant because the former elevated-only shell exposed the
  // global dirt plane beside Double Tap.
  const cappedRuns = cappedWallRuns(MAP_WALL_RUNS);
  for (const wall of MAP_WALL_RUNS) {
    wallRun(wall.x1, wall.z1, wall.x2, wall.z2, wall.h, wall.gaps, wall.mat || 'wall', wall.y0 || 0, cappedRuns.has(wall.id));
  }

  // ---------- ceilings (indoor rooms; factory gets a broken skylight) ----------
  // Ceiling slabs ABUT; they must never overlap.
  //
  // Three pairs used to share 0.8m of footprint at the same height — the
  // animal lab against the generator room, the factory's north bay against its
  // west and east bays, and Chemical Testing against the garage balcony. An
  // overlap at equal y puts two soffits in one plane, and the soffit is the
  // face you are looking straight at from underneath. The animal-lab pair
  // alone was 11.8 square metres of pure z-fight directly over the doorway
  // between the two rooms. Abutting slabs share only an edge, and their side
  // faces are opposite-facing and buried above the wall head, so neither can
  // fight. Seams sit over a wall centre wherever possible.
  const ceil = (cx, cz, w, d, y, mat = 'ceiling') => pushBox(solidGeos[mat], cx, y, cz, w, 0.25, d);
  ceil(-10, 3, 8.8, 22.8, H);    // left corridor
  ceil(10, 3, 8.8, 22.8, H);     // garage entrance
  ceil(-23.4, -13, 18.0, 14.8, H); // animal lab          x -32.4 .. -14.4
  ceil(-10, -15, 8.8, 14.8, 6);    // lab balcony (over 2.9 floor)
  ceil(-38.4, -13, 12.0, 14.8, H); // generator room      x -44.4 .. -32.4
  ceil(23.4, -13, 18.0, 14.8, H); // auto garage          x 14.4 .. 32.4
  ceil(10, -14.6, 8.8, 14.0, 6);   // garage balcony      z -21.6 .. -7.6
  ceil(17, -30, 14.8, 16.8, 6);    // chem testing        z -38.4 .. -21.6
  ceil(0, -59, 28.8, 6.8, HH);   // factory (north)       z -62.4 .. -55.6
  ceil(0, -45, 28.8, 6.8, HH);   // factory (south)       z -48.4 .. -41.6
  ceil(-11, -52, 6.8, 7.2, HH);  // factory (west)        z -55.6 .. -48.4
  ceil(11, -52, 6.8, 7.2, HH);   // factory (east)        z -55.6 .. -48.4
  // skylight frame + moonlight shafts
  const skyFrameMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.6, metalness: 0.5 });
  for (const [fx, fz, fw, fd] of [[-8.1, -52, 0.3, 8.5], [8.1, -52, 0.3, 8.5], [0, -47.9, 16.5, 0.3], [0, -56.1, 16.5, 0.3]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.18, fd), skyFrameMat);
    f.position.set(fx, HH - 0.05, fz);
    group.add(f);
  }
  // Skylight shafts are no longer faked with additive quads. Two 4.5m x 9m
  // double-sided planes standing in the middle of the hall read as sheets of
  // glass, aliased hard along every edge they intersected, and flickered as
  // transparency sorting flipped when the camera moved. The raymarched
  // volumetric pass in the post stack produces the real shaft through the
  // skylight, shadow-mapped against the actual roof opening.

  // ---------- floor ----------
  const floorGeo = new THREE.PlaneGeometry(160, 160);
  const floor = new THREE.Mesh(floorGeo, matDirt);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-5, -0.01, -18);
  floor.receiveShadow = true;
  group.add(floor);
  // Room floor slabs get WORLD-SCALED UVs. Previously each slab was a unit-UV
  // plane sampling matFloor's 44x44 repeat, so a 26x20m courtyard tiled the
  // texture every 0.59m — far below one texel per pixel at any distance. The
  // resulting minification aliasing showed up as regular horizontal bands
  // marching across the ground as the player walked. One tile every 2.2m keeps
  // the floor inside the mip chain and makes texel density uniform between
  // rooms of different sizes.
  const FLOOR_TILE = 2.2;
  const OVERLAP = 0.10;
  // Height LEVELS for the overlapping slabs, assigned by graph colouring below.
  //
  // The stagger used to be 0.4mm per slab in placement order, on the reasoning
  // that it was "orders of magnitude larger than the depth precision". It is
  // not. With near = 0.15 and a 24-bit depth window one step is ~0.36mm at 30m
  // and ~1.0mm at 50m, and this map is 76 x 88m — so the near floor resolved
  // and the far floor still fought, which is exactly the "it flickers over
  // there but not here" shape of the report. A monotonic stagger also drifts
  // without bound, walking the visual floor away from the y = 0 the colliders,
  // floorY() and every floor decal are placed against.
  //
  // So: a slab takes the lowest level not already taken by a slab it actually
  // OVERLAPS. Rectangles in a plane need only a handful of levels, so the total
  // spread stays a few millimetres — no drift — while every overlapping pair is
  // guaranteed a full LEVEL_STEP of depth separation.
  const LEVEL_STEP = 0.002;
  const placed = [];
  for (const r of rooms) {
    // Elevated rooms (balconies, the bridge, the catwalk, chem testing) already
    // have their real floor built as an elevated slab in `floorZones`. Giving
    // them a SECOND slab down at y = 0.005 laid a coplanar surface exactly on
    // top of the ground room underneath — upstairsa over leftcorridor,
    // upstairsg over garageentrance, catwalk over factory — and the two
    // z-fought, which is the flickering/shimmering ground the player sees.
    if (r.yMin) continue;
    // Adjacent ground rooms share their rect edges exactly — 8 such pairs. Two
    // coplanar planes meeting on a shared edge leave a hairline where neither
    // wins the rasteriser's fill rule, and the global dirt plane 15mm below is
    // far darker than the concrete, so that hairline reads as a hard black line
    // ruled across the floor. That is the "horizontal black lines" the player
    // kept reporting, and why no post-process toggle ever changed it: it is
    // geometry, not a pass.
    //
    // OVERLAP the slabs so there is no shared edge to crack. Because they
    // overlap rather than abut, a height step between two of them opens no hole
    // — the lower slab simply continues underneath — so the step costs nothing
    // visually and buys a deterministic depth winner across the whole band.
    const w = (r.rect.maxX - r.rect.minX) + OVERLAP * 2;
    const d = (r.rect.maxZ - r.rect.minZ) + OVERLAP * 2;
    const box = {
      minX: r.rect.minX - OVERLAP, maxX: r.rect.maxX + OVERLAP,
      minZ: r.rect.minZ - OVERLAP, maxZ: r.rect.maxZ + OVERLAP,
    };
    const taken = new Set();
    for (const p of placed) {
      if (p.minX < box.maxX && p.maxX > box.minX && p.minZ < box.maxZ && p.maxZ > box.minZ) {
        taken.add(p.level);
      }
    }
    let level = 0;
    while (taken.has(level)) level++;
    placed.push({ ...box, level });
    const slabGeo = new THREE.PlaneGeometry(w, d);
    const uv = slabGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * w / FLOOR_TILE, uv.getY(i) * d / FLOOR_TILE);
    }
    const slab = new THREE.Mesh(slabGeo, matFloor);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(
      (r.rect.minX + r.rect.maxX) / 2,
      0.005 + level * LEVEL_STEP,
      (r.rect.minZ + r.rect.maxZ) / 2,
    );
    slab.receiveShadow = true;
    group.add(slab);
  }
  return { rooms, roomAt, H, HH };
}
