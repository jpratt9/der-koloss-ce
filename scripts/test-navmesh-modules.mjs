import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as nav from '../js/navmesh.js';
import { Heap } from '../js/navmesh/heap.js';
import { ColliderHash, blocksEnemy, circleHitsBox } from '../js/navmesh/colliders.js';

// Direct imports deliberately require neither a Three.js loader nor a DOM.
assert.deepEqual(Object.keys(nav).sort(), [
  'NAV_CELL', 'NAV_MAX_DROP', 'NAV_MAX_LEVELS', 'NAV_MAX_STEP_UP',
  'NAV_RADIUS', 'NavGrid', 'getNavGrid', 'navInvalidate',
].sort());
for (const [name, value] of Object.entries({
  NAV_CELL: 0.45, NAV_RADIUS: 0.3, NAV_MAX_LEVELS: 3,
  NAV_MAX_DROP: 3.4, NAV_MAX_STEP_UP: 1.55,
})) assert.equal(nav[name], value, name);

// Exact specifiers enforce dependency direction and filename case on macOS too.
const expectedImports = {
  'navmesh.js': ['./navmesh/constants.js', './navmesh/colliders.js', './navmesh/heap.js'],
  'navmesh/constants.js': [],
  'navmesh/colliders.js': ['./constants.js'],
  'navmesh/heap.js': [],
};
assert.deepEqual(readdirSync(new URL('../js/navmesh/', import.meta.url)).sort(),
  ['colliders.js', 'constants.js', 'heap.js']);
for (const [file, expected] of Object.entries(expectedImports)) {
  const source = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(imports, expected, file);
}

// Grow more than once, retain every node, and order equal-priority nodes freely.
const heap = new Heap(2);
const priorities = [8, 2, 5, 2, -1, 8, 0, 3, 1];
priorities.forEach((f, node) => heap.push(node, f));
assert.ok(heap.cap >= priorities.length);
assert.ok(heap.node instanceof Int32Array);
assert.ok(heap.f instanceof Float32Array);
const popped = [];
while (heap.n) popped.push(heap.pop());
assert.deepEqual(popped.map((node) => priorities[node]), [...priorities].sort((a, b) => a - b));
assert.deepEqual([...popped].sort((a, b) => a - b), priorities.map((_, i) => i));
heap.push(100, -100);
heap.clear();
assert.equal(heap.n, 0);
heap.push(200, 20);
assert.equal(heap.pop(), 200);
assert.equal(heap.n, 0);

// Vertical overlap is inclusive, whereas horizontal circle contact is strict.
assert.equal(blocksEnemy({ shootOk: true }, 0), false);
assert.equal(blocksEnemy({ playerOnly: true }, 0), false);
assert.equal(blocksEnemy({}, 100), true);
assert.equal(blocksEnemy({ y0: 1.1, h: 1 }, 0), true);
assert.equal(blocksEnemy({ y0: 1.101, h: 1 }, 0), false);
assert.equal(blocksEnemy({ y0: 0, h: 0.25 }, 0), true);
assert.equal(blocksEnemy({ y0: 0, h: 0.249 }, 0), false);
const box = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
assert.equal(circleHitsBox(2, 0.5, 1, box), false);
assert.equal(circleHitsBox(1.999, 0.5, 1, box), true);
assert.equal(circleHitsBox(0.5, 0.5, 0.3, box), true);
assert.equal(circleHitsBox(2, 2, 1, box), false);

// Radius expansion places a collider on both sides of a bucket boundary.
const wall = { minX: 4.1, maxX: 4.2, minZ: 1, maxZ: 2 };
const ignored = { ...wall, playerOnly: true };
const hash = new ColliderHash([wall, ignored], 0, 0, 8, 8);
assert.ok(hash.at(3.9, 1.5).includes(wall));
assert.ok(hash.at(4.3, 1.5).includes(wall));
const sentinel = {};
const gathered = [sentinel];
assert.equal(hash.gather(3.9, 1.5, 0, gathered), gathered);
assert.deepEqual(gathered, [sentinel, wall]);
assert.equal(hash.gather(7, 7, 0, gathered), gathered);
assert.deepEqual(gathered, [sentinel, wall]);

const makeMap = () => ({
  rooms: [{ rect: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } }],
  colliders: [], floorZones: [], ramps: [], floorY: () => 0,
});
const map = makeMap();
assert.doesNotThrow(() => nav.navInvalidate(map, 0, 0, 4, 4));
const grid = nav.getNavGrid(map);
assert.ok(grid instanceof nav.NavGrid);
assert.equal(nav.getNavGrid(map), grid);
assert.notEqual(nav.getNavGrid(makeMap()), grid);
const epoch = grid.epoch;
const node = grid.nodeAt(2, 2, 0);
assert.ok(node >= 0);
const obstruction = { minX: 1, maxX: 3, minZ: 1, maxZ: 3 };
map.colliders.push(obstruction);
nav.navInvalidate(map, 1, 1, 3, 3);
assert.equal(nav.getNavGrid(map), grid);
assert.equal(grid.epoch, epoch + 1);
assert.equal(grid.nodeAt(2, 2, 0), -1);
const out = [sentinel];
assert.equal(grid.activeColliders(2, 2, 0, out), out);
assert.deepEqual(out, [obstruction]);
map.colliders.length = 0;
nav.navInvalidate(map, 1, 1, 3, 3);
assert.equal(grid.nodeAt(2, 2, 0), node);
assert.equal(grid.activeColliders(2, 2, 0, out), out);
assert.deepEqual(out, []);
console.log('Navigation modules OK: public API, dependencies, heap growth, collision boundaries and cached-grid invalidation.');
