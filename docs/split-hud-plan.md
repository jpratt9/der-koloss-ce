# Remaining large files and HUD split plan

2026-09-16. Planning only; implementation follows approval.

```text
2 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE          LINES  SPLIT INTO
----------  -------  ----------
index.html      661           2
js/hud.js       559           2

Total excess lines: 220
```

Source: `python3 /Users/john/.agents/skills/splitlargefiles/scripts/count_lines.py . --threshold 500`.
SPLIT INTO is the scanner's arithmetic estimate.

## Largest file: index.html

The current document was reviewed during the previous split plans and remains
unchanged. It contains metadata/import map/styles, HUD, menu artwork and controls,
character screens, cheats, loading, lobby, dialogs, options, pause and the device
notice. Executable scripts already live in external modules.

There is no clean remaining split that removes its 161-line excess while keeping
the build-free static document. Runtime partial loading would change DOM readiness
and failure behavior; static partial assembly would introduce a build step.
Small metadata or SVG extractions would not meet the cap by themselves. Retain
index.html at 661 lines, with no import or test changes. Do not compress markup
or introduce a new architecture just to satisfy the counter.

## Priority and scope

1. Extract the HUD minimap method: a self-contained canvas drawing responsibility
   with no module-level dependencies. It takes the last oversized JavaScript
   file below the cap with a small mechanical change.
2. Retain index.html as the documented exception above.

The HUD also contains DOM updates for points, ammunition, round state, prompts,
perks, health, scoreboards, co-op roster and transient overlays. Keep these
together; no further partition is necessary to reach 500 lines.

## Destination modules

| Path | Contents | Estimated lines |
| --- | --- | ---: |
| `js/hud.js` | Existing imports, DOM lookup helper, constructor, every method except drawMinimap, and one mixin installation | 468–475 |
| `js/hud/minimap.js` | HUDMinimap class containing the complete unchanged drawMinimap(g) method | 98–105 |
| `scripts/test-hud-minimap.mjs` | Public/prototype contract and recording-canvas behavioral checks | 160–250 |

Move the method body, signature and comments verbatim. It only reads
`this.el.minimap`, the supplied game's map and `g.minimapPlayers()`, plus standard
JavaScript globals. The new module needs no imports. Preserve the existing local
bounds, scale and offsets, colors, draw order, marker geometry and allocations.

Extend the existing utils import to `{ clamp, installMixins }`, import
`HUDMinimap` from `./hud/minimap.js`, and call
`installMixins(HUD, [HUDMinimap])` once after the class declaration.
This follows the repository's established class-split pattern without per-frame
wrappers or new instance state.

`js/hud.js` continues to export only HUD. Constructor behavior and
`HUD.prototype.drawMinimap` remain available to every caller. Do not add a public
re-export of HUDMinimap. Recount actual output; both source modules and the new
test must be at or below 500 lines.

## Imports, source consumers and cycles

- `js/hud.js`: extend the existing `./utils.js` import and add
  `./hud/minimap.js` as above. Keep CFG and multiplayerRosterPresentation imports.
- `js/hud/minimap.js`: no imports; it never imports the HUD entry.
- `scripts/test-hud-minimap.mjs`: use Node assertions and the existing
  `scripts/lib/headless-three.mjs` loader for the real HUD entry, which already
  depends on Three.js through utils. Load the minimap class through the same
  loader for prototype identity checks. Supply a recording canvas context
  specifically for behavioral assertions; do not rely on the loader's no-op
  context to prove drawing behavior.
- `js/main/app.js`: keep its HUD import unchanged.
- `js/game/camera-hud.js`: keep its `this.hud.drawMinimap(this)` call and 0.1-second
  refresh interval unchanged.
- `scripts/validate-frame-budget.mjs`: no import or assertion changes. It loads
  the real HUD and checks methods remaining in the entry.
- `scripts/validate-performance-invariants.mjs`: retain the direct hud.js read;
  all its HUD assertions concern methods remaining in that file.
- `scripts/lib/headless-page.mjs`: its HUD fake remains unchanged.

**Required source-boundary adjustment:**
`scripts/test-multiplayer-contracts.mjs` currently slices multiplayerRoster from
its declaration to `drawMinimap(g)`. After extraction that end marker disappears.
Change the end marker to the next remaining method, `scope(on)`, searching after
the roster start. Assert both indices exist and the end is greater than the
start before slicing, so a missing marker cannot silently weaken the existing
`innerHTML` prohibition. Keep that prohibition and all other roster checks.
The file still reads only hud.js; no aggregate-source helper is needed.

Dependency direction is HUD entry → minimap and utils; minimap imports nothing,
and utils does not import HUD. This adds no cycle.

## Tests alongside the moved method

There is no dedicated minimap test to move. The 357-line multiplayer-contracts
test and the performance/frame-budget tests cover multiple concerns; keep them
whole and adjust only the roster slice described above.

Add focused checks in `scripts/test-hud-minimap.mjs`:

- Entry still exports only HUD, and its installed drawMinimap method is the
  minimap class's method. Check exact import casing and absence of a reverse
  import from the minimap to the entry.
- Missing canvas is a no-op. Missing map still clears and paints the opaque
  backing before returning, without calling minimapPlayers.
- Room rectangles use one scale on both axes, with centered offsets. Use a
  non-square canvas fixture and a square room to expose independent-axis scaling.
- Door markers preserve closed/open/power-sealed colors and omit preOpen doors.
- Power, teleporters, Pack-a-Punch and box retain their labels and state colors.
  Check both power states and linked/unlinked teleporters.
- The local player uses negative yaw, draws a facing cone before its arrow, and
  teammates use their lobby color or the down-state red. Record styles at drawing
  time and assert balanced save/restore for each marker.

Use small deterministic game fixtures and a recording context. Assert selected
observable drawing properties rather than copying the entire implementation as
a snapshot. Exercise the installed method on a real HUD prototype so a missing
mixin registration fails the tests too.

## Execution after approval

1. Move drawMinimap intact and install the mixin. Update the multiplayer test's
   roster boundary in the same change.
2. Add the focused canvas tests. Run them with multiplayer-contracts and the
   frame-budget/performance validators; resolve extraction regressions.
3. Run all `scripts/*.mjs` using the repository-required loop:
   `for f in scripts/*.mjs; do node "$f" || exit 1; done`.
4. Check the diff for an unchanged moved method and rescan line counts. Expected
   remaining offender: only index.html at 661 lines.
5. In the browser, start a normal match and inspect the minimap over a bright
   background, rotate/move to confirm the player marker, and open a door to
   confirm its color update. Inspect a controlled teammate/down-state fixture
   with the real canvas renderer; the recording test alone cannot prove the
   visual result. Confirm no module-loading or runtime errors.

No commit or deployment is included. If deployment is requested later, run every
validator beforehand as AGENTS.md requires. This extraction does not touch
spawning, rounds, models or asset loading.
