// Environment art pass: architectural trim, industrial clutter, and the
// practical lighting rig.
//
// The base map is a correct but bare set of boxes — flat walls, empty floors,
// ten hanging bulbs. Everything here is decoration layered on top of that
// geometry: it never adds colliders, never moves a spawn, and never changes a
// navigable route, so gameplay and the map invariant validators are untouched.
//
// Everything is merged per material (a handful of draw calls for hundreds of
// props) and laid out from a seeded PRNG so the dressing is identical every
// session — a level should not reshuffle itself between matches.
//
// The props are built in js/map-props/builders.js and put in place by
// js/map-props/placement.js. This file holds what both use: the seeded stream,
// the clearance tests and the geometry kit. Then it merges the buckets and runs
// the practical lights.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { makePropBuilders } from './map-props/builders.js';
import { placeDressing } from './map-props/placement.js';

// ---------------------------------------------------------------------------
// deterministic RNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function decorateMap(group, ctx) {
  const rnd = mulberry32(0x5EED17);
  const R = (a = 1, b) => (b === undefined ? rnd() * a : a + rnd() * (b - a));
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ---------------------------------------------------------------------
  // clearance
  // ---------------------------------------------------------------------
  // Solid props get real colliders — a crate you can walk through reads worse
  // than no crate at all. That makes placement a gameplay concern, so every
  // candidate position is tested against the things a player must always be
  // able to reach or walk through: interactables, doorways, spawn points,
  // zombie ground-spawn risers, and window barriers.
  const keepClear = ctx.keepClear || [];
  const colliders = ctx.colliders;
  function isClear(x, z, radius) {
    for (const k of keepClear) {
      const dx = x - k.x, dz = z - k.z;
      if (dx * dx + dz * dz < (k.r + radius) ** 2) return false;
    }
    return true;
  }

  /**
   * Is there actually a wall here?
   *
   * `alongWalls` picks positions inset from a room's RECTANGLE, but a rect edge
   * is frequently an open doorway, a corridor mouth or the boundary with the
   * next room. Props placed there stood in the middle of movement lanes. This
   * requires a real solid collider within reach before anything is committed,
   * which lets openings reject themselves.
   */
  function againstWall(x, z, reach = 1.35) {
    const list = ctx.wallColliders;
    if (!list || !list.length) return true;
    for (const c of list) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz <= reach * reach) return true;
    }
    return false;
  }
  /** Register a solid, non-climbable prop. Returns false if it was rejected. */
  /**
   * Footprints claimed by props that deliberately register NO collider.
   *
   * A pallet is walk-through on purpose, so nothing in the clearance system
   * stops the placer dropping one on top of another. Two pallets at the same
   * height are not merely untidy: every pallet builds its deck at exactly
   * y + 0.135, so an overlap puts two decks in one plane and the seam crawls.
   * Spread over every room that had pallets, that was the largest remaining
   * z-fight in the map after the crate rails.
   *
   * This is a placement-time test only — it never becomes a collider, so it
   * cannot change where the player can walk.
   */
  const footprints = [];
  function footprintFree(x, z, y, radius) {
    for (const f of footprints) {
      if (Math.abs(f.y - y) > 0.05) continue;
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < (f.r + radius) ** 2) return false;
    }
    return true;
  }
  function claimFootprint(x, z, y, radius) {
    footprints.push({ x, z, y, r: radius });
  }

  /**
   * Is this candidate standing INSIDE a prop that has already been placed?
   *
   * `alongWalls` tests a candidate against everything the player must be able
   * to reach, but never against the props it has itself already put down, so
   * two workbenches or two crates could occupy the same corner. Interpenetrating
   * props read as broken on their own, and because two copies of one builder
   * put their tops at exactly the same height, they also z-fight across every
   * horizontal surface they share.
   *
   * Deliberately a containment test with a small margin rather than a spacing
   * radius: props are SUPPOSED to cluster against walls and against each other,
   * and pushing them apart would thin out the dressing.
   */
  function propFree(x, z, y, margin = 0.25) {
    if (!colliders) return true;
    for (const c of colliders) {
      if (!c.prop) continue;
      if (Math.abs((c.y0 ?? 0) - y) > 0.05) continue;
      if (x > c.minX - margin && x < c.maxX + margin
        && z > c.minZ - margin && z < c.maxZ + margin) return false;
    }
    return true;
  }

  function solid(x, z, halfW, halfD, height, y = 0) {
    if (!colliders) return true;
    colliders.push({
      minX: x - halfW, maxX: x + halfW,
      minZ: z - halfD, maxZ: z + halfD,
      y0: y, h: height, prop: true,
    });
    return true;
  }

  const M = ctx.materials;
  // Geometry buckets, merged once at the end — one draw call per material.
  const buckets = {
    metal: [], wood: [], plate: [], concrete: [], dark: [], brick: [],
    rubber: [], canvas: [], emissive: [],
  };
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();

  /** Push a geometry into a bucket at a transform. Consumes `geo`. */
  function place(bucket, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpV.set(x, y, z);
    tmpS.set(sx, sy, sz);
    tmpM.compose(tmpV, tmpQ, tmpS);
    const g = geo.clone();
    g.applyMatrix4(tmpM);
    if (!g.attributes.uv) {
      // Merging requires a consistent attribute set across the bucket.
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    buckets[bucket].push(g);
    return g;
  }

  // ---- shared primitive geometries (cloned per placement, never rebuilt) ----
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cyl16: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
    cone: new THREE.ConeGeometry(0.5, 1, 12, 1, true),
    torus: new THREE.TorusGeometry(0.5, 0.1, 6, 14),
    sphere: new THREE.SphereGeometry(0.5, 10, 8),
    rock: new THREE.IcosahedronGeometry(0.5, 0),
    rock1: new THREE.DodecahedronGeometry(0.5, 0),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  // Give the rubble chunks irregular silhouettes once, up front.
  for (const key of ['rock', 'rock1']) {
    const p = G[key].attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * R(0.6, 1.4), p.getY(i) * R(0.5, 1.2), p.getZ(i) * R(0.6, 1.4));
    }
    G[key].computeVertexNormals();
  }

  const lights = [];
  const animated = [];

  const {
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  } = makePropBuilders({ place, G, buckets, R, rnd, pick, group, lights, animated, footprintFree, claimFootprint });

  placeDressing({
    R, RI, rnd, place, G, isClear, againstWall, propFree, solid,
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  });

  // =========================================================================
  // merge + attach
  // =========================================================================
  const bucketMat = {
    metal: M.metal, wood: M.wood, plate: M.plate, concrete: M.concrete,
    dark: M.dark, brick: M.brick,
    rubber: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.95, metalness: 0.0 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x5c5747, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide }),
    emissive: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffaa44, emissiveIntensity: 1 }),
  };
  let propTris = 0;
  for (const [key, geos] of Object.entries(buckets)) {
    if (!geos.length) continue;
    // Merging erases which triangles belong to which prop; the map needs that
    // to shape each prop's bullet cover, so it gets the pieces first.
    if (ctx.shotPieces) for (const g of geos) ctx.shotPieces.push({ geometry: g, matrix: null });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    propTris += merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
    const mesh = new THREE.Mesh(merged, bucketMat[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `props_${key}`;
    group.add(mesh);
  }

  function update(dt, time, powerOn) {
    for (const l of lights) {
      l.t += dt;
      let target = powerOn ? l.on : l.off;
      if (l.emergency) target = powerOn ? l.on : l.off; // brighter while mains are dead
      if (l.broken) target = 0;
      else if (l.flicker) {
        // Two detuned sines beat against each other: irregular, never periodic.
        const n = Math.sin(l.t * 23.3 + l.t * 0.7) + Math.sin(l.t * 7.1) + Math.sin(l.t * 51.7) * 0.4;
        if (l.fluoro) { if (n > 0.9) target *= 0.12; else if (n > 0.55) target *= 0.72; }
        else if (n > 1.25) target *= 0.18;
      }
      l.light.intensity += (target - l.light.intensity) * Math.min(1, dt * 12);
      const lit = l.light.intensity / Math.max(1, l.on);
      l.mat.emissiveIntensity = 0.12 + lit * (l.emergency ? 2.6 : 2.2);
    }
    for (const a of animated) {
      a.t += dt;
      if (a.kind === 'gauge') a.mat.emissiveIntensity = 0.55 + Math.sin(a.t * 2.3) * 0.28 + (Math.sin(a.t * 11) > 0.9 ? 0.5 : 0);
    }
  }

  return { update, lights, propTris };
}
