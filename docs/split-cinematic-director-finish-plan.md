# Split plan: js/cinematic-director.js, steps 3 to 5

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 16 files with 4,591 lines over the cap.

This continues `docs/split-shaders-plan.md`, whose plan is done. It also finishes `docs/split-cinematic-director-plan.md`:
- That plan's steps 1 and 2 landed in `07a5e74` and `b3d6a1b`. They moved the shot data and the functions that read only their arguments into js/cinematic-director/, taking the file from 1,926 lines to 970.
- Its steps 3 and 4 were never carried out, and they cite the 1,926-line file. This plan re-reads the file as it is now and replaces them with steps 3 to 5.

This doc's §2 replaces the shaders plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `5c563b7`, `76fb581` and `12a98b6`, one per step in §1.8. With steps 1 and 2, js/cinematic-director.js went from 1,926 lines to 57, and the largest file in js/cinematic-director/ is playback.js at 384. `count_lines.py` now finds 15 files with 4,121 lines over the cap, with js/render/HellhoundModel.js the largest. It went as planned, with these notes:
- **Actual line counts** are within three lines of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | js/cinematic-director.js | 57 |
  | stage | 51 |
  | world | 145 |
  | cast | 171 |
  | validate | 154 |
  | playback | 384 |
  | debug | 82 |

- **How the moves were made.** A throwaway script built each step's files from the 970-line file by the ranges in §1.3, so each step also rewrote the earlier steps' modules, byte for byte. None of it was committed. Before writing anything, it checked that:
  - the lines between blocks are blank;
  - every edited line (370, 849, 866, 947–948 and 954–955) still read as planned.
- **The proof ran as §1.8 describes,** with two differences. Its scene digest records matrices, colours and intensities unrounded, and hashes each Points and Line object's positions, which is stricter than planned. The shots ran eight at a time, and each run took 42–77 s.
  - The baseline, run twice, matched itself.
  - The repo before step 3 matched it, which proves steps 1 and 2.
  - After each of steps 3, 4 and 5, all 71 outputs matched it exactly: every one of the 20,268 frames. No shot logged an error.
- **The scope check ran on each step's new modules and the entry,** and passed every time.
  - Before step 3 it was tried against a doctored copy of the entry, with `v` dropped from its imports and a write to `SHOTS`. It flagged both.
  - It also checked that every import is used, that each relative import exists with that exact case and exports the name, and that each new module's export list holds exactly the names the other files import from it.
- **The diff review** listed every added line that matches no removed line in the staged diff, which is the test `--color-moved` makes. For each step, that list held only file headers, imports and export lists, plus the step's planned edits:
  - step 3: `buildWorld`'s wrapper and its two statements, `init`'s call to it, and test-cinematic-modules' header;
  - step 4: `validate`'s parameters and its two calls;
  - step 5: the entry's header sentence.
- **The validators number 54,** and all of them passed before step 3 and after every step. test-cinematic-modules now counts 12 modules and 48 relative imports.
- **Browser checks.** None has been run, for any of steps 1 to 5. They need a local server (§1.8).

None of the dead code in §1.9 was touched. The header changes in §1.10 are done.

```
16 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/cinematic-director.js          970           2
js/render/HellhoundModel.js       960           2
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

Total excess lines: 4591
```

The plan has two parts:
1. `js/cinematic-director.js`: the stateful half that's left. Six new modules take it, and the file becomes a ~60-line boot script.
2. The other 15 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/cinematic-director.js: 970 lines → js/cinematic-director.js (~60) + 6 more modules in js/cinematic-director/

### 1.1 What's in it

This is the trailer-capture runtime. cinematic.html loads it, it renders the one shot from `SHOTS` that `?shot=` names, and capture tools drive it frame by frame through `window.__TRAILER__`.

| Lines | Contents | Used by |
|---|---|---|
| 1–14 | The header. Imports of `THREE`, `assets`, `buildMap`, `SoldierVisual`, five zombie names and three weapon names, and of the six modules steps 1–2 made | |
| 16–24 | The URL parameters (`capture`, `requestedShot`, `requestedWeapon`, `initialFrame`, `captureWidth`, `captureHeight`, `stillGate`); the `capture` body class | most functions |
| 26–39 | `mulberry32`, `seedForShot` | `init` |
| 41–61 | The stage: `shot`, the canvas and overlay elements, the renderer, scene and camera, and three lights (`fill`, `rim`, `shotKey`) | most functions |
| 63–88 | 26 module-level bindings: the map, the cast and its props, the frame counters, validation state | most functions |
| 90–207 | `bindOpeningEnvironment`, `updateOpeningEnvironment` | `init`, `seek` |
| 209–214 | `applyState` | `init` |
| 216–356 | `buildCast` | `init` |
| 358–368 | Screen-space helpers: `projectWitness`, `objectScreenRect`, `rectOverlapRatio`, `rectIntersectsCenter80` | `validate`, `debugScene` |
| 370–508 | `validate` | `seek`, `previewCamera` |
| 510–869 | `seek` (344 lines), `renderFrame`, `previewCamera` | `init`, `__TRAILER__` |
| 871–938 | `debugCast`, `debugScene`, `debugMotion` | `__TRAILER__` |
| 940–970 | `init`; `window.__TRAILER__`; the still-gate save button; the resize listener; the `init()` call | |

Five facts shape the plan:
- **What's left is one script over the 26 bindings.**
  - An ES module can read another module's `let` as a live binding, but it can't assign it. So each binding has to move to the module whose code assigns it.
  - Two assignments are in the wrong place for that. `init` assigns `map` and `mapPracticalLamps` (947–948), which belong with the world code. And `validate` reads `frame` and `proofFrame`, which `seek` assigns, while `seek` calls `validate`.
- **The first plan's analysis still holds.** A scope analysis of the file as it is now, with the acorn parser that ships inside Node, gives the same binding owners and import lists as that plan's §1.2 and §1.5, at new line numbers:
  - Once `buildWorld` assigns `map` and `mapPracticalLamps`, no module would assign a binding another module owns.
  - The only import cycle is between `validate` and `seek`, through `frame` and `proofFrame`.
  - No function declares a local with the same name as a module-level binding or import.
- **One validator runs the director now.** scripts/test-cinematic-director.mjs landed with step 2, after the first plan was written.
  - It builds all 71 shots headless, each in its own Node process, the way cinematic.html does with `?capture=1`.
  - It seeks every 10th frame, the frame after each and the last frame, and runs `debugMotion()`, `debugScene()`, `debugCast()` and `previewCamera()`.
  - A binding assigned from the wrong module, or a name a module forgot to import, fails it when that line runs. A line that runs only on frames it doesn't sample isn't covered, so the proof in §1.8 stays.
- **Nothing imports the director, and no validator pins its text.** There are no callers to keep working. cinematic.html, the URL parameters and `__TRAILER__` stay the same, so the capture tools do too.
- **The payoff is lower than for the game files.** The page isn't deployed, and since the release only the split's commits have touched the file.

### 1.2 Mechanism

**Verbatim moves, with export lists,** as in steps 1–2. Each new module ends with an `export { … }` list, so every moved declaration stays byte-identical.

**Each binding moves to the module that assigns it.** Readers import it.

| Bindings | Assigned by | Module |
|---|---|---|
| `map` (63), `mapPracticalLamps` (78) | `buildWorld` (new, below) | world.js |
| `openingEnv` (79) | `bindOpeningEnvironment` (140) | world.js |
| `dog`, `displayWeapon`, `packMachineProp`, `boxSpinProp`, `machineArc`, `monkeyProp`, `chainArcs`, `trapArc`, `viewRig`, `powerPractical`, `powerReach` (66–77); the arrays `actors`, `zombies`, `dgOrder` and `combatTracers` (64–65, 73, 80), which are only pushed to | `buildCast` (224–355) | cast.js |
| `validationHistory` (88) | `validate` (506) | validate.js |
| `papDiamondEquipped`, `papKnucklesStarted` (81–82), `frame`, `proofFrame` (83–84), `lastValidation` (86), and `lastMotionDiagnostics` (87), which nothing uses (§1.9) | `seek` (511–512, 813–814, 849); `previewCamera` also sets `lastValidation` (866) | playback.js |
| `ready` (85) | `init` (956) | the entry |

Setting a field through an import is allowed, so the field writes stay as they are. `seek` sets fields on `powerReach`, the props, the map, `renderer` and `shotKey`. `buildCast` sets `scene.fog`, `scene.background` and the lights' intensity.

**Two code edits.**
1. **`buildWorld()` in world.js.**
   - `init`'s `map=buildMap(scene);` (947) and its `mapPracticalLamps=…` line (948) move into it, and `init` calls `buildWorld();` in their place.
   - The order doesn't change, and both still run inside the seeded `Math.random`.
   - The comment at 954–955 is about the lamps line, so it moves with it.
2. **`validate(camPos,look)` becomes `validate(camPos,look,frame,proofFrame)`.**
   - Its two callers, `seek` (849) and `previewCamera` (866), pass their own.
   - The body doesn't change: its names now resolve to the parameters.

What this buys:
- **No import cycles** (§1.6).
- **Nothing outside the director changes.**
- **`seek` moves whole.** playback.js, the largest new file, is ~385 lines.

Rejected alternatives:
- **One shared state object** (`director.map`, `director.frame`). Every use would change: `map` is used 77 times, `openingEnv` 64 and `frame` 158.
- **Split `seek` into a function per section.** Every section reads `seek`'s locals `t`, `seconds`, `position` and `target`, so each would need them passed in. At 344 lines it fits a file whole.
- **`validate` in playback.js.** It would need no parameters, but playback.js would be ~525 lines, over the cap.
- **Let validate.js import `frame` and `proofFrame` from playback.js.** That's a cycle. It would load, because neither module reads the other while loading, but every split so far has kept its import graph acyclic.
- **`buildWorld` taking all of `init`'s world setup** (947–951: the map, `applyState`, the 180 `map.update` calls and `bindOpeningEnvironment`). The entry would import three fewer names, but five lines would change instead of two.
- **The first plan's step 4 as one commit.** It moved validate, playback and debug together, ~575 lines, with the parameter edit inside. Steps 4 and 5 here give that edit a commit of its own.

### 1.3 Target modules

The six modules from steps 1–2 (math, opening, shots, motion, pose, director-weapon) don't change.

| Module | Takes from cinematic-director.js | Exports | ≈ lines |
|---|---|---|---|
| `js/cinematic-director/stage.js` | 16–24: the URL parameters and the body class. 41–61: `shot`, the overlay elements, the renderer, scene, camera and lights. 358–368: the four screen-space helpers. | 18 names: all but `params`, `captureWidth`, `captureHeight` and `canvas` | 50 |
| `js/cinematic-director/world.js` | 63 `map`, 78 `mapPracticalLamps`, 79 `openingEnv`; `buildWorld`, from 947's assignment, 948 and the comment at 954–955; 90–207 `bindOpeningEnvironment`, `updateOpeningEnvironment`; 209–214 `applyState` | All 7 names | 145 |
| `js/cinematic-director/cast.js` | 64–77 and 80, the cast bindings; 216–356 `buildCast` | All 16 names | 170 |
| `js/cinematic-director/validate.js` | 88 `validationHistory`; 370–508 `validate`, with its two new parameters | `validate` | 155 |
| `js/cinematic-director/playback.js` | 81–84 and 86–87: `papDiamondEquipped`, `papKnucklesStarted`, `frame`, `proofFrame`, `lastValidation`, `lastMotionDiagnostics`. 510–869: `seek`, `renderFrame`, `previewCamera`. | `frame`, `proofFrame`, `lastValidation` and the three functions | 385 |
| `js/cinematic-director/debug.js` | 871–938: `debugCast`, `debugScene`, `debugMotion` | All 3 | 85 |
| `js/cinematic-director.js` | 1–2, the header, plus one sentence; a new import list (§1.4); 26–39 `mulberry32`, `seedForShot`; 85 `ready`; 940–970, with 947–948 as one line | Nothing | 60 |

Ordering, headers and exports, as in steps 1–2:
- Members keep their original relative order. `buildWorld` goes right after the bindings it assigns.
- Each file opens with a `// Cinematic director: …` comment naming its part.
- Each export list holds exactly the names other files import from that module, in declaration order.

### 1.4 What stays in js/cinematic-director.js

It becomes the page's boot script. cinematic.html keeps loading it, and nothing imports it, so it needs no re-exports. After step 5 its imports are:

```js
// Additive, isolated trailer capture runtime. This module is loaded only by
// cinematic.html; it never touches normal gameplay, networking, saves, or input.
// The code is in js/cinematic-director/. This file boots the page.
import {assets} from './assets.js';
import {FPS} from './cinematic-director/math.js';
import {SHOTS} from './cinematic-director/shots.js';
import {capture,requestedShot,requestedWeapon,initialFrame,stillGate,shot,status,overlay,renderer,camera} from './cinematic-director/stage.js';
import {map,buildWorld,applyState,bindOpeningEnvironment} from './cinematic-director/world.js';
import {buildCast} from './cinematic-director/cast.js';
import {lastValidation,seek,renderFrame,previewCamera} from './cinematic-director/playback.js';
import {debugCast,debugScene,debugMotion} from './cinematic-director/debug.js';
```

Inside `init`, lines 947–948 become one:

```js
    await assets.load();buildWorld();
```

The rest of 940–970 is verbatim, `__TRAILER__`'s line included: its names now arrive by import.

**The entry's imports between steps.** Each step drops the names only the moved code used, and adds the moved names the entry still reads.
- **After step 3:**
  - It drops `buildMap` (./map.js), `SoldierVisual` (./player.js), `ZombieVisual`, `createZombieModel`, `buildViewmodel`, `WeaponRig`, `DirectorMover`, `actionAt`, `makeDirectorWeapon` and `attachDirectorWeapon`.
  - It adds 16 names from stage.js (all but `fill` and `rim`), all 7 from world.js and all 16 from cast.js.
- **After step 4:** it drops `shortestAngle`, `quatDelta` and `openingCameraWindowDistance`, and adds `validate`.
- **After step 5:** the list above. `THREE`, ./zombies.js, ./weapons.js, opening.js, motion.js, pose.js and director-weapon.js all leave it.

### 1.5 Imports

Paths are relative to js/cinematic-director/. A module's path is given the first time it appears in the table. These lists come from the scope analysis in §1.1, and the check in §1.8 runs it again on the new files.

| Module | Imports |
|---|---|
| stage.js | `THREE`; `v` (./math.js); `SHOTS` (./shots.js) |
| world.js | `THREE`; `buildMap` (../map.js); `FPS`, `clamp01`; `shot`, `renderer`, `scene`, `shotKey` (./stage.js) |
| cast.js | `THREE`; `SoldierVisual` (../player.js); `ZombieVisual`, `createZombieModel` (../zombies.js); `buildViewmodel`, `WeaponRig` (../weapons.js); `v`; `DirectorMover`, `actionAt` (./motion.js); `makeDirectorWeapon`, `attachDirectorWeapon` (./director-weapon.js); `requestedShot`, `requestedWeapon`, `shot`, `scene`, `camera`, `fill`, `rim`, `shotKey`; `map` (./world.js) |
| validate.js | `THREE`; `FPS`, `shortestAngle`, `worldPoint`, `quatDelta`, `planarDistance`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward` (./opening.js); `openingCameraWindowDistance`, `openingCameraKinematics`; `poseSnapshot` (./pose.js); `shot`, `camera`, `objectScreenRect`, `rectIntersectsCenter80`; `map`, `openingEnv`; `actors`, `zombies`, `dog`, `powerReach` (./cast.js) |
| playback.js | `THREE`; `ZSTATES`, `zombiePoseForState`, `applyHellhoundPose`; `getStats`; `FPS`, `v`, `clamp01`, `blendAngle`, `worldPoint`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward`; `openingRoleLook`, `ACTION_BLEND_FRAMES`, `actionTimeline`, `openingV2CameraPoseAt`, `pointOnRail`; `setBlendedDeterministicPose`, `solveArmIK`, `applyDeterministicFootPlant`; `updateDirectorWeaponBinding`; `capture`, `requestedShot`, `initialFrame`, `shot`, `status`, `overlay`, `renderer`, `scene`, `camera`, `shotKey`; `map`, `mapPracticalLamps`, `openingEnv`, `updateOpeningEnvironment`; all 15 cast bindings; `validate` (./validate.js) |
| debug.js | `THREE`; `v`, `worldPoint`, `planarDistance`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward`; `openingCameraKinematics`; `poseSnapshot`; `requestedShot`, `shot`, `camera`, `projectWitness`, `objectScreenRect`, `rectOverlapRatio`, `rectIntersectsCenter80`; `map`, `openingEnv`; `actors`, `zombies`, `dog`, `viewRig`, `powerReach`, `chainArcs`; `frame`, `proofFrame`, `lastValidation` (./playback.js) |

The entry's list is in §1.4.

**Cache tokens.** None of the director's imports carries a query string, and cinematic.html loads the entry without one. No new import gets one, so each module still loads once, and the soldiers and corpses still find the skeletons `assets` loaded.

**Deploy.** No change. .vercelignore already lists `js/cinematic-director/` (step 1), and test-cinematic-modules checks it. vercel.json needs no change.

**Load order.**
- stage.js creates the renderer, scene, camera and lights before map.js, player.js, js/zombies/ and js/weapons/ evaluate, where today it does so after. None of them touches those objects.
- The shot seed is still installed only inside `init`, after every module has loaded. The objects stage.js creates still take their uuids from the unseeded `Math.random`, as they do today, so the seeded sequence that `buildMap` and `buildCast` draw from doesn't shift.
- The `capture` body class is added earlier. Nothing reads it while loading.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/cinematic-director/ imports js/cinematic-director.js.**
  - test-cinematic-modules enforces it.
  - It holds at every step, because a module moves only after the modules it imports have moved (§1.8).
- **The import graph inside js/cinematic-director/ has no cycles.**
  - Steps 1–2's modules import only math, opening and pose.
  - stage imports math and shots. world imports math and stage.
  - cast imports math, motion, director-weapon, stage and world.
  - validate imports math, opening, motion, pose, stage, world and cast.
  - playback imports all of those, plus director-weapon and validate.
  - debug imports math, opening, motion, pose, stage, world, cast and playback.
- **Nothing they import from outside the folder leads back in.** assets.js, map.js, player.js, zombies.js and weapons.js don't import the director.

### 1.7 Validators

**No text pins, and no test to split.**
- No validator reads the director's code as text. test-cinematic-modules reads only the folder's import lines.
- The two director tests are 136 and 49 lines, and each covers the director as a whole, not one module.
- validate-module-syntax walks js/ recursively, so it parses the new files without a change.

**test-cinematic-director.mjs covers each step as it lands, with no change.** It loads the entry, so it links every new module. A missing export fails every shot at load, and a binding assigned from the wrong module fails when that line runs.

**test-cinematic-modules.mjs needs no code change.**
- Its check that no module imports the entry reads every file in the folder, so it covers the new ones.
- Its page-free list stays at six. stage.js touches the page as it loads, and the other five new modules import it, so test-cinematic-director loads them instead.
- Its header says those modules "are left to cinematic.html". That changes in step 3 (§1.10).

The validators still number 54.

**What still isn't caught.** A missing import on a line that runs only on frames test-cinematic-director doesn't sample fails only when that frame plays. The scope check and the proof's every-frame run (§1.8) cover those lines at split time. A standing scope check would need a JavaScript parser, and the repo vendors none, so it isn't planned.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The imports fix the order: a module can move only once every module it reads from has moved, or it would have to import the entry. Within that order, each step carries at most one code edit.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 3 | **stage.js**; **world.js**, with `buildWorld`; **cast.js**; test-cinematic-modules' header | ~330, leaving ~640 | Low–medium. This is the first step that reads bindings across modules, and it adds the one new function. A write left outside its binding's module throws "Assignment to constant variable" when it runs. | `?shot=armory&weapon=mg42`: no map or fog, and the MG42 turns. `?shot=powerWake`: the lever throws and the lamps wake from frame 144. `?shot=cp06BoxSpin`: the lid opens and a ray gun spins above the box. `?shot=openingOP02V2`: the chain and hook swing. |
| 4 | **validate.js**, with its two parameters and its two calls | ~140, leaving ~500 | Low. The body moves verbatim. It runs on every seek, so test-cinematic-director calls it on every sampled frame of every shot. | None beyond the proof. `validate` draws nothing, and the proof compares its result on every frame. |
| 5 | **playback.js**; **debug.js**; the entry becomes the boot script, with its header sentence | ~435, leaving ~60 | Low–medium. The largest move. `seek`'s branches depend on the shot and the frame, and debug.js reads playback.js's bindings live. | `?shot=papRitual`: the knuckle crack at 250 and the diamond MG42 at 737. `?shot=squadFire`: tracers, and two zombies fall. `?shot=dg2Aftermath`: the chain arcs. `?shot=openingOP11V2&frame=130`: the handoff frame. `?shot=openingOP01V4&capture=1&stillGate=1`: SAVE downloads a PNG. In the console, `__TRAILER__.debugScene()`, `debugMotion()` and `debugCast()` return data. |

**Browser checks.** They open cinematic.html, which needs a local server. Ask John before starting one, and stop it when the check is done. Keep the DevTools console open: any error fails the check.
- Steps 1 and 2 were never checked in a browser, so their checks from the first plan are still due:
  - `?shot=factoryWake`, `?shot=openingOP04V2` and `?shot=cp04PapCycle` each load with no console error and play.
  - `?shot=spawnSquad`: four soldiers run in, both hands on their guns.
  - `?shot=openingOP01V3`: the camera glides without a hitch.
  - `?shot=hellhoundSting`: the hound runs through.
- If John would rather start the server once, run every check after step 5. The proof gates each commit either way.

**Proof for every step.** It runs in plain Node, one shot per process, with no server and no browser. It's a throwaway script outside the repo, not committed.
1. **Build the baseline tree** in a temp folder outside the repo.
   - Extract `git archive HEAD` there.
   - Write `git show 07a5e74^:js/cinematic-director.js` over its js/cinematic-director.js. That's the director as released, which imports nothing from js/cinematic-director/, running on today's map, player, zombie and weapon code.
2. **The script** takes a tree's root and loads that tree's scripts/lib/ helpers, so the baseline and the repo run the same script.
   - Its setup is test-cinematic-director.mjs's `playShot`: the `location` stub (`?capture=1&shot=<name>&width=320&height=180`, plus `&weapon=mg42` for `armory`), `innerWidth` and `innerHeight`, headless-map.mjs, `loadZombieModels()`, the `three` shim with its matrix-only `WebGLRenderer`, the DOM stubs and the no-op `assets.load`.
   - Once `__TRAILER__.ready` is true, it seeks every frame in order. For each frame it prints `seek()`'s return value and `debugMotion()`.
   - Every 30th frame it adds `debugCast()`, `debugScene()` without `colliders`, and the SHA-256 of a scene digest. The digest lists each object in traversal order with its type, name, visibility and rounded `matrixWorld`; each material's color, emissive and opacity; each light's intensity and color; and `renderer.toneMappingExposure`. On a mismatch, it prints the digest for that frame.
   - It ends with one `previewCamera()` at a fixed pose. It prints no ids or uuids: they depend on module load order, which the split changes.
3. **Before step 3,** run the baseline twice to show the run is deterministic, then run the repo. All 71 outputs must match.
   - That proves steps 1–2 as well. Step 1's commit reports this proof, but step 2's reports only the validators and test-cinematic-director.
4. **After each step,** run the repo again. All 71 outputs must match the baseline exactly.
5. **Run the scope check** on the step's new modules and the entry. Parse each with the acorn parser inside Node (`node --expose-internals`, then `require('internal/deps/acorn/acorn/dist/acorn')`). It fails if a file:
   - assigns a name it imports, or
   - reads a name that it neither declares nor imports, and that the file before the step reads only as a global.

   This finds a missing import on a line that no sampled frame reaches.
6. **Review the diff.**
   - Check that every line that left the file is verbatim in a new module.
   - Then run `git diff --color-moved=zebra`. The only new lines should be file headers, imports and export lists; `buildWorld`'s wrapper lines and its two statements; `init`'s call to it; `validate`'s parameters and its two calls; the entry's header sentence; and test-cinematic-modules' header.

If a shot can't be built headless, check that shot in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call. The first plan's §1.9 listed most of it, and all of it is still there.
- **Bindings nothing reads.**
  - `ready` (85) is set by `init` (956) and never read. The page reads `window.__TRAILER__.ready`, which `init` sets on the next line.
  - `lastMotionDiagnostics` (87) is never used.
- **Functions nothing calls.** `stanceFootIndex` and `contactFootIndex`, which step 2 moved to js/cinematic-director/pose.js (138, 144). pose.js doesn't export them.
- **A shot field no shot sets.** No shot has `papAfter`, so `buildCast` never builds a `papDirectorWeapon` (303).
  - The weapon swap in `seek` (690–691) never runs.
  - The checks for a visible PaP weapon at 391, 719 and 874 always pick `directorWeapon`.
- **An unread option.** `buildCast` passes `directorRig:true` to `createZombieModel` (355). For a hound, js/zombies/models.js (22–27) ignores it. The hound always has the rig, and js/render/HellhoundModel.js sets `userData.directorRig` itself (934), which is what `validate` reads (444).
- **A branch that never runs.** `if(actor.gun)actor.gun.visible=false;` (298): `SoldierVisual.gun` is always null (js/player/soldier.js:42). docs/split-player-plan.md noted it too.

**A misplaced comment.** The comment at 954–955, after `init`'s `finally`, describes the lamps line at 948. `buildWorld` puts them back together (§1.2).

**An unknown shot name.** A `?shot=` name that isn't in `SHOTS` renders `factoryWake` (41). But the seed (945), the overlay (857), `seek`'s return value (852), `__TRAILER__.shot` (962) and the still gate's file name (964, 966) all use the unknown name. So the frames carry the wrong name, and they don't match a real `factoryWake` capture, because the seed also sets each corpse's look.

### 1.10 Docs and comments

- **js/cinematic-director.js's header** gains a line in step 5: "The code is in js/cinematic-director/. This file boots the page."
- **scripts/test-cinematic-modules.mjs's header** changes in step 3. That stage.js "and the modules that import it are left to cinematic.html" becomes that they "are loaded by test-cinematic-director.mjs, which stubs the page". Its OK line doesn't change.
- **The status section** goes in this doc once step 5 lands, and covers steps 1 to 5. docs/split-cinematic-director-plan.md stays as the record of steps 1 and 2.
- **Unchanged:**
  - scripts/test-cinematic-director.mjs's header already describes the finished split.
  - README.md, AGENTS.md, RENDERING.md and llms.txt don't name the director's file.
  - The comments elsewhere that mention the cinematic director name no file, so they stay true: js/zombies/poses.js, js/zombies/models.js, js/render/HellhoundModel.js, js/render/WeaponHands.js, js/render/WeaponMaterials.js, js/weapons/world-display.js.
- **Leave as is:** the docs/split-*.md plans cite js/cinematic-director.js, and the player and map plans name cast.js and world.js "once that plan's step 3 lands". They're dated records.

---

## 2. The other 15 files, ranked

None of these files has changed since `docs/split-shaders-plan.md` §2 was written: no commit from `dfda24f` on touches them. So its verdicts and ranks stand. The importer counts, the validators that read or load the files, and the class and function lines the notes cite were checked again, and they hold.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 2 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. main.js and js/main/ reach `Net` only through the instance, so a mixin split changes nothing there. |
| 3 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's were. The map plan's §1.2 mechanism may fit. | Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The only binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like the map plan's §1.8. |
| 4 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 5 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 6 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
