# Split plan: js/props/materials.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 7 files with 1,338 lines over the cap.

This continues `docs/split-weapon-materials-plan.md`, whose plan is done.

This plan covers `js/props/materials.js`, the largest file with a clean seam. Two files are larger and both have full reads ruling them out — index.html at 881 and js/assets-page.js at 726 (§2). props/materials.js has been in rank 1 for the last five rankings, and it is the structural twin of js/render/WeaponMaterials.js, which was split yesterday to the same shape:

- **It is not a class.** It is 15 exported functions and tables with two module-private caches, and it already reads as kit → generators → shared singletons.
- **The file carries its seams as nine `// ---` section banners,** one per generator plus the kit and the singletons. The split follows them exactly; no group is invented and none is cut at a line number.
- **The graph between those groups is strictly linear, and every call site was enumerated.** The kit calls only itself. The eight generators call the kit. `shared`, `ironMaterial` and `brassMaterial` call the generators. Nothing calls upward.
- **One validator reads the file's text and pins it in eleven places,** validate-coplanar-surfaces.mjs. Two of those pins break under a naive split and one that looks like it would does not — §1.7 is the important section of this plan.
- **Ten validators build the map end to end,** which builds every machine, which builds every material here, so the behaviour is covered from the first commit.

This doc's §2 replaces the WeaponMaterials plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `e61dd75`, `8979366`, `f8202bf` and `13ba66b`, one per step in §1.8. js/props/materials.js went from 685 lines to 103, and the largest file in js/props/materials/ is surfaces.js, at 293. `count_lines.py` now finds 6 files with 1,153 lines over the cap. It went as planned, with these notes:

- **Two of the four line counts missed, by the same arithmetic error in both directions.**

  | Module | Lines | Estimate |
  |---|---|---|
  | js/props/materials.js | 103 | ~75 |
  | surfaces | 293 | ~292 |
  | kit | 176 | ~208 |
  | textures | 137 | ~139 |

  §1.3's estimate table costed the kit at its full 17–217 range while its own "Takes" column correctly says "minus `PROP_NORMAL_FILTER`/`propMaterial`". The 30-line filter pair was therefore counted in the kit *and* left out of the entry, so the kit came in 32 short and the entry 28 long. The two generator modules, whose ranges had no such carve-out, landed within two lines.

  The entry was 517 lines after step 1 and 234 after step 2. §1.8 predicted ~500 and ~215; both were low for the same reason.
- **§1.7 was the section that mattered, and all three predictions held.**
  - The `applyNormalFilter` pin passed untouched, because `propMaterial` stayed in the entry. That was the whole reason for leaving it there, and step 4's test now asserts the entry still carries `'../render/Materials.js'` so a later refactor fails with the reason rather than with a regex miss.
  - The `BLUR` table regex did break on `export const BLUR = {`, and now accepts it. **Both tooling edits were shown to be load-bearing against doctored trees before step 1 was committed:** a kit.js whose table is renamed still fails the relaxed regex, and a `readPropMaterialsSource()` that reads only the entry fails on the anisotropy pin.
  - `readPropMaterialsSource()` landed with the first module rather than before it, for the reason the SoldierGear split found. Four commits, not five.
- **Six `export` keywords, exactly as §1.3 counted.** Taking the count from the private declarations against their call sites — the method the SoldierGear outcome asked for and the WeaponMaterials split confirmed — has now been right twice running. `boxBlur` stayed private as predicted.
- **The prose grep found nothing to fix.** §1.8 called the 90-line BLUR commentary "the likeliest place in the repo to find another" broken cross-reference. Its two internal references — "the radius from BLUR above" and "the radii chosen above" — are both still true, because `BLUR` and `normalFromHeight` moved into the same module in the same order. surfaces.js and textures.js needed no prose edits either. The one comment the split did retire is the mislabelled `// deterministic RNG` banner §1.9 flagged, which headed 201 lines of which the RNG was 8.
- **How the moves were made.** A throwaway script wrote each step's files from the 685-line file by the §1.3 ranges, then checked them on disk: every code or comment line lands in exactly one file, and the six lines that land nowhere (13, 49, 80, 218, 503, 635) are all blank. Diffing the original against the four files afterwards, exactly nine non-blank lines are not present verbatim: the six `export` keywords, the retired banner title, and two rule lines of a banner the entry keeps.
- **The proof compares the draw-call stream, not pixels.** Node has no rasteriser — the headless canvas stub zeroes `getImageData` — so hashing canvas pixels would have proved nothing. Instead every canvas a generator makes is wrapped and every 2D call and property set is recorded in order with its arguments. Because the generators are seeded through `mulberry32`, every coordinate, radius and colour string in that stream is a function of the seed, which makes the log a complete record of what is drawn. The Sobel's arithmetic reads `getImageData` and so is degenerate under the stub; its call sequence is not, and is identical either way.
  - 359 lines: eight generators at two seeds each, a seeding check, the memoised singletons read twice, both materials on every option branch with their map identities and program cache key, `PROP_NORMAL_FILTER`, `scaleUV` and `mulberry32`'s first five outputs. The baseline, run twice, matched itself. **After steps 1, 2 and 3 the output matched it byte for byte.**
  - **One correction to the proof, made before step 1 landed.** The seeding check compared two runs of the same generator and reported `false` for all eight — because the canvas counter that labels the stream kept incrementing, so the second run's canvases were numbered differently. The counter resets per run; the label is not part of what the generator draws.
- **test-prop-materials-modules.mjs is 226 lines,** rather than ~150. The singleton and seeding sections account for most of the difference. It was run on copies of the tree with the eight mistakes §1.7 lists, and failed on each.
  - **`finish` in two modules is caught by a load-time `SyntaxError`,** not by the duplicate-name check: textures.js already imports `finish`, so a second declaration collides in the same scope. The duplicate-name check would fire for a name the module does not import. Either way it is rejected, and the load-time error is the stricter of the two.
  - It pins two things §1.7 did not state: the shared entries must be **distinct from each other** (a cache keyed wrongly would hand every getter the same maps and still pass a memoisation check), and the entry must still carry the pinned `'../render/Materials.js'` specifier.
- **The validators number 68,** and all of them passed after every step. The 67 before step 1 passed too.
- **§1.10's doc edits were made:** README.md's two "67 headless validators" mentions are now 68, and the second names the seeded machine surfaces. game-source.mjs' header gained its clause. The repository-layout block needed no change.
- **The two comments in other files that name this one both stay true.** js/render/Materials.js:23 and js/render/WeaponMaterials/canvas.js:35 describe the library rather than a line in one file, and both still point at the entry. §1.10 required checking that neither was left describing a file that no longer holds the BLUR table; neither is.
- **Nothing in §1.9 was touched** beyond the banner the split retires. `stencilTexture` and `signTexture` still have no internal caller, `enamelMaps` is still the generator outside `shared` — now recorded in surfaces.js' module header, which the split could add without touching code — and `hexRGB` still has its single caller.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a played match.

The table this plan was written against:

```
7 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                         LINES  SPLIT INTO
-------------------------  -------  ----------
index.html                     881           2
js/assets-page.js              726           2
js/props/materials.js          685           2
js/render/ZombieDetail.js      682           2
js/render/PostFX.js            680           2
js/navmesh.js                  625           2
js/hud.js                      559           2

Total excess lines: 1338
```

The plan has two parts:

1. `js/props/materials.js`: the entry keeps its 10-line header, the normal-filter material factory, the singleton cache and the three helpers built on it. The kit, the four map generators and the four overlay textures move into three modules in js/props/materials/.
2. The other 6 files, ranked by risk against payoff, then the two files with no clean seam.

---

## 1. js/props/materials.js: 685 lines → js/props/materials.js (~75) + 3 modules in js/props/materials/

### 1.1 What's in it

The shared procedural surface library for the map's interactive machines. Everything is drawn into a canvas at load time and uploaded once; the machines are hero props the player stands a metre and a half from, so they get real colour/roughness/normal sets rather than a flat tint. Every generator is seeded, so a machine looks identical in every session.

The file's own banners, with the line ranges a fresh read confirmed:

| Lines | Section | Names |
|---|---|---|
| 1–10 | header comment | what this is, and that every generator is seeded |
| 11–12 | imports | `THREE`, `applyNormalFilter` from `'../render/Materials.js'` |
| 14–217 | `// deterministic RNG` | `mulberry32`, `mkCanvas`, `finish`, `PROP_NORMAL_FILTER`, `propMaterial`, `boxBlur`, `BLUR`, `normalFromHeight`, `blotches`, `hexRGB` |
| 219–322 | `// enamelled painted steel` | `enamelMaps` |
| 324–379 | `// sand-cast iron` | `castIronMaps` |
| 381–420 | `// tarnished brass / bronze` | `brassMaps` |
| 422–502 | `// weathered crate boarding` | `plankMaps` |
| 504–541 | `// stencilled markings` | `stencilTexture` |
| 543–569 | `// yellow/black hazard striping` | `hazardTexture` |
| 571–613 | `// backlit enamel sign face` | `signTexture` |
| 615–634 | `// frosted / dirty glass` | `glassRoughness` |
| 636–685 | `// shared singletons` | `cache`, `once`, `shared`, `ironMaterial`, `brassMaterial`, `scaleUV` |

The ranges tile the file: the 27 banner lines and the 10 blanks between sections (13, 218, 323, 380, 421, 503, 542, 570, 614, 635) are everything left over.

**The first banner is mislabelled.** It says "deterministic RNG" and covers 201 lines of which the RNG is 8: it is the whole shared kit. The split names the module for what is in it, `kit.js`, and the banner's title does not survive as a lie.

Four facts from the read that decide the split:

- **`propMaterial` is called only by `ironMaterial` and `brassMaterial`** (lines 660 and 670), both of which stay. So `propMaterial`, `PROP_NORMAL_FILTER` and the `applyNormalFilter` import stay in the entry — **the `'../render/Materials.js'` specifier never moves**, which matters in §1.7.
- **No generator uses `THREE`.** The four map generators are 284 lines with zero `THREE.` references; they only touch canvases and the kit. The kit has 8, the overlay textures 3, the singletons 2.
- **`BLUR` crosses a boundary and `boxBlur` does not.** `BLUR` is read at 319, 376, 417 and 499 — one per map generator — so it has to be exported from the kit. `boxBlur` is called only from `normalFromHeight` (line 179), so it moves with it and stays private.
- **`blotches` is the one kit function both generator groups use** — 261–263, 364–366, 404–408 and 483–485 in the map generators, 561, 580 and 623 in the overlays. It is why the kit is one module rather than two.

### 1.2 Mechanism

The shape js/render/WeaponMaterials.js took: the entry keeps its state and the public helpers built on it, and everything it can delegate moves out. Here `cache`/`once`/`shared` is the singleton layer every machine pulls from, and `ironMaterial`/`brassMaterial`/`propMaterial` are what the eight importers actually call.

The folder is `js/props/materials/`, matching `js/map/`, `js/fx/` and the three `js/render/` folders. A file and a directory sharing a stem in one directory is the established pattern here.

### 1.3 Target modules

| Module | Lines (est.) | Takes | Exports |
|---|---|---|---|
| `js/props/materials/surfaces.js` | ~292 | 219–502 | `enamelMaps`, `castIronMaps`, `brassMaps`, `plankMaps` |
| `js/props/materials/kit.js` | ~208 | 17–217 minus `PROP_NORMAL_FILTER`/`propMaterial` | `mulberry32`, `mkCanvas`, `finish`, `BLUR`, `normalFromHeight`, `blotches`, `hexRGB` |
| `js/props/materials/textures.js` | ~139 | 504–634 | `stencilTexture`, `hazardTexture`, `signTexture`, `glassRoughness` |
| `js/props/materials.js` | ~75 | 1–12, 60–80, 636–685 | all 15 names: 8 generators and `mulberry32` re-exported, 6 kept |

**Six names gain an `export`:** `mkCanvas`, `finish`, `BLUR`, `normalFromHeight`, `blotches`, `hexRGB`. All six are in the kit and all six cross a boundary. `boxBlur` does not and stays private. The eight generators are already exported. That count was taken by listing the private declarations in each moved range against their call sites, which is the method the SoldierGear plan's outcome asked for and the WeaponMaterials split confirmed.

`PROP_NORMAL_FILTER` (60–67) and `propMaterial` (69–80) sit inside the kit's line range but do not move. They are lifted out of it and left in the entry, next to `ironMaterial` and `brassMaterial`, which are their only callers.

**The 90-line commentary on the BLUR table (lines 110–172) moves verbatim into kit.js.** It is the record of why a single shared blur radius had to go — cast iron's 1-texel sand grain at 21% coverage against the plank generator's 1.5-texel woodgrain, with the per-generator numbers and the measurements behind each. validate-coplanar-surfaces.mjs enforces the conclusion; this is the working.

Each banner becomes its module's header comment, except the four sub-banners inside surfaces.js and the four inside textures.js, which stay where they are as in-file section markers — they separate generators from each other, not modules.

### 1.4 What stays in js/props/materials.js

- The 10-line header, verbatim.
- `import * as THREE from 'three';` and `import { applyNormalFilter } from '../render/Materials.js';` — **unchanged, including the path**.
- Three imports from the folder, and re-export lines for the nine names that move.
- `PROP_NORMAL_FILTER` and `propMaterial`, lines 60–80 verbatim.
- `cache`, `once`, `shared`, `ironMaterial`, `brassMaterial`, `scaleUV`, lines 639–685 verbatim.

```js
import * as THREE from 'three';
import { applyNormalFilter } from '../render/Materials.js';
import { castIronMaps, brassMaps, plankMaps } from './materials/surfaces.js';
import { glassRoughness, hazardTexture } from './materials/textures.js';

export { mulberry32 } from './materials/kit.js';
export { enamelMaps, castIronMaps, brassMaps, plankMaps } from './materials/surfaces.js';
export { stencilTexture, hazardTexture, signTexture, glassRoughness } from './materials/textures.js';
```

The entry imports nothing from kit.js — it only forwards `mulberry32`, which js/props/wallbuy.js takes. `enamelMaps`, `stencilTexture` and `signTexture` are forwarded but not used here.

### 1.5 Imports

**New, inside the folder:**

| Module | Imports |
|---|---|
| `kit.js` | `THREE` |
| `surfaces.js` | `{ mulberry32, mkCanvas, finish, normalFromHeight, blotches, hexRGB, BLUR }` from `'./kit.js'` — **and no THREE** |
| `textures.js` | `THREE`; `{ mulberry32, mkCanvas, finish, blotches }` from `'./kit.js'` |

**Changed, outside the folder: none.** All nine importers keep the specifier they have:

| Importer | Takes |
|---|---|
| `js/props/teleporter.js` | `ironMaterial, brassMaterial, hazardTexture, stencilTexture, signTexture` |
| `js/props/powerSwitch.js` | `ironMaterial, brassMaterial, signTexture, stencilTexture` |
| `js/props/mysteryBox.js` | `ironMaterial, shared, stencilTexture, propMaterial` |
| `js/props/perkMachine.js` | `enamelMaps, ironMaterial, brassMaterial, shared, signTexture, stencilTexture, propMaterial` |
| `js/props/door.js` | `ironMaterial, brassMaterial, enamelMaps, signTexture, propMaterial` |
| `js/props/wallbuy.js` | `mulberry32, ironMaterial, signTexture` |
| `js/props/packAPunch.js` | `ironMaterial, brassMaterial, castIronMaps, stencilTexture, signTexture, shared, propMaterial` |
| `js/map/interactables.js` | `signTexture` (as `papSignTexture`) |

None carries a `?v=` token, and none of the new intra-folder specifiers may carry one either: test-audio-modules.mjs walks all of js/ and fails a module imported under two different query strings.

### 1.6 Circular imports: none are created

- `kit.js` imports only `three`, so it cannot be in a cycle.
- `surfaces.js` and `textures.js` each import `kit.js` and nothing else in the folder. They do not import each other.
- No module in the folder imports `../materials.js`. That is the rule the new test enforces, and it is what keeps `cache` the only singleton store: a generator that reached back for `shared` would ask the cache for a value the cache is in the middle of computing.
- `js/render/Materials.js` does not import js/props/, so the entry's `applyNormalFilter` edge stays one-way.

### 1.7 Validators

**This is the section that matters.** `scripts/validate-coplanar-surfaces.mjs` reads the file at line 207 with `readFile` and pins its text in eleven assertions. Three behave differently under the split:

| Pin | Regex | Under the split |
|---|---|---|
| 208 | `import \{ applyNormalFilter \} from '\.\.\/render\/Materials\.js';` — **pins the exact relative path** | **Passes unchanged.** This is why `propMaterial` stays in the entry. Had it moved to kit.js the path would become `'../../render/Materials.js'` and this would fail. |
| 235 | `/^const BLUR = \{$([\s\S]*?)^\};$/m` — **anchored at line start** | **Breaks.** `BLUR` has to gain an `export` to reach surfaces.js, and `export const BLUR = {` does not match `^const BLUR`. The regex becomes `/^(?:export )?const BLUR = \{$…/m`. |
| 207 | `readFile('../js/props/materials.js')` | **Must become `readPropMaterialsSource()`**, or every pin below the kit stops seeing the text it checks. |

The other eight — `subtractGeometric: true`, `t.anisotropy = 16;`, `t.minFilter`, the `boxBlur` application, `function normalFromHeight(hCanvas, strength, blur)`, the no-radius throw, the `normalFromHeight(hgt, …)` call-site sweep and the radii comparisons — are unanchored and keep matching in the joined source. In particular `export function normalFromHeight(…)` still contains `function normalFromHeight(…)`, so that pin needs nothing.

**The tooling lands with step 1, not before it.** `readSplitSource()` scandirs the folder, so `readPropMaterialsSource()` throws until js/props/materials/ exists — the lesson from the SoldierGear split, where a standalone step 0 turned out to be unrunnable. Adding the helper and the first module in one commit gives the same guarantee, because the pins never see a rewired but unsplit tree. The helper is `readSplitSource(new URL('props/', js), 'materials', '.js')`, the same call shape as `readShadersSource()` and `readSoldierGearSource()`.

**Ten validators already build the map end to end,** and the map builds every machine: test-map-modules, test-map-props, test-map-props-modules, validate-barrier-alcoves, validate-coplanar-surfaces, validate-coplanar-geometry, validate-courtyard-spawns, validate-crash-states, validate-enemy-navigation, validate-shot-occlusion. Plus validate-module-syntax.mjs, which walks js/ recursively.

**New: `scripts/test-prop-materials-modules.mjs` (~150 lines):**

- The entry exports exactly the 15 names it exports today, with the right types, and `mkCanvas`, `finish`, `boxBlur`, `BLUR`, `normalFromHeight`, `blotches` and `hexRGB` are **not** among them — they were private before the split and the folder must not widen the API.
- Every module loads, no name is defined in two of them, and each moved name comes from the module it belongs to.
- No module in js/props/materials/ imports js/props/materials.js.
- The import rule: kit.js imports nothing from the folder, surfaces.js and textures.js only ./kit.js, and the entry only the three folder modules — each spelled with the case it has on disk.
- **THE SINGLETONS ARE SINGLETONS.** `shared.iron` read twice is the same object, and so is every other getter; `ironMaterial()` called twice returns two *different* materials that share one texture set, which is what `once()` is for — a per-call `castIronMaps(7)` would look identical and upload eight more textures per machine.
- **Every generator is seeded.** `castIronMaps(7)` called twice produces byte-identical canvases, and `castIronMaps(7)` differs from `castIronMaps(11)`. The file's header promises a machine looks the same in every session, and nothing currently checks it.
- **Every Sobel names its own radius.** A copy of the assertion validate-coplanar-surfaces makes, run against the module text rather than the joined source, so a generator added to surfaces.js without a `BLUR` entry fails in the file that owns it.
- `readPropMaterialsSource()` holds all four files.

It should be run against doctored copies of the tree and shown to fail on each: a surfaces.js that imports the entry, a kit.js that imports ./surfaces.js, an entry that imports `./materials/Kit.js`, an entry that also exports `blotches`, `finish` defined in two modules, a `shared` whose getters stop memoising, a generator that draws from `Math.random` instead of its seed, and a `readPropMaterialsSource()` that reads only the entry.

### 1.8 Steps, ordered by risk against payoff

One commit per step. The order is forced by the chain: nothing can move before the module it imports exists.

| Step | Move | Entry after | Commit |
|---|---|---|---|
| 1 | 17–217 minus the filter pair → `kit.js`; `readPropMaterialsSource()`; two validator edits | ~500 | `[refactor] Split props/materials.js by module, step 1: the shared kit into js/props/materials/kit.js` |
| 2 | 219–502 → `surfaces.js` | ~215 | `[refactor] Split props/materials.js by module, step 2: the four material map generators` |
| 3 | 504–634 → `textures.js` | ~75 | `[refactor] Split props/materials.js by module, step 3: the overlay textures into js/props/materials/textures.js` |
| 4 | — | — | `[test] Cover the prop material module contract, the singletons and the seeds` |

Step 1 leaves the entry at roughly the cap rather than under it, because the kit is 201 lines and the entry gains a folder import block. Step 2 is what clears it.

**How the moves are made.** A throwaway script, not committed, writes each step's files from the 685-line original by the §1.3 ranges and checks the result on disk: every code or comment line lands in exactly one file, and the lines that land nowhere are the banner lines and the blanks between sections. **The only edits inside a moved range are the six added `export` keywords.** Each module is then grepped for prose the move made false — a "this file", "above" or "below" pointing at code that is now elsewhere. That grep caught a real defect in the WeaponMaterials split and is now part of the procedure; the BLUR commentary is 90 lines of cross-referencing prose, so it is the likeliest place in the repo to find another.

**The behavioural proof,** run before step 1 to get a baseline and after every step:

- Call all eight generators at their default seeds and at a second seed, and dump for each returned texture: its key, size, colour space, wrap modes, repeat, anisotropy, min/mag filters, and a SHA-256 of its canvas pixels.
- Dump every getter of `shared`, resolved to the generator output it memoises, with the same hashes — and read each one twice, requiring the same object.
- Dump `ironMaterial()` and `brassMaterial()` with every option branch the callers use, as material parameters plus the identity of each map, so a material that stopped sharing the singleton's textures shows up.
- Dump `PROP_NORMAL_FILTER` and the `BLUR` table verbatim.
- `scaleUV` applied to a known geometry, dumped to six decimals.
- The baseline is run twice and must match itself. After each step the output must match it **byte for byte**.

The generators are seeded through `mulberry32` with no `Math.random` anywhere in the file, so every canvas hashes bit-identical across runs.

**A browser check** after step 3: serve the repo, open the power door and stand in front of a perk machine and the Pack-a-Punch. These are the surfaces the whole file exists for and no validator renders them.

### 1.9 Found while reading

Noted, not touched. Every one predates this plan.

- **The first banner is mislabelled.** "deterministic RNG" heads 201 lines of which the RNG is 8. The split retires the banner, so this fixes itself.
- **`stencilTexture` and `signTexture` have no internal caller.** They are exported for the machines and the Pack-a-Punch sign. They read as dead from inside, the way `bx` did in WeaponParts.js.
- **`enamelMaps` is not in `shared`.** The other three map generators are memoised; the enamel is built per perk machine, because each is a different colour. That is correct and worth a word in the module header, which the split can add without touching the code.
- **`hexRGB` is used once,** at line 228 in `enamelMaps`. It stays in the kit because it is a general helper, but it is the one kit function with a single caller.

### 1.10 Docs and comments

- **README.md** names `js/props/` as one line in the repository layout — "Mystery box, perk machines, Pack-a-Punch, teleporters" — and does not name materials.js, so the layout block needs no change. Its two "67 headless validators" mentions become 68 after step 4.
- **`scripts/lib/game-source.mjs`'s header comment** lists what each `read…Source()` covers, one clause per split. Step 1 adds a clause for the prop materials.
- **Two comments elsewhere name this file** and stay true: `js/render/Materials.js:23` says "the props get one per generator in props/materials.js", and `js/render/WeaponMaterials/canvas.js:35` says "props/materials.js carries a per-generator BLUR table and throws without a radius". Both describe the library, not a line in one file, and both keep pointing at the entry. **Neither may be left describing a file that no longer holds the BLUR table** — if the grep in §1.8 disagrees, the comment gets the folder path, as canvas.js' own essay did.
- **This doc's line 5** links back to `docs/split-weapon-materials-plan.md`. The series links backward only.

---

## 2. The other 6 files, ranked

`js/props/materials.js` left the table when §1 was carried out, so the six below are all that remain. **Rank 1 is next, and it is the last one.** Nothing else has changed since the WeaponMaterials plan's ranking.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/ZombieDetail.js | 682 | Clean function groups: the cloth-geometry helpers, the body-measurement pass (`measureSkin`, `bodyProfile`, `fitToBody`), then `buildVariant` and the attach/detach entry points. It is js/render/SoldierGear.js' opposite number and says so in its own header, so that plan's shape transfers almost unchanged. | Keeps re-exporting whatever moves out. 6 files reference it, and validate-zombie-detail.mjs and validate-zombie-hitboxes.mjs both load it directly — the two validators that name a js/render/ module by path and run it. |
| — | js/render/PostFX.js, js/navmesh.js, js/hud.js | 680, 625, 559 | Marginal, 59–180 lines over. PostFX.js and hud.js are one class each (`PostFX` 52–680 under `QUALITY_PRESETS` at 33, `HUD` 9–559). navmesh.js is mostly `NavGrid` (200–608), with `ColliderHash` (103) and `Heap` (140) above it and two functions below. | A split would likely cost more than it pays. **After ZombieDetail these three and the two below are all that is left, so the question becomes whether the 500-line cap is worth chasing further** — that is a decision, not a plan, and it should be taken deliberately rather than by continuing the series out of momentum. |

### No clean seam: don't force these

- **js/assets-page.js (726 lines).** Full read behind this, recorded in the SoldierGear plan. Its four banners look like seams and are not: 102 of its lines assign to module-level `let` bindings, which an importer cannot reassign, so every one would have to become a property on a shared state object — a rewrite of 102 lines that forfeits the byte-for-byte proof every split in this repo has relied on. The audio dock and the weapon panel also call each other in both directions (`playSound` at line 55 calls `cancelWeaponInteraction` and `renderSelectedWeapon`; the panel calls back at 384, 453, 465, 528 and 618), so splitting on the banner between them is an immediate import cycle. It is a page script, not a library: it builds a `WebGLRenderer`, a scene, two cameras and three lights at module scope and starts a rAF loop at line 256. One page loads it and one validator reads its text, so the payoff is the lowest on the board. The js/main.js split solved the same problem with a shared `app` object, so it is possible — it is a refactor of the page's state model, and should be planned and proved as one.
- **index.html (881 lines).** The net plan's full read stands, and four later reads agree. The head (98 lines) has to stay: unfurlers and crawlers read the meta tags and the JSON-LD without running scripts, and browsers do not load an import map from a file. The markup (546 lines) cannot leave without a build step — HTML has no include, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, and 5 validators pin the markup in 18 places. The SVGs stay, because style/10-menu.css applies the wordmark's filters by fragment and `#skyline .win` cannot reach inside an `<img>`. Only the two inline scripts could move — 233 lines — which leaves 648, still over the cap, and the presentation shell fetched rather than inline would race the dynamic `import('./js/main.js')` it currently precedes.
