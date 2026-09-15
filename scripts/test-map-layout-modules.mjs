// The map layout is split across js/map-layout/: js/map-layout.js re-exports
// the names its modules define, and the modules never import it. This covers
// that contract.
//
// - js/map-layout.js still exports exactly the names it did before the split,
//   so none of the files that import it has to change.
// - Every module in js/map-layout/ loads in plain Node, with no resolve hook
//   and no DOM, as js/map-layout.js's header requires. js/map-layout.js
//   re-exports each name a module defines, and no name is defined in two.
// - No module in js/map-layout/ imports js/map-layout.js.
// - The imports go one way: shell.js and interactables.js import nothing,
//   traversal.js at most shell.js, audits.js at most the other three, and
//   js/map-layout.js every module. So the folder has no cycle. Each specifier
//   spells its file's name as it is on disk: macOS resolves a wrong case, and
//   Vercel does not.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'js', 'map-layout');
const entryPath = join(root, 'js', 'map-layout.js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

// The layout loads before split-modules.mjs does. That file loads
// headless-three.mjs, which registers the hook that resolves three and stubs
// the DOM, and the layout has to load without either.
const load = async (path, label) => {
  try {
    return await import(pathToFileURL(path).href);
  } catch (err) {
    assert.fail(`${label} must load in plain Node, with no resolve hook and no DOM: ${err.message}`);
  }
};
const entry = await load(entryPath, 'js/map-layout.js');
const modules = new Map();
for (const file of files) modules.set(file, await load(join(dir, file), `js/map-layout/${file}`));
const { assertNoImportOf, importsOf, onDisk } = await import('./lib/split-modules.mjs');

// ---------------------------------------------------------------------------
// js/map-layout.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const NAMES = [
  'MAP_ROOMS', 'DOOR_FIT', 'cappedWallRuns', 'MAP_DOOR_DEFS', 'MAP_WALL_RUNS', 'MAP_WALLBUYS', 'MAP_PERKS',
  'INITIAL_MYSTERY_BOX', 'MAP_TELEPORTERS', 'MAINFRAME_PLATFORM', 'MAINFRAME_STEPS', 'MAINFRAME_EAST_ENTRY_KEEP_CLEAR',
  'FACTORY_CATWALK', 'PAP_ENERGY_VISUAL', 'papEnergyEnvelope', 'stairFlightColliders', 'platformSideBlocksAtFeet',
  'auditInteractableApproaches', 'auditKeepClearZone', 'teleporterPromptState', 'MAP_RAMPS', 'MAP_WALKWAYS',
  'MAP_OPEN_EXITS', 'MAP_STAIR_MOUTHS', 'MAP_TRAVERSAL_ZONES', 'MAP_NAV_LINKS', 'roomDepthsToPlayers',
  'roomsThatCanReachPlayers', 'elevationAwareRiseCandidate', 'auditMapStructure', 'auditMapEgress',
];
assert.deepEqual(Object.keys(entry).sort(), [...NAMES].sort(),
  'js/map-layout.js must export exactly the names it exported before the split');

// ---------------------------------------------------------------------------
// js/map-layout.js re-exports each name a module in js/map-layout/ defines.
// ---------------------------------------------------------------------------
const definedIn = new Map();
for (const [file, exports] of modules) {
  for (const [name, value] of Object.entries(exports)) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
    assert.ok(entry[name] === value, `js/map-layout.js must re-export ${name} from js/map-layout/${file}`);
  }
}

// ---------------------------------------------------------------------------
// No module in js/map-layout/ imports js/map-layout.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('map-layout.js', 'map-layout', files);

// ---------------------------------------------------------------------------
// The imports go one way.
// ---------------------------------------------------------------------------
/** What each module may import. A module missing here has no place in the order yet. */
const MAY_IMPORT = {
  'shell.js': [],
  'interactables.js': [],
  'traversal.js': ['./shell.js'],
  'audits.js': ['./shell.js', './interactables.js', './traversal.js'],
};

/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const folder = [...moduleImports.keys()].map((file) => `./map-layout/${file}`);
  return [
    ...entryImports.filter((spec) => !folder.includes(spec))
      .map((spec) => `js/map-layout.js imports ${spec}, which is not a module in js/map-layout/`),
    ...folder.filter((spec) => !entryImports.includes(spec))
      .map((spec) => `js/map-layout.js does not import ${spec}`),
    ...[...moduleImports].flatMap(([file, specs]) => (file in MAY_IMPORT
      ? specs.filter((spec) => !MAY_IMPORT[file].includes(spec)).map((spec) => `js/map-layout/${file} imports ${spec}`)
      : [`js/map-layout/${file} has no place in the import order`])),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = importsOf(entryPath);
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'shell.js and interactables.js must import nothing, traversal.js at most shell.js, audits.js at most the other three, '
  + 'and js/map-layout.js every module');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['shell.js', ['./audits.js']]])),
  ['js/map-layout/shell.js imports ./audits.js'], 'a shell.js that imports audits.js must be rejected');

const miscased = [entryPath, ...files.map((file) => join(dir, file))]
  .flatMap((from) => importsOf(from).filter((spec) => !onDisk(from, spec)).map((spec) => `${relative(root, from)} imports ${spec}`));
assert.deepEqual(miscased, [], 'every relative import must name its file as it is spelled on disk');
assert.equal(onDisk(entryPath, './map-layout/Shell.js'), false, 'a specifier with the wrong case must be rejected');
assert.ok(ruleBreaks(entryImports.map((spec) => spec.replace('/shell.js', '/Shell.js')), moduleImports)
  .includes('js/map-layout.js does not import ./map-layout/shell.js'), 'an entry that imports ./map-layout/Shell.js must be rejected');

console.log(`Map layout modules OK: js/map-layout.js exports its ${NAMES.length} names, ${definedIn.size} of them from `
  + `${files.length} modules in js/map-layout/ that load with no resolve hook and no DOM (${specifiers} relative imports), `
  + 'and never import it; the imports go one way (a shell.js that imports audits.js is rejected), each spelled as on disk '
  + '(a wrong case is rejected).');
