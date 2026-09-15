// The cinematic director builds and plays every shot headless.
//
// The director is a page script: cinematic.html loads it, and the capture tools
// drive it through window.__TRAILER__. Its modules in js/cinematic-director/
// share state through live imports, so a name a module forgot to import, or a
// binding assigned from a module that only imports it, throws only when that
// line runs, in the middle of a capture. No other validator runs it.
//
// This builds every shot in Node the way cinematic.html does with ?capture=1,
// then seeks it the way the capture tools do:
// - Every shot builds its map, world state and cast without DIRECTOR FAILED.
// - Every 10th frame and the frame after it seek without throwing, land on the
//   frame asked for, and return a validation list, which
//   __TRAILER__.validation() then reports too. The second frame of each pair
//   runs the checks that compare a frame with the one before it.
// - The last frame, the debug reports and a free camera run too.
// - Nothing logs an error, and no soldier's weapon falls back to the stand-in
//   silhouette, which is what a broken weapon import looks like.
//
// Two more runs reach the page code a capture never runs:
// - The preview page, cinematic.html with no query string, plays factoryWake
//   through its own animation loop. It writes the overlay, sizes the renderer
//   to the window and follows a resize.
// - The still gate (?stillGate=1) adds a SAVE button, and clicking it
//   downloads the frame ?frame= opened on as a PNG.
//
// Each run is its own Node process, because the director reads its URL
// parameters once, as it loads.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESULT = '@@director-result ';
const STILL_GATE = { shot: 'openingOP01V4', frame: 12 };
const [mode, ...args] = process.argv.slice(2);
if (mode === '--preview') await playPreview();
else if (mode === '--still-gate') await playStillGate(args[0], Number(args[1]));
else if (mode) await playShot(mode);
else await playEveryShot();

async function playEveryShot() {
  const { loadGameModule } = await import('./lib/headless-three.mjs');
  const { SHOTS } = await loadGameModule('cinematic-director', 'shots.js');
  const names = Object.keys(SHOTS);
  const runs = [...names.map((name) => [name]), ['--preview'], ['--still-gate', STILL_GATE.shot, String(STILL_GATE.frame)]];
  const failures = [];
  let frames = 0;
  let next = 0;
  const worker = async () => {
    while (next < runs.length) {
      const run = runs[next++];
      const { code, out, err } = await new Promise((resolve) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...run], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => resolve({ code, out, err }));
      });
      const result = out.split('\n').find((l) => l.startsWith(RESULT));
      if (code === 0 && result) frames += JSON.parse(result.slice(RESULT.length)).frames;
      else failures.push(`${run.join(' ')}:\n    ${err.split('\n').filter((l) => /Error|assert|FAILED|at /.test(l)).slice(0, 6).join('\n    ')}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), 8) }, worker));
  assert.equal(failures.length, 0, `cinematic director runs failed headless:\n  ${failures.join('\n  ')}`);
  console.log(`Cinematic director OK: all ${names.length} shots build headless and seek ${frames} frames, `
    + 'with the debug reports and a free camera; no errors and no stand-in weapons. The preview page plays, '
    + 'writes its overlay and follows a resize, and the still gate saves a PNG.');
}

/**
 * Loads js/cinematic-director.js the way cinematic.html does, with `search` as
 * the page's query string, and waits until __TRAILER__ is ready. Returns it with
 * the stand-ins for the page it talks to.
 */
async function bootDirector(search, label) {
  globalThis.location = { search };
  globalThis.innerWidth = 320;
  globalThis.innerHeight = 180;
  const { repoRoot } = await import('./lib/headless-three.mjs');
  await import('./lib/headless-map.mjs');
  const { loadZombieModels } = await import('./lib/headless-zombies.mjs');

  // headless-three maps 'three' to the vendored module. The director also makes
  // a WebGLRenderer, which Node can't, so 'three' now resolves to the vendored
  // module plus a renderer that only updates matrices, as the real one does
  // before it draws, and keeps the size and camera the page gave it. A hook
  // registered later runs first.
  const three = pathToFileURL(join(repoRoot, 'vendor', 'three.module.js')).href;
  const shim = `export * from ${JSON.stringify(three)};
export class WebGLRenderer {
  constructor(parameters = {}) { this.domElement = parameters.canvas; this.shadowMap = {}; this.toneMappingExposure = 1; globalThis.__directorRenderer = this; }
  setPixelRatio(ratio) { this.pixelRatio = ratio; }
  setSize(width, height) { this.size = [width, height]; }
  render(scene, camera) { scene.updateMatrixWorld(); if (camera.parent === null) camera.updateMatrixWorld(); this.camera = camera; }
}`;
  register('data:text/javascript,' + encodeURIComponent(`export function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify('data:text/javascript,' + encodeURIComponent(shim))}, shortCircuit: true };
  return next(spec, ctx);
}`));

  // The page's elements. The canvas hands toBlob a real Blob, which is what
  // URL.createObjectURL takes.
  const element = (tag) => ({
    tag, textContent: '', className: '', style: {}, classList: { add() {} }, listeners: {}, clicks: 0,
    appendChild() {}, addEventListener(type, listener) { this.listeners[type] = listener; }, click() { this.clicks++; },
    toBlob(callback, type) { callback(new Blob(['png'], { type })); },
  });
  const elements = new Map();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
  const created = [], appended = [];
  const createElement = document.createElement;
  document.createElement = (tag) => {
    if (tag !== 'button' && tag !== 'a') return createElement(tag);
    const node = element(tag);
    created.push(node);
    return node;
  };
  document.body.appendChild = (node) => { appended.push(node); return node; };
  document.body.classList = { add() {} };
  const errors = [], fallbacks = [];
  console.error = (...args) => errors.push(args.map(String).join(' '));
  console.warn = (...args) => { if (String(args[0]).startsWith('Director weapon fallback')) fallbacks.push(args.map(String).join(' ')); };

  // The soldiers and zombies clone these skeletons. Nothing else a shot builds
  // is downloaded: the map's materials are procedural.
  const assets = await loadZombieModels();
  assets.load = async () => {};

  await import(pathToFileURL(join(repoRoot, 'js', 'cinematic-director.js')).href);
  const trailer = globalThis.__TRAILER__;
  const status = document.querySelector('#director-status');
  const deadline = Date.now() + 60_000;
  while (!trailer.ready) {
    assert.ok(!status.textContent.startsWith('DIRECTOR FAILED'), `${label}: ${status.textContent}`);
    assert.ok(Date.now() < deadline, `${label}: the director was not ready after 60 s`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { trailer, status, overlay: document.querySelector('#director-overlay'), renderer: globalThis.__directorRenderer, created, appended, errors, fallbacks };
}

/** Fails the run on a logged error or a stand-in weapon, then reports how many frames it sought. */
function finish(label, { errors, fallbacks }, frames) {
  assert.deepEqual(errors, [], `${label}: logged errors`);
  assert.deepEqual(fallbacks, [], `${label}: a soldier's weapon fell back to the stand-in silhouette`);
  console.log(RESULT + JSON.stringify({ frames }));
  process.exit(0);
}

async function playShot(name) {
  const page = await bootDirector(`?capture=1&shot=${encodeURIComponent(name)}&width=320&height=180`, name);
  const { trailer } = page;
  const shot = trailer.manifest[name];
  const frames = new Set([shot.duration - 1]);
  for (let f = 0; f < shot.duration; f += 10) frames.add(f).add(Math.min(f + 1, shot.duration - 1));
  const order = [...frames].sort((a, b) => a - b);
  for (const f of order) {
    const played = trailer.seek(f);
    assert.equal(played.frame, f, `${name}: seek(${f}) landed on frame ${played.frame}`);
    assert.ok(Array.isArray(played.validation) && played.validation.every((issue) => /^[A-Z0-9_]+$/.test(issue)),
      `${name}: frame ${f} returned validation ${JSON.stringify(played.validation)}`);
    assert.deepEqual(trailer.validation(), played.validation, `${name}: __TRAILER__.validation() disagrees with seek(${f})`);
    assert.ok(played.camera.length === 3 && played.camera.every(Number.isFinite), `${name}: frame ${f} put the camera at ${played.camera}`);
    const motion = trailer.debugMotion();
    assert.equal(motion.frame, f, `${name}: debugMotion() reports frame ${motion.frame} after seek(${f})`);
    assert.equal(motion.actors.length, (shot.actors || []).length, `${name}: debugMotion() lists the wrong number of actors`);
    assert.equal(motion.zombies.length, (shot.zombies || []).length, `${name}: debugMotion() lists the wrong number of zombies`);
    if (f === 0 || f === order.at(-1)) {
      assert.ok(trailer.debugScene().powerLever.every(Number.isFinite), `${name}: debugScene() at frame ${f}`);
      trailer.debugCast();
    }
  }
  const free = trailer.previewCamera({ x: 0, y: 2, z: -40 }, { x: 0, y: 1.2, z: -52 }, 46);
  assert.ok(Array.isArray(free), `${name}: previewCamera()`);
  assert.deepEqual(trailer.validation(), free, `${name}: __TRAILER__.validation() disagrees with previewCamera()`);
  finish(name, page, order.length);
}

// ---------------------------------------------------------------------------
// The preview page: cinematic.html with no query string plays factoryWake at
// the window's size, on its own clock, with the overlay showing.
// ---------------------------------------------------------------------------
async function playPreview() {
  const listeners = {};
  globalThis.devicePixelRatio = 3;
  globalThis.addEventListener = (type, listener) => { (listeners[type] ??= []).push(listener); };
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
  const page = await bootDirector('', 'preview');
  const { trailer, status, overlay, renderer } = page;
  assert.equal(trailer.shot, 'factoryWake', 'preview: with no ?shot=, the page must play factoryWake');
  assert.equal(renderer.pixelRatio, 2, "preview: the renderer must take the screen's pixel ratio, capped at 2");
  assert.deepEqual(renderer.size, [320, 180], 'preview: the renderer must fill the window');

  // The page's animation loop seeks by the clock, so the overlay leaves frame 0.
  const overlayText = /^SHOT factoryWake\nFRAME (\d{5}) \/ (\d+)\nTIME \d+\.\d{3} s\nDEPENDENCIES .+\n(VALIDATION OK|FAIL [A-Z0-9_, ]+)$/;
  const deadline = Date.now() + 10_000;
  while (!(Number(overlayText.exec(status.textContent)?.[1]) > 0)) {
    assert.ok(!status.textContent.startsWith('DIRECTOR FAILED'), `preview: ${status.textContent}`);
    assert.ok(Date.now() < deadline, `preview: the overlay never moved past frame 0; it reads ${JSON.stringify(status.textContent)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const [, , last, verdict] = overlayText.exec(status.textContent);
  assert.equal(Number(last), trailer.manifest.factoryWake.duration - 1, "preview: the overlay must count to the shot's last frame");
  assert.equal(overlay.className, verdict === 'VALIDATION OK' ? 'good' : 'bad', "preview: the overlay's colour must match its validation line");

  assert.ok(listeners.resize?.length, 'preview: the page must listen for resize');
  globalThis.innerWidth = 640;
  globalThis.innerHeight = 360;
  for (const listener of listeners.resize) listener();
  assert.deepEqual(renderer.size, [640, 360], 'preview: a resize must resize the renderer');
  assert.equal(renderer.camera.aspect, 640 / 360, 'preview: a resize must reshape the camera');
  finish('preview', page, 0);
}

// ---------------------------------------------------------------------------
// The still gate: a capture with ?stillGate=1 adds a button that saves the
// frame ?frame= opened on.
// ---------------------------------------------------------------------------
async function playStillGate(name, frame) {
  const label = `still gate on ${name}`;
  const page = await bootDirector(`?capture=1&shot=${encodeURIComponent(name)}&width=320&height=180&stillGate=1&frame=${frame}`, label);
  const { trailer, created, appended } = page;
  const padded = String(frame).padStart(3, '0');
  assert.equal(trailer.debugMotion().frame, frame, `${label}: the page must open on ?frame=${frame}`);
  const buttons = appended.filter((node) => node.tag === 'button');
  assert.equal(buttons.length, 1, `${label}: the page must add one SAVE button`);
  assert.equal(buttons[0].textContent, `SAVE ${name} F${padded} PNG`, `${label}: the button must name the shot and frame`);
  buttons[0].listeners.click();
  const links = created.filter((node) => node.tag === 'a');
  assert.equal(links.length, 1, `${label}: SAVE must make one download link`);
  assert.equal(links[0].download, `${name}-f${padded}.png`, `${label}: the download must be named for the shot and frame`);
  assert.ok(links[0].href.startsWith('blob:'), `${label}: the download must be the canvas's PNG`);
  assert.equal(links[0].clicks, 1, `${label}: SAVE must start the download`);
  finish(label, page, 0);
}
