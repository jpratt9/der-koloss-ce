// The cinematic director is split across js/cinematic-director/:
// js/cinematic-director.js boots cinematic.html, and the modules behind it
// import one another but never js/cinematic-director.js itself. This covers
// that contract.
//
// - No module in js/cinematic-director/ imports js/cinematic-director.js. One
//   that did would put an import cycle through the page's entry point.
// - The modules in js/cinematic-director/ don't import each other in a cycle.
//   validate() takes frame and proofFrame as parameters so that validate.js
//   needn't import playback.js, which imports it.
// - .vercelignore keeps the page, its entry point and the folder off the
//   deploy. The director is internal trailer-capture tooling, and a new module
//   in the folder would ship without the folder line.
// - The modules that never touch the page load in Node. That links every
//   import among them and builds every shot in the manifest. stage.js reads
//   location, queries the DOM and creates a WebGLRenderer as it loads, so it
//   and the modules that import it are loaded by test-cinematic-director.mjs,
//   which stubs the page.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { assertNoImportOf } from './lib/split-modules.mjs';

const files = readdirSync(join(repoRoot, 'js', 'cinematic-director'), { recursive: true }).filter((f) => f.endsWith('.js')).sort();

// ---------------------------------------------------------------------------
// No module in js/cinematic-director/ imports js/cinematic-director.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('cinematic-director.js', 'cinematic-director', files);

// ---------------------------------------------------------------------------
// The modules in js/cinematic-director/ don't import each other in a cycle.
// ---------------------------------------------------------------------------
/** The files in js/cinematic-director/ that `file` imports. */
const siblingsOf = (file) => [...readFileSync(join(repoRoot, 'js', 'cinematic-director', file), 'utf8')
  .matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'\.\/([^']+)'/gm)].map(([, name]) => name);

/** One import cycle in `graph` (each file to the files it imports), as the files around it, or null. */
function findCycle(graph) {
  const done = new Set(), path = [];
  const visit = (file) => {
    if (path.includes(file)) return [...path.slice(path.indexOf(file)), file];
    if (done.has(file)) return null;
    path.push(file);
    for (const next of graph.get(file) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(file);
    return null;
  };
  for (const file of graph.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}
const graph = new Map(files.map((file) => [file, siblingsOf(file)]));
assert.equal(findCycle(graph)?.join(' imports ') ?? null, null, 'the modules in js/cinematic-director/ must not import each other in a cycle');
const doctored = findCycle(new Map([...graph, ['validate.js', [...graph.get('validate.js'), 'playback.js']]]));
assert.ok(doctored?.includes('validate.js') && doctored.includes('playback.js'),
  'a validate.js that imports playback.js, which imports it, must be rejected');

// ---------------------------------------------------------------------------
// .vercelignore keeps the director off the deploy.
// ---------------------------------------------------------------------------
const ignored = new Set(readFileSync(join(repoRoot, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()));
for (const line of ['cinematic.html', 'js/cinematic-director.js', 'js/cinematic-director/']) {
  assert.ok(ignored.has(line), `.vercelignore must list ${line}: the cinematic director is internal tooling and must not deploy`);
}

// ---------------------------------------------------------------------------
// The modules that never touch the page load in Node.
// ---------------------------------------------------------------------------
const PAGE_FREE = ['math.js', 'opening.js', 'shots.js', 'motion.js', 'pose.js', 'director-weapon.js'];
for (const file of PAGE_FREE) {
  assert.ok(files.includes(file), `js/cinematic-director/${file} is missing`);
  await loadGameModule('cinematic-director', file);
}
const { SHOTS } = await loadGameModule('cinematic-director', 'shots.js');
assert.ok(Object.keys(SHOTS).length, 'js/cinematic-director/shots.js must build the shot manifest');

console.log(`Cinematic director modules OK: ${files.length} modules in js/cinematic-director/ (${specifiers} relative imports) never import `
  + 'js/cinematic-director.js, and never each other in a cycle (a validate.js that imports playback.js is rejected); '
  + `.vercelignore keeps the director off the deploy; ${PAGE_FREE.length} page-free modules load and build `
  + `${Object.keys(SHOTS).length} shots.`);
