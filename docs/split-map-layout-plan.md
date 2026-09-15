# Split plan: js/map-layout.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 13 files with 3,202 lines over the cap.

This continues `docs/split-map-props-plan.md`, whose plan is done.

This plan covers `js/map-layout.js`, the largest file. Every ranking since the first plan has called its seam clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other. A full read confirms the module is clean, but shows that seam isn't enough on its own (§1.1):
- It's pure. It imports nothing, draws no random number and holds no `let`, and Node imports it with no hooks. So the proof can compare every export exactly: each function's text, and every value in every table.
- The two audits are 237 lines, which would leave ~690. They also read the tables through default parameters, so they can't leave unless the tables leave too.
- No validator reads its text. Two pin an importer's import line, and neither import changes.

This doc's §2 replaces the map-props plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `dda0430`, `69bc7c4` and `ef2ed97`, one per step in §1.8. js/map-layout.js went from 925 lines to 17, and the largest file in js/map-layout/ is traversal.js, at 363. `count_lines.py` now finds 12 files with 2,777 lines over the cap, with index.html the largest. It went as planned, with these notes:
- **Actual line counts** are within one line of the §1.3 estimates, because each module's header is three lines rather than two. The entry was 661 lines after step 1 and 308 after step 2.

  | Module | Lines |
  |---|---|
  | js/map-layout.js | 17 |
  | shell | 198 |
  | interactables | 79 |
  | traversal | 363 |
  | audits | 299 |

- **How the moves were made.** A throwaway script wrote each step's files from the 925-line file by the ranges in §1.3, then checked them on disk. None of it was committed. It checked that:
  - the ranges tile the file: every line lands in exactly one module, except the header and the nine blank lines between blocks;
  - each module is its header, its imports, a blank line and its ranges, verbatim, one blank line apart;
  - the entry is exactly the text planned for the step.
- **The proof ran as §1.8 describes.**
  - The baseline, run twice, matched itself. It prints 4,239 lines (94 KB): all 31 exports, with every function's source text and every table walked with exact numbers and its shared objects marked; every function's results on fixed arguments; and the 13 importers linking.
  - After steps 1, 2 and 3, the output matched the baseline byte for byte.
- **The diff review.**
  - The only lines `git diff --color-moved=zebra` showed as new, not moved, were the module headers and imports, the entry's re-exports and temporary imports, its header sentence in step 3, and the tooling in step 1.
  - The name check had a bug at first. It read the spread in `...MAP_DOOR_DEFS` as a property access, so in step 2 it called traversal.js's import unused. Once fixed, it passed on the pre-split file, on step 1 as committed, and after steps 2 and 3.
  - It failed, as it should, on a traversal.js without its import, and on an audits.js without `MAP_ROOMS`, `MAP_WALLBUYS` or `MAP_NAV_LINKS`. Each of those three imports, left out, also made audit-map-egress throw a ReferenceError, as §1.1 said.
- **test-map-layout-modules.mjs is 114 lines,** rather than ~80.
  - It loads the layout before scripts/lib/split-modules.mjs. That file loads headless-three.mjs, which registers the hook that resolves three and stubs the DOM, and the layout has to load without either.
  - Before step 1 was committed, it ran on copies of the tree with six mistakes, and failed on each: a shell.js that imports the entry, an entry that imports `./map-layout/Shell.js`, an interactables.js that imports three, a shell.js that reads `document` as it loads, a dropped re-export of `teleporterPromptState`, and a shell.js that imports interactables.js.
- **The validators number 59,** and all of them passed after every step. The 58 before step 1 passed too.
- **Browser checks.** None has been run. The walk and the two rounds in §1.8 need a local server.

None of the dead code in §1.9 was touched. The header sentences in §1.10 are done. The optional comment changes were not made.

```
13 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
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

Total excess lines: 3202
```

The plan has two parts:
1. `js/map-layout.js`: four modules in js/map-layout/, one per question, take every line verbatim. The file keeps its header and re-exports all 31 names, so none of its importers changes: 13 files in js/ and 8 scripts.
2. The other 12 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/map-layout.js: 925 lines → js/map-layout.js (~17) + 4 modules in js/map-layout/

### 1.1 What's in it

13 files in js/ import it, and none of the imports has a cache token:
- js/map.js (9–12), and five sections in js/map/: shell.js (6), elevation.js (6), doors.js (7), hand-placed.js (10) and interactables.js (14)
- js/map-props/placement.js (6) and js/props/door.js (10)
- js/audio/zones.js (9) and js/audio/occlusion.js (14)
- js/zombies/manager-spawning.js (7), js/game/interactions.js (7) and js/player/local-movement.js (7)

8 scripts use it:
- audit-map-egress (3–26, 22 names), validate-game-invariants (27), validate-coplanar-surfaces (23), validate-movement-feel (12) and validate-wall-overlaps (18) import it directly, with no hooks.
- validate-courtyard-spawns (25), validate-coplanar-geometry (89) and test-map-props (27) load it through `loadGameModule`.

It imports nothing.

| Lines | Contents | Reads | Read by |
|---|---|---|---|
| 1–2 | The header: pure topology, kept free of the DOM and Three.js so CI can import it | | |
| 4–19 | `MAP_ROOMS`: 13 rooms, stacked areas first | | map/shell.js, audio/zones.js |
| 21–44 | `DOOR_FIT`: the jamb's rebate and post, the leaf's inset, the wall's thickness | | props/door.js |
| 46–87 | `cappedWallRuns(runs)`: the runs another run stands on | Its argument | map/shell.js (150) |
| 89–115 | `purchasableDoor`; `MAP_DOOR_DEFS`: 10 doors | `purchasableDoor` | map/doors.js |
| 117–197 | The shell comment; `windowGap`, `doorGap`, `passageGap`; `MAP_WALL_RUNS`: 44 runs | The gap helpers | map/shell.js, audio/occlusion.js |
| 199–237 | `MAP_WALLBUYS` (10), `MAP_PERKS` (4), `INITIAL_MYSTERY_BOX`, `MAP_TELEPORTERS` (3) | | map/interactables.js |
| 239–261 | `MAINFRAME_PLATFORM`, `MAINFRAME_STEPS`, `MAINFRAME_EAST_ENTRY_KEEP_CLEAR`, `FACTORY_CATWALK` | | map/elevation.js; also map/hand-placed.js (the catwalk) and map.js (the keep-clear zone, 98) |
| 263–290 | `PAP_ENERGY_VISUAL`; `papEnergyEnvelope` | `PAP_ENERGY_VISUAL`, as a default | map/interactables.js (the table). Only audit-map-egress calls the function. |
| 292–373 | `stairFlightColliders`; `platformSideBlocksAtFeet` | Their arguments | map/elevation.js (126); player/local-movement.js (20) |
| 375–428 | `auditInteractableApproaches`; `auditKeepClearZone` | Their arguments | map.js's clearance audits (94–111) |
| 430–435 | `teleporterPromptState` | Its argument | game/interactions.js (207) |
| 437–447 | `MAP_RAMPS`: 4 ramps | | map/elevation.js |
| 449–504 | The walkway comment; `WALKWAY_HEADROOM`, `rampWalkway`, `doorWalkway`; `MAP_WALKWAYS` (18) | At load: `MAP_RAMPS`, `MAP_DOOR_DEFS`, `FACTORY_CATWALK` | map-props/placement.js |
| 506–529 | `MAP_OPEN_EXITS` (3), `MAP_STAIR_MOUTHS` (2) | | Nothing outside the file |
| 531–573 | `rampTraversalZones`; `MAP_TRAVERSAL_ZONES` (15) | At load: `MAP_RAMPS`, `MAP_STAIR_MOUTHS`, `MAP_OPEN_EXITS` | map.js (105), map-props/placement.js |
| 575–586 | `MAP_NAV_LINKS`: 10 directed links | | map/doors.js (57) |
| 588–669 | `roomDepthsToPlayers`; `roomsThatCanReachPlayers` | `MAP_NAV_LINKS`, as a default | zombies/manager-spawning.js (63). Only audit-map-egress calls the second. |
| 671–687 | `elevationAwareRiseCandidate` | Its argument | zombies/manager-spawning.js (264) |
| 689–860 | `auditMapStructure` | `MAP_ROOMS`, `MAP_DOOR_DEFS`, `MAP_WALL_RUNS`, `MAP_WALLBUYS`, `MAP_PERKS`, as defaults | map/shell.js (145) |
| 862–925 | `auditMapEgress` | `MAP_ROOMS`, `MAP_DOOR_DEFS`, `MAP_NAV_LINKS`, `MAP_RAMPS`, as defaults | map/doors.js (58) |

Blank lines separate the blocks. The file has no banners, and its order mixes kinds: the raised floors (239–261) sit between the interactables, and two audits (375–428) sit between the stair rules and the teleporter's prompt.

Five facts shape the plan:
- **It's pure, so the proof is exact.**
  - No imports, no `let`, no `Math.random`. Loading it builds tables, and nothing else.
  - Node imports it with no hooks, as five scripts do. So a script can compare every export before and after: each function's source text, and every value in every table.
- **Names reach each other in two ways.**
  - **At load.** Two tables are built from others: `MAP_WALKWAYS` from `MAP_RAMPS`, `MAP_DOOR_DEFS` and `FACTORY_CATWALK`, and `MAP_TRAVERSAL_ZONES` from `MAP_RAMPS`, `MAP_STAIR_MOUTHS` and `MAP_OPEN_EXITS`. A module that builds one needs those names defined when it loads. `MAP_TRAVERSAL_ZONES` holds the very objects in the last two, not copies.
  - **At call, through default parameters.** `auditMapStructure` names five tables, `auditMapEgress` four, the two room walks `MAP_NAV_LINKS`, and `papEnergyEnvelope` `PAP_ENERGY_VISUAL`.
  - The eight private helpers are read only inside the block they sit in. Every other function reads only its arguments.
- **So the ranked seam isn't enough on its own.**
  - Moving only the two big audits takes 237 lines and leaves ~690, over the cap.
  - In a module of their own, the audits would have to import the tables their defaults name. With the tables still in js/map-layout.js, that means importing the entry: a cycle, and against the rule every split has kept.
  - So the tables move out too, into modules the audits can import, and the entry keeps only re-exports.
- **A default fails only when it's used.**
  - A module that forgot to import a table still loads. The function throws only when a caller leaves that argument out.
  - js/map/shell.js calls `auditMapStructure()` with no arguments on every build (145), so the 9 validators that build the map use all five of its defaults.
  - js/map/doors.js passes `auditMapEgress` all four (58), and the spawner passes its own links (63–67). Only audit-map-egress's `auditMapEgress()` (31) uses those defaults.
- **No validator reads its text.**
  - Two pin an importer's text. validate-coplanar-surfaces (78) matches `import { DOOR_FIT } from '../map-layout.js';` in js/props/door.js, and test-split-modules (84) checks that js/map.js imports `./map-layout.js`. Neither import changes.
  - So no `read…Source()` helper is needed.

### 1.2 Mechanism

**Verbatim moves into a folder, with the file kept as the entry point.** It's the same shape as js/zombies.js, js/player.js, js/weapons.js and js/render/shaders.js: the folder holds the code, and the file re-exports the names.
- Each block keeps its `export` line, so every moved line stays byte-identical. Each private helper moves with the block it sits in, and stays unexported.
- A module that reads another module's names imports them from that module, never through js/map-layout.js.
- js/map-layout.js keeps its header and re-exports all 31 names, so no importer changes.

**Four modules, one per question.** Two are named after the js/map/ section that builds from them.

| Module | Takes | Why it's a seam |
|---|---|---|
| shell.js | `MAP_ROOMS`, `DOOR_FIT`, `cappedWallRuns`, `MAP_DOOR_DEFS`, `MAP_WALL_RUNS` | What the walls are. The file's own comment (117) calls this the physical shell, where every gap is a window, a door from `MAP_DOOR_DEFS`, or a passage. js/map/shell.js, js/map/doors.js, js/props/door.js and the two audio modules read these names, and no others from the file. It imports nothing. |
| interactables.js | `MAP_WALLBUYS`, `MAP_PERKS`, `INITIAL_MYSTERY_BOX`, `MAP_TELEPORTERS`, `PAP_ENERGY_VISUAL`, `papEnergyEnvelope`, `teleporterPromptState` | What players buy and use, and where it stands. js/map/interactables.js imports exactly its five tables, and js/game/interactions.js the teleporter's prompt. It imports nothing. |
| traversal.js | `MAINFRAME_PLATFORM`, `MAINFRAME_STEPS`, `MAINFRAME_EAST_ENTRY_KEEP_CLEAR`, `FACTORY_CATWALK`, `stairFlightColliders`, `platformSideBlocksAtFeet`, `MAP_RAMPS`, `MAP_WALKWAYS`, `MAP_OPEN_EXITS`, `MAP_STAIR_MOUTHS`, `MAP_TRAVERSAL_ZONES`, `MAP_NAV_LINKS`, `roomDepthsToPlayers`, `roomsThatCanReachPlayers`, `elevationAwareRiseCandidate` | Where bodies can go: the raised floors and the stairs up to them, the one-way ledges, the volumes that must stay walkable, and the room graph the horde follows. The pieces refer to each other. Every stair link names its ramp, the walkways are built from the ramps and the catwalk, and the rise candidate exists because stacked floors make a room lookup ambiguous. It imports `MAP_DOOR_DEFS` from shell.js, for the doorway walkways. |
| audits.js | `auditInteractableApproaches`, `auditKeepClearZone`, `auditMapStructure`, `auditMapEgress` | The checks that fail the build. It imports the seven tables its defaults name from the other three modules, and nothing imports it but the entry. |

**What stays is the header, a new sentence and four re-export statements.**

What this buys:
- **Every moved line is unchanged.** `git diff --color-moved` shows the moves, and the proof compares every function's text.
- **The imports go one way.** shell.js and interactables.js import nothing, traversal.js imports shell.js, and audits.js imports the other three. No module imports the entry.
- **Nothing changes for callers.** Every importer names the same path and the same names. A re-export binds to the module that defines the name, so there's still one instance of every table.
- **Mistakes fail the validator loop or the new test.**
  - A missing re-export fails every static importer of that name when it links. The new test catches the rest: `MAP_OPEN_EXITS` and `MAP_STAIR_MOUTHS`, which nothing imports, and the names the three scripts load through `loadGameModule`.
  - A missing import in traversal.js throws as soon as anything loads the entry.
  - A missing import in audits.js throws when a default is used. The map build and audit-map-egress use all nine (§1.1).

Rejected alternatives:
- **Only the two audits out,** the seam every ranking named. It leaves ~690 lines, and audits.js would import the tables from the entry that re-exports it (§1.1).
- **The audits left in the entry** (~310 lines). It's under the cap, but the entry would be the only re-export entry that holds code, and the audits would still import from all three modules.
- **The interactables in shell.js** (~275).
  - Every wall buy names its wall run, so they are mounted on the shell.
  - But no reader of the shell reads them, and js/map/interactables.js reads nothing else. A ~78-line module is no harder to find, and its name says where a perk is.
- **The room graph in its own module** (~115), leaving traversal.js at ~250. The graph is the stairs and drops in another form (the table above). Working out why a zombie can't reach the balcony takes the ramps, the ledges and the links together.
- **The raised floors (239–261) left with the tables around them,** in interactables.js or shell.js. They're walkable surfaces: js/map/elevation.js reads them with `MAP_RAMPS`, and `MAP_WALKWAYS` reads `FACTORY_CATWALK` at load, so traversal.js would have to import it back.
- **Tables in one module and functions in another.** The tables built at load would be cut off from their helpers, `papEnergyEnvelope` would import its own table back, and neither name says what's inside.
- **`teleporterPromptState` in js/interaction-rules.js.** It's a prompt rule rather than topology. But the move changes the entry's exports and two importers, which makes it a refactor, not a split.
- **Delete js/map-layout.js and import the modules directly.** 13 files and 8 scripts would change their imports, validate-coplanar-surfaces' pin on js/props/door.js would change with them, and every split so far kept its entry.
- **The modules in js/map/.**
  - `readMapSource()` would pull them into map.js's pins.
  - test-map-modules requires js/map.js to call every function a js/map/ file exports.
  - Every split so far named the folder after its entry.

### 1.3 Target modules

Each new file opens with a comment naming its part of the layout. The comment ends with the entry's rule: no DOM and no Three.js, so CI can import it. Then come its imports, if it has any, a blank line, and its lines from map-layout.js.

| Module | Takes from map-layout.js | Imports | ≈ lines |
|---|---|---|---|
| `js/map-layout.js` | 1–2, the header, plus a sentence. Four re-export statements (§1.4). | | 17 |
| `js/map-layout/shell.js` | 4–197 | Nothing | 197 |
| `js/map-layout/interactables.js` | 199–237, 263–290, 430–435 | Nothing | 78 |
| `js/map-layout/traversal.js` | 239–261, 292–373, 437–687 | `MAP_DOOR_DEFS` (./shell.js) | 362 |
| `js/map-layout/audits.js` | 375–428, 689–925 | `MAP_ROOMS`, `MAP_DOOR_DEFS`, `MAP_WALL_RUNS` (./shell.js); `MAP_WALLBUYS`, `MAP_PERKS` (./interactables.js); `MAP_RAMPS`, `MAP_NAV_LINKS` (./traversal.js) | 298 |

Apart from line 3 and the blank lines between blocks (198, 238, 262, 291, 374, 429, 436 and 688), each line of map-layout.js ends up in exactly one of these files. Within a module, the blocks keep the file's order, one blank line apart. The largest file is traversal.js, at ~362.

Rules for the new lines:
- **File names are lower case,** like the other split folders, and the folder is named after its entry. Import specifiers must spell both exactly: macOS resolves a wrong case, and Vercel doesn't. The new test checks this (§1.7).
- **traversal.js keeps the file's order, and has to.** `MAP_RAMPS` and `FACTORY_CATWALK` come before `MAP_WALKWAYS`, and `MAP_OPEN_EXITS` and `MAP_STAIR_MOUTHS` come before `MAP_TRAVERSAL_ZONES`. Reading a `const` above its line throws.
- **An import names only what its module reads.** The proof's name check covers it (§1.8).

### 1.4 What stays in js/map-layout.js

After step 3:

```js
// Pure map topology shared by the runtime and deterministic route checks.
// Keep this module free of DOM/Three.js dependencies so CI can import it.
// The tables and checks are in js/map-layout/, one module per question, under
// the same rule. This file re-exports them.
export { MAP_ROOMS, DOOR_FIT, cappedWallRuns, MAP_DOOR_DEFS, MAP_WALL_RUNS } from './map-layout/shell.js';
export {
  MAP_WALLBUYS, MAP_PERKS, INITIAL_MYSTERY_BOX, MAP_TELEPORTERS, PAP_ENERGY_VISUAL, papEnergyEnvelope,
  teleporterPromptState,
} from './map-layout/interactables.js';
export {
  MAINFRAME_PLATFORM, MAINFRAME_STEPS, MAINFRAME_EAST_ENTRY_KEEP_CLEAR, FACTORY_CATWALK,
  stairFlightColliders, platformSideBlocksAtFeet, MAP_RAMPS, MAP_WALKWAYS, MAP_OPEN_EXITS, MAP_STAIR_MOUTHS,
  MAP_TRAVERSAL_ZONES, MAP_NAV_LINKS, roomDepthsToPlayers, roomsThatCanReachPlayers, elevationAwareRiseCandidate,
} from './map-layout/traversal.js';
export {
  auditInteractableApproaches, auditKeepClearZone, auditMapStructure, auditMapEgress,
} from './map-layout/audits.js';
```

Each statement lists its module's names in the file's order. The file still exports exactly its 31 names.

**During steps 1–2,** the entry still holds code that reads names that have moved. An `export … from` line doesn't bind the name in the entry. So an `import` line from the same module sits above the re-exports until that code leaves.

| After step | The entry also imports | For |
|---|---|---|
| 1 | `MAP_ROOMS`, `MAP_DOOR_DEFS`, `MAP_WALL_RUNS` (./map-layout/shell.js); `MAP_WALLBUYS`, `MAP_PERKS` (./map-layout/interactables.js) | `MAP_WALKWAYS` and the two big audits |
| 2 | The same five, plus `MAP_RAMPS` and `MAP_NAV_LINKS` (./map-layout/traversal.js) | The two big audits. These are exactly the names audits.js will import. |

Importing a name and re-exporting it from the same module in one file is valid. The import binds it locally, and the re-export binds nothing, so they don't clash. Step 3 deletes the import lines.

**No caller changes:**
- the 13 files in js/ listed in §1.1, and through them js/game.js, js/audio.js, the cinematic director and the page script
- the 8 scripts listed in §1.1

### 1.5 Imports

| File | Imports |
|---|---|
| js/map-layout/shell.js, js/map-layout/interactables.js | Nothing |
| js/map-layout/traversal.js | `MAP_DOOR_DEFS` (./shell.js) |
| js/map-layout/audits.js | `MAP_ROOMS`, `MAP_DOOR_DEFS`, `MAP_WALL_RUNS` (./shell.js); `MAP_WALLBUYS`, `MAP_PERKS` (./interactables.js); `MAP_RAMPS`, `MAP_NAV_LINKS` (./traversal.js) |
| js/map-layout.js | Re-exports from all four |
| The 13 importers in js/ and the 8 scripts | Unchanged |

**Cache tokens.**
- None of the imports of map-layout.js has a query string, in js/ or in scripts/.
- The new files get none either, like every split file before them. So each module loads once, and every importer sees one instance of every table.
- vercel.json serves /js/ with `max-age=0`, so browsers revalidate them on every load.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/map-layout/, and it mustn't. This folder ships.
- The page fetches four more small modules when it loads.

**Load order.**
- Whichever importer loads js/map-layout.js first, the entry loads shell.js, interactables.js, traversal.js and audits.js, in the order of its re-exports.
- traversal.js reads `MAP_DOOR_DEFS` as it loads. shell.js imports nothing, so it has already run by then, whichever module asked for it first.
- audits.js reads its imports only when an audit is called. Nothing else runs at load.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No module in js/map-layout/ imports js/map-layout.js.** The new test enforces it.
- **The folder's imports go one way.** shell.js and interactables.js import nothing, traversal.js imports only shell.js, and audits.js imports only the other three. So nothing in the folder imports audits.js. The new test enforces this too.
- **Nothing leads back in.** The modules import nothing outside the folder, so no path from them reaches any of the entry's importers.

A cycle here would be worse than untidy:
- traversal.js reads `MAP_DOOR_DEFS` as it loads. In a cycle through shell.js, it could run before `MAP_DOOR_DEFS` exists, and loading would throw.
- The entry is in the graph of js/map.js, js/game.js and js/audio.js, up to js/main.js. The error would stop all of them, so the menu would render but no button would work.

### 1.7 Validators

**No text pins on this file.** No validator reads js/map-layout.js by path, so there's no `read…Source()` helper to add.

**Two pins on importers' text, and both stay true:**
- validate-coplanar-surfaces (78) matches `import { DOOR_FIT } from '../map-layout.js';` in js/props/door.js. That import doesn't change.
- test-split-modules (84) checks that `importsOf()` finds `./map-layout.js` in js/map.js's multi-line import. That import doesn't change either.

**No test splits.** audit-map-egress.mjs (445 lines) is the module's main test, and it's under the cap.
- Its checks move between the four modules' names line by line, share a `roomAt` and a route search, and mix in pins on `readMapSource()`.
- Splitting it by module would copy that setup into each part.

**The behavioural checks cover every step, unchanged.**
- **audit-map-egress** imports 22 of the 31 names from the entry, and calls both big audits with their defaults. It fails at link on a missing re-export of any of the 22, and at call on a default whose table audits.js didn't import.
- **The 9 validators that build the map** (test-local-player, test-zombie-groans, validate-barrier-alcoves, validate-coplanar-geometry, validate-courtyard-spawns, validate-crash-states, validate-enemy-navigation, validate-prop-cover and validate-shot-occlusion) read every table the build uses. They run `auditMapStructure()` with all its defaults, `auditMapEgress` and both clearance audits.
- **The rest:**
  - validate-movement-feel walks a player circle up each flight `stairFlightColliders` encloses, through `platformSideBlocksAtFeet`.
  - validate-coplanar-surfaces checks `DOOR_FIT` and `cappedWallRuns`, and validate-wall-overlaps checks `MAP_WALL_RUNS`.
  - validate-game-invariants checks the catwalk's stair links in `MAP_NAV_LINKS`, and test-map-props checks the dressing against `MAP_WALKWAYS`.
  - validate-courtyard-spawns finds the room of `INITIAL_MYSTERY_BOX`, and validate-coplanar-geometry builds every perk machine and teleporter from their tables.
- **The pure rule stays enforced.** Five of those scripts import the entry with no resolve hook, and the entry now loads every module. A module that imported three would fail to resolve in all five.
- **validate-module-syntax** walks js/ recursively, so it parses the new files.

**New: `scripts/test-map-layout-modules.mjs` (~80 lines).** This is the layout's counterpart of test-shader-modules. Every check holds at every step. It checks:
- **js/map-layout.js exports the same 31 names as before the split.**
- **Every module in js/map-layout/ loads in plain Node, with no resolve hook.** The entry is imported the same way.
  - Each of a module's exports is one of the entry's names, with the same value (`===`).
  - No name is exported by two modules.
- **No module in js/map-layout/ imports js/map-layout.js,** through `assertNoImportOf`.
- **The imports go one way.**
  - The entry imports from every module in the folder, and from nothing else. Each specifier names a file that exists with exactly that case, through `onDisk`.
  - shell.js and interactables.js import nothing, traversal.js at most `./shell.js`, and audits.js at most the other three. A module the rule doesn't name is rejected too, so a new module has to be given its place in the order.
  - The rule also runs on a doctored list in which shell.js imports `./audits.js`, and on an entry that imports `./map-layout/Shell.js`, and must reject both.
- It takes `importsOf`, `onDisk` and `assertNoImportOf` from scripts/lib/split-modules.mjs, and copies none of them.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 59.

**What still isn't caught.**
- **A default whose table its module doesn't import,** where no caller leaves that argument out. After the split, every default that names another module's table is used by the map build or audit-map-egress, and the proof's name check covers the split itself. A default added later isn't covered.
- **Which module a new name belongs in.** Only the module headers say what goes where.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

Why this order:
- **A module can move only once everything it imports has left the entry,** because no module may import the entry. So the two modules that import nothing go first, and audits.js, which imports the other three, goes last.
- **shell.js and interactables.js go first, with the tooling.** They're tables and three small functions that read nothing outside their own module. So the entry's temporary imports, and the new test's rule, get tried on the simplest move.
- **traversal.js goes second.** It's the largest move, and the only module that runs code at load against another module. It takes the entry under the cap.
- **audits.js goes last.** That leaves the entry as re-exports only.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 1 | `test-map-layout-modules.mjs`, with split-modules.mjs's header; **shell.js** and **interactables.js**; the entry's temporary imports | ~265, leaving ~660 | Very low. Verbatim tables and three functions that read only their own module. A missing re-export fails its importers at link, and the new test pins all 31 names. | None beyond the proof. |
| 2 | **traversal.js** | ~355, leaving ~310 | Low. The largest move. A missing `MAP_DOOR_DEFS` import throws the moment anything loads the entry, in nearly every validator. Its order is the file's order. | None beyond the proof. |
| 3 | **audits.js**; the entry as in §1.4, with its header sentence | ~290, leaving ~17 | Low. Verbatim. A default whose table isn't imported throws only when it's used, and the map build and audit-map-egress use all nine. | The walk below. |

**Browser check, after step 3.** It needs a local server. Ask John before starting one, and stop it when the check is done. Keep the DevTools console open: any error fails the check.
- **Load the page.** The menu's buttons work. The Network tab shows the four new modules, and no failed module.
- **Start solo.**
  - Walk up both balcony stairs and the catwalk stairs, without jumping. Step off a side of the mainframe platform, and jump back onto it from that side.
  - Buy a door and walk through it.
  - Walk up to a teleporter: its prompt reads "The teleporter has no power". Turn the power on, and it reads "Hold F — use teleporter".
  - Walk from the Mainframe into the Left Corridor. The reverb changes, and the footsteps go from gravel to concrete, because js/audio/zones.js reads `MAP_ROOMS`.
- **Play one normal round, then one scheduled dog round.** The spawner's two helpers move, so AGENTS.md's check applies. Round 5 is the first dog round, and the cheats menu's start round can jump to it.
  - Zombies come in through the windows near you, and no spawn is out of reach.
  - On the dog round, only hounds spawn.

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script outside the repo, not committed.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Import js/map-layout.js. It imports nothing, so it needs no hooks.
2. **What it prints.**
   - **Every export, in name order.**
     - A function's name, its `length`, and its source text from `Function.prototype.toString`. A verbatim move keeps that text byte for byte.
     - Any other value, walked in insertion order, with every number printed exactly, `-0` included. Each object is numbered the first time it's seen, so a second reference prints as a back-reference. `MAP_TRAVERSAL_ZONES` holds the very objects in `MAP_STAIR_MOUTHS` and `MAP_OPEN_EXITS`, and the dump shows that.
   - **Each function's results on fixed arguments,** with Maps and Sets printed in insertion order:
     - `auditMapStructure()` and `auditMapEgress()` with their defaults, in full
     - `cappedWallRuns(MAP_WALL_RUNS)` and `papEnergyEnvelope()`
     - `stairFlightColliders` for the three flights validate-movement-feel walks
     - `platformSideBlocksAtFeet`, `teleporterPromptState`, `auditKeepClearZone`, `auditInteractableApproaches` and `elevationAwareRiseCandidate`, on the fixtures in audit-map-egress.mjs
     - `roomDepthsToPlayers` and `roomsThatCanReachPlayers` from every room, with the default links, first with no door open and then with every door open
   - **The 13 importers link.** Import headless-map.mjs for its browser shims, then load each one through `loadGameModule`.
3. **After each step, run it again.** The output must match the baseline byte for byte.
4. **Review the diff.**
   - **Check the moves.** A script cuts each module from the pre-split file by the ranges in §1.3.
     - The ranges must tile the file: every line but line 3 and the blank lines between blocks lands in exactly one module.
     - Every line that left map-layout.js must appear verbatim, in order, in the module meant to hold it.
   - **Check the names.**
     - Each file reads only module-level names it declares or imports. That includes the default parameters, which only run when a caller leaves the argument out.
     - Each file uses every name it imports.
   - **Run `git diff --color-moved=zebra`.** The only new lines should be:
     - file headers and imports
     - the entry's re-exports, its temporary imports in steps 1–2, and its header sentence in step 3
     - the tooling, in step 1

### 1.9 Found while reading

**Dead or unused code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **`auditMapEgress`' `minExits` check** (898–901) never runs. No room in `MAP_ROOMS` has `minExits`, and no caller passes a room that does.
- **`roomsThatCanReachPlayers`** (642) has no caller in js/. The spawner uses `roomDepthsToPlayers`, and only audit-map-egress calls it (353, 358, 363).
- **The `navLinks = MAP_NAV_LINKS` defaults** (609, 642) are never used.
  - The spawner passes `this.map.navLinks` (js/zombies/manager-spawning.js:66), which js/map/doors.js sets to `MAP_NAV_LINKS` (57). audit-map-egress passes its own links.
  - The map plan's §1.9 said nothing outside map.js reads the handle's `navLinks`. manager-spawning.js does.
- **Two exports nothing imports:** `MAP_OPEN_EXITS` and `MAP_STAIR_MOUTHS`. Only `MAP_TRAVERSAL_ZONES` reads them. They stay exported, so the entry's exports don't change.

**Duplicated code.** `roomDepthsToPlayers` and `roomsThatCanReachPlayers` build the same predecessor map, line for line (610–623 and 643–656). Both move to traversal.js. Sharing it would be a change, not a move.

**A comment far from its function.** Lines 588–591 describe `roomsThatCanReachPlayers` ("Return every room from which an enemy can follow the CURRENT directed graph…"). They sit above `roomDepthsToPlayers`' doc comment, 51 lines before the function they describe. All three move to traversal.js in one block, so the gap stays.

**The wall's thickness, four times.**
- `DOOR_FIT.wallThickness` (43) and `T = 0.4` in `cappedWallRuns` (65) move to shell.js.
- The ±0.2 footprints in `auditMapStructure` (740–741) move to audits.js.
- `WALL_T` is in js/map/shell.js (8).

**Stale paths.** These comments point at map.js for code that moved in the map split. That plan's §1.10 listed them as optional, and they weren't changed.
- 42 (`WALL_T`), 51 (`wallRun`) and 58 (the capped runs) point at code now in js/map/shell.js. They move to shell.js.
- 245 (the spawn steps' boxes) and 499 (`slabHole`) point at code now in js/map/elevation.js. They move to traversal.js.

**A copy of a shared check.** scripts/test-shader-modules.mjs defines its own `importsOf` (91–93), identical to the one in scripts/lib/split-modules.mjs. The new test imports the shared one, and this plan leaves the copy alone.

### 1.10 Docs and comments

- **js/map-layout.js's header** gains the sentence in §1.4, in step 3.
- **scripts/lib/split-modules.mjs's header** gains `test-map-layout-modules.mjs (js/map-layout/)`, in step 1.
- **README.md needs no change.** Its layout section doesn't list map-layout.js.
- **Optional, and not a move.**
  - The stale map.js paths in §1.9.
  - RENDERING.md:196 and :201 place `DOOR_FIT` and `cappedWallRuns` in `js/map-layout.js`. The entry still exports both, so both stay true. After step 1, they're defined in js/map-layout/shell.js.
  - js/map/elevation.js:123 says the stair geometry "lives in map-layout.js", and js/map/hand-placed.js:259 says to keep the catwalk treads in step with "the ramp in map-layout.js". After step 2, both are in traversal.js, and the entry still exports them.
- **Unchanged:**
  - js/collision.js:2, js/audio/zones.js:3, js/audio/occlusion.js:6, js/audio/ambience.js:13 and js/audio/engine-listener.js:291 call map-layout.js pure topology, or the source of `MAP_WALL_RUNS`. That stays true.
  - AGENTS.md, NOTICE.md and llms.txt don't name the file.
- **Leave as is:**
  - The docs/split-*.md plans cite js/map-layout.js, but they're dated records.
  - README.md's "27 headless validators" was out of date before this plan.

---

## 2. The other 12 files, ranked

None of these files has changed since `docs/split-shaders-plan.md` §2 was written: no commit from `dfda24f` on touches them. The importer counts and the validators' reads in the notes were checked again, and they hold. So the map-props plan's verdicts stand, with js/map-layout.js taken out of rank 1.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. Only main.js imports net.js, and main.js and js/main/ reach `Net` only through the instance. game.js and js/map/hand-placed.js import fx.js. |
| 2 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 3 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 4 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
