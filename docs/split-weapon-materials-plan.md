# Split plan: js/render/WeaponMaterials.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 8 files with 1,550 lines over the cap.

This continues `docs/split-soldier-gear-plan.md`, whose plan is done.

This plan covers `js/render/WeaponMaterials.js`, the largest file with a clean seam. Two files are larger and both have already been read in full and ruled out — index.html at 881 and js/assets-page.js at 726 (§2). WeaponMaterials.js has been in rank 1 for the last four rankings, and a full read confirms it is the cleanest split left in the repo:

- **It is not a class, and it exports only two names.** `WM` and `matSet`. Eighteen files import one or both, and an entry that keeps both changes none of them.
- **The file already carries its seams as three `// ---` section banners:** canvas helpers, surface generators, material library. The split follows them exactly; no group is invented and none is cut at a line number.
- **The graph between those banners is strictly linear, and every call site was enumerated to prove it.** The canvas helpers call only each other. The six surface generators call the canvas helpers. `buildLibrary()` calls the six generators and **no canvas helper at all** — zero hits for `texture(`, `canvas2d(`, `normalFromHeight(` or `rng(` below line 470. So the chain is canvas → surfaces → library → entry, with no branch and no back-edge.
- **No validator reads the file's text.** The `normalFromHeight` pins in validate-coplanar-surfaces.mjs are on js/props/materials.js, which has a *different* function of the same name that takes an explicit blur radius. So unlike the SoldierGear split, no tooling has to change before the first line moves. Confirmed by grepping all 66 scripts.
- **Nine validators already build the library end to end** by loading js/weapons.js and constructing view-models, so the behaviour is covered from the first commit.

This doc's §2 replaces the SoldierGear plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `50949e2`, `026797e`, `963ce91` and `d3720bb`, one per step in §1.8. js/render/WeaponMaterials.js went from 712 lines to 50, and the largest file in js/render/WeaponMaterials/ is surfaces.js, at 334. `count_lines.py` now finds 7 files with 838 lines over the cap. It went as planned, with these notes:

- **Actual line counts** are within two lines of the §1.3 estimates.

  | Module | Lines | Estimate |
  |---|---|---|
  | js/render/WeaponMaterials.js | 50 | ~50 |
  | surfaces | 334 | ~336 |
  | library | 216 | ~215 |
  | canvas | 119 | ~120 |

  The entry was 598 lines after step 1 and 266 after step 2 — under the cap, as §1.8 predicted — and 50 after step 3.
- **§1.3's count of eleven `export` keywords was right.** Taking it from the private declarations in each moved range rather than by eye, which is the correction the SoldierGear plan asked for, worked: four canvas helpers, six generators, `buildLibrary`. The tiling check afterwards found exactly those eleven declaration lines changed and no others.
- **One comment was rewritten, because the move made it false** — the same class of defect the SoldierGear split hit, caught this time by the grep §1.8 built into the procedure. The essay says "there is no Math.random in this file", which is a claim about the whole library; after the move "this file" is canvas.js. It now names `js/render/WeaponMaterials/`, and the sentence was re-wrapped to fit. That claim is load-bearing: the proof depends on every map hashing bit-identical across runs, which is only true because the generators are seeded. Nothing else in any module pointed at another part of the file; surfaces.js and library.js needed no prose edits at all.
- **How the moves were made.** A throwaway script wrote each step's files from the 712-line file by the §1.3 ranges, then checked them on disk: every code or comment line lands in exactly one file, and the five lines that land nowhere (16, 137, 471, 680, 690) are all blank. Diffing the original against the four files afterwards, exactly 23 non-blank lines are not present verbatim: the eleven `export` declarations, the three rewrapped essay lines, and the nine banner lines that became module headers.
- **The proof ran as §1.8 describes.** The baseline, run twice, matched itself. It prints 123 lines: all 55 keys of `WM` with each material's type, colours, emissive intensity, roughness, metalness, envMapIntensity, opacity, transparency, depth write, blending, tone mapping, side, flat shading and `wmShared`; all 29 distinct textures numbered in first-seen order with a SHA-256 of their canvas pixels, colour space, wrap modes, repeat and anisotropy; both `matSet` variants resolved back to the `WM` key whose object is identical to each slot; and the three legacy aliases. **After steps 1, 2 and 3 the output matched the baseline byte for byte.**
  - `leatherSurface` is the one generator called twice, at lines 481 and 483 with different seeds, so it contributes two distinct texture sets. §1.9 predicted that and the numbering shows it.
- **The name check** — every file imports the names it uses and uses the names it imports — passed at every step. It strips comments first, which this file needs: the essay names `rng(seed)` in prose.
- **test-weapon-materials-modules.mjs is 169 lines,** rather than ~140. It was run on copies of the tree with the eight mistakes §1.7 lists, and failed on each.
  - **The laziness check needed one fix before it worked.** It first loaded its own copy of the module graph with a cache-busting query, so it could count canvases without anything else having touched `WM`. `loadGameModule()` runs its argument through `pathToFileURL`, which percent-escapes the `?`, so the import failed outright. It does not need a second copy: being the first statement in the file that touches the module is enough, because `_lib` is module-private and the proxy is the only thing that can fill it.
  - It also pins two things §1.7 did not state: the PaP and stock sets must share **no** slot, and the 75 map bindings across 55 materials must resolve onto fewer textures than there are bindings. Either would catch a generator that started running per material.
- **The validators number 67,** and all of them passed after every step. The 66 before step 1 passed too.
- **§1.10's doc edits were made:** README.md's two "66 headless validators" mentions are now 67, and the second names the shared material library alongside the geometry cache. game-source.mjs needed nothing, as §1.10 predicted — no check reads this file's text.
- **Nothing in §1.9 was touched.** `texture()`'s unused `aniso` parameter, the legacy aliases and `leatherSurface`'s two calls are all as they were. The suggested grep for whether anything still uses the legacy aliases was not run: it is a separate question from this split, and the proof pins them either way.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a played match.

The table this plan was written against:

```
8 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
index.html                        881           2
js/assets-page.js                 726           2
js/render/WeaponMaterials.js      712           2
js/props/materials.js             685           2
js/render/ZombieDetail.js         682           2
js/render/PostFX.js               680           2
js/navmesh.js                     625           2
js/hud.js                         559           2

Total excess lines: 1550
```

The plan has two parts:

1. `js/render/WeaponMaterials.js`: the entry keeps its 14-line header, the lazy `_lib` cache, the `WM` Proxy and `matSet`. The canvas helpers, the six surface generators and `buildLibrary()` move into three modules in js/render/WeaponMaterials/.
2. The other 7 files, ranked by risk against payoff, then the two files with no clean seam.

---

## 1. js/render/WeaponMaterials.js: 712 lines → js/render/WeaponMaterials.js (~50) + 3 modules in js/render/WeaponMaterials/

### 1.1 What's in it

The procedural PBR material library for first-person weapon view-models. Everything is generated once on a canvas and shared across every gun: there is only ever one visible view-model, but the pick-up box, the cinematic director and the Pack-a-Punch output all build weapons too, so per-weapon texture copies would be pure waste. `WM` is a Proxy over a lazily-built library, so nothing is generated until the first weapon is built.

The file's own banners, with the line ranges a fresh read confirmed:

| Lines | Section | Names |
|---|---|---|
| 1–14 | header comment | the HDR/AgX and UV-space-not-triplanar design notes |
| 15 | import | `THREE` |
| 17–133 | `// canvas helpers` | `rng`, `canvas2d`, `texture`, `normalFromHeight` — all private |
| 134–466 | `// surface generators` | `steelSurface`, `woodSurface`, `leatherSurface`, `bakeliteSurface`, `checkerSurface`, `etchSurface` — all private |
| 467–712 | `// material library (lazy)` | `_lib` (470), `buildLibrary` (472–679, private), `WM` (681–689), `matSet` (691–712) |

The ranges tile the file: the 9 banner lines and the 7 blanks between sections (16, 137, 471, 680, 690, and the two inside the banners) are everything left over.

Five facts from the read that decide the split:

- **`buildLibrary()` uses no canvas helper.** Every call to `texture(`, `canvas2d(`, `normalFromHeight(` and `rng(` is at line 463 or above. The library asks the six generators for finished maps and does nothing else with a canvas. That is what makes the chain linear rather than a diamond.
- **The one apparent back-edge is inside a comment.** `rng(seed)` appears at line 107, which sits in the 64-line essay at 46–109 explaining why this is the one height-field path in the project with no band-limiting blur. It is prose, not a call.
- **`std` is local to `buildLibrary`,** declared at line 488 as `const std = (o) => new THREE.MeshStandardMaterial(o)`. It has 50 call sites and all of them are inside that function, so it moves with it and stays private.
- **`wmShared` is the disposal contract, and it is set in `buildLibrary` at line 676.** `js/weapons/world-display.js` refuses to dispose a material carrying it, and `js/weapons/finishes.js` deliberately clears it when it clones one per weapon. Whatever else moves, every material the library returns has to keep coming back tagged.
- **The entry needs no `THREE` import after the split.** The three `THREE.` uses in the helpers block, the one in the generators (a `THREE.Color` in `woodSurface`) and the seven in the library all leave with their sections. `WM` and `matSet` reference neither.

### 1.2 Mechanism

The shape js/render/SoldierGear.js took last: the entry keeps its state and its public API, and the builder moves out. Here `_lib` is the lazy cache, `WM` is the Proxy that fills it on first access and `matSet` reads through `WM` — those three are what callers touch, and they stay. `buildLibrary()` is the thing that fills the cache, and it goes.

Not a pure re-export entry like js/render/WeaponParts.js: that file had no state. This one's entire reason to exist is that there is exactly one `_lib`.

The folder is `js/render/WeaponMaterials/`, matching `js/render/WeaponParts/`, `js/render/SoldierGear/` and `js/render/HellhoundModel/`.

### 1.3 Target modules

| Module | Lines (est.) | Takes | Exports |
|---|---|---|---|
| `js/render/WeaponMaterials/surfaces.js` | ~336 | 138–466 | `steelSurface`, `woodSurface`, `leatherSurface`, `bakeliteSurface`, `checkerSurface`, `etchSurface` |
| `js/render/WeaponMaterials/library.js` | ~215 | 472–679 | `buildLibrary` |
| `js/render/WeaponMaterials/canvas.js` | ~120 | 20–133 | `rng`, `canvas2d`, `texture`, `normalFromHeight` |
| `js/render/WeaponMaterials.js` | ~50 | 1–15, 470, 681–712 | `WM`, `matSet` |

`WM` and `matSet` are what the file exports today, unchanged.

**Eleven names gain an `export` keyword:** the four canvas helpers, the six surface generators and `buildLibrary`. Every one is module-private today and every one crosses a new boundary. That is the only edit inside a moved range. The SoldierGear plan predicted one such keyword and needed ten; this count was taken by listing the private declarations in each moved range rather than by inspection.

Each banner becomes its module's header comment. The 14-line file header stays on the entry, because both of its design notes — metals wanting a real roughness map under the AgX stack, and view-models being camera-attached so triplanar detail is wrong here — are about the library as a whole.

**The 64-line essay at 46–109 moves verbatim with `normalFromHeight`,** into canvas.js. It is the record of a measurement (castIron's per-texel normal swing, 4.13° to 0.88° at mip 0) and the reasoning that this path is exempt from the blur every other height-field path carries. It must not be paraphrased or trimmed.

### 1.4 What stays in js/render/WeaponMaterials.js

- The 14-line header, verbatim.
- One import: `{ buildLibrary }` from `'./WeaponMaterials/library.js'`.
- `let _lib = null;`
- The `WM` Proxy, lines 681–689 verbatim, with its doc comment.
- `matSet`, lines 691–712 verbatim, with its doc comment.

```js
// Procedural PBR material library for first-person weapon view-models.
// … the 14-line header, unchanged …
import { buildLibrary } from './WeaponMaterials/library.js';

let _lib = null;

/** Lazy, shared material library. `WM.blued`, `WM.wood`, ... */
export const WM = new Proxy({}, { /* unchanged */ });

export function matSet(pap) { /* unchanged */ }
```

The laziness is the point of this arrangement and survives it: `_lib` is still `null` until something reads a key off `WM`, and `buildLibrary` being in another module does not change when it runs. Importing a module does not call it.

### 1.5 Imports

**New, inside the folder:**

| Module | Imports |
|---|---|
| `canvas.js` | `THREE` |
| `surfaces.js` | `THREE`; `{ rng, canvas2d, texture, normalFromHeight }` from `'./canvas.js'` |
| `library.js` | `THREE`; the six generators from `'./surfaces.js'` |

`surfaces.js` needs `THREE` for exactly one line — the `new THREE.Color(light)` pair in `woodSurface`.

**Changed, outside the folder: none.** All 18 importers keep the specifier they have, because `WM` and `matSet` stay in the entry:

| Importer | Takes |
|---|---|
| `js/render/WeaponHands.js`, `js/weapons/rig.js`, `js/weapons/monkey.js` | `WM` |
| `js/render/WeaponParts/muzzles.js`, `sights.js`, `furniture.js` | `WM` |
| `js/weapons/models/` — pistols, smgs, rifles, modern-rifles, shotguns, snipers, lmgs, specials | `WM` |
| `js/weapons/models/kit.js` | `WM`, `matSet` |
| `js/weapons/viewmodel.js` | `matSet` |

None carries a `?v=` token, and none of the new intra-folder specifiers may carry one either: test-audio-modules.mjs walks all of js/ and fails a module imported under two different query strings.

**One rule elsewhere to leave alone.** `scripts/test-weapon-parts-modules.mjs` allows modules in js/render/WeaponParts/ to import `'../WeaponMaterials.js'` and nothing else outside their folder. That specifier still names the entry after this split, so that rule needs no change — and it must not be relaxed to allow `../WeaponMaterials/library.js`, which would let the parts reach past the Proxy.

### 1.6 Circular imports: none are created

- `canvas.js` imports only `three`, so it cannot be in a cycle.
- `surfaces.js` imports `canvas.js`; `library.js` imports `surfaces.js`. The chain is linear and each link is one-way.
- No module in the folder imports `../WeaponMaterials.js`. That is the rule the new test enforces, and it is what keeps `_lib` the only cache: a module that reached back for `WM` would trigger the Proxy from inside the build it is part of.
- The entry imports `library.js` and nothing else.

### 1.7 Validators

**Nothing has to change before the first line moves.** No `read…Source()` helper and no regex names this file — confirmed by grepping all 66 scripts. The `normalFromHeight` assertions in validate-coplanar-surfaces.mjs are on `propSource`, which is js/props/materials.js; that file's `normalFromHeight(hCanvas, strength, blur)` takes a mandatory blur radius and is a different function with the same name. The essay in §1.3 is the record of why this file's version has none.

**Nine validators already build the library end to end** by loading js/weapons.js:

| Validator | What it would catch |
|---|---|
| `validate-weapon-finishes.mjs` | A material binding lost in the move; the PaP finish |
| `validate-weapon-models.mjs`, `validate-weapon-shapes.mjs` | A generator that stopped returning maps |
| `validate-ads-sight-picture.mjs`, `validate-ads-recoil.mjs`, `test-weapon-rig.mjs` | The view-model still building at all |
| `test-weapon-modules.mjs`, `test-weapon-parts-modules.mjs` | The folders that import `WM` still importing it the same way |
| `test-local-player.mjs`, `test-audio-engine.mjs` | The import graph loading |

Plus `validate-module-syntax.mjs`, which walks js/ recursively.

**New: `scripts/test-weapon-materials-modules.mjs` (~140 lines),** modelled on test-soldier-gear-modules.mjs:

- The entry exports exactly `WM` and `matSet`, and `buildLibrary` is *not* among them.
- Every module in js/render/WeaponMaterials/ loads in Node, no name is defined in two of them, and `buildLibrary` comes from library.js.
- No module in js/render/WeaponMaterials/ imports js/render/WeaponMaterials.js.
- The import rule: canvas.js imports nothing from the folder, surfaces.js only ./canvas.js, library.js only ./surfaces.js, and the entry only ./WeaponMaterials/library.js — each spelled with the case it has on disk.
- **THE LIBRARY IS ONE LIBRARY.** `WM.blued` read twice is the same object; every key of `WM` is a material carrying `userData.wmShared === true`; and every slot `matSet(false)` and `matSet(true)` hand back is *identical* to the `WM` entry it names, not a copy. A second `_lib` — the mistake this split could make — passes every other check, and every gun still looks right; `world-display.js` would just start disposing materials another weapon is drawing.
- **IT IS STILL LAZY.** Importing the entry must not build anything: `buildLibrary` is wrapped in a counting spy before the first `WM` access, the module graph is loaded, and the count must be 0 until a key is read and exactly 1 after two reads. This is the property the Proxy exists for, and no other check in the repo would notice it going.

It should be run against doctored copies of the tree and shown to fail on each: a surfaces.js that imports the entry, a library.js that imports ./canvas.js, an entry that imports `./WeaponMaterials/Library.js`, an entry that exports `buildLibrary` as well, `rng` defined in two modules, a `buildLibrary` that stops setting `wmShared`, a `matSet` that clones instead of forwarding, and a `WM` that builds eagerly at import.

The full run is `for f in scripts/*.mjs; do node "$f" || exit 1; done`, and it must pass after every step.

### 1.8 Steps, ordered by risk against payoff

One commit per step. The order is forced by the chain: nothing can move before the module it imports exists.

| Step | Move | Entry after | Commit |
|---|---|---|---|
| 1 | 20–133 → `canvas.js` | ~600 | `[refactor] Split WeaponMaterials.js by module, step 1: the canvas helpers into js/render/WeaponMaterials/` |
| 2 | 138–466 → `surfaces.js` | ~275 (under the cap) | `[refactor] Split WeaponMaterials.js by module, step 2: the six surface generators` |
| 3 | 472–679 → `library.js` | ~50 | `[refactor] Split WeaponMaterials.js by module, step 3: buildLibrary into js/render/WeaponMaterials/library.js` |
| 4 | — | — | `[test] Cover the WeaponMaterials module contract, the one shared library and its laziness` |

**How the moves are made.** A throwaway script, not committed, writes each step's files from the 712-line original by the §1.3 ranges and checks the result on disk: every code or comment line outside the import block lands in exactly one file, and the lines that land nowhere are the 9 banner lines and the blanks between sections. **The only edits inside a moved range are the eleven added `export` keywords.** Each module is then grepped for prose that the move made false — a "this file" or "below" pointing at code that is now elsewhere — which is the defect the SoldierGear split introduced and had to repair.

**The behavioural proof,** run before step 1 to get a baseline and after every step:

- Read every key of `WM` through `Object.keys`, sorted, and dump for each: its material type, its colour and emissive as hex, roughness, metalness, `envMapIntensity`, opacity, transparency, blending, `toneMapped`, and `userData.wmShared`.
- **Number every map (`map`, `normalMap`, `roughnessMap`, `emissiveMap`) in first-seen order across the whole library** and dump the number, plus a SHA-256 of the texture's canvas pixels, its colour space, wrap modes, repeat and anisotropy the first time each is seen. Sharing is the whole point of the file: a generator called twice where it used to be called once renumbers everything downstream.
- Dump `matSet(false)` and `matSet(true)` as slot → the `WM` key whose object is identical to it, so a slot that started returning a copy shows up as `(not in WM)`.
- Dump the legacy aliases (`steel`, `steelDark`, `steelLight`) resolving to the same objects as the keys they alias.
- The baseline is run twice and must match itself. After each step the output must match it **byte for byte**.

The generators are seeded — `rng(seed)`, no `Math.random` anywhere in the file — so every map hashes bit-identical across runs. The file's own essay says so, and the proof depends on it.

**A browser check** after step 3: serve the repo, spin the mystery box twice and Pack-a-Punch a gun. That is the path that builds weapons repeatedly and then disposes them, which is what `wmShared` guards; no validator renders it.

### 1.9 Found while reading

Noted, not touched. Every one predates this plan.

- **`texture()`'s `aniso` parameter defaults to 8 and is never passed.** All 13 call sites take the default. Not dead — it documents the intent — but it reads as configurability that was never used.
- **The legacy aliases at the bottom of `buildLibrary`** (`L.steel = L.blued`, `L.steelDark = L.ironDark`, `L.steelLight = L.machined`) are labelled "kept so older call sites keep working". Whether any call site still uses them is worth a grep, separately from this split. The proof pins them either way.
- **`leatherSurface` is called twice in `buildLibrary`** (lines 481 and 483) with different seeds, which is the one generator that legitimately runs more than once. The proof's map numbering will show two distinct sets, and that is correct.
- **The 64-line essay is longer than three of the functions it sits among.** It is the most valuable comment in the file and moving it into canvas.js puts it next to the only function it is about, which is an improvement the split gets for free.

### 1.10 Docs and comments

- **README.md** names `js/render/` as one line in the repository layout and does not name WeaponMaterials.js, so the layout block needs no change. Its two "66 headless validators" mentions become 67 after step 4.
- **RENDERING.md** does not mention WeaponMaterials.js. No change.
- **`scripts/lib/game-source.mjs`** gains nothing: no check reads this file's text, so it needs no `read…Source()` helper. If one is ever added, the header comment lists what each covers and would need a clause.
- **This doc's line 5** links back to `docs/split-soldier-gear-plan.md`. The series links backward only.
- **Section banners.** The three `// ---` banners disappear with the file; each becomes its module's header comment. The 14-line file header stays on the entry. No text is dropped.

---

## 2. The other 7 files, ranked

`js/render/WeaponMaterials.js` left the table when §1 was carried out, so the seven below are all that remain. **Rank 1 is next.** Nothing else has changed since the SoldierGear plan's ranking.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/props/materials.js | 685 | Clean top-level builder groups: the map generators (`enamelMaps`, `castIronMaps`, `brassMaps`, `plankMaps`) under the shared canvas and normal-from-height helpers. Structurally this file's twin — the same canvas → generators → library shape — so §1's plan should transfer. | Keeps re-exporting whatever moves out. 4 files reference it. **validate-coplanar-surfaces.mjs pins its text in two places**, including the `BLUR` table and the requirement that its `normalFromHeight` refuse a height field with no blur radius, so it needs a `read…Source()` helper before the first line moves — the step that SoldierGear showed cannot stand alone, because readSplitSource() scandirs a folder that does not exist yet. |
| 2 | js/render/ZombieDetail.js | 682 | Clean function groups: the cloth-geometry helpers, the body-measurement pass (`measureSkin`, `bodyProfile`, `fitToBody`), then `buildVariant` and the attach/detach entry points. It is SoldierGear's opposite number and says so in its own header, so that plan's shape transfers almost unchanged — including counting the `export` keywords a private helper needs by listing declarations rather than by eye. | Keeps re-exporting whatever moves out. 6 files reference it, and validate-zombie-detail.mjs and validate-zombie-hitboxes.mjs both load it directly. |
| — | js/render/PostFX.js, js/navmesh.js, js/hud.js | 680, 625, 559 | Marginal, 59–180 lines over. PostFX.js and hud.js are one class each (`PostFX` 52–680 under `QUALITY_PRESETS` at 33, `HUD` 9–559). navmesh.js is mostly `NavGrid` (200–608), with `ColliderHash` (103) and `Heap` (140) above it and two functions below. | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/assets-page.js (726 lines).** Full read behind this, recorded in the SoldierGear plan. Its four banners look like seams and are not: 102 of its lines assign to module-level `let` bindings, which an importer cannot reassign, so every one would have to become a property on a shared state object — a rewrite of 102 lines that forfeits the byte-for-byte proof every split in this repo has relied on. The audio dock and the weapon panel also call each other in both directions (`playSound` at line 55 calls `cancelWeaponInteraction` and `renderSelectedWeapon`; the panel calls back at 384, 453, 465, 528 and 618), so splitting on the banner between them is an immediate import cycle. It is a page script, not a library: it builds a `WebGLRenderer`, a scene, two cameras and three lights at module scope and starts a rAF loop at line 256. One page loads it and one validator reads its text, so the payoff is the lowest on the board. The js/main.js split solved the same problem with a shared `app` object, so it is possible — it is just a refactor of the page's state model, and should be planned and proved as one.
- **index.html (881 lines).** The net plan's full read stands, and three later reads agree. The head (98 lines) has to stay: unfurlers and crawlers read the meta tags and the JSON-LD without running scripts, and browsers do not load an import map from a file. The markup (546 lines) cannot leave without a build step — HTML has no include, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, and 5 validators pin the markup in 18 places. The SVGs stay, because style/10-menu.css applies the wordmark's filters by fragment and `#skyline .win` cannot reach inside an `<img>`. Only the two inline scripts could move — 233 lines — which leaves 648, still over the cap, and the presentation shell fetched rather than inline would race the dynamic `import('./js/main.js')` it currently precedes.
