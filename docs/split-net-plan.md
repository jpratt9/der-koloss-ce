# Split plan: js/net.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 12 files with 2,777 lines over the cap.

This continues `docs/split-map-layout-plan.md`, whose plan is done.

This plan covers `js/net.js`, the largest file with a clean seam. index.html is larger, at 881 lines, but a full read confirms it has none (§2). Every ranking since the first plan has paired net.js with fx.js: one class, split with `installMixins`, and treated like the game split's remote-combat step because it holds the event allowlists. A full read confirms the mechanism (§1.1):
- `Net` is one class. Its methods reach each other only through `this`, and no method spans two groups.
- Its module-level names are constants and four small helpers. Five of them would be read by more than one new file, so they need a module of their own.
- No validator runs it. The page test swaps it for a recording fake, and 5 validators pin 40 checks of its text. So the proof has to run it, against a fake PeerJS.

This doc's §2 replaces the map-layout plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `c704aed`, `77d08da`, `0f247bd` and `33b4cbd`, one per step in §1.8. js/net.js went from 874 lines to 132, and the largest file in js/net/ is host.js, at 308. `count_lines.py` now finds 11 files with 2,403 lines over the cap, with index.html the largest. It went as planned, with these notes:
- **Actual line counts** are within two lines of the §1.3 estimates.

  | Module | Lines |
  |---|---|
  | js/net.js | 132 |
  | identity | 42 |
  | host | 308 |
  | join | 123 |
  | lobby | 83 |
  | voice | 233 |

  The entry was 768 lines after step 1, 543 after step 2, and 431 after step 3, where it came under the cap.
- **How the moves were made.** A throwaway script wrote each step's files from the 874-line file by the ranges in §1.3, then checked them on disk. None of it was committed. It checked that:
  - the ranges tile the file: every code or comment line outside the import block (6–19) lands in exactly one file, and every blank line in at most one;
  - each file keeps net.js's line order;
  - the files on disk are exactly the text the plan asks for.
- **The proof ran as §1.8 describes.**
  - The baseline, run twice, matched itself. It prints 1,984 lines (219 KB): every member of `Net.prototype` with its flags and a hash of its source, then 87 acts against a recording PeerJS, clock, microphone, audio elements and analysers, each with the calls, sends, callbacks, timers, return value and the instance's fields.
  - After steps 1, 2, 3 and 4, the output matched the baseline byte for byte.
- **The name check** is the one in §1.8. It passes at every step, and it was shown to fail on the pre-split file with the `audio` import dropped, with an unused import added, and with a contract name dropped from the import.
- **The silent failure in §1.1 was demonstrated.** With voice.js's `audio` import left out, nothing throws: 61 lines of the proof change, `_myAnalyser` and `_myData` read null, and no analyser is ever built, so no speaking mark would light. Voice still plays. The name check names it.
- **The diff review.** At every step, `git diff --color-moved=zebra` showed as new only: file headers and imports, the class lines and their closing braces, identity.js's export line, the install and its comment, the entry's header sentence in step 4, the tooling in step 1, and README.md's two lines in step 4.
- **test-net-modules.mjs is 98 lines,** rather than ~80. It was run on copies of the tree with 12 mistakes, and failed on each: a lobby.js that imports the entry, a host.js that reaches the entry through `js/net/..`, an install that leaves NetLobby out, an entry that imports `./net/Lobby.js`, an entry that drops its join.js import, an identity.js that imports utils.js, an identity.js that exports a class, a second class in lobby.js, a second export from net.js, a `readNetSource()` that reads only net.js, a method defined in both the entry and a mixin, and a voice.js that imports lobby.js.
  - Its doctored miscase is `./net/Lobby.js`, not §1.7's `./net/Host.js`, so that the check means something at every step: lobby.js exists from step 1, host.js only from step 4.
- **The validators number 61,** and all of them passed after every step. The 60 before step 1 passed too.
- **The proof turned up one bug,** fixed in `50d8f9e` after the split rather than inside it, so that every moved line stayed verbatim: a lobby code nobody is hosting rejected with "Could not connect: peer-unavailable", and "Lobby not found. Check the code." could never be shown. PeerJS reports an unknown peer id as an error on the peer itself, after its socket is open, and `join()`'s outer error handler — added first, so called first — always answered before the handler inside `'open'` that knows what a bad code means. The outer one now stands down once the peer is open. test-multiplayer-contracts pins the guard and the message, and step 3's browser check below now reads true.
- **The standing check from §1.7 was added after the split,** as scripts/test-net-session.mjs, with the fakes it needs in scripts/lib/headless-peerjs.mjs. That makes 62 validators, and js/net.js and js/net/ the only code in js/ that a validator now runs end to end.
  - 62 checks: admission and hello, the gate (unknown, host-only, malformed and oversized packets, the rate floors, the packet cap), the stamped shooter id and the throttled shot relay, sanitized perk animations, clamped player state, a reconnect that reclaims its seat, a full lobby, a mid-match knock, the stale sweep, teardown; the guest's reader; and voice policy, pairing, answers, mutes, ducking and teardown.
  - It was run on copies of the tree with eleven broken behaviours, and failed on each: the allowlists dropped, the hello requirement dropped, the rate floors or the packet cap removed, a trusted sender id, an unthrottled shot relay, a reconnect that no longer replaces its peer, voice that answers anyone, voice that calls both ways, no ducking, and the join error handler from before `50d8f9e`.
- **Browser checks.** None has been run. All four need a local server, two or three windows, and PeerJS's public server.

None of the dead code in §1.9 was touched. Everything in §1.10 is done.

```
12 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
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

Total excess lines: 2777
```

The plan has two parts:
1. `js/net.js`: `Net` keeps its state, sending and teardown. Four groups of methods move verbatim into mixins in js/net/, and the names both sides share move into a fifth module.
2. The other 11 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/net.js: 874 lines → js/net.js (~133) + 5 modules in js/net/

### 1.1 What's in it

The file exports one name, `Net`. It hasn't changed since the initial release.
- **Only js/main.js imports it** (8), with no cache token. main.js constructs it when you host (67) or join (135).
- **Everything else reaches the instance:** main.js, five files in js/main/ (lobby.js, lifecycle.js, cheats.js, characters.js, options.js), js/game.js, js/game/netcode.js and js/game/camera-hud.js.
- **Nothing in scripts/ imports it.** scripts/lib/headless-page.mjs, which test-main-page uses, replaces it with a recording fake (270). Its resolve hook matches the exact path of js/net.js.

It imports `genCode` (utils.js), `audio` (audio.js) and 10 names from multiplayer-contracts.js. PeerJS's `Peer` is a global, from the classic script index.html loads (97).

| Lines | Contents | Read or called by |
|---|---|---|
| 1–5 | The header | |
| 6–19 | The imports | |
| 21–22 | `PREFIX`, `MAX_PLAYERS` | `PREFIX`: `host`, `join`, `_isAllowedVoicePeer`. `MAX_PLAYERS`: `_hostAccept`, `_hostData`, `join`, `_clientData` |
| 23–25 | `HEARTBEAT_INTERVAL_MS`, `PEER_TIMEOUT_MS`, `PEER_SWEEP_INTERVAL_MS` | `_startHeartbeat`; `_pruneStalePeers`; `_startPeerSweep` |
| 26–27 | `CLIENT_ID_KEY`, `PERSONAS` | `clientIdentity`; `cleanPersona` |
| 28–59 | `CLIENT_EVENTS` (35 types), `HOST_ONLY_EVENTS` (27), `EVENT_MIN_MS`, `SHOT_RELAY_MIN_MS` | `_hostData`, `_allowEvent` |
| 61–76 | `cleanName`, `cleanPersona`, `cleanClientId` | The first two: `host`, `_hostData`, `setPersona`, `setName`, `join`, `_clientData`. `cleanClientId`: `clientIdentity`, `_hostAccept`, `_hostData` |
| 78–91 | `clientIdentity`: the browser's stable id, kept in localStorage | The constructor (100) |
| 93–137 | The class opens: the constructor, `connected`, `myId` | `connected`: `_closed`. `myId`: game.js, camera-hud.js, js/main/characters.js, js/main/lobby.js |
| 139–263 | The "hosting" banner: `host`, `_hostAccept`, `_attachHostConn`, `_dropPeer` | main.js (69) calls `host` |
| 265–272 | `_cleanupPeerVoice` | `_dropPeer`, `_clientData` |
| 274–375 | `_hostData`: the gate every guest packet passes | `_attachHostConn` (235) |
| 377–403 | `_allowMessage`, `_allowEvent`, `_startPeerSweep`, `_pruneStalePeers` | `_allowMessage`: `_hostData`, and `join` for the host's packets (513, 516) |
| 405–408 | `_startHeartbeat` | Only `join` (509) |
| 410–485 | The lobby: `_broadcastLobby`, `setLobbyCheats`, `setLobbyVoiceEnabled`, `resetLobbyReady`, `setPersona`, `setName`, `setReady`, `majorityReady`, `startGame` | main.js; js/main/lobby.js, lifecycle.js, cheats.js, characters.js |
| 487–589 | The "joining" banner: `join`, `_clientData`, `_closed` | main.js (137) calls `join` |
| 591–601 | The "send" banner: `_broadcastRel`, `_broadcastUnrel` | `_hostData`, `_broadcastLobby`, `startGame`, `sendRel`, `sendUnrel` |
| 602–731 | The "voice chat" banner: `_setupVoiceAnswer`, `_isAllowedVoicePeer`, `enableVoice`, `syncVoiceCalls`, `_shouldCall`, `_callPeer`, `_wireMediaConn` | `enableVoice`: game.js (249), main.js (189), js/main/lobby.js (19) |
| 733–817 | The "voice streams" banner: `_attachVoiceStream`, `_detachVoiceStream`, `_detachAllVoice`, `mutePeer`, `updateVoiceSpeaking`, `setVoiceVolume`, `setMicMuted`, `disableVoice` | main.js, game.js (461), camera-hud.js, js/main/lobby.js, js/main/options.js |
| 819–834 | `sendRel`, `sendUnrel`, `leave` | js/game/netcode.js (59, 167, 173); main.js (148), js/main/lifecycle.js (133) |
| 836–873 | `_teardown`: stops every timer and call, and resets every field | `leave`, `_closed` |
| 874 | The class closes | |

Five facts shape the plan:
- **It's one class, and its parts reach each other only through `this`.**
  - No class fields, statics, `super` or private names. It has 44 methods and two getters, and no two share a name, so `installMixins` has nothing to reject.
  - The fields live on the instance. `myPersona`, `hostConn`, `_mediaPeers`, `_enableVoicePromise`, `_voiceAnswerWired`, `_nextVoiceMeter`, `_heartbeatTimer` and `_peerSweepTimer` aren't in the constructor, and are created on first use. Moving a method can't split a field.
- **Its module-level names fall three ways.**
  - The event tables, the rate table, the shot relay budget and the sweep's timings are read only by the host's methods. `HEARTBEAT_INTERVAL_MS` is read only by `_startHeartbeat`.
  - `PREFIX`, `MAX_PLAYERS`, `cleanName`, `cleanPersona` and `cleanClientId` are each read by two or more of the groups in §1.2, or by one group and `clientIdentity`. A mixin can't import them from js/net.js, which installs it.
  - `clientIdentity` serves only the constructor, but it calls `cleanClientId`.
  - There's no `let` at module level, and nothing runs at load but the tables.
- **The file's order doesn't follow its banners.**
  - `_cleanupPeerVoice` (265) sits between `_dropPeer` and `_hostData`, but it's voice cleanup.
  - `_startHeartbeat` (405) sits under "hosting", but only `join` calls it.
  - The lobby's methods (410–485) sit under "hosting" too, but `setPersona`, `setName`, `setReady` and `resetLobbyReady` each have a guest branch.
- **Nothing runs `Net` outside a browser.**
  - So a moved method that uses a name its file doesn't import fails only when that line runs: in co-op, in a browser.
  - Some of those failures are silent. `enableVoice` and `_attachVoiceStream` call `audio` inside a `try` with an empty `catch` (662–669, 744–751). Without the import, voices still play, but no analyser is made, so no speaking mark ever lights.
  - The rest throw inside PeerJS's `on('open')` and `on('data')` callbacks, and the connection stalls.
  - So the proof in §1.8 runs every method against a fake PeerJS, and checks each file's names.
- **5 validators pin 40 checks of its text** (§1.7). Two of them slice it between two markers. Both slices stay inside one new file.

### 1.2 Mechanism

**`Net` becomes a core plus four mixins,** installed the way js/game.js, js/audio.js and js/zombies/manager.js install theirs. js/net.js keeps the constructor, the two getters, the four send methods, `leave` and `_teardown`.

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `NetHost` (host.js) | `host`, `_hostAccept`, `_attachHostConn`, `_dropPeer`, `_hostData`, `_allowMessage`, `_allowEvent`, `_startPeerSweep`, `_pruneStalePeers`. With `PEER_TIMEOUT_MS`, `PEER_SWEEP_INTERVAL_MS`, `CLIENT_EVENTS`, `HOST_ONLY_EVENTS`, `EVENT_MIN_MS` and `SHOT_RELAY_MIN_MS`. | The host's side of every connection: opening the lobby, admitting and authenticating a guest, and gating every packet it sends. This is the anti-cheat: the allowlists, the rate limits and the sender ids the host stamps itself. `_dropPeer` belongs here, because admission, `hello`, `leave` and the sweep all end in it. `join` also calls `_allowMessage`, through `this`. |
| `NetJoin` (join.js) | `_startHeartbeat`, `join`, `_clientData`, `_closed`. With `HEARTBEAT_INTERVAL_MS`. | The guest's side: connecting both channels to the host, the heartbeat, reading what the host sends, and closing when the host goes. Apart from main.js's call to `join`, only this group calls these four methods. |
| `NetLobby` (lobby.js) | `_broadcastLobby`, `setLobbyCheats`, `setLobbyVoiceEnabled`, `resetLobbyReady`, `setPersona`, `setName`, `setReady`, `majorityReady`, `startGame` | The roster and the host's settings: the calls the lobby screen makes. Each one changes `lobbyPlayers`, `lobbyCheats`, `lobbyVoiceEnabled` or `matchActive`. Then the host broadcasts it, or the guest asks the host. |
| `NetVoice` (voice.js) | `_cleanupPeerVoice`; the "voice chat" banner through `_wireMediaConn`; the "voice streams" banner through `disableVoice` | Voice chat end to end, as the file's header says: the microphone, the full-mesh calls, the audio elements, the analysers and the mutes. It's the only group that uses `audio`, `navigator.mediaDevices` or `document`. |

**js/net/identity.js holds the names more than one file reads:** `PREFIX`, `MAX_PLAYERS`, `CLIENT_ID_KEY`, `PERSONAS`, `cleanName`, `cleanPersona`, `cleanClientId` and `clientIdentity`.
- It imports nothing.
- It ends with `export { PREFIX, MAX_PLAYERS, cleanName, cleanPersona, cleanClientId, clientIdentity };`, so every moved line stays unchanged, the way engine-fallbacks.js exports `midi`.
- `CLIENT_ID_KEY` and `PERSONAS` stay private.

js/net.js ends:

```js
// Net's methods are split by side across js/net/. Each file is a class whose
// methods are copied onto Net.prototype here: one `this`, one connection to
// every caller. A name defined twice is a split mistake, so it fails at load.
installMixins(Net, [NetHost, NetJoin, NetLobby, NetVoice]);
```

Each step adds its class to that list, which stays in file-name order.

What this buys:
- **No caller changes.** main.js still imports `Net` from ./net.js, and every caller reaches the methods through the instance. headless-page.mjs's fake still replaces js/net.js by its path.
- **Every moved line is unchanged.** That includes the tables' comments and the five banners, each of which lands with the code under it.
- **The imports go one way.** identity.js imports nothing. Each mixin imports identity.js and modules outside js/net/, and never another mixin. The entry imports all five.
- **A method defined twice fails at load,** through `installMixins`.
- **Each order-dependent pin stays inside one file** (§1.7).

Rejected alternatives:
- **The shared names left in js/net.js.** The mixins would import them from the entry that installs them: a cycle, and against the rule every split has kept.
- **The helpers moved into js/multiplayer-contracts.js.** `cleanName` and `cleanPersona` are wire rules, and that's the rules module. But the move changes a module's exports and its tests' imports, which makes it a refactor, not a split.
- **A copy of each helper in each file that reads it.** That's three copies of `PREFIX` and three of `cleanName`: duplicated code.
- **One module per banner.**
  - "hosting" would take the lobby, `_cleanupPeerVoice` and `_startHeartbeat`, which serve guests and voice.
  - "voice chat" and "voice streams" would be ~130 and ~85 lines calling each other both ways. `_wireMediaConn` attaches and detaches streams, and `disableVoice` closes calls.
  - "send" is 11 lines.
- **The message gate in a module of its own** (`_hostData`, the two budgets and the tables, ~150 lines), apart from admission (~150). It's the most sensitive code, and its own file would name it. But:
  - The gate's `hello` and `leave` end in `_dropPeer`, and admission hands every packet to the gate.
  - test-multiplayer-contracts slices from `_dropPeer` to `_hostData` in one text. In `readNetSource()`'s path order, a gate file that sorts before the admission file puts `_hostData` first, and the slice comes back empty.
- **The lobby left in js/net.js** (~210 lines). It's under the cap. But nothing in the core calls the lobby, and in a file of its own it names what the lobby screen drives.
- **The class moved to js/net/core.js, with js/net.js only re-exporting `Net`,** as js/player.js does. The class would still need the same four mixins. The core would move for no gain.
- **`?v=` tokens on the new imports.**
  - None of the earlier split files has a token.
  - `assertMethodFilesInstalled` loads each file without a token. So it would get a second copy of each class, and every method check would fail.

### 1.3 Target modules

| Module | Takes from net.js | ≈ lines |
|---|---|---|
| `js/net.js` | 1–5, the header, plus a sentence. The imports it still uses (§1.4). 93–137: the class line, the constructor, `connected`, `myId`. 591–601: the "send" banner, `_broadcastRel`, `_broadcastUnrel`. 819–874: `sendRel`, `sendUnrel`, `leave`, `_teardown` and the closing brace. The install. | 133 |
| `js/net/identity.js` | 21–22 and 26–27, as one block: `PREFIX`, `MAX_PLAYERS`, `CLIENT_ID_KEY`, `PERSONAS`. 61–91: `cleanName`, `cleanPersona`, `cleanClientId`, `clientIdentity`. The export line. | 42 |
| `js/net/host.js` | 24–25 and 28–59, as one block: the sweep's timings, the event tables, `EVENT_MIN_MS`, `SHOT_RELAY_MIN_MS`. 139–263: the "hosting" banner through `_dropPeer`. 274–403: `_hostData` through `_pruneStalePeers`. | 310 |
| `js/net/join.js` | 23, `HEARTBEAT_INTERVAL_MS`. 405–408, `_startHeartbeat`. 487–589: the "joining" banner through `_closed`. | 123 |
| `js/net/lobby.js` | 410–485: `_broadcastLobby` through `startGame` | 83 |
| `js/net/voice.js` | 265–272, `_cleanupPeerVoice`. 602–817: the "voice chat" banner through `disableVoice`. | 233 |

Outside the imports and the blank lines between blocks, each line of net.js ends up in exactly one of these files. The core keeps the constructor, both getters and 6 methods. The host takes 9, join 4, the lobby 9 and voice 16. The largest file is host.js, at ~310.

Rules for the new lines:
- **Members keep the file's relative order.** In each file the constants come first, then the class. So join.js's "joining" banner follows `_startHeartbeat`, and voice.js's "voice chat" banner follows `_cleanupPeerVoice`.
- **Headers.** Each mixin file opens with a comment naming its side of the connection, then: "Methods of Net: js/net.js copies them onto Net.prototype." identity.js's comment says that js/net.js and every module in js/net/ read it, and that it imports nothing.
- **Exports.** Each mixin file exports its class, as `export class`. identity.js ends with its export line.
- **File names are lower case,** and the folder is named after its entry. Import specifiers must spell both exactly: macOS resolves a wrong case, and Vercel doesn't. The new test checks this (§1.7).
- **No new comment may quote pinned text** (§1.7). A copy in a comment would keep a pin passing even if the code were gone.
- **An import names only what its file reads.** The proof's name check covers it (§1.8).

### 1.4 What stays in js/net.js

After step 4:

```js
// Networking: PeerJS/WebRTC host-authoritative model.
// … 2–5, verbatim …
// Net's methods are in js/net/, one file per side of the connection, installed below.
import { installMixins } from './utils.js';
import { clientIdentity } from './net/identity.js';
import { NetHost } from './net/host.js';
import { NetJoin } from './net/join.js';
import { NetLobby } from './net/lobby.js';
import { NetVoice } from './net/voice.js';

export class Net {
  // … 94–137, verbatim: the constructor, connected, myId …

  // … 591–601, verbatim: the "send" banner, _broadcastRel, _broadcastUnrel …

  // … 819–873, verbatim: sendRel, sendUnrel, leave, _teardown …
}

// … the install, as in §1.2 …
```

The file still exports one name, `Net`.

**During steps 1–3,** the entry keeps the methods that haven't moved, and imports what they read.

| After step | The entry imports from js/net/ | For |
|---|---|---|
| 1 | `PREFIX, MAX_PLAYERS, cleanName, cleanPersona, cleanClientId, clientIdentity` (./net/identity.js); `NetLobby` | The constructor, and the host, join and voice methods still in the entry |
| 2 | The same, plus `NetVoice` | The host's and join's methods still read all five names |
| 3 | The same, plus `NetJoin` | The host's methods still read all five names |
| 4 | `clientIdentity`, and all four classes | The constructor |

Its other imports shrink step by step:
- Step 1 adds `installMixins` to line 6's import, `import { genCode, installMixins } from './utils.js';`. Step 4 drops `genCode`.
- Step 2 drops the `audio` import (7).
- Step 3 drops `departedLobbyPlayers`, `isValidSnapshotPayload` and `shouldHandleRemoteClose` from the contracts import. Step 4 drops the rest of it.
- The header sentence comes in step 4.

**No caller changes:**
- js/main.js, which imports `Net`
- the five files in js/main/, js/game.js, js/game/netcode.js and js/game/camera-hud.js, which use the instance
- headless-page.mjs's fake, which replaces js/net.js by its path

### 1.5 Imports

Paths are relative to js/net/.

| File | Imports |
|---|---|
| identity.js | Nothing |
| host.js | `genCode` (../utils.js); `availableLobbyColor, isValidNetworkPayload, peerConnectionIsCurrent, removeLobbyPeer, sanitizePerkAnimation, stableClientReplacement, stalePeerIds` (../multiplayer-contracts.js); `PREFIX, MAX_PLAYERS, cleanName, cleanPersona, cleanClientId` (./identity.js) |
| join.js | `departedLobbyPlayers, isValidNetworkPayload, isValidSnapshotPayload, shouldHandleRemoteClose` (../multiplayer-contracts.js); `PREFIX, MAX_PLAYERS, cleanName, cleanPersona` (./identity.js) |
| lobby.js | `cleanName, cleanPersona` (./identity.js) |
| voice.js | `audio` (../audio.js); `PREFIX` (./identity.js) |
| js/net.js | `installMixins` (./utils.js); `clientIdentity` (./net/identity.js); the four classes |

Every name net.js imports today is still used, by the files above.

**Cache tokens.**
- main.js imports `./net.js` with no query string, and nothing else imports it.
- The new files get no token, like every split file before them.
- `../audio.js`, `../utils.js` and `../multiplayer-contracts.js` have no token anywhere in js/, so each stays a single module instance. test-audio-modules checks the query string of every relative import in js/, the new files included.
- vercel.json serves /js/ with `max-age=0`, so browsers revalidate the new files on every load.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP's `script-src 'self'` allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore has no pattern that matches js/net/, and it mustn't. This folder ships.
- The page fetches five more small modules when it loads.

**Load order.**
- `installMixins` runs as js/net.js evaluates, right after the class. main.js constructs `Net` only when you host or join.
- The only moved code that runs at load is the tables. identity.js defines four constants and four functions.
- The modules net.js imports today evaluate in a slightly different order within its graph. None of them reads another at load. audio.js has already run by then, from main.js's import on line 7, and so has config.js, the only import of multiplayer-contracts.js, from line 5.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No module in js/net/ imports js/net.js.** The new test enforces it.
- **The folder's imports go one way.** identity.js imports nothing. Each mixin imports only identity.js from the folder, never another mixin: they reach each other through `this`. The new test enforces this too.
- **Nothing leads back in.** Only js/main.js imports js/net.js, and nothing in js/ imports main.js: index.html loads it. So no import out of js/net/ can lead back to js/net.js.

A cycle here would be worse than untidy. js/net.js is in main.js's static graph, so an error while it loads would stop main.js: the menu would render, but no button would work.

### 1.7 Validators

**Text pins (5 files, 40 checks).** These validators read `js/net.js` by path:

| Validator | Checks | Where the pinned text ends up |
|---|---|---|
| test-multiplayer-contracts | 22 (244–268, 314) | host.js 10, voice.js 5, join.js 3, lobby.js 2, js/net.js 2 |
| validate-game-invariants | 13 (254–255, 257–259, 277–278, 297, 394, 398–399, 407–408) | host.js 5, lobby.js 3, voice.js 3, join.js 1, js/net.js 1 |
| validate-remote-avatar | 3 (174–180) | host.js |
| validate-round-systems | 1 (38) | host.js |
| validate-perk-drink | 1 (91) | host.js |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readNetSource()` calls `readSplitSource(js, 'net', '.js')`. It returns js/net.js, then every .js file under js/net/ in path order, joined.
   - The file's header comment gains a sentence.
   - It lands in step 1, with the first two modules. `readSplitSource` reads the folder, and throws if there isn't one.
2. **Switch the reads.**
   - test-multiplayer-contracts, validate-game-invariants and validate-perk-drink swap the `readFile` of js/net.js in their `Promise.all` for `readNetSource()`.
   - validate-remote-avatar and validate-round-systems swap their `readFileSync` of it.
   - Each adds the name to its existing import from `./lib/game-source.mjs`.
   - validate-round-systems then has no other use for `fs`, so its `import fs from 'node:fs';` goes. The other four still read other files.

No pin changes:
- **The two slices each stay inside host.js.**
  - test-multiplayer-contracts (258–262) slices from `_dropPeer(id,` to `_hostData(fromId`, and needs `this.peers.delete(id)` before `p.r?.close()` inside it. Both methods move to host.js, in that order. `_cleanupPeerVoice`, which sits between them today, leaves for voice.js, so the slice gets shorter and still holds both.
  - validate-remote-avatar (176) slices from `      case 'shoot': {` to `      case 'hello': {`. Both lines are in `_hostData`, and no other file has either.
  - Neither slice passes by coming back empty. Both `indexOf`s would give -1, and `-1 < -1` and an empty `includes` both fail.
- **Each `[\s\S]{0,N}` pattern spans one method or one table,** and each stays whole.
- **None of the 40 is negative.** A pinned string that turned up in a new comment could keep its check passing with the code gone, hence the rule in §1.3.

**Behavioural checks: none run `Net`, and none has to change.**
- Nothing in scripts/ imports js/net.js. test-main-page goes through headless-page.mjs, whose fake replaces js/net.js. So the split can't break it, and it can't catch a mistake in the split.
- **test-multiplayer-contracts** and **validate-host-guest-combat** run the pure rules the host's and the guest's methods call. Those don't move.
- **validate-module-syntax** walks js/ recursively, so it parses the new files.
- **test-audio-modules** checks every relative import's query string, the new files' included.

**New: `scripts/test-net-modules.mjs` (~80 lines).** This is the net counterpart of test-audio-modules. Every check holds at every step. It checks:
- **js/net.js exports exactly `Net`.**
- **No module in js/net/ imports js/net.js,** through `assertNoImportOf`.
- **The mixins are installed.** Every module in js/net/ except identity.js exports one class, and every method of it is on `Net.prototype`, through `assertMethodFilesInstalled(Net, 'net', …)`. identity.js exports no class.
- **The imports go one way.**
  - identity.js imports nothing.
  - Each mixin imports at most `./identity.js` from the folder, plus modules outside it. A mixin that imports another mixin fails.
  - js/net.js imports every module in the folder. Each specifier names a file that exists with exactly that case, through `onDisk`.
  - The rule also runs on a doctored list in which lobby.js imports `./host.js`, and on an entry that imports `./net/Host.js`. It must reject both.
- **`readNetSource()` holds every file,** through `assertSourceHolds`.

It takes `assertMethodFilesInstalled`, `assertNoImportOf`, `assertSourceHolds`, `importsOf` and `onDisk` from scripts/lib/split-modules.mjs, and copies none of them. split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 61.

**What still isn't caught.**
- **A name a moved method reads and its file doesn't import.**
  - Nothing runs `Net`, so the error waits until that line runs, in co-op, in a browser.
  - Around `audio`, a `try` swallows it (§1.1).
  - The proof's name check and its fake-PeerJS session cover the split itself (§1.8).
- **A standing check is possible.**
  - The proof's fake PeerJS could be committed as `scripts/test-net-session.mjs`. It would host a lobby, admit guests, feed the gate good and bad traffic, join as a guest and run voice. It would assert what each side sends and calls back.
  - It would catch a missing name on every run, during the split and after it. It would also be the first test that runs the host's anti-cheat gate.
  - It isn't one of the steps. Whether to add it is John's call.
- **Real PeerJS and WebRTC.** Only the browser checks cover them.

**No validator splits.** All five are under 500 lines, and each covers more than net.js:

| Validator | Lines | Covers in js/net.js and js/net/ |
|---|---|---|
| validate-game-invariants | 463 | Every file but identity.js |
| test-multiplayer-contracts | 350 | Every file but identity.js |
| validate-remote-avatar | 217 | host.js |
| validate-perk-drink | 109 | host.js |
| validate-round-systems | 40 | host.js |

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

Why this order:
- **A mixin can move only once everything it imports is outside the entry,** because no module may import the entry. identity.js holds what every other module imports, so it goes first.
- **identity.js and the lobby go first, with the tooling.** Both are small, and the lobby reads only identity.js's cleaners. Five pins move with the lobby, so step 1 tries the source helper on real pins.
- **Voice goes second.** It's the second-largest move, and its failures are the silent kind (§1.1), so it gets a step and a proof run of its own.
- **join.js goes third.** A mistake stops a guest from joining, which the co-op check shows at once. The entry drops under the cap here.
- **The host goes last.** Every guest packet passes through it. A mistake is either a throw in PeerJS's data callback or a packet let through that shouldn't be. It's the highest-risk group, like the game split's remote-combat step, and it leaves the entry as in §1.4.

| # | Change | Out of the file | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readNetSource()`, with the 5 validators switched; `test-net-modules.mjs`, with split-modules.mjs's header; **identity.js** and **lobby.js**; the entry's imports from them, and the install | ~110, leaving ~765 | Very low. identity.js is four constants and four functions that read nothing outside it. The lobby's methods read only two of them. Every other reader of the moved names is still in the entry, importing them back. | The lobby check below |
| 2 | **voice.js** | ~225, leaving ~540 | Low to medium. A missing `audio` import is swallowed (§1.1). Calls and streams are asynchronous, and nothing but the proof runs them. | The voice check below |
| 3 | **join.js** | ~110, leaving ~430 | Medium. A mistake stops a guest from joining, or from leaving cleanly. | The join check below |
| 4 | **host.js**; the entry as in §1.4, with its header sentence; README.md's layout lines | ~295, leaving ~133 | Highest. This is the gate for every guest packet, plus admission. | The host check below |

**Browser checks.** They need a local server, two or three browser windows, and PeerJS's public server, so an internet connection. Ask John before starting a server, and stop it when the check is done. Keep DevTools' console open in every window: any error fails the check. Solo never constructs `Net`, so every check is co-op.
- **Lobby, after step 1.**
  - Host in one window, and join by code in another. Both rosters list both players, each in their color.
  - Rename, change soldier and ready up on each side, and watch the other window follow.
  - The host's cheat codes show in the guest's preview.
  - Turn voice chat off in the host's options. The guest's lobby reads "VOICE: OFF", disabled by host.
  - Ready a majority, and start.
- **Voice, after step 2.**
  - Both windows allow the microphone. Speak in one: its speaking mark lights in the other's lobby, and in a match the HUD names the speaker.
  - Mute the other player from your lobby: you stop hearing them, and their mark stays off.
  - As the guest, click "MIC: ON": it reads "MIC: MUTED", and the host stops hearing you. The pause menu's mic button does the same.
  - The voice volume in Options changes the other voice.
  - A third window joins while two are talking. All three hear each other.
  - Leave the lobby: the browser's microphone indicator goes out.
- **Join, after step 3.**
  - Join by code, and by the invite link. A code with no lobby says "Lobby not found".
  - Start a match, then try to join from a third window. It's turned away with "Match in progress".
  - The host quits to the menu. The guest lands on the menu with "The host left or lost connection".
  - After a match, return to the lobby. Both players are still in it.
- **Host, after step 4.**
  - Host, and join with two guests. The guests' movement, shots and purchases show on the host. Each guest sees the other guest's muzzle flashes, which the host relays.
  - A guest drinks a perk, and every window sees the animation.
  - A guest reloads its page and rejoins by code. It takes one row in the roster, not two.
  - Play one normal round and one dog round. Round 5 is the first dog round, and the cheats menu's start round can jump to it. On each guest, zombies and hounds move and die as they do on the host, and the guest's hits score.
  - Close a guest's tab. The host's roster drops that player.

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script outside the repo, not committed.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Load js/net.js and js/audio.js through headless-three.mjs's `loadGameModule`. Seed `Math.random` with headless-map.mjs's `seedRandom`, so lobby codes repeat.
   - Before any call, install stand-ins:
     - **A recording PeerJS.** `globalThis.Peer` makes peers whose handlers the script fires: `open`, `connection`, `call` and `error`. It records `connect`, `call` and `destroy`. Its data connections record `send` and `close`, and can fire `close` synchronously, as the comment at 247–249 allows. Its media connections record `answer` and `close`. A handler that throws is caught and its error printed, so a missing name shows up as a changed line, not a stopped run.
     - **A fake clock.** `performance.now`, `Date.now`, `setTimeout`, `clearTimeout`, `setInterval` and `clearInterval` run on a clock and a timer queue the script advances.
     - **A fake `localStorage` and `crypto.randomUUID`,** so `clientIdentity` gives the same id each run. One more construction runs with neither, for the fallback id.
     - **A recording microphone.** `navigator.mediaDevices.getUserMedia` resolves, rejects, or waits for the script to settle it. Its tracks record `enabled`, `contentHint` and `stop`.
     - **Recording audio elements.** `document.createElement('audio')` and `document.body`, over headless-three's stub.
     - **Recording analysers.** `audio.init` and `audio.ctx` are replaced on the singleton. Each analyser fills its buffer from a script: silence, speech, and three people talking at once.
   - Name every peer, connection, call, track, element and timer by creation order.
2. **What it prints.**
   - **The prototype.**
     - Every property name on `Net.prototype`, sorted, with its kind.
     - For each method and getter, a SHA-256 of its source text from `Function.prototype.toString`. The moves are verbatim, so these must match.
     - `Net` itself isn't hashed. A class's text is its whole body, which the split shortens on purpose.
   - **A scripted session. Each call is listed with its inputs.**
     - **Hosting.** `host` with `unavailable-id` twice before it opens; with a fourth failure; and timing out. A guest whose unreliable channel arrives before its reliable one, and one whose partner never comes.
     - **The gate.** `hello`, `name`, `persona`, `ready`, `heartbeat`. Every client type, every host-only type, an unknown type, a message before `hello`, and a payload `isValidNetworkPayload` rejects. `shoot` inside and outside the 55 ms relay budget. `perk_anim`, valid and not. Snapshots with NaN and out-of-range numbers. 121 reliable and 46 unreliable packets inside one second, and each `EVENT_MIN_MS` type twice inside its floor.
     - **Admission.** A second connection with the same client id, a `hello` with a different one, a guest that never says `hello`, a fourth guest, a join during a match, `leave`, and 20 s of silence for the sweep.
     - **The lobby, as host and as guest.** Every method, including `setLobbyCheats` with a value JSON can't copy, `setPersona` with an unknown soldier, and `majorityReady` with one to four players.
     - **Joining.** `join` with a messy code. Every branch of `_clientData`: a lobby (valid, too many players, a player gone), a start, a reject, and a gameplay event. Snapshots valid and not, and a flood. `close` and `error` from the current connection and from a replaced one. A `peer-unavailable` error before opening, another error, and a timeout.
     - **Voice, on both sides.** `enableVoice` with voice off, with the microphone granted, refused, and granted after `disableVoice` has bumped the generation. Calls from an allowed peer and from a stranger, before and after the stream exists, and past 8 s. `stream`, `close` and `error`, including an old call closing after its replacement. `syncVoiceCalls` after a late join, `mutePeer`, `updateVoiceSpeaking` on each analyser script, `setVoiceVolume` with 2 and `'x'`, `setMicMuted` and `disableVoice`.
     - **The end.** `sendRel` and `sendUnrel` on each side, `leave`, and a packet that arrives after teardown.
   - **After every call:**
     - the PeerJS calls and sends recorded since the previous call
     - the callbacks fired, with their arguments
     - the timers set, cleared and fired
     - the return value, or the error
     - the instance's fields, with Maps and Sets in insertion order
3. **After each step, run it again.** The output must match the baseline byte for byte.
4. **Review the diff.**
   - **Check the moves.** A script cuts each module from the pre-split file by the ranges in §1.3. Every line that left net.js must appear verbatim, in order, in the file meant to hold it.
   - **Check the names.**
     - Each file reads only module-level names it declares or imports. `Peer`, `document`, `navigator`, `performance` and `globalThis` are globals.
     - Each file uses every name it imports.
   - **Run `git diff --color-moved=zebra`.** The only new lines should be:
     - file headers and imports
     - the class lines and their closing braces, and identity.js's export line
     - the install and its comment, and the entry's header sentence in step 4
     - the tooling in step 1, and README.md's lines in step 4

### 1.9 Found while reading

**Dead or unused code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **`onVoiceStream` and `onVoiceStreamEnd`** (718, 727) are never assigned, in js/ or in scripts/. `_wireMediaConn` calls both through `?.`, so neither call does anything.
- **`mode`** is set in the constructor, `host`, `join` and `_teardown` (95, 153, 497, 856), and nothing reads it. Game has its own `mode`.
- **`HOST_ONLY_EVENTS` never decides anything in `_hostData`** (296).
  - The two sets are disjoint. So a type that passes `CLIENT_EVENTS.has` always fails `HOST_ONLY_EVENTS.has`.
  - Three validators pin its entries, so it serves as the list of what a guest may not send.
- **`monkey_end`** is host-only (37), and the host sends it (js/game/projectiles.js:282). But no handler in js/game/ has a case for it, and test-multiplayer-contracts' list of handled types leaves it out. So each guest drops it.
- **In `_hostData`'s `hello` case, `if (p)` (333) and `p ? p.name : 'Player'` (335) always take the first branch.** Line 322 has already broken out when `p` is missing.

**Duplicated code.** Each copy moves to the same file as its twin, so none of this crosses files.
- `_hostData` looks the sender up three times: `sourcePeer` (278), `peer` in the snapshot branch (281), and `peer` again (295). The `hello` case makes a fourth, `p` (321). All go to host.js.
- `_clientData` works out a player's color with the same expression for `lobby` (545) and `start` (566). Both go to join.js.
- `updateVoiceSpeaking` measures a peak the same way for your microphone (777–779) and for each peer (784–787). Both go to voice.js.
- `this._mediaPeers = this._mediaPeers || new Set();` appears four times (660, 689, 699, 710), because the constructor doesn't create `_mediaPeers`. All four go to voice.js.

### 1.10 Docs and comments

- **js/net.js's header** gains the sentence in §1.4, in step 4.
- **scripts/lib/game-source.mjs's header** gains a sentence for `readNetSource()`, in step 1.
- **scripts/lib/split-modules.mjs's header** gains `test-net-modules.mjs (js/net/)`, in step 1.
- **README.md's layout** replaces `net.js              Peer-to-peer co-op` with two lines, in step 4, as the earlier splits did:
  ```
    net.js              Co-op entry point: connection state, sending, teardown
    net/                Hosting and the host's message gate, joining, the lobby, voice chat, player ids
  ```
- **Unchanged:**
  - README.md's co-op sections name js/multiplayer-contracts.js, not net.js.
  - No comment in js/ names js/net.js.
  - AGENTS.md, RENDERING.md, NOTICE.md and llms.txt don't name the file.
- **Leave as is:**
  - The docs/split-*.md plans cite js/net.js, but they're dated records.
  - README.md's "27 headless validators" was out of date before this plan.

---

## 2. The other 11 files, ranked

None of these files has changed since `docs/split-shaders-plan.md` §2 was written: no commit from `dfda24f` on touches them. The map-layout plan checked the notes' importer counts and validator reads again. The only split since added js/map-layout/, whose modules import nothing, so they still hold. The map-layout plan's verdicts stand, with js/net.js taken out of rank 1, and with index.html's verdict now resting on a full read.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/fx.js | 842 | One class (`FX` 59–780). Use `installMixins`, as §1.2 does. | game.js imports `FX`, and js/map/hand-placed.js imports `BLOOD_DECAL_COLOR`. |
| 2 | js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 3 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 4 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).** A full read for this plan confirms the earlier verdict.
  - **What's in it.**
    - The head is 98 lines: the meta, Open Graph and X tags (37), the JSON-LD block (35), then the font preloads, the stylesheet links, the import map and PeerJS.
    - The markup is 546 lines (99–644): the HUD (83), the main menu (129), character select and the character page (36), cheat codes (57), loading (12), the lobby (56), the two modals (26), options (74), pause (25) and the touch-device gate (22).
    - Three scripts close it (646–879): the device-gate bootstrap (39), the presentation shell with its comment (190), and the menu background's tag (3).
  - **The head has to stay.** Link unfurlers and crawlers read the meta tags and the JSON-LD without running scripts. Browsers don't load an import map from a file.
  - **The markup can't leave without a build step.** HTML has no include, and the repo is served as it is. The only other way is to build the screens from script, and that changes when elements exist:
    - The bootstrap and the presentation shell look elements up as they run, and main.js as it boots.
    - scripts/lib/headless-page.mjs builds its fake DOM from every id in index.html (91).
    - 5 validators pin the markup: validate-game-invariants in 10 places, one negative; test-multiplayer-contracts 3; validate-frame-budget 3; validate-movement-feel 1; test-style-parts 1.
    - The menu is on screen at first paint. Built from script, it would paint late.
  - **The SVGs stay too.**
    - style/10-menu.css applies the wordmark's two filters (202–230) as `url(#fx-title-plasma)` and `url(#fx-title-crackle)`. A bare fragment resolves only inside the page.
    - The skyline's windows (270–273) flicker through `#skyline .win` rules, which can't reach inside an `<img>`.
  - **Only the two inline scripts could move out.**
    - The presentation shell is 183 lines. The bootstrap is 39, and its three specifiers would change, because they resolve against the page, not a module.
    - Moving both leaves ~655 lines, still over the cap.
    - Fetched rather than inline, the shell would no longer be certain to run before main.js boots, as it is today.
