# Split plan: js/render/shaders.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 17 files with 5,124 lines over the cap.

This continues `docs/split-main-plan.md`, whose plan is done. The director split in `docs/split-cinematic-director-plan.md` is still half done, with steps 3 and 4 left. The director imports none of the files this plan touches, and this plan touches none of the director's.

This plan covers `js/render/shaders.js`, the largest file. Every plan so far has called it the cleanest seam in the repo, and a full read confirms it (§1.1):
- It holds no code. Its 15 exports are GLSL strings, and the only link between them is `COMMON +`.
- Node can import it and compare every string byte for byte, so the proof is exact: an identical string compiles to an identical program.
- 2 validators pin one check each of its text, and validate-module-syntax finds it by name.

This doc's §2 replaces the main plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `7d537a0` to `b356edf`, one per step in §1.8. js/render/shaders.js is now 14 lines, and the largest file in js/render/shaders/ is volumetric.js at 190. `count_lines.py` now finds 16 files with 4,591 lines over the cap, with js/cinematic-director.js the largest. It went as planned, with these notes:
- **Actual line counts** are within one line of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | js/render/shaders.js | 14 |
  | common | 79 |
  | ao | 112 |
  | volumetric | 190 |
  | ssr | 125 |
  | motion-blur | 60 |
  | bloom | 81 |
  | exposure | 64 |
  | composite | 176 |
  | fxaa | 119 |
  | dof | 42 |

- **How the moves were made.** A throwaway script cut each module from the pre-split file by the ranges in §1.3, and rebuilt js/render/shaders.js for each step. None of it was committed. It checked that:
  - the lines between blocks are blank, and every other line past the header is in exactly one block;
  - each module is its header, its import if it has one, a blank line, and its lines from shaders.js, verbatim and in order;
  - the entry is exactly the text planned for the step.
- **The proof ran as §1.8 describes.**
  - The baseline was taken twice before step 1, and both runs printed the same names, lengths and hashes.
  - After every step, all 15 exports were identical to the baseline, byte for byte, and PostFX.js linked.
  - After every step, `git diff --color-moved=zebra` showed only these as new: file headers and blank lines, the `COMMON` imports, the entry's re-exports and its `COMMON` lines, its header sentence in step 3, and the tooling in step 1.
- **The new checks were tried against mistakes** before step 1 was committed, and each failed as it should: the entry spelling common.js with a capital C, common.js importing the entry, and a backtick in a comment in common.js.
- **The validators number 54 in the loop:** the 53 from before, plus test-shader-modules.mjs. All of them passed before step 1 and after every step.
- **Browser checks.** The step 3 check hasn't been run. It needs a local server.
- **The standing check from §1.7 was added after the split,** in scripts/test-shader-modules.mjs.
  - Every pass but `FXAA_FRAG` must start with `COMMON` exactly once, and `FXAA_FRAG` must not use it.
  - It also runs on a doctored set, with a pass that joins `COMMON` twice, an `FXAA_FRAG` that joins it and an `SSR_FRAG` without it, and must reject all three.
  - It fails when dof.js loses its `COMMON +`. The validator count stays 54.

None of the dead code in §1.9 was touched. The header sentences in §1.10 are done. The optional comment fix in §1.10 was not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
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

Total excess lines: 5124
```

The plan has two parts:
1. `js/render/shaders.js`: ten modules in js/render/shaders/, one per effect, take every string verbatim. The file keeps its header and re-exports all 15 names, so PostFX.js doesn't change.
2. The other 16 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/render/shaders.js: 1,033 lines → js/render/shaders.js (~15) + 10 modules in js/render/shaders/

### 1.1 What's in it

js/render/PostFX.js imports 14 of its names (12–16), and nothing else imports it. It imports nothing.

| Lines | Contents | Used by |
|---|---|---|
| 1–3 | The header | |
| 5–81 | `COMMON`: the precision lines and `vUv`; `PI`, `TAU`; depth (`rawDepth`, `linearizeDepth`, `viewPosFromDepth`, `normalFromDepth`); noise (`hash12`, `hash13`, `ign`); NaN hygiene (`safeVal`, `safeRGB`); colour (`luma`, `linearToSRGB`) | Joined to the front of every pass but `FXAA_FRAG`. Nothing imports it. |
| 83–166 | The ambient occlusion banner; `AO_FRAG`, SAO at half resolution | PostFX `aoPass` (145) |
| 168–191 | `AO_BLUR_FRAG`, the depth-aware separable blur | `aoBlurPass` (152) |
| 193–319 | The volumetrics banner; `VOLUMETRIC_FRAG`, a raymarch against the moon's shadow map, with height fog and 4 practicals | `volPass` (157) |
| 321–379 | `VOL_UPSAMPLE_FRAG`, the joint bilateral upsample that puts the AO and the scatter on the scene colour | `resolvePass` (173) |
| 381–502 | The SSR banner; `SSR_FRAG`, reflections on standing water only, with its copy of the puddle mask in Materials.js | `ssrPass` (191) |
| 504–560 | The motion blur banner; `MOTION_BLUR_FRAG` | `mbPass` (179) |
| 562–639 | The bloom banner; `BLOOM_PREFILTER_FRAG`, `BLOOM_DOWN_FRAG`, `BLOOM_UP_FRAG` | `bloomPre`, `bloomDown`, `bloomUp` (199–206) |
| 641–701 | The auto-exposure banner; `LUM_DOWN_FRAG`, `LUM_ADAPT_FRAG` | `lumDownPass`, `lumAdaptPass` (220–227) |
| 703–875 | The composite banner; `COMPOSITE_FRAG`: sharpening, bloom and lens dirt, exposure, AgX, grade, damage, vignette, grain | `compositePass` (208) |
| 877–993 | The FXAA banner; `FXAA_FRAG`, FXAA 3.11, with its own precision line and no `COMMON` | `fxaaPass` (229) |
| 995–1033 | The depth of field banner; `DOF_FRAG` | `dofPass` (185) |

Blank lines separate the blocks. The file is in no pipeline order: `DOF_FRAG` comes last, after FXAA.

Five facts shape the plan:
- **It's data.**
  - 15 `export const` strings. No functions, no imports, no `let`, and no work at load beyond the `+`.
  - The GLSL functions in `COMMON` are text. A pass reaches them on the GPU, once `COMMON +` has joined the strings. So moving a block can't break a call in JavaScript.
- **The GLSL comments are part of the strings.**
  - Changing one changes what is sent to the GPU, even though the compiler drops it.
  - So every line inside a template literal moves byte for byte, stale comments included (§1.10).
- **Node can compare every string exactly.**
  - The module needs no DOM and no three, so a script can import it before and after and compare all 15 strings.
  - PostFX.js and FullScreenPass.js don't change, so each pass keeps its vertex shader, defines and uniforms. An identical string then compiles to an identical program. That comparison is the proof (§1.8).
- **A GLSL mistake fails only in the browser.**
  - A pass that lost its `COMMON +` still loads in Node. In the browser, three logs a shader error and the pass renders nothing.
  - A backtick inside the GLSL ends the template literal. validate-module-syntax fails on that as a syntax error.
- **Five validators load it without reading it.**
  - test-game-modules, validate-frame-budget, validate-prop-cover, validate-shot-occlusion and validate-zombie-hitboxes load js/game.js.
  - Its graph reaches shaders.js through js/game/graphics.js (9) and PostFX.js.
  - A wrong path or a missing export fails all five at load.

### 1.2 Mechanism

**Verbatim moves into a folder, with the file kept as the entry point.** It's the same shape as js/weapons.js, js/zombies.js and js/player.js: the folder holds the code, and the file re-exports the names.
- Each block keeps its `export const` line, so every moved line stays byte-identical. No export lists are needed.
- Each pass module imports `COMMON` from `./common.js`. fxaa.js imports nothing.
- js/render/shaders.js keeps its header and re-exports all 15 names. PostFX.js's import doesn't change.
- `COMMON` has no importer outside the library. The entry keeps exporting it anyway, so its exports stay exactly what they were. The new test pins that, and the proof compares them.

**Ten modules, one per banner.** The banners are the file's own seams. Each is one effect, and PostFX builds one pass or one chain from each.

| Module | Takes | Why it's a seam |
|---|---|---|
| common.js | `COMMON` | The shared text. It imports nothing, so every pass module can import it. |
| ao.js | `AO_FRAG`, `AO_BLUR_FRAG` | One effect in two passes. The blur carries the AO pass's layout: `.r` is occlusion and `.g` is raw depth. |
| volumetric.js | `VOLUMETRIC_FRAG`, `VOL_UPSAMPLE_FRAG` | The raymarch and the upsample that follows it under the same banner. The upsample also reads the AO layout (`.g` as depth), as it does today. |
| ssr.js | `SSR_FRAG` | One pass, with its copy of Materials.js's puddle mask |
| motion-blur.js | `MOTION_BLUR_FRAG` | One pass |
| bloom.js | The three bloom passes | One chain: prefilter, 13-tap down, tent up |
| exposure.js | `LUM_DOWN_FRAG`, `LUM_ADAPT_FRAG` | One loop: measure this frame, then adapt against the last |
| composite.js | `COMPOSITE_FRAG` | The one pass that tonemaps and grades |
| fxaa.js | `FXAA_FRAG` | Standalone. It doesn't use `COMMON`. |
| dof.js | `DOF_FRAG` | One pass |

Rejected alternatives:
- **Fewer, larger modules by pipeline stage.** The passes before the viewmodel (AO, volumetrics, SSR, motion blur, DOF) come to ~515 lines, over the cap, so they'd need another cut anyway. And a stage name doesn't say which effect is inside.
- **One module per export (15).** It would split the AO pair, the bloom chain and the exposure loop. Each shares one banner and one buffer layout.
- **`VOL_UPSAMPLE_FRAG` on its own, or in ao.js.** PostFX calls it the resolve, and it reads both buffers. But it's named for the volume, and it sits under the volumetrics banner. A module for one 59-line string buys nothing.
- **Motion blur and DOF in one camera module (~100 lines).** They're separate banners and separate passes. dof.js at ~40 lines is no harder to find.
- **Delete shaders.js and import the modules in PostFX.js.** PostFX.js would need ten import lines instead of one. `readSplitSource` needs the entry file, and every split so far kept its entry.
- **Keep `COMMON` in shaders.js.**
  - The pass modules would import the entry, which imports them: a cycle.
  - ES modules would evaluate ao.js before shaders.js had defined `COMMON`. Loading would throw a ReferenceError, and no module in the game's graph would run.
- **Join each pass to only the `COMMON` helpers it uses.** Every string sent to the GPU would change, so there would be no exact proof. That's an optimisation, not a split.
- **Load the GLSL from .glsl files.** With no bundler, that means fetching at runtime, which would make building PostFX asynchronous.

### 1.3 Target modules

Each new file opens with a one-line comment naming its effect, then its import, a blank line, and its lines from shaders.js.

| Module | Takes from shaders.js | ≈ lines |
|---|---|---|
| `js/render/shaders.js` | 1–3, the header, plus one new sentence. Ten re-export lines (§1.4). | 15 |
| `js/render/shaders/common.js` | 5–81 | 80 |
| `js/render/shaders/ao.js` | 83–191 | 112 |
| `js/render/shaders/volumetric.js` | 193–379 | 190 |
| `js/render/shaders/ssr.js` | 381–502 | 125 |
| `js/render/shaders/motion-blur.js` | 504–560 | 60 |
| `js/render/shaders/bloom.js` | 562–639 | 81 |
| `js/render/shaders/exposure.js` | 641–701 | 64 |
| `js/render/shaders/composite.js` | 703–875 | 176 |
| `js/render/shaders/fxaa.js` | 877–993 | 119 |
| `js/render/shaders/dof.js` | 995–1033 | 42 |

Apart from the header and the blank lines between blocks, each line of shaders.js ends up in exactly one of these files. The largest is volumetric.js, at ~190.

Rules for the new lines:
- **File names are lower case,** like the other split folders.
  - Import specifiers must spell them exactly. macOS resolves a wrong case, and Vercel doesn't.
  - The new test checks it (§1.7).
- **No new line may contain a backtick.** validate-module-syntax's guard fails on a comment line that has one.
- **No new comment may quote pinned text** (§1.7). A copy in a comment would keep a pin passing even if the GLSL were gone.

### 1.4 What stays in js/render/shaders.js

It stays the library's entry point. PostFX.js keeps importing it, and nothing else does.

```js
// GLSL library for the deferred post stack.
// Every pass reads the scene depth buffer, so the reconstruction helpers live
// in one place and are string-concatenated into each fragment shader.
// The shaders are in js/render/shaders/, one module per effect. This file re-exports them.
export { COMMON } from './shaders/common.js';
export { AO_FRAG, AO_BLUR_FRAG } from './shaders/ao.js';
export { VOLUMETRIC_FRAG, VOL_UPSAMPLE_FRAG } from './shaders/volumetric.js';
export { SSR_FRAG } from './shaders/ssr.js';
export { MOTION_BLUR_FRAG } from './shaders/motion-blur.js';
export { BLOOM_PREFILTER_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG } from './shaders/bloom.js';
export { LUM_DOWN_FRAG, LUM_ADAPT_FRAG } from './shaders/exposure.js';
export { COMPOSITE_FRAG } from './shaders/composite.js';
export { FXAA_FRAG } from './shaders/fxaa.js';
export { DOF_FRAG } from './shaders/dof.js';
```

The re-exports keep the file's order, so DOF stays last.

**During steps 1–2,** the entry still holds passes that join `COMMON`. An `export … from` line doesn't bind the name in the entry, so these two lines take the place of 5–81 instead:

```js
import { COMMON } from './shaders/common.js';
export { COMMON };
```

Each moved block's re-export line takes the block's place. Step 3 replaces the two lines with the final re-export.

### 1.5 Imports

| File | Imports |
|---|---|
| common.js, fxaa.js | Nothing |
| ao.js, volumetric.js, ssr.js, motion-blur.js, bloom.js, exposure.js, composite.js, dof.js | `COMMON` (./common.js) |
| js/render/shaders.js | Re-exports from all ten |
| js/render/PostFX.js | Unchanged: 14 names from ./shaders.js |

No import outside js/render/shaders.js and the new folder changes.

**Cache tokens.**
- None of these imports has one: not PostFX.js's `./shaders.js`, and not graphics.js's `../render/PostFX.js`.
- The new files get none either, like every split file before them.
- vercel.json serves /js/ with `max-age=0`, so browsers revalidate them on every load.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/render/shaders/, and it mustn't. This folder ships.

**Load order.**
- PostFX.js loads shaders.js, which loads the ten modules in the order of its re-exports.
- common.js comes first, and each pass module imports it. So `COMMON` is defined before any pass joins it.
- The modules do nothing else as they load, so nothing else depends on the order.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No module in js/render/shaders/ imports js/render/shaders.js.** The new test enforces it.
- **common.js imports nothing, and every other module imports only common.js.** So the folder can't have a cycle. The new test enforces this too.
- **Nothing leads back in.** The modules import nothing outside the folder. PostFX.js is the entry's only importer.

A cycle here would be worse than untidy:
- The modules join `COMMON` as they load, so a cycle through common.js could run a join before `COMMON` exists.
- That throws at load. The error stops every module that imports shaders.js, up to js/main.js, so the menu renders but no button works.

### 1.7 Validators

**Text pins (2 files, 2 checks).** These validators read `js/render/shaders.js` by path:

| Validator | Check | Where the pinned text ends up |
|---|---|---|
| validate-performance-invariants (113) | SSR rejects a pixel by height before it rebuilds the normal: `if (low < 0.02) …` within 400 characters of `normalFromDepth(uDepth, vUv, texel, uProjInv)` | ssr.js |
| validate-coplanar-surfaces (285) | `sunVisibility` applies the shadow edge ramp | volumetric.js |

**The shader filter.**
- validate-module-syntax picks the files for its backtick guard with `/shaders\.js$/` (65).
- After the split, that matches only the entry, which holds no GLSL. The guard would pass without checking any shader.
- The main check, `node --check` on every file, would still fail on a backtick that ends a template literal. The guard gives the clearer message.

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readShadersSource()` calls `readSplitSource(new URL('render/', js), 'shaders', '.js')`.
   - It returns js/render/shaders.js, then every .js file under js/render/shaders/ in path order, joined.
   - The file's header comment gains a sentence.
2. **Switch the reads.**
   - validate-performance-invariants swaps `read('js/render/shaders.js')` in its `Promise.all` (16) for `readShadersSource()`. It adds the name to its import from `./lib/game-source.mjs`.
   - validate-coplanar-surfaces swaps its `readFile` of shaders.js (284) for `readShadersSource()`. It adds the name to its import of `readMapSource` (24), and still uses `readFile` for other files.
3. **Widen the filter** to `/shaders([\\/][\w-]+)?\.js$/`.
   - It matches js/render/shaders.js and every file in js/render/shaders/, with either path separator. It still doesn't match Sky.js or PostFX.js.
   - The OK line (79) gains the number of shader files the guard checked.

No pin changes:
- **The SSR pin spans two adjacent lines** (443–444) inside `SSR_FRAG`, bounded at 400 characters. Both move to ssr.js, still adjacent.
- **The edge-ramp pin is one line** (252).
- **The joined text is shaders.js's lines plus headers, imports and re-exports,** none of which may quote a pin. So no pin can start passing by accident.

**Behavioural checks.** None change. The five validators in §1.1 load the new modules through PostFX.js. validate-module-syntax walks js/ recursively, so it parses them.

**No validator splits.** The three are 124, 288 and 79 lines, and the first two cover much more than shaders.js.

**New: `scripts/test-shader-modules.mjs` (~70 lines).** This is the library's counterpart of test-audio-modules. Every check holds at every step. It checks:
- **js/render/shaders.js exports the same 15 names as before the split,** and each is a string.
- **Every module in js/render/shaders/ loads in Node.**
  - Each of its exports is one of the entry's names, with the same value.
  - No name is exported by two modules.
- **No module in js/render/shaders/ imports js/render/shaders.js,** through `assertNoImportOf`.
- **The imports follow one rule:**
  - The entry imports from every module in the folder, and from nothing else. Each specifier spells the file's name as it is on disk, case included.
  - common.js imports nothing. Every other module imports `./common.js` or nothing.
  - The rule also runs on a doctored list in which common.js imports ao.js, and must reject it.
- **`readShadersSource()` holds every file.**

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 54.

**What still isn't caught.**
- **Nothing compiles GLSL in Node.** The proof in §1.8 covers the split, because it compares every string. After the split, a pass that loses its `COMMON +` loads in Node and fails only in the browser.
- **A standing check is possible.**
  - test-shader-modules.mjs could also check that every pass but `FXAA_FRAG` starts with `COMMON`, exactly once.
  - It isn't one of the steps. Whether to add it is John's call.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser check needs a local server. Ask John before starting one, and stop it when the check is done. Keep the DevTools console open. Any error fails the check.

Every move is verbatim and the proof is exact, so every step's risk is low. The order puts the tooling on the smallest move, then takes the rest in two halves of the pipeline:
- **common.js goes first,** because every pass module imports it. Step 1 also adds the helper, the switched reads, the wider filter and the new test, so a mistake in any of them shows up on the smallest move.
- **The passes that read depth go next:** AO, volumetrics, SSR, motion blur and DOF. Both pinned checks move with them.
- **The image passes go last:** bloom, exposure, composite and FXAA. That leaves the entry as re-exports only.

| # | Change | Out of shaders.js | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readShadersSource()`, with the 2 validators switched; the wider filter; `test-shader-modules.mjs`; **common.js** | ~75 | Very low. One string, and the entry still exports it. | None beyond the proof. |
| 2 | **ao.js, volumetric.js, ssr.js, motion-blur.js, dof.js** | ~510 | Low. Five modules, verbatim, and both pinned checks. | None beyond the proof. |
| 3 | **bloom.js, exposure.js, composite.js, fxaa.js**; the entry is left as in §1.4; the entry's header sentence | ~430 | Low. Verbatim. fxaa.js is the one module with no import. | Start solo on Ultra, which turns every pass on. The console shows no shader error, and the Network tab no failed module. The lamps throw shafts, puddles on the floor reflect, a sprint-turn smears, ADS softens the background, and the lamps bloom. Walking from the courtyard into the factory re-exposes over a second or two. Switch quality to Low and back to Ultra mid-match, with no error. |

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script outside the repo, not committed, because a saved copy of every string would break on the next intentional shader change.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Import js/render/shaders.js. It imports nothing, so it needs no hooks.
   - Print each export's name, length and SHA-256. Keep the full strings in a file outside the repo.
2. **After each step, run it again.**
   - The 15 names must match, and every string must be identical to the baseline, byte for byte. The whole string is compared, not only its hash.
   - Also load js/render/PostFX.js through headless-three.mjs, so its import of 14 names links.
3. **Review the diff.**
   - A script cuts each module from the pre-split file by the ranges in §1.3. Check that every line that left shaders.js appears verbatim, in order, in the module meant to hold it.
   - Then run `git diff --color-moved=zebra`. The only new lines should be:
     - file headers and import lines
     - the entry's re-exports, its `COMMON` import during steps 1–2, and its header sentence in step 3
     - the tooling in step 1

If a path can't be checked headless, check it in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **Uniforms no shader reads.** Each is declared but never used, so the compiler drops it:
  - `AO_FRAG`: `uNear`, `uFar`
  - `VOLUMETRIC_FRAG`: `uNear`, `uFar`, `uShadowRadius`
  - `SSR_FRAG`: `uNear`, `uFar`
  - `COMPOSITE_FRAG`: `uDepth`, `uNear`, `uFar`, `uDofStrength`

  PostFX.js still declares all of them. Every frame it sets `uNear` and `uFar` on those four passes (436, 468, 514, 653), and `uDepth` on the composite (640). Removing one means editing both files and changing a string, so it isn't a move.
- **A constant nothing reads.** `PackUpscale` in `VOLUMETRIC_FRAG` (231), next to the unpack constants that are used.

**Comments.** Line 2 says every pass reads the scene depth buffer. The bloom, exposure and FXAA passes don't, and the composite declares `uDepth` without reading it.

### 1.10 Docs and comments

- **js/render/shaders.js's header** gains a sentence in step 3: "The shaders are in js/render/shaders/, one module per effect. This file re-exports them."
- **scripts/lib/game-source.mjs's header** gains a sentence in step 1: "The post stack's GLSL is js/render/shaders.js plus the modules in js/render/shaders/ that it re-exports."
- **scripts/lib/split-modules.mjs's header** gains `test-shader-modules.mjs (js/render/shaders/)` in step 1.
- **README.md needs no change.** Its layout lists `render/` as a whole, as "Shaders, post-FX, camera rig, creature shading", which stays true.
- **Optional, and not a move.**
  - `AO_FRAG`'s comment (131) says "SSR's puddle mask (below)". After step 2, SSR is in ssr.js, not below.
  - The comment is inside the GLSL, so fixing it changes `AO_FRAG`'s string.
  - If John wants it, it goes in its own commit after step 3. The proof's only difference is then that line.
- **Unchanged:**
  - `COMMON`'s note "No backticks in this file" (65–66) lands in common.js. The rule covers every file in the folder, and validate-module-syntax enforces it.
  - The SSR banner's pointer to js/render/Materials.js (386) and the volumetrics comment's pointer to ShadowEdgeFade.js (238) stay true.
  - PostFX.js, RENDERING.md, AGENTS.md, NOTICE.md and llms.txt don't name shaders.js.
- **Leave as is:**
  - The docs/split-*.md plans cite js/render/shaders.js, but they're dated records.
  - README.md still says 27 validators. That was out of date before this plan, and this plan doesn't touch it.

---

## 2. The other 16 files, ranked

None of these files has changed since `docs/split-main-plan.md` §2 was written: no commit from `dfda24f` on touches them. The importer counts and the validators' reads in the notes were checked again, and they hold. So its verdicts stand. The ranks are renumbered without shaders.js.

Each file gets a full read and its own plan before it is split.

**Mid-split:** js/cinematic-director.js (970 lines). Steps 3 and 4 of its plan take it down to a ~60-line boot script.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 2 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. main.js and js/main/ reach `Net` only through the instance, so a mixin split changes nothing there. |
| 3 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's were. The map plan's §1.2 mechanism may fit. | Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The only binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like the map plan's §1.8. |
| 4 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 5 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 6 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. This plan leaves PostFX.js as it is. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
