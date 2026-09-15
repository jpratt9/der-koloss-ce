# Split plan: js/cinematic-director.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 21 files with 10,361 lines over the cap.

This continues `docs/split-zombies-plan.md`, whose plan is done. This plan covers the largest file left, `js/cinematic-director.js`. Its §2 replaces that doc's ranking of the other files.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/cinematic-director.js         1926           4
js/map.js                        1895           4
js/player.js                     1809           4
js/audio.js                      1500           3
js/main.js                       1077           3
js/render/shaders.js             1033           3
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

Total excess lines: 10361
```

The plan is in two parts:
1. `js/cinematic-director.js`: the largest file. About half of it moves verbatim. The rest is one script over shared module state, and it splits once each piece of that state lives in the module that assigns it.
2. The other 20 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. js/cinematic-director.js: 1,926 lines → js/cinematic-director.js (~60) + 12 modules in js/cinematic-director/

### 1.1 What's in it

This is the trailer-capture runtime. cinematic.html loads it, it renders the one shot from `SHOTS` that `?shot=` names, and capture tools drive it frame by frame through `window.__TRAILER__`.

| Lines | Contents | Used by |
|---|---|---|
| 1–8 | The header; imports of `THREE`, `assets`, `buildMap`, `SoldierVisual`, five zombie names and three weapon names | |
| 10–19 | `FPS`; the URL parameters (`capture`, `shot`, `weapon`, `frame`, `width`, `height`, `stillGate`); the `capture` body class | most functions |
| 21–34 | `mulberry32`, `seedForShot` | `init` |
| 36–228 | `v`; the opening plates: the gameplay t0 receipt, `openingPlate`, the V1 casts, the V2–V4 camera keys, casts and visual gates, and `openingV2Plate` to `openingV4Plate` | `SHOTS`. `OPENING_GAMEPLAY_T0` is also read by the camera track, `validate`, `seek` and `debugScene`. |
| 230–564 | `cinematicPackShot` and `SHOTS`: 71 shots (24 opening plates, 21 named shots, 26 cinematic-pack plates) | the stage, `init`, `__TRAILER__.manifest` |
| 566–586 | The stage: `shot`, the overlay elements, the renderer, scene and camera, three lights | most functions |
| 588–613 | 26 module-level bindings: the map, the cast and its props, the frame counters, validation state | most functions |
| 615–622 | `clamp01`, `shortestAngle`, `blendAngle` | motion, IK, `seek`, `validate` |
| 624–741 | `bindOpeningEnvironment`, `updateOpeningEnvironment` | `init`, `seek` |
| 743–844 | `openingRoleLook`, `DirectorMover`, `actionAt`, `ACTION_BLEND_FRAMES`, `actionTimeline` | `buildCast`, `seek` |
| 846–965 | Deterministic clip sampling, bone chains, arm IK, foot plants | `seek`, the director weapon |
| 967–1048 | The director weapon: build it, bind it, re-solve the grips | `buildCast`, `seek` |
| 1050–1197 | `applyState`, `buildCast` | `init` |
| 1199–1287 | The opening camera track (quintic Hermite) and its kinematics; `pointOnRail` | `seek`, `validate`, `debugScene` |
| 1289–1324 | Helpers: world position and quaternion, `poseSnapshot`, screen rects, two stance helpers | `validate`, the debug functions, IK |
| 1326–1464 | `validate` | `seek`, `previewCamera` |
| 1466–1825 | `seek` (344 lines), `renderFrame`, `previewCamera` | `init`, `__TRAILER__` |
| 1827–1894 | `debugCast`, `debugScene`, `debugMotion` | `__TRAILER__` |
| 1896–1926 | `init`; `window.__TRAILER__`; the still-gate save button; the resize listener; the `init()` call | |

Four facts shape the plan:
- **Nothing imports it, and no validator covers it.**
  - cinematic.html is its only loader, and .vercelignore keeps both off the deploy.
  - No validator reads its text or loads it. validate-module-syntax only parses it.
  - So there are no callers to keep working and no pins to move. But nothing fails when a split breaks a shot, so the headless proof in §1.8 is the guard.
- **About half of it never touches module state.** The shot data, the helpers, and the motion, pose, IK and weapon functions read only their arguments and constants. They move verbatim.
- **The rest is one script over those 26 bindings.**
  - An ES module can read another module's `let` as a live binding, but it can't assign it. So each binding has to move to the module whose code assigns it.
  - Two assignments are in the wrong place for that. `init` assigns `map` and `mapPracticalLamps`, which belong with the world code. And `validate` reads `frame` and `proofFrame`, which `seek` assigns, while `seek` calls `validate`.
- **The payoff is lower than for the game files.** The page isn't deployed, and the file has had one commit, the release.

### 1.2 Mechanism

**Verbatim moves, with export lists.** The file exports nothing today. Each new module ends with an `export { … }` list, as js/zombies/states.js does, so every moved declaration stays byte-identical.

**Each binding moves to the module that assigns it.** Readers import it.

| Bindings | Assigned by | Module |
|---|---|---|
| `map`, `mapPracticalLamps` | `buildWorld` (new, below) | world.js |
| `openingEnv` | `bindOpeningEnvironment` | world.js |
| `dog`, `displayWeapon`, `packMachineProp`, `boxSpinProp`, `machineArc`, `monkeyProp`, `chainArcs`, `trapArc`, `viewRig`, `powerPractical`, `powerReach`; the arrays `actors`, `zombies`, `dgOrder`, `combatTracers` | `buildCast` | cast.js |
| `validationHistory` | `validate` | validate.js |
| `frame`, `proofFrame`, `papKnucklesStarted`, `papDiamondEquipped`, `lastValidation` | `seek`, and `previewCamera` for `lastValidation` | playback.js |
| `ready` | `init` | the entry |

`seek` still sets fields on `powerReach`, the props and the map. Setting a field through an import is allowed.

**Two code edits.**
1. **`buildWorld()` in world.js.**
   - `init`'s `map=buildMap(scene);` and its `mapPracticalLamps=…` line move into it, and `init` calls `buildWorld();` in their place.
   - The order doesn't change, and both lines still run inside the seeded `Math.random`.
   - The comment at 1910–1911 is about the lamps line, so it moves with it.
2. **`validate(camPos,look)` becomes `validate(camPos,look,frame,proofFrame)`.**
   - Its two callers, `seek` (1805) and `previewCamera` (1822), pass their own.
   - The body doesn't change: its names now resolve to the parameters.

What this buys:
- **No import cycles** (§1.6).
- **Nothing outside the file changes.** `__TRAILER__`, the URL parameters and cinematic.html stay the same, so the capture tools do too.
- **`seek` moves whole.** playback.js, the largest new file, is ~390 lines.

Rejected alternatives:
- **Move only the stateless half.** The entry would still be ~980 lines.
- **One shared state object** (`director.map`, `director.dog`). Every read would change: `map` is read 81 times, `openingEnv` 65 and `frame` about 165.
- **Split `seek` into a function per section.** Every section reads `seek`'s locals `t`, `seconds`, `position` and `target`, so each would need them passed in. At 344 lines it fits a file whole.
- **Let validate.js and playback.js import each other.** ES modules allow it, because neither reads the other while loading. But every split so far has kept its import graph acyclic.

### 1.3 Target modules

| Module | Takes from cinematic-director.js | ≈ lines |
|---|---|---|
| `js/cinematic-director.js` | The header (1–2) and a new import list (§1.4); 21–34 `mulberry32`, `seedForShot`; 610 `ready`; 1896–1926, `init` through the `init()` call | 60 |
| `js/cinematic-director/math.js` | 10 `FPS`; 36 `v`; 615–622 `clamp01`, `shortestAngle`, `blendAngle`; 1289–1290 `worldPoint`, `worldQuat`; 1301–1302 `quatDelta`, `planarDistance` | 25 |
| `js/cinematic-director/opening.js` | 37–228: `OPENING_GAMEPLAY_T0` through `openingV4Plate` | 200 |
| `js/cinematic-director/shots.js` | 230–564: `cinematicPackShot`, `SHOTS` | 345 |
| `js/cinematic-director/motion.js` | 743–844: `openingRoleLook`, `DirectorMover`, `actionAt`, `ACTION_BLEND_FRAMES`, `actionTimeline`. 1199–1287: `openingCameraTrackCache` through `openingCameraKinematics`, and `pointOnRail`. | 200 |
| `js/cinematic-director/pose.js` | 846–965: `resetSkeleton` through `applyDeterministicFootPlant`. 1291–1300: `boneBySide`, `poseSnapshot`. 1314–1324: `stanceFootIndex`, `contactFootIndex`. | 150 |
| `js/cinematic-director/director-weapon.js` | 967–1048: `bindDirectorWeapon`, `updateDirectorWeaponBinding`, `makeDirectorWeapon`, `attachDirectorWeapon` | 90 |
| `js/cinematic-director/stage.js` | 11–19: the URL parameters and the body class. 566–586: `shot`, the overlay elements, the renderer, scene, camera and lights. 1303–1313: `projectWitness`, `objectScreenRect`, `rectOverlapRatio`, `rectIntersectsCenter80`. | 55 |
| `js/cinematic-director/world.js` | 588 `map`, 603 `mapPracticalLamps`, 604 `openingEnv`; `buildWorld`, from 1903's assignment, 1904 and the comment at 1910–1911; 624–741 `bindOpeningEnvironment`, `updateOpeningEnvironment`; 1050–1055 `applyState` | 145 |
| `js/cinematic-director/cast.js` | 589–602 and 605, the cast bindings; 1057–1197 `buildCast` | 175 |
| `js/cinematic-director/validate.js` | 613 `validationHistory`; 1326–1464 `validate` | 155 |
| `js/cinematic-director/playback.js` | 606–609 and 611–612: `papDiamondEquipped`, `papKnucklesStarted`, `frame`, `proofFrame`, `lastValidation`, `lastMotionDiagnostics` (unused, §1.9). 1466–1825: `seek`, `renderFrame`, `previewCamera`. | 390 |
| `js/cinematic-director/debug.js` | 1827–1894: `debugCast`, `debugScene`, `debugMotion` | 85 |

Ordering, headers and exports:
- Members keep their original relative order. `buildWorld` goes right after the bindings it assigns.
- Each file opens with a comment naming its part of the director.
- Each export list holds exactly the names §1.5 shows other files importing from that module. The rest stay private, including the visual gates, the camera track's internals, `setDeterministicPose`, `bindDirectorWeapon`, and the stage's `params`, `captureWidth`, `captureHeight` and `canvas`.

### 1.4 What stays in js/cinematic-director.js

It becomes the page's boot script. cinematic.html keeps loading it, and nothing imports it, so it needs no re-exports.

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

Inside `init`, lines 1903–1904 become one:

```js
    await assets.load();buildWorld();
```

The rest of 1896–1926 is verbatim, `__TRAILER__`'s line included: its names now arrive by import.

### 1.5 Imports

Paths are relative to js/cinematic-director/. A module's path is given the first time it appears in the table.

| Module | Imports |
|---|---|
| math.js | `THREE` |
| opening.js | `v` (./math.js) |
| shots.js | `v`; `openingPlate`, `openingV2Plate`, `openingV3Plate`, `openingV4Plate`, and the 11 `OPENING_*` casts and camera keys the shots name (./opening.js) |
| motion.js | `THREE`; `FPS`, `clamp01`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward` |
| pose.js | `THREE`; `clamp01`, `worldPoint`, `worldQuat` |
| director-weapon.js | `THREE`; `worldPoint`; `findArmChain`, `solveArmIK` (./pose.js); `buildViewmodel`, `WeaponRig` (../weapons.js) |
| stage.js | `THREE`; `v`; `SHOTS` (./shots.js) |
| world.js | `THREE`; `FPS`, `clamp01`; `buildMap` (../map.js); `shot`, `renderer`, `scene`, `shotKey` (./stage.js) |
| cast.js | `THREE`; `v`; `DirectorMover`, `actionAt` (./motion.js); `makeDirectorWeapon`, `attachDirectorWeapon` (./director-weapon.js); `shot`, `requestedShot`, `requestedWeapon`, `scene`, `camera`, `fill`, `rim`, `shotKey`; `map` (./world.js); `SoldierVisual` (../player.js); `ZombieVisual`, `createZombieModel` (../zombies.js); `buildViewmodel`, `WeaponRig` |
| validate.js | `THREE`; `FPS`, `shortestAngle`, `worldPoint`, `quatDelta`, `planarDistance`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward`; `openingCameraWindowDistance`, `openingCameraKinematics`; `poseSnapshot`; `shot`, `camera`, `objectScreenRect`, `rectIntersectsCenter80`; `map`, `openingEnv`; `actors`, `zombies`, `dog`, `powerReach` (./cast.js) |
| playback.js | `THREE`; `FPS`, `v`, `clamp01`, `blendAngle`, `worldPoint`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward`; `openingRoleLook`, `ACTION_BLEND_FRAMES`, `actionTimeline`, `openingV2CameraPoseAt`, `pointOnRail`; `setBlendedDeterministicPose`, `applyDeterministicFootPlant`, `solveArmIK`; `updateDirectorWeaponBinding`; `capture`, `requestedShot`, `initialFrame`, `shot`, `status`, `overlay`, `renderer`, `scene`, `camera`, `shotKey`; `map`, `mapPracticalLamps`, `openingEnv`, `updateOpeningEnvironment`; all 15 cast bindings; `validate` (./validate.js); `getStats`; `ZSTATES`, `zombiePoseForState`, `applyHellhoundPose` |
| debug.js | `THREE`; `v`, `worldPoint`, `planarDistance`; `OPENING_GAMEPLAY_T0`, `openingGameplayForward`; `openingCameraKinematics`; `poseSnapshot`; `requestedShot`, `shot`, `camera`, `projectWitness`, `objectScreenRect`, `rectOverlapRatio`, `rectIntersectsCenter80`; `map`, `openingEnv`; `actors`, `zombies`, `dog`, `viewRig`, `powerReach`, `chainArcs`; `frame`, `proofFrame`, `lastValidation` (./playback.js) |

The entry's list is in §1.4. It no longer imports `THREE`, `buildMap`, `SoldierVisual`, or the zombie and weapon names: each goes to the modules above that use it.

**Cache tokens.**
- None of the director's imports carries a query string, and no new import gets one.
- `../assets.js`, `../player.js`, `../zombies.js` and `../weapons.js` resolve to the same URLs the rest of the page's import graph uses. So `assets` stays one instance, and the soldiers and corpses still find the skeletons it loaded.

**Deploy.** .vercelignore names `js/cinematic-director.js` only. Step 1 adds `js/cinematic-director/` beneath it. Without that line, every new module would deploy under /js/cinematic-director/. vercel.json needs no change.

**Load order.** stage.js creates the renderer before map.js, player.js, js/zombies/ and js/weapons/ evaluate, where today it does so after. None of them touches it, and `Math.random` is still seeded only inside `init`, after every module has loaded.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/cinematic-director/ imports js/cinematic-director.js.**
  - The new test enforces it.
  - It holds at every step, because a module moves only after the modules it imports have moved (§1.8).
- **The import graph inside js/cinematic-director/ has no cycles:**
  - math imports nothing from the folder. opening and pose import math.
  - motion and shots import math and opening. director-weapon imports math and pose.
  - stage imports math and shots. world imports math and stage. cast imports math, motion, director-weapon, stage and world.
  - validate imports math, opening, motion, pose, stage, world and cast.
  - playback imports all of those, plus director-weapon and validate.
  - debug imports math, opening, motion, pose, stage, world, cast and playback.
- **Nothing they import from outside the folder leads back in.** assets.js, map.js, player.js, zombies.js and weapons.js don't import the director.

### 1.7 Validators

**Nothing to switch, and no test to split.**
- No validator reads the director's text or loads it, and none covers any of its code.
- validate-module-syntax walks js/ recursively, so it parses the new files without a change.
- validate-no-scratch-pages checks root HTML files, and cinematic.html doesn't change.

**New: `scripts/test-cinematic-modules.mjs` (~45 lines).** This is test-zombie-modules' counterpart, for the checks that fit a page script. It checks:
- No module in js/cinematic-director/ imports js/cinematic-director.js, through `assertNoImportOf`.
- .vercelignore has `cinematic.html`, `js/cinematic-director.js` and `js/cinematic-director/` as lines. A dropped folder line is the one deploy regression this split can cause.
- The modules that don't touch the page load in Node through `loadGameModule`: math, opening and shots from step 1, then motion, pose and director-weapon from step 2. Loading them links every import among them and builds all 71 shots.

It doesn't load stage.js, or anything that imports it, because stage.js reads `location`, queries the DOM and creates a WebGLRenderer as it loads.

split-modules.mjs's header comment gains the new test's name. The validators number 43.

**What still isn't caught.** If a moved function uses a name its new module doesn't import, it fails only when that line runs. Only the proof in §1.8 and the browser reach every shot's branches.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks open cinematic.html, which needs a local server. Ask John before starting one, and stop it when the check is done.

This order is also the dependency order: the stateless modules first, then the stage, world and cast, then the code that reads them.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 1 | The .vercelignore line; `test-cinematic-modules.mjs`; **math.js**, **opening.js**, **shots.js** | ~540 | Very low. Data and one-line helpers, verbatim. `SHOTS` builds every shot as shots.js loads, and the new test loads it. | `?shot=factoryWake`, `?shot=openingOP04V2` and `?shot=cp04PapCycle` each load with no console error and play |
| 2 | **motion.js**, **pose.js**, **director-weapon.js** | ~415 | Low. Functions of their arguments, verbatim. Every moving actor, zombie and hound evaluates a `DirectorMover` every frame, and every soldier re-solves both grips. | `?shot=spawnSquad`: four soldiers run in, both hands on their guns. `?shot=openingOP01V3`: the camera glides without a hitch. `?shot=hellhoundSting`: the hound runs through. |
| 3 | **stage.js**; **world.js**, with `buildWorld`; **cast.js** | ~325 | Low–medium. This is the first step that reads bindings across modules, and it adds the one new function. A write left outside its binding's module throws "Assignment to constant variable" when it runs. | `?shot=armory&weapon=mg42`: no map or fog, and the MG42 turns. `?shot=powerWake`: the lever throws and the lamps wake from frame 144. `?shot=cp06BoxSpin`: the lid opens and a ray gun spins above the box. `?shot=openingOP02V2`: the chain and hook swing. |
| 4 | **validate.js**, with its two parameters; **playback.js**; **debug.js**. The entry becomes the boot script. | ~575 | Low–medium. `validate`'s signature and its two calls change, and debug.js reads playback.js's bindings live. | `?shot=papRitual`: the knuckle crack at 250 and the diamond MG42 at 737. `?shot=squadFire`: tracers, and two zombies fall. `?shot=dg2Aftermath`: the chain arcs. `?shot=openingOP11V2&frame=130`: the handoff frame. `?shot=openingOP01V4&capture=1&stillGate=1`: SAVE downloads a PNG. In the console, `__TRAILER__.debugScene()`, `debugMotion()` and `debugCast()` return data. |

**Proof for every step.** It runs in plain Node, one shot at a time, with no server and no browser. It's a throwaway script, not committed.
1. **Take a baseline before step 1, and run it twice** to show the run is deterministic.
   - Run each shot in its own Node process, because stage.js reads `location.search` once, as it loads.
   - Build on headless-map.mjs, which also installs headless-three.mjs, and on headless-zombies.mjs.
   - **Stubs:**
     - `location.search` is `?capture=1&shot=<name>&width=320&height=180`, with `&weapon=mg42` for the armory. `capture=1` also keeps `init` from starting its animation loop.
     - `document.querySelector`, `document.body.classList`, `innerWidth` and `innerHeight`. validate-frame-budget stubs the same shapes.
     - A resolve hook, registered after headless-three's, maps `three` to a shim. The shim does `export *` from the vendored module and adds a `WebGLRenderer` whose `render(scene)` only calls `scene.updateMatrixWorld()`, as the real one does before it draws. A local export wins over `export *`, so every other class is still the vendored one.
     - `loadZombieModels()` loads the skeletons that SoldierVisual and ZombieVisual clone. Then `assets.load` is replaced with a no-op.
2. **What it prints.** Once `__TRAILER__.ready` is true, it seeks every frame in order. For each frame it prints `seek()`'s return value and `debugMotion()`. Every 30th frame it adds:
   - `debugCast()`
   - `debugScene()`, without `colliders`, which don't change and hold object references
   - the SHA-256 of a scene digest. The digest lists each object in traversal order with its type, name, visibility and rounded `matrixWorld`; each material's color, emissive and opacity; each light's intensity and color; and `renderer.toneMappingExposure`. On a mismatch, print the digest for that frame.

   It ends with one `previewCamera()` at a fixed pose. It prints no ids or uuids: they depend on module load order, which the split changes.
3. **After each step, run it again.** All 71 outputs must match the baseline exactly.
4. **Review the diff.**
   - Check that every line that left the file is verbatim in a new file.
   - Then run `git diff --color-moved=zebra`. The only changed lines should be file headers, imports, export lists, `buildWorld`'s two wrapper lines, `init`'s call to it, and `validate`'s parameters and two calls.

If a shot can't be built headless, check that shot in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **Bindings nothing reads.**
  - `ready` (610) is set by `init` and never read. The page reads `window.__TRAILER__.ready`, which `init` sets on the next line.
  - `lastMotionDiagnostics` (612) is never used.
- **Functions nothing calls.** `stanceFootIndex` (1314) and `contactFootIndex` (1320).
- **A shot field no shot sets.** No shot has `papAfter`, so `buildCast` never builds a `papDirectorWeapon` (1144).
  - The weapon swap in `seek` (1647) never runs.
  - The checks for a visible PaP weapon at 1347, 1675 and 1830 always pick `directorWeapon`.
- **An unread option.** `buildCast` passes `directorRig:true` to `createZombieModel` (1196), which doesn't read it. split-zombies-plan.md §1.9 lists the same option.

**An unknown shot name.** A `?shot=` name that isn't in `SHOTS` renders `factoryWake` (566). But the seed (1901), the overlay (1813) and `__TRAILER__.shot` (1918) all use the unknown name. So the frames carry the wrong name, and they don't match a real `factoryWake` capture, because the seed also sets each corpse's look.

### 1.10 Docs and comments

- **js/cinematic-director.js's header** gains a line: "The code is in js/cinematic-director/. This file boots the page."
- **Unchanged:**
  - README.md, AGENTS.md, RENDERING.md and llms.txt don't name the director's file.
  - The comments elsewhere that mention the cinematic director name no file, so they stay true: js/zombies/poses.js, js/zombies/models.js, js/render/HellhoundModel.js, js/render/WeaponHands.js, js/render/WeaponMaterials.js, js/weapons/world-display.js.
- **Leave as is:** the docs/split-*.md plans cite js/cinematic-director.js, but they're dated records.

---

## 2. The other 20 files, ranked

These verdicts come from the structural skim behind `docs/split-weapons-plan.md` §2, which `docs/split-zombies-plan.md` §2 carried forward.
- Since that skim, only index.html has changed, in the style split. The zombies split didn't touch any of these files.
- These facts were checked again: the importers of HellhoundModel.js, WeaponMaterials.js, props/materials.js, WeaponParts.js and ZombieDetail.js, and the validators that read player.js and shaders.js.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/player.js | 1,809 | Clean: `LocalPlayer` (11–630); the avatar section's imports, height constants and eye, atlas and arm-IK helpers (632–1070); `SoldierVisual` (1071–1579); `RemotePlayer` (1580–1809) | `LocalPlayer` (620 lines) and `SoldierVisual` (509) are each over the cap alone: use `installMixins`, or accept them. 7 validators read its text. `SoldierVisual` imports the bounds functions from zombies.js, whose re-export list keeps them. |
| 2 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. validate-performance-invariants and validate-coplanar-surfaces read the file's text by path, so they need a source helper like `readZombiesSource()`. |
| 3 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` and `auditMapEgress` on the other | Pure module |
| 4 | js/audio.js | 1,500 | One 1,323-line `AudioEngine` (177–1500). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | none |
| 5 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move first, the same problem §1.2 solves here: each binding goes to the module that assigns it. Heavily pinned. |
| 6 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–785). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 7 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Keep each re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. map.js, 7 files in js/props/ and validate-coplanar-surfaces import props/materials. |
| 8 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Keep each re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 9 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so low payoff |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal: one class each, 60–180 lines over | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/map.js (1,895 lines).**
  - One `buildMap` closure is 1,833 lines, and every inner helper reads its locals.
  - Splitting it means threading a context object through all of it.
  - Every headless-map validator builds the map through it.
- **js/map-props.js (959 lines).** One 933-line `decorateMap` closure, with the same problem.
- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) can move out to a module file, which still leaves ~700 lines.
