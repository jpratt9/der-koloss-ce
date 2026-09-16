# Split plan: js/render/ZombieDetail.js

2026-09-16. Source: `count_lines.py . --threshold 500`, which found 6 files with 1,153 lines over the cap.

This continues `docs/split-props-materials-plan.md`, whose plan is done.

This plan covers `js/render/ZombieDetail.js`, **the last file over the cap with a clean seam**. Two files are larger and both have full reads ruling them out — index.html at 881 and js/assets-page.js at 726 — and the three below it are all marginal, one class each or nearly so (§2). ZombieDetail.js has been ranked next-after-SoldierGear since the fx plan, and it is the file SoldierGear.js names in its own header as the contract it inherited:

- **It is not a class, and it exports only three names:** `attachZombieDetail`, `detachZombieDetail`, `setZombieDetailVisible`. All three stay. **The entry re-exports nothing**, because the public API never moves — the split is invisible to all three importers and both validators without a single forwarding line.
- **The file carries its seams as five `// ---` section banners,** plus a constants preamble. The split follows them exactly; no group is invented and none is cut at a line number.
- **The graph is four leaves feeding one builder feeding the entry,** and every call site was enumerated to prove it. The constants, the materials, the primitives and the fitting pass are mutually independent; `buildVariant`/`fittedFor` use all four; the entry uses `fittedFor`, `materials()` and the constants.
- **No validator reads the file's text.** Both validate-zombie-detail.mjs and validate-zombie-hitboxes.mjs load it with `loadGameModule` and run it, so no tooling has to change before the first line moves — confirmed by grepping all 68 scripts. This is the props/materials.js situation in reverse, and it makes this the lowest-risk split of the series.
- **It has the highest `export` count of any split so far: 22.** Almost everything in this file is module-private, which is why — §1.3 counts them from the private declarations against their call sites, the method that has now been right twice running.

This doc's §2 replaces the props/materials plan's ranking.

**Status: done.** The plan was carried out on 2026-09-16 in commits `148aab7`, `538d492` and `bdb1f5a`, one per step in §1.8. js/render/ZombieDetail.js went from 682 lines to 117, and the largest file in js/render/ZombieDetail/ is variant.js, at 263. `count_lines.py` now finds 5 files with 971 lines over the cap — 364 of those across the three marginal single-class files, and 607 across the two that cannot be split. It went as planned, with these notes:

- **All six line counts landed within two lines of the §1.3 estimates** — the first split in the series where none missed.

  | Module | Lines | Estimate |
  |---|---|---|
  | js/render/ZombieDetail.js | 117 | ~117 |
  | variant | 263 | ~261 |
  | fitting | 163 | ~164 |
  | primitives | 73 | ~74 |
  | materials | 45 | ~45 |
  | constants | 30 | ~31 |

  The entry was 378 lines after step 1, clearing the cap in one commit as §1.8 predicted.
- **Twenty-two `export` keywords, exactly as §1.3 counted** — the third split running where counting from the private declarations against their call sites was right. `REGION_OF`, `_mats`, `_fitted`, `buildVariant`, `armFrame` and `headFrame` stayed private as predicted.
- **The prose grep found the one comment §1.8 named.** It called `REFERENCE_SPAN`'s note and the fitting essay "the places to watch, because both explain themselves by reference to other parts of the file". The note said it is "the rig everything below was authored against"; "below" meant the rest of the 682-line file, and the damage sized against it is now in variant.js, so inside constants.js the phrase pointed at four clearance constants. It names the folder. The essay came through intact, as did SoldierGear.js' two references to this module and js/zombies/models.js' one.
- **How the moves were made.** A throwaway script wrote each step's files from the 682-line file by the §1.3 ranges, then checked them on disk: every code or comment line lands in exactly one file, and the twelve lines that land nowhere are all blank. Diffing the original against the six files afterwards, exactly 37 non-blank lines are not present verbatim: the 22 `export` keywords, the two import paths that gained a `../`, the two rewritten lines of the `REFERENCE_SPAN` note, and eleven banner rule and title lines that became module headers.
- **The proof ran as §1.8 describes,** except for one thing it promised and could not deliver. 250 lines: all 8 variants on both models with every mesh's bone, local transform, world matrix to six decimals, material and geometry hash — **then all 16 attached again**, with geometries and materials numbered in first-seen order so the second pass must introduce no new number. It reports `new-in-pass-2: 0 geometries, 0 materials` against 65 geometries and 3 materials. Then the eight variants shown distinct, the LOD toggle, and a detach that leaves everything alive and still pooled. The baseline, run twice, matched itself. **After both steps the output matched it byte for byte.**
  - **The fitting pass is dumped transitively, not directly.** §1.8 asked for "the measured body profile, the garment heights, the region triangle counts". `fittedFor` is not exported and its output is not reachable from outside the entry, so a baseline taken before the split could not read it. It is covered anyway: every mount point is a slot position in bone space, dumped as each mesh's local `pos`/`quat`/`scale`, and every piece's world matrix is what the profile determines. A change in the fitting pass moves those numbers.
- **The name check** — every file imports the names it uses and uses the names it imports — passed at both steps.
- **test-zombie-detail-modules.mjs is 220 lines,** rather than ~140, and **two of its checks did not work in their first draft.** Both were caught by running the doctored trees rather than by reading the code:
  - **Variant distinctness compared geometry by identity.** That cannot work: `buildVariant` makes fresh objects every call, so a builder that ignores its seed still returns eight distinct objects holding eight identical builds. The doctored tree passed. It hashes the position data instead.
  - **The detach check asserted the attributes survived.** three's `BufferGeometry.dispose()` leaves them in place and only fires an event, so a `detachZombieDetail` that disposes passed too. The test listens for the event on every geometry and material.
  - It also pins two things §1.7 did not state: the two models must share **no** geometry, so a pool keyed on the wrong thing cannot pass, and the variant index must wrap at both ends.
- **The validators number 69,** and all of them passed after every step. The 68 before step 1 passed too.
- **§1.10's doc edits were made:** README.md's two "68 headless validators" mentions are now 69 and the second names the pooled corpse damage; validate-zombie-detail.mjs' copy of the pool size names js/render/ZombieDetail/constants.js. The repository-layout block needed no change, and SoldierGear.js and js/zombies/models.js needed none either.
- **Nothing in §1.9 was touched.** `detachZombieDetail` still has no caller in the repo, `VARIANTS = 8` is still duplicated in the validator (now with a comment pointing at the right file), and `farthestHit` still has readers in two sections.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a played round with a full horde.

The table this plan was written against:

```
6 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                         LINES  SPLIT INTO
-------------------------  -------  ----------
index.html                     881           2
js/assets-page.js              726           2
js/render/ZombieDetail.js      682           2
js/render/PostFX.js            680           2
js/navmesh.js                  625           2
js/hud.js                      559           2

Total excess lines: 1153
```

The plan has two parts:

1. `js/render/ZombieDetail.js`: the entry keeps its 18-line contract header, the three scratch objects and the three public functions. The sizing constants, the materials, the primitive builders, the fitting pass and the variant construction move into five modules in js/render/ZombieDetail/.
2. The other 5 files — and the question of whether to keep going at all.

---

## 1. js/render/ZombieDetail.js: 682 lines → js/render/ZombieDetail.js (~117) + 5 modules in js/render/ZombieDetail/

### 1.1 What's in it

Bone-attached geometry detail for zombies: a shredded greatcoat, exposed ribs, hanging strips, torn sleeves, a wrecked jaw. It parents plain meshes to existing bones and never writes a bone transform, so attachments inherit their bone's motion and cannot desync the skeleton — the failure that produced rolling heads when this was attempted through the animation system. A fixed pool of damage variants is built once and every corpse gets cheap Meshes pointing at the shared geometry, because zombies are thrown away every round and the spawn path never disposes.

The file's own sections, with the line ranges a fresh read confirmed:

| Lines | Section | Names |
|---|---|---|
| 1–18 | header comment | the no-bone-writes contract and the memory shape |
| 19–21 | imports | `THREE`, `mergeGeometries`, `enhanceCreatureMaterial` |
| 23–24 | — | `VARIANTS` |
| 26–28 | — | `_scratchScale`, `_scratchQuat`, `_scratchCentre` |
| 30–53 | — | `REFERENCE_SPAN`, `TUNIC_CLEAR`, `SKIRT_CLEAR`, `RAG_CLEAR`, `HEAD_WIDTH` |
| 55–97 | `// deterministic RNG` | `mulberry32`, `_mats`, `materials` |
| 99–171 | `// primitive builders` | `stripGeo`, `garmentGeo`, `placed`, `oriented`, `mergeOne` |
| 173–336 | `// fitting to the corpse` | `X_AXIS`, `Y_AXIS`, `REGION_OF`, `measureSkin`, `farthestHit`, `centreOf`, `bodyProfile`, `reachAt`, `fitToBody` |
| 338–591 | `// variant construction` | `buildVariant`, `armFrame`, `headFrame`, `_fitted`, `fittedFor` |
| 593–682 | `// attachment` | `attachZombieDetail`, `detachZombieDetail`, `setZombieDetailVisible` |

The ranges tile the file: the eight blanks between sections (22, 25, 29, 54, 98, 172, 337, 592) are everything left over.

Four facts from the read that decide the split:

- **The primitives do not depend on the fitting pass.** `garmentGeo`'s doc comment says "fitToBody() gives it the corpse's own outline", and line 125 is the only place `fitToBody` appears above its own definition — it is prose. Every real call is at 360, 375 and 404, inside `buildVariant`. So the two groups are siblings, not a chain, and either can move first.
- **The constants preamble splits in two.** `VARIANTS` (used at 579 in `fittedFor` and 607/613 in the entry) and the five sizing ratios (used at 360–530 in variant construction, 617/621 in the entry) are shared between the builder and the entry, so they need a leaf module or the entry and `variant.js` import each other. The three scratch objects at 26–28 are used only at 619–650, in the entry, and stay there.
- **`REGION_OF` is the one name in the fitting pass that does not cross.** It is read at 224 and 232, both inside `measureSkin`. It stays private, as `boxBlur` did in the props split and `bake` in WeaponParts.
- **The entry exports nothing it does not define.** `attachZombieDetail`, `detachZombieDetail` and `setZombieDetailVisible` are the whole public surface and all three are in the attachment section. No `export … from` line is needed anywhere.

### 1.2 Mechanism

The shape js/render/SoldierGear.js took, which is the file this one's header is the ancestor of: the entry keeps its contract header, its scratch state and its public API, and everything it can delegate moves out.

The folder is `js/render/ZombieDetail/`, matching `js/render/SoldierGear/`, `js/render/WeaponParts/`, `js/render/WeaponMaterials/` and `js/render/HellhoundModel/` — a PascalCase entry beside a folder of the same name holding lowercase modules.

### 1.3 Target modules

| Module | Lines (est.) | Takes | Exports |
|---|---|---|---|
| `js/render/ZombieDetail/variant.js` | ~261 | 338–591 | `fittedFor` |
| `js/render/ZombieDetail/fitting.js` | ~164 | 173–336 | `X_AXIS`, `Y_AXIS`, `measureSkin`, `farthestHit`, `centreOf`, `bodyProfile`, `reachAt`, `fitToBody` |
| `js/render/ZombieDetail/primitives.js` | ~74 | 99–171 | `stripGeo`, `garmentGeo`, `placed`, `oriented`, `mergeOne` |
| `js/render/ZombieDetail/materials.js` | ~45 | 55–97 | `mulberry32`, `materials` |
| `js/render/ZombieDetail/constants.js` | ~31 | 23–24, 30–53 | `VARIANTS`, `REFERENCE_SPAN`, `TUNIC_CLEAR`, `SKIRT_CLEAR`, `RAG_CLEAR`, `HEAD_WIDTH` |
| `js/render/ZombieDetail.js` | ~117 | 1–21, 26–28, 593–682 | `attachZombieDetail`, `detachZombieDetail`, `setZombieDetailVisible` — the three it exports today |

**Twenty-two names gain an `export`:** six constants, `mulberry32` and `materials`, the five primitives, the eight fitting names, and `fittedFor`. That is the highest count of the series and it is simply what this file is — almost every name in it is module-private, because until now nothing outside the file needed any of them. `REGION_OF`, `_mats`, `_fitted`, `buildVariant`, `armFrame` and `headFrame` do not cross a boundary and stay private. The count was taken by listing the private declarations in each moved range against their call sites.

**The 13-line essay above `// fitting to the corpse` moves verbatim as fitting.js' header.** It records why every piece is measured off the skin rather than placed from bone positions and authored radii — the tunic buried inside the Basic's chest and sailing off the Chubby's back, the coat skirt floating over a crawler as a ring because the Hips bone sits a hand's width behind the pelvis it drives. It names `docs/model-audit`, which still exists.

**The `// deterministic RNG` banner is mislabelled** — it heads 43 lines of which the RNG is 11, the rest being the material set. This is the third file in the series with that exact defect (props/materials.js and SoldierGear.js had it too). The module is named `materials.js` for what is actually in it and the banner does not survive as a lie.

### 1.4 What stays in js/render/ZombieDetail.js

- The 18-line header, verbatim. Every word of it — the no-bone-writes contract, the rolling heads, the memory shape — is about `attachZombieDetail`, which stays.
- `import * as THREE from 'three';` plus four imports from the folder.
- `_scratchScale`, `_scratchQuat`, `_scratchCentre`, lines 26–28 verbatim.
- Lines 597–682 verbatim: the three public functions.

```js
import * as THREE from 'three';
import { VARIANTS, REFERENCE_SPAN } from './ZombieDetail/constants.js';
import { materials } from './ZombieDetail/materials.js';
import { fittedFor } from './ZombieDetail/variant.js';
```

`mergeGeometries` and `enhanceCreatureMaterial` both leave: the first with primitives.js and variant.js, the second with materials.js.

### 1.5 Imports

**New, inside the folder.** Each was derived from the call sites, not guessed:

| Module | Imports |
|---|---|
| `constants.js` | nothing |
| `materials.js` | `THREE`; `{ enhanceCreatureMaterial }` from `'../CreatureShading.js'` |
| `primitives.js` | `THREE`; `{ mergeGeometries }` from `'../../../vendor/utils/BufferGeometryUtils.js'` |
| `fitting.js` | `THREE` |
| `variant.js` | `THREE`; `{ mergeGeometries }` from `'../../../vendor/utils/BufferGeometryUtils.js'`; the six constants; `{ mulberry32 }` from `'./materials.js'`; the five primitives; the eight fitting names |

Three modules import `three`; `constants.js` needs nothing at all, because the only `THREE` in its line range is the scratch trio that stays in the entry.

**Two vendor paths gain a `../`.** `'../../vendor/utils/BufferGeometryUtils.js'` becomes `'../../../vendor/utils/BufferGeometryUtils.js'` from js/render/ZombieDetail/, in primitives.js and variant.js. `'./CreatureShading.js'` becomes `'../CreatureShading.js'`. No validator pins any of the three — checked, unlike js/props/materials.js where one did.

**Changed, outside the folder: none.** All three importers and both validators keep what they have:

| Caller | Takes |
|---|---|
| `js/zombies/models.js` | `attachZombieDetail` |
| `js/game/graphics.js` | `attachZombieDetail` |
| `js/zombies/manager.js` | `setZombieDetailVisible` |
| `scripts/validate-zombie-detail.mjs` | `attachZombieDetail`, via `loadGameModule('render', 'ZombieDetail.js')` |
| `scripts/validate-zombie-hitboxes.mjs` | `attachZombieDetail`, same |

`detachZombieDetail` has no caller in the repo today; see §1.9.

None carries a `?v=` token, and none of the new intra-folder specifiers may carry one: test-audio-modules.mjs walks all of js/ and fails a module imported under two different query strings.

### 1.6 Circular imports: none are created

- `constants.js` imports nothing, so it cannot be in a cycle.
- `materials.js`, `primitives.js` and `fitting.js` import only `three` and files outside the folder. None imports another folder module.
- `variant.js` imports all four leaves and nothing imports it but the entry.
- No module in the folder imports `../ZombieDetail.js`. That is the rule the new test enforces, and it is what keeps `_fitted` the only per-model cache: a module that reached back for `attachZombieDetail` would re-enter the measurement it is part of.
- `js/render/CreatureShading.js` does not import ZombieDetail, so the `enhanceCreatureMaterial` edge stays one-way.

### 1.7 Validators

**Nothing has to change before the first line moves.** No `read…Source()` helper and no regex names this file — confirmed by grepping all 68 scripts. Both validators that know it by name call `loadGameModule('render', 'ZombieDetail.js')` and run it.

**Two validators exercise it hard, and they are the strongest behavioural cover in the series so far:**

| Validator | What it would catch |
|---|---|
| `validate-zombie-detail.mjs` | Every one of the 8 variants on both models: a piece that sank into the body, floated off it, or moved between poses. It attaches all 8 to a real rig and drives five clips. |
| `validate-zombie-hitboxes.mjs` | Detail geometry that changed what a bullet hits — it attaches detail exactly as `createZombieVisual` does and tests the hit volumes against the drawn body |

Plus `validate-module-syntax.mjs`, which walks js/ recursively.

**New: `scripts/test-zombie-detail-modules.mjs` (~140 lines):**

- The entry exports exactly the three names it exports today, and none of the 22 that moved. A split must not widen the API: nothing outside should be able to build a garment.
- Every module in js/render/ZombieDetail/ loads in Node, no name is defined in two of them, and each moved name comes from the module it belongs to.
- No module in js/render/ZombieDetail/ imports js/render/ZombieDetail.js.
- The import rule: constants.js imports nothing, materials.js/primitives.js/fitting.js import nothing from the folder, variant.js imports the four leaves, and the entry imports only folder modules — each spelled with the case it has on disk.
- **THE VARIANT POOL IS ONE POOL.** Two corpses of the same model and variant index must get meshes pointing at the *same* geometry objects, and a second model must get its own set. That is `_fitted` and the `VARIANTS` pool doing their job; a module that ended up with its own `WeakMap` passes every other check here and every corpse still looks right, while the horde leaks a full damage build per zombie — the exact failure the file's header says the design exists to prevent.
- **A DETACH DISPOSES NOTHING.** `detachZombieDetail` unparents and leaves every geometry and material alive, because the rest of the horde is drawing them.
- **THE VARIANTS ARE SEEDED AND DISTINCT.** Variant *n* built twice is identical; variants *n* and *m* are not. `mulberry32(seed)` is what makes a horde look varied without twinning, and nothing checks it today.

It should be run against doctored copies of the tree and shown to fail on each: a variant.js that imports the entry, a fitting.js that imports ./variant.js, an entry that imports `./ZombieDetail/Constants.js`, an entry that also exports `buildVariant`, `centreOf` defined in two modules, a `fittedFor` that stops consulting `_fitted`, a `buildVariant` that ignores its seed, and a `detachZombieDetail` that disposes.

The full run is `for f in scripts/*.mjs; do node "$f" || exit 1; done`, and it must pass after every step.

### 1.8 Steps, ordered by risk against payoff

One commit per step. The four leaves are mutually independent, so they go together; `variant.js` needs all of them and goes second.

| Step | Move | Entry after | Commit |
|---|---|---|---|
| 1 | 23–24, 30–53, 55–97, 99–171, 173–336 → `constants.js`, `materials.js`, `primitives.js`, `fitting.js` | ~380 (under the cap) | `[refactor] Split ZombieDetail.js by module, step 1: the constants, materials, primitives and fitting pass` |
| 2 | 338–591 → `variant.js` | ~117 | `[refactor] Split ZombieDetail.js by module, step 2: variant construction into js/render/ZombieDetail/variant.js` |
| 3 | — | — | `[test] Cover the ZombieDetail module contract, the shared variant pool and its seeds` |

Two steps rather than four: the leaves cannot break each other — none imports another — and splitting them across four commits would mean four proof runs for one class of change. The entry clears the cap after step 1.

**How the moves are made.** A throwaway script, not committed, writes each step's files from the 682-line original by the §1.3 ranges and checks the result on disk: every code or comment line lands in exactly one file, and the eight lines that land nowhere are all blank. **The only edits inside a moved range are the 22 added `export` keywords.** Each module is then grepped for prose the move made false — a "this file", "above" or "below" pointing at code that is now elsewhere. That grep caught a real defect in the WeaponMaterials split and came up clean in the props one; the fitting essay and the `REFERENCE_SPAN` note are the places to watch here, because both explain themselves by reference to other parts of the file.

**The behavioural proof,** run before step 1 to get a baseline and after every step:

- For both shipped models, attach all 8 variants to a real rig and dump every mesh in order: its bone, its name, its world matrix to six decimals, its material's colours and flags, its geometry's vertex and index counts, and a SHA-256 of its position and normal attributes.
- **Number geometries and materials in first-seen order across both models and all 16 attaches, then attach everything a second time.** The second pass must introduce no new number. That is `_fitted` and the variant pool proving themselves, and it is the check that a duplicated cache fails and nothing else does.
- Dump the fitting pass's own output for each model — the measured body profile, the garment heights, the region triangle counts — to six decimals, because that is what every piece is placed against and it is computed once per model.
- Run `setZombieDetailVisible` false/true and `detachZombieDetail`, dumping visibility and that every geometry is still alive.
- The baseline is run twice and must match itself. After each step the output must match it **byte for byte**.

`Math.random` is seeded with an xorshift before anything is built: `attachZombieDetail`'s default variant index reads it.

**A browser check** after step 2: serve the repo, play to a round with a full horde and look at the corpses close up and at distance — the LOD toggle is the one path no validator renders.

### 1.9 Found while reading

Noted, not touched. Every one predates this plan.

- **`detachZombieDetail` has no caller in the repo.** It is exported, documented, and reachable only from outside. `js/zombies/manager.js` uses `setZombieDetailVisible` and nothing calls the detach. It is not dead in the sense that matters — the doc comment records *why* it must not dispose, which is knowledge worth keeping — but it should be either wired into the despawn path or noted as deliberately unused, separately from this split.
- **`VARIANTS = 8` is duplicated in validate-zombie-detail.mjs,** line 28, with the comment "the damage pool size in ZombieDetail.js; indices wrap". The two can drift. Importing it would be better than copying it, but the validator is deliberately independent of the module's internals, so this is a judgement call and not a defect.
- **`REFERENCE_SPAN`'s 13-line note explains the ordering trap** — attachment happens before ZombieVisual calibrates, so absolute metres came out ~1.6x too big and put the tunic around the knees. It moves to constants.js with the constant it describes, which is the right home for it.
- **`farthestHit` is called from two sections** — 290 inside `bodyProfile`, then 505 and 537 inside `armFrame` and `headFrame`. It is the one fitting helper used both internally and by the builder, which is why fitting.js exports eight names rather than six.

### 1.10 Docs and comments

- **README.md** names `js/render/` as one line in the repository layout and does not name ZombieDetail.js, so the layout block needs no change. Its two "68 headless validators" mentions become 69 after step 3.
- **`js/render/SoldierGear.js`'s header names this file twice** — "That is the same contract as js/render/ZombieDetail.js" and "The two traps that cost the most time, both inherited from ZombieDetail". Both describe the module, not a line in one file, and both keep pointing at the entry. Neither needs changing, but the §1.8 grep must confirm it.
- **`scripts/validate-zombie-detail.mjs:28`** says "the damage pool size in ZombieDetail.js". After the split the pool size lives in js/render/ZombieDetail/constants.js. That comment gets the folder path — a one-line edit in the test commit, not in a refactor commit.
- **`js/zombies/models.js:72`** says "see js/render/ZombieDetail.js for why that matters", pointing at the no-bone-writes contract. That contract is in the header, which stays on the entry. No change.
- **This doc's line 5** links back to `docs/split-props-materials-plan.md`. The series links backward only.
- **Section banners.** The five `// ---` banners disappear with the file; each becomes its module's header comment. The 18-line file header stays on the entry. No text is dropped.

---

## 2. The other 5 files — and whether to keep going

**This was the last file over the cap with a clean seam,** and §1 is now done. §2 is a recommendation rather than a ranking: the five below are what remains, and none of them is a candidate.

| File | Lines | Over | Why it is not next |
|---|---|---|---|
| js/render/PostFX.js | 680 | 180 | One class, `PostFX` at 52–680, under `QUALITY_PRESETS` at 33. Its methods share a large amount of per-pass render-target state through `this`. It could take the `installMixins` treatment js/fx.js and js/net.js took, and that is a real option if it grows — but it is the file the whole frame goes through, and the payoff is 180 lines. |
| js/navmesh.js | 625 | 125 | Mostly `NavGrid` (200–608), with `ColliderHash` (103) and `Heap` (140) above it and two functions below. The two small classes could move to a `js/navmesh/` folder for a ~100-line saving, which is the least payoff on the board for a file in the enemy-pathing hot path. |
| js/hud.js | 559 | 59 | One class, `HUD` at 9–559. Fifty-nine lines over. Splitting a class this size costs more in indirection than it returns. |
| js/assets-page.js | 726 | 226 | **No clean seam.** Full read in the SoldierGear plan: 102 of its lines assign to module-level `let` bindings an importer cannot reassign, so every one would have to become a property on a shared state object — a 102-line rewrite that forfeits the byte-for-byte proof every split here has relied on. The audio dock and the weapon panel also call each other in both directions (`playSound` at line 55 calls `cancelWeaponInteraction` and `renderSelectedWeapon`; the panel calls back at 384, 453, 465, 528 and 618). It is a page script, not a library: it builds a `WebGLRenderer`, a scene, two cameras and three lights at module scope and starts a rAF loop at line 256. One page loads it and one validator reads its text. |
| index.html | 881 | 381 | **No clean seam.** The net plan's full read stands and five later reads agree. The head (98 lines) has to stay — unfurlers and crawlers read the meta tags and JSON-LD without running scripts, and browsers do not load an import map from a file. The markup (546 lines) cannot leave without a build step: HTML has no include, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, and 5 validators pin the markup in 18 places. The SVGs stay, because style/10-menu.css applies the wordmark's filters by fragment and `#skyline .win` cannot reach inside an `<img>`. Only the two inline scripts could move — 233 lines — which leaves 648, still over the cap. |

### Recommendation

**Stop after this one.** The campaign started at 11 files and 2,403 excess lines; after §1 it is 5 files and 971, of which 607 belong to the two files that genuinely cannot be split and 364 to three single cohesive classes 59–180 lines over. Every remaining candidate is either a single cohesive class 59–180 lines over, or a file whose split is a rewrite rather than a move.

The 500-line cap has done its work: the repo went from `Game`, `FX`, `Net`, `ZombieManager`, `AudioEngine`, the map, the weapons and the player all being single files of 600–1,100 lines to being folders of modules under 350, each with a contract test. Continuing past this point means splitting classes that have no seam, to save under 200 lines, in the frame loop and the pathfinder. That is a worse trade than leaving them.

If any of the three marginal files grows past ~750, revisit it then — PostFX.js first, because `installMixins` fits it and the precedent is well worn.
