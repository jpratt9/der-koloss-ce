# Remaining large-file report and markup split plan

September 16, 2026. Recommended exception adopted via
`/execute docs/split-index-markup-plan.md`. Rechecked the line report: `index.html`
remains the sole offender at 661 lines. It remains maintained static HTML, not a
generated artifact. No runtime or build changes are needed for this decision.
The conditional static-composition design below remains an unimplemented option.

Command: `python3 /Users/john/.agents/skills/splitlargefiles/scripts/count_lines.py . --threshold 500`

```text
1 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE          LINES  SPLIT INTO
----------  -------  ----------
index.html      661           2

Total excess lines: 161
```

The report follows the skill counter's defaults: ignored files, vendor directories,
generated files and minified bundles are excluded. SPLIT INTO is arithmetic,
not a recommendation about module boundaries.

## Recommendation and risk/payoff order

1. Retain `index.html` as a documented 661-line exception. There is no clean
   mechanical module extraction left in this file. Its executable JavaScript
   already lives in `js/page/boot.js`, `js/page/presentation.js`, and
   `js/menu-bg.js`, as recorded in the implemented `docs/split-index-plan.md`.
   The remaining inline scripts are JSON-LD and the import map.
2. If maintaining HTML in smaller source files becomes a requirement, use static
   HTML composition at build time, outlined below. This preserves the initial
   DOM but adds a build and deployment responsibility. Its payoff is organizational;
   it does not reduce the delivered document's size or line count.
3. Do not force a runtime split solely to meet the cap. Moving hidden screens to
   fetched fragments or JavaScript templates changes DOM availability and startup
   failure behavior. Boot, main, and presentation currently assume the elements
   exist when their modules execute. HTML has no native static include mechanism
   configured here. Compressing markup would only conceal the excess.

Only one file is over the threshold, so there are no other offending files to rank.

## Existing semantic seams

The complete sections are metadata/styles/imports (lines 1–98), canvas and damage
overlays (99–111), HUD (112–195), main menu (196–325), character selection/detail
(326–363), cheats (364–421), loading (422–434), lobby (435–491), solo fullscreen
and join dialogs (492–519), options (520–594), pause (595–620), and the device gate,
toast and script tags (621–661). These are meaningful markup boundaries, but
extracting them needs a composition mechanism, not import rewrites alone.

## Conditional static-composition design

This is a separate architectural option, not the recommended mechanical refactor.
Keep each complete top-level section intact and preserve byte order when assembling.

| Proposed path | Contents | Estimated lines |
| --- | --- | ---: |
| `templates/index.html` | Document/head, canvas, damage overlays, main menu, loading, device gate, toast, existing module tags; include markers for the sections below | 360–380 |
| `templates/page/hud.html` | Entire HUD, including minimap, damage/down state, scoreboard and counters | 84 |
| `templates/page/setup-screens.html` | Character selection, character detail and cheats/loadout screens | 96 |
| `templates/page/session-screens.html` | Lobby, solo fullscreen preflight and join dialog | 85 |
| `templates/page/settings-screens.html` | Options and pause screens | 101 |
| `scripts/lib/compose-index.mjs` | Pure deterministic assembler with explicit allowed includes; reject missing, duplicate or unresolved markers | 60–100 |
| `scripts/build-index.mjs` | CLI entry that assembles and writes the root document | 20–40 |
| `scripts/test-index-composition.mjs` | Composition behavior and emitted DOM contract checks | 100–180 |

The root `index.html` remains the public URL and contains the complete assembled
document, approximately 661 lines. It becomes a generated artifact; all maintained
template and assembler files stay below 500. This **does not** satisfy a literal
500-line limit on every output file. Do not mark the existing file generated unless
the generator actually owns it.

Put the build CLI behind a direct-invocation guard; importing its helpers must not
write files. The repository runs every `scripts/*.mjs` before deployment, so the
assembler must be deterministic and safe to rerun. Deployment and the local edit
workflow must explicitly regenerate the document before serving it. A committed
generated document plus a stale-output check can retain ordinary static serving;
do not silently depend on developers remembering to assemble after template edits.

## Imports, public entry points and cycles

For the recommended exception: no new modules, imports, re-exports or tests.

For the conditional design, no existing browser import specifier changes. Keep
these tags in the root document in their current order and preserve their versions:

- `./js/page/boot.js?v=1`
- `./js/page/presentation.js?v=1`
- `./js/menu-bg.js?v=1`

Keep PeerJS and the Three.js import map in the head, along with the full metadata,
JSON-LD and ordered stylesheet links. All asset URLs continue resolving relative
to the root document; do not rebase them against template locations. Keep element
IDs, classes, attributes, siblings and order unchanged. There are no exported HTML
names to re-export.

New imports only: `scripts/build-index.mjs` and
`scripts/test-index-composition.mjs` import the pure helper from
`./lib/compose-index.mjs`; the helper uses Node filesystem/URL facilities as needed.
Templates contain include markers, not JavaScript imports. The helper imports
neither CLI nor tests nor browser code, so the design introduces no circular imports.

## Test ownership and validation

There is no monolithic HTML-specific test to split. Keep the already-separated
`test-page-boot.mjs`, `test-page-presentation.mjs`, and `test-main-page.mjs` suites
with their current responsibilities. The new composition test covers only the new
assembler: stable ordering, invalid includes, stale generated output, and retention
of the original DOM contract. During implementation compare the assembled document
with the pre-split document to establish preservation, rather than weakening tests
to accept missing elements.

These existing source readers continue reading the assembled root `index.html`;
their imports and paths do not need to change:

- `scripts/lib/headless-page.mjs`
- `scripts/test-style-parts.mjs`
- `scripts/test-multiplayer-contracts.mjs`
- `scripts/validate-frame-budget.mjs`
- `scripts/validate-game-invariants.mjs`
- `scripts/validate-movement-feel.mjs`

If the architectural option is approved, verify desktop startup, the mobile gate,
character/cheat/options screens, solo preflight, lobby and pause in the browser,
and rerun the counter with the generated output exception reported explicitly.
Before production deployment run the complete repository-required loop:

```sh
for f in scripts/*.mjs; do node "$f" || exit 1; done
```

Preserve CSP permissions, including `data:` and `blob:` in `connect-src` and
`blob:` in `img-src`. This proposal changes no spawning, rounds, models or asset
loading. No builds, tests or deployment were run while preparing this plan.
