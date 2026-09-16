# Split plan: js/render/WeaponParts.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 10 files with 2,061 lines over the cap.

This continues `docs/split-fx-plan.md`, whose plan is done.

This plan covers `js/render/WeaponParts.js`, the largest file with a clean seam. index.html is larger, at 881 lines, but the net plan's full read confirmed it has none, nothing has touched it since, and a fresh read of its five regions agrees (§2). WeaponParts.js has sat at rank 2 in the last two rankings; a full read moves it to rank 1 ahead of WeaponMaterials.js, because its seams are the cleanest in the repo:

- **It is not a class.** It is 35 exported functions and constants with no shared mutable state except one geometry cache, so the split needs no `installMixins` and no `this` — it is the re-export shape `js/render/shaders.js` already uses.
- **The file already carries its seams as four `// ---` section banners,** written by whoever last worked in it: primitives, mesh sugar, barrels & muzzles, sights, receiver furniture. The split follows them exactly; no group is invented and none is cut at a line number.
- **The dependency graph inside the file is already one-way.** Every call site was enumerated: the primitives and the mesh sugar call only each other and `THREE`; the other three groups call the primitives, the mesh sugar and `WM`, and never each other. There is exactly one back-edge candidate, `geo()`, used by the primitives and by `perfShroud` — and it lives with the primitives, so it stays a forward edge.
- **All 13 importers can stay untouched.** They import named functions from `./WeaponParts.js`, `../render/WeaponParts.js` or `../../render/WeaponParts.js`; an entry that re-exports all 35 names changes none of them.
- **No validator pins the file's text.** `readWeaponsSource()` reads js/weapons.js and js/weapons/ only, so WeaponParts.js is in no `read…Source()` helper, and no regex in scripts/ names it. Six validators do build real view-models through it, which is the proof this split needs and already has.

This doc's §2 replaces the fx plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `7f00b1c`, `7cb8250`, `dfad90a`, `7930aa0` and `9b40d02`, one per step in §1.8. js/render/WeaponParts.js went from 794 lines to 20, and the largest file in js/render/WeaponParts/ is sights.js, at 257. `count_lines.py` now finds 9 files with 1,767 lines over the cap, with index.html the largest. It went as planned, with these notes:

- **Actual line counts** are within six lines of the §1.3 estimates.

  | Module | Lines | Estimate |
  |---|---|---|
  | js/render/WeaponParts.js | 20 | ~24 |
  | geometry | 158 | ~160 |
  | muzzles | 176 | ~182 |
  | sights | 257 | ~258 |
  | furniture | 205 | ~208 |

  The entry was 647 lines after step 1, 397 after step 2 — under the cap, as §1.8 predicted — 197 after step 3 and 20 after step 4.
- **How the moves were made.** A throwaway script wrote each step's files from the 794-line file by the ranges in §1.3, then checked them on disk. None of it was committed. It checked that the ranges tile the file: every code or comment line lands in exactly one file, and the nine lines that land nowhere (13, 28, 140, 160, 164, 336, 360, 591, 595) are all blank. **No moved line was edited at all** — not even to add an `export`, because `roundedRect` and `bake` each moved with their only caller and stayed private. Diffing the original against the five files afterwards, the only non-blank lines not present verbatim are line 12 (the `WM` import, whose relative path gained a `../` in three modules) and the three section banners that became module headers.
  - **One deviation from §1.3.** geometry.js takes lines 2–10, not 1–10: line 1 says "Reusable procedural firearm sub-assemblies", which describes the library and stays on the entry as §1.4 shows. geometry.js gets a first line naming what it actually holds, and the cache paragraphs verbatim below it.
- **The proof ran as §1.8 describes.** The baseline, run twice, matched itself. It prints 5,381 lines: all 31 weapons' view-models built stock and Pack-a-Punched, every object's type, name, visibility, render order and world matrix to six decimals, every material's type, colours, roughness, metalness and map list, every geometry's vertex and index counts and a SHA-256 of its attribute data, and `userData` — with geometries and materials numbered in first-seen order across all 62 builds, so a duplicated cache renumbers the dump from the first re-use onward. The totals line pins 834 distinct geometries, all tagged `wpShared`, and 47 materials. **After steps 1, 2, 3 and 4 the output matched the baseline byte for byte.**
  - `Math.random` is seeded with an xorshift before anything is built: js/weapons/finishes.js draws texture noise with it. Nothing in the geometry path uses it, but leaving it unseeded would have made the material dump non-deterministic.
- **The name check** — every file imports the names it uses and uses the names it imports — passed at every step.
- **test-weapon-parts-modules.mjs is 150 lines,** rather than ~110, almost all of it the cache section and its comment. It was run on copies of the tree with the seven mistakes §1.7 lists, and failed on each.
  - **The cache check as §1.7 worded it would not have worked.** "A geometry reached through muzzles.js is the same object as the one reached through geometry.js" was first written as `perfShroud(…) === perfShroud(…)`, which a muzzles.js with its own `_geo` passes — its own Map is still a consistent cache. The check that bites asks geometry.js' `geo()` for the exact key `perfShroud` bakes under and requires the same object back; a second Map means the entry cannot see the key and `make()` runs again. The doctored tree was not rejected until this was fixed.
  - **The miscase case is rejected for a different reason on macOS.** `./WeaponParts/Geometry.js` resolves to the same file here, so the entry loads geometry.js under two URLs and the re-export identity check fires first. On a case-sensitive host it would not resolve at all. The `onDisk` self-assertion in the test is what covers that directly, and it is checked explicitly.
  - **`mesh` defined in two modules** is caught by the re-export identity check rather than the duplicate-name check, because `readdirSync().sort()` reads furniture.js before geometry.js. Either check rejects it; which one fires depends on file order.
  - §1.7's doctored sibling import was chosen as `geometry.js imports ./sights.js` for the reason given there, and it is the case the test carries as its own negative assertion.
- **The validators number 65,** and all of them passed after every step. The 64 before step 1 passed too.
- **§1.10's doc edits were made:** README.md's two "64 headless validators" mentions are now 65, and the second one names the shared geometry cache. AGENTS.md carries no count. The repository-layout block needed no change, as §1.10 predicted.
- **The read turned up no bug.** Nothing in §1.9 was touched, including the vestigial `arcStart` and the undocumented `toFixed(5)` cache rounding.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a played match.

The table this plan was written against:

```
10 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
index.html                        881           2
js/render/WeaponParts.js          794           2
js/assets-page.js                 726           2
js/render/SoldierGear.js          717           2
js/render/WeaponMaterials.js      712           2
js/props/materials.js             685           2
js/render/ZombieDetail.js         682           2
js/render/PostFX.js               680           2
js/navmesh.js                     625           2
js/hud.js                         559           2

Total excess lines: 2061
```

The plan has two parts:

1. `js/render/WeaponParts.js`: the geometry cache, the primitives and the mesh sugar move into one leaf module; the three builder groups move into three modules that import it. The entry becomes four `export … from` lines.
2. The other 9 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/render/WeaponParts.js: 794 lines → js/render/WeaponParts.js (~24) + 4 modules in js/render/WeaponParts/

### 1.1 What's in it

Procedural firearm sub-assemblies for the first-person view-models. Every geometry goes through `geo()`, a module-level `Map` keyed on the exact construction parameters, so thirty-one weapons share one bevelled receiver box and one trigger-guard extrusion. Cached geometries are tagged `userData.wpShared` so the Pack-a-Punch display teardown knows not to dispose them out from under every other weapon.

The file's own banners, with the line ranges a fresh read confirmed:

| Lines | Section | Names |
|---|---|---|
| 1–10 | header comment | — |
| 11–12 | imports | `THREE`, `WM` |
| 14–27 | the geometry cache | `_geo`, `key` (private), `geo` |
| 29–139 | `// primitives` | `roundedRect` (private), `bevelBoxGeo`, `plateGeo`, `cylGeo`, `sphereGeo`, `torusGeo`, `ringGeo`, `latheGeo` |
| 141–159 | `// mesh sugar` | `mesh`, `bx`, `cyl` |
| 161–335 | `// barrels & muzzles` | `barrel`, `bake` (private), `perfShroud`, `flashHider`, `compensator`, `muzzleCone`, `suppressor` |
| 337–590 | `// sights` | `NOTCH_DEPTH`, `FRONT_POST_H`, `frontSight`, `rearNotch`, `rearAperture`, `rearTangent`, `railRearSight`, `redDot`, `scope` |
| 592–794 | `// receiver furniture` | `ejectionPort`, `triggerGroup`, `magazine`, `rail`, `screw`, `slingLoop`, `chargingHandle`, `selector`, `bipod` |

The ranges tile the file: lines 13, 28, 140, 160, 336 and 591 are blank, and every other line lands in exactly one range.

Three facts from the read that decide the split:

- **`geo()` is the only shared state, and it is shared upward only.** Its call sites are lines 52, 71, 96, 101, 105, 109 and 126 (all primitives) and line 247 (`perfShroud`). Nothing in sights or receiver furniture calls it. Put it with the primitives and every arrow points one way.
- **`WM` is used by the three builder groups and by nothing else.** Its 17 call sites are at 188, 190 (barrel), 287, 288, 297, 298, 302, 304, 316, 317, 332, 333 (muzzles), 469, 545, 547 (sights) and 710, 720 (furniture). The primitives and the mesh sugar never touch it, so the leaf module imports `THREE` alone.
- **The two private helpers each have exactly one home.** `roundedRect` (34) is called at 55 only, inside `bevelBoxGeo`. `bake` (202) is called at 268 only, inside `perfShroud`. Neither becomes a cross-module import; each moves with its caller and stays private.

### 1.2 Mechanism

The re-export entry, the shape `js/render/shaders.js`, `js/weapons.js`, `js/zombies.js`, `js/player.js` and `js/map-layout.js` already use: the entry defines nothing and re-exports the names its callers import, so no caller learns which module defines one.

Not `installMixins`. There is no class and no `this`; the fx, net, audio and zombies splits used mixins because their files were one class each, and this one is a function library.

The folder is `js/render/WeaponParts/`, matching `js/render/HellhoundModel/` — a PascalCase entry beside a folder of the same name holding lowercase modules (`body.js`, `head.js`, `limbs.js`, `materials.js`, `primitives.js`).

### 1.3 Target modules

| Module | Lines (est.) | Takes | Exports |
|---|---|---|---|
| `js/render/WeaponParts/geometry.js` | ~160 | 14–27, 29–139, 141–159 | `geo`, `bevelBoxGeo`, `plateGeo`, `cylGeo`, `sphereGeo`, `torusGeo`, `ringGeo`, `latheGeo`, `mesh`, `bx`, `cyl` (11) |
| `js/render/WeaponParts/sights.js` | ~258 | 337–590 | `NOTCH_DEPTH`, `FRONT_POST_H`, `frontSight`, `rearNotch`, `rearAperture`, `rearTangent`, `railRearSight`, `redDot`, `scope` (9) |
| `js/render/WeaponParts/furniture.js` | ~208 | 592–794 | `ejectionPort`, `triggerGroup`, `magazine`, `rail`, `screw`, `slingLoop`, `chargingHandle`, `selector`, `bipod` (9) |
| `js/render/WeaponParts/muzzles.js` | ~182 | 161–335 | `barrel`, `perfShroud`, `flashHider`, `compensator`, `muzzleCone`, `suppressor` (6) |
| `js/render/WeaponParts.js` | ~24 | — | all 35, re-exported |

11 + 9 + 9 + 6 = 35, the file's current export count.

The estimates run ~38 lines above 794 in total: each module gains a short header comment saying what it holds, and the `THREE` / `WM` / `./geometry.js` import lines are repeated three times. That is the same overhead the fx and shaders splits carried.

`geometry.js` keeps the current file's first ten lines as its header, because they describe the cache, which is what moves into it. The 23-line comment above `// sights` (337–359) — the one that records why the notch's *shoulders* and not its floor land on the line of sight — moves verbatim as `sights.js`'s module header. It is the most load-bearing comment in the file and must not be paraphrased.

### 1.4 What stays in js/render/WeaponParts.js

Nothing but a header and four re-export lines:

```js
// Reusable procedural firearm sub-assemblies for the first-person view-models.
// The code is in js/render/WeaponParts/; this file re-exports the names callers
// import, so no caller has to know which module defines one.
export {
  geo, bevelBoxGeo, plateGeo, cylGeo, sphereGeo, torusGeo, ringGeo, latheGeo, mesh, bx, cyl,
} from './WeaponParts/geometry.js';
export {
  barrel, perfShroud, flashHider, compensator, muzzleCone, suppressor,
} from './WeaponParts/muzzles.js';
export {
  NOTCH_DEPTH, FRONT_POST_H, frontSight, rearNotch, rearAperture, rearTangent, railRearSight,
  redDot, scope,
} from './WeaponParts/sights.js';
export {
  ejectionPort, triggerGroup, magazine, rail, screw, slingLoop, chargingHandle, selector, bipod,
} from './WeaponParts/furniture.js';
```

The `import * as THREE` and `import { WM }` lines leave the entry with the last group that needs them.

### 1.5 Imports

**New, inside the folder.** Each was derived from the call sites, not guessed:

| Module | Imports |
|---|---|
| `geometry.js` | `THREE` only |
| `muzzles.js` | `THREE`; `{ WM }` from `'../WeaponMaterials.js'`; `{ geo, mesh, cylGeo, ringGeo, bevelBoxGeo, torusGeo, latheGeo }` from `'./geometry.js'` |
| `sights.js` | `THREE`; `{ WM }` from `'../WeaponMaterials.js'`; `{ mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, ringGeo, latheGeo }` from `'./geometry.js'` |
| `furniture.js` | `THREE`; `{ WM }` from `'../WeaponMaterials.js'`; `{ mesh, bevelBoxGeo, plateGeo, cylGeo, torusGeo }` from `'./geometry.js'` |

`geo` is imported by `muzzles.js` alone. `plateGeo` is imported by `furniture.js` alone. `sphereGeo` is imported by `sights.js` alone.

**Changed, outside the folder: none.** All 13 importers keep the specifier they have today, because the entry re-exports every name:

| Importer | Names it takes |
|---|---|
| `js/render/WeaponHands.js` | `bevelBoxGeo, cylGeo, sphereGeo, torusGeo, mesh` |
| `js/weapons/rig.js` | `bx, cyl` |
| `js/weapons/viewmodel.js` | `mesh, bevelBoxGeo, FRONT_POST_H` |
| `js/weapons/monkey.js` | `mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, latheGeo` |
| `js/weapons/models/kit.js` | `mesh, plateGeo, redDot, rearNotch, rearAperture` |
| `js/weapons/models/pistols.js` | 11 names |
| `js/weapons/models/smgs.js` | 19 names |
| `js/weapons/models/rifles.js` | 17 names |
| `js/weapons/models/modern-rifles.js` | 18 names |
| `js/weapons/models/shotguns.js` | 11 names |
| `js/weapons/models/snipers.js` | 13 names |
| `js/weapons/models/lmgs.js` | 16 names |
| `js/weapons/models/specials.js` | 9 names |

None of them carries a `?v=` token today, and none of the new intra-folder specifiers may carry one either: `test-audio-modules.mjs` walks all of js/ and fails a module imported under two different query strings.

### 1.6 Circular imports: none are created

- `js/render/WeaponMaterials.js` imports `three` and nothing else — verified. So `muzzles.js`, `sights.js` and `furniture.js` importing `../WeaponMaterials.js` closes no loop, and it is the same edge the entry has today.
- `geometry.js` imports nothing from the folder, so it cannot be in a cycle.
- No module in the folder imports `../WeaponParts.js`. That is the rule the new test enforces; it is what turns the entry into a leaf of the folder rather than a member of it.
- `js/weapons/models/kit.js` imports `../../render/WeaponParts.js` and is imported back by its siblings, but that edge is unchanged and does not run through the new folder.

### 1.7 Validators

**Nothing has to change before the first line moves.** Unlike the fx split, no `read…Source()` helper and no regex names this file, so `scripts/lib/game-source.mjs` gains nothing. Confirmed by grepping all 64 scripts for `WeaponParts`: no hit.

**Six validators already exercise it end to end,** by loading `js/weapons.js` and building real view-models in headless three:

| Validator | What it would catch |
|---|---|
| `validate-weapon-models.mjs` | A part that stopped being built, or moved, on any of the 31 weapons |
| `validate-weapon-shapes.mjs` | Geometry that stopped touching what it must touch |
| `validate-ads-sight-picture.mjs` | A sight whose aligned feature left the line of sight — the exact failure the `// sights` comment is about |
| `validate-weapon-finishes.mjs` | A material binding lost in the move |
| `test-weapon-rig.mjs` | `bx` / `cyl` breaking the first-person rig |
| `test-weapon-modules.mjs` | js/weapons/ still importing what it imports |

Plus `validate-module-syntax.mjs`, which walks js/ recursively and parses every module, so the new folder is covered the moment it exists.

**New: `scripts/test-weapon-parts-modules.mjs` (~110 lines),** modelled on `test-shader-modules.mjs`, which covers the same re-export shape:

- `js/render/WeaponParts.js` exports exactly the 35 names it exports today, and every one is a function or a number.
- Every module in `js/render/WeaponParts/` loads in Node; the entry re-exports each name one of them defines; no name is defined in two modules.
- No module in `js/render/WeaponParts/` imports `js/render/WeaponParts.js`, directly or through `js/render/WeaponParts/..`.
- The import rule: `geometry.js` imports nothing from the folder, the other three import only `./geometry.js`, and the entry imports every module in the folder — spelled with the case it has on disk, because macOS resolves a wrong case and Vercel does not.
- **The cache stays one cache.** `geo('bbox', [1, 1, 1, 0.004, 0])` called twice returns the same object (`===`), and a geometry reached through `muzzles.js` is the same object as the one reached through `geometry.js`. A second `_geo` `Map` — the one mistake this split could plausibly make — doubles GPU memory silently and breaks the `userData.wpShared` teardown contract, and neither shows up as a wrong-looking gun.
- `userData.wpShared` is still set on everything `geo()` returns.

It should be run against doctored copies of the tree and shown to fail on each: a `sights.js` that imports the entry, a `furniture.js` that reaches the entry through `../WeaponParts.js`, a `geometry.js` that imports `./muzzles.js`, an entry that imports `./WeaponParts/Geometry.js`, an entry that drops its `furniture.js` re-export, a `muzzles.js` that declares its own `_geo`, and `mesh` defined in two modules.

**Two things the new test must get right,** both learned in earlier splits:

- Its `importsOf()` regex matches the `export … from` side too. During steps 1–3 the entry both imports from `./WeaponParts/geometry.js` (for the groups it still holds) and re-exports from it, so the entry's specifier list holds that path twice. Dedup it, with the comment saying why — `test-fx-modules.mjs` hit this exact case.
- Pick the doctored sibling import so it means something at every step. `geometry.js` exists from step 1 and `sights.js` from step 2, so `js/render/WeaponParts/sights.js imports ./furniture.js` only bites from step 3; use `geometry.js imports ./sights.js` instead.

The full run is `for f in scripts/*.mjs; do node "$f" || exit 1; done`, and it must pass after every step, not only at the end.

### 1.8 Steps, ordered by risk against payoff

One commit per step. `geometry.js` has to be first — it is the leaf the other three import — and after that the order is largest-first, so the entry drops under the 500-line cap after two commits rather than three.

| Step | Move | Entry after | Commit |
|---|---|---|---|
| 1 | 14–27, 29–139, 141–159 → `geometry.js` | ~650 | `[refactor] Split WeaponParts.js by module, step 1: the geometry cache, primitives and mesh sugar` |
| 2 | 337–590 → `sights.js` | ~400 (under the cap) | `[refactor] Split WeaponParts.js by module, step 2: sights into js/render/WeaponParts/` |
| 3 | 592–794 → `furniture.js` | ~200 | `[refactor] Split WeaponParts.js by module, step 3: receiver furniture into js/render/WeaponParts/` |
| 4 | 161–335 → `muzzles.js` | ~24 | `[refactor] Split WeaponParts.js by module, step 4: barrels and muzzles into js/render/WeaponParts/` |
| 5 | — | — | `[test] Cover the WeaponParts re-export contract and the shared geometry cache` |

**How the moves are made.** A throwaway script, not committed, writes each step's files from the 794-line original by the §1.3 ranges and checks the result on disk: every code or comment line outside the import block lands in exactly one file, and the six lines that land nowhere (13, 28, 140, 160, 336, 591) are all blank. The only edits permitted inside a moved range are the `export` keyword where a name crosses a file boundary — and here there are none, because `roundedRect` and `bake` both move with their only caller and stay private. **Every moved line is byte-identical to the line it replaces.**

**The behavioural proof,** run before step 1 to get a baseline and after every step:

- Build all 31 weapons' view-models headlessly through `buildViewmodel`, both stock and Pack-a-Punched, and dump for every mesh in traversal order: its name, its world matrix to six decimals, its material's name, its geometry's vertex and index counts, a hash of its position and normal attributes, and `userData.wpShared`.
- Dump the sight-picture numbers `validate-ads-sight-picture.mjs` computes, to six decimals, for every weapon that has irons.
- Dump the geometry cache's size and its key list after all 62 builds, sorted. **This is the number that catches a duplicated cache:** if it changes, geometries stopped being shared.
- The baseline is run twice and must match itself before it is trusted. After each of steps 1–4 the output must match the baseline **byte for byte**.

**A browser check** after step 4: serve the repo, play a round, open the mystery box twice and Pack-a-Punch a gun — the paths that rebuild view-models and dispose them — and confirm no console error and no missing part. The validators cannot see a disposal bug that only fires on the second spin.

### 1.9 Found while reading

Noted, not touched. Every one predates this plan.

- **`bx` has no caller inside the file.** It is exported and imported by `js/weapons/rig.js` alone (with `cyl`). It is not dead; it just reads as dead from inside. It moves to `geometry.js` with the rest of the mesh sugar.
- **`perfShroud`'s inner `push` takes an `arcStart` it discards** (`void arcStart;`, line 252). The arc offset is applied by the `cylGeo` call at the call site instead, so the parameter is vestigial. Leave it: removing it is a behaviour-neutral edit that would break the byte-for-byte proof for no gain.
- **`key()` rounds to five decimals,** so two geometries whose parameters differ below 1e-5 share one cache entry. That is deliberate — it is what makes thirty-one weapons share a receiver box — but it is not written down anywhere. A one-line comment would be worth adding after the split, not during it.
- **`geo()` is exported but no file outside this one calls it.** After the split it is exported from `geometry.js` because `muzzles.js` needs it, and re-exported from the entry because it is exported today. Dropping it from the entry's list would be an API change, not a split.

### 1.10 Docs and comments

- **README.md** names `js/render/` as one line in the repository layout and does not name WeaponParts.js, so the layout block needs no change. Its two "64 headless validators" mentions become 65 after step 5, as does the same count in `AGENTS.md` if it carries one.
- **RENDERING.md** does not mention WeaponParts.js. No change.
- **This doc's line 5** links back to `docs/split-fx-plan.md`. The series links backward only, so no line is added to the fx plan.
- **Section banners.** The four `// ---` banners disappear with the file; each becomes its module's header comment, saying the same thing. No banner text is dropped.

---

## 2. The other 9 files, ranked

`js/render/WeaponParts.js` left the table when §1 was carried out. Nothing else has changed since the fx plan's ranking, so the counts below are re-verified rather than revised. **Rank 1 is next.**

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups. WeaponMaterials: the surface generators (`steelSurface`, `woodSurface`, `leatherSurface`, `bakeliteSurface`, `checkerSurface`, `etchSurface`) under `buildLibrary()`. props/materials: the map generators (`enamelMaps`, `castIronMaps`, `brassMaps`, `plankMaps`) under the shared canvas and normal-from-height helpers. SoldierGear: the shape constants, the geometry helpers, `buildWardrobe()`, and the three attach/LOD/detach entry points. | Each keeps re-exporting whatever moves out. 15 files reference WeaponMaterials, and after this plan four of them are in js/render/WeaponParts/. 4 files reference props/materials, and validate-coplanar-surfaces pins its text in two places, including a `BLUR` table. 5 files reference SoldierGear, and validate-remote-avatar reads its text. |
| 2 | js/render/ZombieDetail.js | 682 | Clean function groups: the cloth-geometry helpers, the body-measurement pass (`measureSkin`, `bodyProfile`, `fitToBody`), then `buildVariant` and the attach/detach entry points. | Keeps re-exporting whatever moves out. 6 files reference it, and validate-zombie-detail.mjs and validate-zombie-hitboxes.mjs both load it directly — the only two validators in the repo that name a js/render/ module by path and run it. |
| 3 | js/assets-page.js | 726 | Many small functions: the audio dock, the weapon grid and filters, the model viewer and its render loop, the fire/reload session. | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 59–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680, under `QUALITY_PRESETS` at 33). navmesh.js is mostly `NavGrid` (200–608), with `ColliderHash` (103) and `Heap` (140) above it and two functions below. | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).** The net plan's full read stands and a fresh read of the file's five regions agrees with it. In short:
  - **The head (98 lines) has to stay.** Link unfurlers and crawlers read the meta tags and the JSON-LD without running scripts, and browsers do not load an import map from a file.
  - **The markup (546 lines) can't leave without a build step.** HTML has no include and the repo is served as it is. Building the screens from script changes when elements exist — the bootstrap, the presentation shell and main.js all look them up as they run, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, 5 validators pin the markup in 18 places, and the menu would paint late.
  - **The SVGs stay.** style/10-menu.css applies the wordmark's two filters by fragment, which resolves only inside the page, and `#skyline .win` cannot reach inside an `<img>`.
  - **Only the two inline scripts could move** — the device gate (646–690) and the presentation shell (693–877), 233 lines together. That leaves 648, still over the cap, and the shell fetched rather than inline would race the dynamic `import('./js/main.js')` it currently precedes. A change that costs an ordering guarantee and does not get the file under the cap is not worth making.
