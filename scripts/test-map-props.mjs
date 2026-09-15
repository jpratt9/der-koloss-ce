// The prop dressing, built headless: what the map gets from js/map-props.js and
// js/map-props/ beyond the colliders and bullet cover the map validators check.
//
// - Every piece the dressing hands the shot cover is drawn. Each bucket merges
//   into one props_* mesh, on the map's own material where it passes one, and
//   propTris counts those triangles. decorateMap skips a merge that fails
//   without a word, so one piece built unlike the rest (without an index, say)
//   would hide its whole material.
// - Each practical (wall lamp, emergency dome, fluorescent) puts its point
//   light and its bulb in the map, and update() drives it from the power. With
//   the mains dead, lamps and fluorescents settle at their dim level and the
//   emergency domes at their bright one; with power, the other way round. A
//   flicker only ever dims a light, and each bulb glows with its light. The
//   machines' gauge panels pulse either way.
// - placeDressing() keeps the lamps, fluorescents, ducts, cables and chains out
//   of every walkway's headroom, and places the same props on every build. The
//   overhead props register no collider, so the map's clearance audits can't
//   see them.
// - The generator stands on the first anchor the keep-clear test accepts, and
//   is dropped when it accepts none. It was once built through Teleporter A.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';

const { decorateMap } = await loadGameModule('map-props.js');
const { makePropBuilders } = await loadGameModule('map-props', 'builders.js');
const { placeDressing } = await loadGameModule('map-props', 'placement.js');
const { MAP_WALKWAYS } = await loadGameModule('map-layout.js');
const { mulberry32 } = await loadGameModule('props', 'materials.js');

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// The dressing on a bare map: with no walls to hug and nothing to keep clear,
// every room gets its full count of props.
const mat = () => new THREE.MeshStandardMaterial();
const ctx = {
  materials: { metal: mat(), wood: mat(), plate: mat(), concrete: mat(), dark: mat(), brick: mat() },
  colliders: [], shotPieces: [], wallColliders: [], keepClear: [],
};
const group = new THREE.Group();
const props = decorateMap(group, ctx);

// ---------------------------------------------------------------------------
// Every piece handed to the shot cover is drawn.
// ---------------------------------------------------------------------------
{
  const merged = group.children.filter((o) => o.isMesh && o.name.startsWith('props_'));
  assert.ok(ctx.shotPieces.length > 0 && merged.length > 0, 'the dressing must place props');
  assert.equal(props.propTris, ctx.shotPieces.reduce((n, p) => n + tris(p.geometry), 0),
    'every piece handed to the shot cover must be drawn: a bucket whose merge fails drops out silently');
  assert.equal(merged.reduce((n, m) => n + tris(m.geometry), 0), props.propTris, 'propTris must count the merged meshes');
  assert.equal(new Set(merged.map((m) => m.name)).size, merged.length, 'each bucket must merge into one mesh');
  for (const m of merged) {
    const key = m.name.slice('props_'.length);
    if (ctx.materials[key]) assert.ok(m.material === ctx.materials[key], `${m.name} must be drawn with the map's own ${key} material`);
    assert.ok(m.castShadow && m.receiveShadow, `${m.name} must cast and receive shadows`);
  }
  assert.ok(ctx.colliders.length > 0 && ctx.colliders.every((c) => c.prop), 'every collider the dressing registers must be marked as a prop');
}

// ---------------------------------------------------------------------------
// The practical lights follow the power.
// ---------------------------------------------------------------------------
{
  const { lights } = props;
  for (const l of lights) {
    assert.ok(l.light.isPointLight && l.light.parent === group,
      'each practical must put its point light in the map, where the volumetric pass collects it');
    assert.ok(l.bulb.isMesh && l.bulb.parent === group && l.bulb.material === l.mat, 'each practical must put its bulb in the map');
    if (l.emergency) assert.ok(l.off > l.on && !l.flicker, 'an emergency dome must be steady, and brighter with the mains dead');
    else assert.ok(l.on > l.off, 'a lamp or fluorescent must be brighter with power than without');
    if (l.fluoro) assert.equal(l.off, 0, 'a fluorescent must be dark without power');
  }
  assert.ok(lights.some((l) => l.emergency) && lights.some((l) => l.fluoro) && lights.some((l) => !l.emergency && !l.fluoro),
    'the dressing must place wall lamps, emergency domes and fluorescents');

  const bulbs = new Set(lights.map((l) => l.bulb));
  const gauges = group.children.filter((o) => o.isMesh && !bulbs.has(o) && !o.name.startsWith('props_'));
  assert.ok(gauges.length > 0, 'the machines must carry gauge panels');

  /** Two seconds of update() to settle, then two seconds recorded: each light's range and glow, each gauge's values. */
  function run(powerOn) {
    for (let f = 0; f < 120; f++) props.update(1 / 60, 0, powerOn);
    const range = lights.map(() => ({ min: Infinity, max: -Infinity }));
    const gaugeValues = gauges.map(() => new Set());
    for (let f = 0; f < 120; f++) {
      props.update(1 / 60, 0, powerOn);
      lights.forEach((l, i) => {
        range[i].min = Math.min(range[i].min, l.light.intensity);
        range[i].max = Math.max(range[i].max, l.light.intensity);
      });
      gauges.forEach((g, i) => gaugeValues[i].add(g.material.emissiveIntensity));
    }
    return { range, glow: lights.map((l) => l.mat.emissiveIntensity), gaugeValues };
  }
  const dark = run(false);
  const lit = run(true);
  lights.forEach((l, i) => {
    for (const [state, level] of [[dark, l.off], [lit, l.on]]) {
      assert.ok(state.range[i].max <= level + 1e-6, 'a flicker must only ever dim a light');
      if (!l.flicker) assert.ok(level - state.range[i].min < 1e-3, 'a steady light must settle at its level');
    }
    if (!l.flicker) {
      assert.ok(l.emergency ? dark.glow[i] > lit.glow[i] : lit.glow[i] > dark.glow[i], 'a bulb must glow brighter when its light is brighter');
    }
  });
  assert.ok(lights.some((l, i) => l.flicker && lit.range[i].min < l.on * 0.9), 'a flickering light must visibly flicker');
  for (const state of [dark, lit]) assert.ok(state.gaugeValues.every((v) => v.size > 1), 'every gauge panel must pulse, with or without power');
}

// ---------------------------------------------------------------------------
// The placement, with every builder and test faked.
// ---------------------------------------------------------------------------
const { DRUM_HOOP_R } = makePropBuilders({});

/** Run placeDressing() on the dressing's seeded stream. Returns every call it made to a builder or test, in order. */
function recordPlacement(isClear = () => true) {
  const rnd = mulberry32(0x5EED17);
  const R = (a = 1, b) => (b === undefined ? rnd() * a : a + rnd() * (b - a));
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const calls = [];
  const fake = (name, answer = () => undefined) => (...args) => {
    calls.push({ name, args });
    return answer(...args);
  };
  const builders = Object.fromEntries(['crate', 'drum', 'pallet', 'sandbags', 'rubble', 'pipeRun', 'cable', 'chain', 'ibeam',
    'duct', 'wallLamp', 'emergencyLight', 'fluorescent', 'machine', 'workbench', 'spool', 'drain'].map((name) => [name, fake(name)]));
  placeDressing({
    R, RI, rnd, place: fake('place'), G: {},
    isClear: fake('isClear', isClear), againstWall: () => true, propFree: () => true, solid: fake('solid'),
    DRUM_HOOP_R, ...builders,
  });
  return calls;
}

// ---------------------------------------------------------------------------
// Overhead dressing stays out of every walkway's headroom.
// ---------------------------------------------------------------------------
{
  const inHeadroom = (x, z, y, pad) => MAP_WALKWAYS.some((w) => y > w.floorY + 0.02 && y < w.clearTop
    && x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad);
  const runInHeadroom = (ax, az, bx, bz, y, pad) => {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let i = 0; i <= steps; i++) if (inHeadroom(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, y, pad)) return true;
    return false;
  };
  const calls = recordPlacement();
  const clear = {
    wallLamp: ([x, y, z]) => !inHeadroom(x, z, y, 0.2),
    fluorescent: ([x, y, z]) => !inHeadroom(x, z, y, 0.2),
    duct: ([x, y, z, len]) => !runInHeadroom(x, z - len / 2, x, z + len / 2, y, 0.35),
    cable: ([x1, y1, z1, x2, , z2, sag]) => !runInHeadroom(x1, z1, x2, z2, y1 - sag, 0.35),
    chain: ([x, top, z, len]) => !inHeadroom(x, z, top, 0.35) && !inHeadroom(x, z, top - len, 0.35),
  };
  for (const [name, isClearOf] of Object.entries(clear)) {
    const placed = calls.filter((c) => c.name === name).map((c) => c.args);
    assert.ok(placed.length > 0, `the dressing must place a ${name}`);
    assert.deepEqual(placed.filter((args) => !isClearOf(args)), [], `no ${name} may hang in a walkway's headroom`);
  }
  assert.equal(JSON.stringify(recordPlacement()), JSON.stringify(calls), 'the placement must be the same on every build');
}

// ---------------------------------------------------------------------------
// The generator stands only where the keep-clear test allows.
// ---------------------------------------------------------------------------
{
  const ANCHOR_RADIUS = 1.8;   // the keep-clear radius the generator tests its anchors with
  // The generator is the one machine built 2.6m wide; the rooms' machines are at most 1.9.
  const generators = (calls) => calls.filter((c) => c.name === 'machine' && c.args[4] === 2.6).map((c) => c.args.slice(0, 3));
  const rejectAll = recordPlacement((x, z, r) => r !== ANCHOR_RADIUS);
  const anchors = rejectAll.filter((c) => c.name === 'isClear' && c.args[2] === ANCHOR_RADIUS).map((c) => c.args);
  assert.ok(anchors.length > 1, 'the generator must have more than one anchor to try');
  assert.deepEqual(generators(rejectAll), [], 'with no clear anchor, the generator must be dropped');
  assert.deepEqual(generators(recordPlacement()), [[anchors[0][0], 0, anchors[0][1]]], 'with every anchor clear, it must take the first');
  const [, [sx, sz]] = anchors;
  assert.deepEqual(generators(recordPlacement((x, z, r) => r !== ANCHOR_RADIUS || (x === sx && z === sz))), [[sx, 0, sz]],
    'the generator must stand on the first anchor that is clear');
}

console.log(`map props OK: ${ctx.shotPieces.length} pieces all drawn in ${props.propTris} triangles; `
  + `${props.lights.length} practicals follow the power (a flicker only dims, emergency domes brighten when it fails) and gauges pulse; `
  + 'lamps, fluorescents, ducts, cables and chains stay out of walkway headroom, the same on every build; '
  + 'the generator takes the first clear anchor, or none');
