// The cinematic director is split across js/cinematic-director/:
// js/cinematic-director.js boots cinematic.html, and the modules behind it
// import one another but never js/cinematic-director.js itself. This covers
// that contract.
//
// - No module in js/cinematic-director/ imports js/cinematic-director.js. One
//   that did would put an import cycle through the page's entry point.
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
  + `js/cinematic-director.js; .vercelignore keeps the director off the deploy; ${PAGE_FREE.length} page-free modules load and build `
  + `${Object.keys(SHOTS).length} shots.`);
