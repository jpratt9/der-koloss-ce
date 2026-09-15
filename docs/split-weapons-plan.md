# Split plan: js/weapons.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 24 files with 17,336 lines over the cap.

This continues `docs/split-large-files-plan.md`, whose Part 1 (js/game.js) is done. This plan covers the largest file left, `js/weapons.js`. Its §2 replaces that doc's ranking of the other files. Four entries there were marked blocked by uncommitted model-audit work, which has since been committed in `7b25e67`.

**Status: done.** The plan was carried out on 2026-09-15 in commits `df6bb9c` to `7eb168b`, one per step in §1.9. js/weapons.js is now 12 lines, and the largest file in js/weapons/ is rig.js at 484. It went as planned, with these differences:
- **One anchor pattern changed.** The validate-weapon-finishes anchor is `/^\s*(?:export )?(?:function )?NAME\(.*\) \{$/m`. The `export ` alternative is needed because step 2 exports the finish helpers.
- **Actual line counts** differ slightly from the §1.4 estimates:

  | Module | Lines |
  |---|---|
  | catalog | 313 |
  | monkey | 168 |
  | perk-bottle | 179 |
  | knuckle-crack | 115 |
  | finishes | 180 |
  | models/kit | 35 |
  | pistols | 115 |
  | smgs | 330 |
  | rifles | 271 |
  | modern-rifles | 257 |
  | snipers | 159 |
  | lmgs | 192 |
  | shotguns | 115 |
  | specials | 331 |
  | viewmodel | 267 |
  | world-display | 119 |
  | rig | 484 |
  | rig-ads | 109 |
  | rig-finish | 128 |
  | rig-reload | 240 |

  game.js is 494 lines after step 5.
- **Proof went further than §1.9 asked:**
  - The view-model fingerprint also covered the display and PaP display weapons, and it was compared after every step, not just step 3.
  - Steps 5 and 6 were also checked with a frame-by-frame run of WeaponRig against the code before the split: all 31 weapons under base, PaP, gold and diamond, through equip, ADS, fire, reload, bolt, sprint, slide, inspect, knife, monkey, knuckle crack, perk drink, swap and re-lens.
  - Both runs matched exactly, the rig run across 26,424 snapshots. Neither script was committed.
- **Browser checks.** None of the checks in §1.9 have been run.
- **viewmodel.js header.** It opens with a plain comment rather than the `====` banner it took from weapons.js.

Of the dead code in §1.10, only the four unused imports are gone, dropped by the split as §1.10 said they would be. The rest is untouched. README.md:257 is done. The optional comment updates in §1.11 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/weapons.js                    3908           8
style.css                        2502           6
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
js/net.js                         874           2
index.html                        873           2
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

Total excess lines: 17336
```

The plan is in two parts:
1. `js/weapons.js`: the largest file. Most of it has clean seams, and one block needs a restructure.
2. The other 23 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. js/weapons.js: 3,908 lines → js/weapons.js (~12) + 20 modules in js/weapons/

### 1.1 What's in it

| Lines | Contents | Used by |
|---|---|---|
| 20–327 | `WEAPONS` (31 definitions), `KICK_MUL`, `BLOOM_MUL`, `HIP_MUL`, `getStats`, `BOX_POOL`, `CASING_BY_SFX` | main.js, map.js, player.js, audio.js, assets-page.js, cinematic-director.js, 7 files in js/game/, the rig, `buildViewmodel` |
| 329–493 | `buildMonkey` | the `monkey` view-model, the rig's wind-up prop, js/game/projectiles.js, js/game/bots.js |
| 495–510 | `M` (an alias of `WM`), `profileZY`, `at` | the rig's knife (`M`), the view-model cases |
| 512–683 | Perk bottle: style, geometry and material tables, the label texture, `posePerkBottle`, `buildPerkBottle` | the rig, player.js |
| 684–722 | `hand`, `redDotSight`, the `AIM` sight-height table, `rearNotch`, `rearAperture` | `buildViewmodel` |
| 723–800 | World display: `presentForDisplay`, `buildDisplayWeapon`, `DISPLAY_LEN`, `PAP_DISPLAY_LEN`. Mixed in are `_aimBox`, `_aimVec` and `ADS_FACE_HALF_*`, which belong to `buildViewmodel`. | player.js |
| 802–2675 | `buildViewmodel` (1,874 lines): setup (802–834), the per-weapon `switch` (835–2502), the optic strip and sight-line lift (2503–2580), then the muzzle, root `userData` and ADS measurement (2581–2675) | the rig, the display builders, js/game/mystery-box.js, js/props/weaponSilhouette.js, cinematic-director.js |
| 2677–2704 | `flashTexture` | the rig constructor |
| 2706–2837 | PaP living finish: `PAP_CAMOS`, `papPattern`, `takesPbrFinish`, `wearsWeaponFinish`, `applyPapLivingFinish`, `advancePapLivingFinish` | the rig, the PaP display weapon |
| 2839–2883 | `buildPapDisplayWeapon`, `updatePapDisplayWeapon`, `disposePapDisplayWeapon` | js/game/pack-a-punch.js |
| 2885–2928 | `metalEnvTex`, `sparkleTex` | the rig's gold and diamond finishes |
| 2930–3040 | `KNUCKLE_DUR`, `poseKnuckleCrack` | the rig's `update` |
| 3042–3109 | ADS depth constants (3042–3070), ADS recoil constants (3072–3101), equip raise constants (3103–3109) | the rig |
| 3111–3908 | `WeaponRig` (798 lines) | game.js, assets-page.js, cinematic-director.js |

Three facts shape the plan:
- **1,668 of `buildViewmodel`'s 1,874 lines are one `switch`, and its cases share the function's locals.** The switch has 31 labels and 30 bodies. The bodies read the `P` part registrar, `parts`, the material set `T` and its ten aliases, the sight height `A`, `pap`, `id` and `g`. A function can't span files, so moving the cases is the one real restructure (§1.2). What keeps the move mechanical:
  - Every body ends in exactly one `break` at case level. There are 30, all at 6-space indent, and none is inside a loop.
  - No body returns from `buildViewmodel`.
  - Only `raygun` uses `g` directly, and only `mosin`/`springfield` read `id`.
  - Five bodies declare their own `s` inside a closure, so no case reads the outer `s` (the stats).
- **`WeaponRig` alone is 798 lines**, so it has to be split too. It uses the same mixin pattern as Game (§1.3).
- **Validators depend on the file.**
  - 8 validators match regexes against its text (~57 assertions), and 5 build weapons through the module.
  - Three of the text checks anchor on the first occurrence of a string. Once code starts moving between files, those anchors can land on the wrong text (§1.8).

### 1.2 buildViewmodel: each case becomes a builder function

Each case body moves into a function in its weapon class's file. The function takes one build context and returns the muzzle's z:

```js
// js/weapons/models/pistols.js
function m1911({ P, A, ST, STD, STL, STM, CK }) {
  // Slide: real 1911 side profile with the dust-cover step and rounded nose.
  const slide = new THREE.Group();
  // … the case body as it is today, 4 spaces less indented …
  P('hand_r', hand(0.014, -0.086, 0.050, -0.30));
  return -0.245;                 // was `muzzleZ = -0.245;` then `break;`
}
// magnum …
export const PISTOLS = { m1911, magnum };
```

`buildViewmodel` keeps its setup and everything after the switch. The switch and `let muzzleZ = -0.8;` become one call:

```js
const VIEWMODEL_BUILDERS = {
  ...PISTOLS, ...SMGS, ...RIFLES, ...MODERN_RIFLES, ...SNIPERS, ...LMGS, ...SHOTGUNS, ...SPECIALS,
};
// inside buildViewmodel, after `P`:
const muzzleZ = VIEWMODEL_BUILDERS[id]({ id, pap, g, parts, P, T, ST, STD, STL, STM, SH, W, WD, CK, GR, BR, A });
```

The moved text changes in only these ways:
- The indentation drops by 4 spaces.
- Each function destructures only the context fields it reads.
- `muzzleZ = X; break;` becomes `return X;`.
- The shared Mosin/Springfield body becomes `mosinOrSpringfield`, listed under both ids.

**Behaviour change: none that can be reached.**
- Today an id with no case falls through every case and returns a weapon with no parts. The table would throw instead.
- No such id can arrive. `getStats` maps every id to a `WEAPONS` key first, and the comment at 804–807 already relies on that.
- The contract test in §1.8 pins that every `WEAPONS` id has exactly one builder.
- That comment still says "the geometry switch below", so it gets reworded.

**File grouping** follows `WEAPONS[id].cls`, with two exceptions:
- All ten rifles together would be ~525 lines, so they split by era: WWII and modern.
- The launcher, wonder, melee and tactical classes (5 weapons) share `specials.js`.

Rejected alternatives:
- **A switch in viewmodel.js that calls the imported functions.** It would be 31 lines that repeat the table.
- **One file per weapon.** That's 30 files of 35–95 lines, each repeating the same dozen import lines.
- **Class files that register themselves in a shared registry when imported.** The result would depend on import order, and viewmodel.js would no longer show where a builder comes from.

### 1.3 WeaponRig: mixins, with the install loop shared with Game

`rig.js` keeps the constructor and the per-frame pose. Three groups of methods move into mixin classes, the same way Game's domains did:

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `WeaponRigAds` (rig-ads.js) | `setViewLens`, `adsDepth`, `tuckStock`, plus `ADS_HELD_Z`, `ADS_EYE_RELIEF`, `ADS_STOCK_REACH`, `ADS_FACE_CLEAR`, `ADS_BUTT_CLEAR` | The ADS solve. It reads only the lens (`viewScale`, `viewOffsetZ`) and the equipped entry. `update` and js/game/graphics.js call it. |
| `WeaponRigReload` (rig-reload.js) | `_rest`, `_restHands`, `_handTo`, `_reloadAnim`, `_boltAnim` | Part and glove animation for reloads and bolt or pump cycles (232 lines). `update` is its only caller. |
| `WeaponRigFinish` (rig-finish.js) | `applyGoldCamo`, `applyDiamondCamo`, `setKnifeGold`, and two new methods, `_dressFinish` and `_animateFinish` | Everything that creates or animates `camo`, `goldCamo` and `diamondCamo`. It is called from `equip` and `update`, from js/game's cheats, combat and mystery box, and from the /assets page. |

The two new methods are the only rig text that doesn't move verbatim:
- `_dressFinish(group, id, pap)` is `equip`'s finish block (3387–3408). `equip` calls it from the same spot, after `this.current` is set.
- `_animateFinish(dt)` is `update`'s gold, diamond and PaP-camo block (3712–3735). `update` calls it from the same spot, before `_boltAnim`.
- Without them, rig.js lands at ~525 lines. With them it lands at ~480.

**Shared install loop.** The loop at the bottom of game.js (487–500) moves to `js/utils.js` as `installMixins(Target, parts)`:
- game.js and rig.js both call it, so the loop isn't copied.
- The error becomes `` `${Target.name}.${key} is defined twice` ``, which reads exactly the same for Game.
- It goes in utils.js because game.js and the rig already import that file, and it imports only three.
- The zombies, player, audio, net and fx splits in §2 are expected to need it too.

Rejected alternatives:
- **Free functions that take the rig** (`reloadAnim(rig, t)`). Every `this.` in 430 lines would have to be rewritten.
- **A second copy of the install loop in rig.js.**

### 1.4 Target modules

| Module | Takes from weapons.js | ≈ lines |
|---|---|---|
| `js/weapons.js` | the re-export list (§1.5) | 12 |
| `js/weapons/catalog.js` | the header comment (1–2) and 20–327: `WEAPONS`, `KICK_MUL`, `BLOOM_MUL`, `HIP_MUL`, `getStats`, `BOX_POOL`, `CASING_BY_SFX` | 310 |
| `js/weapons/monkey.js` | 332–493: `buildMonkey` | 170 |
| `js/weapons/perk-bottle.js` | 512–683: `PERK_BOTTLE_STYLE`, `PERK_BOTTLE_GEO`, `PERK_BOTTLE_MAT`, `perkBottleMaterials`, `makePerkLabelTexture`, `perkBottleStyle`, `posePerkBottle` (now exported), `buildPerkBottle` | 180 |
| `js/weapons/knuckle-crack.js` | 2930–3040: `KNUCKLE_DUR`, `poseKnuckleCrack` | 115 |
| `js/weapons/finishes.js` | 2707–2837: `PAP_CAMOS`, `papPattern`, `takesPbrFinish`, `wearsWeaponFinish`, `applyPapLivingFinish`, `advancePapLivingFinish`. 2885–2928: `metalEnvTex`, `sparkleTex`. All but the first two become exports. | 180 |
| `js/weapons/models/kit.js` | 500–510 `profileZY`, `at`; 684–692 `hand`, `redDotSight`; 717–722 `rearNotch`, `rearAperture` | 40 |
| `js/weapons/models/pistols.js` | m1911, magnum | 120 |
| `js/weapons/models/smgs.js` | mp40, thompson, ppsh, type100, ump45, ak74u | 335 |
| `js/weapons/models/rifles.js` | kar98, gewehr43, m1a1, m1garand, stg44, fg42 | 275 |
| `js/weapons/models/modern-rifles.js` | acr, famas, galil, commando | 260 |
| `js/weapons/models/snipers.js` | mosin and springfield (one builder), ptrs41 | 160 |
| `js/weapons/models/lmgs.js` | bar, mg42, browning | 195 |
| `js/weapons/models/shotguns.js` | trench, dbshotgun | 115 |
| `js/weapons/models/specials.js` | panzerschreck, raygun, dg2, bowie, monkey | 335 |
| `js/weapons/viewmodel.js` | the 329–331 banner; 694–715 `AIM`; 739–749 `_aimBox`, `_aimVec`, `ADS_FACE_HALF_*`; 802–834 and 2503–2675 of `buildViewmodel`; the builder table | 270 |
| `js/weapons/world-display.js` | 723–738 and 750–800: the banner, `_dispBox`, `_dispV`, `DISPLAY_LEN`, `PAP_DISPLAY_LEN`, `presentForDisplay`, `buildDisplayWeapon`. 2839–2883: `buildPapDisplayWeapon`, `updatePapDisplayWeapon`, `disposePapDisplayWeapon`. | 120 |
| `js/weapons/rig.js` | 495–498 `M`; 2677–2706 `flashTexture` and the rig's comment; 3072–3109 recoil and equip constants; `WeaponRig`'s constructor, `knuckleCrack`, `monkeyWindup`, `startInspect`, `startPerkDrink`, `isDrinkingPerk`, `swapTo`, `equip`, `_poseRaiseStart`, `startReload`, `isReloading`, `cycleBolt`, `muzzleWorld`, `fire`, `update`; the mixin install | 480 |
| `js/weapons/rig-ads.js` | 3042–3070 ADS depth constants; `setViewLens`, `adsDepth`, `tuckStock` | 110 |
| `js/weapons/rig-finish.js` | `applyGoldCamo`, `applyDiamondCamo`, `setKnifeGold`, `_dressFinish`, `_animateFinish` | 115 |
| `js/weapons/rig-reload.js` | `_rest`, `_restHands`, `_handTo`, `_reloadAnim`, `_boltAnim` | 240 |

Ordering and headers:
- Members keep their original relative order, and the two new rig-finish methods go last.
- Each file opens with a comment naming its part of the weapons code.
- The rig-*.js files add "Methods of WeaponRig: rig.js copies them onto WeaponRig.prototype.", as the js/game/ files do for Game.

### 1.5 What stays in js/weapons.js

It stays the public entry point, but as re-exports only:

```js
export { WEAPONS, getStats, BOX_POOL, CASING_BY_SFX } from './weapons/catalog.js';
export { buildMonkey } from './weapons/monkey.js';
export { buildPerkBottle } from './weapons/perk-bottle.js';
export { buildViewmodel } from './weapons/viewmodel.js';
export { buildDisplayWeapon, buildPapDisplayWeapon, updatePapDisplayWeapon, disposePapDisplayWeapon } from './weapons/world-display.js';
export { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';
export { WeaponRig } from './weapons/rig.js';
```

These are the 14 names it exports today. Some names become exports only so the new files can share them, and weapons.js does not re-export those:
- `posePerkBottle`
- the finish helpers
- the kit functions
- the class tables

**No caller changes:**
- main.js, map.js, player.js (both of its imports), audio.js, assets-page.js, cinematic-director.js
- props/weaponSilhouette.js and game.js
- the 9 js/game/ files that import it
- the 5 validators that `loadGameModule('weapons.js')`

During steps 1–5, weapons.js does both jobs: it re-exports what has moved, and it imports from the new files whatever its remaining code needs.

### 1.6 Imports

**New modules.** Named imports come from three (`THREE`), render/WeaponMaterials.js (`WM`, `matSet`), render/WeaponParts.js (geometry and part builders), render/WeaponHands.js (hands), utils.js and gameplay-rules.js.

| Module | Imports |
|---|---|
| catalog.js | `CASING_KIND_NAMES` from `'../audio/casings.js?v=1'` |
| monkey.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, latheGeo` |
| perk-bottle.js | `THREE`; `clamp, lerp`; `PERK_DRINK_TIMELINE, perkDrinkPhase`; `foreGripHand` |
| knuckle-crack.js | `clamp`; `setHandPose` |
| finishes.js | `THREE` |
| models/kit.js | `WM, matSet`; `mesh, plateGeo, redDot, rearNotch as rearNotchSight, rearAperture as rearApertureSight`; `triggerHand` |
| models/pistols.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, frontSight, ejectionPort, triggerGroup, magazine, screw`; `profileZY, at, hand, rearNotch` (./kit.js) |
| models/smgs.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, torusGeo, plateGeo, latheGeo, barrel, perfShroud, muzzleCone, suppressor, frontSight, railRearSight, ejectionPort, triggerGroup, magazine, rail, slingLoop, chargingHandle, selector`; `supportHand, foreGripHand`; `profileZY, at, hand, redDotSight, rearNotch, rearAperture` |
| models/rifles.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, sphereGeo, latheGeo, barrel, perfShroud, muzzleCone, frontSight, rearTangent, ejectionPort, triggerGroup, magazine, slingLoop, chargingHandle, selector, bipod`; `supportHand`; `profileZY, at, hand, redDotSight, rearAperture` |
| models/modern-rifles.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, torusGeo, plateGeo, latheGeo, barrel, perfShroud, flashHider, frontSight, railRearSight, ejectionPort, triggerGroup, magazine, rail, chargingHandle, selector, bipod`; `supportHand`; `profileZY, at, hand, redDotSight, rearAperture` |
| models/snipers.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, latheGeo, barrel, frontSight, rearTangent, scope, triggerGroup, slingLoop, bipod`; `supportHand`; `profileZY, at, hand` |
| models/lmgs.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, perfShroud, muzzleCone, frontSight, rearTangent, ejectionPort, triggerGroup, magazine, chargingHandle, selector, bipod`; `supportHand`; `profileZY, at, hand, rearAperture` |
| models/shotguns.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, torusGeo, latheGeo, barrel, perfShroud, frontSight, ejectionPort, triggerGroup, slingLoop`; `foreGripHand`; `profileZY, at, hand, rearNotch` |
| models/specials.js | `THREE`; `WM`; `mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, plateGeo, latheGeo, frontSight, triggerGroup`; `supportHand, foreGripHand`; `profileZY, at, hand, rearNotch`; `buildMonkey` (../monkey.js) |
| viewmodel.js | `THREE`; `matSet`; `mesh, bevelBoxGeo, FRONT_POST_H`; `getStats` (./catalog.js); the 8 class tables (./models/*.js) |
| world-display.js | `THREE`; `buildViewmodel` (./viewmodel.js); `applyPapLivingFinish, advancePapLivingFinish` (./finishes.js) |
| rig.js | `THREE`; `clamp, damp, lerp, installMixins`; `PERK_DRINK_TIMELINE`; `WM`; `bx, cyl`; `crackFist, knifeHand`; `WEAPONS`; `buildMonkey`; `buildPerkBottle, posePerkBottle`; `buildViewmodel`; `KNUCKLE_DUR, poseKnuckleCrack`; the three mixins |
| rig-ads.js | none |
| rig-reload.js | `clamp, lerp`; `setHandPose, resetHandPose`; `WEAPONS` (./catalog.js) |
| rig-finish.js | `THREE`; `applyPapLivingFinish, advancePapLivingFinish, wearsWeaponFinish, takesPbrFinish, metalEnvTex, sparkleTex` (./finishes.js) |

**Dropped.** `ringGeo`, `compensator`, `buildHand` and `fistHand` are imported today but never used, so no new module imports them (§1.10).

**Cache tokens.**
- catalog.js keeps `?v=1` on casings.js. That is the exact URL audio.js imports, so there is still one casings module.
- No new import gets a query string. The browser treats a URL with a query as a separate module, so it would load a second copy of the `WM` material library and of the bottle, camo and flash caches.

### 1.7 Circular imports: none are created

Three rules keep it that way:
- **No file under js/weapons/ may import `js/weapons.js`.** The contract test enforces it. It holds at every step, which is why the catalog and the monkey move before the builders that import them (§1.9).
- **The import graph inside js/weapons/ has no cycles:**
  - catalog, monkey, perk-bottle, knuckle-crack, finishes, models/kit and rig-ads import nothing from js/weapons/.
  - models/*.js import kit, and specials.js also imports monkey.
  - viewmodel imports catalog and models.
  - world-display imports viewmodel and finishes.
  - rig-reload imports catalog, and rig-finish imports finishes.
  - rig imports catalog, monkey, perk-bottle, viewmodel, knuckle-crack and the three mixins.
- **Nothing they import from outside js/weapons/ leads back in.** That means utils.js, gameplay-rules.js, render/WeaponParts.js, render/WeaponHands.js, render/WeaponMaterials.js and audio/casings.js. The only importers of weapons.js are the callers in §1.5.

### 1.8 Validators

**Text pins (8 files).** These validators read `js/weapons.js`:

| Validator | Assertions | Where the pinned text ends up |
|---|---|---|
| validate-perk-drink | ~20 | perk-bottle.js, rig.js |
| validate-game-invariants | 9 | catalog.js, rig.js |
| validate-combat-systems | 9 | catalog.js |
| validate-ads-recoil | 8 | rig.js |
| validate-audio-loudness | 3 | catalog.js |
| validate-pack-a-punch | 3 | rig.js |
| validate-weapon-finishes | 3 | finishes.js, rig-finish.js |
| validate-performance-invariants | 2 | world-display.js |

The change:
1. **Generalize the source helper.** In `scripts/lib/game-source.mjs`, the body of `readGameSource()` becomes `readSplitSource(name)`. It returns `js/<name>.js`, then every `.js` file under `js/<name>/` (recursive) in path order, joined. `readGameSource()` calls it with `'game'` and returns exactly what it does today. The new `readWeaponsSource()` calls it with `'weapons'`.
2. **Switch the reads.** Each of the 8 validators swaps its one read of `js/weapons.js` for `readWeaponsSource()`.
3. **Narrow three anchors.** No assertion changes. Each of these finds the first occurrence of a string, and weapons.js comes first in the joined text for as long as it still holds code:
   - **validate-combat-systems `weaponBlock`** searches for `` `  ${id}: {` `` from the start of the text. `PAP_CAMOS` has lines of the same shape (`  kar98: { hues: …`). Once step 1 moves the catalog out, the search lands in the camo table. Fix: search from `export const WEAPONS = {`.
   - **validate-game-invariants' M1911 regex** would start at `PAP_CAMOS`'s `m1911: {` for the same reason. It would still pass, but only by luck, with a capture that runs from there into the catalog. Fix: run it on the text from `export const WEAPONS = {` on.
   - **validate-weapon-finishes** slices 1,400 characters after the first `applyPapLivingFinish(`. Once step 2 moves finishes.js out, that lands on the call in `buildPapDisplayWeapon` and fails. Fix: anchor all three names on their definition line, `/^\s*(?:function )?NAME\(.*\) \{$/m`.

   Every other weapons pin matches text that occurs once, so where it sits doesn't matter.

**Behavioural (no change).** These build through `js/weapons.js`, which keeps every export:
- validate-weapon-shapes and validate-weapon-models: every weapon and its parts
- validate-weapon-finishes: 31 weapons × 4 finishes, through `WeaponRig.equip`
- validate-ads-sight-picture: view-model measurement and the ADS solve
- validate-ads-recoil: `getStats`

Every validator that loads game.js or builds the map also links the whole weapons graph, because map.js and the wall-buy chalk art both import weapons.js. A wrong path or a missing export fails about 20 validators at import.

**New: `scripts/test-weapon-modules.mjs` (~70 lines).** This is the weapons counterpart of test-game-modules. It checks:
- js/weapons.js exports exactly its 14 names.
- No file under js/weapons/ imports js/weapons.js.
- `readWeaponsSource()` contains every file.
- From step 3: the models/ class tables don't overlap, and together they hold exactly the `WEAPONS` ids. Without this, an id listed in two tables would let one builder silently replace the other.
- From step 5: each rig-*.js exports one class, every method is installed on `WeaponRig.prototype`, and no method is in two files.

**No validator splits.** The ones covering these modules are all under 500 lines, and each already covers one concern:

| Validator | Lines | Covers |
|---|---|---|
| validate-weapon-shapes | 302 | the builders |
| validate-ads-sight-picture | 301 | view-model measurement and the ADS solve |
| validate-weapon-models | 190 | the builders, display weapons, the monkey |
| validate-ads-recoil | 177 | rig recoil |
| validate-weapon-finishes | 170 | finishes |
| validate-perk-drink | 109 | the bottle |

### 1.9 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one.

This order is also the dependency order:
- Step 3 has the biggest payoff but can't go first. viewmodel.js needs `getStats` and specials.js needs `buildMonkey`, and taking either from weapons.js would create a cycle.
- The rig goes last because it imports almost everything else.

| # | Change | Out of weapons.js | Risk | Extra check |
|---|---|---|---|---|
| 1 | `readWeaponsSource()`, the 8 validators switched over, the three anchors narrowed, `test-weapon-modules.mjs`, **catalog.js** | ~310 | Very low. It's data plus one function, with no three. Three validators pin its text and more call `getStats`. | none |
| 2 | **monkey.js**, **perk-bottle.js**, **knuckle-crack.js**, **finishes.js** | ~620 | Low. None of them imports anything else from weapons.js, and they move verbatim. The only edit is `export` on seven helpers that were private. | solo: drink a perk, throw a Monkey Bomb, Pack-a-Punch a weapon (knuckle crack, then the living camo) |
| 3 | **models/kit.js**, the 8 **models/** class files, **viewmodel.js** | ~1,940 | Medium. This is the one restructure (§1.2). Four validators build all 31 weapons in both variants, and the fingerprint below proves nothing else changed. | solo: mystery box cycle, wall-buy chalk art, aim through a scope, a red dot and iron sights, reload the MP40, MG42 and Trench Gun |
| 4 | **world-display.js** | ~110 | Low | solo: mystery box spin, Pack-a-Punch output weapon |
| 5 | `installMixins` in utils.js with game.js switched to it; **rig-ads.js**, **rig-reload.js**, **rig-finish.js** with `_dressFinish` and `_animateFinish` | ~435 | Low–medium. Methods move verbatim except the two finish blocks. test-game-modules proves Game still installs. validate-weapon-finishes equips every weapon under every finish. | solo: reload and bolt cycle (Kar98k, Trench Gun), ADS stock tuck, GOLD STANDARD, Pack-a-Punch under GOLD STANDARD (diamond), gold knife from the box; the /assets finish switcher |
| 6 | **rig.js**; weapons.js becomes the re-export list | ~465 | Low. Four validators pin its text, and none of those pins depends on position. | solo: first frame, weapon swap, fire, sprint, slide, knife, perk drink; the /assets armory viewer |

**Proof for step 3.** Use a throwaway script, not committed: a golden snapshot would fail on every later intentional model change.
1. Before the step, run it on `scripts/lib/headless-three.mjs`. For all 31 weapons, base and PaP, it prints:
   - part names and mesh count
   - each mesh's material type, colour, roughness and metalness
   - rounded world-space bounds
   - `sightY`, `aimZ`, `rearZ`, `faceZ`
   - the muzzle position and `adsTuck` length
2. After the step, run it again. The two outputs must be identical.
3. Review the diff with `git diff --color-moved=zebra --color-moved-ws=allow-indentation-change`. The only lines that should show as changed are the builder signatures, the `return`s and the dispatch.

### 1.10 Dead code found

This plan doesn't touch any of it. Whether to remove it is John's call.

- **Unused imports.** weapons.js imports `ringGeo` and `compensator` from WeaponParts and `buildHand` and `fistHand` from WeaponHands, and never uses them.
  - No new module imports them, so the split drops them as a side effect.
  - Their own modules still export them.
- **Exports nothing imports.** No file in the repo imports `KNUCKLE_DUR` or `poseKnuckleCrack`.
  - The comment names `__fists-lab.html` as the user, and that page isn't in the repo.
  - The re-export list keeps both.
- **A no-op line.** `WeaponRig.update` has `g.position.z -= 0; // weapon hidden; no gun lunge` at 3901.

### 1.11 Docs and comments

- **README.md:257:** add a `weapons/` line under `weapons.js`.
- **weapons.js:804–807:** the comment about "the geometry switch below has no default case" moves to viewmodel.js. Reword it to describe the builder table.
- **Optional:** these comments say weapons.js about code that will live in one of its new files. Updating them is optional:
  - js/game/combat.js:20: `ADS_KICK_*`, now in rig.js
  - js/audio/casings.js:11: the `casing` field, now in catalog.js
  - scripts/lib/headless-three.mjs:3
- **Unchanged:** js/audio.js:25–27 is still true of the re-export list.
- **Already stale, not this change's job:** README says "27 headless validators". There are 35, and there will be 36 after this plan.
- **Leave as is:** docs/model-audit/README.md cites weapons.js line numbers, but it's a dated record.

---

## 2. The other 23 files, ranked

These verdicts come from a structural skim of each file's top-level declarations and their spans. Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/zombies.js | 2,073 | Its first ~1,000 lines are clean: the model and corpse builders, `ZombieVisual` and its bound measurements, the hit hulls and aim points, the pose functions. `ZombieManager` (1048–2073) is one class and needs `installMixins`. | No longer blocked. It is the second-largest code file, and the headless zombie validators build through it. |
| 2 | style.css | 2,502 | Clean: banner sections by screen | The risk is cascade order, so the new `<link>`s must keep today's order. test-multiplayer-contracts and validate-game-invariants read this file and need a joined read. |
| 3 | js/player.js | 1,809 | Clean: `LocalPlayer` (11–668), the soldier eye, atlas and arm-IK helpers (669–1070), `SoldierVisual` (1071–1579), `RemotePlayer` (1580–1809) | `LocalPlayer` alone stays ~160 lines over: use `installMixins`, or accept it. 7 validators read its text. |
| 4 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. |
| 5 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` and `auditMapEgress` on the other | Pure module |
| 6 | js/audio.js | 1,500 | One 1,323-line `AudioEngine` (177–1500). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | none |
| 7 | js/main.js | 1,077 | 46 functions sharing module-level `app` and options state; `boot` is 300 lines. | The shared state has to move into a module first. Heavily pinned. |
| 8 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–785). Use `installMixins`. | net.js holds the event allowlists, so treat it like Part 1's remote-combat step. |
| 9 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | none |
| 10 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | No longer blocked. After §1, 12 files in js/weapons/ import WeaponParts, so keep WeaponParts.js re-exporting whatever moves out of it. |
| 11 | js/cinematic-director.js | 1,926 | Clean: the `SHOTS` table, the cast builders, `seek` | Not deployed, so low payoff |
| 12 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so low payoff |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal: one class each, 60–180 lines over | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/map.js (1,895 lines).**
  - One `buildMap` closure is 1,833 lines, and every inner helper reads its locals.
  - Splitting it means threading a context object through all of it.
  - Every headless-map validator builds the map through it.
- **js/map-props.js (959 lines).** One 933-line `decorateMap` closure, with the same problem.
- **index.html (873 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (685–867) can move out to a module file, which still leaves ~690 lines.
