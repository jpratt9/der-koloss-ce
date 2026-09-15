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
//   frame asked for, and return a validation list. The second frame of each
//   pair runs the checks that compare a frame with the one before it.
// - The last frame, the debug reports and a free camera run too.
// - Nothing logs an error, and no soldier's weapon falls back to the stand-in
//   silhouette, which is what a broken weapon import looks like.
//
// Each shot runs in its own Node process, because the director reads its URL
// parameters once, as it loads.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESULT = '@@director-result ';
const shotName = process.argv[2];
if (shotName) await playShot(shotName);
else await playEveryShot();

async function playEveryShot() {
  const { loadGameModule } = await import('./lib/headless-three.mjs');
  const { SHOTS } = await loadGameModule('cinematic-director', 'shots.js');
  const names = Object.keys(SHOTS);
  const failures = [];
  let frames = 0;
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      const { code, out, err } = await new Promise((resolve) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => resolve({ code, out, err }));
      });
      const result = out.split('\n').find((l) => l.startsWith(RESULT));
      if (code === 0 && result) frames += JSON.parse(result.slice(RESULT.length)).frames;
      else failures.push(`${name}:\n    ${err.split('\n').filter((l) => /Error|assert|FAILED|at /.test(l)).slice(0, 6).join('\n    ')}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), 8) }, worker));
  assert.equal(failures.length, 0, `cinematic director shots failed headless:\n  ${failures.join('\n  ')}`);
  console.log(`Cinematic director OK: all ${names.length} shots build headless and seek ${frames} frames, `
    + 'with the debug reports and a free camera; no errors and no stand-in weapons.');
}

async function playShot(name) {
  globalThis.location = { search: `?capture=1&shot=${encodeURIComponent(name)}&width=320&height=180` };
  globalThis.innerWidth = 320;
  globalThis.innerHeight = 180;
  const { repoRoot } = await import('./lib/headless-three.mjs');
  await import('./lib/headless-map.mjs');
  const { loadZombieModels } = await import('./lib/headless-zombies.mjs');

  // headless-three maps 'three' to the vendored module. The director also makes
  // a WebGLRenderer, which Node can't, so 'three' now resolves to the vendored
  // module plus a renderer that only updates matrices, as the real one does
  // before it draws. A hook registered later runs first.
  const three = pathToFileURL(join(repoRoot, 'vendor', 'three.module.js')).href;
  const shim = `export * from ${JSON.stringify(three)};
export class WebGLRenderer {
  constructor(parameters = {}) { this.domElement = parameters.canvas; this.shadowMap = {}; this.toneMappingExposure = 1; }
  setPixelRatio() {}
  setSize() {}
  render(scene, camera) { scene.updateMatrixWorld(); if (camera.parent === null) camera.updateMatrixWorld(); }
}`;
  register('data:text/javascript,' + encodeURIComponent(`export function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify('data:text/javascript,' + encodeURIComponent(shim))}, shortCircuit: true };
  return next(spec, ctx);
}`));

  const element = () => ({ textContent: '', className: '', style: {}, classList: { add() {} }, appendChild() {}, addEventListener() {} });
  const elements = new Map();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
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
    assert.ok(!status.textContent.startsWith('DIRECTOR FAILED'), `${name}: ${status.textContent}`);
    assert.ok(Date.now() < deadline, `${name}: the director was not ready after 60 s`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const shot = trailer.manifest[name];
  const frames = new Set([shot.duration - 1]);
  for (let f = 0; f < shot.duration; f += 10) frames.add(f).add(Math.min(f + 1, shot.duration - 1));
  const order = [...frames].sort((a, b) => a - b);
  for (const f of order) {
    const played = trailer.seek(f);
    assert.equal(played.frame, f, `${name}: seek(${f}) landed on frame ${played.frame}`);
    assert.ok(Array.isArray(played.validation) && played.validation.every((issue) => /^[A-Z0-9_]+$/.test(issue)),
      `${name}: frame ${f} returned validation ${JSON.stringify(played.validation)}`);
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
  assert.ok(Array.isArray(trailer.previewCamera({ x: 0, y: 2, z: -40 }, { x: 0, y: 1.2, z: -52 }, 46)), `${name}: previewCamera()`);
  assert.deepEqual(errors, [], `${name}: logged errors`);
  assert.deepEqual(fallbacks, [], `${name}: a soldier's weapon fell back to the stand-in silhouette`);
  console.log(RESULT + JSON.stringify({ frames: order.length }));
  process.exit(0);
}
