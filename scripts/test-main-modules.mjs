// The page script is split across js/main/: js/main.js wires the page's
// controls and boots it, and the modules behind it import one another but
// never js/main.js itself. This covers that contract.
//
// - No module in js/main/ imports js/main.js. One that did would put an import
//   cycle through the page's entry point.
// - The modules in js/main/ import each other without a cycle. Their functions
//   call each other both ways, so which module each one lives in is what keeps
//   the graph one-way.
// - Every module in js/main/ loads in Node. That links every import between
//   them and runs their top levels. js/main.js is left to the page, because it
//   boots the page as it loads.
// - readMainSource() hands the text checks every file of the page script.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import './lib/headless-map.mjs';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readMainSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'main');
const files = readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js')).sort();

// ---------------------------------------------------------------------------
// No module in js/main/ imports js/main.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('main.js', 'main', files);

// ---------------------------------------------------------------------------
// The modules in js/main/ import each other without a cycle.
// ---------------------------------------------------------------------------
/** One cycle in `graph` (each file to the files it imports), as the files around it, or null. */
function findCycle(graph) {
  const state = new Map();
  const path = [];
  const visit = (file) => {
    if (state.get(file) === 'done') return null;
    if (state.get(file) === 'open') return [...path.slice(path.indexOf(file)), file];
    state.set(file, 'open');
    path.push(file);
    for (const next of graph.get(file) || []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(file, 'done');
    return null;
  };
  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}
const graph = new Map(files.map((file) => {
  const path = join(dir, file);
  const imported = [...readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)]
    .map(([, spec]) => spec)
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => relative(dir, resolve(dirname(path), spec.replace(/\?.*$/, ''))))
    .filter((target) => files.includes(target));
  return [file, imported];
}));
const cycle = findCycle(graph);
assert.equal(cycle, null, `modules in js/main/ import each other in a circle: ${cycle?.join(' -> ')}`);
assert.deepEqual(
  findCycle(new Map([['app.js', []], ['lobby.js', ['app.js', 'lifecycle.js']], ['lifecycle.js', ['app.js', 'lobby.js']]])),
  ['lobby.js', 'lifecycle.js', 'lobby.js'],
  'a graph in which lobby.js and lifecycle.js import each other must be rejected',
);
const edges = [...graph.values()].reduce((n, targets) => n + targets.length, 0);

// ---------------------------------------------------------------------------
// Every module in js/main/ loads in Node. app.js builds the HUD, which looks
// its elements up, and reads location for the debug flag.
// ---------------------------------------------------------------------------
document.getElementById = () => null;
document.querySelector = () => null;
globalThis.location = new URL('http://localhost/');
for (const file of files) await loadGameModule('main', file);

// ---------------------------------------------------------------------------
// readMainSource() holds every file of the page script.
// ---------------------------------------------------------------------------
assertSourceHolds(readMainSource(), 'readMainSource()', ['main.js', ...files.map((f) => `main/${f}`)]);

console.log(`Main modules OK: ${files.length} modules in js/main/ (${specifiers} relative imports) never import js/main.js, `
  + `and their ${edges} imports of each other form no cycle (a cycle is rejected); all ${files.length} load in Node; `
  + 'readMainSource() holds them all.');
