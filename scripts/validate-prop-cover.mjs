#!/usr/bin/env node
// Props stop bullets where they are drawn, and nowhere else.
//
// Regression this exists for: every prop's MOVEMENT collider — a square box
// around a round drum, one solid block around a cage of bars, a railing's whole
// height and length, and a footprint that never turned with the few props built
// turned — was also its bullet cover. A third of every drum's box stopped shots
// in empty air, five-sixths of a cage's, and the ends of the turned courtyard
// sandbag wall, standing outside their box, were shot straight through.
//
// This builds the real map, fires the real Game.wallDist through every prop,
// and judges each shot against the triangles the renderer actually draws.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { THREE, loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { buildHeadlessMap } from './lib/headless-map.mjs';

const { scene, map } = await buildHeadlessMap();
const { Game } = await loadGameModule('game.js');
const { segmentHitsBox } = await loadGameModule('collision.js');
const game = Object.create(Game.prototype);
game.map = map;

const bulletSolid = (c) => !c.noRaycast && !c.bulletPass;
const props = map.colliders.filter((c) => c.prop && bulletSolid(c));
const structure = map.colliders.filter((c) => !c.prop && bulletSolid(c));

// ---- every bullet-solid prop is shot on its drawing, bar the one that moves ---
{
  const bare = props.filter((c) => !c.cover);
  assert.deepEqual(bare.map((c) => !!c.boxCollider), [true],
    `only the mystery box (it moves) may still be shot as a box; also bare: ${bare.filter((c) => !c.boxCollider)
      .map((c) => `(${((c.minX + c.maxX) / 2).toFixed(1)}, ${((c.minZ + c.maxZ) / 2).toFixed(1)})`).join(' ')}`);
}

// ---- what is drawn: every visible, opaque triangle in the built map ----------
const drawn = [];
{
  scene.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  scene.traverseVisible((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false || m.blending !== THREE.NormalBlending) return; // glows and light cones stop nothing
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
        drawn.push(a.x, a.y, a.z);
      }
    }
  });
}
const T = Float64Array.from(drawn);

function rayTriangle(t, o, d) {
  const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2];
  const e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const sx = o.x - T[t], sy = o.y - T[t + 1], sz = o.z - T[t + 2];
  const u = (sx * px + sy * py + sz * pz) / det;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) / det;
  if (v < 0 || u + v > 1) return -1;
  const dist = (e2x * qx + e2y * qy + e2z * qz) / det;
  return dist > 1e-6 ? dist : -1;
}
// Drawn triangles whose bounds touch a box, so each shot only scans its neighbourhood.
function drawnNear(minX, minY, minZ, maxX, maxY, maxZ) {
  const out = [];
  for (let t = 0; t < T.length; t += 9) {
    if (Math.max(T[t], T[t + 3], T[t + 6]) < minX || Math.min(T[t], T[t + 3], T[t + 6]) > maxX) continue;
    if (Math.max(T[t + 2], T[t + 5], T[t + 8]) < minZ || Math.min(T[t + 2], T[t + 5], T[t + 8]) > maxZ) continue;
    if (Math.max(T[t + 1], T[t + 4], T[t + 7]) < minY || Math.min(T[t + 1], T[t + 4], T[t + 7]) > maxY) continue;
    out.push(t);
  }
  return out;
}
const firstDrawn = (near, o, d, from, to) => {
  let best = Infinity;
  for (const t of near) { const k = rayTriangle(t, o, d); if (k >= from && k <= to && k < best) best = k; }
  return best;
};
// Would a structural (non-prop) collider stop this ray before `to`?
function structureAcross(o, d, to) {
  for (const c of structure) {
    const k = segmentHitsBox(o.x, o.z, o.x + d.x * to, o.z + d.z * to, c);
    if (k < 0) continue;
    const y = o.y + d.y * to * k;
    if (y >= (c.y0 || 0) && y <= (c.y0 || 0) + (c.h || 3)) return true;
  }
  return false;
}

// ---- inside every prop's box, a shot stops if and only if it meets drawing ----
{
  let rays = 0, emptyRays = 0, solidRays = 0;
  const stoppedInAir = [], passedThrough = [];
  const N = 6, dirs = [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
  for (const c of props.filter((p) => p.cover)) {
    const y0 = c.y0 || 0, h = c.h || 3;
    const near = drawnNear(c.minX - 0.1, y0 - 0.1, c.minZ - 0.1, c.maxX + 0.1, y0 + h + 0.1, c.maxZ + 0.1);
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const half = Math.hypot(c.maxX - c.minX, c.maxZ - c.minZ) / 2;
    for (const [dx, dz] of dirs) {
      const d = { x: dx, y: 0, z: dz };
      for (let li = 0; li < N; li++) for (let yi = 0; yi < N; yi++) {
        const lat = ((li + 0.5) / N * 2 - 1) * half;
        const y = y0 + (yi + 0.5) / N * h;
        const px = cx - dz * lat, pz = cz + dx * lat;
        // Where this line enters and leaves the box.
        let t0 = -Infinity, t1 = Infinity;
        for (const [p, dd, lo, hi] of [[px, dx, c.minX, c.maxX], [pz, dz, c.minZ, c.maxZ]]) {
          if (Math.abs(dd) < 1e-9) { if (p < lo || p > hi) { t0 = 1; t1 = 0; } continue; }
          let n0 = (lo - p) / dd, n1 = (hi - p) / dd;
          if (n0 > n1) [n0, n1] = [n1, n0];
          t0 = Math.max(t0, n0); t1 = Math.min(t1, n1);
        }
        if (!(t1 - t0 > 0.04)) continue;
        const o = { x: px + dx * (t0 - 0.05), y, z: pz + dz * (t0 - 0.05) };
        const span = t1 - t0 + 0.05;
        if (structureAcross(o, d, span)) continue;
        rays++;
        const surface = firstDrawn(near, o, d, 0, span);
        const stop = game.wallDist(o, d, span + 0.5);
        const where = `(${((c.minX + c.maxX) / 2).toFixed(2)}, ${((c.minZ + c.maxZ) / 2).toFixed(2)}) y ${y.toFixed(2)}`;
        if (surface === Infinity) {
          emptyRays++;
          if (stop < span - 0.02) stoppedInAir.push(`${where}: stopped ${stop.toFixed(2)}m in, nothing drawn before ${span.toFixed(2)}m`);
        } else {
          solidRays++;
          if (stop > surface + 0.02) passedThrough.push(`${where}: drawn surface at ${surface.toFixed(2)}m, shot stopped at ${stop.toFixed(2)}m`);
        }
      }
    }
  }
  assert.ok(emptyRays > 1000 && solidRays > 1000, `the sweep must exercise both empty air and drawn surfaces (${emptyRays} / ${solidRays})`);
  assert.equal(stoppedInAir.length, 0,
    `${stoppedInAir.length} of ${emptyRays} shots through empty air inside a prop's box were stopped, e.g.\n  ${stoppedInAir.slice(0, 8).join('\n  ')}`);
  // Drawing that is not the prop's is not the prop's cover: the factory catwalk
  // deck, which has no bullet collider anywhere along its length, where its
  // edge runs through the railing boxes, and floor-level clutter beside the
  // turned factory machine. That is all this tolerance holds today (35 shots);
  // a surface of a prop itself going soft would miss far more often.
  assert.ok(passedThrough.length / solidRays < 0.02,
    `${passedThrough.length} of ${solidRays} shots at a drawn surface inside a prop's box went through it, e.g.\n  ${passedThrough.slice(0, 8).join('\n  ')}`);
  console.log(`  prop sweep: ${rays} shots, ${emptyRays} through empty air, ${solidRays} at drawn surfaces (${passedThrough.length} through drawing that is not a prop)`);
}

const shotStops = (from, to) => {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  return game.wallDist(from, { x: dx / len, y: dy / len, z: dz / len }, len) < len - 0.02;
};
const colliderAt = (x, z, pred = () => true) => props.find((c) => pred(c) && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);

// ---- the turned courtyard sandbag wall --------------------------------------
// Built running along z (3m) but boxed running along x, so its box is 3m wide
// in x and 1m deep in z, while the bags are 0.9m wide in x and 3m long in z.
{
  const c = colliderAt(-14, -34);
  assert.ok(c && c.maxX - c.minX > 2.5, 'the turned courtyard sandbags must still have their movement box');
  assert.ok(shotStops({ x: -17, y: 0.4, z: -35.2 }, { x: -11, y: 0.4, z: -35.2 }),
    'a shot into the end of the sandbag wall, outside its old box, must be stopped');
  // Short of the tipped drum that lies on this line at z -32.35.
  assert.ok(!shotStops({ x: -15.2, y: 0.4, z: -36.5 }, { x: -15.2, y: 0.4, z: -32.8 }),
    'a shot past the sandbag wall, through the empty half of its old box, must get through');
}

// ---- drums are round ----------------------------------------------------------
{
  const drums = props.filter((c) => c.cover && Math.abs(c.maxX - c.minX - 0.62) < 0.01 && Math.abs((c.h || 3) - 0.9) < 0.01);
  assert.ok(drums.length >= 10, `expected the dressing's standing drums (found ${drums.length})`);
  for (const c of drums) {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2, y = (c.y0 || 0) + 0.6;
    // Diagonally through the corner of the square box, 0.37m off the drum's
    // axis: outside its 0.30m hoops, inside the 0.44m half-diagonal.
    const off = 0.37 * Math.SQRT1_2, far = 1.2 * Math.SQRT1_2;
    const from = { x: cx + off - far, y, z: cz - off - far }, to = { x: cx + off + far, y, z: cz - off + far };
    const others = map.colliders.filter((o) => o !== c && bulletSolid(o) && segmentHitsBox(from.x, from.z, to.x, to.z, o) >= 0);
    if (others.length) continue; // something else in the line of fire
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
    assert.ok(game.wallDist(from, { x: dx / len, y: 0, z: dz / len }, len) >= len - 0.02,
      `a shot past the shoulder of the drum at (${cx.toFixed(2)}, ${cz.toFixed(2)}) must get through`);
    assert.ok(shotStops({ x: cx - 1.2, y, z: cz }, { x: cx + 1.2, y, z: cz }), `a shot into the drum at (${cx.toFixed(2)}, ${cz.toFixed(2)}) must be stopped`);
  }
}

// ---- cages are bars -------------------------------------------------------------
// The lab cage by the corridor is built turned a quarter inside a box that is
// not, so its bars run along z and its end bars stand 5cm outside the box.
{
  const cage = colliderAt(-18, -18.8);
  assert.ok(cage?.cover, 'the lab cage must be shot on its drawing');
  const across = (y, z) => shotStops({ x: -19.5, y, z }, { x: -16.5, y, z });
  assert.ok(!across(0.5, -18.55), 'a shot between the cage bars must get through');
  assert.ok(across(0.88, -18.55), 'a shot into the cage roof frame must be stopped');
  assert.ok(across(0.5, -18.3) && across(0.5, -19.3), 'the end bars outside the cage\'s box must stop a shot');
}

// ---- the courtyard generator's flywheel is part of the generator -------------------
// Centred 10cm outside the generator's box, it was the one part a centre-in-box
// rule dropped.
assert.ok(shotStops({ x: -9.1, y: 1.0, z: -29 }, { x: -9.1, y: 1.0, z: -23 }),
  'a shot into the courtyard generator\'s flywheel must be stopped');

// ---- a prop does not claim the walls it touches ----------------------------------
{
  const bridge = colliderAt(0, -12, (c) => (c.y0 || 0) === 2.65);
  assert.ok(bridge?.cover && bridge.cover.bounds[4] < 3.0,
    'the bridge deck must not claim the 3.3m door frames that touch its ends');
}

// ---- impacts face the shooter ------------------------------------------------------
{
  game._wallHitOut = null;
  const dir = { x: 1, y: 0, z: 0 };
  const hit = game.wallHit({ x: -17, y: 0.4, z: -34.4 }, dir, 6);
  assert.ok(hit.hit && hit.nx * dir.x + hit.ny * dir.y + hit.nz * dir.z < -0.5,
    `a sandbag struck head-on must report a face turned toward the shooter (n ${hit.nx.toFixed(2)}, ${hit.ny.toFixed(2)}, ${hit.nz.toFixed(2)})`);
}

// ---- wiring the map depends on --------------------------------------------------------
// Source pins, deliberately: none of these can go wrong on the map as it stands
// today — nothing that moves or glows happens to sit inside a prop's box — so
// only the code shape keeps them from regressing the day something does.
{
  const mapSource = await readFile(join(repoRoot, 'js/map.js'), 'utf8');
  const propsSource = await readFile(join(repoRoot, 'js/map-props.js'), 'utf8');
  assert.match(mapSource, /for \(const root of \[\.\.\.doors\.map\(\(d\) => d\.mesh\), \.\.\.barriers\.map\(\(b\) => b\.boardsMesh\), boxG\]\)/,
    'doors, window boards and the mystery box move or vanish after the build, so they must be kept out of cover');
  assert.match(mapSource, /if \(!o\.isMesh \|\| o\.isInstancedMesh \|\| moving\.has\(o\) \|\| \/\^\(solid\|props\)_\/\.test\(o\.name\)\) return;/,
    'the capture pass must skip moving meshes and the merged buckets whose pieces were already taken');
  assert.match(mapSource, /m\.transparent \|\| m\.depthWrite === false \|\| m\.blending !== THREE\.NormalBlending/,
    'glows and light cones must not become cover');
  assert.match(mapSource, /for \(const g of arr\) shotPieces\.push\(\{ geometry: g, matrix: null \}\);\s*\/\/ manual merge/,
    'the map\'s own buckets must hand over their pieces before they are merged');
  assert.match(propsSource, /if \(ctx\.shotPieces\) for \(const g of geos\) ctx\.shotPieces\.push\(\{ geometry: g, matrix: null \}\);\s*const merged = mergeGeometries/,
    'the dressing must hand over its pieces before they are merged');
  const attach = mapSource.indexOf('attachShotCover(colliders, shotPieces);');
  assert.ok(attach > mapSource.indexOf('group.traverseVisible('), 'covers are attached once every piece has been gathered');
}

// ---- the per-shot path allocates nothing -------------------------------------------
{
  const cover = await readFile(join(repoRoot, 'js/shot-cover.js'), 'utf8');
  for (const name of ['export function coverRayDistance(', 'function rayCrossesBox(', 'function rayTriangle(']) {
    const start = cover.indexOf(name);
    assert.ok(start > -1, `${name} must exist`);
    const body = cover.slice(start, cover.indexOf('\n}\n', start));
    assert.doesNotMatch(body, /new [A-Z]|\{ *\.\.\.|\[\]/, `${name} runs per bullet per prop and must not allocate`);
  }
}

console.log('prop cover OK');
