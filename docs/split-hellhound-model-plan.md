# Split plan: js/render/HellhoundModel.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 15 files with 4,121 lines over the cap.

This continues `docs/split-cinematic-director-finish-plan.md`, whose plan is done.

This plan covers `js/render/HellhoundModel.js`, the largest file. The finish plan's §2 ranked it fourth, in a group of builder files with clean top-level seams. A full read confirms the seams (§1.1):
- Its only state is two caches, and each is set by the one function that reads it.
- Nothing in it runs at load. Every geometry and material is made on the first build.
- No validator reads its text, and one dog round in test-zombie-groans runs every function in it.

This doc's §2 replaces the finish plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `5f2b6bd`, `25fb3bd` and `9413362`, one per step in §1.8. js/render/HellhoundModel.js went from 960 lines to 219, and the largest file in js/render/HellhoundModel/ is head.js, at 273. `count_lines.py` now finds 14 files with 3,661 lines over the cap, with js/map-props.js the largest. It went as planned, with these notes:
- **Actual line counts** are within three lines of the §1.3 estimates. The entry was 811 lines after step 1 and 320 after step 2.

  | Module | Lines |
  |---|---|
  | js/render/HellhoundModel.js | 219 |
  | materials | 64 |
  | primitives | 100 |
  | body | 232 |
  | head | 273 |
  | limbs | 110 |

- **How the moves were made.** A throwaway script wrote each step's files from the 960-line file by the ranges in §1.3, so each step also rewrote the earlier steps' modules, byte for byte. None of it was committed.
  - Before writing anything, it checked that the ranges tile the file: each starts and ends on a non-blank line, one blank line separates neighbours, and joined again they rebuild the file exactly.
  - primitives.js's banner is 164–166. Line 167, which §1.3 includes, is the blank line before the next block.
- **The proof ran as §1.8 describes.**
  - The baseline, run twice, matched itself. It records 10 builds of 39 objects each, 50 distinct geometries, the LOD tiers and 72,793 `Math.random` draws.
  - After each of steps 1, 2 and 3, the output matched the baseline byte for byte.
- **The diff review.**
  - Every line that left HellhoundModel.js is verbatim, in order, in the module §1.3 planned for it, at every step.
  - The only added lines `git diff --color-moved=zebra` showed as new, not moved, were file headers, imports and export lists, plus the planned edits: the entry's re-export and the tooling in step 1, and the entry's header sentence and models.js's comment in step 3.
  - One exception: in step 1, primitives.js's banner showed as new. It has fewer than the 20 letters and digits `--color-moved` needs to match a moved block. The range check shows it verbatim.
  - After each step, a name check also ran on every file: each uses every name it imports, exports only names it declares, and reads no top-level name of the pre-split file that it neither declares nor imports.
- **test-hellhound-modules.mjs is 103 lines,** rather than ~70. Before step 1's commit, it ran on copies of the tree with five mistakes, and failed on each:
  - an entry that spells materials.js with a capital M. Node loads that file twice, under two names, so the re-export check fails first.
  - a materials.js that imports primitives.js
  - a primitives.js that imports the entry
  - an entry that drops `houndMaterials`' export
  - a miscased vendor import in primitives.js, which only the case check catches
- **The validators number 55,** and all of them passed after every step. The 54 before step 1 passed too. The loop takes about 50 s.
- **Browser checks.** None has been run. The dog-round check in §1.8 needs a local server, and it is also AGENTS.md's check before a deploy.

None of the dead code in §1.9 was touched. The comment changes in §1.10 are done, except the optional one to `SLOTS`' comment, which was left for John.

```
15 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
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

Total excess lines: 4121
```

The plan has two parts:
1. `js/render/HellhoundModel.js`: five modules in js/render/HellhoundModel/ take the materials, the shared geometry kit, and the body, head and limb builders, verbatim. The file keeps the variant pool, the rig and the LOD, and exports the same five names, so js/zombies/ doesn't change.
2. The other 14 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/render/HellhoundModel.js: 960 lines → js/render/HellhoundModel.js (~220) + 5 modules in js/render/HellhoundModel/

### 1.1 What's in it

This is the procedural hellhound: five prebuilt variants of merged, bone-parented geometry shared by every hound in the process, and the rig that js/zombies/poses.js and the cinematic director pose. Three files in js/zombies/ import 4 of its 5 exports. Nothing imports `houndMaterials`.

| File | Imports |
|---|---|
| js/zombies/models.js (6) | `buildHellhound`, `HOUND_VARIANTS` |
| js/zombies/manager-spawning.js (8) | `prewarmHellhounds` |
| js/zombies/manager.js (8) | `setHellhoundLOD` |

| Lines | Contents | Used by |
|---|---|---|
| 1–27 | The header: silhouette first, one mesh per bone, nothing fights the pose; the coordinate frame | |
| 28–30 | Imports of `THREE`, `mergeGeometries` (../../vendor/utils/BufferGeometryUtils.js) and `enhanceCreatureMaterial` (./CreatureShading.js) | |
| 32–33 | `HOUND_VARIANTS` | `pool`, `buildHellhound`; models.js |
| 35–88 | The materials banner; `_mats`; `houndMaterials`: hide, ember, eye, gullet and bone, with creature shading on the hide and the bone | `prewarmHellhounds`, `buildHellhound` |
| 90–91 | `SLOTS`, the material slot order | `pack` |
| 93–105 | The RNG banner; `mulberry32` | `pool` |
| 107–162 | The body banner; `BODY`, 11 elliptical stations along the spine; `bodyAt`; `bodySurface` | `bodyTube`, `bodyNormal`, `emberFissures`, `hackles`, `fur`, `buildTorso` |
| 164–206 | The primitive builders banner; `bodyTube` | `buildTorso` |
| 208–216 | `spike` | `hackles`, `fur`, and every part builder but `buildTorso` |
| 218–232 | `limb` | `buildUpperLeg`, `buildLowerLeg` |
| 234–269 | `ribbon` | `emberFissures`, `buildTorso`, `buildNeck`, `buildHead`, `buildTailSeg` |
| 271–278 | `placed` | `hackles`, `fur`, and every part builder |
| 280–311 | `pack`: merges a bone's bag of geometry into one, with a group per slot | every part builder |
| 313–380 | The variant construction banner; `bodyNormal`; `emberFissures`, `hackles`, `fur` | `buildTorso`; `bodyNormal` also `emberFissures` |
| 382–440 | `buildTorso` | `pool` |
| 442–501 | `buildNeck` | `pool` |
| 503–640 | `MUZ_X0`, `MUZ_LEN`, `muzzleAt`; `buildHead` | `pool` |
| 642–707 | `JAW_X0`, `JAW_LEN`, `jawAt`; `buildJaw` | `pool` |
| 709–742 | `buildTailSeg` | `pool` |
| 744–795 | The legs banner; `UPPER_LEN`, `LOWER_LEN`; `buildUpperLeg`, `buildLowerLeg`, `buildPaw` | `pool`; the two lengths also `buildHellhound` |
| 797–821 | The pool banner; `_pool`; `pool`, five variants from seeded streams; `prewarmHellhounds` | `buildHellhound`; manager-spawning.js |
| 823–937 | `meshFor`; `buildHellhound`: the body, the neck → head → jaw chain, three tail links, four hip → knee → paw legs, and the `userData` rig | models.js |
| 939–960 | `setHellhoundLOD`: three distance tiers of shadow casting and tail visibility | manager.js |

Blank lines separate the blocks.

Five facts shape the plan:
- **Its state is two caches.** `_mats` (38) is set only by `houndMaterials`, and `_pool` (800) only by `pool`. Every other top-level name is a `const` or a function of its arguments. So no binding has to be shared across modules, which is what made the director split hard.
- **Nothing runs at load.**
  - The top level defines functions, the `SLOTS` and `BODY` arrays, seven numbers and the two empty caches. Every geometry and material is made inside `houndMaterials`, `pool` and `buildHellhound`, on the first dog round or the director's first hound.
  - three gives each geometry, material and object a uuid drawn from `Math.random`. So how many objects a build makes, and in what order, decides the draws after it. The director seeds `Math.random` per shot and test-zombie-groans pins it, so the split must not add, drop or reorder an object. Verbatim moves don't.
- **The helpers sort by reader.**
  - The station table and everything that reads it (`bodyAt`, `bodySurface`, `bodyTube`, `bodyNormal`, `emberFissures`, `hackles`, `fur`) serve only `buildTorso`.
  - `limb` serves only the two leg builders, `muzzleAt` only `buildHead`, and `jawAt` only `buildJaw`.
  - Four helpers serve the body, head and limbs alike: `spike`, `ribbon`, `placed` and `pack`. `pack` reads `SLOTS`, whose names must match `houndMaterials`' keys, because `meshFor` looks the materials up by them.
- **No validator reads its text, and one run reaches every line.**
  - test-zombie-groans plays round 5 as a dog round through the real ZombieManager. `startRound` calls `prewarmHellhounds()`, which builds the materials and all five variants. Each spawn calls `buildHellhound` through `createZombieModel`, and each frame calls `setHellhoundLOD`.
  - So every function runs, and every line that names an import runs on every build. A missing import or export fails it.
  - test-cinematic-director builds the one hound shot, `hellhoundSting`, and poses its hound on every sampled frame.
- **Node can compare a build exactly.** headless-three.mjs loads the file with three from vendor/. A script can hash every buffer and material a build makes. With `Math.random` seeded, the uuids record every object it creates, in order (§1.8).

### 1.2 Mechanism

**Verbatim moves into a folder, with the file kept as the entry point.** It's the shape of js/render/shaders.js, js/zombies.js and js/player.js.
- Every moved line stays byte-identical. Only `houndMaterials` is exported today, so each module ends with an `export { … }` list of the names other files import from it, as in js/cinematic-director/.
- js/render/HellhoundModel.js keeps its header, `HOUND_VARIANTS`, `mulberry32`, the pool, `prewarmHellhounds`, `meshFor`, `buildHellhound` and `setHellhoundLOD`.
- It imports `houndMaterials` and re-exports it. Nothing imports that name, but the entry keeps exporting it, so its exports stay exactly what they were. The new test pins them.

**Five modules, by reader.** A helper that only one part uses moves with that part. The names the parts share sit below them, so the folder imports in one direction.

| Module | Takes | Why it's a seam |
|---|---|---|
| materials.js | `houndMaterials`, `SLOTS` | The five shared materials, and the slot order that names them. `pack` silently drops a slot `SLOTS` doesn't list, so a new material means editing both. They stay two lines apart. |
| primitives.js | `spike`, `ribbon`, `placed`, `pack` | The kit the body, head and limbs all build with. `pack` is the merge that makes one mesh per bone. |
| body.js | `BODY`, `bodyAt`, `bodySurface`, `bodyTube`, `bodyNormal`, `emberFissures`, `hackles`, `fur`, `buildTorso` | The header's first idea, silhouette first: the station table and everything that reads it |
| head.js | `buildNeck`; `MUZ_X0`, `MUZ_LEN`, `muzzleAt`, `buildHead`; `JAW_X0`, `JAW_LEN`, `jawAt`, `buildJaw` | The neck → head → jaw chain. The teeth are struck off each profile, so a profile stays with its builder. |
| limbs.js | `limb`, `buildTailSeg`, `UPPER_LEN`, `LOWER_LEN`, `buildUpperLeg`, `buildLowerLeg`, `buildPaw` | The chains that hang off the body: three tail links, and the hip → knee → paw all four legs share |

**What stays is where a hound is put together.** `pool` calls every part builder. It and `buildHellhound` read `HOUND_VARIANTS`, and `buildHellhound` also reads `meshFor` and the leg lengths.

Rejected alternatives:
- **The file's own banners as the modules.**
  - "primitive builders" (164–311) holds `bodyTube`, which reads `BODY`. primitives.js would import body.js, which imports primitives.js: a cycle.
  - "variant construction" (313–795) is 483 lines, ~490 with a header and imports, just under the cap.
- **One parts.js for the neck, head, jaw, tail and legs (~365 lines).** It fits. But head.js and limbs.js follow the chains `buildHellhound` rigs, so the jaw and the paw aren't in the same place.
- **A module per bone.** tail.js would be ~40 lines and paw.js ~20, and the three leg builders share `UPPER_LEN` and `LOWER_LEN`.
- **`SLOTS` in primitives.js, with `pack`, its only reader.** primitives.js wouldn't import materials.js, but the slot names would sit a module away from the materials they must match.
- **`limb` in primitives.js, under its banner.** Only limbs.js calls it.
- **The pool and the rig in a module of their own.** It would import `HOUND_VARIANTS` from the entry, which is a cycle, or `HOUND_VARIANTS` would move and be re-exported too. And the file the three callers import would hold none of what they call.
- **Delete the entry, and import the modules from js/zombies/.** Three importers would change, and every split so far kept its entry.

### 1.3 Target modules

Each new file opens with a `// The hellhound's <part>: …` comment. Then come its imports, a blank line, its lines from HellhoundModel.js in their original order, and its export list.

| Module | Takes from HellhoundModel.js | Exports | ≈ lines |
|---|---|---|---|
| `js/render/HellhoundModel.js` | 1–27, the header, plus one sentence; 28, `THREE`; the imports and re-export in §1.4; 32–33; 93–105; 797–960 | `HOUND_VARIANTS`, `houndMaterials`, `prewarmHellhounds`, `buildHellhound`, `setHellhoundLOD`, as today | 220 |
| `js/render/HellhoundModel/materials.js` | 35–91 | `houndMaterials` (its own `export`), `SLOTS` | 65 |
| `js/render/HellhoundModel/primitives.js` | 164–167, 208–216, 234–269, 271–278, 280–311 | `spike`, `ribbon`, `placed`, `pack` | 100 |
| `js/render/HellhoundModel/body.js` | 107–162, 168–206, 313–321, 323–344, 346–368, 370–380, 382–440 | `buildTorso` | 235 |
| `js/render/HellhoundModel/head.js` | 442–707 | `buildNeck`, `buildHead`, `buildJaw` | 275 |
| `js/render/HellhoundModel/limbs.js` | 218–232, 709–742, 744–748, 750–765, 767–780, 782–795 | `buildTailSeg`, `UPPER_LEN`, `LOWER_LEN`, `buildUpperLeg`, `buildLowerLeg`, `buildPaw` | 110 |

Apart from the imports at 29–30 and the blank lines between blocks, each line of HellhoundModel.js ends up in exactly one of these files. Each banner moves with the block under it. The largest file is head.js, at ~275.

Rules for the new lines:
- **File names are lower case,** like the other split folders. The folder is named for the entry, as js/render/shaders/ is. Import specifiers must spell both exactly: macOS resolves a wrong case, and Vercel doesn't. The new test checks it (§1.7).
- **primitives.js's vendor import gains a `../`:** `'../../../vendor/utils/BufferGeometryUtils.js'`. It resolves to the same URL as today's import, so BufferGeometryUtils.js still loads once.

### 1.4 What stays in js/render/HellhoundModel.js

It stays the model's entry point, and the three files in js/zombies/ keep importing it. After step 3 its top is:

```js
// The hellhound, as an actual animal.
// … lines 2–26 unchanged …
// Coordinate frame: +X is the nose, +Y is up, +Z is the animal's left. Metres.
//
// The parts are built in js/render/HellhoundModel/. This file builds the five
// variants from them, rigs a hound and sets its LOD.
import * as THREE from 'three';
import { houndMaterials } from './HellhoundModel/materials.js';
import { buildTorso } from './HellhoundModel/body.js';
import { buildNeck, buildHead, buildJaw } from './HellhoundModel/head.js';
import { buildTailSeg, UPPER_LEN, LOWER_LEN, buildUpperLeg, buildLowerLeg, buildPaw } from './HellhoundModel/limbs.js';

export { houndMaterials };

/** Distinct builds, so a pack of eight never reads as one model duplicated. */
export const HOUND_VARIANTS = 5;
```

Then 93–105 (`mulberry32`) and 797–960, verbatim. `houndMaterials` needs the import as well as the export, because the entry calls it: an `export … from` line doesn't bind the name.

**The entry's imports between steps.**
- **After step 1:** `THREE`; `houndMaterials` from materials.js, with the re-export; `spike`, `ribbon`, `placed` and `pack` from primitives.js. `mergeGeometries` and `enhanceCreatureMaterial` leave it.
- **After step 2:** it adds `buildTorso` from body.js, and `buildNeck`, `buildHead` and `buildJaw` from head.js.
- **After step 3:** the list above. limbs.js joins, and primitives.js leaves, since no code left in the entry builds geometry.

### 1.5 Imports

| File | Imports |
|---|---|
| materials.js | `THREE`; `enhanceCreatureMaterial` (../CreatureShading.js) |
| primitives.js | `THREE`; `mergeGeometries` (../../../vendor/utils/BufferGeometryUtils.js); `SLOTS` (./materials.js) |
| body.js, head.js, limbs.js | `THREE`; `spike`, `ribbon`, `placed`, `pack` (./primitives.js) |
| js/render/HellhoundModel.js | §1.4 |
| js/zombies/models.js, manager.js, manager-spawning.js | Unchanged |

**Cache tokens.**
- None of the three importers' specifiers has one, and none of HellhoundModel.js's imports does.
- The new files get none either, like every split file before them.
- vercel.json serves /js/ with `max-age=0`, so browsers revalidate them on every load.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/render/HellhoundModel/, and mustn't. This folder ships.
- AGENTS.md asks for a normal round and a dog round in the browser before deploying a change to models. §1.8's browser check is that.

**Load order.**
- The first js/zombies/ file to load the entry loads the five modules with it.
- They define functions, `SLOTS`, `BODY`, six numbers and an empty cache, and nothing else, so the order doesn't matter.
- No three.js object exists before the first build, as today.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No module in js/render/HellhoundModel/ imports js/render/HellhoundModel.js.** The new test enforces it.
- **The folder imports in one direction.** materials.js imports nothing from it, primitives.js imports only materials.js, and body.js, head.js and limbs.js import only primitives.js. So it can't have a cycle. The new test enforces this too.
- **Nothing leads back in.** CreatureShading.js and BufferGeometryUtils.js import only three, and no new module imports anything from js/zombies/.

Nothing in these modules runs at load, so a cycle wouldn't throw today. It would once a top-level line read an import, and every split so far has kept its graph acyclic.

### 1.7 Validators

**No text pins.**
- No validator reads js/render/HellhoundModel.js by path.
- The one hound pin, in validate-combat-systems (156), reads js/zombies/ through `readZombiesSource()`.
- So no `read…Source()` helper is needed.

**No test splits.** No test covers this file alone. test-zombie-groans (69 lines) and test-cinematic-director (241) cover the zombies and the director as a whole.

**The behavioural checks cover every step, unchanged.**
- **test-zombie-groans** runs every function in the file on its dog round (§1.1), so a missing import or export in a new module fails it.
- **test-cinematic-director** builds and poses `hellhoundSting`'s hound.
- **Every validator that loads js/zombies.js or js/game.js links the entry,** so a wrong path fails it at load.
- **validate-module-syntax** walks js/ recursively, so it parses the new files.

**New: `scripts/test-hellhound-modules.mjs` (~70 lines).** This is the model's counterpart of test-shader-modules. Every check holds at every step. It checks:
- **js/render/HellhoundModel.js exports the same five names as before the split.** `HOUND_VARIANTS` is 5, and the other four are functions.
- **Every module in js/render/HellhoundModel/ loads in Node,** and the entry's `houndMaterials` is materials.js's.
- **No module in the folder imports the entry,** through `assertNoImportOf`.
- **The imports follow the rule in §1.6,** and every relative import in the entry is a module in the folder.
  - Each relative specifier, in the entry and in the modules, names a file that exists with that exact case.
  - The rule also runs on a doctored list in which materials.js imports primitives.js, and must reject it.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 55.

**What still isn't caught.**
- After the split, nothing checks that two builds of a variant share their geometry, which is the header's second idea.
- Nothing checks that the rig carries the fields js/zombies/poses.js reads. poses.js skips a missing one quietly, so test-zombie-groans would still pass.
- test-hellhound-modules could check both. It isn't one of the steps, and whether to add it is John's call.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The imports fix part of the order: materials.js has to exist before primitives.js, and primitives.js before body.js, head.js or limbs.js. Every move is verbatim and the proof is exact, so every step's risk is low. Within that order:
- **The kit goes first,** with the tooling, because every part builder calls it.
- **The two largest part modules go next.** They take the entry under the cap.
- **limbs.js goes last,** and leaves the entry as in §1.4.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 1 | `test-hellhound-modules.mjs` and split-modules.mjs's header; **materials.js**; **primitives.js** | ~150, leaving ~810 | Low. The entry's imports change, and the vendor import goes one folder deeper. Every build runs through `pack`, so a wrong path or name fails test-zombie-groans. | None beyond the proof. |
| 2 | **body.js**; **head.js** | ~490, leaving ~320 | Low. The largest move, verbatim. Every function in both runs for each of the five variants. | None beyond the proof. |
| 3 | **limbs.js**; the entry as in §1.4, with its header sentence; js/zombies/models.js's comment (§1.10) | ~100, leaving ~220 | Low. Verbatim. The entry stops importing primitives.js. | The dog round, below. |

**Browser check, after step 3.** It needs a local server. Ask John before starting one, and stop it when the check is done. Keep the DevTools console open: any error fails the check.
- In CHEAT CODES, set START ROUND to 4, then start solo on Ultra.
- **Round 4 is a normal round.** Zombies climb in through the windows, and none of them is a hound.
- **Round 5 is the scheduled dog round.**
  - The hounds are charcoal, with ember cracks, one flank's ribs burnt open, a mane down the neck, and two hot eyes under the brow.
  - They run on planted paws, the tail swings, and the jaw drops on a bite, with the throat glowing.
  - A hound far off keeps its outline but casts no shadow.
- The Network tab shows no failed module.
- This is also AGENTS.md's check before a deploy. If John starts the server for the director's pending checks, `cinematic.html?shot=hellhoundSting` covers the hound there too.

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script outside the repo, not committed.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Load js/render/HellhoundModel.js through headless-three.mjs, so three comes from vendor/.
   - Replace `Math.random` with a seeded stream that counts its draws.
   - Call `prewarmHellhounds()`. Then call `buildHellhound(v)` for v = 0 to 5 and −1, `buildHellhound()` with no argument, and `buildHellhound(2)` a second time.
2. **For each build, print in traversal order:**
   - each object's type, name, uuid, position, quaternion, scale, visibility and `castShadow`;
   - each mesh's geometry uuid and material uuids;
   - the `userData`: `legs` and `legChains` with their numbers and the uuids they point to, `head`, `jaw`, `neck`, `body`, `tail` and `tailSegs` as uuids, then `jawRestY`, `dog`, `directorRig`, `variant` and the length of `detail`.
3. **Print each distinct geometry once:** the SHA-256 of its position, normal and index arrays, its groups and its draw range.
4. **Print the five materials:** type, uuid, color, emissive, emissiveIntensity, roughness, metalness, toneMapped, the `creatureUniforms` values, and the source of `onBeforeCompile`.
5. **Run `setHellhoundLOD` on one build** at d2 = 0, 0, 329, 330, 1999, 2000 and then 0. After each call, print every mesh's `castShadow` and every tail link's visibility.
6. **Print the draw count** after each call. With the uuids, it shows that each step creates the same objects in the same order, so the seeded sequences the director and test-zombie-groans draw from don't shift.
7. **After each step, run it again.** The output must match the baseline byte for byte.
8. **Review the diff.**
   - A script cuts each module from the pre-split file by the ranges in §1.3. Check that every line that left HellhoundModel.js appears verbatim, in order, in the module meant to hold it.
   - Then run `git diff --color-moved=zebra`. The only new lines should be:
     - file headers, import lines and export lists
     - the entry's re-export, and its header sentence in step 3
     - models.js's comment in step 3
     - the tooling in step 1

Unlike the director's split, this needs no scope check: every moved function runs in the proof, and every line that names an import runs on every build.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- `const L = 0.34;` in `buildNeck` (446) is never read.
- `g.scale(1, 1, 1);` in `limb` (221) does nothing.
- **Rig fields nothing reads.**
  - `userData.detail` (846, 932) is always an empty array. ZombieManager's detail checks read `z.visual?.detail`, and a hound has no visual.
  - `userData.variant` (934) is never read.
- **An export nothing imports.** `houndMaterials` is called only inside this file. The entry keeps exporting it (§1.2).

**A count the code doesn't match.** The header (19) and `setHellhoundLOD`'s comment (942) say a hound is ~14 meshes. `buildHellhound` makes 19: the torso, neck, head and jaw, three tail links, and three for each leg.

**Two copies of the tail link lengths.** `pool` (811) and `buildHellhound` (882) each write `[0.19, 0.17, 0.15]`, so a change to one has to be made in both. Both stay in the entry.

**Six copies of `mulberry32` in js/.** They're in this file, js/map-props.js, js/props/materials.js (which exports its copy), js/render/ZombieDetail.js, js/audio/ir.js and js/cinematic-director.js. Sharing one would be an import change, not a move.

### 1.10 Docs and comments

- **js/render/HellhoundModel.js's header** gains a sentence in step 3: "The parts are built in js/render/HellhoundModel/. This file builds the five variants from them, rigs a hound and sets its LOD."
- **js/zombies/models.js's comment** (10) says the hound's "geometry, materials and rig live in render/HellhoundModel.js". In step 3 that becomes "live in render/HellhoundModel.js and render/HellhoundModel/". No validator pins that comment.
- **scripts/lib/split-modules.mjs's header** gains `test-hellhound-modules.mjs (js/render/HellhoundModel/)` in step 1.
- **Optional, and not a move.**
  - `SLOTS`' comment (90) says "every merged geometry in this file". After step 1 it sits in materials.js, and the merged geometries are built in three other modules.
  - If John wants it, "in this file" becomes "in the hound", in its own commit after step 3.
- **Unchanged:**
  - The header's "This file writes no transform per frame" (25) stays true of the entry and of every new module.
  - README.md lists `render/` as "Shaders, post-FX, camera rig, creature shading", which stays true.
  - RENDERING.md, AGENTS.md and llms.txt don't name the file.
- **Leave as is:** the docs/split-*.md plans cite js/render/HellhoundModel.js, but they're dated records.

---

## 2. The other 14 files, ranked

None of these files has changed since `docs/split-shaders-plan.md` §2 was written: no commit from `dfda24f` on touches them. The importer counts and the validators' reads in the notes were checked again, and they hold. So the finish plan's verdicts and ranks stand, with js/render/HellhoundModel.js taken out of rank 4.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 2 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. main.js and js/main/ reach `Net` only through the instance, so a mixin split changes nothing there. |
| 3 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's were. The map plan's §1.2 mechanism may fit. | Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The only binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like the map plan's §1.8. |
| 4 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 5 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 6 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
