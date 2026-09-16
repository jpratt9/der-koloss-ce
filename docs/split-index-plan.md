# Large-file report and index.html split plan

Status: implemented September 16, 2026. Original counts taken with
`python3 /Users/john/.agents/skills/splitlargefiles/scripts/count_lines.py . --threshold 500`.

```text
5 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                   LINES  SPLIT INTO
-------------------  -------  ----------
index.html               881           2
js/assets-page.js        726           2
js/render/PostFX.js      680           2
js/navmesh.js            625           2
js/hud.js                559           2

Total excess lines: 971
```

The counter's SPLIT INTO column is arithmetic, not an architectural recommendation.
This plan covers the largest offender, index.html. The other four files are the
remaining inventory, not approved implementation work.

## Existing seams and priority

The page contains metadata/import-map/styles, game HUD, main menu, character
screens, cheats, loading, lobby, fullscreen/join dialogs, options, pause, the
touch-device notice, two inline JavaScript modules, and an external menu-background
module. The two executable inline modules are independent responsibilities with
clean extraction seams. Prioritize these by payoff relative to risk:

1. Extract the presentation module: 181 lines, no imports, existing DOM-only
   behavior. It removes most of the movable code without changing the game API.
2. Extract the device/startup module: 37 lines, three import specifiers to adjust.
   Smaller payoff and greater sensitivity because it decides whether to boot the
   game or show the touch-device notice.
3. Leave the remaining HTML intact. It has semantic sections but no native static
   include mechanism in this repository's build-free runtime. Enforcing 500 here
   would require a separate architectural change, not a mechanical extraction.

## Proposed files and contents

| Path | Contents | Estimated lines |
| --- | --- | ---: |
| `js/page/presentation.js` | Entire second inline module, currently lines 694–874: lobby slots/accessibility, field-manual preference, pause stats, current-character marking, copyable lobby code, countdown ring, range fills, pressed states, keyboard focus modality | 185–195 |
| `js/page/boot.js` | Entire first inline module, currently lines 647–683: mobile/tablet branch, gate audio and navigation handlers, conditional desktop import | 40–45 |
| `index.html` | All metadata, JSON-LD, import map, stylesheet links, PeerJS script, complete static DOM, and three external module tags | About 661 |

Both new modules remain below 500 lines. The original deliberately remains an
exception: the two script-tag substitutions alone leave exactly 661 lines before
any explanatory comment edits. This proposal does **not** claim to bring every
file under the cap. Do not compress markup or remove comments to hide the excess.

Keep presentation behavior together at this size; splitting each observer into
its own module adds coordination without helping the line cap. Preserve observer
filters, listener options, scope-local timers, localStorage handling and statement
order. Preserve the device gate's lazy desktop import and audio behavior.

## Entry points, imports and cycles

Replace each inline executable module with an external module tag at the same
position:

- First module: `src="./js/page/boot.js?v=1"`.
- Second module: `src="./js/page/presentation.js?v=1"`.
- Keep the existing `./js/menu-bg.js?v=1` tag after both.

Within `js/page/boot.js`, these are every import-specifier change:

| Existing inline import | Extracted module import |
| --- | --- |
| `./js/device-gate.js` | `../device-gate.js` |
| `./js/site-audio.js?v=6` | `../site-audio.js?v=6` |
| Dynamic `./js/main.js?v=6` | Dynamic `../main.js?v=6` |

The `new Audio('assets/audio/ui.mp3')` string remains unchanged: media URLs resolve
relative to the document, not the JavaScript module. Preserve query versions on
existing dependencies. The Three.js import map and PeerJS script stay in the head.

`presentation.js` has no imports or exports. Neither extracted block currently
exports public names, so no compatibility re-exports are needed. No existing
JavaScript caller changes. The dependency direction remains boot → device gate /
site audio / dynamic main; neither dependency imports boot. Presentation communicates
through the DOM. No circular imports are introduced; do not import either new
module from main.js or tie game startup to presentation initialization.

External files add requests and can change startup timing. Keep module tags
non-async and preserve their order; verify behavior with delayed requests in a
browser rather than assuming the same source order proves identical timing.

## Tests and validators

No dedicated test file currently accompanies either inline script, so there is
no existing test body to move mechanically. The page test harness in
`scripts/lib/headless-page.mjs` constructs elements from index.html and stubs the
main application's dependencies; its existing scenarios do not demonstrate that
these two browser scripts execute correctly.

Keep `scripts/test-main-page.mjs` as the existing application integration suite.
If adding coverage during implementation, place focused behavior checks beside
the existing script tests, split by the extracted responsibility:

- `scripts/test-page-boot.mjs` (estimate 100–180 lines): desktop starts main once;
  mobile/tablet presents the gate without starting main; gate audio play failure
  is handled; modified navigation clicks preserve normal browser behavior.
- `scripts/test-page-presentation.mjs` (estimate 180–300 lines): repeated lobby
  updates produce four slots without observer recursion; reduced motion and
  persisted controls preferences work; pause stats and programmatic option
  changes appear when the associated screens open.

Do not invent tests that merely assert the extracted text exists. Use browser
checks for actual module execution and MutationObserver behavior if the existing
test infrastructure cannot model these accurately.

These existing readers keep reading index.html because all markup stays there:

- `scripts/lib/headless-page.mjs`
- `scripts/test-style-parts.mjs`
- `scripts/test-multiplayer-contracts.mjs`
- `scripts/validate-frame-budget.mjs`
- `scripts/validate-game-invariants.mjs`
- `scripts/validate-movement-feel.mjs`

No import or source-reader changes are needed in those files for this extraction.
`scripts/validate-module-syntax.mjs` should discover the new modules under js;
confirm discovery when implementing. Run the line counter again and report the
remaining HTML exception explicitly.

Browser verification should cover desktop menu startup, touch-device gate, gate
audio/navigation, lobby decoration and countdown, character selection, controls
toggle, option range fills, pause stats, and keyboard/pointer feedback. Confirm
all pre-existing element IDs, DOM order and stylesheet order remain intact.

Before any production deployment, repository guardrails require every validator:

```sh
for f in scripts/*.mjs; do node "$f" || exit 1; done
```

Preserve CSP permissions for embedded model buffers/images. If implementation
extends into spawning, rounds, models or asset loading, verify a normal round and
a scheduled dog round in the browser before deployment as required by AGENTS.md.

## Why not force the remaining HTML below 500?

Moving hidden screens into fetched fragments would make DOM availability depend
on extra requests. main.js and HUD query these elements during startup; the
current headless harness and validators also read the complete static page.
Moving visible content would additionally change the initial render and fallback
behavior. HTML imports, iframes and arbitrary line cuts are not equivalent
substitutes for the current document.

A future static template assembly step could keep authored fragments below 500
lines while generating the complete page. That would require choosing and wiring
a build/development/deployment workflow, and the generated HTML would still
exceed 500 lines. It is outside this minimal split proposal. Flag index.html as
having clean script seams but no clean remaining split under the current runtime.

## Implementation result

Extracted `js/page/boot.js` (37 lines) and `js/page/presentation.js` (181 lines).
`index.html` is 661 lines, retaining the documented exception. An exact comparison
against the original verified that only the two executable script blocks were
replaced and only the three module-relative imports changed in their extracted
bodies. All other HTML is unchanged.

Passed `test-main-page`, `test-style-parts`, `test-multiplayer-contracts`,
`validate-frame-budget`, `validate-game-invariants`, `validate-movement-feel`, and
`validate-module-syntax` (all under `scripts/`, with `.mjs` extensions). Syntax
validation included both new files among 289 modules.

An ad hoc Chrome browser check passed with delayed requests for the new modules:
desktop boot, controls persistence, character selection, range fills, pointer
feedback, repeated lobby decoration, reduced-motion countdown, pause stats, and
mobile gate/audio rejection/navigation. Keyboard checks preserved the existing
desktop scoreboard capture of Tab and confirmed the presentation focus class on
the mobile branch. Browser checks used a temporary script; no test dependency was
added to the repository. No deployment was performed.

Ship verification: added permanent `scripts/test-page-boot.mjs` and
`scripts/test-page-presentation.mjs`, using shared DOM/event fakes in
`scripts/lib/page-module-fakes.mjs`. Media playback, clipboard and module
dependencies are mocked; the tests make no external service calls. All 71
top-level `scripts/*.mjs` tests and validators passed before committing.
