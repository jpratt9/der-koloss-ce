// Behaviour pins for the frame-rate fixes.
//
// Every change here was a cost with no visible result: garbage from tuple
// arrays in the slab test that every pellet and every prompt sight line runs
// against ~310 colliders, a prompt re-parsed every frame, a layout flush per
// pellet, a second walk of the scene graph per frame, shaders compiled on the
// frame an enemy first appears, and a resolution controller that could never
// act on an ordinary pixel-ratio-1 monitor. The rewrites had to keep every
// answer identical, so this file checks answers, not source text — the text
// pins live in validate-performance-invariants.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import './lib/headless-map.mjs';
import { readMainSource } from './lib/game-source.mjs';

const { segmentHitsBox } = await loadGameModule('collision.js');
const { interactionLineClear } = await loadGameModule('interaction-rules.js');
const { HUD } = await loadGameModule('hud.js');
const { Game } = await loadGameModule('game.js');
const { ZSTATES } = await loadGameModule('zombies.js');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sameNumber = (a, b) => Object.is(a, b) || (a === b);

// ---------------------------------------------------------------------------
// segmentHitsBox: the same answer as the tuple version it replaced
// ---------------------------------------------------------------------------
// This is the original algorithm, kept as the spec. The shipped function had to
// stop allocating, not change a single result — including the degenerate
// axis-parallel and non-finite cases a bad wire value can produce.
function referenceSegmentHitsBox(x0, z0, x1, z1, b) {
  let tmin = 0, tmax = 1;
  const axes = [[x0, x1 - x0, b.minX, b.maxX], [z0, z1 - z0, b.minZ, b.maxZ]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; continue; }
    let t1 = (mn - o) / d, t2 = (mx - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

const unit = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
assert.equal(segmentHitsBox(-3, 0, 3, 0, unit), 1 / 3, 'a segment crossing the box enters a third of the way along');
assert.equal(segmentHitsBox(-3, 2, 3, 2, unit), -1, 'a segment passing beside the box misses');
assert.equal(segmentHitsBox(0, 0, 3, 0, unit), 0, 'a segment starting inside the box hits at t = 0');
assert.equal(segmentHitsBox(-3, 0, -2, 0, unit), -1, 'a segment stopping short of the box misses');
assert.equal(segmentHitsBox(0.5, -3, 0.5, 3, unit), 1 / 3, 'an axis-parallel segment through the box hits');
assert.equal(segmentHitsBox(1.5, -3, 1.5, 3, unit), -1, 'an axis-parallel segment outside the box misses');

{
  const rnd = mulberry32(0x5E6B0C5);
  const coord = () => {
    const r = rnd();
    if (r < 0.03) return NaN;
    if (r < 0.08) return 0;
    return (rnd() - 0.5) * 40;
  };
  for (let i = 0; i < 100000; i++) {
    const x0 = coord(), z0 = coord();
    const x1 = rnd() < 0.1 ? x0 : coord();
    const z1 = rnd() < 0.1 ? z0 : coord();
    const cx = (rnd() - 0.5) * 30, cz = (rnd() - 0.5) * 30;
    const b = { minX: cx - rnd() * 3, maxX: cx + rnd() * 3, minZ: cz - rnd() * 3, maxZ: cz + rnd() * 3 };
    const want = referenceSegmentHitsBox(x0, z0, x1, z1, b);
    const got = segmentHitsBox(x0, z0, x1, z1, b);
    assert.ok(sameNumber(got, want),
      `segmentHitsBox(${x0}, ${z0}, ${x1}, ${z1}, ${JSON.stringify(b)}) = ${got}, reference ${want}`);
  }
}

// ---------------------------------------------------------------------------
// interactionLineClear: same verdicts on the shared slab test
// ---------------------------------------------------------------------------
function referenceLineClear(origin, target, colliders, endpointTolerance = 0.9) {
  if (!origin || !target || !Array.isArray(colliders)) return false;
  if (![origin.x, origin.y, origin.z, target.x, target.y, target.z].every(Number.isFinite)) return false;
  for (const c of colliders) {
    if (c.noRaycast) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    if (c.prop && Math.hypot(cx - target.x, cz - target.z) < 1.35) continue;
    const t = referenceSegmentHitsBox(origin.x, origin.z, target.x, target.z, c);
    if (t < 0 || t >= endpointTolerance) continue;
    const yAt = origin.y + (target.y - origin.y) * t;
    const y0 = c.y0 || 0;
    if (yAt >= y0 && yAt <= y0 + (c.h || 3)) return false;
  }
  return true;
}

{
  const rnd = mulberry32(0x1A2B3C4D);
  const colliders = Array.from({ length: 300 }, () => {
    const cx = (rnd() - 0.5) * 60, cz = (rnd() - 0.5) * 60;
    return {
      minX: cx - rnd() * 2, maxX: cx + rnd() * 2, minZ: cz - rnd() * 2, maxZ: cz + rnd() * 2,
      y0: rnd() < 0.5 ? undefined : rnd() * 3, h: rnd() < 0.5 ? undefined : rnd() * 4,
      prop: rnd() < 0.3, noRaycast: rnd() < 0.1,
    };
  });
  const coord = () => (rnd() < 0.02 ? NaN : (rnd() - 0.5) * 60);
  let blocked = 0;
  for (let i = 0; i < 5000; i++) {
    const origin = { x: coord(), y: rnd() * 3, z: coord() };
    const target = { x: coord(), y: rnd() * 3, z: coord() };
    const tolerance = rnd() < 0.5 ? 0.9 : rnd();
    const want = referenceLineClear(origin, target, colliders, tolerance);
    assert.equal(interactionLineClear(origin, target, colliders, tolerance), want,
      `interactionLineClear disagrees with the reference for ${JSON.stringify({ origin, target, tolerance })}`);
    if (!want) blocked++;
  }
  assert.ok(blocked > 500 && blocked < 4500, `the sample must exercise both verdicts (blocked ${blocked}/5000)`);
}

// ---------------------------------------------------------------------------
// HUD: no DOM work for values that did not change, one layout flush per burst
// ---------------------------------------------------------------------------
let layoutFlushes = 0;
function fakeElement() {
  const classes = new Set();
  const el = {
    dataset: {},
    textContent: '',
    style: { setProperty() {} },
    writes: { html: 0, width: 0 },
    classList: {
      add: (c) => { classes.add(c); },
      remove: (c) => { classes.delete(c); },
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute() {}, replaceChildren() {}, appendChild() {}, append() {},
    querySelector: () => null,
  };
  let html = '', width = '';
  Object.defineProperty(el, 'innerHTML', { get: () => html, set: (v) => { html = v; el.writes.html++; } });
  Object.defineProperty(el.style, 'width', { get: () => width, set: (v) => { width = v; el.writes.width++; } });
  Object.defineProperty(el, 'offsetWidth', { get: () => { layoutFlushes++; return 0; } });
  return el;
}
const elements = new Map();
document.getElementById = (id) => {
  if (!elements.has(id)) elements.set(id, fakeElement());
  return elements.get(id);
};
document.querySelector = () => fakeElement();
const endOfTask = () => new Promise((resolve) => setTimeout(resolve, 0));

{
  const hud = new HUD();
  const prompt = document.getElementById('prompt');
  const bar = document.getElementById('prompt-bar-fill');
  const text = 'Hold <b>F</b> — use teleporter';
  for (let frame = 0; frame < 120; frame++) hud.prompt(text, 0);
  assert.equal(prompt.writes.html, 1, 'a prompt shown for 120 frames must be parsed once, not every frame');
  assert.equal(bar.writes.width, 1, 'an idle hold bar must not be rewritten every frame');
  hud.prompt(text, 0.5);
  assert.equal(bar.writes.width, 2, 'a hold bar that moved must still update');
  hud.prompt(null);
  assert.ok(prompt.classList.contains('hidden'), 'no prompt hides the element');
  hud.prompt(text, 0.5);
  assert.ok(!prompt.classList.contains('hidden'), 'showing the same prompt again must unhide it');
  assert.equal(prompt.innerHTML, text, 'the cached prompt must still be the markup on screen');
  hud.prompt('Press <b>F</b> — buy ammo');
  assert.equal(prompt.writes.html, 2, 'a different prompt must be written');

  // One shotgun blast into a crowd: points are awarded once per pellet.
  const points = document.getElementById('points');
  const chip = document.getElementById('points-delta');
  hud.setPoints(500);
  layoutFlushes = 0;
  for (let pellet = 1; pellet <= 8; pellet++) hud.setPoints(500 + pellet * 10, true);
  assert.equal(layoutFlushes, 0, 'animation restarts must wait for the end of the task');
  await endOfTask();
  assert.equal(layoutFlushes, 1, 'eight point awards in one frame must force one layout flush, not sixteen');
  assert.ok(points.classList.contains('flash'), 'the points flash must still replay');
  assert.ok(chip.classList.contains('pop'), 'the delta chip must still replay');
  assert.equal(points.textContent, 580, 'the total shown is the last award');
  assert.equal(chip.textContent, '+10', 'the chip shows the last delta, as before');
  clearTimeout(hud._deltaT);

  // Emptying a magazine: the tick replays on a freshly built .mag every shot.
  const ammo = document.getElementById('ammo');
  hud.setAmmo(8, 32, 'M1911');
  layoutFlushes = 0;
  for (let mag = 7; mag >= 0; mag--) hud.setAmmo(mag, 32, 'M1911');
  await endOfTask();
  assert.equal(layoutFlushes, 0, 'firing must not force a layout flush per shot');
  assert.ok(ammo.classList.contains('tick'), 'the ammo tick must be applied');
  assert.match(ammo.innerHTML, /<span class="mag">0<\/span>/, 'the magazine count is still rebuilt');

  // The FPS counter reports once a second and writes only when the number moves.
  const fps = document.getElementById('fps-counter');
  let fpsWrites = 0;
  Object.defineProperty(fps, 'textContent', { get: () => '', set: () => { fpsWrites++; } });
  for (const value of [60, 60, 60, 59, 59, 60]) hud.setFps(value);
  assert.equal(fpsWrites, 3, 'the FPS counter must only touch the DOM when the displayed number changes');
  hud.showFps(true);
  assert.ok(!fps.classList.contains('hidden'), 'turning the pause-menu option on shows the counter');
  hud.showFps(false);
  assert.ok(fps.classList.contains('hidden'), 'turning it off hides the counter');
}

// ---------------------------------------------------------------------------
// FPS counter: frames drawn per second, not 1/dt, and only rendered frames
// ---------------------------------------------------------------------------
{
  const reported = [];
  const g = Object.create(Game.prototype);
  g.hud = { setFps: (n) => reported.push(n) };
  let now = 10;
  for (let i = 0; i < 3 * 60; i++) { g._countFrame(now); now += 1 / 60; }
  assert.deepEqual(reported, [60, 60], `a steady 60fps must read 60, not 61 (got ${reported})`);
  reported.length = 0;
  g._fpsSince = null;
  for (let i = 0; i < 1.5 * 144; i++) { g._countFrame(now); now += 1 / 144; }
  assert.deepEqual(reported, [144], `a 144Hz display must read 144 (got ${reported})`);
}

// ---------------------------------------------------------------------------
// FPS option wiring: one setting, two controls, off by default
// ---------------------------------------------------------------------------
// main.js boots the whole page as soon as it is imported, so its wiring is
// pinned as text.
{
  const [indexHtml, mainSrc] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readMainSource(),
  ]);
  assert.match(indexHtml, /<div id="fps-counter" class="hidden"/, 'the counter must start hidden');
  assert.match(indexHtml, /<button id="btn-pause-fps" class="mbtn">/, 'the pause menu must carry the FPS toggle');
  const video = indexHtml.slice(indexHtml.indexOf('<span>VIDEO</span>'), indexHtml.indexOf('<span>AUDIO</span>'));
  assert.match(video, /<input id="opt-fps" type="checkbox" \/>/, 'Options > Video must carry the FPS toggle');
  assert.match(mainSrc, /showFps: false/, 'the counter must be off by default');
  assert.match(mainSrc, /\$\('opt-fps'\)\.addEventListener\('change', \(e\) => setShowFps\(e\.target\.checked\)\);/,
    'the Options toggle must go through setShowFps');
  assert.match(mainSrc, /\$\('btn-pause-fps'\)\.addEventListener\('click', \(\) => \{ audio\.play\('ui'\); setShowFps\(!options\.showFps\); \}\);/,
    'the pause-menu button must go through setShowFps');
  const setter = mainSrc.slice(mainSrc.indexOf('function setShowFps('), mainSrc.indexOf('function syncFpsControls('));
  assert.ok(setter.length > 0, 'setShowFps must exist ahead of syncFpsControls');
  assert.doesNotMatch(setter, /applyOptions\(\)/,
    'toggling the counter must not re-apply quality, which rebuilds the post stack mid-match');
  assert.match(setter, /saveOptions\(options\);[\s\S]*app\.hud\.showFps\(options\.showFps\);[\s\S]*syncFpsControls\(\);/,
    'the setting must persist, show or hide the counter, and update both controls');
}

// ---------------------------------------------------------------------------
// Dynamic resolution: rescues a pixel-ratio-1 display, and comes back cleanly
// ---------------------------------------------------------------------------
function scaler(qualityRatio, startRatio = qualityRatio) {
  const ratios = [];
  const postRatios = [];
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    renderer: { setPixelRatio: (pr) => ratios.push(pr), setSize() {} },
    postfx: { setSize: (w, h, pr) => postRatios.push(pr) },
    fx: { setViewportHeight() {} },
    canvas: { clientWidth: 1920, clientHeight: 1080 },
    _qualityPixelRatio: qualityRatio,
    _dynamicPixelRatio: startRatio,
  });
  let now = 0;
  const run = (frameSeconds, seconds) => {
    for (let t = 0; t < seconds; t += frameSeconds) {
      now += frameSeconds;
      g._tuneRenderScale(frameSeconds, now);
    }
  };
  return { g, ratios, postRatios, run };
}

{
  // 25fps on an ordinary monitor. The old floor of 1 left this untouched.
  const s = scaler(1);
  s.run(1 / 25, 60);
  assert.ok(s.ratios.length > 0, 'a pixel-ratio-1 display stuck at 25fps must get its resolution lowered');
  assert.equal(s.ratios[0], 0.75, 'far under 30fps the controller takes the bigger first step');
  assert.equal(Math.min(...s.ratios), 0.5, 'it keeps stepping down to the floor while still over budget');
  assert.ok(s.ratios.every((r) => r >= 0.5), 'it never drops below the floor');
  assert.deepEqual(s.postRatios, s.ratios, 'the post stack is resized with every change');
}
{
  // Just under budget (40fps): the gentle step.
  const s = scaler(1);
  s.run(1 / 40, 6);
  assert.ok(Math.abs(s.ratios[0] - 0.85) < 1e-9, `between 30 and 46fps the step is 0.15 (got ${s.ratios[0]})`);
}
{
  // A machine holding 60fps inside the neutral band is left alone.
  const s = scaler(1.5);
  s.run(1 / 60, 60);
  assert.equal(s.ratios.length, 0, 'a steady 60fps must never trigger a resolution change');
}
{
  // Headroom returns: climb from the floor and land EXACTLY on native, never on
  // 0.9999999999999999, which would be a 1919px canvas stretched to 1920.
  const s = scaler(1, 0.5);
  s.run(1 / 120, 180);
  assert.equal(s.g._dynamicPixelRatio, 1, `the climb must finish exactly at the quality ceiling (got ${s.g._dynamicPixelRatio})`);
  assert.ok(s.ratios.every((r) => r <= 1), 'the climb never overshoots the ceiling');
}

// ---------------------------------------------------------------------------
// zombieHitTest: shared sphere tables, unchanged hits
// ---------------------------------------------------------------------------
{
  const zombies = new Map();
  const add = (id, props) => zombies.set(id, { id, x: 0, y: 0, z: 0, state: ZSTATES.CHASE, dog: false, crawler: false, ...props });
  add(1, { z: -10 });
  add(2, { z: -4 });
  add(3, { z: -6, crawler: true });
  add(4, { z: -2, state: ZSTATES.DIE });
  const g = Object.create(Game.prototype);
  g.zombies = { zombies };
  const forward = new THREE.Vector3(0, 0, -1);

  const eyeLevel = g.zombieHitTest(new THREE.Vector3(0, 1.5, 0), forward, 100);
  assert.deepEqual(eyeLevel.map((h) => [h.z.id, h.head]), [[2, true], [1, true]],
    'at head height the standing zombies take head hits nearest first, and the crawler and the corpse are missed');
  assert.equal(eyeLevel[0].dist, 4, 'hit distance is along the ray to the sphere centre');

  const chest = g.zombieHitTest(new THREE.Vector3(0, 1.05, 0), forward, 100);
  assert.deepEqual(chest.map((h) => [h.z.id, h.head]), [[2, false], [1, false]], 'chest height takes body hits');

  const low = g.zombieHitTest(new THREE.Vector3(0, 0.45, 0), forward, 100);
  assert.deepEqual(low.map((h) => [h.z.id, h.head]), [[2, false], [3, true], [1, false]],
    'at crawler head height the crawler takes a head hit and the standing zombies take leg hits');

  const blocked = g.zombieHitTest(new THREE.Vector3(0, 1.5, 0), forward, 5);
  assert.deepEqual(blocked.map((h) => h.z.id), [2], 'a wall at 5m stops the ray before the far zombie');
}

// ---------------------------------------------------------------------------
// renderViewmodel: no second walk of the scene graph, and the flag always returns
// ---------------------------------------------------------------------------
{
  const g = Object.create(Game.prototype);
  const scene = new THREE.Scene();
  let autoDuringDraw = null;
  Object.assign(g, {
    scene,
    camera: new THREE.PerspectiveCamera(),
    viewCamera: new THREE.PerspectiveCamera(75, 1, 0.012, 8),
    player: { adsT: 0 },
    weaponRig: { root: new THREE.Group(), rigHidden: false },
    renderer: { setRenderTarget() {}, clearDepth() {}, render: (s) => { autoDuringDraw = s.matrixWorldAutoUpdate; } },
  });
  g.renderViewmodel(null);
  assert.equal(autoDuringDraw, false, 'the viewmodel draw must not re-walk the graph the world pass just updated');
  assert.equal(scene.matrixWorldAutoUpdate, true, 'the scene must be handed back with automatic updates on');
  g.renderer.render = () => { throw new Error('draw failed'); };
  assert.throws(() => g.renderViewmodel(null), /draw failed/);
  assert.equal(scene.matrixWorldAutoUpdate, true, 'a failed draw must not leave the whole scene frozen');
}

// ---------------------------------------------------------------------------
// _prewarmShaders: compiles against the HDR target, leaves nothing behind
// ---------------------------------------------------------------------------
{
  const g = Object.create(Game.prototype);
  const hdrTarget = { name: 'sceneRT' };
  const bound = [];
  let compiledAgainst, sceneObjectsWhileCompiling = 0;
  Object.assign(g, {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    postfx: { sceneRT: hdrTarget },
    renderer: {
      setRenderTarget: (target) => bound.push(target),
      compile: (scene) => { compiledAgainst = bound.at(-1); sceneObjectsWhileCompiling = scene.children.length; },
    },
  });
  g._prewarmShaders();
  assert.equal(compiledAgainst, hdrTarget, 'shaders must compile against the HDR target the world pass draws into');
  assert.ok(sceneObjectsWhileCompiling > 0, 'the enemy probes must be in the scene while it compiles');
  assert.equal(g.scene.children.length, 0, 'the probes must be removed afterwards');
  assert.equal(bound.at(-1), null, 'the canvas must be bound again afterwards');

  g.renderer.compile = () => { throw new Error('context lost'); };
  const warn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    g._prewarmShaders();
  } finally {
    console.warn = warn;
  }
  assert.ok(warned, 'a failed prewarm must be reported');
  assert.equal(g.scene.children.length, 0, 'a failed prewarm must still remove the probes');
  assert.equal(bound.at(-1), null, 'a failed prewarm must still unbind the HDR target');
}

console.log('frame budget OK (slab test and sight lines match the reference, HUD writes and flushes batched, resolution floor and ceiling, hit spheres, viewmodel graph walk, shader prewarm, FPS counter and its option)');
