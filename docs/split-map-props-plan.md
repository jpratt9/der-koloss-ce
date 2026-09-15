# Split plan: js/map-props.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 14 files with 3,661 lines over the cap.

This continues `docs/split-hellhound-model-plan.md`, whose plan is done.

This plan covers `js/map-props.js`, the largest file. The hellhound plan's §2 ranked it third: one 932-line `decorateMap` closure, which the map plan's §1.2 mechanism might fit. A full read confirms that it fits (§1.1):
- The closure's banners mark sections that each do one job, and the prop builders only declare functions.
- Every closure name that crosses a section is a `const`. The one `let`, `roomY`, is set and read only by the placement code, which moves whole.
- validate-prop-cover is the only validator that reads its text, and the line it pins stays where it is.

This doc's §2 replaces the hellhound plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `f67d9d6` and `4d1a0ea`, one per step in §1.8. js/map-props.js went from 959 lines to 256. `count_lines.py` now finds 13 files with 3,202 lines over the cap, with js/map-layout.js the largest. It went as planned, with these notes:
- **Actual line counts** match the §1.3 estimates to within a line. The entry was 638 lines after step 1.

  | Module | Lines |
  |---|---|
  | js/map-props.js | 256 |
  | builders | 339 |
  | placement | 405 |

- **How the moves were made.** A throwaway script wrote each step's files from the 959-line file by the ranges in §1.3, so step 2 also rewrote builders.js, byte for byte. None of it was committed.
  - Before writing anything, it checked that the ranges tile the file. Every line lands in exactly one file, except two: line 14, the import placement.js takes one folder deeper, and one blank line (570 in step 1, 578 in step 2).
- **The proof ran as §1.8 describes.**
  - The baseline, run twice, matched itself. It prints 3,080 lines (1.0 MB): the scene graph with 562 geometries and 269 materials, 418 colliders, the 18 practicals, `propTris` of 61,332, 600 frames of the runtime, and 90,066 `Math.random` draws.
  - After steps 1 and 2, the output matched the baseline byte for byte.
- **The diff review.**
  - Every line that left map-props.js is verbatim, in order, in the module §1.3 planned for it.
  - The only lines `git diff --color-moved=zebra` showed as new, not moved, were the file headers, the imports, the two signatures and the return, the two calls, the entry's header sentence, README.md's lines and the tooling.
  - After each step, the name check passed: each builder takes exactly the closure names its body reads (11 and 27), each file uses every name it imports, and no body reads a name of the pre-split closure that it neither declares, takes nor imports. It failed, as it should, on a builders.js signature that dropped `pick` and took `ctx`.
- **test-map-props-modules.mjs is 72 lines,** rather than ~60.
  - Step 1 had no `placeDressing` call to doctor. So until step 2, its doctored copies left `pick` out of `makePropBuilders`' call and passed `lights: animated`. Step 2 swapped in §1.7's `DRUM_HOOP_R` and `drum: crate`.
  - It ran on copies of the tree with four mistakes, and failed on each: a builders.js that imports the entry, an entry that imports `./map-props/Builders.js`, a placement.js that imports builders.js, and an entry whose `placeDressing` call leaves out `DRUM_HOOP_R`.
  - With the four shared checks moved in, scripts/lib/split-modules.mjs is 114 lines, test-map-modules.mjs 63 and test-hellhound-modules.mjs 87.
- **The validators number 57,** and all of them passed after every step. The 56 before step 1 passed too. The loop takes about 60 s.
- **Browser checks.** None has been run. The dressing walk in §1.8 needs a local server.

None of the dead code in §1.9 was touched. README.md's layout lines from §1.10 are done. The optional RENDERING.md and `ceil()` comment changes were not made.

```
14 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/map-props.js                   959           2
js/map-layout.js                  925           2
index.html                        881           2
js/net.js                         874           2
js/fx.js                          842           2
js/render/WeaponParts.js          794           2
js/assets-page.js                 726           2
js/render/SoldierGear.js          717           2
js/render/WeaponMaterials.js      712           2
js/props/materials.js             685           2
js/render/ZombieDetail.js         682           2
js/render/PostFX.js               680           2
js/navmesh.js                     625           2
js/hud.js                         559           2

Total excess lines: 3661
```

The plan has two parts:
1. `js/map-props.js`: the prop builders and the placement code move verbatim into two builders in js/map-props/. `decorateMap` calls them where the code used to sit. It keeps what both share (the seeded stream, the clearance tests and the geometry kit), plus the merge and the practical lights' `update`. It exports the same one name, so js/map.js doesn't change.
2. The other 13 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/map-props.js: 959 lines → js/map-props.js (~255) + 2 modules in js/map-props/

### 1.1 What's in it

`decorateMap(group, ctx)` dresses the built map:
- It places the crates, drums, pipes, lamps and the rest, and registers their colliders.
- It merges them into one mesh per material.
- It returns the practical lights' runtime.

js/map.js is its only importer (6). It calls `decorateMap` once per build (56), after the interactables and before the clearance audits (94–111). The result is `{ update, lights, propTris }`, which map.js keeps as `api.props` (315). map.js's own `update` calls `props.update` (145), and js/game/graphics.js reads `props.lights` for the volumetric lights (187).

The function spans lines 28–959. Only the header, the imports and `mulberry32` are outside it.

| Lines | Contents | Reads from the closure | Read by |
|---|---|---|---|
| 1–14 | The header; imports of `THREE`, `mergeGeometries` (../vendor/utils/BufferGeometryUtils.js), `MAP_WALKWAYS` and `MAP_TRAVERSAL_ZONES` (./map-layout.js) | | |
| 16–26 | The RNG banner; `mulberry32` | | 29 |
| 28–32 | `decorateMap` opens: `rnd`, seeded with 0x5EED17; `R`, `RI`, `pick` | | `R`: the kit, the builders, the placement. `rnd`: the builders, the placement. `RI`: the placement. `pick`: `rubble` |
| 34–132 | Clearance: `keepClear`, `colliders`, `isClear`, `againstWall`, `footprints`, `footprintFree`, `claimFootprint`, `propFree`, `solid` | `ctx` | `footprintFree`, `claimFootprint`: `pallet`. The other four functions: the placement |
| 134–186 | The kit: `M`; `buckets`; five scratch transforms; `place`; `G`, the shared primitives, with the rubble rocks roughened by `R`; `lights`, `animated` | `ctx`, `R` | `place`, `G`: the builders and the hero set pieces. `buckets`: `cable` and the merge. `M`: the merge. `lights`, `animated`: the builders and `update` |
| 188–505 | The prop builders banner; `crate`, `DRUM_R`, `DRUM_HOOP_R`, `drum`, `pallet`, `sandbags`, `rubble`, `pipeRun`, `cable`, `chain`, `ibeam`, `duct`, `wallLamp`, `emergencyLight`, `fluorescent`, `machine`, `workbench`, `spool`, `tarp` | `place`, `G`, `buckets`, `R`, `rnd`, `pick`, `group`, `lights`, `animated`, `footprintFree`, `claimFootprint` | The placement. Nothing calls `tarp`. |
| 507–569 | The overhead clearance banner; `inWalkway`, `runClear`, `slideZ`, `deckAbove` | nothing (they read `MAP_WALKWAYS`) | The room loop |
| 571–577 | `drain` | `place`, `G` | The room loop (835) |
| 579–675 | The placement banner; `ROOM_DRESSING`; `ceilLimit`; `let roomY`; `walkwayFree`, `zoneFree`, `alongWalls` | `R`, `RI`, `isClear`, `againstWall`, `propFree` | The room loop |
| 677–837 | The room loop. For each room: crates, drums, rubble, sandbags, spools and pallets, benches, machines, wall lamps, fluorescents, the emergency light, pipe runs, ducts, beams, cables, chains and a drain | `R`, `RI`, `rnd`, `solid`, `propFree`, 17 builders, `DRUM_HOOP_R` | |
| 839–906 | The hero set pieces: the courtyard truck and barricade, the factory crane, the generator | `place`, `G`, `R`, `isClear`, `propFree`, `solid`, `rubble`, `sandbags`, `ibeam`, `chain`, `machine`, `pipeRun`, `drum` | |
| 908–934 | Merge and attach: `bucketMat`, `propTris`, and the merge loop, which gives `ctx.shotPieces` every piece before merging | `M`, `buckets`, `ctx`, `group` | |
| 936–958 | `update`: the practicals' power, flicker and emissive, and the gauge panels. Then the return. | `lights`, `animated` | map.js (145) |

Blank lines separate the blocks.

Five facts shape the plan:
- **Sections share handles, not variables.**
  - Every name one section takes from another is a `const`: a function (`R`, `place`, the tests, the builders), an object or array changed in place (`G`, `buckets`, `lights`, `animated`, `group`, `ctx`), or the number `DRUM_HOOP_R`.
  - The one `let` is `roomY` (612). The room loop sets it (680), and only `walkwayFree`, `zoneFree` and `alongWalls` read it (626, 644, 667). All four stay together.
  - Only the tests beside them read `footprints`, `keepClear` and `colliders`. Only `place` reads the scratch transforms.
- **The builders only declare.**
  - 188–505 and 571–577 declare 19 functions and two numbers.
  - None of that code runs until the placement calls a builder, so where the builders are declared changes no random draw and no object.
- **The build's output depends on its order, in two ways.**
  - Every prop's position and size, and whether it is placed at all, come from `rnd`, a stream seeded once per call. `propFree` and `alongWalls` also read the colliders that earlier props registered.
  - three gives every geometry, material, mesh and light a uuid drawn from `Math.random`. The map's later sections scatter through `utils.rand`, which also draws from `Math.random`. So an object made earlier, later or not at all would move the risers, lamps and signs.
  - So the placement code (579–906) runs as one piece, at its original point in the build, and the split adds and drops nothing.
- **What stays is what both parts use.**
  - The builders and the placement both call `R`, `rnd`, `place` and `G`.
  - Both use the clearance tests: `pallet` claims its footprint, and the placement tests every spot and registers every collider.
  - The merge reads the buckets the kit fills, and `update` reads the arrays the light fixtures fill.
- **Every map build runs it, and one text pin reads it.**
  - 9 validators build the map. test-cinematic-director builds it for every shot and runs `map.update` 180 times (js/cinematic-director.js:39), which runs `props.update`.
  - validate-prop-cover reads the file by path (235). It pins the handover of the pieces just before the merge (923–924), and that text stays in js/map-props.js.

### 1.2 Mechanism

**This is the map plan's mechanism. Each section becomes a builder in js/map-props/, and `decorateMap` calls the builders in the original order.**
- A builder lists the names it takes as a destructured parameter.
- The builder's body is the section, verbatim and at the same two-space indent. A final line returns the names that later code reads.
- js/map-props.js passes an object literal of exactly those names, and destructures the result under the same names.

js/map-props/builders.js:

```js
export function makePropBuilders({ place, G, buckets, R, rnd, pick, group, lights, animated, footprintFree, claimFootprint }) {
  // … 188–505, then 571–577, verbatim …
  return {
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  };
}
```

js/map-props/placement.js:

```js
export function placeDressing({
  R, RI, rnd, place, G, isClear, againstWall, propFree, solid,
  crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
  wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
}) {
  // … 507–569, then 579–906, verbatim …
}
```

**Two modules, one per question.**

| Module | Takes | Why it's a seam |
|---|---|---|
| builders.js | 188–505, 571–577: the 18 builders the placement calls, `tarp`, `DRUM_R` and `DRUM_HOOP_R` | What each prop looks like. Every builder is only declared here, and none of them runs until the placement calls it. |
| placement.js | 507–569, 579–906: the overhead helpers, `ROOM_DRESSING`, `ceilLimit`, `roomY`, `walkwayFree`, `zoneFree`, `alongWalls`, the room loop and the hero set pieces | Where each prop goes. It runs once, top to bottom. The overhead helpers have no other reader, and `roomY` ties the placer to the loop. |

**What stays is what both modules use:** the seeded stream, the clearance tests and the kit. The merge and `update` also stay, and read what the build filled. In the entry's diff, two blocks are cut and two calls take their place.

What this buys:
- **Every moved line is unchanged.** The one pin keeps matching, and `git diff --color-moved` can show the moves.
- **Each call shows what goes in and what comes out.** Neither module imports the other, so everything that passes between them goes through `decorateMap`.
- **State made per build stays per build.**
  - `footprints`, `lights`, `animated`, `buckets` and `roomY` are made inside each call, as today, so a second build still starts from zero.
  - The only module-level code is `mulberry32`, as today.
- **Mistakes fail the validator loop or the contract test.**
  - Say a body reads a name its builder doesn't take. That line throws when it runs, in 9 validators.
  - Say a builder takes a name its call leaves out. The name arrives as `undefined`. Most such names throw on first use: `rnd`, `place`, or any builder.
  - `DRUM_HOOP_R` doesn't throw. It makes the gap NaN (702), so the second drum of every pair is built and registered at NaN. test-map-props-modules compares every call with its builder's parameter list, as test-map-modules does for js/map/ (§1.7).

Rejected alternatives:
- **The file's own banners as the modules.** A third module, clearance.js, would hold both clearance banners (~180 lines).
  - `pallet` uses two of the ground tests, and the placement uses the rest, so they would come back through the entry anyway.
  - That costs a third call and a 10-name destructure, to move ~100 lines out of an entry that is under the cap without the move.
- **The builders split by the header's three kinds:** trim (pipes, cables, chains, beams and ducts, ~95 lines), clutter (~185) and the lighting rig (~80). That means three calls and three parameter lists, when one module of ~340 lines fits.
- **The hero set pieces left in the entry.** They sit under the "placement" banner, and use the same builders and tests as the room loop. The entry would grow to ~325 and placement.js would shrink to ~340, and neither file gains from it.
- **The overhead helpers at module level.** They read nothing from the closure, but moving them re-indents ~50 lines for no gain. The map plan rejected the same move for `boxBlur` and `makeBrickMaps`.
- **`roomY` as a shared object or a setter,** so the placer's tests could live apart from the loop. It rewrites 626, 644, 667 and 680.
- **A context object.** Rewriting the calls as `kit.place(…)` changes hundreds of lines. Spreading one into the call (`placeDressing({ ...builders })`) hides which names each module takes, so the call check has nothing to compare.
- **One placement loop per kind of prop,** such as every room's crates, then every room's drums. The draws and the colliders would change order, so every prop would move.
- **The modules in js/map/.**
  - test-map-modules requires js/map.js to call every function a js/map/ file exports.
  - `readMapSource()` would pull the new files into map.js's pins.
  - Every split so far named the folder after its entry.

### 1.3 Target modules

Each new file opens with a comment naming its part of the dressing. The comment also says that `decorateMap` in js/map-props.js calls it once per build, passing the names in its parameter list. Then come its import, a blank line, and its builder.

| Module | Takes from map-props.js | Exports | ≈ lines |
|---|---|---|---|
| `js/map-props.js` | 1–11, the header, plus a sentence; 12–13, `THREE` and `mergeGeometries`; the two imports in §1.4; 15–187; the two calls; 907–959 | `decorateMap`, as today | 255 |
| `js/map-props/builders.js` | `import * as THREE from 'three';`. `makePropBuilders`: 188–505, 571–577. | `makePropBuilders` | 340 |
| `js/map-props/placement.js` | 14, with its path one folder deeper: `'../map-layout.js'`. `placeDressing`: 507–569, 579–906. | `placeDressing` | 405 |

Apart from the blank lines between blocks, each line of map-props.js ends up in exactly one of these files. Each banner moves with the block under it. The largest file is placement.js, at ~405.

The builders, in the order js/map-props.js calls them:

| Builder | Takes | Returns |
|---|---|---|
| `makePropBuilders` | `place`, `G`, `buckets`, `R`, `rnd`, `pick`, `group`, `lights`, `animated`, `footprintFree`, `claimFootprint` | `crate`, `DRUM_HOOP_R`, `drum`, `pallet`, `sandbags`, `rubble`, `pipeRun`, `cable`, `chain`, `ibeam`, `duct`, `wallLamp`, `emergencyLight`, `fluorescent`, `machine`, `workbench`, `spool`, `drain` |
| `placeDressing` | `R`, `RI`, `rnd`, `place`, `G`, `isClear`, `againstWall`, `propFree`, `solid`, and the 18 names `makePropBuilders` returns | nothing |

Rules for the new lines:
- **File names are lower case,** like the other split folders, and the folder is named after its entry. Import specifiers must spell both exactly: macOS resolves a wrong case, and Vercel doesn't. The new test checks this (§1.7).
- **`tarp` isn't returned.** Nothing calls it (§1.9), and a builder returns only the names later code reads.
- **No parameter clashes with a declaration.** Neither body declares a name at its top level that its builder also takes. A `const` with a parameter's name would be a SyntaxError.

### 1.4 What stays in js/map-props.js

After step 2:

```js
// Environment art pass: architectural trim, industrial clutter, and the
// … lines 2–10 unchanged …
// session — a level should not reshuffle itself between matches.
//
// The props are built in js/map-props/builders.js and put in place by
// js/map-props/placement.js. This file holds what both use: the seeded stream,
// the clearance tests and the geometry kit. Then it merges the buckets and runs
// the practical lights.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';
import { makePropBuilders } from './map-props/builders.js';
import { placeDressing } from './map-props/placement.js';

// … 16–26, verbatim: the RNG banner and mulberry32 …

export function decorateMap(group, ctx) {
  // … 29–186, verbatim: the stream, the clearance tests, the kit, lights and animated …

  const {
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  } = makePropBuilders({ place, G, buckets, R, rnd, pick, group, lights, animated, footprintFree, claimFootprint });

  placeDressing({
    R, RI, rnd, place, G, isClear, againstWall, propFree, solid,
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  });

  // … 908–958, verbatim: the merge, update and the return …
}
```

The file still exports only `decorateMap`, and its result still has the same three keys.

**No caller changes:**
- js/map.js
- through map.js: game.js, the cinematic director, and the 9 validators that build the map
- js/game/graphics.js, which reads `props.lights`

**Between steps.** After step 1, the placement code is still inline, between the builders' call and the merge. It reads the builders from the destructure, and the entry keeps its map-layout.js import until step 2.

### 1.5 Imports

| File | Imports |
|---|---|
| js/map-props/builders.js | `THREE` |
| js/map-props/placement.js | `MAP_WALKWAYS`, `MAP_TRAVERSAL_ZONES` (../map-layout.js) |
| js/map-props.js | `THREE`; `mergeGeometries`; `makePropBuilders` (./map-props/builders.js); `placeDressing` (./map-props/placement.js). Its map-layout.js import leaves in step 2. |
| js/map.js | Unchanged |

**Cache tokens.**
- map.js imports map-props.js with no query string, and none of map-props.js's imports has one.
- No file in js/ imports map-layout.js with one, so it stays a single instance.
- The new files get no query string either.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/map-props/, and mustn't. This folder ships.

**Load order.**
- builders.js and placement.js each define one function at load, and do nothing else.
- map-layout.js has no imports and only defines tables and functions, so it doesn't matter which importer loads it first.
- No three.js object exists until `decorateMap` runs, as today.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No module in js/map-props/ imports js/map-props.js.** The new test enforces it.
- **Neither module in js/map-props/ imports the other.** Everything that passes between them goes through `decorateMap`. The new test enforces this too.
- **Nothing they import leads back in.**
  - builders.js imports only three, and map-layout.js imports nothing.
  - Only map.js imports map-props.js, and neither new module imports anything from js/map/.

### 1.7 Validators

**One text pin, and its text stays put.**
- validate-prop-cover reads js/map-props.js by path (235).
- It pins `if (ctx.shotPieces) for (const g of geos) ctx.shotPieces.push({ geometry: g, matrix: null });`, followed by `const merged = mergeGeometries` (244).
- Both lines (923–924) stay in the entry's merge loop.
- No other validator reads the file's text, and none pins a name from it. So no `read…Source()` helper is needed, and the read doesn't change.

**No test splits.** No test covers this file alone. validate-prop-cover (261 lines) checks bullet cover across the whole map.

**The behavioural checks cover every step, unchanged.**
- **9 validators build the map:** test-local-player, test-zombie-groans, validate-barrier-alcoves, validate-coplanar-geometry, validate-courtyard-spawns, validate-crash-states, validate-enemy-navigation, validate-prop-cover and validate-shot-occlusion.
  - Each of these mistakes fails them at build: a wrong path, a missing export, or a name a body reads that its builder doesn't take.
  - validate-prop-cover shoots through every prop, and checks each shot against the triangles the prop draws.
  - map.js's build-time audits (94–111) throw if a prop's collider blocks an interactable, the mainframe's east entrance or a route.
- **test-cinematic-director** builds the map for every shot and runs `map.update` 180 times. That runs `props.update` over the lights builders.js makes.
- **Every validator that loads map.js** links the new modules, so a wrong path fails it at load.
- **validate-module-syntax** walks js/ recursively, so it parses the new files.

**New: `scripts/test-map-props-modules.mjs` (~60 lines).** This is the dressing's counterpart of test-map-modules. It checks:
- **js/map-props.js exports exactly `decorateMap`.**
- **No module in js/map-props/ imports js/map-props.js or the other module,** through `assertNoImportOf`.
- **Calls match builders.**
  - Every function a js/map-props/ file exports is called exactly once in js/map-props.js.
  - The call's object literal holds exactly the names in the builder's parameter list.
  - Every name the entry destructures from a builder's result is in that builder's final `return { … }`.
  - The check also runs on three doctored copies of the entry, and must reject each one:
    - `placeDressing`'s call without `DRUM_HOOP_R`, the one name whose absence wouldn't throw
    - a call that passes `drum: crate`
    - a destructure of `tarp`, which `makePropBuilders` doesn't return
- **Each relative specifier** in the entry and in the modules names a file that exists with that exact case. A miscased `./map-props/Builders.js` must be rejected.

**Shared, not copied.** Both checks already exist, as local functions:
- `nameList` and `checkBuilderCalls` in test-map-modules.mjs (40, 42)
- `importsOf` and `onDisk` in test-hellhound-modules.mjs (54, 85)

Step 1 moves the four functions into scripts/lib/split-modules.mjs, and both tests import them from there.
- `checkBuilderCalls` gains the entry and the folder as parameters, for its messages.
- test-map-modules' rejection checks match `must pass mergeSolidGeometry() exactly the names` and `does not return matGlass`. Those fragments don't change.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 57.

**What still isn't caught.**
- Nothing pins where the two calls sit in `decorateMap`. The proof shows it doesn't change during the split.
- What the dressing looks like. The proof compares every geometry, material and light, and the browser check shows them.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

Why this order:
- **Either order works.** Neither module imports the other, and code that hasn't moved yet reads what it needs from the entry's scope.
- **The builders go first,** with the tooling.
  - The body only declares, so the call makes nothing and draws nothing.
  - This step tests the returned-names half of the check, on 18 names.
- **The placement goes second.**
  - It's the largest move and has the longest parameter list.
  - It takes the entry under the cap, and the browser check after it covers both steps.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 1 | The four shared checks moved into split-modules.mjs, with its header; `test-map-props-modules.mjs`; **builders.js** | ~320, leaving ~640 | Low. Verbatim. If the entry leaves a name out of the destructure, a placement line that uses it throws when it runs, in 9 validators, and the proof's name check covers the rest. The call check covers the 11 names passed in. | None beyond the proof. |
| 2 | **placement.js**; the entry as in §1.4, with its header sentence; README.md's layout lines (§1.10) | ~385, leaving ~255 | Low. The largest move, verbatim, and it runs top to bottom on every build. The call check catches a name left out of its call, including `DRUM_HOOP_R`. | The dressing walk, below. |

**Browser check, after step 2.** It needs a local server. Ask John before starting one, and stop it when the check is done. Keep the DevTools console open: any error fails the check.
- **Start solo, and leave the power off.**
  - **Walk every room.**
    - Crates stand against real walls, and some are stacked two high. None stands in a doorway or on a stair.
    - Drums stand upright or lie tipped, and no two drums in a pair intersect. No two pallets overlap.
    - The workbenches have their vices, and the rubble piles have rebar. There are spools, and floor drains indoors.
    - The machines' gauge panels glow green and pulse.
  - **Overhead.**
    - In both corridors, the pipe runs pass under the balcony, not through it.
    - Ducts, cables and chains stay clear of every staircase and of the factory catwalk.
    - The factory has its four I-beams.
  - **The hero set pieces.**
    - The courtyard has the wrecked truck and the sandbag barricade.
    - The factory's crane hook hangs over open floor, north of the catwalk.
    - In the generator room, the generator stands against a wall, clear of Teleporter A, with its pipe run and drums.
  - **The lights.** Indoor wall lamps glow dim, and outdoor ones are dark. The red emergency domes are bright, and the fluorescents in the Animal Lab and Chemical Testing are off.
- **Turn on the power.** The wall lamps brighten, and some flicker. The fluorescents come on, and some stutter. The emergency domes dim.
- **Walk into a crate, a drum and a machine.** Each one stops you. A pallet doesn't.
- **Play one normal round.** Zombies path around the props.
  - Nothing here touches spawning, rounds, models or asset loading, so AGENTS.md's check isn't required.
  - The round is still worth it, because the horde routes around prop colliders.
- The Network tab shows no failed module.

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script outside the repo, not committed.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Import headless-map.mjs for its browser shims, and load map.js through `loadGameModule`.
   - Then call `seedRandom()`, and wrap `Math.random` to count its draws.
   - Build with `buildMap(new THREE.Scene(), { mode: 'solo' })`.
2. **What it prints.**
   - **The whole scene graph,** depth first. An object made out of order would shift every later `utils.rand` draw, so the print covers the map's later sections too. It prints:
     - each object's type, name, uuid, transform, visibility and shadow flags
     - each geometry's uuid, its groups, and a SHA-256 of its attributes and index
     - each material's type, uuid and parameters
     - each light's colour, intensity, distance and decay
   - **The colliders,** in order, every field, with each `cover` hashed.
   - **`map.props`:**
     - `propTris`
     - for each entry in `lights`: the light, bulb and material uuids, `base`, `on`, `off`, `flicker`, `broken`, `emergency`, `fluoro` and `t`
   - **The draw count** of `Math.random` after the build.
   - **The runtime.**
     - 600 frames of `map.props.update(1/60, time, powerOn)`, with the power off for the first 300 and on for the rest.
     - Every 30 frames, each practical light's intensity, and every emissive intensity under the map's group. That includes the gauge panels.
3. **After each step, run it again.** The output must match the baseline byte for byte.
4. **Review the diff.**
   - **Check the moves.** A script cuts each module from the pre-split file by the ranges in §1.3.
     - The ranges must tile the file.
     - Every line that left map-props.js must appear verbatim, in order, in the module meant to hold it.
   - **Check the names.**
     - Each builder's parameter list is exactly the closure names its body reads.
     - Each file uses every name it imports.
     - No body reads a name from the pre-split closure that it neither declares nor takes.
     - This also covers lines that no build reaches, like `tarp`.
   - **Run `git diff --color-moved=zebra`.** The only new lines should be:
     - file headers and imports
     - the builder signatures and returns, and the two calls
     - the entry's header sentence and README.md's lines, in step 2
     - the tooling, in step 1

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **`tarp`** (501–505) is never called.
- **Two buckets are never filled.**
  - No prop is placed in `brick` or `emissive` (137–138), so the merge skips both.
  - `bucketMat` still makes the `emissive` material on every build (916). map.js passes `brick: matBrick` only for `bucketMat`.
  - Removing that material is a behaviour change, not a move: it draws a uuid, so every later `utils.rand` draw would shift.
- **`broken`** (409): no caller passes `opts.broken`, so `update`'s `if (l.broken) target = 0;` (941) never runs.
- **`update`'s second line** (940), `if (l.emergency) target = powerOn ? l.on : l.off;`, repeats line 939. The emergency domes are brighter while the mains are dead because of their `on: 4, off: 11` (429), not because of that line.
- **`update`'s `time` parameter** (936) is never read. map.js passes it (145).

**A doc comment far from its function.**
- `/** Register a solid, non-climbable prop. Returns false if it was rejected. */` (72) sits above the footprint comment, 52 lines before `solid` (124), the function it describes.
- `solid` never returns false, and no caller reads what it returns.

**A comment away from its code.** Lines 603–609 describe `alongWalls`' `clearance` parameter. They sit above `let roomY`, 42 lines before `alongWalls` (651). Both move to placement.js together, so the gap stays the same.

**A stale path.** `ceilLimit`'s comment (596) says the `ceil()` calls are in map.js. They have been in js/map/shell.js since the map split, whose §1.10 listed this comment as optional.

**Six copies of `mulberry32` in js/,** as the hellhound plan counted:
- this file
- js/props/materials.js, which exports its copy
- js/render/ZombieDetail.js and js/render/HellhoundModel.js
- js/audio/ir.js
- js/cinematic-director.js

Importing props/materials.js's copy here would be an import change, not a move.

### 1.10 Docs and comments

- **js/map-props.js's header** gains the sentence in §1.4, in step 2.
- **README.md's layout section** changes at 262, in step 2:
  - `map-props.js`: "Prop dressing entry point: shared kit, merge, practical lights"
  - `map-props/`, a new line after it: "Prop builders; placement by room, and the hero set pieces"
- **scripts/lib/split-modules.mjs's header** gains `test-map-props-modules.mjs (js/map-props/)` in step 1. It also notes that the builder-call and case checks now live there.
- **Optional, and not a move.**
  - RENDERING.md:86 says the practicals "live in `js/map-props.js`". After step 2, builders.js builds the wall lamps, fluorescents and emergency domes, and `props.update` stays in js/map-props.js.
  - The same sentence lists hanging lamps and fires. Those live in js/map/lighting.js and js/map/hand-placed.js, which was already the case before this plan.
  - The stale `ceil()` path in §1.9.
- **Unchanged:**
  - RENDERING.md:311 and :317 stay true: js/map-props.js still dresses from its seeded stream, and map.js still builds the keep-clear list.
  - js/map/hand-placed.js:4, js/map-layout.js:567 and scripts/lib/headless-map.mjs:39 name the file for its seeded stream, which stays in it.
  - AGENTS.md and llms.txt don't name the file.
- **Leave as is:**
  - The docs/split-*.md plans cite js/map-props.js, but they're dated records.
  - README.md's "27 headless validators" was out of date before this plan.

---

## 2. The other 13 files, ranked

None of these files has changed since `docs/split-shaders-plan.md` §2 was written: no commit from `dfda24f` on touches them. The importer counts and the validators' reads in the notes were checked again, and they hold. So the hellhound plan's verdicts and ranks stand, with js/map-props.js taken out of rank 3.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module, with no imports. 13 files import it. After this plan, js/map-props/placement.js replaces js/map-props.js among them. |
| 2 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. Only main.js imports net.js, and main.js and js/main/ reach `Net` only through the instance. game.js and js/map/hand-placed.js import fx.js. |
| 3 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 4 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 5 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
