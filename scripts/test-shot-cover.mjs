// Unit contract for js/shot-cover.js: which drawn pieces become a prop's bullet
// cover, and where a shot meets them. Synthetic geometry only — the whole-map
// behaviour is pinned in validate-prop-cover.mjs.
import assert from 'node:assert/strict';
import { attachShotCover, coverRayDistance } from '../js/shot-cover.js';

// An indexed box of size w x h x d centred at (x, y, z), shaped like a BufferGeometry.
function box(x, y, z, w, h, d) {
  const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const position = new Float32Array(corners.flatMap(([a, b, c]) => [x + a * w / 2, y + b * h / 2, z + c * d / 2]));
  const index = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]);
  return { attributes: { position: { array: position, itemSize: 3 } }, index: { array: index } };
}
const piece = (geometry, matrix = null) => ({ geometry, matrix });
const prop = (minX, maxX, minZ, maxZ, h = 1, y0 = 0, extra = {}) => ({ minX, maxX, minZ, maxZ, y0, h, prop: true, ...extra });
const shoot = (c, o, d, maxDist = 100, normal = null) => coverRayDistance(c.cover, o[0], o[1], o[2], d[0], d[1], d[2], maxDist, normal);
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

// ---- a claimed piece stops a shot at its face, and only there ---------------
{
  const drum = prop(-0.5, 0.5, -0.5, 0.5, 1);
  assert.equal(attachShotCover([drum], [piece(box(0, 0.5, 0, 0.4, 1, 0.4))]), 1, 'one collider covered');
  const n = { x: 0, y: 0, z: 0 };
  assert.ok(near(shoot(drum, [-3, 0.5, 0], [1, 0, 0], 100, n), 2.8), 'a shot into the piece stops at its near face');
  assert.deepEqual([n.x, n.y, n.z].map((v) => Math.round(v) + 0), [-1, 0, 0], 'the struck face is reported turned toward the shooter');
  assert.ok(near(shoot(drum, [3, 0.5, 0], [-1, 0, 0], 100, n), 2.8), 'and from the other side, its other face');
  assert.deepEqual([n.x, n.y, n.z].map((v) => Math.round(v) + 0), [1, 0, 0]);
  assert.equal(shoot(drum, [-3, 0.5, 0.35], [1, 0, 0]), -1, 'a shot through the prop\'s box but clear of the piece gets through');
  assert.equal(shoot(drum, [-3, 0.5, 0], [1, 0, 0], 2.7), -1, 'a face beyond maxDist does not stop the shot');
  assert.equal(shoot(drum, [-3, 0.5, 0], [-1, 0, 0]), -1, 'nothing behind the shooter stops it');
}

// ---- the nearest of several pieces wins -------------------------------------
{
  const bench = prop(0, 1, -0.5, 0.5, 1);
  attachShotCover([bench], [piece(box(0.7, 0.5, 0, 0.2, 1, 1)), piece(box(0.3, 0.5, 0, 0.2, 1, 1))]);
  assert.ok(near(shoot(bench, [-1, 0.5, 0], [1, 0, 0]), 1.2), 'the front piece, not the back one, stops the shot');
}

// ---- planes stop shots from either side --------------------------------------
{
  const tarp = prop(0.5, 1.5, -1, 1, 2);
  const plane = { attributes: { position: { array: new Float32Array([1, 0, -1, 1, 2, -1, 1, 2, 1, 1, 0, -1, 1, 2, 1, 1, 0, 1]), itemSize: 3 } }, index: null };
  attachShotCover([tarp], [piece(plane)]);
  assert.ok(near(shoot(tarp, [0, 1, 0], [1, 0, 0]), 1), 'a non-indexed plane stops a shot from its front');
  assert.ok(near(shoot(tarp, [2, 1, 0], [-1, 0, 0]), 1), 'and from its back');
}

// ---- a piece's matrix puts it where it is drawn ------------------------------
{
  // A 2m beam along local x, turned a quarter about y and moved to (5, 0.5, 5):
  // it now runs along z. Column-major, as Matrix4.elements.
  const turned = prop(4.5, 5.5, 4, 6, 1);
  attachShotCover([turned], [piece(box(0, 0, 0, 2, 0.2, 0.2), [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 5, 0.5, 5, 1])]);
  assert.ok(near(shoot(turned, [3, 0.5, 5.8], [1, 0, 0]), 1.9), 'the turned beam stops a shot near its far end');
  assert.equal(shoot(turned, [5, 0.5, 3], [1, 0, 0]), -1, 'and not where it would lie unturned');
}

// ---- which box a piece belongs to ---------------------------------------------
{
  // Centre inside two boxes: the smaller one is the prop it was built for.
  const pile = prop(0, 2, 0, 2, 1), crate = prop(0.5, 1.5, 0.5, 1.5, 1);
  attachShotCover([pile, crate], [piece(box(1, 0.5, 1, 0.3, 0.3, 0.3))]);
  assert.ok(crate.cover && !pile.cover, 'a piece centred in nested boxes belongs to the smaller');

  // Centre in no box, reaching into two: the deeper overlap wins. This is the
  // courtyard generator's flywheel, centred just outside its generator.
  const left = prop(0, 1, 0, 1, 1), right = prop(1.55, 2.5, 0, 1, 1);
  attachShotCover([left, right], [piece(box(1.3, 0.5, 0.5, 0.7, 0.5, 0.5))]);
  assert.ok(right.cover && !left.cover, 'a piece reaching into two boxes belongs to the one it reaches furthest into');

  // A floor slab crossing a small box is scenery.
  const barrel = prop(-0.3, 0.3, -0.3, 0.3, 1);
  assert.equal(attachShotCover([barrel], [piece(box(0, 0.05, 0, 6, 0.1, 6))]), 0, 'a slab overhanging a box by metres is not its cover');
  assert.equal(barrel.cover, undefined, 'and a box nothing belongs to keeps testing as a box');

  // A door frame kissing a thin deck from above is the wall's, not the deck's;
  // a pillar standing mostly in a box's height is the prop's.
  const deck = prop(-2, 2, -1, 1, 0.25, 2.65);
  assert.equal(attachShotCover([deck], [piece(box(2, 4.4, 0, 0.5, 3.4, 2.4))]), 0, 'a tall piece grazing a box from above is not its cover');
  const machine = prop(0, 1.2, 0, 1, 2.4);
  assert.equal(attachShotCover([machine], [piece(box(1.1, 2.25, 0.5, 0.4, 4.5, 0.4))]), 1, 'a pillar standing in a box\'s height is its cover');
  assert.ok(near(shoot(machine, [3, 3.8, 0.5], [-1, 0, 0]), 1.7), 'all the way up, above the box it belongs to');
}

// ---- only bullet-solid props get covers ----------------------------------------
{
  const inside = () => [piece(box(0, 0.5, 0, 0.2, 0.2, 0.2))];
  for (const [flag, why] of [
    [{ noRaycast: true }, 'a noRaycast guard'],
    [{ bulletPass: true }, 'bullet-transparent scaffolding'],
    [{ boxCollider: true }, 'the mystery box, which moves'],
    [{ prop: false }, 'structure'],
  ]) {
    const c = prop(-1, 1, -1, 1, 1, 0, flag);
    assert.equal(attachShotCover([c], inside()), 0, `${why} must not be given a cover`);
    assert.equal(c.cover, undefined);
  }
}

// ---- pieces that are not plain geometry are skipped ----------------------------
{
  const c = prop(-1, 1, -1, 1, 1);
  const interleaved = { attributes: { position: { isInterleavedBufferAttribute: true, array: new Float32Array(9), itemSize: 3 } }, index: null };
  assert.equal(attachShotCover([c], [piece(interleaved), piece({ attributes: {} }), piece(null)]), 0,
    'interleaved, positionless and missing geometry are not cover');
}

console.log('shot cover contract OK');
