# Split plan: js/main.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 18 files with 5,701 lines over the cap.

This continues `docs/split-audio-plan.md`, whose plan is done. The director split in `docs/split-cinematic-director-plan.md` is still half done, with steps 3 and 4 left. The director imports none of the files this plan touches, and this plan touches none of the director's.

This plan covers `js/main.js`, the largest file. The audio plan's §2 ranked it third, behind shaders.js and map-layout.js, because its functions share module state and validators pin its text. A full read confirms both, and narrows them (§1.1):
- Of its 12 `let` bindings, only `canvas` is assigned outside the code it belongs with.
- Its groups call each other both ways, so a module per banner would import in a circle. Where each group lands, plus one moved handler, keeps the import graph acyclic.
- 3 validators pin 34 checks of its text. Three of the pins depend on order, and each stays inside one new file.

This doc's §2 replaces the audio plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `dfda24f` to `57072aa`, one per step in §1.8. js/main.js is now 327 lines, and the largest file in js/main/ is lifecycle.js at 179. `count_lines.py` now finds 17 files over the cap, with js/render/shaders.js the largest. It went as planned, with these notes:
- **Actual line counts** are within five lines of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | js/main.js | 327 |
  | app | 67 |
  | options | 143 |
  | characters | 96 |
  | cheats | 171 |
  | lobby | 155 |
  | lifecycle | 179 |

- **How the moves were made.** A throwaway script cut each module from the pre-split main.js by line range, and rebuilt js/main.js for each step. None of it was committed. It checked that:
  - every original line landed verbatim, in order, in the file meant to hold it;
  - each file imports exactly the names its code uses, found by tokenising the code rather than by searching its text;
  - every import from js/main/ names an export, and every export has an importer.
- **The proof ran as §1.8 describes, with three differences.**
  - The stored settings ran in two processes rather than four. One had an options blob from before calibration 2, cheats stored as `7` and an unknown marine; the other had a v1 options blob and a saved loadout. The invite link ran twice, with a name and without one. That makes eight processes, which printed 17,847 lines between them.
  - `getName` makes up a name with `Math.random`, so the proof seeded it when `boot` started.
  - It was run twice before step 1 to show the run is deterministic, and again after every step. The output matched each time, apart from two things:
    - The failed-start scenario runs with `?debug=1`, so `startGame`'s catch puts the error's stack in `__bootlog`. The stack's line numbers change with every step, so the comparison masked source locations, in 2 lines.
    - From step 4 on, the line that records the cheat screen's BACK listener comes later in `boot`, as §1.2 planned. Every click's output matched.
  - After each step, `git diff --color-moved=zebra` showed only these as new: file headers and imports, the export lists, `setCanvas` and its call, and in step 6 main.js's header sentence and README.md's lines. The BACK button showed as moved.
- **The validators number 52 in the loop:** the 51 from before, plus test-main-modules.mjs. All of them passed before step 1 and after every step.
- **Browser checks.** None of the checks in §1.8 have been run. They need a local server.
- **The standing check from §1.7 was added after the split,** as scripts/test-main-page.mjs, with the fake page in scripts/lib/headless-page.mjs. That makes 53 validators.
  - It boots js/main.js in eight scenarios, each in its own process, and uses every control. That's 107 actions and 132 checks, and nothing may throw.
  - It passes against the pre-split main.js too. It fails when a module in js/main/ drops an import, and when `returnToLobby` leaves the room.
  - It found no bugs.

None of the dead code in §1.9 was touched. README.md's layout lines and main.js's header sentence from §1.10 are done. The optional comment updates in §1.10 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/main.js                       1077           3
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

Total excess lines: 5701
```

The plan has two parts:
1. `js/main.js`: the entry keeps `boot` and the Tab listener. Six groups move verbatim into js/main/, each with the bindings its code assigns. Two small edits keep the import graph acyclic.
2. The other 17 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/main.js: 1,077 lines → js/main.js (~330) + 6 modules in js/main/

### 1.1 What's in it

index.html imports it on desktop only, as `./js/main.js?v=6`, once the device gate has passed (682). It exports nothing, and it boots the page as it loads: its last line is `boot();`.

| Lines | Contents | Used by |
|---|---|---|
| 1–2 | The header | |
| 3–13 | The imports: config, input, audio, hud, net, game, assets, personas, weapons, site-audio (with `?v=6`), multiplayer-contracts | |
| 15–18 | `$`, `DEBUG`, `debugExpose` | `$`: every group. `DEBUG`: `startGame` (698). `debugExpose`: `wireNetLobby`, the menu music, `startGame`, `boot`. |
| 20–61 | Options: `DEFAULTS`, `loadOptions` with its two migrations, `saveOptions`, `options` | The options screen; `applyOptions`; `startGame` (678); `boot` (829, 928–929, 1002) |
| 63–80 | Co-op auto-volume: `MP_MASTER`, `mpMasterOverride`, `effectiveMaster`, `syncMasterUI`, `setMpMasterOverride` | `bindOptionsUI` clears the override (391). `startGame`, `exitToMenu` and `returnToLobby` set it, and `startGame`'s toast reads it (695). |
| 82–92 | Cheat codes: `CHEATS_KEY`, `loadCheats`, `cheats` | The cheat screen; the countdown (534); `startGame` (673); `boot` (825, 917) |
| 94–180 | Characters: `PERSONA_KEY`, `getPersona`, `setPersona`, `charReturnTo`, `openCharSelect`, `takenPersonas`, `freePersona`, `buildCharCards`, `charPageId`, `openCharPage` | `refreshLobbyUI` (558, 562); `boot`: the character buttons (851–862), host and join (830, 888), and 874 |
| 181–336 | The cheat screen: `saveCheats`, `CHEAT_IDS`, `cheatsReadOnly`, `visibleCheats`, the custom loadout catalog (188–201), `buildWeaponPickers`, `cheatsReturnTo`, `openCheats`, `syncCheatsUI`, `bindCheatsUI` | `boot` (781, 849–850); `wireNetLobby` calls `syncCheatsUI` (608) |
| 338–352 | `getName`, `PUBLIC_SITE_URL`, `buildInviteLink` | `getName`: `bindOptionsUI`, `startGame`, `boot`. `buildInviteLink`: `refreshLobbyUI`, `boot`. |
| 354–364 | App state: `app`, `canvas`, `lastTabT` and its Tab listener | `app`: every group. `canvas`: `showScreen`, `startGame`, `resumeGame`, and `boot`, which assigns it (777). `lastTabT`: `boot` (1016). |
| 366–381 | `showScreen` | 26 calls, from the characters, the cheat screen, the lifecycle and `boot` |
| 383–455 | The options screen: `bindOptionsUI`, `setShowFps`, `syncFpsControls`, `applyOptions` | `boot` (780, 786, 1002). `openCharPage` (170) and `startGame` (692) call `applyOptions`. |
| 457–505 | Lobby voice: `lobbyVoiceT`, `enableLobbyVoice`, `updateLobbyVoiceUI`, `startLobbyVoiceLoop`, `stopLobbyVoiceLoop` | `refreshLobbyUI`; `wireNetLobby`; `startGame`, `exitToMenu`, `returnToLobby`; `boot`'s host, join and mic buttons |
| 507–546 | The lobby countdown: `countdownT`, `countdownLeft`, `stopLobbyCountdown`, `syncLobbyCountdown` | `refreshLobbyUI` (591, 596). `wireNetLobby`, `startGame`, `returnToLobby` and `boot` (916) stop it. |
| 548–599 | `refreshLobbyUI`, `escapeHtml` | The cheat screen's BACK button (323); the countdown (544); `wireNetLobby`; `returnToLobby`; `boot` |
| 601–620 | `wireNetLobby` | `boot`'s host and join (823, 886) |
| 622–644 | Menu music: `menuMusic`, `startMenuMusic`, `stopMenuMusic`, `rememberMenuMusicPosition` | `startGame`, `exitToMenu`, `returnToLobby`; `boot` (787, 800) |
| 646–763 | Game lifecycle: `assetsLoading`, `ensureAssets`, `startGame`, `exitToMenu`, `returnToLobby`, `pauseGame`, `resumeGame` | `wireNetLobby`; `startGame`'s `onExit` (681); `boot` |
| 765–773 | `toastT`, `toast` | 18 calls, from every group but the options |
| 775–1075 | `boot`, 300 lines. It wires the menu, the join modal, the lobby, the pause menu, fullscreen, pointer lock and keys, then handles `?join=`. It declares `syncFsUI`, `syncSoloFsUI`, `toggleFullscreen` and `syncLockHint` inside. | 1077 |
| 1077 | `boot();` | |

Five facts shape the plan:
- **Nothing imports it, and nothing loads it in Node.**
  - No caller has to keep working. But no validator runs any of its code either.
  - 3 validators read its text, in 34 checks (§1.7).
- **It's one script over module state.**
  - 46 top-level functions share 12 `let` bindings and three objects: `app`, `options` and `cheats`.
  - An ES module can read another module's `let` as a live binding, but it can't assign it. It can set fields on an imported object.
  - Every binding but one is assigned only inside its own group. `canvas` is declared with the app state (362), and `boot` assigns it (777).
- **The groups call each other both ways.**
  - `refreshLobbyUI` calls `syncLobbyCountdown` (596), which calls it back (544).
  - `wireNetLobby` calls `startGame` and `exitToMenu` (614, 617), and `returnToLobby` calls `refreshLobbyUI` (738).
  - The cheat screen's BACK button calls `refreshLobbyUI` (323), and the countdown reads `cheats` (534).
- **One registration order matters.**
  - The Tab listener (364) has to be added before `boot` calls `initInput` (779).
  - `initInput` adds a capture-phase keydown listener on `window` that calls `stopImmediatePropagation()` on Tab (input.js:16–24).
  - A Tab listener added after it would never fire. Then `lastTabT` would stop keeping a Tab-caused pointer unlock from pausing the game (1016).
- **Mistakes fail quietly.**
  - Nearly all of this code runs in event handlers.
  - A moved function that uses a name its module doesn't import throws only when it runs. The button does nothing, and the console shows a ReferenceError.
  - So the proof in §1.8 fires every handler.

### 1.2 Mechanism

**Verbatim moves, with export lists.** Each new module ends with an `export { … }` list, as the director's modules do, so every moved declaration stays byte-identical. main.js keeps exporting nothing.

**Six modules, each one or more groups from §1.1:**

| Module | Takes | Why it's a seam |
|---|---|---|
| app.js | `$`, `DEBUG`, `debugExpose`; `getName`, `buildInviteLink`; `app`, `canvas`; `showScreen`; `toast` | What every screen uses. It imports nothing from js/main/, so every other module can import it. |
| options.js | The options and co-op auto-volume; the options screen and `applyOptions` | The settings and the controls that change them. `mpMasterOverride` stays with both of its writers (77, 391). |
| characters.js | 94–180 | The chosen marine and the two character screens |
| cheats.js | The cheat codes and the cheat screen | The codes, their storage, and the screen that edits them. Guests see the host's copy through `visibleCheats`. |
| lobby.js | Lobby voice, the countdown, `refreshLobbyUI` | The lobby screen. `refreshLobbyUI` and `syncLobbyCountdown` call each other, so they share a file. |
| lifecycle.js | `wireNetLobby`, the menu music, the game lifecycle | Moving between the menu, the lobby and a match. `wireNetLobby` goes here, not in lobby.js, because it starts and ends matches. |

**Each binding moves to the module that assigns it.** Readers import it.

| Bindings | Assigned by | Module |
|---|---|---|
| `canvas` | `boot` (777), through the new `setCanvas` | app.js |
| `toastT` | `toast` | app.js |
| `mpMasterOverride` | `setMpMasterOverride` (77), `bindOptionsUI` (391) | options.js |
| `charReturnTo`, `charPageId` | `openCharSelect` (107), `openCharPage` (142) | characters.js |
| `cheatsReturnTo` | `openCheats` (246) | cheats.js |
| `lobbyVoiceT`, `countdownT`, `countdownLeft` | The voice loop and the countdown | lobby.js |
| `menuMusic`, `assetsLoading` | The menu music and `ensureAssets` | lifecycle.js |
| `lastTabT` | The Tab listener (364) | main.js |

`app`, `options` and `cheats` are `const` objects. Fields on them are set from many groups: `app.game` by the lifecycle, `app.net` by `boot`, `options.voiceChat` by `boot` (928), `cheats.loadout` by the cheat screen. Setting a field through an import is allowed.

**Two code edits.**
1. **`setCanvas(el)` in app.js.**
   - One new line after `let canvas;`: `function setCanvas(el) { canvas = el; }`.
   - `boot`'s 777, `canvas = $('game-canvas');`, becomes `setCanvas($('game-canvas'));`.
   - `boot` still looks the canvas up, at the same moment.
2. **The cheat screen's BACK button moves into `boot`.**
   - Lines 320–324 leave `bindCheatsUI` and go, unchanged, right after 850. That's `btn-lobby-cheats`, which opens the cheat screen from the lobby.
   - Both functions indent their bodies by two spaces, so the lines move byte for byte.
   - `boot` already wires the other BACK buttons. The character screen's (852) calls `refreshLobbyUI` the same way.
   - The button has one listener, so registering it later in `boot` changes nothing.

What this buys:
- **No import cycles** (§1.6).
- **Nothing outside the file changes:** not index.html's import, not the DOM ids, and not the `window.__game`, `__audio`, `__net`, `__bootlog` and `__menuMusicHandle` hooks.
- **Every other moved line is unchanged,** and each group keeps its banner comment.
- **Every export has an importer.**
- **`boot` stays whole,** and main.js ends at ~330 lines.

Rejected alternatives:
- **Keep `canvas` in main.js and pass it in.** `showScreen` alone has 26 calls.
- **Make it `app.canvas`.** Its 12 reads and its assignment would all change.
- **Allow the cycles:** cheats.js with lobby.js, and lobby.js with lifecycle.js. ES modules allow them here, since no module reads another's bindings while it loads. But every split so far has kept its import graph acyclic.
- **Split the cheat settings from the cheat screen, so BACK can stay in `bindCheatsUI`.** That's a ~20-line module (`cheats`, its loader and saver, `cheatsReadOnly`, `visibleCheats`) to avoid moving one five-line handler.
- **One module for the lobby and the lifecycle** (~320 lines). It has no cycle either. But the lobby screen and moving between screens are different jobs, and the file would hold 18 of the 34 pinned checks.
- **One state module for `app`, `options` and `cheats`.** Each loader and saver would leave the screen that uses it, and `bindOptionsUI`, a writer of `mpMasterOverride`, would have to go with them.
- **`getName` and `buildInviteLink` in characters.js.** characters.js imports options.js for `applyOptions`, and `bindOptionsUI` calls `getName`. That's a cycle.
- **Split `boot` by screen.** Its closures cross the sections:
  - `syncSoloFsUI` serves the SOLO button (813) and the fullscreen code (982).
  - `toggleFullscreen` serves the pause, lobby and solo buttons and F11 (1023).
  - With the rest moved out, main.js is under the cap anyway.
- **Move `lastTabT` and its listener into app.js.** Only `boot` reads it. app.js would gain a load-time listener and an export for nothing.

### 1.3 Target modules

| Module | Takes from main.js | ≈ lines |
|---|---|---|
| `js/main.js` | 1–2, the header, plus one new sentence. A new import list (§1.4). 363–364, `lastTabT` and the Tab listener. 775–1077, `boot` and its call, with the two edits from §1.2. | 330 |
| `js/main/app.js` | 15–18: `$`, `DEBUG`, `debugExpose`. 338–352: `getName`, `PUBLIC_SITE_URL`, `buildInviteLink`. 354–362: the app-state banner, `app` and `canvas`, followed by the new `setCanvas`. 366–381: `showScreen`. 765–773: the toast banner, `toastT`, `toast`. | 70 |
| `js/main/options.js` | 20–61: the options banner through `options`. 63–80: co-op auto-volume. 383–455: the options-screen banner through `applyOptions`. | 145 |
| `js/main/characters.js` | 94–180: the persona banner through `openCharPage` | 100 |
| `js/main/cheats.js` | 82–92: the cheat-codes banner through `cheats`. 181–319 and 325–336: `saveCheats` through `bindCheatsUI`, without the BACK button. | 170 |
| `js/main/lobby.js` | 457–599: the lobby-voice banner through `escapeHtml` | 155 |
| `js/main/lifecycle.js` | 601–763: `wireNetLobby` through `resumeGame` | 180 |

Outside the imports and the two edits, each line of main.js ends up in exactly one of these files. main.js keeps `boot`. app.js takes 5 functions and gains `setCanvas`. options.js takes 9, characters.js 7, cheats.js 6, lobby.js 8 and lifecycle.js 10.

Ordering, headers and exports:
- Members keep their original relative order.
- Each new file opens with a comment naming its part of the page.
- Each export list holds exactly the names §1.5 shows other files importing. The rest stay private:
  - app.js: `PUBLIC_SITE_URL`, `toastT`
  - options.js: `DEFAULTS`, `loadOptions`, `MP_MASTER`, `effectiveMaster`, `syncMasterUI`, `syncFpsControls`
  - characters.js: `PERSONA_KEY`, `takenPersonas`, `freePersona`, `buildCharCards`, `openCharPage`
  - cheats.js: `CHEATS_KEY`, `loadCheats`, `saveCheats`, `CHEAT_IDS`, `cheatsReadOnly`, `visibleCheats`, the loadout catalog, `buildWeaponPickers`
  - lobby.js: `lobbyVoiceT`, `startLobbyVoiceLoop`, `countdownT`, `countdownLeft`, `syncLobbyCountdown`, `escapeHtml`
  - lifecycle.js: `menuMusic`, `stopMenuMusic`, `assetsLoading`, `returnToLobby`
- No new comment may quote pinned text (§1.7). A copy in a comment would keep a pin passing even if the code were gone.

### 1.4 What stays in js/main.js

It stays the page's boot script. index.html keeps importing it, and nothing else does, so it needs no exports.

```js
// Boot + menus: main menu, options (sensitivity/FOV/volumes/quality),
// lobby (host/join with ready-up), pause, game lifecycle.
// The code behind the screens is in js/main/. This file wires the controls and boots the page.
import { NAME_KEY } from './config.js';
import { initInput, input, lockPointer, unlockPointer } from './input.js';
import { audio } from './audio.js';
import { Net } from './net.js';
import { PERSONAS } from './personas.js';
import { $, debugExpose, getName, buildInviteLink, app, canvas, setCanvas, showScreen, toast } from './main/app.js';
import { options, saveOptions, bindOptionsUI, setShowFps, applyOptions } from './main/options.js';
import { getPersona, setPersona, charReturnTo, openCharSelect, charPageId } from './main/characters.js';
import { cheats, cheatsReturnTo, openCheats, bindCheatsUI } from './main/cheats.js';
import { enableLobbyVoice, updateLobbyVoiceUI, stopLobbyCountdown, refreshLobbyUI } from './main/lobby.js';
import { wireNetLobby, startMenuMusic, rememberMenuMusicPosition, ensureAssets, startGame, exitToMenu, pauseGame, resumeGame } from './main/lifecycle.js';

// … 363–364, verbatim: lastTabT and the Tab listener …

// … 775–1075, verbatim: boot, except:
//   777 becomes setCanvas($('game-canvas'));
//   320–324, the cheat screen's BACK button, go after 850 …

boot();
```

The external imports keep their original relative order. The js/main/ imports follow in dependency order.

**During steps 1–5,** main.js keeps the groups that haven't moved yet, and imports whatever they need. Each step drops only the names used by the code it moves. Every other name stays on its original import line.

### 1.5 Imports

Paths are relative to js/main/. A module's path is given the first time it appears in the table.

| Module | Imports |
|---|---|
| app.js | `NAME_KEY` (../config.js); `HUD` (../hud.js); `shouldShowGameplayCanvas` (../multiplayer-contracts.js) |
| options.js | `STORE_KEY`, `NAME_KEY`; `audio` (../audio.js); `$`, `getName`, `app` (./app.js) |
| characters.js | `audio`; `assets` (../assets.js); `PERSONAS`, `drawPortrait` (../personas.js); `$`, `app`, `showScreen`, `toast`; `applyOptions` (./options.js) |
| cheats.js | `audio`; `WEAPONS` (../weapons.js); `$`, `app`, `showScreen`, `toast` |
| lobby.js | `CFG`; `audio`; `PERSONAS`; `shouldRefreshLobbyUi`; `$`, `buildInviteLink`, `app`, `toast`; `getPersona`, `setPersona` (./characters.js); `cheats` (./cheats.js) |
| lifecycle.js | `lockPointer`, `unlockPointer`, `clearPressed`, `resetInputState` (../input.js); `audio`; `Game` (../game.js); `assets`; `getMenuMusicOffset`, `keepMenuMusicClock` (../site-audio.js?v=6); `shouldRefreshLobbyUi`; `$`, `DEBUG`, `debugExpose`, `getName`, `app`, `canvas`, `showScreen`, `toast`; `options`, `mpMasterOverride`, `setMpMasterOverride`, `applyOptions`; `cheats`, `syncCheatsUI`; `enableLobbyVoice`, `stopLobbyVoiceLoop`, `stopLobbyCountdown`, `refreshLobbyUI` (./lobby.js) |

Every name main.js imports today is still used, by the entry or by the modules above. The entry stops importing `CFG`, `STORE_KEY`, `clearPressed`, `resetInputState`, `HUD`, `Game`, `assets`, `drawPortrait`, `WEAPONS`, both site-audio names and both multiplayer-contracts names.

**Cache tokens.**
- **lifecycle.js imports `../site-audio.js?v=6`,** the token main.js uses today.
  - js/site-chrome.js and js/assets-page.js import site-audio.js with the same token, and so does index.html.
  - A token dropped or changed would load a second copy. test-audio-modules checks every relative import in js/, so it fails when that happens. It doesn't read index.html, but index.html's import doesn't change.
- **The new files get no token,** like every split file before them. vercel.json serves /js/ with `max-age=0`, so browsers revalidate them on every load.
- **index.html keeps `import('./js/main.js?v=6')`.** A relative import resolves against the importing module's URL without its query. So main.js's `./main/app.js` and lobby.js's `./app.js` both resolve to /js/main/app.js, and each module loads once.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/main/, and it mustn't. Unlike the director's folder, this one ships.

**Load order.**
- `lastTabT`'s listener (364) and `boot()` still run after every import has evaluated, in that order. So the Tab listener is still added before `initInput` (§1.1).
- **Four pieces of top-level work move:** `DEBUG` and `new HUD()` to app.js, `loadOptions()` to options.js, and `loadCheats()` and `LOADOUT_GUNS` to cheats.js.
  - Today `loadOptions` and `loadCheats` run before `new HUD()`. After, `new HUD()` runs first, because every module imports app.js.
  - HUD's constructor only looks up elements. Each loader reads and writes only its own storage key.
- **Other modules evaluate in a different order too.** hud.js now evaluates after net.js and personas.js, and game.js's graph after the first five js/main/ modules instead of right after net.js.
  - The top-level work in those graphs doesn't depend on order: `installMixins` calls, personas.js's resize listener (298), SunShadow.js's `installShadowEdgeFade()` (15), js/audio/synth.js's recipe tables, and two rotations in js/weapons/perk-bottle.js (40–41).
  - No module in js/ has a top-level `await`.

### 1.6 Circular imports: none are created

Four rules keep it that way:
- **No file under js/main/ imports js/main.js.**
  - The new test enforces it.
  - It holds at every step, because a module moves only after the modules it imports have moved (§1.8).
  - `setCanvas` is what makes it hold for app.js. Without it, app.js would need `canvas` from main.js.
- **The import graph inside js/main/ has no cycles:**
  - app imports nothing from the folder.
  - options and cheats import app. characters imports app and options.
  - lobby imports app, characters and cheats.
  - lifecycle imports app, options, cheats and lobby.
  - The new test checks this too.
- **The calls that run both ways are kept inside one file or pointed one way:**
  - `refreshLobbyUI` and `syncLobbyCountdown` share lobby.js.
  - `wireNetLobby` goes to lifecycle.js, which already imports lobby.js for `returnToLobby`.
  - The cheat screen's BACK button moves into `boot` (§1.2), so cheats.js doesn't import lobby.js.
- **Nothing they import from outside leads back in.**
  - index.html is main.js's only importer, and only main.js and js/main/ import js/main/.
  - None of config, input, audio, hud, net, game, assets, personas, weapons, site-audio or multiplayer-contracts imports either.

### 1.7 Validators

**Text pins (3 files, 34 checks).** These validators read `js/main.js` by path:

| Validator | Checks | Where the pinned text ends up |
|---|---|---|
| validate-game-invariants | 16 | lifecycle.js 6; main.js 4 (the fullscreen shimmer, `btn-lobby-fs`, `syncSoloFsUI`, `setLobbyVoiceEnabled`); lobby.js 2; cheats.js 2; options.js 1 (the brightness migration); app.js 1 (`showScreen`'s canvas toggle) |
| test-multiplayer-contracts | 12 | lifecycle.js 9, including the 4 checks on the `returnToLobby` slice; main.js 1 (`setLobbyVoiceEnabled`); app.js 1 (the canvas toggle); lobby.js 1 (the countdown's guard) |
| validate-frame-budget | 6 | options.js 5, including the 3 checks on the `setShowFps` slice; main.js 1 (the pause menu's FPS button) |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readMainSource()` calls `readSplitSource(js, 'main', '.js')`.
   - It returns js/main.js, then every .js file under js/main/ in path order, joined.
   - The file's header comment gains a sentence.
2. **Switch the reads.**
   - validate-game-invariants and test-multiplayer-contracts swap the `readFile` of js/main.js in their `Promise.all` for `readMainSource()`. Each adds the name to its existing import from `./lib/game-source.mjs`.
   - validate-frame-budget makes the same swap in its FPS block and gains that import. Its comment there (235–236) stays true.
   - All three still use `readFile` for other files.

No pin changes:
- **Three pins depend on order, and each stays inside one file in its original order.**
  - test-multiplayer-contracts slices from `function returnToLobby(` to `function pauseGame(`. Both go to lifecycle.js, still adjacent. If they were ever in different files or out of order, the slice would come back wrong: its `app.game = null` check would fail, and its negative `.leave(` check would pass on nothing.
  - validate-frame-budget slices from `function setShowFps(` to `function syncFpsControls(`. Both go to options.js, still adjacent.
  - `showScreen('lobby');[\s\S]*startMenuMusic();[\s\S]*enableLobbyVoice()`, in two validators, matches inside `returnToLobby` (737–740), which moves whole.
- **The other pins are single lines, or bounded** like the brightness migration's `{0,120}`. Each lands in one file.
- **The joined text is main.js's lines plus headers, imports and export lists,** none of which may quote a pin. So no pin can start passing by accident.

**Behavioural checks.** None change. No validator loads main.js before the split or after it. validate-module-syntax walks js/ recursively, so it parses the new files.

**No validator splits.** All three are under 500 lines (463, 350 and 405), and each covers much more than main.js.

**New: `scripts/test-main-modules.mjs` (~70 lines).** This is the page's counterpart of test-cinematic-modules. It checks:
- No module in js/main/ imports js/main.js, through `assertNoImportOf`.
- **The imports among js/main/ form no cycle.**
  - It reads each file's relative imports that resolve into js/main/, and walks the graph depth-first.
  - The check also runs on a doctored graph in which lobby.js imports lifecycle.js, and must reject it.
- **Every module in js/main/ loads in Node.**
  - It builds on headless-map.mjs. It also stubs `document.getElementById` and `document.querySelector` to return null, and sets `location` to http://localhost/.
  - Loading links every import between the modules, and runs their top levels: `new HUD()`, `loadOptions()`, `loadCheats()` and `LOADOUT_GUNS`. A wrong path, or a name one module imports and another doesn't export, fails here.
  - It doesn't load js/main.js, because `boot` needs the page.
- `readMainSource()` holds every file.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 52.

**What still isn't caught.**
- **Nothing clicks a button.** A moved function that uses a name its module doesn't import fails only when it runs (§1.1). The proof in §1.8 fires every handler, and the browser checks cover what a fake page can't.
- **A standing check is possible.**
  - The proof's fake page could be committed as `scripts/test-main-page.mjs`, asserting that no scripted action throws.
  - That would catch a missing import on every run, during the split and after it.
  - It isn't one of the steps. Whether to add it is John's call.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one, and stop it when the check is done.
- Co-op checks need two tabs and PeerJS's public server.
- Keep the DevTools console open in each tab. Any error fails the check.

This order is also the dependency order: each module moves after the modules it imports, so nothing in js/main/ ever imports main.js. Within that:
- **app.js goes first,** because every other module imports it. Step 1 also adds the helper, the switched reads and the new test, so a mistake in any of them shows up on the smallest move.
- **The options, the characters and the cheat screen go next.** Each is a screen `boot` opens, and their code moves verbatim apart from one handler.
- **The lobby and the lifecycle go last.** Every co-op path runs through them, and lifecycle.js takes 15 of the 34 pinned checks.

| # | Change | Out of main.js | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readMainSource()`, with the 3 validators switched; `test-main-modules.mjs`; **app.js**, with `setCanvas` | ~55 | Low. Every screen change goes through `showScreen`, and `setCanvas` is the first edit. A missing export fails at load in the new test. | In the menu, MORE shows its links. OPTIONS, CHEAT CODES and CHARACTER each open, and BACK returns. JOIN with a two-letter code shows "Enter the lobby code.", which hides after about 3 s. `?join=ABCD&from=Bob` opens the join modal with Bob's invite. In solo, the game draws, Esc pauses, RESUME re-locks the pointer, and a click re-locks it after a lost lock. On localhost with `?debug=1`, `window.__audio` is set. After HOST LOBBY, the invite link reads `https://www.derkoloss.com/invite/<code>?from=<name>`. |
| 2 | **options.js** | ~130 | Low. Verbatim. The two functions in the FPS slice move together. | Each slider updates its label, applies at once and survives a reload. Quality applies mid-match. The Options FPS toggle and the pause menu's FPS COUNTER stay in step. With `dr_options_v1` set to `{"brightness":0.5}` in DevTools, a reload shows 100% brightness. With `{"settingsSchema":1,"fov":70}`, it shows the defaults. Host a lobby alone, ready up and start: master drops to 15%, with a toast. Move MASTER, and your value holds. Back in the menu, master is your saved value. |
| 3 | **characters.js** | ~85 | Very low. Verbatim, and no pin covers it. | CHARACTER shows four cards with portraits. A card opens its page, and each voice preview plays, on a fresh load too. SELECT names the marine in a toast, and the lobby shows it. In a two-tab lobby, the other tab's marine reads TAKEN and can't be selected. BACK returns to the menu or the lobby, whichever opened the screen. |
| 4 | **cheats.js**; the BACK button moves into `boot` | ~160 | Low. One handler moves to another function. The rest is verbatim. | Tick ARMED TO THE TEETH, then WUNDERWAFFEN: the first unticks. Pick a primary gun: both untick. Search filters the list, and clicking the picked gun clears it. Try TITAN MODE, ALL (its toast names GHOST TOWN) and NONE. A start round of 99 becomes 40. Reload: the codes persist. From the lobby, CHEAT CODES then BACK returns to the lobby. As a guest, VIEW CHEAT CODES shows the host's codes, all disabled. Start solo with a custom loadout: you spawn with those guns. |
| 5 | **lobby.js** | ~145 | Low to medium. Two timers, each guarded by `app.net`'s identity, and the countdown that starts the match. | In two tabs, the roster shows the crown, "(you)" and each marine. Mute toggles 🔇 and 🔊, with a toast. Ready both: the hint counts down from 10, and the match starts in both tabs. Unready during the count, and it stops. The host's VOICE button: the guest is asked for the microphone only while it's ON. The guest's MIC toggles MUTED, and the speaking dot lights up while talking. Pick the same marine in both tabs: the later one gets the "is taken" toast and another marine. |
| 6 | **lifecycle.js**; main.js is left as in §1.4; README.md's layout lines (§1.10) | ~165 | Medium. Every move between the menu, the lobby and a match, and 15 pinned checks. The site-audio import must keep `?v=6`, which test-audio-modules checks. | The menu music starts on the first click, and resumes where it was after a visit to ABOUT. Solo shows the loading bar the first time. In a two-tab match, Esc shows END GAME TO LOBBY for the host and LEAVE GAME for the guest, and in solo the mic button is hidden. The host's END GAME TO LOBBY brings both tabs back to the lobby, still connected and unready, with the menu music. Closing the host's tab sends the guest to the menu with a toast. AGENTS.md's normal round and dog round. |

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script, not committed, because a saved expected output would break on every later intentional change.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - **Fakes for the modules main.js drives.**
     - A resolve hook, registered after headless-three's, maps audio.js, assets.js, net.js, game.js, hud.js, input.js and site-audio.js to recording fakes. It matches the resolved path, so `./audio.js` from main.js and `../audio.js` from js/main/ reach the same fake.
     - personas.js maps to a shim that does `export *` from the real module and replaces `drawPortrait` with a recorder. config.js, weapons.js and multiplayer-contracts.js stay real.
     - Each fake logs every call and property write. It returns what the scenario sets: whether assets have loaded and which sounds exist; the `Net` roster, host flag and voice state, and whether `host()` and `join()` resolve; whether `Game`'s `init` throws, and what `endMatchToLobby()` returns.
     - The script calls the `onLobby`, `onStart`, `onClosed` and `onExit` callbacks that main.js hands to the fakes.
   - **A fake page.**
     - `document.getElementById` returns a recording element per id, made on first use. It logs writes to `textContent`, `innerHTML`, `value`, `checked`, `disabled`, `style`, `classList` and attributes. It keeps every listener, so the script can fire it.
     - `querySelectorAll` returns the two `.wpn-pick` slots (`p1` and `p2`) with their lists and search boxes, the two `.menu-link` anchors, and the `.lobby-spk` spans in the last roster markup.
     - Also: `createElement`, `fullscreenElement` with `requestFullscreen` and `exitFullscreen`, `pointerLockElement`, `navigator.clipboard`, `location` on localhost, and logged `localStorage` and `sessionStorage`.
     - A fake clock replaces `performance.now`, `setTimeout`, `setInterval` and their clears. `requestAnimationFrame` calls are counted, not run.
   - **Each scenario runs in its own process,** because main.js boots once, as it loads:
     - **Menu and solo.** The first gesture; MORE; SOLO with and without fullscreen, and the fullscreen modal's buttons. A solo match through Esc, each pause button, OPTIONS and back, every options control, RESUME, a pointer unlock with and without Tab, a canvas click, and QUIT. Every character card, every voice preview (before audio loads, after, and a missing line), SELECT and both BACK buttons. Every cheat control, both loadout slots with a search and a clear, TITAN, ALL, NONE, rounds 0 and 99, and BACK. JOIN with a short code, a rejected code, and a good one by Enter.
     - **Host.** HOST LOBBY. `onLobby` with one to four players, a marine collision, and a majority reached and lost. The clock through a full countdown and a cancelled one. START GAME; the VOICE button both ways; a mute; COPY LINK resolving and rejecting; a rename; the cheat and character screens from the lobby. `onStart`, `onExit('lobby', …)` and `onClosed`.
     - **Guest.** JOIN; the host's settings arriving; the view-only cheat screen, with its disabled controls fired anyway. The MIC button with voice off, with no stream, and muting. `onStart` with the host's cheats; LEAVE GAME.
     - **Stored settings.** An options blob without `brightnessCalibration`, one with `settingsSchema: 1`, cheats stored as `7`, and an unknown marine.
     - **A failed start,** with `init` throwing.
     - **A deep link:** `?join=abc12&from=Bob%01&debug=1`.
2. **What it prints.**
   - **Everything before `boot` looks up `game-canvas`:** the calls and storage reads made while the modules load, sorted, because the split changes their order (§1.5).
   - **After every scripted action, in order:** the page writes, the fake-module calls, the storage writes, the timers set and fired, and the `window.__*` hooks set, since the previous action.
   - **Every uncaught error and rejected promise,** with its message. A name that a moved function can't reach shows up here, from the handler that used it.
   - No object identities.
3. **After each step, run it again.** Every scenario's output must be identical to the baseline.
4. **Review the diff.**
   - Check that every line that left main.js appears verbatim in the file meant to hold it, and that each file imports exactly the names its code uses.
   - Then run `git diff --color-moved=zebra`. The only new lines should be:
     - file headers and imports
     - the export lists
     - `setCanvas` and its call
     - main.js's header sentence, in step 6

     The BACK button shows as moved.

If a path can't be run headless, check it in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **A function nothing calls.** `freePersona` (114). `refreshLobbyUI` picks a free marine itself (561).
- **A loop that does nothing.** The comment at 1060 says the loop runs `endFrame` each frame, but its body (1061) only schedules itself. game.js calls `endFrame` itself (286, 438).
- **A condition that changes nothing.** `setAll` sets `cheats.loadout = {}` in both branches (310–311).

**Comments.** The comment on `app.screen` (356) lists `menu | lobby | game`. `showScreen` also sets `options`, `pause`, `solo-fs-modal`, `join-modal`, `charselect`, `charpage` and `cheats`.

### 1.10 Docs and comments

- **js/main.js's header** gains a sentence in step 6: "The code behind the screens is in js/main/. This file wires the controls and boots the page."
- **README.md's layout section** changes in step 6, in the same form as the other split folders:
  - `main.js` (256): "Page entry point: wires the controls, boots the page"
  - `main/`, a new line after it: "Options, characters, cheat codes, lobby, menu music, match start and exit"
- **Optional.** These comments point at main.js for code that moves:
  - index.html:853, the co-op auto-volume: now js/main/options.js
  - index.html:698, :718 and :823, the lobby rows, their icon-only controls and the countdown hint: now js/main/lobby.js
  - js/menu-bg.js:84, `showScreen()`: now js/main/app.js
  - js/personas.js:230 and :272, the character cards' calls to `drawPortrait`: now js/main/characters.js
  - js/audio/engine-weapons.js:9 says main.js imports weapons.js. After step 4, js/main/cheats.js does instead. The comment's point, that weapons.js is already in the graph, still holds.
- **Unchanged:**
  - index.html:682 and :688–690, and validate-module-syntax.mjs:4, name js/main.js as the module index.html loads, which stays true.
  - validate-frame-budget.mjs:235–236 says main.js boots the page as it's imported, which stays true.
  - AGENTS.md, RENDERING.md, NOTICE.md and llms.txt don't name main.js.
- **Leave as is:**
  - The docs/split-*.md plans cite js/main.js, but they're dated records.
  - README.md still says 27 validators. That was out of date before this plan, and this plan doesn't touch it.

---

## 2. The other 17 files, ranked

None of these files has changed since `docs/split-audio-plan.md` §2 was written. The only commit since, `8e0a592`, touched js/audio/engine-music.js, a new test and that doc. So its verdicts stand. The ranks are renumbered without js/main.js, and net.js's row gains one note.

Each file gets a full read and its own plan before it is split.

**Mid-split:** js/cinematic-director.js (970 lines). Steps 3 and 4 of its plan take it down to a ~60-line boot script.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. validate-performance-invariants and validate-coplanar-surfaces read the file's text by path, so they need a source helper like `readAudioSource()`. |
| 2 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 3 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. main.js and js/main/ reach `Net` only through the instance, so a mixin split changes nothing there. |
| 4 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's were. The map plan's §1.2 mechanism may fit. | Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The only binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like the map plan's §1.8. |
| 5 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 6 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 7 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
