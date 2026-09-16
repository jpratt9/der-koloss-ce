import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { readPostFXSource } from './lib/postfx-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const entry = await loadGameModule('render', 'PostFX.js');
const { PostFXRender } = await loadGameModule('render', 'PostFX', 'render.js');
const { PostFX, QUALITY_PRESETS } = entry;
assert.deepEqual(Object.keys(entry).sort(), ['PostFX', 'QUALITY_PRESETS']);
assert.deepEqual(Object.keys(QUALITY_PRESETS), ['low', 'medium', 'high', 'ultra']);
assert.equal(PostFX.prototype.render, PostFXRender.prototype.render);
assertNoImportOf('render/PostFX.js', 'render/PostFX', ['render.js']);
assertSourceHolds(readPostFXSource(), 'readPostFXSource()', ['render/PostFX.js', 'render/PostFX/render.js']);

// Real passes, uniforms, matrices and targets; only GPU submission is recorded.
const calls = [];
const passNames = new Map();
let target = null;
const renderer = {
  autoClear: true,
  setRenderTarget(value) { target = value; },
  clear() {},
  render(scene) { calls.push({ name: passNames.get(scene) || 'world', target }); },
};
const fx = new PostFX(renderer);
for (const [key, value] of Object.entries(fx)) {
  if (value?.scene && value?.material) passNames.set(value.scene, key);
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
fx.setSize(321, 181, 1.15);
assert.equal(fx.bufW, Math.floor(321 * 1.15));
assert.equal(fx.bufH, Math.floor(181 * 1.15));
fx.enabled = false;
fx.render(scene, camera);
assert.deepEqual(calls, [{ name: 'world', target: null }]);
fx.enabled = true;
fx.dofMaxBlur = 2;
// Prime camera history before checking the full pipeline, including motion blur.
fx.render(scene, camera);
fx.render(scene, camera);
calls.length = 0;
fx.render(scene, camera, 1 / 60, (dst) => {
  assert.equal(renderer.autoClear, false);
  calls.push({ name: 'viewmodel', target: dst });
});
const expected = [
  'world', 'aoPass', 'aoBlurPass', 'aoBlurPass', 'volPass', 'resolvePass',
  'ssrPass', 'mbPass', 'dofPass', 'viewmodel', 'bloomPre',
  ...Array(fx.bloomRTs.length - 1).fill('bloomDown'),
  ...Array(fx.bloomRTs.length - 1).fill('bloomUp'),
  ...Array(fx.lumRTs.length).fill('lumDownPass'),
  'lumAdaptPass', 'compositePass', 'fxaaPass',
];
assert.deepEqual(calls.map((call) => call.name), expected);
assert.equal(calls.find((call) => call.name === 'viewmodel').target,
  calls.find((call) => call.name === 'dofPass').target);
assert.equal(renderer.autoClear, true);
assert.equal(target, null);
assert.deepEqual(fx._prevViewProj.elements, fx._curViewProj.elements);

// A viewmodel failure must not abort bloom, exposure or presentation.
calls.length = 0;
const originalError = console.error;
const errors = [];
try {
  console.error = (...args) => errors.push(args);
  fx.render(scene, camera, 1 / 60, () => { throw new Error('expected draw failure'); });
} finally {
  console.error = originalError;
}
assert.equal(errors.length, 1);
assert.equal(calls.at(-1).name, 'fxaaPass');
assert.ok(calls.some((call) => call.name === 'lumAdaptPass'));
assert.equal(renderer.autoClear, true);
assert.equal(target, null);

// Resize may discard resolution-dependent targets, but not exposure history.
const adapted = fx.adaptRT;
const adaptedTexture = fx._adaptedTex;
const adaptedIndex = fx.adaptIndex;
let adaptedDisposals = 0;
for (const rt of adapted) rt.addEventListener('dispose', () => adaptedDisposals++);
let sceneDisposals = 0;
fx.sceneRT.addEventListener('dispose', () => sceneDisposals++);
fx.setSize(427, 239, 1.35);
assert.equal(sceneDisposals, 1);
assert.equal(fx.adaptRT, adapted);
assert.equal(fx._adaptedTex, adaptedTexture);
assert.equal(fx.adaptIndex, adaptedIndex);
assert.equal(fx._adaptPrimed, true);
assert.equal(adaptedDisposals, 0);
for (const quality of Object.keys(QUALITY_PRESETS)) {
  fx.setQuality(quality);
  fx.setMotionBlurScale(1.5);
  assert.equal(fx.mbPass.uniforms.uMaxRadius.value, fx._mbTaps * 1.6);
  assert.equal(fx.adaptRT, adapted);
  calls.length = 0;
  fx.render(scene, camera);
  assert.equal(calls.some((call) => call.name === 'aoPass'), quality !== 'low');
  assert.equal(calls.some((call) => call.name === 'ssrPass'), ['high', 'ultra'].includes(quality));
  assert.equal(calls.at(-1).name, 'fxaaPass');
}
fx.dispose();
assert.equal(adaptedDisposals, 2);
assert.equal(fx.adaptRT, null);
assert.equal(fx._adaptPrimed, false);
console.log('PostFX modules OK: exports, render ordering, viewmodel failure recovery, quality settings and exposure lifetime.');
