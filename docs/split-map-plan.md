# Split plan: js/map.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 20 files with 8,096 lines over the cap.

This continues `docs/split-player-plan.md`, whose plan is done. The director split in `docs/split-cinematic-director-plan.md` is still half done, with steps 3 and 4 left. This plan touches none of that split's files.

This plan covers `js/map.js`, the largest file. Every plan since `docs/split-large-files-plan.md` listed it under "No clean seam", based on a skim: `buildMap` is one closure, and splitting it meant threading a context object through all of it. A full read reverses that (§1.1):
- The closure's sections sit one after another, and each does one job.
- Every name a section takes from another is a `const`. Each of the three `let`s belongs to a single section.
- So each section can move verbatim into a builder that takes those names as a destructured parameter. The weapon model builders already take `buildViewmodel`'s context this way.

This doc's §2 replaces the player plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `5dbf9b4` to `70ec93e`, one per step in §1.8. js/map.js is now 321 lines, and the largest file in js/map/ is hand-placed.js at 414. `count_lines.py` now finds 19 files over the cap, with js/audio.js the largest. It went as planned, with these notes:
- **Actual line counts** are within four lines of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | js/map.js | 321 |
  | surfaces | 242 |
  | shell | 278 |
  | elevation | 159 |
  | doors | 90 |
  | hand-placed | 414 |
  | interactables | 230 |
  | risers | 59 |
  | lighting | 152 |
  | signage | 65 |

- **map.js's imports shrank one step at a time.** Each step dropped only the names that the moved section alone used, and kept the remaining names on their original lines. So the final map-layout import holds §1.4's four names on two lines, not one.
- **How the moves were made.** A throwaway script cut each module from the pre-split map.js by line range. It checked three things: each builder's parameter list against the closure names its section reads, each module's imports against the names its body uses, and that every original line landed verbatim. None of it was committed.
- **The proof ran as §1.8 describes.**
  - It built with `mode: 'solo'` and then `mode: 'host'`, in one process, seeding `Math.random` after the imports.
  - Each run printed 3,240 lines (2.1 MB):
    - 869 scene objects per build, with every geometry, material, texture and light
    - the handle, key by key
    - `roomAt` and `floorY` on a 0.5 m grid at three heights, and `findPath` for every pair of rooms
    - 600 frames of `update` through power off, power on, a linked and a charging teleporter, Pack-a-Punch processing, and ready
    - every door opened; then the box moved to each of its six locations, and given validate-crash-states' eight bad indices and its numeric string. After each call, `getNavGrid(map).nodeAt` was sampled on a 1 m grid.
  - It was run twice before step 1 to show the run is deterministic, and again after every step. The output was identical each time.
  - After each step, a second script listed every line that wasn't in the previous commit's map files. Only file headers, imports, builder signatures, returns, the builder calls, the re-export line and blank lines were new.
- **The validators number 49 in the loop:** the 48 from before, plus test-map-modules.mjs. All of them passed before step 1 and after every step.
- **Browser checks.** None of the checks in §1.8 have been run. They need a local server.

None of the dead code or keep-clear entries in §1.9 were touched, and the five unused utils.js names are still on map.js's import. README.md's layout lines from §1.10 are done. The optional comment updates in §1.10 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/map.js                        1895           4
js/audio.js                      1500           3
js/main.js                       1077           3
js/render/shaders.js             1033           3
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

Total excess lines: 8096
```

The plan has two parts:
1. `js/map.js`: nine sections move verbatim into builders in js/map/. map.js calls the builders in the original order. It keeps the environment-art pass, the shot cover, the runtime and the map handle.
2. The other 19 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/map.js: 1,895 lines → js/map.js (~325) + 9 modules in js/map/

### 1.1 What's in it

`buildMap(scene, opts)` builds the factory into one group. It returns the map handle that game.js, js/game/, the cinematic director and the validators use. The function spans lines 64–1895, 1,832 of the file's lines.

| Lines | Contents | Takes from earlier sections | Hands on |
|---|---|---|---|
| 1–31 | The header and imports | | |
| 32 | `WALL_T` | | `wallRun` |
| 34–62 | Art direction: `MOON_DIR`, `GRADE` | | The sky, the moon light and `api.grade`. No module imports either export. |
| 64–75 | `buildMap` opens: `group`, `colliders`, `let api`, `barriers`, `risers`, `doors`, `interact`, `flickerLights`, `fires` | | every section |
| 77–265 | Surfaces: `boxBlur`, `makeBrickMaps`, `pbr` and the materials, the `solidGeos` buckets, `shotPieces`, `worldUVs`, `pushBox` | nothing | `pbr`, the 10 material names, `solidGeos`, `shotPieces`, `pushBox` |
| 267–532 | Shell: `wallRun`; the window barriers (`let barrierId`, `addBarrier`, `updateBoardsVisual`); `rooms`, `roomAt`; the wall runs and `auditMapStructure`; the ceilings; the dirt plane and the room floor slabs | `group`, `colliders`, `barriers`; `solidGeos`, `pushBox`, `matWood`, `matDirt`, `matFloor` | `rooms`, `roomAt`, `H`, `HH` |
| 534–682 | Elevation: `floorZones`, `ramps`, `floorY`; the balcony, chem and bridge decks and the bridge rails; the spawn platform with its nosings and fascia colliders; `encloseStairFlight`; both balcony flights | `group`, `colliders`; `solidGeos`, `pushBox`, `matMetal` | `floorZones`, `ramps`, `floorY`, `encloseStairFlight` |
| 684–762 | Doors: leaves, frames, lamps, colliders and interact entries; `auditMapEgress`; `navLinks`, `findPath` | `group`, `colliders`, `interact`, `doors`; `rooms`; `ramps` | `navLinks`, `findPath` |
| 764–1162 | Hand-placed props: 7 helpers (`crate` to `bigGenerator`); the props room by room, including the factory catwalk (960–1087); the telephone poles and wires; the old blood | `group`, `colliders`, `fires`; `solidGeos`, `pushBox`, `pbr`, `matMetal`, `matPlate`, `matDark`, `matWood`; `encloseStairFlight`; `H`, `HH` | nothing |
| 1164–1372 | Interactables: wall-buys, perk machines, the power switch, the teleporters and the mainframe pad, Pack-a-Punch, the mystery box, traps, the gramophone, the radio | `opts`, `group`, `colliders`, `interact`; `matMetal`, `matWood` | 16 names: `wallbuys`, `perks`, `power`, `powerProp`, `teleporters`, `mainframe`, `pap`, `papMachine`, `papEnergy`, `papCore`, `papCoreMat`, `papSlot`, `box`, `boxG`, `boxProp`, `traps` |
| 1374–1434 | `decorateMap`, and the three build-time audits over the colliders it adds to | 20 names from the opening, surfaces, shell, elevation and interactables | `props` |
| 1436–1486 | Risers: `riser` and the eight ground spawns | `group`, `risers`; `matConcrete` | nothing |
| 1488–1596 | Fog and dust; the sky; the lights: hemisphere, the moon with its `SunShadow`, room lamps, fire lights | `group`, `fires`; `matDark` | `fogPatches`, `dust`, `dustN`, `sky`, `moonLight`, `sunShadow`, `lamps` |
| 1598–1655 | Signage: `wallSign` and 11 signs | `group` | nothing |
| 1657–1690 | The merge of the buckets into the eight `solid_*` meshes | `group`; `solidGeos`, `shotPieces`, 8 materials | nothing |
| 1692–1712 | `scene.add(group)`; the shot cover | | |
| 1714–1880 | The runtime: `let time`, `update`, `openDoor`, `boxYawAt`, `moveBox`; the box's first yaw | 26 names | |
| 1882–1895 | `api`, the map handle (33 keys), returned | | game.js, js/game/, the director, the validators |

Four facts shape the plan:
- **Sections share handles, not variables.**
  - Every name one section takes from another is a `const`: an array, object, material or function, changed in place.
  - Only the shell reads `barrierId`. `time` and `api` are read only by the runtime, which stays in map.js.
  - No section calls a function declared in a later one, so no call relies on hoisting across a boundary.
- **The build's output depends on its order.**
  - Sections draw from `Math.random` through `utils.rand` and `choice`, push colliders, and add to `group`.
  - Several things read those in order: the shot cover, decorateMap's wall snapshot, the navmesh, and `moveBox`'s `colliders.find(c => c.boxCollider)`.
  - So the builders run in the original order, and no builder takes lines from two places.
- **The runtime reads the whole build.**
  - `update`, `openDoor`, `boxYawAt` and `moveBox` read 26 names from five parts of the build, and hand `api` to `navInvalidate`.
  - They stay in map.js, verbatim.
- **The build runs headless on every validator run.**
  - 9 validators build the map, and 5 of those open doors or move the box.
  - test-cinematic-director builds it for all 71 shots, and runs `update` 180 times in each (cinematic-director.js:946–950).
  - 6 validators pin its text with 41 checks, and all of them read js/map.js by path (§1.7).

### 1.2 Mechanism

**Each section becomes a builder in js/map/, and `buildMap` calls the builders in the original order.**
- A builder lists the names it takes as a destructured parameter. The weapon model builders take `buildViewmodel`'s context the same way: `function m1911({ P, A, ST, STD, STL, STM, CK })`.
- The builder's body is the section, verbatim and at the same two-space indent. A final line returns the names that later code reads.
- map.js passes an object literal of exactly those names, and destructures the result under the same names.

js/map/doors.js:

```js
export function buildDoors({ group, colliders, interact, doors, rooms, ramps }) {
  // ---------- doors ----------
  const doorDefs = MAP_DOOR_DEFS;
  // … 684–762, verbatim …
  return { navLinks, findPath };
}
```

js/map.js:

```js
  const { navLinks, findPath } = buildDoors({ group, colliders, interact, doors, rooms, ramps });
```

What this buys:
- **Every moved line is unchanged.** The text pins keep matching once they read the joined source (§1.7).
- **Each call shows what goes in and what comes out.** No builder imports another, so everything that passes between sections goes through `buildMap`.
- **Per-build state stays per build.**
  - `let barrierId`, `boardGeoCache` and `tmpM` stay inside their builders. So a second `buildMap`, like the one validate-enemy-navigation makes, still starts from zero.
  - The only module-level code is `WALL_T`, `MOON_DIR` and `GRADE`, which are module-level today.
- **Mistakes fail the validator loop.**
  - Say a body uses a name its builder doesn't take. That line throws when it runs. The build runs in 10 validators, and `update` runs in one of them.
  - Say a builder takes a name its call leaves out. The name arrives as `undefined` and nothing throws: an undefined `HH` just puts NaN into the factory's chains and roof beams. test-map-modules guards against this. It compares every call with its builder's parameter list, and every destructured result with the builder's `return` (§1.7).

Rejected alternatives:
- **Leave map.js whole**, as the earlier plans did. It is the largest file, and the context object they wanted to avoid costs one parameter list per section.
- **Move out only the brick generator** (`boxBlur` and `makeBrickMaps`), the one piece that reads nothing from the closure. About 1,790 lines would remain.
- **One context object that grows**, as in `Object.assign(ctx, buildShell(ctx))`. The calls get shorter, but nothing shows which builder hands which name to which, and the call check would have nothing to compare.
- **`ctx.colliders` in the bodies.** This rewrites hundreds of lines. It also breaks pins such as validate-coplanar-surfaces' `colliders.push({ minX: cx - bw / 2, …`.
- **A runtime module** for `update`, `openDoor`, `boxYawAt` and `moveBox`. It would take 26 names. `openDoor` and `moveBox` also need `api`, which is only assigned after they are defined.
- **One module per room.** The random draws, the colliders and the scene graph would change order, so every prop and board would move.
- **`boxBlur` and `makeBrickMaps` at module level.** They read nothing from the closure, but moving them re-indents 103 lines for no gain.

### 1.3 Target modules

| Module | Takes from map.js | ≈ lines |
|---|---|---|
| `js/map.js` | 1–2, the header. 64–75, the opening of `buildMap`. The builder calls. 1374–1434, `decorateMap` and the audits. 1692–1712, `scene.add` and the shot cover. 1714–1895, the runtime and `api`. Its imports and the re-export line. | 325 |
| `js/map/surfaces.js` | `buildSurfaces()`: 77–265. `mergeSolidGeometry`: 1657–1690. | 240 |
| `js/map/shell.js` | 32, `WALL_T`. `buildShell`: 267–532. | 280 |
| `js/map/elevation.js` | `buildElevation`: 534–682 | 160 |
| `js/map/doors.js` | `buildDoors`: 684–762 | 90 |
| `js/map/hand-placed.js` | `placeProps`: 764–1162 | 415 |
| `js/map/interactables.js` | `buildInteractables`: 1164–1372 | 230 |
| `js/map/risers.js` | `placeRisers`: 1436–1486 | 60 |
| `js/map/lighting.js` | 34–62, `MOON_DIR` and `GRADE`. `buildLighting`: 1488–1596. | 150 |
| `js/map/signage.js` | `paintSignage`: 1598–1655 | 65 |

The builders, in the order map.js calls them:

| Builder | Takes | Returns |
|---|---|---|
| `buildSurfaces()` | nothing | `pbr`, `matFloor`, `matWall`, `matBrick`, `matMetal`, `matPlate`, `matWood`, `matDirt`, `matDark`, `matConcrete`, `matCeiling`, `solidGeos`, `shotPieces`, `pushBox` |
| `buildShell` | `group`, `colliders`, `barriers`, `solidGeos`, `pushBox`, `matWood`, `matDirt`, `matFloor` | `rooms`, `roomAt`, `H`, `HH` |
| `buildElevation` | `group`, `colliders`, `solidGeos`, `pushBox`, `matMetal` | `floorZones`, `ramps`, `floorY`, `encloseStairFlight` |
| `buildDoors` | `group`, `colliders`, `interact`, `doors`, `rooms`, `ramps` | `navLinks`, `findPath` |
| `placeProps` | `group`, `colliders`, `fires`, `solidGeos`, `pushBox`, `pbr`, `matMetal`, `matPlate`, `matDark`, `matWood`, `encloseStairFlight`, `H`, `HH` | nothing |
| `buildInteractables` | `opts`, `group`, `colliders`, `interact`, `matMetal`, `matWood` | the 16 names in §1.1 |
| *(`decorateMap` and the audits, still in map.js)* | | |
| `placeRisers` | `group`, `risers`, `matConcrete` | nothing |
| `buildLighting` | `group`, `fires`, `matDark` | `fogPatches`, `dust`, `dustN`, `sky`, `moonLight`, `sunShadow`, `lamps` |
| `paintSignage` | `group` | nothing |
| `mergeSolidGeometry` | `group`, `solidGeos`, `shotPieces`, `matWall`, `matBrick`, `matMetal`, `matWood`, `matDark`, `matPlate`, `matConcrete`, `matCeiling` | nothing |

Headers and exports:
- Each file opens with a comment naming its part of the map. The comment also says that `buildMap()` in js/map.js calls it in build order, passing the names in its parameter list.
- Moved lines keep their section banners, such as `// ---------- walls ----------`.
- Each file exports its builders and nothing else. The exception is lighting.js, which also exports `MOON_DIR` and `GRADE` as `export const`. validate-game-invariants pins `export const GRADE = {`.
- No new comment may contain `papProcessing`, or any text a negative pin forbids (§1.7).

### 1.4 What stays in js/map.js

```js
// Map: night-time factory complex. Layout & landmarks inspired by classic
// wave-survival factory maps; all textures CC0, all geometry built in code.
// buildMap() builds it from the sections in js/map/, in order, then runs it.
import * as THREE from 'three';
import { concreteTexture, brickTexture, metalTexture, woodTexture, makeBox } from './utils.js';
import { decorateMap } from './map-props.js';
import { attachShotCover } from './shot-cover.js';
import { navInvalidate } from './navmesh.js';
import {
  MAINFRAME_EAST_ENTRY_KEEP_CLEAR, MAP_TRAVERSAL_ZONES, auditInteractableApproaches, auditKeepClearZone,
} from './map-layout.js';
import { buildSurfaces, mergeSolidGeometry } from './map/surfaces.js';
import { buildShell } from './map/shell.js';
import { buildElevation } from './map/elevation.js';
import { buildDoors } from './map/doors.js';
import { placeProps } from './map/hand-placed.js';
import { buildInteractables } from './map/interactables.js';
import { placeRisers } from './map/risers.js';
import { GRADE, buildLighting } from './map/lighting.js';
import { paintSignage } from './map/signage.js';

export { MOON_DIR, GRADE } from './map/lighting.js';

export function buildMap(scene, opts = {}) {
  // … 65–75, verbatim …

  const {
    pbr, matFloor, matWall, matBrick, matMetal, matPlate, matWood, matDirt, matDark, matConcrete, matCeiling,
    solidGeos, shotPieces, pushBox,
  } = buildSurfaces();
  const { rooms, roomAt, H, HH } = buildShell({ group, colliders, barriers, solidGeos, pushBox, matWood, matDirt, matFloor });
  const { floorZones, ramps, floorY, encloseStairFlight } = buildElevation({ group, colliders, solidGeos, pushBox, matMetal });
  const { navLinks, findPath } = buildDoors({ group, colliders, interact, doors, rooms, ramps });
  placeProps({ group, colliders, fires, solidGeos, pushBox, pbr, matMetal, matPlate, matDark, matWood, encloseStairFlight, H, HH });
  const {
    wallbuys, perks, power, powerProp, teleporters, mainframe,
    pap, papMachine, papEnergy, papCore, papCoreMat, papSlot, box, boxG, boxProp, traps,
  } = buildInteractables({ opts, group, colliders, interact, matMetal, matWood });

  // … 1374–1434, verbatim: decorateMap and the audits …

  placeRisers({ group, risers, matConcrete });
  const { fogPatches, dust, dustN, sky, moonLight, sunShadow, lamps } = buildLighting({ group, fires, matDark });
  paintSignage({ group });
  mergeSolidGeometry({ group, solidGeos, shotPieces, matWall, matBrick, matMetal, matWood, matDark, matPlate, matConcrete, matCeiling });

  // … 1692–1895, verbatim: scene.add, the shot cover, the runtime, api …
}
```

The file still exports the same three names: `buildMap`, `MOON_DIR` and `GRADE`. `api` doesn't change either: the same keys, in the same order.

**No caller changes:**
- game.js
- the cinematic director: js/cinematic-director.js today, and js/cinematic-director/world.js once that plan's step 3 lands
- the 5 validators that `loadGameModule('map.js')`, and scripts/lib/headless-map.mjs
- everything that reads `map.*` through the handle

During steps 1–5, the sections that haven't moved yet stay inline in map.js. They read the names they need from the destructured results of the sections that have.

### 1.5 Imports

Paths are relative to js/map/. A module's path is given the first time it appears in the table.

| Module | Imports |
|---|---|
| surfaces.js | `THREE`; `rand, choice` (../utils.js); `assets` (../assets.js); `enhanceMaterial` (../render/Materials.js) |
| shell.js | `THREE`; `rand, pointInBox`; `MAP_ROOMS, MAP_WALL_RUNS, cappedWallRuns, auditMapStructure` (../map-layout.js) |
| elevation.js | `THREE`; `CFG` (../config.js); `MAP_RAMPS, MAINFRAME_PLATFORM, MAINFRAME_STEPS, FACTORY_CATWALK, stairFlightColliders` |
| doors.js | `THREE`; `textTexture`; `buildDoorLeaf, buildDoorFrame, buildDoorLamp` (../props/door.js); `MAP_DOOR_DEFS, MAP_NAV_LINKS, auditMapEgress` |
| hand-placed.js | `THREE`; `rand, choice`; `splatTexture` (../render/Particles.js); `BLOOD_DECAL_COLOR` (../fx.js); `FACTORY_CATWALK` |
| interactables.js | `THREE`; `buildWallBuy` (../props/wallbuy.js); `WEAPONS` (../weapons.js); `buildPerkMachine` (../props/perkMachine.js); `buildPowerSwitch` (../props/powerSwitch.js); `buildTeleporter` (../props/teleporter.js); `buildPackAPunch, buildPapSignFrame` (../props/packAPunch.js); `signTexture as papSignTexture` (../props/materials.js); `buildMysteryBox` (../props/mysteryBox.js); `MAP_WALLBUYS, MAP_PERKS, MAP_TELEPORTERS, PAP_ENERGY_VISUAL, INITIAL_MYSTERY_BOX` |
| risers.js | `THREE`; `rand` |
| lighting.js | `THREE`; `rand`; `Sky` (../render/Sky.js); `SunShadow` (../render/SunShadow.js) |
| signage.js | `THREE`; `rand` |

Of the names map.js imports today, five go unused (§1.9). Every other name goes to the modules that use it, and map.js keeps the imports shown in §1.4.

**Cache tokens.**
- None of map.js's imports carries a query string. Nothing imports map.js, or any module that js/map/ imports, with one. In js/, only site-audio.js and the files in js/audio/ are imported with `?v=`.
- So each new relative path resolves to the same URL as today. `assets`, `WEAPONS` and the props' shared materials each stay a single instance.
- No new import gets a query string.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore doesn't exclude js/map/, and it mustn't.

**Load order.** None of the moved code runs at load except `WALL_T`, `MOON_DIR` and `GRADE`, as today. SunShadow.js still runs `installShadowEdgeFade()` when it is first imported, now through lighting.js, before anything renders.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/map/ imports js/map.js.** The contract test enforces it at every step.
- **No file under js/map/ imports another.**
  - Everything that passes between sections goes through the calls in `buildMap`, so the folder has no import edges that could form a cycle.
  - The contract test enforces this too.
- **Nothing they import leads back in.**
  - map.js is imported only by game.js and the cinematic director. Only main.js imports game.js, and no module imports main.js or the director.
  - So none of these can reach map.js: utils.js, assets.js, config.js, fx.js, weapons.js, map-layout.js; render/Materials.js, Particles.js, Sky.js and SunShadow.js; props/door.js, wallbuy.js, perkMachine.js, powerSwitch.js, teleporter.js, packAPunch.js, materials.js and mysteryBox.js.

### 1.7 Validators

**Text pins (6 files, 41 checks).** These validators read `js/map.js` by path:

| Validator | Checks | Where the pinned text ends up |
|---|---|---|
| audit-map-egress | 21 | elevation.js: `oneWayPlatformSide: true` and two fascia rows. interactables.js: `charging: false, cooldown: 0`; the PaP field's position and core offset. signage.js: the `fillText` width clamp; the Vesper mark. hand-placed.js: the catwalk deck's `cwWidth`. map.js: the wide gate in `openDoor`; both audit calls; `papEnergy.rotation.z = time`; `papCoreMat.emissiveIntensity`. 7 negative pins over every file. |
| validate-coplanar-surfaces | 9 | shell.js: the skirt, the cap drop, the solid segment and its collider, the wall-run loop, the 12 `ceil(` calls. elevation.js: the step nosings. surfaces.js: the brick blur radius; the brick maps' anisotropy. |
| validate-prop-cover | 5 | map.js: the moving set; the mesh and material filters; `attachShotCover` after `group.traverseVisible(`. surfaces.js: the buckets hand over their pieces before the merge. |
| validate-game-invariants | 3 | lighting.js: `export const GRADE`. shell.js: the comment on the ground-level shell below Chemical Testing. interactables.js: the box's starting position. |
| validate-pack-a-punch | 2 | map.js, both in `update` |
| validate-performance-invariants | 1 | A negative pin over every file: no `new THREE.` within 1,000 characters after `papProcessing` |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readMapSource()` calls `readSplitSource(js, 'map', '.js')`.
   - It returns js/map.js, then every .js file under js/map/ in path order, joined.
   - The file's header comment gains a sentence.
2. **Switch the reads.** Each of the six validators swaps its read of js/map.js for `readMapSource()`.
   - validate-game-invariants, validate-pack-a-punch and validate-performance-invariants already import from `./lib/game-source.mjs`, and add the name there.
   - audit-map-egress, validate-coplanar-surfaces and validate-prop-cover add the import.
   - audit-map-egress drops `import { readFile } from 'node:fs/promises'`, because that read was its only use. The other two still read other files with it.

No pin changes, and no anchor needs narrowing.

**Order-sensitive pins.**
- **validate-prop-cover** uses `indexOf` to check that `attachShotCover(colliders, shotPieces);` comes after `group.traverseVisible(`. Both stay in map.js, which comes first in the joined text.
- **The windowed pins** each sit inside a single statement that moves whole: the gate in `openDoor`, the clamp in `wallSign`, the box's `pos`, `GRADE`, and the merge loop.
- **validate-performance-invariants' window.** Every `papProcessing` is in `update`. The last one is 125 lines before map.js ends, so the window never reaches the next file.

**Counts across every file.** validate-coplanar-surfaces needs at least 12 lines that start with `ceil(`. All 12 are in shell.js, and no other file has one.

**Negative pins.**
- The 8 negative pins forbid:
  - `crate(-7.5, 23.5`
  - `19.75, -6, 20.95, 0.35`
  - the old spawn lamp post
  - `[12.6, 12.4, 3]`
  - `crate(8, 24` and its neighbours
  - `BoxGeometry(24, 0.12, 2.2)`
  - `EffectComposer` and `ShaderMaterial`
  - `papProcessing` followed by `new THREE.`
- Through the helper, they cover every file. Left reading js/map.js, they would stop covering the moved code, which is why every reader switches.
- No moved line matches one of them, and no new header may.

**Behavioural checks (no changes).**
- **9 validators build the map:** test-local-player, test-zombie-groans, validate-barrier-alcoves, validate-coplanar-geometry, validate-courtyard-spawns, validate-crash-states, validate-enemy-navigation, validate-prop-cover and validate-shot-occlusion.
  - Each of these mistakes fails them at build: a wrong path, a missing export, or a name a body uses but its builder doesn't take.
  - validate-enemy-navigation checks that `openDoor` re-derives the grid through `api`, and validate-crash-states drives `moveBox`.
- **test-cinematic-director** builds the map for every shot and runs `update` 180 times. That reaches every name `update` reads. The one exception is `sunShadow`, which `update` reads only when given a focus point, but `api` reads it at build.
- **The 5 validators that load game.js** link the whole js/map/ graph.
- **validate-module-syntax** parses every new file.

**New: `scripts/test-map-modules.mjs` (~80 lines).** This is the map counterpart of test-player-modules. It checks:
- js/map.js exports exactly `GRADE`, `MOON_DIR` and `buildMap`.
- No file under js/map/ imports js/map.js or another file in js/map/, through `assertNoImportOf`.
- **Calls match builders.**
  - Every function a js/map/ file exports is called exactly once in js/map.js.
  - The call's object literal holds exactly the names in the builder's parameter list. `buildSurfaces()` takes none.
  - Every name map.js destructures from a builder's result is in that builder's final `return { … }`.
  - The comparison is by name, so a literal like `matWood: matMetal` fails it.
  - The check also runs on three doctored copies of the text, and must reject each one, as test-split-modules does for the shared checks:
    - a call missing a name
    - a call with `matWood: matMetal`
    - a destructure of a name the builder doesn't return
- `readMapSource()` holds every file.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one.

**What still isn't caught.**
- Nothing pins the order of the builder calls. The proof in §1.8 shows the order is unchanged during the split.
- What the materials and lights look like. The proof compares their parameters, and the browser checks show them.

**No validator splits.** All six are under 500 lines, and each covers more than map.js:

| Validator | Lines | Covers in js/map.js and js/map/ |
|---|---|---|
| validate-game-invariants | 463 | lighting.js, shell.js, interactables.js |
| audit-map-egress | 445 | map.js, elevation.js, interactables.js, signage.js, hand-placed.js |
| validate-coplanar-surfaces | 287 | shell.js, elevation.js, surfaces.js |
| validate-prop-cover | 260 | map.js, surfaces.js |
| validate-performance-invariants | 124 | map.js |
| validate-pack-a-punch | 118 | map.js |

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one, and stop it when the check is done.

Why this order:
- **Any order works.** No builder imports another. A section that hasn't moved yet reads the names it needs from map.js's destructures.
- **Surfaces go first.** The section's body takes nothing. So step 1 tests two things on a section with three pins: the returned-names half of the mechanism, and the source helper.
- **Hand-placed props go second.** They are the largest payoff, and they return nothing.
- **Interactables go late.** 7 of their 16 returned names are read only by `update`, and only test-cinematic-director and the proof run `update`.

| # | Change | Out of map.js | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readMapSource()` with the 6 validators switched; `test-map-modules.mjs`; **surfaces.js** | ~225 | Low. The body takes nothing. If map.js leaves a name out of the destructure, the build throws in 9 validators. The call check covers the 11 names `mergeSolidGeometry` takes. | Solo: brick walls, concrete ceilings, diamond plate and rusted metal look as before. That includes a brick wall seen edge-on down the left corridor. No console error. |
| 2 | **hand-placed.js** | ~400 | Low. It takes 13 names and returns nothing. validate-prop-cover and the build-time traversal audits check its colliders. | Solo: climb the factory catwalk stairs, hop a knee-high side rail, and back into the east gate without falling off. The car wreck, cages and vats are in place. The furnace mouth and both fire barrels flicker. The blood is on the floors. |
| 3 | **shell.js** | ~270 | Low. 6 of validate-coplanar-surfaces' 9 pins move here, and validate-barrier-alcoves builds against it. | Normal round: zombies tear the boards off a window and climb through, and rebuilding puts the boards back. The alcove walls on either side of Teleporter A's door stop you. No z-fighting on the ceilings or at the floor seams. |
| 4 | **elevation.js**, **doors.js** | ~230 | Low. test-local-player walks on `floorY`. validate-enemy-navigation builds the nav grid, which reads `floorY`, `floorZones`, `ramps` and the door colliders, and opens every door. | Solo: climb both balcony stairs and check the bridge rails. Jump off each side of the spawn platform, and step onto its lowest step from the side. Buy a door and the courtyard gate. The gate's leaf vanishes as it opens, and zombies come through both. |
| 5 | **interactables.js** | ~210 | Low to medium. `update` is the only reader of 7 of its 16 returned names. test-cinematic-director runs `update`, but no validator checks what it does with those 7. | Solo: buy a wall weapon, and check that Quick Revive's machine shows 500. Turn on the power: the perk machines and the teleporter rings light up. Link Teleporter A. Pack-a-Punch a gun and watch the field spin up, then settle. Spin the box until it moves, and check that it faces the room where it lands. Try a trap, the gramophone and the radio. |
| 6 | **risers.js**, **lighting.js**, **signage.js**; map.js re-exports `MOON_DIR` and `GRADE` | ~245 | Low. `api` reads `sky`, `moonLight`, `sunShadow` and `lamps` at build, and `update` reads the rest. | AGENTS.md's normal round and dog round: zombies rise from the courtyard and factory risers. The lamps stay dim until the power is on, and some flicker. The moon's shadow follows you. Every painted sign reads correctly, including the final S of DER KOLOSS. `cinematic.html?shot=spawnSquad` loads with no console error. |

**Proof for every step.** It runs in plain Node, with no server and no browser. It is a throwaway script, not committed, because a golden file would fail on every later intentional change.
1. **Take a baseline before step 1, and run it twice** to show the run is deterministic.
   - Build on headless-map.mjs.
   - Import map.js first, then call `seedRandom()`. That way the random draws start at the same point, however the modules load.
   - Build with `buildMap(new THREE.Scene(), { mode: 'solo' })`, and again with a co-op mode.
2. **What it prints.**
   - **The scene graph**, depth first:
     - each object's type, name, transform, visibility, shadow flags and render order
     - each geometry's type, and a SHA-256 of its attributes and index
     - each material's type, parameters, `onBeforeCompile` text and texture settings
     - each light's colour, intensity, range and shadow settings
     - Textures are named by first appearance, never by uuid.
   - **The map handle**, key by key:
     - the colliders, with the shot-cover data hashed
     - barriers, risers, rooms, doors, interact, wallbuys, perks, power, teleporters, mainframe, pap, box, traps, playerSpawns, floorZones, ramps, navLinks, bounds and grade. Object references are printed as scene-graph paths.
     - `roomAt` and `floorY`, sampled every 0.5 m across `bounds` at y = 0, 2.9 and 3.1
     - `findPath` between every pair of rooms
   - **The runtime.**
     - 600 frames of `update(1/60, powerOn, focus)`, with the focus moving. The frames run through these states in turn: power off, power on, a linked and a charging teleporter, then Pack-a-Punch processing and ready.
     - Every 60 frames it prints:
       - every light's intensity, and every emissive material's intensity
       - the PaP field's transforms and opacities
       - the box's yaw
       - each door leaf's position and visibility
       - the sky's uniforms
       - a hash of the dust positions
     - Then it builds the nav grid with `getNavGrid(map)`. It calls `openDoor` on every door, then `moveBox` through every location and through the bad indices validate-crash-states uses. After each call, it prints a hash of the colliders and of `getNavGrid(map).nodeAt`, sampled across `bounds`.
   - **No object ids or uuids.**
3. **After each step, run it again.** The outputs must be identical.
4. **Review the diff.**
   - Check that every line that left map.js is verbatim in a new file.
   - Then run `git diff --color-moved=zebra`. The only changed lines should be:
     - file headers and imports
     - builder signature lines and return lines
     - the builder calls
     - the re-export line

If a piece can't be checked headless, check it in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **Five imports nothing uses:** `concreteTexture`, `brickTexture`, `metalTexture`, `woodTexture` and `makeBox` (4). No section uses them, so they go to no module and stay on map.js's import from utils.js.
- **`flickerLights`** (74) is declared and never read.
- **`findPath` and `navLinks` on the handle** (1888): nothing outside map.js reads either key. The horde routes with `NavGrid.findPath` (js/zombies/manager-ai.js:250), and map-layout.js's room-depth functions default to `MAP_NAV_LINKS`.
- **`fogPatches`** (1501) is never filled, so `update`'s ground-fog loop (1789–1795) never runs. `fogSpots` and `fogMat` are left unbuilt on purpose, as the comment at 1509–1511 says.

**Keep-clear entries that never match.** `decorateMap` places props around a keep-clear list (1393–1411), and three of its sources add nothing that works:
- `risers` is still empty when the list is built (1401). The risers are only placed at 1484–1486, after `decorateMap`.
- Wall-buy records (1176) and `pap` (1302) have a `pos`, but no `x` or `z`.
  - Their entries (1403, 1408) hold `undefined`, which map-props.js's `isClear` (44–50) never matches.
  - Their `interact` entries (1395) still keep both clear, with a larger radius.

These are behaviour, not structure, so the split leaves them as they are. Changing them would move props, which is exactly what the proof rules out.

**Comments.** 1539–1542 are two stacked comments that say the same thing about the hemisphere light.

### 1.10 Docs and comments

- **README.md's layout section** changes at 259:
  - `map.js`: "Map entry point: builds js/map/ in order, runs the map"
  - `map/`, a new line after it: "Map sections: surfaces, shell, stairs, doors, props, machines, lights, signage"
- **Optional:** these comments point at map.js for code that moves:
  - js/map-layout.js:42 (`WALL_T`), :51 and :58 (`wallRun` and the capped runs): now shell.js. js/map-layout.js:245 (the spawn steps) and :499 (`slabHole`): now elevation.js.
  - js/map-props.js:596 (the `ceil()` calls) and js/audio/zones.js:48 (`roomAt`): now shell.js
  - js/fx.js:13 and js/assets.js:10 (the old blood): now hand-placed.js
  - js/props/materials.js:37 and :108, js/render/Materials.js:24 and js/render/WeaponMaterials.js:49 (the brick and its anisotropy): now surfaces.js
  - js/props/teleporter.js:34 and :165 (the ring material), and js/props/packAPunch.js:9 (the energy field): now interactables.js
  - js/render/SunShadow.js:14: lighting.js is what imports it now
  - RENDERING.md:48 (`GRADE`) and :83 (`MOON_DIR`): now lighting.js
  - scripts/validate-coplanar-surfaces.mjs:18: the text now comes from `readMapSource()`
  - scripts/validate-coplanar-geometry.mjs:157 (`wallRun`), validate-barrier-alcoves.mjs:4 (`addBarrier`) and validate-wall-overlaps.mjs:20 (`WALL_T`): now shell.js
  - Inside the moved text, the PaP slot comment (1248–1249) says a "tick below" drives its emissive. That tick is `update`, which stays in map.js.
- **Unchanged:**
  - AGENTS.md and llms.txt don't name map.js.
  - RENDERING.md:317 says the keep-clear list is built in map.js, which stays true.
- **Leave as is:**
  - The docs/split-*.md plans cite js/map.js, but they're dated records.
  - README.md:271 and :277 still say 27 validators. That was out of date before this plan, and this plan doesn't touch it.

---

## 2. The other 19 files, ranked

None of these files has changed since `docs/split-player-plan.md` §2 was written, so its verdicts stand, with two changes:
- js/map-props.js moves out of "No clean seam" (rank 6).
- The props/materials.js note names js/map/interactables.js in place of map.js.

These facts were checked again:
- the files that import HellhoundModel.js, WeaponMaterials.js, props/materials.js, SoldierGear.js, WeaponParts.js and ZombieDetail.js
- the bindings that map-props.js reassigns

Each file gets a full read and its own plan before it is split.

**Mid-split:** js/cinematic-director.js (970 lines). Steps 3 and 4 of its plan take it to a ~60-line boot script.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. validate-performance-invariants and validate-coplanar-surfaces read the file's text by path, so they need a source helper like `readMapSource()`. |
| 2 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 3 | js/audio.js | 1,500 | One 1,322-line `AudioEngine` (177–1498). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | Its imports of js/audio/ carry `?v=` tokens, and js/weapons/catalog.js imports audio/casings.js with the same token. A split has to keep every specifier exactly as it is, or a module loads twice. |
| 4 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move first: each binding goes to the module that assigns it, as in the director split. Heavily pinned. |
| 5 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 6 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's. §1.2's mechanism may fit. | Earlier plans ruled it out along with map.js. Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The one binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like §1.8's. |
| 7 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Keep each one re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. After this plan, js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 8 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Keep each one re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 9 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) can move out to a module file, which still leaves ~700 lines.
