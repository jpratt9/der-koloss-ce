# Remaining large files and navigation split plan

2026-09-16. Planning only. No implementation in this change.

```text
3 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE             LINES  SPLIT INTO
-------------  -------  ----------
index.html         661           2
js/navmesh.js      625           2
js/hud.js          559           2

Total excess lines: 345
```

Source: `python3 /Users/john/.agents/skills/splitlargefiles/scripts/count_lines.py . --threshold 500`.
The scanner's SPLIT INTO column is arithmetic, not a module design.

## Largest file: index.html — retain the static document

Read the current 661-line document. Its seams are metadata/import map/styles,
HUD, menu artwork and controls, character screens, cheats, loading, lobby,
fullscreen and join dialogs, options, pause, and the touch-device notice.
The previous index split already moved executable code to `js/page/boot.js`
and `js/page/presentation.js`; `js/menu-bg.js` is external too.

There is no clean remaining extraction that brings this document below 500
lines while preserving the current build-free static-page contract. Native HTML
does not include local partials. Fetching or constructing screens at runtime
would change DOM availability for boot, HUD construction, presentation observers
and menu handlers, including failure behavior. Build-time partials would require
a new build/deployment contract. Extracting JSON-LD or small SVG fragments alone
would not remove the 161-line excess and can change metadata or filter behavior.

Do not force this split, minify the source, or add a framework for the line cap.
Keep index.html unchanged at 661 lines. No new HTML module paths, imports or test
splits are proposed. Existing page tests remain in place. A future static-template
architecture requires its own plan; it is not part of executing this document.

## Order by risk and payoff

1. **Navigation helper extraction:** the largest eligible JavaScript file has
   two independent classes and shared numeric/geometry definitions that can move
   without changing any NavGrid method. Existing real-map navigation tests give
   substantial behavior coverage. Implement the detailed plan below first.
2. **HUD minimap extraction:** `drawMinimap(g)` is a cohesive approximately
   94-line canvas method. Moving it could leave hud.js around 470 lines. It needs
   a separate review of HUD source consumers and canvas tests before implementation;
   do not implement it under this plan.
3. **index.html:** retain as explained above; no clean split under current constraints.

## Navigation seams and destinations

Keep the complete NavGrid class together. It holds grid construction, links,
queries and A* methods sharing typed arrays and instance state. Extract its
existing supporting definitions instead of introducing mixins or forwarding calls.

| Path | Contents | Estimated lines |
| --- | --- | ---: |
| `js/navmesh.js` | Introductory navigation rationale; imports; entire NavGrid class; WeakMap registry; getNavGrid; navInvalidate; existing public exports | 475–490 |
| `js/navmesh/constants.js` | NAV_RADIUS, NAV_CELL, MAX_LEVELS, BODY_LOW, BODY_HIGH, MAX_DROP, MAX_STEP_UP, NO_LINK, DIRS, DIAG_GUARD with their comments | 40–45 |
| `js/navmesh/colliders.js` | circleHitsBox, blocksEnemy, BUCKET, ColliderHash, including their comments | 65–75 |
| `js/navmesh/heap.js` | Complete Heap class and typed-array/growth rationale | 65–70 |
| `scripts/test-navmesh-modules.mjs` | Public export/dependency checks and focused heap, collision and registry behavior tests | 160–230 |

The current helper definitions occupy roughly 158 lines. Moving only the two
classes would leave too much behind; moving their cohesive constants and geometry
helpers as well provides headroom below 500 without changing NavGrid internals.
Recount actual output files; all new modules and the navigation entry must be
at or below 500 lines.

Preserve function and class bodies verbatim. Add named exports to the supporting
definitions where needed. Keep BUCKET private to colliders.js. Leave every
constant value, direction ordering, comparison and allocation site unchanged.

## Imports and public contract

`js/navmesh.js` currently has no imports. Add:

- From `./navmesh/constants.js`: NAV_RADIUS, NAV_CELL, MAX_LEVELS, MAX_DROP,
  MAX_STEP_UP, NO_LINK, DIRS and DIAG_GUARD.
- From `./navmesh/colliders.js`: circleHitsBox, blocksEnemy and ColliderHash.
- From `./navmesh/heap.js`: Heap.

Re-export the imported NAV_RADIUS and NAV_CELL from the entry. Preserve the
existing final aliases MAX_LEVELS as NAV_MAX_LEVELS, MAX_DROP as NAV_MAX_DROP,
and MAX_STEP_UP as NAV_MAX_STEP_UP. Keep NavGrid, getNavGrid and navInvalidate
declared/exported in the entry. The entry must still export exactly these eight
names; new helper exports are internal module APIs only.

`js/navmesh/colliders.js` imports NAV_RADIUS, BODY_LOW and BODY_HIGH from
`./constants.js`. `constants.js` and `heap.js` have no imports.

The new test imports Node assertions and the navigation/helper modules directly;
it must work without the headless Three.js loader, DOM stubs or a bare `three`
specifier. Navigation is currently independent of Three.js and remains so.

Existing consumers need no import changes:

- `js/map.js`: navInvalidate.
- `js/zombies/manager.js`: getNavGrid.
- `js/zombies/manager-ai.js` and `js/zombies/manager-movement.js`: NAV_RADIUS.
- `scripts/validate-enemy-navigation.mjs`: NavGrid, getNavGrid, NAV_CELL, NAV_RADIUS.
- `scripts/validate-barrier-alcoves.mjs`: NAV_RADIUS.

The source scan found no validator reading navmesh.js as text, so no aggregate
source reader is needed. Preserve the public entry to keep dynamic imports valid.
The dependency graph is entry → helpers/constants, colliders → constants;
neither helper imports the entry or another stateful subsystem. No circular
import is introduced, and the WeakMap remains a single instance in the entry.

## Tests alongside the extracted helpers

The existing 295-line enemy-navigation validator tests real-map connectivity,
routes, door invalidation and actual enemy movement. The 73-line barrier validator
checks a different integration concern. Neither exceeds the cap or consists of
isolated helper tests, so keep both whole and unchanged rather than splitting
their shared map fixtures.

Add `scripts/test-navmesh-modules.mjs` with focused behavior coverage:

- Entry exports exactly the original eight names and numeric values. Loading
  it directly in Node requires no Three.js/DOM setup. Confirm helper imports
  point only to the intended leaf modules with exact filename case.
- Heap overflow grows its typed arrays without losing entries; popping returns
  nodes in priority order, including repeated priorities. Clear and reuse it.
  Do not assert a stable order for equal priorities that the current heap does
  not promise.
- Collider filtering handles shootOk/playerOnly, absent heights, and overlap
  boundaries. Circle/box checks preserve strict contact semantics.
- Spatial-hash lookup covers radius-expanded bucket boundaries; gather appends
  to the caller's array. NavGrid.activeColliders clears that same array before
  reuse. Preserve the current default NAV_RADIUS expansion even for custom
  NavGrid radii; changing this is separate behavior work.
- A small synthetic map proves getNavGrid returns one grid per map and different
  grids for different maps; navInvalidate before first access is safe, and after
  access updates the same cached grid.

Keep the existing real-map validator as the integration proof for A* and enemy
movement, rather than duplicating its large fixtures in the helper test.

## Execution after approval

1. Extract the constants, collider helpers/hash and heap; update entry imports
   and exports in the same change. Do not alter NavGrid method bodies, search
   ordering, budgets, floor sampling, collision filtering or registry ownership.
2. Add the focused helper test and run it along with validate-enemy-navigation
   and validate-barrier-alcoves. Fix extraction regressions without opportunistic
   navigation changes.
3. Run every validator using `for f in scripts/*.mjs; do node "$f" || exit 1; done`.
   Recount files and check the diff for a mechanical move. Preserve the collision
   and particle allocation invariants.
4. Browser-check enemy movement around props and through an opened doorway on
   a normal round, and check a scheduled dog round as a navigation smoke test.
   No deployment is part of this plan. Before any later production deployment,
   rerun the required validator loop and follow AGENTS.md verification rules.

Executing this plan implements only the navigation split and its tests. HUD and
the HTML architecture remain separate work.
