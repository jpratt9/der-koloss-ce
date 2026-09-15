# Split plan: js/zombies.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 22 files with 11,934 lines over the cap.

This continues `docs/split-style-plan.md`, whose plan is done. This plan covers the largest file left, `js/zombies.js`. Its §2 replaces that doc's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `e7b2277` to `f70fa03`, one per step in §1.8. js/zombies.js is now 11 lines, and the largest file in js/zombies/ is manager-ai.js at 374. It went as planned, with these notes:
- **Actual line counts** are within two lines of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | states | 5 |
  | bounds | 99 |
  | hit-volumes | 279 |
  | poses | 198 |
  | visual | 368 |
  | models | 74 |
  | manager | 258 |
  | manager-spawning | 296 |
  | manager-movement | 129 |
  | manager-ai | 374 |
  | manager-net | 71 |

- **During steps 3 and 4 the class was still in js/zombies.js**, so the manager-*.js headers named zombies.js as the file that installs them. Step 5 changed them to manager.js.
- **The shared helpers differ slightly from §1.7:**
  - `assertSourceHolds` takes the helper's name as well, `(source, helper, paths)`, so a failure names `readGameSource()`, `readWeaponsSource()` or `readZombiesSource()`.
  - The install check's message ends "is its class in the install list?" in all three tests.
  - test-game-modules and test-weapon-modules report the same counts as before.
  - split-modules.mjs is 58 lines and test-zombie-modules.mjs is 51.
- **Step 0 was reproduced before it was fixed.** A headless minute of round 1 with six zombies alive gave 0 ambient groans before the fix and 5 after.
- **The proof went further than §1.8 described:**
  - The horde ran for 250 s: round 1 with the doors closed, round 8 with every door open, a dog round, then dormant.
  - It logged 84 `onSpawned` calls, 73 kills, 5 crawler conversions, 36 boards torn, 1,005 player hits and 16 ambient groans, with the guest mirroring every frame.
  - It was run twice before step 1, to show the run is deterministic, and after every step. All of the output, 18.8 MB, was identical each time.
  - After each step, a script also checked that every line that left zombies.js was verbatim in a new file. The only new text was file headers, imports, class wrappers, re-export lines, the install call and step 2's `export`.
  - None of these scripts was committed.
- **Browser checks.** None of the checks in §1.8 have been run. They need a local server.
- **The validators number 40**, with test-zombie-modules.mjs added.

Of the dead code in §1.9, only `setCreatureUniform` is gone, dropped by the split as §1.9 said it would be. The rest is untouched. README.md:261 is done. The optional comment updates in §1.10 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/zombies.js                    2073           5
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

Total excess lines: 11934
```

The plan is in two parts:
1. `js/zombies.js`: the largest file. Its seams are clean, and nothing in it needs a restructure.
2. The other 21 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. js/zombies.js: 2,073 lines → js/zombies.js (11) + 11 modules in js/zombies/

### 1.1 What's in it

| Lines | Contents | Used by |
|---|---|---|
| 14–47 | AI tuning constants: `RISE_DEPTH`, `RISER_SHARE`, `SPAWN_QUEUE_PATIENCE`, `DORMANT_SETTLE`, `WAYPOINT_R`, `WAYPOINT_Y`, `DEFLECT`, `PATHS_PER_FRAME` | one or two `ZombieManager` methods each |
| 48, 2073 | `ZSTATES` and its `export` line | 5 js/game/ files, cinematic-director.js, the pose functions, most `ZombieManager` methods, 3 validators |
| 50–54 | `isZombieSpawnRoomAllowed` | `spawnOne`, `riseSpotNear`. Nothing outside the file imports it. |
| 56–67, 110–146 | The fallback body (its materials, `dpart`, `createZombieModel`) and `enforceEnemyVisualIdentity` | `spawnOne`, `applySnapshot`, js/game/graphics.js, cinematic-director.js, validate-zombie-hitboxes |
| 69–108, 148–465 | `ZombieVisual` (202 lines) and what only it uses: `PROP_PRESETS`, `corpseAtlas`, the eye glow and tints, the height contract, `nativeStandingHeight` | `createZombieVisual`, js/game/graphics.js, cinematic-director.js, validate-zombie-hitboxes, validate-zombie-detail |
| 467–481 | `createZombieVisual` | `spawnOne`, `applySnapshot` |
| 483–576 | The bounds ruler: its scratch, `measureNeutralBounds`, `measureStandingBounds` | `ZombieVisual`, `nativeStandingHeight`, player.js (`SoldierVisual`) |
| 578–852 | Hit volumes: `HIT_BONES`, `HIT_AXES`, the hull fit, `zombieHitVolumes`, `refreshHitPose`, the ray tests, `rayHitZombieBody`, `zombieAimPoint` | js/game/ballistics.js, js/game/remote-combat.js, validate-zombie-hitboxes |
| 854–1045 | `zombiePoseForState`, `applyHellhoundPose` | `animate`, cinematic-director.js |
| 1047–2071 | `ZombieManager` (1,025 lines): the constructor, 3 getters, 21 methods | game.js and 9 js/game/ files through `this.zombies`; 3 validators drive its methods |

Four facts shape the plan:
- **Everything before `ZombieManager` reaches the rest by import, not by `this`.** It moves as modules, verbatim. The one text edit is `export` on `enforceEnemyVisualIdentity`, which the spawning and net files both call.
- **`ZombieManager` is one class whose methods call each other through `this` at 22 sites.** It takes the mixin pattern Game and WeaponRig already use, with `installMixins` from js/utils.js.
- **No function has to span files.** The longest method, `stepZombie`, is 315 lines, so it fits a file whole. Unlike `buildViewmodel`'s switch in the weapons split, nothing is restructured.
- **Validators depend on the file text.**
  - 8 validators read it (80 assertions), and 5 import it.
  - Several pins are negative (`doesNotMatch`, `!/SoldierFace/`). Left reading js/zombies.js, they would pass vacuously once it is a re-export list, so every reader has to switch (§1.7).

### 1.2 Mechanism

**The creature code becomes modules.** The free functions and `ZombieVisual` move verbatim into files by concern. js/zombies.js re-exports their public names, as js/weapons.js does.

**`ZombieManager` becomes a core file and four mixins.** `manager.js` keeps these, with no caller changes:
- the constructor, so all state is still declared in one place
- the getters, `damage`, `kill`, `nukeAll`, `update`, `animate` and `clear`

Four groups of methods move into mixin classes:

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `ZombieManagerSpawning` (manager-spawning.js) | `startRound`, `activeSpawnRooms`, `activeSpawnRoomDepths`, `spawnOne`, `riseSpotNear`, `respawnNear`; `RISER_SHARE`, `SPAWN_QUEUE_PATIENCE`, `isZombieSpawnRoomAllowed` | Where and when bodies enter: the wave size, the riser quota that `startRound` sets and `spawnOne` spends, window claims, and the rise spots `respawnNear` shares. Three validators pin it. |
| `ZombieManagerMovement` (manager-movement.js) | `_colliders`, `moveZombie`, `separate`; `DEFLECT` | Collision-resolved locomotion. It reads only the body, the map's colliders and the nav grid's spatial hash. |
| `ZombieManagerAi` (manager-ai.js) | `setDormant`, `nearestPlayer`, `stepZombie`; `RISE_DEPTH`, `DORMANT_SETTLE`, `WAYPOINT_R`, `WAYPOINT_Y` | The host's state machine. `setDormant` and `stepZombie` are the only readers of `DORMANT_SETTLE`, and `stepZombie` is the only caller of `nearestPlayer`. |
| `ZombieManagerNet` (manager-net.js) | `serialize`, `applySnapshot`, `interpolate` | Guest replication and its wire format. None of the three calls another method. |

`PATHS_PER_FRAME` stays with `update` in manager.js. Every other constant goes to the one file that reads it. manager.js installs the mixins the way js/weapons/rig.js does:

```js
installMixins(ZombieManager, [ZombieManagerSpawning, ZombieManagerMovement, ZombieManagerAi, ZombieManagerNet]);
```

What this buys:
- **No caller changes.** game.js and js/game/ call through the instance. The validators reach methods the same way: `stepZombie` and `spawnOne` on a `new ZombieManager`, and `ZombieManager.prototype.animate.call(…)`.
- **Instance overrides still win.** validate-enemy-navigation replaces `respawnNear` on the instance, and an own property still shadows a method copied onto the prototype.
- **A method defined twice fails at load**, through `installMixins`.

Rejected alternatives:
- **zombies.js keeps `ZombieManager`'s core, as game.js keeps Game's.**
  - zombies.js would then be both a class and a re-export list for eleven names it no longer defines.
  - js/weapons.js had the same shape, free functions plus one big class, and its class moved to js/weapons/rig.js. This plan follows that.
- **Subsystem objects** (`this.spawner.spawnOne()`). These would rewrite every `this.` in 1,000 lines, plus the validators that drive `stepZombie`, `spawnOne` and `animate`.
- **Movement and AI in one file.** It would be ~480 lines, one edit away from the cap.

### 1.3 Target modules

| Module | Takes from zombies.js | ≈ lines |
|---|---|---|
| `js/zombies.js` | the header comment (1–2) and the re-export list (§1.4) | 11 |
| `js/zombies/states.js` | 48 `ZSTATES` and 2073 its `export` line | 5 |
| `js/zombies/bounds.js` | 483–576: the bounds scratch, `measureNeutralBounds`, `measureStandingBounds` | 100 |
| `js/zombies/hit-volumes.js` | 578–852: `HIT_BONES` through `zombieAimPoint` | 280 |
| `js/zombies/poses.js` | 854–1045: `zombiePoseForState`, `applyHellhoundPose` | 200 |
| `js/zombies/visual.js` | 69–108 `PROP_PRESETS`. 148–465: `corpseAtlas`, the eye glow and tints, the height contract, `nativeStandingHeight`, `ZombieVisual`. | 370 |
| `js/zombies/models.js` | 56–67: the fallback materials and `dpart`. 110–146: `createZombieModel`, `enforceEnemyVisualIdentity` (now exported). 467–481: `createZombieVisual`. | 75 |
| `js/zombies/manager.js` | 41–47 `PATHS_PER_FRAME`; `ZombieManager`'s banner and constructor (1047–1082), getters, `damage`, `kill`, `nukeAll`, `update`, `animate`, `clear`; the mixin install | 260 |
| `js/zombies/manager-spawning.js` | 17–24 `RISER_SHARE`, `SPAWN_QUEUE_PATIENCE`; 50–54 `isZombieSpawnRoomAllowed`; `startRound`, `activeSpawnRooms`, `activeSpawnRoomDepths`, `spawnOne`, `riseSpotNear`, `respawnNear` | 295 |
| `js/zombies/manager-movement.js` | 37–40 `DEFLECT`; `_colliders`, `moveZombie`, `separate` | 130 |
| `js/zombies/manager-ai.js` | 14–16 `RISE_DEPTH`; 25–36 `DORMANT_SETTLE`, `WAYPOINT_R`, `WAYPOINT_Y`; `setDormant`, `nearestPlayer`, `stepZombie` | 375 |
| `js/zombies/manager-net.js` | 1995–2056: `serialize`, `applySnapshot`, `interpolate` | 70 |

Ordering and headers:
- Members keep their original relative order. Each banner comment, such as `// ---------- combat ----------`, goes with the member after it.
- Each file opens with a comment naming its part of the zombie code.
- The manager-*.js files add "Methods of ZombieManager: manager.js copies them onto ZombieManager.prototype.", as the js/game/ files do for Game.

### 1.4 What stays in js/zombies.js

It stays the public entry point, but as re-exports only:

```js
// Zombies: animated CC0 models (Quaternius, CC0) driven by the AI state machine,
// classic round structure with health scaling, hellhounds, crawlers.
// The code is in js/zombies/. This file re-exports the names callers import.
export { ZSTATES } from './zombies/states.js';
export { measureNeutralBounds, measureStandingBounds } from './zombies/bounds.js';
export { rayHitZombieBody, zombieAimPoint } from './zombies/hit-volumes.js';
export { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
export { ZombieVisual } from './zombies/visual.js';
export { createZombieModel, createZombieVisual } from './zombies/models.js';
export { isZombieSpawnRoomAllowed } from './zombies/manager-spawning.js';
export { ZombieManager } from './zombies/manager.js';
```

These are the 12 names it exports today. `enforceEnemyVisualIdentity` becomes an export of models.js only so that two manager files can share it, and zombies.js doesn't re-export it.

**No caller changes:**
- game.js, player.js, cinematic-director.js
- the 5 js/game/ files that import it: ballistics, graphics, machines, projectiles, remote-combat
- the 5 validators that `loadGameModule('zombies.js')`

During steps 1–4, zombies.js does both jobs: it re-exports what has moved, and it imports from the new files whatever its remaining code needs.

### 1.5 Imports

Paths are relative to js/zombies/.

| Module | Imports |
|---|---|
| states.js | none |
| bounds.js | `THREE` |
| hit-volumes.js | `THREE` |
| poses.js | `THREE`; `clamp` (../utils.js); `ZSTATES` (./states.js) |
| visual.js | `THREE`; `clone as skClone` (../../vendor/SkeletonUtils.js); `clamp, rand, choice` (../utils.js); `assets` (../assets.js); `enhanceCreatureMaterial, randomCreatureLook` (../render/CreatureShading.js); `measureNeutralBounds, measureStandingBounds` (./bounds.js) |
| models.js | `THREE`; `assets`; `attachZombieDetail` (../render/ZombieDetail.js); `buildHellhound, HOUND_VARIANTS` (../render/HellhoundModel.js); `ZombieVisual` (./visual.js) |
| manager.js | `THREE`; `CFG` (../config.js); `rand, choice, installMixins`; `getNavGrid` (../navmesh.js); `setZombieDetailVisible`; `setHellhoundLOD`; `ZSTATES`; `zombiePoseForState, applyHellhoundPose` (./poses.js); the four mixins |
| manager-spawning.js | `roundZombieCount, roundZombieHealth, roundSpawnDelay, nextDogRound, dogCount` (../config.js); `clamp, rand, choice, resolveCircleBox`; `elevationAwareRiseCandidate, roomDepthsToPlayers` (../map-layout.js); `prewarmHellhounds`; `ZSTATES`; `createZombieModel, createZombieVisual, enforceEnemyVisualIdentity` (./models.js) |
| manager-movement.js | `moveCircleWithColliders`; `NAV_RADIUS` (../navmesh.js); `ZSTATES` |
| manager-ai.js | `CFG`; `rand, dist2D, moveCircleWithColliders`; `NAV_RADIUS`; `ZSTATES` |
| manager-net.js | `clamp, lerp, rand`; `ZSTATES`; `createZombieModel, createZombieVisual, enforceEnemyVisualIdentity` |

**Dropped.** `setCreatureUniform` is imported today but never used, so no new module imports it (§1.9).

**Cache tokens.**
- None of zombies.js's imports carries a query string, and no other file imports those modules with one.
- The new relative paths resolve to the same URLs. So `assets`, the nav grid and the shared hound and corpse caches each stay one module instance.
- No new import gets a query string.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore doesn't exclude js/zombies/.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/zombies/ may import js/zombies.js.**
  - The contract test enforces it.
  - It holds at every step, because a module moves only after the modules it imports have moved (§1.8).
- **The import graph inside js/zombies/ has no cycles:**
  - states, bounds and hit-volumes import nothing from js/zombies/.
  - poses imports states, visual imports bounds, and models imports visual.
  - manager-movement and manager-ai import states. manager-spawning and manager-net import states and models.
  - manager imports states, poses and the four mixins.
- **Nothing they import from outside js/zombies/ leads back in.** None of these imports zombies.js, game.js, player.js, cinematic-director.js or anything in js/game/:
  - config.js, utils.js, assets.js, map-layout.js, navmesh.js
  - render/CreatureShading.js, render/ZombieDetail.js, render/HellhoundModel.js
  - vendor/SkeletonUtils.js

### 1.7 Validators

**Text pins (8 files).** These validators read `js/zombies.js`:

| Validator | Assertions | Where the pinned text ends up |
|---|---|---|
| validate-creature-scale | 39 | visual.js (the height contract, `calibrate`, `nativeStandingHeight`), bounds.js (`measureNeutralBounds` and the one `getVertexPosition`) |
| validate-game-invariants | 16 | manager-spawning.js, manager-net.js, models.js |
| validate-spawn-sources | 11 | manager-spawning.js, and `clear`'s window release in manager.js |
| validate-zombie-hitboxes | 8 | hit-volumes.js |
| validate-performance-invariants | 3 | manager-ai.js, manager-net.js, and one negative pin over every file |
| validate-host-guest-combat | 1 | manager-spawning.js |
| validate-combat-systems | 1 | manager.js (`animate`) |
| validate-remote-avatar | 1 | a negative pin over every file |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readZombiesSource()` calls `readSplitSource(js, 'zombies', '.js')`.
   - It returns js/zombies.js, then every .js file under js/zombies/ in path order, joined.
   - The file's header comment gains a sentence.
2. **Switch the reads.** Each validator swaps its one read of js/zombies.js for `readZombiesSource()`.
   - Five validators already import from `./lib/game-source.mjs` and add the name there.
   - validate-creature-scale, validate-spawn-sources and validate-zombie-hitboxes add the import.
   - Imports that only served the old read go. In validate-creature-scale: `readFile`, `path`, `fileURLToPath` and `root`. In validate-spawn-sources: `readFileSync`. In validate-zombie-hitboxes: `readFile`, `join` and `repoRoot`. In validate-host-guest-combat: `readFile`.

No pin changes, and no anchor needs narrowing.

**Order-sensitive pins.** The joined text keeps all of these true at every step:
- **validate-creature-scale's `cal`** runs from `  calibrate() {` to the first `\n  update(dt) {` anywhere in the text.
  - `ZombieVisual.update` is the only match: `ZombieManager`'s is `update(dt, players) {`.
  - It moves to visual.js together with `calibrate`.
- **validate-spawn-sources' `pick`** runs from the first `spawnOne(players)` to the first `z.room ||=`.
  - Both occur only inside `spawnOne`, which moves whole.
  - `update`'s call reads `spawnOne(players.filter(`, so it doesn't match.
- **Six slices end at the next `\n}\n`:** `measureNeutralBounds` and `nativeStandingHeight` in validate-creature-scale, and the four ray functions in validate-zombie-hitboxes. Each needs only its own closing brace in column 0, which a verbatim move keeps.
- **Counts across every file:** `enforceEnemyVisualIdentity(z);` ×2, `getVertexPosition(` ×1, `_calibrated = true` ×1, `_calibrated = false` ×1. Import and re-export lines add nothing of those shapes.

A later edit that broke either slice would fail loudly: an empty `cal` fails `cal.length > 200`, and an empty `pick` fails `barrierTier > -1`.

**Behavioural (no change).** These import through js/zombies.js, which keeps every export:
- validate-zombie-hitboxes: `ZombieVisual`, `ZombieManager.prototype.animate`, `ZSTATES`, `createZombieModel`, `rayHitZombieBody`, `zombieAimPoint`
- validate-zombie-detail: `ZombieVisual`
- validate-enemy-navigation: `stepZombie` on the real map, for walkers and hounds
- validate-courtyard-spawns: `spawnOne` on the real map
- validate-frame-budget: `ZSTATES`

Every validator that loads game.js also links the whole zombies graph, so a wrong path or a missing export fails at import.

**New: `scripts/lib/split-modules.mjs` (~50 lines).**
- **Why.** test-game-modules and test-weapon-modules each carry their own copy of the install check, and test-weapon-modules also carries the import check. A zombies test would be a third copy.
- **What moves.** Those loops become three shared functions:
  - `assertMethodFilesInstalled(Target, dir, files)`
  - `assertNoImportOf(entry, dir, files)`
  - `assertSourceHolds(source, paths)`
- **The existing tests switch to them.** The assertions stay the same, and only the message wording is unified.

**New: `scripts/test-zombie-modules.mjs` (~45 lines).** This is the zombies counterpart of test-weapon-modules. It checks:
- js/zombies.js exports exactly its 12 names.
- No file under js/zombies/ imports js/zombies.js.
- From step 3: each manager-*.js exports one class, every method is installed on `ZombieManager.prototype`, and no method is in two files.
- `readZombiesSource()` holds every file.

**No validator splits.** The ones covering these modules are all under 500 lines, and each already covers one concern:

| Validator | Lines | Covers |
|---|---|---|
| validate-zombie-hitboxes | 342 | hit-volumes.js, `animate` |
| validate-enemy-navigation | 295 | manager-movement.js, manager-ai.js |
| validate-zombie-detail | 247 | visual.js with render/ZombieDetail.js |
| validate-creature-scale | 131 | visual.js, bounds.js |
| validate-courtyard-spawns | 95 | manager-spawning.js |
| validate-spawn-sources | 44 | manager-spawning.js |

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one, and stop it when the check is done.

This order is also the dependency order:
- A module can leave zombies.js only once everything it imports has left. That puts bounds before visual, visual before models, and models before spawning and net.
- Step 2 goes before step 3 because it moves more code at lower risk.
- `ZombieManager`'s core goes last, because it imports almost everything else.

| # | Change | Out of zombies.js | Risk | Browser check |
|---|---|---|---|---|
| 0 | `[fix]` `this.groanTimer = 0;` in the constructor (§1.9) | 0 | Very low: no validator runs `ZombieManager.update`. It does change what players hear, because ambient groans have never played. | solo, round 1: every 9–14 s a zombie groans, a different one each time and never a hound |
| 1 | `readZombiesSource()` with the 8 validators switched over; `split-modules.mjs`, with test-game-modules and test-weapon-modules moved onto it; `test-zombie-modules.mjs`; **states.js**, **bounds.js**, **hit-volumes.js** | ~370 | Very low. The files move verbatim, and none of the three imports anything else from zombies.js. validate-zombie-hitboxes fires hundreds of rays through the moved code, and two validators calibrate real corpses through the ruler. | solo: headshots and body shots on a walker, a runner and a crawler. Co-op: a remote soldier stands on the floor at normal height. |
| 2 | **poses.js**, **visual.js**, **models.js** | ~615 | Low. Verbatim, except for `export` on `enforceEnemyVisualIdentity`. | AGENTS.md's normal round and dog round: corpse tint, eye glow and height, a crawler, hounds that run, bite and die. cinematic.html loads. |
| 3 | `installMixins` for `ZombieManager`, still in zombies.js; **manager-movement.js**, **manager-ai.js** | ~480 | Low–medium. `stepZombie` is the most involved code in the file, but it moves verbatim. validate-enemy-navigation walks walkers and hounds across the real map through it. | solo, rounds 1–3: zombies tear boards and climb in, route around the balcony stairs, climb to the catwalk and crowd a doorway without sticking. At game over, the horde stops and stands. |
| 4 | **manager-spawning.js**, **manager-net.js** | ~340 | Low–medium. Three validators pin the spawn rules, and validate-courtyard-spawns runs `spawnOne` on the real map. | AGENTS.md's normal round (windows first, the odd riser) and dog round (hounds rise inside rooms, never at windows). Co-op: the guest sees spawns, crawlers and deaths in step with the host. |
| 5 | **manager.js**; zombies.js becomes the re-export list | ~230 | Low. test-zombie-modules pins the export list and every install. | solo: a whole round, a Nuke and an Insta-Kill, then game over, back to the lobby and a second match |

**Proof for every step.** Use a throwaway script, not committed: a golden file would fail on every later intentional change.
1. **Take a baseline** after step 0 and before step 1. Step 0 adds random draws to `update`, so it has to land before the baseline. Build on the headless helpers (headless-three, headless-map, headless-zombies), and seed `Math.random` after the imports. The script prints:
   - **Corpses:** for 24 seeded `createZombieVisual()` bodies:
     - the preset, and the calibrated scale and offset
     - bone world positions through Walk, Run and Crawl frames
     - the hit-volume table
     - `zombieAimPoint` for head and body, and `rayHitZombieBody` over a fixed fan of rays
   - **Hounds:** every variant through `applyHellhoundPose` in chase, attack, death and dormant: leg-chain and tail rotations and root height.
   - **Host horde:** a `ZombieManager` on the real map, with two scripted players and every callback logged.
     - It runs round 1 for 90 s and a forced dog round for 60 s, with `damage` and `kill` on a schedule, then `setDormant` for 10 s and `clear()`.
     - Each frame it prints `serialize()`, plus each zombie's `state`, `navIdx`, `stuckT` and `riseT`.
   - **Guest:** a manager with authority off, fed the host's `serialize()` every 4 frames through `applySnapshot`, `interpolate` and `animate`. It prints model positions and rotations.
   - **No object ids or uuids.** Those depend on module load order, which the split changes.
2. **After each step, run it again.** The two outputs must be identical.
3. **Review the diff** with `git diff --color-moved=zebra`. The only lines that should show as changed are file headers, imports, class wrappers, re-export lines, and step 2's `export`.

### 1.9 Found while reading

**A bug: ambient groans never play.**
- **What happens:**
  - `update` counts `this.groanTimer` down (1563), but nothing ever sets it.
  - `undefined - dt` is `NaN`. `NaN <= 0` is false, and the timer stays `NaN` for the whole match.
- **Since when:** the groan block (1562–1572) has never run. `git log -S groanTimer` finds only the initial release.
- **What still plays:** a zombie still groans as it finishes rising, through `onRiseDone` (game.js:196).
- **The fix:** `this.groanTimer = 0;` in the constructor, beside `this.time = 0;`. The first `update` then starts the 9–14 s cycle.
  - It is 0 rather than `rand(9, 14)`, so the constructor makes no random draw.
  - That matters because validate-enemy-navigation and validate-courtyard-spawns construct managers in seeded runs, and they keep drawing the same numbers.
- **Recommendation:** land it as step 0, in its own `[fix]` commit.

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **An unused import.** `setCreatureUniform` is imported and never used. No new module imports it, so the split drops it as a side effect.
- **Methods nothing calls.**
  - `activeSpawnRooms()` has no caller in js/ or scripts/.
  - `clear()` has no caller either, because each match builds a new `ZombieManager` (game.js:168). validate-spawn-sources pins its window release, so removing `clear` means dropping that pin too.
- **A field nothing reads.** `z.lastD` is written in `spawnOne`, `stepZombie` and `respawnNear`, and never read.
- **An unused state.** `ZSTATES.CRAWLER` (7) is used nowhere. A crawler is `z.crawler` on top of the CHASE state.
- **An unused option.** `createZombieModel` never reads its `directorRig` option, and its comment says the rig is implicit now. Three callers in the file still pass it, and so does the cinematic director.
- **Branches that can't run.**
  - `buildHellhound` always sets `directorRig: true`, `legChains` and `tailSegs`.
  - So in `applyHellhoundPose`, these never run: the `u.legs` swing, the single-`u.tail` swing, the 0.12 root bob and the `rising` roll.

### 1.10 Docs and comments

- **README.md:261:** `zombies.js` becomes "Zombies entry point: re-exports js/zombies/". A new `zombies/` line follows it: "Horde AI and spawning, corpse and hound bodies, hit volumes, poses".
- **Optional:** these point at zombies.js for code that will live in one of its new files. Updating them is optional:
  - js/game.js:189, "the RISE case": now manager-ai.js
  - js/player.js:1215, `measureNeutralBounds()`: now bounds.js
  - scripts/validate-enemy-navigation.mjs:96, "the CLIMB case": now manager-ai.js
  - the assertion messages at validate-creature-scale.mjs:69 and validate-remote-avatar.mjs:30
- **Unchanged:** AGENTS.md, RENDERING.md and llms.txt don't name zombies.js.
- **Leave as is:** docs/model-audit/README.md cites js/zombies.js:313, but it's a dated record.

---

## 2. The other 21 files, ranked

These verdicts come from the structural skim behind `docs/split-weapons-plan.md` §2.
- Since then, only index.html has changed, in the style split.
- These facts were checked again: the WeaponParts importers, the shader filter, the player.js readers, and the span of `LocalPlayer`. The skim had `LocalPlayer` running to 668, but the class ends at 630.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/player.js | 1,809 | Clean: `LocalPlayer` (11–630); the avatar section's imports, height constants and eye, atlas and arm-IK helpers (632–1070); `SoldierVisual` (1071–1579); `RemotePlayer` (1580–1809) | `LocalPlayer` (620 lines) and `SoldierVisual` (509) are each over the cap alone: use `installMixins`, or accept them. 7 validators read its text. `SoldierVisual` imports the bounds functions from zombies.js, which keeps re-exporting them (§1.4). |
| 2 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. |
| 3 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` and `auditMapEgress` on the other | Pure module |
| 4 | js/audio.js | 1,500 | One 1,323-line `AudioEngine` (177–1500). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | none |
| 5 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move into a module first. Heavily pinned. |
| 6 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–785). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 7 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | none |
| 8 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. Keep WeaponParts.js re-exporting whatever moves out of it. |
| 9 | js/cinematic-director.js | 1,926 | Clean: the `SHOTS` table, the cast builders, `seek` | Not deployed, so low payoff |
| 10 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so low payoff |
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
