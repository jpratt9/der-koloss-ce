# Asset Archive split plan

Status: implemented following the explicit execute request. Original plan below;
completed work and verification are recorded at the end.

## Current report

```text
5 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                   LINES  SPLIT INTO
-------------------  -------  ----------
js/assets-page.js        726           2
js/render/PostFX.js      680           2
index.html               661           2
js/navmesh.js            625           2
js/hud.js                559           2

Total excess lines: 751
```

The report's module count is arithmetic. This plan covers the largest file,
`js/assets-page.js`, using three responsibility extractions rather than an
arbitrary two-way cut. All resulting source files should be below 500 lines.

## Boundaries and risk

Read the complete 726-line source. Its responsibilities are model inspection,
archive recording playback, recording catalog construction, and the interactive
weapon panel with filters and fire/reload sessions.

Earlier repository split plans correctly flagged the page as unsuitable for a
mechanical move: shared mutable bindings and calls in both directions cross its
section comments. This proposal requires a small interface refactor. Keep weapon
selection, filters, ammunition, firing and reload timers together; do not turn
all module-level variables into a shared state object.

Implement in this order, by payoff relative to risk:

1. **Model viewer:** substantial independent block. Its external dependencies are
   the requested weapon/finish and commands on its WeaponRig. Keep all camera,
   drag and render-loop state inside one factory closure.
2. **Recording catalog:** independent data and DOM construction once supplied
   a sound-button factory. No selection or timer state needs to cross this seam.
3. **Audio dock:** smaller but necessary to leave comfortable headroom below 500.
   Its callbacks into weapon handling need explicit ordering and regression tests.

The fire/reload session and weapon selection do **not** have a clean mechanical
boundary from one another: pending reload callbacks compare session identity,
tokens and the current selection. Leave those functions together in the entry.

## Destination modules

Estimates include imports, factory declarations, return objects and adapter code.
Recount after implementation; target headroom rather than exactly 500 lines.

| Path | Ownership and moved code | Estimated lines |
| --- | --- | ---: |
| `js/assets-page/viewer.js` | `createWeaponViewer`; renderer, scene, both cameras, lights, pivot, WeaponRig, mount, drag/orientation state, `STAGE_EYE_Y`, `REST_POSE`, `visibleBounds`, `setModel`, pointer listeners, `resizeRenderer`, ResizeObserver and render loop | 155–175 |
| `js/assets-page/catalog.js` | `renderArchiveCatalog`; `titleCase`, `renderGroup`, `voiceSounds`, `EFFECT_GROUPS`, persona/effect iteration and original-music button | 85–100 |
| `js/assets-page/audio-dock.js` | `createAudioDock`, exported `soundUrl`, private `AUDIO_REVISIONS`, `formatTime`, Audio instance, `activeSoundId`, `clearPlayingButtons`, `syncPlayingButtons`, `playSound`, audio/dock listeners, `makeSoundButton`, `showLiveDock` | 115–145 |
| `js/assets-page.js` | Existing public page entry; siteAudio, weapon metadata/filters/selection, `weaponInteractionActive`, ammo/pools, all fire/reload functions and timers, weapon presentation, filter/input listeners and final initialization | 405–450 |

Keep catalog arrays and all captions byte-for-byte. Keep `soundUrl`'s
`../assets/audio/` URLs: Audio resolves them relative to the document, not the
module. Preserve `perk-v4` revision strings.

## Interfaces and state ownership

### Viewer

`createWeaponViewer({ canvas, canvasWrap })` returns:

- `weaponRig`: the existing instance, used by fire, reload and inspect handlers.
- `setModel(id, pap, finish)`: existing implementation, with `finish` explicitly
  supplied by the entry rather than defaulting to an outer selection binding.
- `resetView()`: sets yaw to -0.28, pitch to -0.12 and lastInteraction to 0,
  replacing the reset button's access to those three locals.

Keep the viewport, lighting, bounds filtering, rest-pose update before measuring,
mount hierarchy, finish application order and render-loop delta clamp intact.
Factory invocation starts the same observer and one animation-frame chain.
Do not add module-import side effects or a second render loop.

### Recording catalog

`renderArchiveCatalog({ makeSoundButton })` constructs the same persona/effect
groups and original recording control. It uses a local `$` helper and its own
PERSONAS/LINES imports. `renderGroup`, `voiceSounds`, `titleCase` and the effect
table stay private. No imports from the entry or audio-dock module are needed.

### Audio dock

`createAudioDock({ siteAudio, cancelWeaponInteraction, applyPreviewPap,
isWeaponInteractionActive })` owns its Audio object and active recording ID.
It returns `makeSoundButton`, `syncPlayingButtons`, `showLiveDock`, and
`pauseForWeapon`.

- `cancelWeaponInteraction(message)` calls the existing entry function. Preserve
  its position before the same-recording toggle check in `playSound`.
- `applyPreviewPap(modelPap)` is an entry callback containing the existing
  `previewPap`/`finishMode` assignments, finish-button highlighting, and
  `renderSelectedWeapon()` call, in that order. Invoke only when modelPap is not
  null, at the same point in `playSound` as today.
- `isWeaponInteractionActive()` reads the current entry binding when the Audio
  pause event runs. Do not pass a snapshot boolean.
- `pauseForWeapon()` does exactly `audio.pause()`, clears `activeSoundId`, then
  clears playing buttons. It replaces that existing three-statement sequence in
  `playReloadSequence` and `startFiring`. Set `weaponInteractionActive = true`
  and duck site audio afterward, in their existing positions.
- `showLiveDock` remains responsible for disabling recording controls while
  showing LIVE, clearing duration and resetting the scrub value.

Keep `weaponInteractionActive` in the entry; both the dock callback and weapon
session logic read the same binding. Keep `siteAudio` initialization in the
entry and pass the same instance to the dock. All playback APIs are mocked in
unit tests.

## Initialization and compatibility

The page currently has no exports and no JavaScript importers. Keep
`js/assets-page.js` as its public entry; no re-export facade is necessary.

Retain observable initialization order:

1. Initialize siteAudio and selection defaults.
2. Construct the dock and bind recording controls where that setup occurs now.
3. Construct the viewer where the current renderer block occurs. Destructure its
   `weaponRig` and `setModel` for existing callers.
4. Initialize ammo/session state and bind weapon/filter controls.
5. Render the recording catalog where its current top-level iterations occur.
6. Call `renderClassFilters`, `renderWeaponGrid`, `renderSelectedWeapon` in that order.

Factory setup must not invoke callbacks into uninitialized entry variables. Keep
the selection-related adapters as function declarations, but remember that those
functions still cannot read a later `const` before initialization. The catalog's
button handlers and Audio event listeners should call adapters only on events,
as the current code does.

## Every import and entry reference change

| File | Change |
| --- | --- |
| `js/assets-page.js` | Remove `import * as THREE from 'three'`; remove WeaponRig from `./weapons.js`, keeping WEAPONS/getStats; remove PERSONAS/LINES import; retain `initSiteAudio` from `./site-audio.js?v=6` |
| `js/assets-page.js` | Add `createWeaponViewer` from `./assets-page/viewer.js`, `renderArchiveCatalog` from `./assets-page/catalog.js`, and `createAudioDock, soundUrl` from `./assets-page/audio-dock.js` |
| `js/assets-page/viewer.js` | Import THREE from `three` and WeaponRig from `../weapons.js` |
| `js/assets-page/catalog.js` | Import PERSONAS/LINES from `../personas.js` |
| `js/assets-page/audio-dock.js` | No imports; receives siteAudio and callbacks through its factory |
| `assets/index.html` | Retain the module entry path; increment its current `?v=15` token to `?v=16` when implementing |
| `scripts/validate-perk-drink.mjs` | Import `readAssetsPageSource` from `./lib/game-source.mjs`; replace the direct assets-page.js read with that reader |
| `scripts/lib/game-source.mjs` | Export `readAssetsPageSource()` using the existing `readSplitSource(js, 'assets-page', '.js')`; no new imports |

Source discovery found one executable validator reading this page directly:
`validate-perk-drink.mjs`. It must continue checking both catalog entries and
the revision map after they move to different files. Keep all existing assertions;
do not remove pins merely because the text moved.

The graph is entry → viewer/catalog/dock → existing weapon/persona dependencies.
Naively importing entry functions into the dock would create a circular import;
factory callbacks avoid that cycle. None of the three new modules imports the
entry. Preserve the site-audio version so it remains the shared module instance
used elsewhere on the site.

## Tests alongside responsibilities

There is no existing dedicated Asset Archive unit suite to split. Existing
weapon and perk tests remain where they are. Add focused coverage in the same
top-level scripts convention, each under 500 lines:

| Test | Expected behavior | Estimated lines |
| --- | --- | ---: |
| `scripts/test-assets-viewer.mjs` | Mock renderer/rAF/ResizeObserver; one frame chain; bounds exclude invisible gloves/sprites; model is settled before measuring; explicit finishes, drag clamp and reset behavior | 150–250 |
| `scripts/test-assets-audio-dock.mjs` | Mock media/site audio; recording toggle, play rejection, pause ducking while weapon activity changes, metadata/scrub behavior, cancel/preview callback ordering, pauseForWeapon order, LIVE controls and revised URLs | 150–250 |
| `scripts/test-assets-catalog.mjs` | Expected persona recording IDs and labels, effect groups, original recording button and perk sounds, with button creation mocked | 70–120 |
| `scripts/test-assets-page.mjs` | Mock the new factories/media/timers; filter changes cancel firing, normal/PaP ammo remain distinct, release during auto-reload does not resume fire, stale reload callbacks are ignored, finish/variant transitions and same-recording interactions | 200–350 |

Reuse existing test utilities where they model the behavior accurately. Source
equality alone cannot prove the callback refactor. In particular, freeze expected
behavior from the unsplit page before changing its control flow, and exercise
the actual extracted modules with mocks rather than duplicating their logic.

Run the updated perk validator, module syntax validation and existing relevant
weapon/page tests. Before deployment run every top-level validator as AGENTS.md
requires:

```sh
for f in scripts/*.mjs; do node "$f" || exit 1; done
```

Verify `/assets` in Chrome: initial model framing, model drag/reset, standard/
gold/PaP/diamond finishes, search/class filters, keyboard selection, single and
automatic fire, release/cancel, reload and inspect, recording toggle/scrub,
perk sound URLs, and recording-to-weapon switching. Check reduced motion and a
phone-width viewport. Confirm import requests succeed with the deployed paths.

This split changes archive presentation, not enemy spawning or model loading.
If implementation expands into the latter, AGENTS.md additionally requires a
normal round and scheduled dog round before deployment. Preserve the existing
GLTF-compatible CSP; this plan needs no CSP edits.

## Remaining inventory and scope limit

This plan does not prescribe splits for PostFX, navmesh or HUD without a fresh
full read. `index.html` remains the documented 661-line exception from the
completed index split: enforcing a smaller static document would need a separate
composition/build decision. Do not force that change as part of this work.

## Implementation result

The entry is now 442 lines. Extracted viewer.js (147 lines), catalog.js (72
lines), and audio-dock.js (95 lines) under `js/assets-page/`. All four files are
below 500 lines. The HTML entry token is now v16; the perk validator reads the
entry and its modules through `readAssetsPageSource`, preserving its assertions.

Added all four planned regression suites and a shared isolated harness at
`scripts/lib/assets-page-harness.mjs`. The page behavior assertions were first
run against the original unsplit source, then passed against the extracted
modules. The integration suite uses the actual factory wiring with mocked
renderer, WeaponRig, timers, media and site audio; this exercises the callback
boundaries directly instead of replacing the factories themselves. The focused
catalog suite mocks button creation. No test calls external services.

All 75 top-level `scripts/*.mjs` tests and validators passed. Chrome checks passed
for desktop and phone widths, reduced motion, model drag/reset and framing,
standard/gold/PaP/diamond finishes, inspect, search/class filters, keyboard
selection, semi-automatic and automatic fire, release/reload, recording
toggle/scrub, perk-v4 requests and weapon/recording transitions. All new module
requests succeeded; no page exceptions occurred. Desktop and phone screenshots
were inspected. Browser checks used a temporary Puppeteer script and added no
repository dependency.

The remaining oversized files are PostFX.js (680), index.html (661), navmesh.js
(625), and hud.js (559). No commit, push or deployment was performed by this
execute invocation.
