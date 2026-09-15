# Split plan: js/player.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 21 files with 9,405 lines over the cap.

This continues `docs/split-cinematic-director-plan.md`. That split is half done:
- Step 1 is committed (`07a5e74`) and step 2 is staged. Steps 3 and 4 remain.
- The count reads the working tree, so js/cinematic-director.js shows its staged 970 lines.
- Start this plan once that split and its docs commit have landed.

This plan covers `js/player.js`, the largest file with a clean seam. `js/map.js` is larger, but it has none (§2). This doc's §2 replaces the director plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `c444d0a` to `dc8e74c`, one per step in §1.8. js/player.js is now 5 lines, and the largest file in js/player/ is local-movement.js at 411. It went as planned, with these notes:
- **It didn't wait for the director split.** All four commits were made while that split's step 2 was still staged.
  - Each commit was made with its own list of paths, so none of them holds a director file.
  - The director's staged changes are the same as before.
- **Actual line counts** are within four lines of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | atlas | 250 |
  | local | 232 |
  | local-movement | 411 |
  | soldier | 279 |
  | soldier-pose | 294 |
  | soldier-weapon | 157 |
  | remote | 241 |

- **One original line didn't move.** Step 4 dropped the old file's "remote avatar" banner (player.js:632) rather than carrying it into soldier.js, which has its own header.
- **During step 3**, soldier-pose.js and soldier-weapon.js named js/player.js as the file that installs them. Step 4 changed them to soldier.js.
- **The proof differed from §1.8 in two ways:**
  - Each soldier clip ran 30 frames, not 60, over ten plays: Idle, Walk, Run, Run_Arms, Crawl, Death, HitReact, Punch, Jump, then Idle again. Every frame printed a hash of every bone's world transform, and every tenth frame printed the values too.
  - The local player was teleported twice: to the factory floor at (0, −52), where a slide isn't blocked, and to (−6.5, 16.4) below the mainframe platform, for the mantle.
- **How far the proof went:**
  - The local player ran 5,244 frames. They took it from walking, through a slide that ends crouched, the stance machine, a jump, ADS, a sprint-reload, the mantle, a slide ended by going down, Quick Revive's self-revive and regen, to a 45 s bleedout.
  - The recording canvas logged each of the four personas' recolour and painted eye. The first soldier held all 31 weapons, base and PaP.
  - The remote player ran 880 frames: the snapshot track, two perk drinks and the loadout calls. It ran once more without models, for the capsule fallback.
  - It was run twice before step 1, to show the run is deterministic, and again after every step. All of the output, 4.6 MB, was identical each time.
  - After each step, a script also checked that every line of the original player.js was still in js/player.js or js/player/. The only new text was file headers, imports, re-exports, class wrappers, atlas.js's export list and the two installs, and `git diff --color-moved=zebra` agreed.
  - None of these scripts was committed.
- **Browser checks.** None of the checks in §1.8 have been run. They need a local server.
- **The validators number 45 in the loop:** 44 committed, with test-player-modules.mjs added, plus the uncommitted scripts/test-cinematic-director.mjs.

None of the dead code in §1.9 was touched. README.md's layout lines from §1.10 are done. The optional comment updates in §1.10 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/map.js                        1895           4
js/player.js                     1809           4
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

Total excess lines: 9405
```

The plan is in two parts:
1. `js/player.js`: three classes, with the avatar helpers between the second and third. Every piece moves verbatim. Two of the classes are over the cap alone, so each keeps its core in one file and moves a group of methods to a mixin.
2. The other 20 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. js/player.js: 1,809 lines → js/player.js (5) + 7 modules in js/player/

### 1.1 What's in it

| Lines | Contents | Used by |
|---|---|---|
| 1–9 | The header; the imports `LocalPlayer` and `RemotePlayer` use | |
| 11–205, 608–630 | `LocalPlayer`: the constructor, 7 getters, `addPoints`, `spend`, `giveWeapon`, `refillAmmo`, `damage`, `goDown`, `revive`, `die`, `reloading`, `canFire`, `serialize` | game.js builds it (122), and js/game/ calls it through `this.player`. 4 validators pin it. |
| 207–606 | `LocalPlayer`'s movement: `_activeMapColliders`, `_moveAndCollide`, `update` (228–530, 303 lines), `_standingClear`, `_findMantle` | game.js calls `update` once a frame (310), and only `update` calls the other four. 4 validators pin it. |
| 632–643 | The avatar's banner and imports. Imports are hoisted, so their place mid-file changes nothing. | |
| 644–651 | `SOLDIER_HEIGHT`, `SOLDIER_MIN_H`, `SOLDIER_MAX_H` | the `SoldierVisual` constructor |
| 653–893 | The skin atlas: `IRIS`, `paintSoldierEye`, `_atlasCache`, `soldierAtlas` | the `SoldierVisual` constructor |
| 895–953, 1020–1069 | Pose helpers: the scratch vectors, `aimBoneY`, `solveArm`, `tiltX`, `HIP_LIFT`, `LEG_STRETCH`, `FOOT_DROP`, `FINGER_ROOTS`, `FINGER_BONES`, `POSED_BONES` | `_buildArmPose`, `_applyRig` |
| 955–1018 | `flattenWeapon`, with the scratch matrix `_wm` from 907 | `setWeapon` |
| 1071–1578 | `SoldierVisual` (508 lines): the constructor and 12 methods | `RemotePlayer`; the cinematic director, which builds one per actor. validate-remote-avatar pins it. |
| 1580–1809 | `RemotePlayer` (230 lines): the constructor and 9 methods | game.js (127) and js/game/netcode.js (105) build them, and game.js interpolates them (380). 3 validators pin it. |

Four facts shape the plan:
- **The three classes share nothing but names.**
  - `LocalPlayer` uses none of the avatar code.
  - `RemotePlayer` uses `SoldierVisual` by name, and `SoldierVisual` uses the helpers by name.
  - So every piece moves verbatim, and nothing is restructured.
- **Two classes are over the cap alone.**
  - `LocalPlayer` is 620 lines, 303 of them `update`. `SoldierVisual` is 508.
  - Both take the `installMixins` pattern that Game, WeaponRig and ZombieManager already use.
  - No method has to span files. `update`, the longest, fits a file whole.
- **Callers reach the code through three exports and through instances.**
  - game.js, js/game/netcode.js and the cinematic director import the classes. Everything else calls through `this.player`, a remote player or its `visual`.
  - The director also reads and writes `SoldierVisual`'s fields (`bones`, `mixer`, `actions`, `armPose`, `handPose`). Fields live on the instance, so a split can't move them.
- **Validators depend on the file text.**
  - 7 validators read it (53 assertions), and none builds a player class.
  - 4 of the pins are negative. Left reading js/player.js, they would pass vacuously once it is a re-export list, so every reader has to switch (§1.7).

### 1.2 Mechanism

**The avatar helpers become modules, and the classes become core files and mixins.** js/player.js re-exports the three classes, as js/zombies.js does.

**`LocalPlayer` becomes a core file and one mixin.** local.js keeps the constructor, the getters, points and loadout, `damage`, `goDown`, `revive`, `die`, `reloading`, `canFire` and `serialize`.

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `LocalPlayerMovement` (local-movement.js) | `_activeMapColliders`, `_moveAndCollide`, `update`, `_standingClear`, `_findMantle` | Everything a frame does to the local body: look, regen, bleedout, stance, the slide, momentum, jumps and mantles, and the collision tests they move through. Nothing but `update` calls the other four. |

**`SoldierVisual` becomes a core file and two mixins.** soldier.js keeps the constructor, `_measureBody`, `setAim`, `setCrouch`, `setLOD`, `play`, `update` and `dispose`.

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `SoldierVisualPose` (soldier-pose.js) | `_buildArmPose`, `_applyRig`; the pose helpers from 895–953 and 1020–1069 except `_wm` | How the corpse rig is stood up into a soldier: the carry pose solved once at build, then the corrections re-applied over the clip every frame. The helpers have no other caller, so none of them is exported. |
| `SoldierVisualWeapon` (soldier-weapon.js) | `_buildWeaponMount`, `setWeapon`, `muzzleWorld`; `flattenWeapon` and `_wm` | The held gun: its mount on the right forearm, the flattened display build cached per id and PaP, and the muzzle that remote fire effects use. |

Both classes install their mixins the way js/zombies/manager.js does:

```js
installMixins(LocalPlayer, [LocalPlayerMovement]);
installMixins(SoldierVisual, [SoldierVisualPose, SoldierVisualWeapon]);
```

What this buys:
- **No caller changes.** game.js, netcode.js and the director call through instances, which get every method from the prototype.
- **The constructor still builds through `this`.**
  - `installMixins` runs as soldier.js loads, before any soldier exists.
  - So `this._applyRig`, `this._buildArmPose` and `this._buildWeaponMount` resolve inside the constructor as they do today.
- **A method defined twice fails at load**, through `installMixins`.
- **Nothing is exported that isn't imported.** Each mixin file exports only its class, and atlas.js exports only `soldierAtlas`.

Rejected alternatives:
- **Keep `LocalPlayer` and `SoldierVisual` whole, one file each.** local.js would be ~635 lines and soldier.js ~525.
- **local.js keeps `update`, as manager.js does.**
  - manager.js's `update` orchestrates the horde. `LocalPlayer.update` is the movement itself.
  - The four helpers only `update` calls would sit in a different file from it, and the mixin would take unrelated leftovers.
- **The pose helpers as their own module, with `_applyRig` staying in soldier.js.** soldier.js would be ~450 lines and import 12 names from that module, two of them scratch vectors.
- **One mixin for both the pose and the weapon** (~430 lines). The two share no helper. Their only shared state is `weaponPitch`, which `_applyRig` tilts.

### 1.3 Target modules

| Module | Takes from player.js | ≈ lines |
|---|---|---|
| `js/player.js` | the header comment (1) and the re-export list (§1.4) | 5 |
| `js/player/atlas.js` | 653–893: `soldierAtlas`'s doc comment, `IRIS`, `paintSoldierEye`, `_atlasCache`, `soldierAtlas` | 250 |
| `js/player/local.js` | `LocalPlayer`: 11–205, the class line through `die`; 608–630, `reloading`, `canFire`, `serialize` and the closing brace; the mixin install | 230 |
| `js/player/local-movement.js` | 207–606: `_activeMapColliders`, `_moveAndCollide`, `update`, `_standingClear`, `_findMantle` | 410 |
| `js/player/soldier.js` | 644–651, the height band. `SoldierVisual`: 1071–1251, the class line, constructor and `_measureBody`; 1378–1410, `setAim`, `setCrouch`, `setLOD`, `play`; 1544–1578, `update`, `dispose` and the closing brace. The mixin install. | 275 |
| `js/player/soldier-pose.js` | 895–906, the banner and every scratch vector but `_wm`; 909–953 `aimBoneY`, `solveArm`; 1020–1069 `tiltX` through `POSED_BONES`; 1253–1294 `_buildArmPose`; 1412–1542 `_applyRig` | 295 |
| `js/player/soldier-weapon.js` | 907 `_wm`; 955–1018 `flattenWeapon`; 1296–1376: `_buildWeaponMount`, `setWeapon`, `muzzleWorld` | 155 |
| `js/player/remote.js` | 1580–1809: `RemotePlayer` | 240 |

Ordering, headers and exports:
- Members keep their original relative order. In the mixin files the helpers come first, then the class, as they do in player.js today.
- Each file opens with a comment naming its part of the player code.
  - The mixin files add "Methods of LocalPlayer: js/player/local.js copies them onto LocalPlayer.prototype.", or the same sentence for SoldierVisual and js/player/soldier.js.
  - During step 3, soldier-pose.js and soldier-weapon.js name js/player.js as the file that installs them. Step 4 changes that to soldier.js.
- atlas.js ends with `export { soldierAtlas };`. Everything else in it stays private.
- No new comment may contain `humaniseSoldierFace(` or `paintSoldierEye(`, because validate-remote-avatar counts both (§1.7).

### 1.4 What stays in js/player.js

It stays the public entry point, but as re-exports only:

```js
// Local player controller (FPS) + remote player avatar rendering.
// The code is in js/player/. This file re-exports the names callers import.
export { LocalPlayer } from './player/local.js';
export { SoldierVisual } from './player/soldier.js';
export { RemotePlayer } from './player/remote.js';
```

These are the 3 names it exports today.

**No caller changes:**
- game.js
- js/game/netcode.js
- the cinematic director: js/cinematic-director.js today, and js/cinematic-director/cast.js once that plan's step 3 lands
- the 5 validators that `loadGameModule('game.js')`

During steps 1–3, player.js does both jobs: it re-exports what has moved, and it imports from the new files whatever its remaining code needs.

### 1.5 Imports

Paths are relative to js/player/. A module's path is given the first time it appears in the table.

| Module | Imports |
|---|---|
| atlas.js | `THREE`; `assets` (../assets.js); `EYE_PATCH` (../render/SoldierFace.js); `SOLDIER_LOOKS` (../render/SoldierGear.js) |
| local-movement.js | `CFG` (../config.js); `clamp, damp, moveCircleWithColliders` (../utils.js); `input, consumeMouse, isAimDown` (../input.js); `platformSideBlocksAtFeet` (../map-layout.js); `getStats` (../weapons.js) |
| local.js | `CFG`; `lerp, installMixins`; `audio` (../audio.js); `getStats`; `LocalPlayerMovement` (./local-movement.js) |
| soldier-pose.js | `THREE`; `clamp`; `HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX` |
| soldier-weapon.js | `THREE`; `mergeGeometries` (../../vendor/utils/BufferGeometryUtils.js); `buildDisplayWeapon` |
| soldier.js | `THREE`; `clamp, damp, installMixins`; `clone as skClone` (../../vendor/SkeletonUtils.js); `assets`; `measureStandingBounds, measureNeutralBounds` (../zombies.js); `humaniseSoldierFace`; `attachSoldierGear, detachSoldierGear, setSoldierGearLOD, SOLDIER_LOOKS`; `soldierAtlas` (./atlas.js); `SoldierVisualPose` (./soldier-pose.js); `SoldierVisualWeapon` (./soldier-weapon.js) |
| remote.js | `THREE`; `CFG`; `clamp, lerp, damp, textTexture`; `audio`; `buildPerkBottle`; `PERK_DRINK_TIMELINE, perkDrinkPhase` (../gameplay-rules.js); `assets`; `SoldierVisual` (./soldier.js) |

Every name player.js imports today is used, and each one goes to the modules above that use it. Neither `LocalPlayer` file imports `THREE`.

**Cache tokens.**
- None of player.js's imports carries a query string, and no other file imports those modules with one. The only `?v=` imports in the repo are of site-audio.js, main.js, menu-bg.js and the files in js/audio/.
- The new relative paths resolve to the same URLs. So `input`, `audio`, `assets` and SoldierGear's wardrobe pool each stay one module instance.
  - `input` matters most: main.js and game.js write the keys that `update` reads.
- No new import gets a query string.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore doesn't exclude js/player/, and it mustn't: unlike the director, this is game code.

**Load order.** Very little of the moved code runs at load: constants, scratch objects, the finger-bone loop and `_atlasCache`. None of it reads another module. `installMixins` runs as local.js and soldier.js load, before game.js can build a player.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/player/ imports js/player.js.**
  - The contract test enforces it.
  - It holds at every step, because a module moves only after the modules it imports have moved (§1.8).
- **The import graph inside js/player/ has no cycles:**
  - atlas, local-movement, soldier-pose and soldier-weapon import nothing from js/player/.
  - local imports local-movement.
  - soldier imports atlas, soldier-pose and soldier-weapon.
  - remote imports soldier.
- **Nothing they import from outside js/player/ leads back in.**
  - player.js is imported only by game.js, js/game/netcode.js and the cinematic director.
  - Only main.js imports game.js, only game.js imports netcode.js, and no module imports main.js or the director.
  - So none of these can reach player.js: config.js, utils.js, input.js, audio.js, assets.js, map-layout.js, gameplay-rules.js, weapons.js, zombies.js, render/SoldierFace.js, render/SoldierGear.js and the two vendor modules.

### 1.7 Validators

**Text pins (7 files).** These validators read `js/player.js`:

| Validator | Assertions | Where the pinned text ends up |
|---|---|---|
| validate-movement-feel | 21 | local-movement.js (momentum, the slide, mantles, jumps, the collapse ease); local.js (`goDown` parks the motion state and ends a slide); two negative pins over every file (`KeyE`, `KeyQ`) |
| validate-remote-avatar | 17 | soldier.js (the face reshape on the fresh clone, leg lengths after the final calibration, `update`'s restore before the mixer); atlas.js (the eye painted after the recolour, `_atlasCache`, `paintSoldierEye` ×2); soldier-pose.js (the tongue, the knee stretch); soldier-weapon.js (`buildDisplayWeapon`); remote.js (weapon, aim and stance from the wire); `_clipQ` and `_weaponCache`, which are in two files each; one negative pin over every file (`buildViewmodel`) |
| validate-perk-drink | 5 | remote.js |
| validate-game-invariants | 3 | local-movement.js (`wantAds`, the room guard); `this.yaw = 0; this.pitch = 0;`, which both local.js's and remote.js's constructors hold |
| validate-combat-systems | 3 | local-movement.js (the magazine clamp); local.js (the monkey fields, `refillAmmo`) |
| validate-performance-invariants | 3 | local-movement.js (`_activeColliders`); remote.js (`prev.x = this.next.x`); one negative pin over every file |
| test-multiplayer-contracts | 1 | local.js (`goDown`) |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readPlayerSource()` calls `readSplitSource(js, 'player', '.js')`.
   - It returns js/player.js, then every .js file under js/player/ in path order, joined.
   - The file's header comment gains a sentence.
2. **Switch the reads.** Each validator swaps its one read of js/player.js for `readPlayerSource()`.
   - All seven already import from `./lib/game-source.mjs`, and add the name there.
   - validate-combat-systems drops `import fs from 'node:fs'`, whose only use was that read. The other six still read other files through their existing imports.

No pin changes, and no anchor needs narrowing.

**Order-sensitive pins.** Each one sits inside a single method or constructor that moves whole, so the order of files in the joined text doesn't affect any of them:
- **validate-movement-feel:**
  - `input.pressed['KeyC']` comes before `const stanceKey =`, both in `update`.
  - The parked motion state falls between `goDown(game) {` and `revive(full = false`. Both are in local.js, in their original order.
  - `this.downEase = damp(` comes before `return; // no movement while down`, both in `update`.
- **validate-remote-avatar:**
  - `this.inner.scale.multiplyScalar(f2)` comes before `this.legLengths = [hip.distanceTo(knee)`, both in the constructor.
  - A slice starts at `  update(dt) {\n    // Hand the skeleton back`, and in it the clip restore comes before `this.mixer.update(dt)`. Both are in `SoldierVisual.update`.
  - Two bounded windows: from `skClone` to `humaniseSoldierFace(this.inner)` in the constructor, and from `putImageData` to `paintSoldierEye(g, c.width, look, face)` in `soldierAtlas`.
- **validate-perk-drink:** a slice from the first `startPerkDrink(perkId) {` to the next `\n  }`. `RemotePlayer`'s is the only one in the player text, since `WeaponRig`'s is in the weapons text.
- **validate-combat-systems** and **test-multiplayer-contracts:** one bounded window each, in `update` and in `goDown`.

**Counts across every file:** `humaniseSoldierFace(` ×1 and `paintSoldierEye(` ×2. Import lines, export lists and the re-export list add nothing of either shape.

**Behavioural (no change).**
- No validator builds a player class. validate-frame-budget stubs the player as `{ adsT: 0 }`.
- The 5 validators that load game.js link the whole js/player/ graph. So a wrong path or a missing export fails at import.

**New: `scripts/test-player-modules.mjs` (~45 lines).** This is the player counterpart of test-zombie-modules. It checks:
- js/player.js exports exactly `LocalPlayer`, `RemotePlayer` and `SoldierVisual`.
- No file under js/player/ imports js/player.js, through `assertNoImportOf`.
- From step 2: each `local-*.js` file exports one class, and every method of it is installed on `LocalPlayer.prototype`. From step 3: the same for the `soldier-*.js` files and `SoldierVisual.prototype`.
  - Both use `assertMethodFilesInstalled`.
  - The two filters work because the one module that isn't a mixin is named atlas.js.
- `readPlayerSource()` holds every file.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one.

**What still isn't caught.** No validator runs `LocalPlayer.update`, `SoldierVisual` or `RemotePlayer`. So if a moved method uses a name its new module doesn't import, it fails only when that line runs. Only the proof in §1.8 and the browser reach those lines.
- If the director split commits `scripts/test-cinematic-director.mjs`, that test builds every director soldier through `SoldierVisual`. That runs soldier.js, soldier-pose.js and `_buildWeaponMount` on every validator run.
- It doesn't reach `setWeapon`, `muzzleWorld`, `RemotePlayer`, or the atlas painting, because the headless models have no texture.

**No validator splits.** All seven are under 500 lines, and each covers more than player.js:

| Validator | Lines | Covers in js/player/ |
|---|---|---|
| validate-game-invariants | 463 | local.js, local-movement.js, remote.js |
| test-multiplayer-contracts | 350 | local.js |
| validate-movement-feel | 247 | local-movement.js, local.js |
| validate-remote-avatar | 217 | soldier.js, soldier-pose.js, soldier-weapon.js, atlas.js, remote.js |
| validate-combat-systems | 160 | local-movement.js, local.js |
| validate-performance-invariants | 124 | local-movement.js, remote.js |
| validate-perk-drink | 109 | remote.js |

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one, and stop it when the check is done. The co-op checks need two tabs, one hosting and one joined.

This order also respects the dependencies:
- remote.js imports soldier.js, and soldier.js imports atlas.js and both soldier mixins. So `SoldierVisual`'s core and `RemotePlayer` go last.
- atlas.js is the lowest-risk move, so the validator switch lands with it in step 1.
- `LocalPlayer` shares nothing with the avatar code, so it could go at any point. Step 2 is the largest payoff.

| # | Change | Out of player.js | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readPlayerSource()` with the 7 validators switched; `test-player-modules.mjs`; **atlas.js** | ~240 | Very low. Functions move verbatim, and only the `SoldierVisual` constructor calls `soldierAtlas`. No validator runs it, because the headless models have no texture and it returns early. The proof's recording canvas covers it. | Co-op: a teammate at arm's length has a skin-toned face and hands, and eyes. Each of the four personas has a different iris. `cinematic.html?shot=spawnSquad` loads with no console error. |
| 2 | **local-movement.js**, **local.js**: `LocalPlayer` with `installMixins`. player.js re-exports it. | ~620 | Low. The methods move verbatim, and callers reach them through `this.player`. No validator runs `update`, so a name missing from local-movement.js's imports fails only in the proof or in play. | Solo: walk, sprint, slide and come out crouched, tap to crouch, hold for prone, sprint out of prone, jump, mantle onto a crate, aim down sights. Go down mid-slide: the view stops bobbing, and with Quick Revive the self-revive lands after 8 s. |
| 3 | `installMixins` for `SoldierVisual`, still in player.js; **soldier-pose.js**, **soldier-weapon.js** | ~425 | Low. Verbatim. The constructor calls both mixins while it builds, so an install left out fails on the first soldier, and test-player-modules catches it before that. | Co-op: a teammate stands at a man's height, holds the rifle in both closed fists, and keeps his feet planted while walking. He looks up when aiming at the catwalk, crouches on bent knees, swings his arms in a sprint, and holds whichever gun he switches to. His muzzle flash comes from the muzzle. `?shot=spawnSquad`: the four soldiers run in. |
| 4 | **soldier.js**, **remote.js**; player.js becomes the re-export list | ~490 | Low. test-player-modules pins the export list and both installs. | Co-op, a whole match with a teammate: name tag; a perk drink, with the bottle break and the belch; down, death and respawn; gear and gun thin out past 34 m. Then back to the lobby and a second match. AGENTS.md's normal round and dog round: zombies still have open mouths and empty eye sockets. |

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script, not committed: a golden file would fail on every later intentional change.
1. **Take a baseline before step 1, and run it twice** to show the run is deterministic.
   - Build on headless-map.mjs, which also installs headless-three.mjs, and on headless-zombies.mjs. Seed `Math.random` after the imports.
   - Replace `audio.play` with a logger. It is the same instance player code imports, so every sound the code asks for gets printed.
2. **What it prints.**
   - **The local player.** A `LocalPlayer` at `map.playerSpawns[0]` on the real map, standing where game.js puts it.
     - The `game` it receives is a stub: the map; `options` with sensitivity 1; `mode: 'solo'` and `qrSelfRevives: 1`; a clock; a `weaponRig` with `isReloading` and `equip`; no-op `hud` and `fx`; and `netSend`, `onPlayerDown` and `onPlayerDead`, which log.
     - A scripted track at 60 frames a second drives it through `input.keys`, `input.pressed`, `input.mouseDX` and `mouseDY`, and `input.rmbDown`:
       - walk, strafe and turn
       - sprint, slide, and come out crouched
       - tap to crouch, hold for prone, sprint out
       - jump, aim down sights, run into a wall
       - mantle onto a ledge `_findMantle` accepts. Find one before taking the baseline.
     - Then `damage` it down mid-slide and let Quick Revive's self-revive land. Go down again and bleed out. Along the way, call `giveWeapon`, `spend`, `addPoints`, and `refillAmmo` both while down and after.
     - Every frame it prints position, velocity, yaw and pitch, stance and `stanceY`, the slide, mantle and grounded state, `landImpact`, hp, down, bleedout, `eyeHeight`, `canFire(game)` and `serialize()`.
   - **Soldiers.** Load the skeletons with `loadZombieModels()`.
     - **The atlas.**
       - Give the zombie skin material a fake square texture image.
       - From the first `new SoldierVisual` on, the canvas stub's 2D context records every call and property write.
       - Its `getImageData` returns a fixed pattern of corpse-green, near-white, near-black and mid-tone texels, so the recolour finds a face swatch and `paintSoldierEye` runs.
       - Print a SHA-256 of each persona's recorded stream, and the stream itself on a mismatch.
     - For each of the four personas, and once with `{ gear: false }`, print `ok`, the inner scale and position, `legLengths`, and the `armPose` and `handPose` quaternions.
     - Through each clip (Idle, Walk, Run, Run_Arms, Crawl, Death), `play`, then 60 frames of `update(1/60)` with aim and crouch sweeping. Each frame, print the rounded world position and quaternion of every bone in `POSED_BONES`, plus the feet and `Body`.
     - `setLOD` at 10, 20 and 40 m: which gear and weapon meshes are visible.
     - `setWeapon` for every weapon in `WEAPONS`, base and PaP: the flattened group's mesh count, each mesh's vertex count and bounding box, and `muzzleWorld()`. Then `dispose()`.
   - **Remote players.** A `RemotePlayer` in a `THREE.Scene`.
     - A scripted snapshot track drives it through `applyState` at 15 Hz and `interpolate(now, dt, camera)` at 60 Hz: idle, walk, run, sprint, crouch, prone, down, dead, and weapon changes.
     - Then `startPerkDrink('jug')` to its end; `setAuthoritativeLoadout`, `authorizeWeapon` and `equipAuthorizedWeapon`; `muzzleWorld`; `dispose`.
     - Every frame it prints the group's transform, `visual.current`, `armWeight`, the bottle's transform and visibility, and the owned-weapon map.
     - Run it once more in its own process with no models loaded, to cover the capsule fallback.
   - **No object ids or uuids.** Those depend on module load order, which the split changes.
3. **After each step, run it again.** The outputs must be identical.
4. **Review the diff.**
   - Check that every line that left player.js is verbatim in a new file.
   - Then run `git diff --color-moved=zebra`. The only changed lines should be file headers, imports, re-export lines, the three mixin class wrappers, atlas.js's export list and the two `installMixins` calls.

If a piece can't be built headless, check it in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **Fields nothing reads.**
  - `LocalPlayer`'s constructor sets `stepAcc` (40) and `reloadEnd` (42), and nothing reads either.
  - `RemotePlayer.anim` is set in the constructor (1612) and advanced in `interpolate` (1737), and nothing reads it. The other `.anim` reads in js/ are on zombies and hounds.
  - `SoldierVisual.gun` (1089) is always null. Its comment keeps it for callers that hid the old box rifle. The only one left is the cinematic director's `if(actor.gun)` in `buildCast`, which never runs.
- **A flag that changes nothing.** `revive(full)` sets `this.hp = full ? this.maxHpNow : this.maxHpNow` (181). Both callers pass `true` anyway: js/game/players.js:180 and the self-revive in `update` (268).
- **A check that can't fail.** `goDown`'s `if (game)` (167). Lines 132 and 135 have already read `game.mode` and `game.hud`, and every caller passes the game.

**Comments out of place.** The moves are verbatim, so each comment stays where it is:
- `soldierAtlas`'s doc comment (653–661) sits above `IRIS`'s, 168 lines before the function. It still lands in the same file as the function, atlas.js.
- `_measureBody` has two doc comments stacked (1203 and 1204–1232).
- In `_applyRig`, the comment about caching the pelvis (1436–1437) sits above the ankle loop, not above the `B.Body` block (1454) it describes.

### 1.10 Docs and comments

- **README.md's layout section** gains two lines after `zombies/` (262), in the form the other split folders use:
  - `player.js`: "Player entry point: re-exports js/player/"
  - `player/`: "Local player movement, co-op soldier avatars"

  README doesn't list player.js today, but each split so far has added its folder to the layout.
- **Optional:** these point at player.js for code that will live in one of its new files:
  - js/zombies/bounds.js:40, `_measureBody()`: now soldier.js
  - js/render/SoldierGear.js:80, the carry pose: now soldier-pose.js. SoldierGear.js:97, the recolour: now atlas.js.
  - js/render/SoldierFace.js:119, the painted eye: now atlas.js
  - RENDERING.md:334, the velocity model: now local-movement.js
  - scripts/validate-remote-avatar.mjs: the comment at 42 and the assertion message at 88
  - `_measureBody`'s hazard note (player.js:1215) still points to js/zombies.js for `measureNeutralBounds()`, which the zombies split moved to js/zombies/bounds.js.
- **Unchanged:**
  - AGENTS.md and llms.txt don't name player.js.
  - js/utils.js's `installMixins` comment gives Game and WeaponRig as examples. The zombies split left it that way.
- **Leave as is:**
  - The docs/split-*.md plans cite js/player.js, but they're dated records.
  - README.md:269 and :275 still say 27 validators. That was out of date before this plan, and this plan doesn't touch it.

---

## 2. The other 20 files, ranked

None of these files has changed since `docs/split-cinematic-director-plan.md` §2 was written, so its verdicts stand. These facts were checked again:
- the class spans in audio.js, net.js, fx.js, hud.js, navmesh.js and PostFX.js
- main.js's 46 top-level functions, and map-layout.js's two audits
- the shader filter and the two validators that read shaders.js
- who imports SoldierGear.js and who reads its text
- the closures in map.js and map-props.js (below)

Each file gets a full read and its own plan before it is split.

**Mid-split:** js/cinematic-director.js (970 lines in the working tree). Steps 3 and 4 of its plan take it to a ~60-line boot script.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. validate-performance-invariants and validate-coplanar-surfaces read the file's text by path, so they need a source helper like `readPlayerSource()`. |
| 2 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 3 | js/audio.js | 1,500 | One 1,322-line `AudioEngine` (177–1498). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | Its imports of js/audio/ carry `?v=` tokens, and js/weapons/catalog.js imports audio/casings.js with the same token. A split has to keep every specifier exactly, or a module loads twice. |
| 4 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move first: each binding goes to the module that assigns it, as in the director split. Heavily pinned. |
| 5 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 6 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Keep each re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. map.js, 7 files in js/props/ and validate-coplanar-surfaces import props/materials. After this plan, 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 7 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Keep each re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 8 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so low payoff |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/map.js (1,895 lines).**
  - `buildMap` takes up 1,832 of them (64–1895), and its sections all share its locals. `group` appears on 66 lines between 65 and 1885, `colliders` on 44, `solidGeos` on 43 and `pushBox` on 34.
  - The runtime functions at its end (`update`, `openDoor`, `moveBox`, 1716–1893) close over state built all through it.
  - Only the brick texture generator (`boxBlur` and `makeBrickMaps`, 76–179) reads nothing from the closure. Moving it out would still leave ~1,790 lines.
  - Splitting the rest means threading a context object through all of it, and every headless-map validator builds the map through it.
- **js/map-props.js (959 lines).**
  - One 932-line `decorateMap` closure (28–959) holds 37 inner helpers.
  - One seeded stream places every prop: `R(`, which draws from `rnd`, is called on 44 lines between 31 and 903.
  - A split would have to thread that stream through and keep every draw in its order, or every prop in the map moves.
- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) can move out to a module file, which still leaves ~700 lines.
