// Every weapon must be ONE solid object. No floating pieces.
//
// The bug this was written for: the Thompson's vertical foregrip — a wooden
// column plus five finger-groove rings — hung 22mm below the receiver with
// nothing joining it, and the rings were built in the wrong plane so they
// stood off it as separate slabs. On the asset-archive page, which presents
// the weapon alone against a flat background, that read as seven red-brown
// blocks floating in mid-air. It shipped because nothing ever checked that a
// weapon's parts actually touch each other.
//
// Nineteen other weapons had the same class of defect: front sights with no
// boss down to the barrel, bipods clamped to nothing, magazine floorplates and
// spine ribs positioned in the magazine's UNCURVED local space so they slid
// off the bottom of every banana mag, barrel groups that never reached their
// receiver.
//
// The check is purely geometric and needs no renderer: build every weapon,
// take the world-space AABB of every mesh, and union-find them together when
// they are within TOUCH metres of each other. A correct weapon collapses to a
// single component. Anything else is a part hanging in space.
//
// The headless Three.js harness — vendored-module resolution plus a canvas stub
// for the procedural material library — lives in lib/headless-three.mjs, and
// the surface-contact test in lib/mesh-contact.mjs.
import assert from 'node:assert';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { gap, meshData, touches } from './lib/mesh-contact.mjs';

const {
  WEAPONS, buildViewmodel, buildDisplayWeapon, buildPapDisplayWeapon, buildMonkey,
} = await loadGameModule('weapons.js');

/** Group meshes into islands of mutually touching parts. */
function islands(entries) {
  const n = entries.length;
  const parent = [...Array(n).keys()];
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      if (!touches(entries[i], entries[j])) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/** Name of the registered part a mesh belongs to, for a useful failure message. */
function partOf(mesh, parts) {
  for (let o = mesh; o; o = o.parent) {
    for (const key in parts) if (parts[key] === o) return key;
  }
  return '(unregistered)';
}

/** Describe an island's detachment, or null when the model is solid. */
function detachmentReport(node, parts, label) {
  const entries = meshData(node);
  if (entries.length === 0) return `${label}: built nothing`;
  const groups = islands(entries);
  if (groups.length === 1) return null;
  const lines = [`${label}: ${groups.length} disconnected pieces (must be 1)`];
  groups.slice(1).forEach((g) => {
    let nearest = Infinity;
    let nearestName = '?';
    for (const i of g) {
      for (let j = 0; j < entries.length; j++) {
        if (g.includes(j)) continue;
        const d = gap(entries[i].box, entries[j].box);
        if (d < nearest) { nearest = d; nearestName = partOf(entries[j].mesh, parts); }
      }
    }
    const names = [...new Set(g.map((i) => partOf(entries[i].mesh, parts)))].join(', ');
    const c = new THREE.Box3();
    for (const i of g) c.union(entries[i].box);
    const ctr = c.getCenter(new THREE.Vector3());
    lines.push(`    floating: [${names}] — ${(nearest * 1000).toFixed(1)}mm of air to '${nearestName}'`
      + ` at (${ctr.x.toFixed(3)}, ${ctr.y.toFixed(3)}, ${ctr.z.toFixed(3)})`);
    // WEAPON_MODEL_DEBUG=1 prints the exact box of every offending mesh, which
    // is what you actually need to work out where to move it to.
    if (process.env.WEAPON_MODEL_DEBUG) {
      for (const i of g) {
        const b = entries[i].box;
        lines.push(`        ${partOf(entries[i].mesh, parts)} x[${b.min.x.toFixed(4)},${b.max.x.toFixed(4)}]`
          + ` y[${b.min.y.toFixed(4)},${b.max.y.toFixed(4)}] z[${b.min.z.toFixed(4)},${b.max.z.toFixed(4)}]`);
      }
    }
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 1. Every weapon is one solid object, stock and Pack-a-Punched
// ---------------------------------------------------------------------------
const failures = [];
const ids = Object.keys(WEAPONS);
assert.ok(ids.length > 20, 'the weapon roster should not be nearly empty');

for (const id of ids) {
  for (const pap of [false, true]) {
    const root3 = buildViewmodel(id, pap);
    const view = root3.userData.viewNode;
    assert.ok(view, `${id}: buildViewmodel must expose userData.viewNode`);
    const report = detachmentReport(view, root3.userData.parts || {}, `${id}${pap ? ' (PaP)' : ''}`);
    if (report) failures.push(report);
  }
}

// The melee/utility models go through the same builders and get the same rule.
{
  const monkey = buildMonkey();
  const report = detachmentReport(monkey, {}, 'monkey bomb');
  if (report) failures.push(report);
}

// ---------------------------------------------------------------------------
// 2. World displays present the weapon ALONE — no gloves, no sleeve
// ---------------------------------------------------------------------------
//
// buildViewmodel() keeps the hands in a detached container that only
// WeaponRig.equip() re-attaches. If a display builder ever ends up with them,
// the mystery box grows a pair of disembodied hands.
function handMeshCount(node) {
  let n = 0;
  node.traverse((o) => { if (o.isMesh && o.userData?.isGlove) n++; });
  return n;
}
for (const id of ids.slice(0, 6)) {
  for (const build of [() => buildDisplayWeapon(id), () => buildPapDisplayWeapon(id)]) {
    const g = build();
    assert.strictEqual(handMeshCount(g), 0, `${id}: world display must not contain glove meshes`);
    assert.strictEqual(g.userData.handsGroup, null, `${id}: world display must drop the hands container`);
  }
}

// A first-person view-model, by contrast, keeps its gloves in the detached
// container — never inside the weapon tree, where a world display would have to
// hunt them back out.
let gloved = 0;
for (const id of ids) {
  const g = buildViewmodel(id, false);
  const hands = g.userData.handsGroup;
  const parts = g.userData.parts || {};
  assert.ok(hands, `${id}: buildViewmodel must hand back a hands container`);
  assert.strictEqual(handMeshCount(g.userData.viewNode), 0,
    `${id}: gloves must not be inside the weapon tree`);
  for (const key of ['hand_l', 'hand_r']) {
    if (!parts[key]) continue;
    gloved++;
    assert.strictEqual(parts[key].parent, hands,
      `${id}: parts.${key} must be parented to the hands container`);
    assert.ok(handMeshCount(parts[key]) > 0, `${id}: parts.${key} must contain glove meshes`);
  }
}
assert.ok(gloved > 40, 'most weapons should still be held by a pair of gloved hands');

// ---------------------------------------------------------------------------
// 3. Nothing but a glove may be hidden by a "hands off" filter
// ---------------------------------------------------------------------------
//
// The asset archive used to hide every part whose NAME started with "hand",
// which silently deleted `handguard` and `handle` — the wooden forend and the
// carry handle — from fifteen weapons. Hands are identified by the glove flag,
// never by a name prefix, and this asserts the parts registry still contains
// names that a prefix test would eat, so the shortcut cannot creep back in
// unnoticed.
{
  const g = buildViewmodel('m1garand', false);
  const parts = g.userData.parts;
  assert.ok(parts.handguard, 'm1garand should still have a handguard part');
  assert.ok(handMeshCount(parts.hand_l) > 0 && handMeshCount(parts.hand_r) > 0,
    'gloves must be flagged with userData.isGlove so they can be found by kind, not by name');
  assert.strictEqual(handMeshCount(parts.handguard), 0,
    'a handguard is furniture, not flesh — it must never be flagged as a glove');
}

if (failures.length) {
  console.error(`\n${failures.length} weapon model(s) have parts floating in mid-air:\n`);
  console.error(failures.join('\n'));
  console.error('');
  throw new Error(`${failures.length} weapon model(s) have detached parts`);
}

console.log(`weapon models OK — ${ids.length} weapons, every part connected`);
