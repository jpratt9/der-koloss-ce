# Split plan: js/render/SoldierGear.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 9 files with 1,767 lines over the cap.

This continues `docs/split-weapon-parts-plan.md`, whose plan is done.

This plan covers `js/render/SoldierGear.js`, the largest file with a clean seam. Two files are larger and neither has one — index.html at 881, and js/assets-page.js at 726, which a full read this time moves off the ranking entirely (§2). SoldierGear.js has been in rank 1 for the last three rankings, and a full read confirms it:

- **It is not a class.** It is seven exported constants, one exported data table and three exported functions, with two module-private caches. So it takes the shape js/fx.js took — an entry that keeps its state and its public API, with the rest moved out.
- **The file already carries its seams as five `// ---` section banners:** palettes, materials, primitive helpers, the wardrobe, attachment. The split follows them exactly; no group is invented and none is cut at a line number.
- **The dependency graph between those banners is already one-way,** and every call site was enumerated to prove it. Nothing below calls anything above it except downward: `buildWardrobe` calls the primitive helpers, and `attachSoldierGear` calls `materials()` and `buildWardrobe`. Nothing calls back.
- **`buildWardrobe` is 340 lines on its own** and stays whole. It has six labelled body-region blocks inside it (TORSO, HIPS, HEAD, ARMS, LEGS) but they share a local frame helper and a single `out` Map, so cutting them apart would be a rewrite, not a move. At ~348 lines its module is comfortably under the cap.
- **One validator reads the file's text,** validate-remote-avatar.mjs, and pins it in twelve places across four of the five sections. The tooling has to change before the first line moves — the same order the fx split needed.

This doc's §2 replaces the WeaponParts plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `e5a74dc`, `5c9915a`, `b6d9cbe` and `96a29ee`. js/render/SoldierGear.js went from 717 lines to 154, and the largest file in js/render/SoldierGear/ is wardrobe.js, at 347. `count_lines.py` now finds 8 files with 1,550 lines over the cap. It went as planned, with these notes:

- **Actual line counts** are within two lines of the §1.3 estimates.

  | Module | Lines | Estimate |
  |---|---|---|
  | js/render/SoldierGear.js | 154 | ~153 |
  | wardrobe | 347 | ~348 |
  | kit | 92 | ~93 |
  | constants | 62 | ~62 |
  | looks | 48 | ~49 |
  | materials | 21 | ~23 |

  The entry was 593 lines after step 1 and 500 after step 2 — §1.8 predicted ~600 and ~510, and 500 is exactly on the cap rather than over it. Step 3 brought it to 154.
- **§1.8's step 0 could not stand alone, and was folded into step 1.** It was meant to add `readSoldierGearSource()` before any code moved, so validate-remote-avatar.mjs' pins never saw a rewired tree. But `readSplitSource()` scandirs the folder, so the helper throws until the folder exists — the step was unrunnable as written. Adding the helper and the first three modules in one commit gives the same guarantee, because the pins still never see a rewired but unsplit tree. Four commits, not five.
- **§1.3 undercounted the added `export` keywords, by nine.** It called out `HEAD_REF` as "the one name that has to gain one". That was only true of the constants block: `materials`, the seven primitive helpers and `buildWardrobe` are module-private today too, and each needs one where it crosses the new boundary. **Ten keywords in total**, and no other edit inside a moved range.
- **One comment was rewritten, because the move made it false.** constants.js's header said the head scale is cancelled by "the mount at the bottom of this file", and the mount stays in the entry. It now names js/render/SoldierGear.js. That is a defect the move introduced, not a pre-existing one, so it was fixed during the move rather than noted in §1.9. Every other module was checked for the same class of self-reference and had none; the two "below"s left in constants.js are anatomical, about finger joints.
- **How the moves were made.** A throwaway script wrote each step's files from the 717-line file by the §1.3 ranges, then checked them on disk: every code or comment line lands in exactly one file, and the eleven lines that land nowhere (31, 89, 93, 140, 144, 163, 167, 256, 260, 601, 605) are all blank. Diffing the original against the six files afterwards, the only non-blank lines not present verbatim are the ten `export` keywords, the vendor path that gained a `../`, the two rewritten comment lines, and the four section banners that became module headers.
- **The proof ran as §1.8 describes.** The baseline, run twice, matched itself. It prints 208 lines: the seven constants and the whole palette table as callers see them, then every gear mesh of all four personas with its bone, parent, visibility, world matrix to six decimals, material colours and a SHA-256 of its geometry — **then all four personas built a second time**, with geometries and material sets numbered in first-seen order so the second pass must introduce no new number. It reports `new-in-pass-2: 0 geometries, 0 materials`. Then LOD 0/1/2/0 and a detach. **After steps 1, 2 and 3 the output matched the baseline byte for byte.**
  - **One correction to the proof, made before step 1 landed.** It first dumped which meshes were *parented* at each LOD level. `setSoldierGearLOD` works by visibility — the meshes stay on their bones — so every level printed 13/13 and the section proved nothing. It dumps visibility, and now shows LOD 1 shedding the ten limb bones and LOD 2 all thirteen.
- **The name check** — every file imports the names it uses and uses the names it imports — passed at every step, once it stopped requiring a use to be a call: `HEAD_SCALE` is used as `HEAD_SCALE / HEAD_REF`, which its first regex did not count.
- **test-soldier-gear-modules.mjs is 179 lines,** rather than ~120, almost all of it the cache section. It was run on copies of the tree with eight mistakes — the seven §1.7 lists plus an `attachSoldierGear` that stops consulting `_pool` — and failed on each.
  - **Its first draft failed on correct code.** It compared `mesh.material` between two avatars. A multi-material mesh gets a fresh array every build even when every material inside it is pooled, so nine bones looked un-shared. It compares the materials, not the wrapper.
  - It also asserts the negative case the §1.7 wording implied but did not state: **no two personas may share geometry**, so a `_pool` that ignored `look.id` cannot pass.
- **The validators number 66,** and all of them passed after every step. The 65 before step 1 passed too.
- **§1.10's doc edits were made:** README.md's two "65 headless validators" mentions are now 66, and the second names the pooled co-op uniforms. game-source.mjs' header gained its clause for SoldierGear. The repository-layout block needed no change.
- **Nothing in §1.9 was touched.** The four constants with no internal use, the single call site of `materials()`, and `LIMB_BONES` are all as they were. The §1.9 suggestion to add a `js/render/SoldierGear/constants.js` pointer to the comment at line 679 was not taken: it is a separate edit from the split.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a second tab in a co-op lobby, because the gear is only ever seen on a remote avatar.

The table this plan was written against:

```
9 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
index.html                        881           2
js/assets-page.js                 726           2
js/render/SoldierGear.js          717           2
js/render/WeaponMaterials.js      712           2
js/props/materials.js             685           2
js/render/ZombieDetail.js         682           2
js/render/PostFX.js               680           2
js/navmesh.js                     625           2
js/hud.js                         559           2

Total excess lines: 1767
```

The plan has two parts:

1. `js/render/SoldierGear.js`: the entry keeps its 28-line contract header, the geometry pool and the three public attach/LOD/detach functions. The constants, the palettes, the materials, the primitive kit and the wardrobe move into five modules in js/render/SoldierGear/.
2. The other 8 files, ranked by risk against payoff, then the two files with no clean seam.

---

## 1. js/render/SoldierGear.js: 717 lines → js/render/SoldierGear.js (~153) + 5 modules in js/render/SoldierGear/

### 1.1 What's in it

Uniform and field gear for the four playable marines, as other players see them in co-op. It is not a body: the shipped CC0 humanoid stays the body, and every piece here is a merged rigid shell parented to the bone it belongs to, so it inherits that bone's motion and cannot desync from the pose. The geometry pool is built once per persona for the whole process and every avatar gets cheap Meshes pointing at it.

The file's own banners, with the line ranges a fresh read confirmed:

| Lines | Section | Names |
|---|---|---|
| 1–28 | header comment | the bone-axes and rescale-around-attachment contract |
| 29–30 | imports | `THREE`, `mergeGeometries` |
| 32–88 | the shape constants | `HEAD_SCALE`, `HEAD_REF` (private), `HEAD_SHAPE`, `HAND_SCALE`, `FOOT_SCALE`, `LIMB_SHAPE`, `SPINE_FIX` |
| 90–139 | `// palettes` | `SOLDIER_LOOKS` |
| 141–162 | `// materials` | `_matSets` (private), `materials` (private) |
| 164–255 | `// primitive helpers` | `_m4`/`_q`/`_v`/`_up` (private), `put`, `box`, `tube`, `dome`, `span`, `strap`, `mergeByMaterial` — all private |
| 257–600 | `// the wardrobe` | `buildWardrobe` (private) |
| 602–717 | `// attachment` | `_pool`, `LIMB_BONES`, `_scratchScale`, `_scratchQuat` (private), `attachSoldierGear`, `setSoldierGearLOD`, `detachSoldierGear` |

The ranges tile the file: the 15 banner lines and the 11 blanks between sections (31, 89, 93, 140, 144, 163, 167, 256, 260, 601, 605) are everything left over, and all 11 are empty.

Four facts from the read that decide the split:

- **The graph is one-way and shallow.** `materials()` is called at line 632 only. `buildWardrobe` at 655 only. Both are in the attachment section. The primitive helpers are called only from inside each other and from `buildWardrobe` (lines 298–594; the last is 594, well inside the wardrobe). `mergeByMaterial` is called at 274, inside `buildWardrobe`. Nothing in the attachment section touches the primitive kit at all.
- **`HEAD_REF` is the one name that has to gain an `export`.** It is module-private today and used at lines 421 and 423, inside `buildWardrobe` — so it crosses from the constants module to the wardrobe module. That single added keyword is the only edit this split makes inside a moved range.
- **`LIMB_SHAPE`, `HEAD_SHAPE`, `HAND_SCALE`, `FOOT_SCALE` and `SPINE_FIX` have no code use inside the file.** Their only appearances below the constants block are in comments (line 679 explains what `LIMB_SHAPE` does to the bone chain). They exist for js/player/soldier-pose.js, and the entry keeps re-exporting them.
- **`buildWardrobe` does not read `SOLDIER_LOOKS`.** The reference at line 266 is a `@param` tag. It takes a `look` object from its caller, so the wardrobe module does not import the palettes.

### 1.2 Mechanism

The shape js/fx.js took: the entry keeps its state and its public API, and everything it can delegate moves out. Here the entry keeps `_pool` — the process-wide geometry pool that is the file's whole memory story — plus `LIMB_BONES`, the two scratch vectors, and the three exported functions callers use. It imports what it needs from the folder and re-exports the seven constants and the palette table so no caller changes.

Not a pure re-export entry like js/render/WeaponParts.js: that file had no state and no public behaviour of its own. This one has both, and `attachSoldierGear` is where every comment in the 28-line header is cashed out. Moving it would leave the header describing a file that no longer does the thing.

Not `installMixins`: there is no class and no `this`.

The folder is `js/render/SoldierGear/`, matching `js/render/HellhoundModel/` and `js/render/WeaponParts/` — a PascalCase entry beside a folder of the same name holding lowercase modules.

### 1.3 Target modules

| Module | Lines (est.) | Takes | Exports |
|---|---|---|---|
| `js/render/SoldierGear/wardrobe.js` | ~348 | 261–600 | `buildWardrobe` |
| `js/render/SoldierGear/kit.js` | ~93 | 168–255 | `put`, `box`, `tube`, `dome`, `span`, `strap`, `mergeByMaterial` |
| `js/render/SoldierGear/constants.js` | ~62 | 32–88 | `HEAD_SCALE`, `HEAD_REF`, `HEAD_SHAPE`, `HAND_SCALE`, `FOOT_SCALE`, `LIMB_SHAPE`, `SPINE_FIX` |
| `js/render/SoldierGear/looks.js` | ~49 | 94–139 | `SOLDIER_LOOKS` |
| `js/render/SoldierGear/materials.js` | ~23 | 145–162 | `materials` |
| `js/render/SoldierGear.js` | ~153 | 1–30, 606–717 | `HEAD_SCALE`, `HEAD_SHAPE`, `HAND_SCALE`, `FOOT_SCALE`, `LIMB_SHAPE`, `SPINE_FIX`, `SOLDIER_LOOKS` (re-exported), `attachSoldierGear`, `setSoldierGearLOD`, `detachSoldierGear` (kept) |

The 10 exported names are what the file exports today, unchanged.

`materials.js` at ~23 lines is the smallest module in the plan. It gets one anyway rather than being folded into looks.js: it is its own banner, it owns the `_matSets` cache, and js/render/HellhoundModel/materials.js is the same module at the same size. js/fx/decals.js is 35 lines and js/render/shaders/dof.js is 42, so it is small but not out of range.

Each module's banner becomes its header comment. The 28-line file header stays on the entry, because everything it warns about — bone axes not being world axes, the rig being rescaled around attachment — is about `attachSoldierGear`, which stays.

### 1.4 What stays in js/render/SoldierGear.js

- The 28-line header, verbatim.
- The imports it still needs, plus four from the folder.
- Seven re-export lines for the constants and `SOLDIER_LOOKS`.
- Lines 606–717 verbatim: `_pool`, `LIMB_BONES`, `_scratchScale`, `_scratchQuat`, `attachSoldierGear`, `setSoldierGearLOD`, `detachSoldierGear`.

```js
import * as THREE from 'three';
import { SOLDIER_LOOKS } from './SoldierGear/looks.js';
import { materials } from './SoldierGear/materials.js';
import { buildWardrobe } from './SoldierGear/wardrobe.js';
import { LIMB_SHAPE } from './SoldierGear/constants.js';   // re-export only

export {
  HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX,
} from './SoldierGear/constants.js';
export { SOLDIER_LOOKS } from './SoldierGear/looks.js';
```

The `LIMB_SHAPE` import line above is wrong and is called out so it does not get written: the entry does not *use* any constant, it only forwards them, so it takes the `export … from` line alone and imports nothing from constants.js. `mergeGeometries` leaves with kit.js and is not imported by the entry.

### 1.5 Imports

**New, inside the folder.** Each was derived from the call sites, not guessed:

| Module | Imports |
|---|---|
| `constants.js` | nothing |
| `looks.js` | nothing |
| `materials.js` | `THREE` |
| `kit.js` | `THREE`; `{ mergeGeometries }` from `'../../../vendor/utils/BufferGeometryUtils.js'` |
| `wardrobe.js` | `THREE`; `{ HEAD_SCALE, HEAD_REF }` from `'./constants.js'`; `{ put, box, tube, dome, span, strap, mergeByMaterial }` from `'./kit.js'` |

constants.js and looks.js import nothing at all — the constants block and the palette table use no `THREE`.

**kit.js' vendor path gains one `../`.** The entry is at js/render/, so `'../../vendor/utils/BufferGeometryUtils.js'` becomes `'../../../vendor/utils/BufferGeometryUtils.js'` from js/render/SoldierGear/. That is the only specifier in the split whose text changes.

**Changed, outside the folder: none.** All three importers keep the specifier they have, because the entry keeps or re-exports every name:

| Importer | Names it takes |
|---|---|
| `js/player/atlas.js` | `SOLDIER_LOOKS` |
| `js/player/soldier-pose.js` | `HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX` |
| `js/player/soldier.js` | `attachSoldierGear, detachSoldierGear, setSoldierGearLOD, SOLDIER_LOOKS` |

None carries a `?v=` token, and none of the new intra-folder specifiers may carry one either: test-audio-modules.mjs walks all of js/ and fails a module imported under two different query strings.

### 1.6 Circular imports: none are created

- `constants.js` and `looks.js` import nothing, so neither can be in a cycle.
- `materials.js` imports only `three`.
- `kit.js` imports `three` and a vendored file.
- `wardrobe.js` imports two folder modules, both of which are leaves.
- No module in the folder imports `../SoldierGear.js`. That is the rule the new test enforces, and it is what keeps the entry a leaf of the folder rather than a member of it.
- js/player/soldier.js imports the entry and the entry imports nothing from js/player/, so the existing edge stays one-way.

### 1.7 Validators

**The tooling changes before the first line moves.** `scripts/validate-remote-avatar.mjs` line 9 reads js/render/SoldierGear.js with `readFileSync` and pins its text in twelve assertions:

| Line | Pins | Section it lands in after the split |
|---|---|---|
| 68 | `UpperLeg[LR]` scale entries | constants.js |
| 96, 98, 107, 109, 111 | `bone.add(mesh)`, the quaternion invert, the per-axis scale cancel, and two negative pins | the entry |
| 137 | the `id`/`headgear`/`coat`/`pack` shape of every look | looks.js |
| 157–160 | a comment-stripped scan of the WHOLE file for anachronistic words | all six files |
| 210, 211, 212, 215 | `const _pool = new Map()`, `_pool.set(look.id, wardrobe)`, the do-not-dispose comment, `export function setSoldierGearLOD` | the entry |

So the first commit adds `readSoldierGearSource()` to `scripts/lib/game-source.mjs` and switches that read to use it, with no split yet — the same first move the fx plan made. The helper already generalises: `readShadersSource()` is `readSplitSource(new URL('render/', js), 'shaders', '.js')` and this is the identical call with `'SoldierGear'`.

The regex at line 107 spans up to 1,200 characters between two pins. Both ends are in the attachment section, which stays in the entry and stays contiguous, so the join order cannot break it. No other pin spans a section boundary.

**Three validators already exercise the file end to end:**

| Validator | What it would catch |
|---|---|
| `scripts/test-soldier-visual.mjs` | Gear that stops attaching, a gearless soldier that stops being gearless, LOD that stops shedding, dispose that stops dropping the gear |
| `scripts/test-player-modules.mjs` | js/player/ still importing what it imports |
| `scripts/validate-remote-avatar.mjs` | The parenting, proportion and silhouette contracts above |

Plus `validate-module-syntax.mjs`, which walks js/ recursively and parses every module.

**New: `scripts/test-soldier-gear-modules.mjs` (~120 lines),** modelled on test-weapon-parts-modules.mjs:

- The entry exports exactly the 10 names it exports today, with the right types.
- Every module in js/render/SoldierGear/ loads in Node; each name is defined in exactly one module; the entry re-exports each one by identity.
- No module in js/render/SoldierGear/ imports js/render/SoldierGear.js.
- The import rule: constants.js and looks.js import nothing local, materials.js and kit.js import nothing local, wardrobe.js imports only ./constants.js and ./kit.js, and the entry imports only modules in the folder — each spelled with the case it has on disk.
- **The two caches stay one cache each.** `attachSoldierGear` called twice for the same persona must return meshes whose geometries are the *same objects* — that is `_pool` doing its job — and two avatars of one persona must share one material set, which is `_matSets` doing its. A second `_matSets` in a module of its own is the mistake this split could make: every avatar would still look right and four players would allocate four wardrobes instead of one.
- `readSoldierGearSource()` holds all six files.

It should be run against doctored copies of the tree and shown to fail on each: a wardrobe.js that imports the entry, a kit.js that imports ./wardrobe.js, an entry that imports `./SoldierGear/Looks.js`, an entry that drops its constants re-export, `put` defined in two modules, a materials.js whose `_matSets` is re-created per call, and a `readSoldierGearSource()` that reads only the entry.

The full run is `for f in scripts/*.mjs; do node "$f" || exit 1; done`, and it must pass after every step.

### 1.8 Steps, ordered by risk against payoff

One commit per step. Step 0 is tooling only and moves no code. After that, leaves first — the three modules nothing in the folder depends on — then kit.js, then the 340-line wardrobe that needs both.

| Step | Move | Entry after | Commit |
|---|---|---|---|
| 0 | `readSoldierGearSource()`; validate-remote-avatar reads it | 717 | `[test] Read SoldierGear as one source, so its text pins survive a split` |
| 1 | 32–88, 94–139, 145–162 → `constants.js`, `looks.js`, `materials.js` | ~600 | `[refactor] Split SoldierGear.js by module, step 1: the shape constants, palettes and materials` |
| 2 | 168–255 → `kit.js` | ~510 | `[refactor] Split SoldierGear.js by module, step 2: the primitive kit into js/render/SoldierGear/kit.js` |
| 3 | 261–600 → `wardrobe.js` | ~153 (under the cap) | `[refactor] Split SoldierGear.js by module, step 3: the wardrobe into js/render/SoldierGear/wardrobe.js` |
| 4 | — | — | `[test] Cover the SoldierGear module contract and the per-persona pools` |

Step 2 leaves the entry at ~510, still ten lines over the cap; step 3 is what clears it. There is no ordering that gets under the cap sooner without moving the wardrobe before the kit it calls, which would leave a module importing one that does not exist yet.

**How the moves are made.** A throwaway script, not committed, writes each step's files from the 717-line original by the §1.3 ranges and checks the result on disk: every code or comment line outside the import block lands in exactly one file, and the lines that land nowhere are the 15 banner lines and the 11 blanks. **The only edit inside a moved range is the word `export` added to `const HEAD_REF`.**

**The behavioural proof,** run before step 1 to get a baseline and after every step:

- For each of the four personas, build a `SoldierVisual` headless with gear, and dump every gear mesh in traversal order: its bone, its name, its world matrix to six decimals, its material's colours and roughness, its geometry's vertex and index counts, and a hash of its position and normal attributes.
- **Number geometries and material sets in first-seen order across all four personas, then build all four a second time and dump the numbers again.** The second pass must reuse every number. That is `_pool` and `_matSets` proving themselves: a split that gave a module its own cache renumbers the second pass, and nothing else in the dump would change.
- Run `setSoldierGearLOD` through 0, 1, 2 and back to 0 on one avatar and dump which meshes are parented at each level, then `detachSoldierGear` and dump that the geometries are still alive.
- The baseline is run twice and must match itself. After each step the output must match it **byte for byte**.

**A browser check** after step 3: serve the repo, host a co-op lobby with a second tab, and look at the other soldier — the gear is only ever seen on a remote avatar, and no validator renders one.

### 1.9 Found while reading

Noted, not touched. Every one predates this plan.

- **`HEAD_SHAPE`, `HAND_SCALE`, `FOOT_SCALE` and `SPINE_FIX` are never used in this file.** They are exported for js/player/soldier-pose.js, which is the only consumer. They read as dead from inside, the way `bx` did in WeaponParts.js. Not dead; leave them.
- **`materials()` is called once,** at line 632, and `_matSets` therefore only ever has entries added by `attachSoldierGear`. The cache is still doing real work — four avatars of one persona share a set — but the indirection could be inlined. Leave it: it is the whole content of its banner.
- **The `LIMB_BONES` set is used once,** in `setSoldierGearLOD`. It stays with it in the entry.
- **The comment at line 679 names `LIMB_SHAPE`** to explain the bone chain's compound scale, so after the split a reader of the entry sees a constant referenced in prose that is defined in another file. That is normal for this repo — the same is true of `HEAD_SCALE` in the header — but it is worth a `js/render/SoldierGear/constants.js` pointer in that comment, added after the split rather than during it.

### 1.10 Docs and comments

- **README.md** names `js/render/` as one line in the repository layout and does not name SoldierGear.js, so the layout block needs no change. Its two "65 headless validators" mentions become 66 after step 4.
- **RENDERING.md** does not mention SoldierGear.js. No change.
- **`scripts/lib/game-source.mjs`'s header comment** lists what each `read…Source()` covers, one clause per split. Step 0 adds a clause for SoldierGear.
- **This doc's line 5** links back to `docs/split-weapon-parts-plan.md`. The series links backward only, so no line is added to that plan.
- **Section banners.** The five `// ---` banners disappear with the file; each becomes its module's header comment, saying the same thing. The 28-line file header stays on the entry. No text is dropped.

---

## 2. The other 8 files, ranked

`js/render/SoldierGear.js` left the table when §1 was carried out, so the eight below are all that remain. **Rank 1 is next.** `js/assets-page.js` leaves the ranking for the no-clean-seam list below, on the strength of a full read this time rather than the payoff argument the last three plans made. Nothing else has changed since the WeaponParts plan's ranking.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/WeaponMaterials.js, js/props/materials.js | 712, 685 | Clean top-level builder groups. WeaponMaterials: the surface generators (`steelSurface`, `woodSurface`, `leatherSurface`, `bakeliteSurface`, `checkerSurface`, `etchSurface`) under `buildLibrary()`. props/materials: the map generators (`enamelMaps`, `castIronMaps`, `brassMaps`, `plankMaps`) under the shared canvas and normal-from-height helpers. | Each keeps re-exporting whatever moves out. 15 files reference WeaponMaterials, four of them now in js/render/WeaponParts/. 4 files reference props/materials, and validate-coplanar-surfaces pins its text in two places, including a `BLUR` table. |
| 2 | js/render/ZombieDetail.js | 682 | Clean function groups: the cloth-geometry helpers, the body-measurement pass (`measureSkin`, `bodyProfile`, `fitToBody`), then `buildVariant` and the attach/detach entry points. It is SoldierGear's opposite number and says so in its own header, so this plan's shape should transfer almost unchanged — including the count of `export` keywords a private helper needs when it crosses a boundary, which §1.3 got wrong here. | Keeps re-exporting whatever moves out. 6 files reference it, and validate-zombie-detail.mjs and validate-zombie-hitboxes.mjs both load it directly. |
| — | js/render/PostFX.js, js/navmesh.js, js/hud.js | 680, 625, 559 | Marginal, 59–180 lines over. PostFX.js and hud.js are one class each (`PostFX` 52–680 under `QUALITY_PRESETS` at 33, `HUD` 9–559). navmesh.js is mostly `NavGrid` (200–608), with `ColliderHash` (103) and `Heap` (140) above it and two functions below. | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/assets-page.js (726 lines).** A full read this time, not the payoff argument the last three rankings made. Its four banners look like seams and are not, because the state and the calls both cross them in **both directions**:
  - **102 of its 726 lines touch page state held in module-level `let` bindings** — `selectedId`, `classFilter`, `variantFilter`, `searchTerm`, `previewPap`, `finishMode`, `activeSoundId`, `weaponInteractionActive`, `fireSession`, `reloadTimers`, `reloadToken`, `currentMount` and the drag state. An imported binding is read-only, so none of those assignments can survive a move: every one would have to become a property on a shared state object. That is a rewrite of 102 lines, and it forfeits the byte-for-byte proof every split in this repo has relied on.
  - **The audio dock and the weapon panel call each other.** `playSound` (line 55, the dock) calls `cancelWeaponInteraction` (426) and `renderSelectedWeapon` (589), and writes `previewPap` and `finishMode`. The weapon panel calls back into the dock at lines 384, 453, 465, 528 and 618. Split on the banner between them and the import cycle is immediate.
  - **It is a page script, not a library.** It constructs a `WebGLRenderer`, a scene, two cameras and three lights at module scope, reads 20-odd DOM ids at import time, and starts a `requestAnimationFrame` loop at line 256. Its modules would run their side effects in import order rather than in the order the file reads today.
  - **The payoff is the lowest on the board.** One page loads it (`assets/index.html`) and one validator reads its text. Splitting it changes nothing for any other file in the repo.
  - The js/main.js split solved the same problem with a shared `app` object in js/main/app.js, so this is *possible* — it is just not a split, it is a refactor of the page's state model, and it should be planned and proved as one.
- **index.html (881 lines).** The net plan's full read stands, and two later reads agree.
  - **The head (98 lines) has to stay.** Link unfurlers and crawlers read the meta tags and the JSON-LD without running scripts, and browsers do not load an import map from a file.
  - **The markup (546 lines) can't leave without a build step.** HTML has no include and the repo is served as it is. The bootstrap, the presentation shell and main.js all look elements up as they run, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, 5 validators pin the markup in 18 places, and the menu would paint late.
  - **The SVGs stay.** style/10-menu.css applies the wordmark's two filters by fragment, which resolves only inside the page, and `#skyline .win` cannot reach inside an `<img>`.
  - **Only the two inline scripts could move** — the device gate (646–690) and the presentation shell (693–877), 233 lines together. That leaves 648, still over the cap, and the shell fetched rather than inline would race the dynamic `import('./js/main.js')` it currently precedes.
