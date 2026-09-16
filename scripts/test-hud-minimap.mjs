import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGameModule } from './lib/headless-three.mjs';

const entry = await loadGameModule('hud.js');
const { HUDMinimap } = await loadGameModule('hud', 'minimap.js');
assert.deepEqual(Object.keys(entry), ['HUD']);
assert.equal(entry.HUD.prototype.drawMinimap, HUDMinimap.prototype.drawMinimap);
const source = readFileSync(new URL('../js/hud.js', import.meta.url), 'utf8');
assert.match(source, /import \{ HUDMinimap \} from '\.\/hud\/minimap\.js';/);
const minimapSource = readFileSync(new URL('../js/hud/minimap.js', import.meta.url), 'utf8');
assert.doesNotMatch(minimapSource, /\bimport\b|\bfrom\s*['"]/);

// Record paint-time styles, paths and transforms instead of accepting no-op draws.
function recordingCanvas(width = 328, height = 188) {
  const calls = [], stack = [];
  let path = [];
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    save() {
      stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
      calls.push({ op: 'save' });
    },
    restore() {
      assert.ok(stack.length, 'restore without save');
      Object.assign(this, stack.pop()); calls.push({ op: 'restore' });
    },
    beginPath() { path = []; },
    createRadialGradient(...args) {
      const gradient = { args, stops: [], addColorStop(...stop) { this.stops.push(stop); } };
      return gradient;
    },
  };
  for (const op of ['moveTo', 'lineTo', 'arc', 'closePath']) {
    ctx[op] = (...args) => path.push({ op, args });
  }
  for (const op of ['clearRect', 'fillRect', 'strokeRect', 'fillText', 'translate', 'rotate', 'fill', 'stroke']) {
    ctx[op] = (...args) => calls.push({
      op, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle,
      path: path.map((part) => ({ ...part, args: [...part.args] })),
    });
  }
  return { width, height, calls, stack, getContext: (kind) => { assert.equal(kind, '2d'); return ctx; } };
}
const hud = Object.create(entry.HUD.prototype);
hud.el = { minimap: null };
assert.doesNotThrow(() => hud.drawMinimap(null));
const canvas = recordingCanvas();
hud.el.minimap = canvas;
hud.drawMinimap({ minimapPlayers() { throw Error('must not query players without map'); } });
assert.deepEqual(canvas.calls.map((c) => c.op), ['clearRect', 'fillRect']);
assert.deepEqual(canvas.calls[1].args, [0, 0, 328, 188]);
assert.equal(canvas.calls[1].fill, '#070a10');

const map = {
  rooms: [{ rect: { minX: -47, maxX: -37, minZ: -65, maxZ: -55 } }],
  doors: [
    { x: 0, z: 0, open: false, cost: 750 },
    { x: 1, z: 1, open: true, cost: 750 },
    { x: 2, z: 2, open: false, cost: null },
    { x: 3, z: 3, preOpen: true, open: true },
  ],
  power: { on: false, pos: { x: 0, z: 0 } },
  teleporters: [
    { id: 'teleA', x: 0, z: 0, linked: false },
    { id: 'teleB', x: 1, z: 1, linked: true },
    { id: 'teleC', x: 2, z: 2, linked: false },
  ],
  pap: { pos: { x: 0, z: 0 } }, box: { pos: { x: 1, z: 1 } },
};
const players = [
  { x: 0, z: 0, yaw: 0.75, me: true },
  { x: 5, z: 5, me: false, color: '#123456', down: false },
  { x: 10, z: 10, me: false, color: '#abcdef', down: true },
];
canvas.calls.length = 0;
hud.drawMinimap({ map, minimapPlayers: () => players });
const calls = canvas.calls;
// 94 world units occupy 188 pixels; the 82-unit width is centered in 328 pixels.
assert.deepEqual(calls.find((c) => c.op === 'strokeRect').args, [82, 0, 20, 20]);
const doorPaint = calls.filter((c) => c.op === 'fillRect' && c.args[2] === 4);
assert.equal(doorPaint.length, 3, 'pre-open doors have no marker');
assert.deepEqual(doorPaint.map((c) => c.fill), [
  'rgba(224,69,58,0.9)', 'rgba(95,208,138,0.9)', 'rgba(255,180,84,0.9)',
]);
const labels = calls.filter((c) => c.op === 'fillText');
assert.deepEqual(labels.map((c) => c.args[0]), ['⚡', 'A', 'B', 'C', 'PaP', '?']);
assert.deepEqual(labels.map((c) => c.fill), [
  'rgba(230,60,50,0.95)', 'rgba(120,120,130,0.8)', 'rgba(110,170,255,0.95)',
  'rgba(120,120,130,0.8)', 'rgba(203,162,255,0.92)', 'rgba(255,180,84,0.95)',
]);
assert.deepEqual(calls.filter((c) => c.op === 'rotate').map((c) => c.args), [[-0.75]]);
assert.deepEqual(calls.filter((c) => c.op === 'translate').map((c) => c.args), [[176, 130], [186, 140], [196, 150]]);
const fills = calls.filter((c) => c.op === 'fill');
assert.equal(fills.length, 4);
assert.equal(typeof fills[0].fill, 'object', 'cone precedes arrow');
assert.equal(fills[0].fill.stops.length, 2);
assert.ok(fills[0].path.some((p) => p.op === 'arc' && p.args[2] === 22));
assert.equal(fills[1].fill, '#ffffff');
assert.ok(fills[1].path.some((p) => p.op === 'lineTo'));
assert.deepEqual(fills.slice(2).map((c) => c.fill), ['#123456', '#e0453a']);
assert.ok(fills.slice(2).every((c) => c.path.some((p) => p.op === 'arc' && p.args[2] === 3.6)));
assert.deepEqual(calls.filter((c) => ['save', 'restore'].includes(c.op)).map((c) => c.op),
  ['save', 'restore', 'save', 'restore', 'save', 'restore']);
assert.equal(canvas.stack.length, 0);

map.power.on = true;
canvas.calls.length = 0;
hud.drawMinimap({ map, minimapPlayers: () => [] });
assert.equal(canvas.calls.find((c) => c.op === 'fillText' && c.args[0] === '⚡').fill,
  'rgba(120,230,120,0.95)');
console.log('HUD minimap OK: module wiring, fallback, scale, state colors, labels and player markers.');
