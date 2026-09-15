# Split plan: js/fx.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 11 files with 2,403 lines over the cap.

This continues `docs/split-net-plan.md`, whose plan is done.

This plan covers `js/fx.js`, the largest file with a clean seam. index.html is larger, at 881 lines, but the net plan's full read confirmed it has none, and nothing has touched it since (§2). Every ranking since the first plan has put fx.js next to net.js: one class, split with `installMixins`. A full read confirms the mechanism (§1.1):

- `FX` is one class. Its methods reach each other only through `this`, and no method spans two of the file's own section headers.
- Its module-level names are two data tables and two texture factories. `BLOOD_DECAL_COLOR` is read by a moved method *and* by js/map/hand-placed.js, so the data needs a module of its own.
- The file already carries its seams as seven `// ====` section headers, written by whoever last worked in it. The split follows them exactly; no group is invented and none is cut at a line number.
- No validator runs `FX`. One validator, validate-performance-invariants.mjs, reads js/fx.js as a single file and pins six checks of its text, so the tooling has to change before the first line moves.

This doc's §2 replaces the net plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `dc13522`, `51f2c87`, `2dd4261` and `a137d53`, one per step in §1.8. js/fx.js went from 842 lines to 154, and the largest file in js/fx/ is particles.js, at 151. `count_lines.py` now finds 10 files with 2,061 lines over the cap, with index.html the largest.  It went as planned, with these notes:

- **Actual line counts** are within two lines of the §1.3 estimates.

  | Module | Lines | Estimate |
  |---|---|---|
  | js/fx.js | 154 | ~155 |
  | surfaces | 49 | ~48 |
  | textures | 66 | ~66 |
  | particles | 151 | ~152 |
  | shots | 88 | ~88 |
  | blasts | 113 | ~113 |
  | decals | 35 | ~36 |
  | screen | 54 | ~54 |
  | drops | 62 | ~62 |
  | update | 140 | ~140 |

  The entry was 613 lines after step 1, 485 after step 2 — under the cap, as §1.8 predicted — 340 after step 3 and 154 after step 4.
- **How the moves were made.** A throwaway script wrote each step's files from the 842-line file by the ranges in §1.3, then checked them on disk. None of it was committed. It checked that the ranges tile the file: every code or comment line outside the import block lands in exactly one file, and the 8 lines that land nowhere (182, 327, 409, 516, 545, 592, 647, 781) are all blank. The only edits inside a moved range are the word `export` added to three lines — `const IMPACTS`, `function tracerTexture` and `function holeTexture` — which were module-private and are now read across a file boundary.
- **The proof ran as §1.8 describes.** The baseline, run twice, matched itself. It prints 5,125 lines (664 KB): every member of `FX.prototype` with its flags and a hash of its source, then 62 acts against a seeded `Math.random`, recording particle pools, recording DOM elements, a hand-advanced clock and a recording `audio.play`, each act dumping every pool emit, every tracer, shell, decal, light, bolt, popup and drop field to six decimal places, the shake state and the DOM writes, timers and audio calls. **After steps 1, 2, 3 and 4 the output matched the baseline byte for byte.**
  - **One change to the proof itself, made before step 1 landed.** Hashing `FX.prototype.constructor` hashes `FX.toString()`, which is the whole class body — so it changed the moment a method moved out, which is the split and not a behaviour change. The proof now cuts the constructor's own text out of the class source and hashes that, so what is compared is the code that actually runs. With that fixed, the constructor's hash is the same before and after all four steps.
- **The name check** is the one in §1.8. It passes at every step, and it was shown to fail on a shots.js with its `rand` import dropped (`js/fx/shots.js uses rand without importing it`) and on an entry with an unused `clamp` left behind (`js/fx.js imports clamp and never uses it`).
- **test-fx-modules.mjs is 108 lines,** rather than ~100. It was run on copies of the tree with the ten mistakes §1.7 lists, and failed on each: a shots.js that imports the entry, a blasts.js that reaches the entry through `js/fx/..`, an install that leaves `FxDecals` out, an entry that imports `./fx/Surfaces.js`, an entry that drops its screen.js import, a surfaces.js that imports ../utils.js, a surfaces.js that exports a class, a second class in drops.js, a `readFxSource()` that reads only js/fx.js, and `shake()` defined in both the entry and screen.js.
  - The dropped-import case fails earlier than §1.7 expected, with `ReferenceError: FxScreen is not defined` when the entry is loaded, rather than at the one-way rule. The rule still names it if the install list is edited to match; the load-time error is the stricter of the two.
  - Its doctored sibling import is `js/fx/update.js imports ./decals.js` and its doctored miscase `./fx/Surfaces.js`, both chosen so the check means something at every step: update.js and surfaces.js exist from step 1, screen.js only from step 2 and shots.js only from step 4.
  - **One thing §1.7 did not foresee:** `importsOf()` matches the `export … from` side too, so during steps 1 and 2 — when the entry both imported `IMPACTS` from ./fx/surfaces.js and re-exported `BLOOD_DECAL_COLOR` from it — the entry's specifier list held that path twice and the rule check reported it twice. The entry's specifiers are deduped, with a comment saying why.
- **The validators number 63,** and all of them passed after every step. The 62 before step 1 passed too.
- **§1.10's line in docs/split-net-plan.md was not added.** The series links backward only — each plan's line 5 names the one before it, and none names the one after — so this doc's line 5 already does the job, and a forward line would be new in the series rather than consistent with it.
- **The proof turned up no bug.** Nothing in §1.9 was touched.
- **Browser checks.** None has been run. The one in §1.8 needs a local server and a played match.

```
11 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
index.html                        881           2
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

Total excess lines: 2403
```

The plan has two parts:

1. `js/fx.js`: `FX` keeps its state — the constructor that builds every pool and ring. Seven groups of methods move verbatim into mixins in js/fx/, and the two data tables and two texture factories move into two more modules there.
2. The other 10 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/fx.js: 842 lines → js/fx.js (~155) + 9 modules in js/fx/

### 1.1 What's in it

| Lines | What |
|---|---|
| 1–6 | Header comment: what the file is, and why particles are pooled |
| 7–10 | Imports: `three`, `clamp`/`rand`/`textTexture` from utils.js, `audio`, four names from render/Particles.js |
| 12–19 | `BLOOD_DECAL_COLOR` and the 7-line comment on why it is that value |
| 21–55 | `IMPACTS`, the five-surface response table, and the 8-line comment on why it is tuned small |
| 57 | `MAX_DECALS = 64` |
| 59 | `export class FX {` |
| 60–181 | `constructor(scene)`: three particle pools, 28 tracers, 26 shells, 64 decals, 5 blast lights + the muzzle light, 14 bolts, 16 popups, shake state, the two DOM elements, seven scratch vectors |
| 183–326 | `// particles`: `spawnParticles`, `impact`, `blood` |
| 328–408 | `// tracers / shells / muzzle`: `tracer`, `shell`, `muzzleFlash` |
| 410–515 | `// explosions / lightning`: `explosion`, `lightning`, `_flashLight` |
| 517–544 | `// decals`: `_decal` |
| 546–591 | `// screen`: `shake`, `damageFlash`, `screenFlash`, `popup`, `clearTransientEffects` |
| 593–646 | `// power-up drops`: `spawnDrop`, `removeDrop` |
| 648–779 | `// update`: `update`, `setViewportHeight`, `getShakeOffset` |
| 780 | `}` |
| 782–842 | `tracerTexture()` and `holeTexture()`, both module-private, both called only by the constructor |

**Nothing crosses a group except through `this`.** Reading every call:

- `impact` and `blood` call `this._decal`; `impact`, `explosion` and `lightning` call `this._flashLight`; `explosion` calls `this.shake`; `update` calls `this.removeDrop`. All five are `this`, which a mixin split leaves untouched — that is the whole point of one class in several files.
- `update` reads every ring the constructor built (`pools`, `tracers`, `shells`, `decals`, `boomLights`, `muzzleLight`, `bolts`, `popups`, `drops`, `trauma`, `shakeT`) and the scratch vectors. All are `this`.
- The only module-level names any method reads are `IMPACTS` (`impact` alone) and `BLOOD_DECAL_COLOR` (`blood` alone).
- `MAX_DECALS`, `tracerTexture` and `holeTexture` are read by the constructor alone, which is staying.

**The external contract, which must not move.** Two importers and one JSDoc type reference:

- `js/game.js:11` — `import { FX } from './fx.js';`
- `js/map/hand-placed.js:9` — `import { BLOOD_DECAL_COLOR } from '../fx.js';`
- `js/render/HellhoundFX.js:27` — `@param {import('../fx.js').FX} fx`, in a comment, so no tool resolves it, and it stays true either way.

Callers also reach past the methods into fields: `js/game.js:164-166` sets `postActive`, `onDamageFlash` and `onScreenFlash`; `js/game/rounds.js:128,224` walks `fx.drops`; `js/game/graphics.js:188` reads `fx.muzzleLight`; `js/game/frame-pacing.js:124` and `js/game/graphics.js:323` call `setViewportHeight`. Every one of those is set in the constructor or installed on the prototype, so all of them survive unchanged.

### 1.2 Mechanism

The same one net.js, game.js, audio.js and weapons.js use: `installMixins(Target, parts)` from js/utils.js:16 copies each part class's prototype descriptors onto `FX.prototype`, and **throws at load if a name is defined twice**. A group moved into the wrong file, or left in both, fails on the first import rather than in the middle of a match.

`FX` has 20 methods and no name is used twice, so the install is a straight copy.

### 1.3 Target modules

Each range moves **verbatim**, in file order, including its section header and its comments. The estimates add a file header, the imports and the class wrapper to each range.

| Module | Class | From js/fx.js | What moves | Est. |
|---|---|---|---|---|
| js/fx/surfaces.js | — | 12–56 | `BLOOD_DECAL_COLOR`, `IMPACTS`, and both comments | ~48 |
| js/fx/textures.js | — | 782–842 | `tracerTexture`, `holeTexture` | ~66 |
| js/fx/particles.js | `FxParticles` | 183–326 | `spawnParticles`, `impact`, `blood` | ~152 |
| js/fx/shots.js | `FxShots` | 328–408 | `tracer`, `shell`, `muzzleFlash` | ~88 |
| js/fx/blasts.js | `FxBlasts` | 410–515 | `explosion`, `lightning`, `_flashLight` | ~113 |
| js/fx/decals.js | `FxDecals` | 517–544 | `_decal` | ~36 |
| js/fx/screen.js | `FxScreen` | 546–591 | `shake`, `damageFlash`, `screenFlash`, `popup`, `clearTransientEffects` | ~54 |
| js/fx/drops.js | `FxDrops` | 593–646 | `spawnDrop`, `removeDrop` | ~62 |
| js/fx/update.js | `FxUpdate` | 648–779 | `update`, `setViewportHeight`, `getShakeOffset` | ~140 |

Two of the nine are not mixins, and that is deliberate:

- **surfaces.js** is this split's `js/net/identity.js`: the names more than one file reads. `IMPACTS` is read by particles.js; `BLOOD_DECAL_COLOR` is read by particles.js *and* re-exported by the entry for js/map/hand-placed.js. It imports nothing, so it can never be the near end of a cycle.
- **textures.js** holds two canvas factories the constructor calls. They are not `FX` methods and never were — making them methods to fit one pattern would change behaviour (both memoise into a module-level `let`, shared across every `FX` ever built).

**decals.js is 36 lines, and stays its own file.** Its one method's only callers are `impact` and `blood`, so folding it into particles.js would also be on a seam. It stays separate because it is the single writer of the decal ring and because validate-performance-invariants.mjs pins the shape of its body: one owner for the pin, named after the thing the pin is about.

### 1.4 What stays in js/fx.js

Lines 1–11, 57–59, 60–181 and 780 — the header, the imports the constructor still needs, `MAX_DECALS`, and `class FX` with its constructor — plus:

```js
export { BLOOD_DECAL_COLOR } from './fx/surfaces.js';
```

so `js/map/hand-placed.js` does not change, and, after the class:

```js
// FX's methods are split by effect across js/fx/. Each file is a class whose
// methods are copied onto FX.prototype here: one `this`, one set of pools for
// every caller. A name defined twice is a split mistake, so it fails at load.
installMixins(FX, [FxParticles, FxShots, FxBlasts, FxDecals, FxScreen, FxDrops, FxUpdate]);
```

The header comment (1–6) gains one sentence, in the shape net.js:6 uses: *"FX's methods are in js/fx/, one file per kind of effect, installed below."*

### 1.5 Imports

**Each new module imports only what its own range reads:**

| Module | Imports |
|---|---|
| surfaces.js | nothing |
| textures.js | `* as THREE from 'three'` |
| particles.js | `{ rand } from '../utils.js'`, `{ BLOOD_DECAL_COLOR, IMPACTS } from './surfaces.js'` |
| shots.js | `{ rand } from '../utils.js'` |
| blasts.js | `{ clamp, rand } from '../utils.js'` |
| decals.js | `{ rand } from '../utils.js'` |
| screen.js | `{ textTexture } from '../utils.js'` |
| drops.js | `* as THREE from 'three'`, `{ textTexture } from '../utils.js'` |
| update.js | `{ clamp, rand } from '../utils.js'`, `{ audio } from '../audio.js'` |

**js/fx.js loses three imports and gains nine.** The constructor uses `THREE`, `ParticlePool`, `puffTexture`, `sparkTexture`, `splatTexture`, `tracerTexture`, `holeTexture` and `MAX_DECALS` — and none of `clamp`, `rand`, `textTexture` or `audio`. So:

- **gone:** `{ clamp, rand, textTexture } from './utils.js'` becomes `{ installMixins } from './utils.js'`; `{ audio } from './audio.js'` is deleted.
- **added:** `{ tracerTexture, holeTexture } from './fx/textures.js'`, the seven mixin classes, and the `BLOOD_DECAL_COLOR` re-export.
- **unchanged:** `three` and the four names from `./render/Particles.js`.

Specifiers are plain relative paths with no `?v=` token, as js/net.js has.

**No caller changes.** `js/game.js` and `js/map/hand-placed.js` import the same two names from the same path.

### 1.6 Circular imports: none are created

Every edge points away from the entry:

- js/fx.js → js/fx/\* (nine), utils.js, audio.js is dropped, render/Particles.js, three
- js/fx/surfaces.js → nothing
- js/fx/textures.js → three
- the seven mixins → utils.js, `./surfaces.js` (particles.js only), audio.js (update.js only), three (drops.js only)

Nothing in js/fx/ imports js/fx.js, so the cycle every caller would otherwise load does not exist. utils.js and audio.js do not import fx.js, and neither does render/Particles.js, so no edge comes back. `js/map/hand-placed.js` reaches `BLOOD_DECAL_COLOR` through js/fx.js → js/fx/surfaces.js, a two-hop path with nothing at the far end.

The one-way rule the test enforces (§1.7): surfaces.js and textures.js import nothing relative, each mixin at most `./surfaces.js` from the folder and never a sibling, and js/fx.js imports every module in the folder.

### 1.7 Validators

62 today, all of which must pass after every step. Three touch this split.

**Must change, before anything moves:**

1. **scripts/lib/game-source.mjs** — add, next to the other nine:

   ```js
   /** js/fx.js, then every .js file under js/fx/ in path order, joined with newlines. */
   export function readFxSource() {
     return readSplitSource(js, 'fx', '.js');
   }
   ```

   and one sentence in the file's header comment, in the shape the other entries have.

2. **scripts/validate-performance-invariants.mjs** — `read('js/fx.js')` at line 14 becomes `readFxSource()`, added to the import at line 9. It pins six checks of fx.js's text, and four of them are in ranges that move:

   | Line | Pin | Lands in |
   |---|---|---|
   | 34 | `update(dt, camera, time) {` + 3,000 chars holds no `new THREE.Vector3(` | update.js |
   | 36 | `clearTransientEffects()` exists | screen.js |
   | 38 | no `setTimeout(() => bl.light.color` | negative, anywhere |
   | 40 | no `for (const d of [...this.drops])` | negative, anywhere |
   | 42 | `this._shakeOffset \|\|` | update.js |
   | 101 | `_decal(…) {` + 500 chars holds no `needsUpdate = true` | decals.js |

   Both windowed pins stay inside their own method after the move: `update`'s body is ~4,700 characters and `_decal`'s ~1,100, and `readSplitSource` sorts by path, so update.js is last in the concatenation with nothing after it.

**Must be added:** **scripts/test-fx-modules.mjs** (~100 lines), modelled line for line on scripts/test-net-modules.mjs, which is the closest case — an entry plus a shared module plus mixins. It asserts:

- js/fx.js exports exactly `['BLOOD_DECAL_COLOR', 'FX']`, the two names it exported before the split;
- no module in js/fx/ imports js/fx.js (`assertNoImportOf`);
- every module but the two shared ones is exactly one class of `FX` methods, and every one of those methods is `===` the function on `FX.prototype` (`assertMethodFilesInstalled`) — nothing in scripts/ runs `FX`, so a class left out of the install list would only fail when the effect is first played;
- surfaces.js and textures.js export no class;
- the imports go one way, and each specifier spells its file as it is on disk — macOS resolves a wrong case and Vercel does not;
- `readFxSource()` holds every fx file (`assertSourceHolds`).

Where net's test has one `SHARED = 'identity.js'`, this one takes `SHARED = ['surfaces.js', 'textures.js']` and its `ruleBreaks()` treats both the same way. Like net's, it must be run against doctored copies of the tree and fail on each: a shots.js that imports the entry, a blasts.js that reaches the entry through `js/fx/..`, an install that leaves `FxDecals` out, an entry that imports `./fx/Surfaces.js`, an entry that drops its screen.js import, a surfaces.js that imports ../utils.js, a surfaces.js that exports a class, a second class in drops.js, a `readFxSource()` that reads only js/fx.js, and a method defined in both the entry and a mixin.

**Unaffected, checked:** validate-ads-recoil.mjs:165, validate-movement-feel.mjs:98 and validate-game-invariants.mjs:184 pin `this.fx.…` inside `readGameSource()`, not fx.js. test-local-player.mjs:44, validate-frame-budget.mjs:270 and validate-zombie-hitboxes.mjs:317 pass a hand-written `fx` stub into their subject and never load the real one.

**A standing behavioural check is not part of this split.** Nothing runs `FX` today, so the split's proof (§1.8) is a throwaway. After the split lands, the net precedent says to keep it: `scripts/test-fx-effects.mjs`, driving a real `FX` against a seeded `Math.random`, a recording `ParticlePool`, recording DOM elements and a hand-advanced clock. That is its own change, with its own commit, after this one.

### 1.8 Steps, ordered by risk against payoff

The entry is under the cap after step 2. Steps 3 and 4 finish the job the section headers already describe.

| Step | Moves | js/fx.js after |
|---|---|---|
| 1 | tooling, then `surfaces.js`, `textures.js`, `update.js` | ~610 |
| 2 | `drops.js`, `screen.js`, `decals.js` | ~485 |
| 3 | `particles.js` | ~342 |
| 4 | `blasts.js`, `shots.js`, the header sentence, README | ~155 |

**Step 1 — tooling, the two shared modules, and the biggest method.** `readFxSource()` and the validator switch go in *first*, in the same commit, because the moment `update()` leaves js/fx.js a validator that reads only that file stops finding it. Then surfaces.js (which the entry re-exports from), textures.js (which the constructor calls), and update.js — 132 lines, the largest single group, and the one with no callers inside the class. test-fx-modules.mjs is added here: the folder exists from this step, so the contract is checked at every later one.

**Step 2 — the three small groups.** drops.js, screen.js and decals.js: 128 lines with one `this` call between them (`update` → `removeDrop`, already across a file boundary after step 1). The entry comes under the cap here.

**Step 3 — particles.** 144 lines, the group with the most reach: it is the only reader of both names in surfaces.js and calls `_decal` and `_flashLight`, which by now live in two other files. Done alone so a `git diff --color-moved` on it is a single block.

**Step 4 — blasts and shots, then the docs.** The two remaining groups, the entry's header sentence, and README's two layout lines (§1.10).

**The proof, at every step.** The same shape as net.js's, because the same thing is true here: no validator runs the class, so only a recording of a real run can show the split changed nothing.

A throwaway script — not committed — that, with headless-three.mjs loaded first:

- seeds `Math.random` with a fixed mulberry32, so every `rand()` in the file is deterministic;
- sets `document.getElementById` to return recording elements (headless-three.mjs's stub has no such method, and `this.vignette`/`this.flashEl` read from it) — in the proof's own file, leaving the shared stub alone;
- replaces `setTimeout`/`clearTimeout` with a hand-advanced clock, and `audio.play` with a recorder;
- wraps `emit`, `update`, `clear` and `setViewportScale` on the three `ParticlePool` instances to record their arguments;
- builds `new FX(new THREE.Scene())`, then prints every member of `FX.prototype` with its flags and a hash of its source;
- then runs a fixed script of acts — `spawnParticles`; `impact` on each of the five surfaces; `blood` big and small; a short `tracer` under the 0.25 m floor and a long one; 30 `shell`s, to wrap the 26-slot ring; `muzzleFlash`; `explosion` at three radii; `lightning` over a 3-point path; `shake`; `damageFlash` and `screenFlash` with `postActive` both ways; `popup`; `spawnDrop` for all four types and `removeDrop`; 70 `_decal` writes through `impact`, to wrap the 64-slot ring; `clearTransientEffects`; then 400 `update(1/60, camera, time)` steps — dumping after each act every pool emit, every tracer/shell/decal/light/bolt/popup/drop field to six decimal places, `trauma`, `shakeT`, `getShakeOffset()`, and the recorded DOM writes, timers and audio calls.

Run twice on the pre-split tree; the two runs must match each other. That output is the baseline. After each of the four steps, the output must match it **byte for byte**.

**A tiling check, also throwaway,** as the net split used: a script that writes each step's files from the 842-line original by the §1.3 ranges and then checks on disk that every code or comment line outside the import block lands in exactly one file, that each file keeps fx.js's line order, and that the text on disk is exactly what the plan asks for.

**A name check, at every step:** for each file in js/fx/ and for js/fx.js, every name it imports appears in its body, and every one of `THREE`, `clamp`, `rand`, `textTexture`, `audio`, `ParticlePool`, `puffTexture`, `sparkTexture`, `splatTexture`, `installMixins`, `IMPACTS`, `BLOOD_DECAL_COLOR`, `MAX_DECALS`, `tracerTexture`, `holeTexture` that its body uses is imported there. A missing import is a `ReferenceError` on the first shell ejected or the first bullet hole — mid-match, not at load. Show the check failing on a shots.js with its `rand` import dropped and on an entry with `clamp` left behind unused.

**At every step:** all 62 validators (63 from step 1) pass, and `git diff --color-moved=zebra` shows as new only the file headers, the imports, the class lines and their closing braces, surfaces.js's and textures.js's export lines, the install line and its comment, and — in step 4 — the entry's header sentence and README's lines.

**Browser check, once, after step 4.** Fire each weapon into concrete, metal, wood and dirt and confirm four different impacts and a hole; kill a zombie for blood and a pool; throw a grenade; trip the electric trap for the bolt; take damage for the vignette; buy a perk for the screen flash; let a Max Ammo drop spin, bob and blink out. None of this is reachable from Node.

### 1.9 Found while reading

Noted, not touched. None of it is in the way of the split, and the repo's rule is that a split moves lines and changes nothing else.

- **`clearTransientEffects()` has no caller.** Nothing in js/ calls it. validate-performance-invariants.mjs:36 pins that it exists, as the teardown path for the pools — so it is pinned dead code, and deleting it would fail a validator. It moves to screen.js as-is.
- **`tracer()` sets `tr.billboard = true` (fx.js:346) and nothing reads it.** `update()` decides to billboard on `camera && t.a`, not on that flag. One dead assignment.
- **`IMPACTS.glass` is unreachable.** js/game/ballistics.js produces `concrete`, `dirt`, `metal` and `wood`; nothing anywhere passes `'glass'` to `impact()`. The row is 5 lines of the table and moves with it.
- **`spawnParticles` is marked back-compatible** in its own JSDoc (fx.js:186-189) and still has 10 callers. It is not going anywhere.

### 1.10 Docs and comments

- **js/fx.js's header comment** gains the one sentence in §1.4.
- **Each new module gets a header comment** saying what it owns and that its class's methods are installed on `FX.prototype` by js/fx.js — the shape js/net/host.js and js/game/combat.js use. surfaces.js's says it holds the names more than one fx file reads, and textures.js's that its two factories memoise module-wide and are called only by the constructor.
- **scripts/lib/game-source.mjs's header** gains a sentence for `readFxSource()`, in the shape of the nine already there.
- **README.md's layout block (272–275)** gains two lines, next to the `net.js` / `net/` pair it already has:

  ```
  fx.js               Effects entry point: the pools, rings and decal ring every effect draws from
  fx/                 Effects by kind: impacts and blood, tracers and brass, blasts, decals, screen, drops, the frame
  ```

- **README.md's validator count** goes from 62 to 63 in both places (276 and 282).
- **docs/split-net-plan.md** gets a line saying this plan continues it, as each plan in this series does for the one before.
- **This doc gets a Status block** when the work is done: the actual line counts against §1.3's estimates, what the proof printed and whether it matched, what the doctored trees proved, and anything that went differently.

---

## 2. The other 10 files, ranked

No commit since `dfda24f` touches any file in this table, so the net plan's importer counts and validator reads still hold, and the only change below is that js/fx.js has left rank 1.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups. WeaponMaterials: the surface generators (`steelSurface`, `woodSurface`, `leatherSurface`, `bakeliteSurface`, `checkerSurface`, `etchSurface`) under `buildLibrary()`. props/materials: the map generators (`enamelMaps`, `castIronMaps`, `brassMaps`, `plankMaps`) under the shared canvas and normal-from-height helpers. SoldierGear: the shape constants, the geometry helpers, `buildWardrobe()`, and the three attach/LOD/detach entry points. | Each keeps re-exporting whatever moves out. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 2 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups. WeaponParts: the geometry cache and primitives, then muzzle devices, then the seven sight builders, then the receiver furniture. ZombieDetail: the cloth-geometry helpers, the body-measurement pass (`measureSkin`, `bodyProfile`, `fitToBody`), then `buildVariant` and the attach/detach entry points. | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 3 | js/assets-page.js | 726 | Many small functions: the audio dock, the weapon grid and filters, the model viewer and its render loop, the fire/reload session. | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 59–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–608), with `ColliderHash` and `Heap` above it. | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).** The net plan's full read stands; `git log` shows nothing has touched the file since the style split, which predates that read. In short:
  - **The head (98 lines) has to stay.** Link unfurlers and crawlers read the meta tags and the JSON-LD without running scripts, and browsers do not load an import map from a file.
  - **The markup (546 lines) can't leave without a build step.** HTML has no include and the repo is served as it is. Building the screens from script changes when elements exist — the bootstrap, the presentation shell and main.js all look them up as they run, scripts/lib/headless-page.mjs builds its fake DOM from all 91 ids in the page, 5 validators pin the markup in 18 places, and the menu would paint late.
  - **The SVGs stay.** style/10-menu.css applies the wordmark's two filters by fragment, which resolves only inside the page, and `#skyline .win` cannot reach inside an `<img>`.
  - **Only the two inline scripts could move,** which leaves ~655 lines — still over the cap — and the presentation shell, fetched rather than inline, would lose its guarantee of running before main.js boots.
