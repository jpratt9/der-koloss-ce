// The hellhound model, built headless: what js/zombies/ and the cinematic
// director rely on a build to make. test-zombie-groans runs every builder on a
// dog round, but checks only that hounds spawn and stay quiet, so nothing
// looked at what a build makes.
//
// - houndMaterials() is built once, and its materials are exactly the slots
//   pack() keeps. pack() drops a slot SLOTS doesn't list, so a material
//   without a slot would never be drawn.
// - pack() merges a bone's bag into one geometry with a group per non-empty
//   slot, in SLOTS order, and merges hand-built geometry with primitives.
//   spike(), ribbon() and placed() make the shapes every part is built from.
// - A hound is 19 meshes on a rig of 20 groups, and each mesh has one shared
//   material per group of its geometry.
// - The rig carries what js/zombies/poses.js and the director read: the
//   neck -> head -> jaw chain, three chained tail links and four
//   hip -> knee -> paw legs. poses.js skips a field it can't find, so this
//   checks that applyHellhoundPose() moves every part and stands the lowest
//   paw on the floor.
// - Every hound of a variant shares that variant's geometry, so a pack of
//   eight allocates only the wrappers. Variants differ, and a variant number
//   wraps.
// - setHellhoundLOD() keeps only the torso's shadow from 330 (squared metres),
//   drops every shadow and the last two tail links from 2000, puts them back
//   close up, and does no work while the tier stays the same.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';

const { HOUND_VARIANTS, buildHellhound, houndMaterials, prewarmHellhounds, setHellhoundLOD } =
  await loadGameModule('render', 'HellhoundModel.js');
const { SLOTS } = await loadGameModule('render', 'HellhoundModel', 'materials.js');
const { spike, ribbon, placed, pack } = await loadGameModule('render', 'HellhoundModel', 'primitives.js');
const { applyHellhoundPose } = await loadGameModule('zombies', 'poses.js');
const { ZSTATES } = await loadGameModule('zombies', 'states.js');

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const meshesOf = (root) => {
  const list = [];
  root.traverse((o) => { if (o.isMesh) list.push(o); });
  return list;
};

// ---------------------------------------------------------------------------
// The materials are built once, and they are exactly the slots pack() keeps.
// ---------------------------------------------------------------------------
const M = houndMaterials();
assert.ok(houndMaterials() === M, 'houndMaterials() must build the materials once, for every hound to share');
assert.deepEqual(Object.keys(M).sort(), [...SLOTS].sort(), 'every material must have a slot, and every slot a material');

// ---------------------------------------------------------------------------
// The geometry kit.
// ---------------------------------------------------------------------------
{
  const box = () => new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const merged = pack({ gullet: [box()], hide: [box(), new THREE.SphereGeometry(0.05, 6, 5)], bone: [] });
  assert.deepEqual(merged.slots, ['hide', 'gullet'], 'pack() must keep the non-empty slots, in SLOTS order');
  assert.deepEqual(merged.geo.groups.map((g) => g.materialIndex), [0, 1], 'pack() must make one group per slot');
  assert.equal(merged.geo.groups[1].count, box().index.count, 'the gullet group must hold the gullet geometry and nothing else');
  assert.equal(merged.geo.attributes.uv, undefined, 'pack() must strip UVs: the creature shader samples in world space');
  const single = pack({ hide: [box()], ember: [] });
  assert.deepEqual(single.slots, ['hide']);
  assert.equal(single.geo.groups.length, 0, 'a part with one slot must be one plain geometry');
  assert.equal(pack({ hide: [], ember: [] }), null, 'an empty bag must build nothing');
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const mixed = pack({ hide: [box(), tri] });
  assert.ok(mixed && mixed.geo.index.count === box().index.count + 3,
    'pack() must give hand-built geometry the index and normals it needs to merge with a primitive');

  const s = spike(0.2, 0.03);
  s.computeBoundingBox();
  assert.ok(near(s.boundingBox.min.y, 0) && near(s.boundingBox.max.y, 0.2), 'spike() must stand on its base, len tall');

  assert.equal(ribbon([new THREE.Vector3()], 0.05), null, 'a ribbon needs two points');
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)];
  const r = ribbon(pts, 0.05);
  const at = (i) => new THREE.Vector3().fromBufferAttribute(r.attributes.position, i);
  assert.equal(r.attributes.position.count, 6, 'a ribbon must put two vertices at each point');
  assert.equal(r.index.count, 12, 'a ribbon must be two triangles per span');
  assert.ok([0, 1].every((i) => at(i).distanceTo(pts[0]) < 1e-6) && [4, 5].every((i) => at(i).distanceTo(pts[2]) < 1e-6),
    'a ribbon must taper to nothing at both ends');
  assert.ok(near(at(2).distanceTo(at(3)), 0.1), 'a ribbon must be its full width across the middle');

  const plate = new THREE.BoxGeometry(1, 0.5, 0.25);
  assert.ok(placed(plate, 1, 2, 3, 0, Math.PI / 2, 0, 2) === plate, 'placed() must move the geometry it is given');
  plate.computeBoundingBox();
  // Doubled to 2 x 1 x 0.5, then a quarter turn about Y swaps its X and Z.
  assert.ok(plate.boundingBox.min.distanceTo(new THREE.Vector3(0.75, 1.5, 2)) < 1e-6
    && plate.boundingBox.max.distanceTo(new THREE.Vector3(1.25, 2.5, 4)) < 1e-6,
  'placed() must scale, then rotate, then translate');
}

// ---------------------------------------------------------------------------
// A hound is 19 meshes on 20 groups, each mesh with a material per group.
// ---------------------------------------------------------------------------
prewarmHellhounds();
const hound = buildHellhound(0);
const u = hound.userData;
{
  const groups = [];
  hound.traverse((o) => { if (o.isGroup) groups.push(o); });
  assert.equal(meshesOf(hound).length, 19, 'a hound must be 19 meshes: torso, neck, head, jaw, three tail links and three per leg');
  assert.equal(groups.length, 20, 'its rig must be 20 groups: the root, body, neck, head, jaw, three tail links and three joints per leg');
  const shared = new Set(Object.values(M));
  for (const mesh of meshesOf(hound)) {
    const list = [mesh.material].flat();
    assert.ok(list.every((m) => shared.has(m)), `${mesh.name} must draw with the shared materials`);
    assert.equal(list.length, Math.max(1, mesh.geometry.groups.length), `${mesh.name} needs one material per group of its geometry`);
    assert.ok(mesh.castShadow, `${mesh.name} must cast a shadow when it is built`);
  }
}

// ---------------------------------------------------------------------------
// The rig carries every field js/zombies/poses.js and the director read.
// ---------------------------------------------------------------------------
assert.equal(u.dog, true);
assert.equal(u.directorRig, true);
assert.ok(u.body.parent === hound && u.neck.parent === hound && u.head.parent === u.neck && u.jaw.parent === u.head,
  'the body and neck must hang off the root, the head off the neck and the jaw off the head');
assert.equal(u.jawRestY, u.jaw.position.y, 'jawRestY must be where the jaw rests');
assert.equal(u.tailSegs.length, 3);
assert.ok(u.tail === u.tailSegs[0], 'tail must be the first tail link');
u.tailSegs.forEach((seg, i) => {
  assert.ok(seg.parent === (i ? u.tailSegs[i - 1] : hound), `tail link ${i} must hang off the one before it`);
  assert.ok(Number.isFinite(seg.userData.baseZ) && Number.isFinite(seg.userData.baseY), `tail link ${i} needs its rest angles`);
});
assert.deepEqual(u.legChains.map((c) => [c.front, c.side]), [[true, 1], [true, -1], [false, 1], [false, -1]],
  'there must be a front and a rear leg on each side');
for (const c of u.legChains) {
  assert.ok(c.hip.parent === hound && c.knee.parent === c.hip && c.paw.parent === c.knee, `${c.hip.name} must be a hip -> knee -> paw chain`);
  assert.ok(c.upper.parent === c.hip && c.lower.parent === c.knee, `${c.hip.name}'s meshes must ride their joints`);
  assert.equal(-c.knee.position.y, c.upperLen, `${c.hip.name}'s upperLen must be the hip-to-knee length`);
  assert.equal(-c.paw.position.y, c.lowerLen, `${c.hip.name}'s lowerLen must be the knee-to-paw length`);
}
assert.deepEqual(u.legs.map((l) => l.mesh), u.legChains.flatMap((c) => [c.hip, c.knee]), 'legs must list each hip and its knee');
{
  const parts = [u.neck, u.head, u.jaw, ...u.tailSegs, ...u.legChains.flatMap((c) => [c.hip, c.knee, c.paw])];
  const pose = () => parts.map((o) => o.rotation.toArray().slice(0, 3).join());
  const rest = pose();
  applyHellhoundPose(hound, { state: ZSTATES.CHASE, phase: 1.3, groundY: 0 });
  const running = pose();
  parts.forEach((part, i) => assert.notEqual(running[i], rest[i], `applyHellhoundPose() must move ${part.name}`));
  assert.ok(u.jaw.position.y < u.jawRestY, 'the jaw must drop from where it rests');
  assert.ok(u.legChains.every((c) => typeof c.paw.userData.directorStance === 'boolean'), 'every paw must report whether it is planted');
  hound.updateMatrixWorld(true);
  const lowest = Math.min(...u.legChains.map((c) => c.paw.getWorldPosition(new THREE.Vector3()).y));
  assert.ok(lowest >= 0.01 - 1e-9, `the lowest paw must stand on the floor, not in it: it is at ${lowest}`);
}

// ---------------------------------------------------------------------------
// Every hound of a variant shares that variant's geometry.
// ---------------------------------------------------------------------------
{
  const [a, b] = [meshesOf(buildHellhound(2)), meshesOf(buildHellhound(2))];
  a.forEach((mesh, i) => {
    assert.ok(mesh !== b[i], 'every hound must get meshes of its own');
    assert.ok(mesh.geometry === b[i].geometry, `every hound of a variant must share one ${mesh.name} geometry`);
  });
  const torso = (variant) => buildHellhound(variant).userData.body.children.find((o) => o.isMesh).geometry;
  const [p0, p1] = [torso(0), torso(1)].map((g) => g.attributes.position.array);
  assert.ok(p0.length !== p1.length || p0.some((x, i) => x !== p1[i]), 'two variants must not build the same torso');
  assert.ok(torso(HOUND_VARIANTS) === torso(0) && torso(-1) === torso(HOUND_VARIANTS - 1), 'a variant number must wrap');
}

// ---------------------------------------------------------------------------
// setHellhoundLOD() tiers the shadows and the tail by squared distance.
// ---------------------------------------------------------------------------
{
  const model = buildHellhound(1);
  const { body, tailSegs, neck } = model.userData;
  const torso = new Set(meshesOf(body));
  /** Which meshes cast shadows ('all', 'torso' or 'none'), and which tail links show. */
  const tier = () => {
    const cast = meshesOf(model).filter((m) => m.castShadow);
    const which = cast.length === 19 ? 'all' : !cast.length ? 'none'
      : cast.length === torso.size && cast.every((m) => torso.has(m)) ? 'torso' : `${cast.length} meshes`;
    return [which, tailSegs.map((s) => s.visible)];
  };
  const seen = [0, 329, 330, 1999, 2000, 0].map((d2) => { setHellhoundLOD(model, d2); return [d2, ...tier()]; });
  assert.deepEqual(seen, [
    [0, 'all', [true, true, true]],
    [329, 'all', [true, true, true]],
    [330, 'torso', [true, true, true]],
    [1999, 'torso', [true, true, true]],
    [2000, 'none', [true, false, false]],
    [0, 'all', [true, true, true]],
  ], 'the LOD tiers must change at 330 and 2000, and come back close up');
  const neckMesh = neck.children.find((o) => o.isMesh);
  neckMesh.castShadow = false;
  setHellhoundLOD(model, 100);
  assert.equal(neckMesh.castShadow, false, 'a call in the same tier must not walk the model again: it runs for every hound every frame');
}

console.log('Hellhound model OK: the materials are built once and match the slots; pack, spike, ribbon and placed build their shapes; '
  + 'a hound is 19 meshes on 20 groups with a material per group; the rig carries the neck, head, jaw, tail and leg chains, '
  + 'and a pose moves every part and plants the paws; hounds of a variant share its geometry; the LOD tiers change at 330 and 2000.');
