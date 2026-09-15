# Split plan: files over 500 lines

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 26 files with 21,549 lines over the cap.

Part 1 (js/game.js) was carried out on 2026-09-15 in commits `0a1ae24` to `c25aca3`. It went as planned, with three differences:
- The helper is named `readGameSource()`, because two validators already had a local `gameSource`.
- The unreachable bot methods moved to `js/game/bots.js` rather than being deleted.
- The browser checks in §1.8 have not been run yet.

Part 2 has not been started.

The plan is in two parts:
1. `js/game.js`: the largest file, with the cleanest seams.
2. The other 25 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. js/game.js: 4,654 lines → js/game.js (~500) + 15 modules in js/game/

### 1.1 What's in it

`game.js` is one class, `Game`, with 138 methods. The file's own banner comments already mark its domains:
- net and the main loop
- combat input, barks, projectiles, the DG-2, melee, grenades
- bots
- rounds, drops, traps
- interactions, the mystery box, Pack-a-Punch, power and teleporters
- player damage, the net update, the HUD

Two facts shape the plan:
- **Every method shares one `this`.** The class makes 362 direct `this.method()` calls across domains. Any split that changes how methods reach each other rewrites most of the file.
- **Validators depend on the file.** 12 validators regex its text (~140 pins), and 4 more call its methods through `Object.create(Game.prototype)`. The split has to keep both kinds working.

### 1.2 Mechanism: methods move verbatim onto Game.prototype

Each module in `js/game/` exports a class that holds the moved methods exactly as they are today. Names, the 2-space class-body indentation and `this` all stay the same.

```js
// js/game/pack-a-punch.js
import { dist2D } from '../utils.js';
// …
export class GamePackAPunch {
  papUse() { /* unchanged */ }
  // …
}
```

`game.js` keeps `export class Game` and copies those methods onto its prototype once, when the module loads:

```js
for (const part of [GameFramePacing, GameGraphics, /* … */ GameCheats]) {
  for (const key of Object.getOwnPropertyNames(part.prototype)) {
    if (key === 'constructor') continue;
    if (Object.getOwnPropertyDescriptor(Game.prototype, key)) throw new Error(`Game.${key} is defined twice`);
    Object.defineProperty(Game.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key));
  }
}
```

What this buys:
- **No caller changes.** `main.js`, `player.js` and `hud.js` keep calling through the instance:
  - `main.js`: `new Game`, `init`, `setPaused`, `setMicMuted`, `endMatchToLobby`, `applyQuality`, `dispose`
  - `player.js`: `game.onPlayerDown`, `game.netSend`, …
  - `hud.js`: `g.minimapPlayers()`
- **The 4 prototype-driven validators need no changes.** They call these methods on `Object.create(Game.prototype)`: `wallDist`, `wallHit`, `zombieHitTest`, `hitscan`, `_remoteShotTargetAllowed`, `_countFrame`, `_tuneRenderScale`, `renderViewmodel`, `_prewarmShaders`.
- **Regex pins keep matching.** Method text stays byte-identical, so every pin still matches once the validators read the new files (§1.7).
- **A duplicated method fails loudly.** If a method is left in game.js and also copied into a module, the throw fires at import and every validator fails. Without it, one copy would silently win.

Rejected alternatives:
- **Subsystem objects** (`this.box.use()`): these would rewrite every `this.` in ~4,000 lines, every call site and most pins.
- **A subclass chain:** every file would import the previous one, in an arbitrary linear order.

### 1.3 Target modules

| Module | Takes from game.js | ≈ lines |
|---|---|---|
| `js/game.js` | constructor, `isAuthority`, `init`, `tick`, `update`, `setPaused`, `endMatchToLobby`, `exit`, `dispose`, the mixin install | 500 |
| `js/game/frame-pacing.js` | `_countFrame`, `_healHiddenCanvas`, `_tuneRenderScale` | 125 |
| `js/game/graphics.js` | `_initRendering` and `_mountViewmodel` (both new, see §1.4), `_lightBudget`, `applyQuality`, `_updateVolumetricLights`, `_syncPostFxScene`, `_prewarmShaders`, `onResize`, `renderViewmodel`, `_tagViewmodelLayer`, `render`, plus `LAYER_*`, `VIEWMODEL_*`, `MB_BASE_STRENGTH` | 405 |
| `js/game/ballistics.js` | `_installAudioOcclusion` (new), `wallDist`, `wallHit`, `_arcTargetPoint`, `_arcHasLineOfSight`, `_dg2FloorImpact`, `zombieHitTest`, plus `_bodyHit`, `_coverNormal`, `_coverStruck`, `ZOMBIE_HIT_SPHERES`, `CRAWLER_HIT_SPHERES` | 225 |
| `js/game/combat.js` | `handleCombatInput`, `switchWeapon`, `startReload`, `fireWeapon`, `getAimDir`, `hitscan`, `hitFX`, `applyZombieDamage`, `onKillConfirm`, `onZombieKilled`, `awardPoints`, `melee`, plus `ADS_RECOIL_*` | 400 |
| `js/game/projectiles.js` | `spawnProjectile`, `updateProjectiles`, `explodeProjectile`, `fireArc`, `throwGrenade`, `throwMonkey`, `throwEntity`, `updateGrenades`, `updateMonkeyHost` | 290 |
| `js/game/remote-combat.js` | `_newHitClaim`, `_acceptLocalCredit`, `_consumeRemoteCredit`, `_remoteActionReady`, `_remoteShotTargetAllowed`, `_combatEvent`, plus `_shotMuzzle`, `_claimTarget` | 405 |
| `js/game/rounds.js` | `updateRounds`, `_checkGameOver`, `beginRound`, `onDogRound`, `gameOver`, `updateDrops`, `takeDrop`, `applyDrop`, `_roundEvent`, plus `dropId` (exported) | 250 |
| `js/game/interactions.js` | `interactionVisibleFrom`, `beingRevivedState`, `_endReviveAnnounce`, `updateInteract`, `interactInfo`, `doInteract`, `openDoor`, `rebuildBoard`, `setBoards`, `onBoardTorn`, `_interactEvent`, plus `INTERACT_HOLD`, `escapeHtml` | 425 |
| `js/game/machines.js` | `updateTraps`, `setPower`, `teleUse`, `linkTeleporter`, `activateTrap`, `_machineEvent` | 180 |
| `js/game/mystery-box.js` | `boxUse`, `boxStartSpin`, `boxSetIdle`, `updateBox`, `_buildDisplayWeapon`, `_boxCycleShow`, `_makeTeddy`, `_boxEvent`, plus `BOX_*` | 325 |
| `js/game/pack-a-punch.js` | `papUse`, `papStart`, `updatePap`, `_showPapOutputWeapon`, `_clearPapOutputWeapon`, `_syncPapPresentation`, `_revealAcquiredWeapon`, `_stopPapWhirr`, `_papSlot`, `_resetPapState`, `_cancelLocalPapAttempt`, `papTake`, `_papEvent` | 355 |
| `js/game/players.js` | `beginLocalPerkDrink`, `updatePerkDrinks`, `sendPerkDrinkAnimation`, `startRemotePerkDrink`, `bark`, `playBark`, `onZombieDamagePlayer`, `onPlayerDown`, `onPlayerDead`, `respawnSelf`, `applyRevive`, `perkCount`, `_playerEvent` | 300 |
| `js/game/camera-hud.js` | `updateCamera`, `pickSpectate`, `syncSpectateView`, `updateHUD`, `minimapPlayers`, `_computeSpeaking`, `multiplayerRosterRows`, `setMicMuted`, `scoreRows`, plus `NO_SHAKE` | 275 |
| `js/game/netcode.js` | `wireNet`, `netSend`, `_configureRemoteSpawnLoadouts`, `_remoteNear`, `_remoteNearVisible`, `applySnapshot`, `hordeHasPrey`, `packCentroid`, `allPlayerStates`, `_appendPlayerState`, `updateNet`, `onNetEvent` (router), plus `msgIsPlayerState` | 190 |
| `js/game/cheats.js` | `applyCheats` | 115 |

Ordering inside each module:
- Members keep their original relative order.
- Each domain's `_…Event` handler goes last, where `onNetEvent` sat after the domain methods. One pin depends on this (§1.7).

### 1.4 What stays in game.js, and the three init blocks that leave

`game.js` keeps two things:
- the constructor, so all state is declared in one place
- the public entry points: `init`, `tick`, `update`, `setPaused`, `endMatchToLobby`, `exit`, `dispose`

`init` is 255 lines and loses three self-contained blocks. Each block becomes a method that is called from the exact spot where the block sat, so the setup order doesn't change.

**`_initRendering(canvas)`** → graphics.js
- Takes `init` lines 211–267: the renderer, PostFX, the scene and fog, the world camera, the viewmodel camera and the flashlight.
- It belongs in graphics.js because it builds the render pipeline.
- It takes `LAYER_*`, `VIEWMODEL_FOV` and `MB_BASE_STRENGTH` with it, so no constant has to be exported.

**`_mountViewmodel()`** → graphics.js
- Takes `init` lines 331–344: the `vmRoot` lens-compensation block. It is called right after `weaponRig.equip('m1911', false)`.
- It uses only the `VIEWMODEL_*` constants.
- The bare `{ }` goes and its lines de-indent once. No pin reads them, because validate-ads-sight-picture rebuilds the mount itself.

**`_installAudioOcclusion()`** → ballistics.js
- Takes `init` lines 426–445: `audio.setOcclusionTest(…)`.
- It belongs in ballistics.js because it is a segment-vs-collider test, the same family as `wallDist`.

What's left in `init` has to run in order:
1. the map before quality
2. every light before the light pool
3. the pool before the shader prewarm

There is no further seam in it. If `game.js` lands a few lines over 500, leave it.

### 1.5 onNetEvent (659 lines, 55 cases): the one step that isn't a straight move

A single method can't span files, so `onNetEvent`'s switch becomes seven per-domain switches. Each case body moves exactly as written:

```js
  _papEvent(msg, from) {
    const p = this.player;            // only in handlers whose cases use p
    switch (msg.t) {
      case 'pap_req': { … }          // byte-identical, still 6-space indented
      …
    }
  }
```

The router in netcode.js calls all seven handlers in turn. Each switch ignores message types it doesn't own.

```js
  onNetEvent(msg, from) {
    this._combatEvent(msg, from);
    this._roundEvent(msg, from);
    this._interactEvent(msg, from);
    this._playerEvent(msg, from);
    this._machineEvent(msg, from);
    this._boxEvent(msg, from);
    this._papEvent(msg, from);
  }
```

Why this router, rather than a lookup table or a `return` in each case:
- **`break` keeps its meaning.** 13 `break`s are nested inside cases, and one of them exits zhit's claim-search loop instead of the switch. That rules out a mechanical `break` → `return` rewrite.
- **No case falls through today.** All 55 were checked and each ends in `break`, so moving cases between switches is safe.
- **Pins stay pointed at the real handlers.** The router contains no `case` text, so pins such as `/case 'return_lobby'/` can't match a routing line instead.
- **There is no table to keep in sync.** `msg.t` is peer-controlled, and it never becomes an object key.

| Handler (module) | Cases |
|---|---|
| `_combatEvent` (remote-combat.js) | shoot, grenade, zhit, zsplash, hitcredit, killcredit, zkill, monkey, swap |
| `_roundEvent` (rounds.js) | round, intermission, pause, gameover, return_lobby, drop, drop_take |
| `_interactEvent` (interactions.js) | song, door, door_req, barrier, barrier_req, boardpoints, radio, song_req, radio_req |
| `_playerEvent` (players.js) | bark, perk_anim, perk, pdmg, down, dead, revive_start, revive_stop, respawn, revive_done, revive_req, revive_self |
| `_machineEvent` (machines.js) | power, power_req, tele, tele_req, tele_link, trap_on, trap_req, trap_off |
| `_boxEvent` (mystery-box.js) | box_spin_req, box_take, box_state, box_move |
| `_papEvent` (pack-a-punch.js) | pap_req, pap_start, pap_reject, pap_ready, pap_take, pap_door |

Two notes on the handlers:
- `shoot` and `grenade` stay adjacent, in that order (§1.7).
- `const p = this.player;` is only needed in the combat, interactions, players and pap handlers.

New pin in `test-multiplayer-contracts.mjs`: the `case` labels across every `_…Event(msg, from)` handler are unique, and they match the 55 labels `onNetEvent` handled before the split.

### 1.6 Imports

**js/game.js after the split**

Keeps these imports, in today's order:
- `THREE`
- `clamp, rand, dist2D` (utils)
- `input, lockPointer, endFrame, isAimDown` (input)
- `audio`, `buildMap`, `WeaponRig`, `ZombieManager`
- `LocalPlayer, RemotePlayer`, `FX`, `CameraRig`, `LightPool`, `HellhoundFX`

Adds one import per `js/game/*` class, after the existing imports.

Drops these, because the code that used them has moved:
- `config.js` entirely
- `lerp, damp, choice, segmentHitsBox`
- `interactionLineClear`, `teleporterPromptState`
- `assets`
- all of `personas.js`
- `getStats, WEAPONS, BOX_POOL, buildViewmodel, buildMonkey, buildPapDisplayWeapon, updatePapDisplayWeapon, disposePapDisplayWeapon`
- `ZSTATES, ZombieVisual, createZombieModel, rayHitZombieBody, zombieAimPoint`
- `coverRayDistance`, `attachZombieDetail`, `PostFX`, `SlotBank`
- the whole `multiplayer-contracts`, `gameplay-rules` and `combat-rules` blocks

`lockPointer` was already unused before the split. It stays, because removing it isn't this change's job.

**New modules** (paths relative to `js/game/`)

| Module | Imports |
|---|---|
| frame-pacing.js | none |
| graphics.js | `THREE`; `clamp` (../utils); `assets`; `ZombieVisual, createZombieModel` (../zombies); `attachZombieDetail` (../render/ZombieDetail); `PostFX` (../render/PostFX); `SlotBank` (../render/LightPool) |
| ballistics.js | `THREE`; `segmentHitsBox`; `audio`; `coverRayDistance` (../shot-cover); `ZSTATES, rayHitZombieBody`; `dogHitZones, rayHitZones` (../combat-rules) |
| combat.js | `THREE`; `CFG`; `lerp, rand, choice`; `input`; `audio`; `assets`; `getStats`; `killCreditPresentation`; `hitscanDamage, meleeDamage, penetrationProfile, shouldSpawnDogRoundReward`; `dropId` (./rounds.js) |
| projectiles.js | `THREE`; `CFG`; `lerp, dist2D`; `audio`; `buildMonkey`; `ZSTATES`; `FRAG_BLAST, chainArcTargetAllowed, explosionDamage, floorArcTargetAllowed` |
| remote-combat.js | `THREE`; `CFG`; `clamp, lerp, dist2D`; `audio`; `WEAPONS, getStats`; `ZSTATES, zombieAimPoint`; `acceptPendingCredit, boundedPelletDirectionAllowed, consumeCreditClaim, killCreditPresentation, remoteShotTargetAllowed, remoteSwapSource, remoteWeaponClaimAllowed`; `FRAG_BLAST, chainArcTargetAllowed, dogHitZones, explosionDamage, floorArcTargetAllowed, hitscanDamage, meleeDamage, penetrationProfile, rayHitZones, shotClaimBudget` |
| rounds.js | `CFG`; `dist2D`; `audio`; `ROUND_INTERMISSION_SECONDS`; `multiplayerExitDestination` |
| interactions.js | `CFG`; `clamp, dist2D`; `input`; `audio`; `interactionLineClear`; `teleporterPromptState`; `getStats`; `consumeBoardCredit` |
| machines.js | `dist2D, rand`; `audio`; `ZSTATES` |
| mystery-box.js | `THREE`; `choice, clamp, damp, lerp`; `audio`; `BOX_POOL, WEAPONS, buildViewmodel`; `mysteryBoxTeddyChance` |
| pack-a-punch.js | `dist2D`; `input`; `audio`; `WEAPONS, getStats, buildPapDisplayWeapon, updatePapDisplayWeapon, disposePapDisplayWeapon`; `PAP_PROCESS_SECONDS, PAP_READY_TIMEOUT_SECONDS, papEventMatches, papLifecyclePhase`; `remoteWeaponClaimAllowed` |
| players.js | `CFG`; `clamp, rand`; `audio`; `assets`; `lineFor, variantCount`; `PERK_DRINK_TIMELINE, isPerkId`; `SYNCED_PERK_IDS` |
| camera-hud.js | `CFG`; `clamp, damp, lerp`; `input`; `audio`; `PERSONAS` |
| netcode.js | `CFG`; `clamp, dist2D`; `RemotePlayer`; `BOX_POOL` |
| cheats.js | `choice`; `BOX_POOL, WEAPONS, getStats` |

**Unchanged**
- `main.js` (`import { Game } from './game.js'`), `player.js` and `hud.js`.
- `validate-module-syntax.mjs`, which already walks `js/` recursively.
- The 4 prototype-driven validators.
- CSP (the new files are same-origin) and the Vercel `/js/(.*)` headers, which already cover subfolders.

**Circular imports: none are created.** Four rules keep it that way:
- **No `js/game/*` file may import `../game.js`.** A one-line pin can enforce this.
- **Only one import runs between the new modules:** `combat.js → rounds.js`, for `dropId`. `rounds.js` imports nothing from `js/game/`.
- **Every other import is already safe.** Everything the new modules import was already imported by `game.js`, and none of those modules import `game.js`.
- **Each scratch object and constant moves to the one module that uses it.** `_bodyHit` and `_claimTarget` share the comment at line 85, so that comment gets copied into both ballistics.js and remote-combat.js.

### 1.7 Validators

**Text pins (12 files).** These validators read `js/game.js`:
- validate-game-invariants (~45 pins)
- test-multiplayer-contracts (~17)
- validate-performance-invariants (~14)
- validate-combat-systems (~11)
- validate-crash-states (~10)
- validate-movement-feel (~10)
- validate-ads-recoil (8)
- validate-perk-drink (7)
- validate-ads-sight-picture (6 values)
- validate-round-systems (4)
- validate-remote-avatar (3)
- validate-host-guest-combat (3)

The change:
1. Add `scripts/lib/game-source.mjs`. It exports a synchronous `readGameSource()` that returns `js/game.js` followed by `js/game/*.js` in name order, joined into one string.
2. In each validator, swap the one read of `js/game.js` for `readGameSource()`. Inside a `Promise.all` a plain string is fine.

The pins themselves don't change. The joined source also keeps the count pins that span files true: `hitscanDamage(` ×2, `meleeDamage(` ×3 and `this._revealAcquiredWeapon();` ×2. That holds because imports and the router add no text that looks like those calls.

**Order-sensitive pins.** These must stay true at every step:
- **validate-remote-avatar** slices from `"      case 'shoot': {"` to `"      case 'grenade': {"`. Both cases must sit in the same handler, adjacent, at 6-space indent, with `shoot` first.
- **validate-crash-states** takes `indexOf('_cancelLocalPapAttempt')` and expects to land on the definition. Its only callers, `pap_start` and `pap_reject`, must come after it, which is why `_papEvent` goes at the end of pack-a-punch.js.
- **validate-game-invariants** matches from `papTake(notifyAuthority = true) {` to the first `\n  }`. That relies on class-method indentation, which the mixin classes keep.
- **validate-movement-feel** needs `render(dt = 1 / 60) {` to be followed directly by `this._tagViewmodelLayer();`.

**One validator splits alongside its module.** In step 11, the Pack-a-Punch block of `validate-game-invariants.mjs` moves to a new `scripts/validate-pack-a-punch.mjs`.
- The block runs from `// Pack-a-Punch is host-clocked…` through the `papTake` body checks, roughly lines 456–551.
- This takes `validate-game-invariants` from 560 lines to ~465, under the cap.
- The AGENTS.md validator loop picks up the new file automatically.

No other validator maps onto a single module, so the rest stay whole.

**Behavioural (4 files, no change):** validate-shot-occlusion, validate-prop-cover, validate-zombie-hitboxes, validate-frame-budget.

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks in the last column need a local server. Ask John before starting one.

| # | Change | Out of game.js | Risk | Extra check |
|---|---|---|---|---|
| 1 | Mixin install, `readGameSource()`, the 12 validators switched over, **frame-pacing.js** | ~120 | Very low. There are no imports, and validate-frame-budget drives `_countFrame` and `_tuneRenderScale` through the prototype. | none |
| 2 | **Router in place**: `onNetEvent` split into 7 handlers that stay inside game.js for now, plus the coverage pin | 0 | Low–medium. It's the only restructure, but the case bodies are untouched and ~25 case pins plus the new coverage pin guard it. | two-client co-op round |
| 3 | **graphics.js**, including `_initRendering` and `_mountViewmodel` | ~380 | Low | solo: first frame, resize, quality change, weapon swap (the layer-flash fix) |
| 4 | **ballistics.js**, including `_installAudioOcclusion` | ~205 | Low. Four validators fire these exact methods. | none |
| 5 | **rounds.js**, including `_roundEvent` and `dropId` | ~225 | Low. Must land before combat.js. | none |
| 6 | **combat.js** and **projectiles.js** | ~645 | Low–medium. Moved verbatim, but heavily pinned. | solo round + dog round |
| 7 | **camera-hud.js** | ~255 | Low | none |
| 8 | **netcode.js** | ~170 | Low. The router was already proven in step 2. | none |
| 9 | **cheats.js** | ~110 | Very low | none |
| 10 | **mystery-box.js**, including `_boxEvent` | ~305 | Low | none |
| 11 | **pack-a-punch.js**, including `_papEvent`, plus `validate-pack-a-punch.mjs` | ~325 | Medium. This is the most-pinned domain, and both order-sensitive Pack-a-Punch pins live here. | a guest uses Pack-a-Punch in co-op |
| 12 | **interactions.js** and **machines.js** | ~555 | Medium. `updateInteract` and `doInteract` reach into the box, Pack-a-Punch, perks, traps and doors. | solo: door, wallbuy, perk, power, teleporter, trap |
| 13 | **players.js**, including `_playerEvent` | ~270 | Medium. Down, revive and respawn all cross peers. | co-op: down, revive, bleed-out respawn |
| 14 | **remote-combat.js**, including `_combatEvent` | ~380 | Highest. This is the host's anti-cheat: shot, splash and knife claims, credits, swap validation. | co-op: guest hitscan, shotgun, rocket splash, grenade, knife, wallbuy swap, box swap |

### 1.9 Dead code found

This plan doesn't touch any of it. Whether to remove it is John's call.

- **Bot actions (80 lines).** `botFire`, `botMelee`, `botRevive`, `botUsePower`, `botUseBox`, `botLinkTele`, `botThrowMonkey`, `botDied` and `botBark` can never run.
  - `this.bots` is always `[]` (the code comment says "CPU squad bots removed").
  - Outside the block, the only caller is the unreachable bot branch in `onZombieDamagePlayer`.
  - Recommendation: delete them in their own commit before step 1. If they stay, they move to `js/game/bots.js` (~95 lines).
- **`packCentroid()` and `perkCount()`**: nothing calls them.
- **`BOX_CYCLE_PITCH`**: declared but never read. It moves along with the other `BOX_*` constants.
- **`lockPointer`**: imported but never used.

### 1.10 Docs and comments

- **`README.md:254`** lists `game.js Engine: rounds, economy, interactions` in the file tree. Add the `js/game/` entries.
- **The comment in `render()`** says "(see the shadowMap.autoUpdate note in init)". Change "in init" to "in _initRendering".
- **Optional:** other comments that say "game.js" are still true of the game as a whole, so updating them is optional. They're in:
  - `weapons.js:2847` and `:3276`
  - `player.js:470`
  - `audio.js`
  - `render/SunShadow.js:56` and `:76`
  - `audio/occlusion.js`, `audio/casings.js`, `audio/zones.js`
  - `render/SoldierGear.js:95`
  - `map.js:1188`

---

## 2. The other 25 files, ranked

These verdicts come from a structural skim of each file's top-level declarations and their spans. Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/player.js | 1,810 | Clean. Three classes: `LocalPlayer` (635), `SoldierVisual` (509) with `paintSoldierEye` and `soldierAtlas` (~210), and `RemotePlayer` (231). | `LocalPlayer` alone stays ~135 over. Use the same mixin pattern, or accept it. |
| 2 | style.css | 2,502 | Clean. 46 banner sections by screen: menu, overlays, lobby, options, pause, HUD sub-blocks. | Cascade order is the risk, so the new stylesheets need `<link>`s in the same order. test-multiplayer-contracts and validate-game-invariants read this file, so they need the same joined-source helper. |
| 3 | js/render/shaders.js | 1,034 | The cleanest seam in the repo. Each export is an independent GLSL string: a shared COMMON prefix plus one string per effect. | validate-module-syntax finds shader files with `/shaders\.js$/`, so widen that filter. |
| 4 | js/map-layout.js | 926 | Clean. Topology tables on one side; `auditMapStructure` (173) and `auditMapEgress` (65) on the other. | Pure module |
| 5 | js/zombies.js | 2,074 | `ZombieVisual`, the pose functions and the hit hulls lift out. `ZombieManager` is one 1,027-line class, so it needs the mixin pattern. | **Blocked** by the uncommitted model-audit WIP |
| 6 | js/weapons.js | 3,909 | `WeaponRig` (799) and `WEAPONS` (246) lift out. `buildViewmodel` is one 1,876-line function. Its 29 weapon cases register parts through a local `P` closure, so they need a shared builder context before they can move. | **Blocked** by the uncommitted WIP |
| 7 | js/audio.js | 1,501 | One 1,323-line `AudioEngine`. Mixin pattern, split along jingles, song and music box, ambience, and listener and room. | none |
| 8 | js/main.js | 1,078 | 46 functions share module-level `app` and options state. `boot` is 303 lines. | The shared state has to move into a module first. Heavily pinned. |
| 9 | js/net.js, js/fx.js | 875, 843 | One class each (783 and 726 lines). Mixin pattern. | net.js holds the event allowlists. Treat it like step 14 above. |
| 10 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 961, 713, 686, 718 | Clean. Each is made of top-level builder groups: body parts; surface generators vs `buildLibrary`; map generators vs the kit; `buildWardrobe` (336) vs the rest. | none |
| 11 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 795, 683 | Clean function groups. WeaponParts: geometry cache vs part builders. ZombieDetail: skin fitting vs garments. | **Blocked** by the uncommitted WIP |
| 12 | js/cinematic-director.js | 1,927 | Clean: the `SHOTS` table (324), the cast builders, `seek` (345). | Not deployed, so low payoff |
| 13 | js/assets-page.js | 727 | Many small functions | Only used by the /assets page, so low payoff |
| 14 | scripts/validate-game-invariants.mjs | 560 | Splits by concern | Covered by step 11 above (~465 lines after) |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 560, 626, 681 | Marginal. One class each, 60–180 lines over. | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/map.js (1,896 lines).**
  - One `buildMap` closure is 1,833 lines, 97% of the file, and every inner helper reads its locals.
  - Splitting it means threading a context object through all of it.
  - Every headless-map validator builds the map through it.
- **js/map-props.js (960 lines).** One 933-line `decorateMap` closure, with the same problem.
- **index.html (873 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (lines 685–867) can move out to a module file.
  - That still leaves ~690 lines.
