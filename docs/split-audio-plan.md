# Split plan: js/audio.js

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 19 files with 6,701 lines over the cap.

This continues `docs/split-map-plan.md`, whose plan is done. The director split in `docs/split-cinematic-director-plan.md` is still half done, with steps 3 and 4 left. Nothing in the director imports js/audio.js, so this plan touches none of that split's files.

This plan covers `js/audio.js`, the largest file. The map plan's §2 ranked it third and suggested splitting it with `installMixins` into jingles, song and music box, ambience, and listener and room. A full read keeps that mechanism but draws the groups differently (§1.2):
- The jingles, the song, the music box and the ambience come to 206 lines, `loopFile` included. That's one file, not three.
- Most of the lines are in other groups: the emitter and `play` (272 lines), the synth fallbacks (190) and the weapon layering (165).
- All but one of the constants above the class are read by a single group, so each one moves with that group.

This doc's §2 replaces the map plan's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `4550b84` to `a121209`, one per step in §1.8. js/audio.js is now 185 lines, and the largest file in js/audio/ is engine-playback.js at 385. `count_lines.py` now finds 18 files over the cap, with js/main.js the largest. It went as planned, with these notes:
- **Actual line counts** are within one line of the §1.3 estimates:

  | Module | Lines |
  |---|---|
  | js/audio.js | 185 |
  | engine-listener | 301 |
  | engine-playback | 385 |
  | engine-weapons | 236 |
  | engine-fallbacks | 235 |
  | engine-music | 216 |

- **How the moves were made.** A throwaway script cut each module from the pre-split audio.js by line range, and rebuilt js/audio.js for each step. It checked that every original line landed verbatim, in order, in the file meant to hold it, and that each file imports exactly the names its code uses. None of it was committed.
- **The proof ran as §1.8 describes.**
  - Each asset setup ran in its own process and made 1,750 calls. The four runs printed between 32,893 and 97,215 lines (1.0 to 2.5 MB).
  - It was run twice before step 1 to show the run is deterministic, and again after every step. The output was identical each time, including the hash of every method's source.
  - After each step, and across the whole split, `git diff --color-moved=zebra` showed only these as new: file headers and imports, the class lines and their closing braces, `export { midi };`, the install, and audio.js's header sentence.
- **The specifier check is narrower than §1.5 says.**
  - It fails when two importers of a module disagree about its query string. A module with only one importer loads once whatever its token, so dropping that token passes, and should.
  - So "a token dropped or changed would load a second copy" applies to the modules in js/audio/ with more than one importer: ir.js, zones.js and casings.js.
- **The validators number 50 in the loop:** the 49 from before, plus test-audio-modules.mjs. All of them passed before step 1 and after every step.
- **Browser checks.** None of the checks in §1.8 have been run. They need a local server.
- **The standing check from §1.7 was added after the split,** as scripts/test-audio-engine.mjs. That makes 51 validators.
  - Its first run found a bug from the initial release: a perk jingle with no file never played. `startJingle` called `schedule()` before it registered the loop, and `schedule()` returns early when the loop isn't registered.
  - The fix registers the loop first.

None of the dead code in §1.9 was touched. NOTICE.md's line and README.md's layout lines from §1.10 are done. The optional comment updates in §1.10 were not made.

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
js/audio.js                      1500           3
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

Total excess lines: 6701
```

The plan has two parts:
1. `js/audio.js`: `AudioEngine` keeps its setup, volumes, debug snapshot and teardown. Five groups of methods move verbatim into mixins in js/audio/. Each mixin takes the tables that only its methods read.
2. The other 18 files, ranked by risk against payoff, then the file with no clean seam.

---

## 1. js/audio.js: 1,500 lines → js/audio.js (~185) + 5 modules in js/audio/

### 1.1 What's in it

The file exports one name, the `audio` singleton, and 18 modules import it. `AudioEngine` spans lines 177–1498, 1,322 of the file's lines. It has a constructor, 136 methods and one getter.

| Lines | Contents | Used by |
|---|---|---|
| 1–10 | The header | |
| 11–28 | The imports. All eight modules already in js/audio/ are imported with `?v=` tokens. `CASING_BY_SFX` comes from weapons.js, with a four-line comment (24–27). | |
| 30–31 | `midi`, `DB` | `midi`: 7 synth fallbacks, `startJingle`, `playMusicBox`. `DB`: `_playShot`. |
| 33–38 | Air absorption: `airCutoff` | `_spatial3` |
| 40–95 | `FILE_MAP`. The PaP and class-fallback names are added at load (89–95). | `play`, `_resolveBuffer` |
| 97–133 | `PROC_MAP` | `play`, `playProcedural` |
| 134–141 | `STEP_FILES` | `_playFootstep`, `_landing` |
| 142–143 | `IMPACT_SURFACES` | `bulletImpact` |
| 145–166 | `SHOT_WEIGHT`, `CONCUSSIVE` | `_playShot` |
| 167–168 | `EXPLOSIVE` | `play` |
| 169–173 | `CONCUSSION_MIN_RADIUS` | `_playExplosionLayers` |
| 174–175 | `NON_POSITIONAL` | `playBuffer` |
| 177–284 | The class opens. The constructor, `init`, `applyVolumes`, `setVolume`. | main.js |
| 286–353 | The listener: `updateListener`, `_slowTick`, `_crossfadeZone` | game.js calls `updateListener` every frame (416) |
| 355–408 | Spatialisation: `_spatial`, `_spatial3` | `_emit`; the synth fallbacks; the music box and the song; js/audio/ambience.js (157) |
| 410–442 | `_out`, `_noise`, `_tone` | Only the synth fallbacks |
| 444–600 | The emitter and sample lookup: `_emit`, `fadeOut`, `_sample`, `_loopSafe`, `_sampleAny`, `playProcedural`, `_resolveBuffer` | Every sound. game.js calls `fadeOut` (153). ambience.js calls `_sample`, `_loopSafe` and `playProcedural`. |
| 602–715 | `play`, `playBuffer` | About 170 `audio.play` calls in js/. main.js (173) and js/game/players.js (99) call `playBuffer` for voice lines. |
| 717–881 | Weapon layering: `_playShot`, `_playExplosionLayers`, `_concuss` | `play`. `_landing` also calls `_concuss`. |
| 883–951 | Footsteps: `_gait`, `_playFootstep`, `_landing` | `play('step')`. `updateListener` calls `_landing`, and `debugState` calls `_gait`. |
| 953–994 | Low health: `_noteHurt`, `_decayHurtHeuristic`, `_updateHeartbeat` | `play('hurt')`, `_slowTick`, `setIntensity` |
| 996–1086 | The "New public API" section: `setZone`, `setListenerRoom`, `setOcclusionTest`, `setIntensity`, `setAmmoState`, `setRound`, `bulletImpact`, `whizBy`, `concussion`, `debugState` | game.js (419–420), js/game/ballistics.js (39), js/game/combat.js (146, 274), js/game/rounds.js (104, 199). main.js exposes the engine as `window.__audio` (778). |
| 1088–1102 | `loopFile` | main.js's menu music (629); the music box; `startAmbience`; ambience.js (97) |
| 1104–1293 | Synth fallbacks: `_gunshot`, `_click`, `_thunk` and 81 `sfx_<name>` methods | `play` calls them through `this['sfx_' + name]` (660) |
| 1295–1356 | Perk jingles: `startJingle`, `setJingleProximity`, `stopAllJingles` | game.js (427, 429, 474) |
| 1358–1405 | The music box: `playMusicBox`, `updateMusicBoxSpatial`, `stopMusicBox` | js/game/interactions.js; js/game/camera-hud.js (201); game.js (476) |
| 1407–1444 | The ambience: `startAmbience`, `stopAmbience` | game.js (245, 475) |
| 1446–1485 | The song: `playSong`, `updateSongSpatial`, `stopSong`, the `songPlaying` getter | js/game/interactions.js; js/game/camera-hud.js (200); game.js (477) |
| 1487–1497 | `dispose` | Nothing (§1.9) |
| 1500 | `export const audio = new AudioEngine();` | 18 modules |

Five facts shape the plan:
- **It's one class, and its parts reach each other only through `this`.**
  - No method spans two sections. The class uses no class fields, statics, `super` or private names. Its one getter is `songPlaying`.
  - The constants above the class are the tables plus `midi`, `DB` and `airCutoff`. Each is read by one group of methods, except `midi`, which the synth fallbacks and the music code share.
  - No two methods share a name, so `installMixins` has nothing to reject.
- **The fields live on the instance, and many are created on first use.**
  - `_musicBox`, `_song`, `_amb`, `_heartTimer`, `_zvoice`, `_hurtT`, `_loopCache`, `_roomDrivenT`, `_intensityDriven` and `_heurHealth` never appear in the constructor. Moving a method can't split a field.
  - The groups in §1.2 keep the methods that set a field in the same file as the methods that read it. The exceptions are `listener`, `surface` and `zones.current`: the listener group sets them, and the weapon and playback groups read them.
  - `debugState` and `dispose` stay in the core, and read or clear fields from every group.
- **Errors on the hot paths are swallowed.**
  - `updateListener` calls `_slowTick` inside a `try` (321).
  - `play` runs footsteps, round stingers, the hurt heuristic, shot layers and explosion layers inside another `try` (619–637).
  - Each `catch` only adds one to `stats.errors`.
  - js/audio/ambience.js checks that `eng._sample` and `eng._loopSafe` exist before it calls them (59, 62). If they were never installed, the ambience bed would degrade without a word.
  - So when a moved method uses a name its file doesn't have, nothing throws. The sound just goes missing.
- **No validator plays a sound.** Node has no Web Audio.
  - 3 tests load audio.js, and 5 validators load it through game.js. Loading runs the module top levels and the constructor, plus `installMixins` once the split starts, and nothing else.
  - 2 validators pin 3 lines of its text (§1.7).
- **Its imports of js/audio/ carry `?v=` tokens.**
  - All eight modules are imported with one, and js/weapons/catalog.js imports casings.js with the same `?v=1`.
  - A module imported under two different query strings loads twice, in the browser and in Node.

### 1.2 Mechanism

**`AudioEngine` becomes a core plus five mixins.** They are installed the way js/game.js, js/zombies/manager.js and js/player/soldier.js install theirs. js/audio.js keeps the constructor, `init`, `applyVolumes`, `setVolume`, `debugState` and `dispose`.

| Mixin | Takes | Why it's a seam |
|---|---|---|
| `AudioEngineListener` (engine-listener.js) | `updateListener`, `_slowTick`, `_crossfadeZone`; `_spatial`, `_spatial3`; `_gait`, `_playFootstep`, `_landing`; `_noteHurt`, `_decayHurtHeuristic`, `_updateHeartbeat`; `setZone`, `setListenerRoom`, `setOcclusionTest`, `setIntensity`. With `airCutoff` and `STEP_FILES`. | The listener: where it is, which room and reverb zone it's in, and how a point sounds from there. Also its own footsteps, landings and health. `updateListener` records the motion that the gait and the landings read, and `_slowTick` decays the hurt heuristic. The four setters are how game.js drives that state. Each one sets a field these methods read: `zones.forced`, `_roomDrivenT`, the occlusion test, `_intensityDriven`. |
| `AudioEnginePlayback` (engine-playback.js) | `_emit`, `fadeOut`, `_sample`, `_loopSafe`, `_sampleAny`, `playProcedural`, `_resolveBuffer`; `play`, `playBuffer`; `setRound`. With `FILE_MAP`, `PROC_MAP`, `EXPLOSIVE` and `NON_POSITIONAL`. | How a name becomes a sound: which file or render it resolves to, and the pooled voice it plays on. `play` sends each name to its layers or its fallback. `setRound` goes with `play`, the only other method that sets `round`. |
| `AudioEngineWeapons` (engine-weapons.js) | `_playShot`, `_playExplosionLayers`, `_concuss`; `setAmmoState`, `bulletImpact`, `whizBy`, `concussion`. With `DB`, `IMPACT_SURFACES`, `SHOT_WEIGHT`, `CONCUSSIVE`, `CONCUSSION_MIN_RADIUS` and the casing imports. | The layered gunshot, the explosions and the ear-ring, and the bullet impacts and whiz-bys. `setAmmoState` sets the `_ammo` field that `_playShot` reads, and the long comment in `_playShot` (744–753) is about that call. |
| `AudioEngineFallbacks` (engine-fallbacks.js) | `_out`, `_noise`, `_tone`; `_gunshot`, `_click`, `_thunk` and the 81 `sfx_<name>` methods. Also `midi`, which it exports. | The synthesised sounds `play` falls back to when a name has no file and no render (660). Nothing else calls the three node helpers. |
| `AudioEngineMusic` (engine-music.js) | `loopFile`; the perk jingles; the music box; `startAmbience`, `stopAmbience`; the song and `songPlaying` | Everything that loops or runs long and must be stopped. Each piece keeps its own field (`_loops`, `_musicBox`, `_amb`, `_song`), and game.js's exit stops all four (474–477). |

js/audio.js ends:

```js
// AudioEngine's methods are split by part across js/audio/engine-*.js. Each file
// is a class whose methods are copied onto AudioEngine.prototype here: one `this`,
// one engine to every caller. A name defined twice is a split mistake, so it fails
// at load.
installMixins(AudioEngine, [
  AudioEngineListener, AudioEnginePlayback, AudioEngineWeapons, AudioEngineFallbacks, AudioEngineMusic,
]);

export const audio = new AudioEngine();
```

Each step adds its class to that list, in this order.

What this buys:
- **No caller changes.** The 18 importers call every method through the prototype, and so does ambience.js through its engine reference. `this['sfx_' + name]` finds the fallbacks there too.
- **Every moved line is unchanged.** That includes the tables, whose comments stay next to the code they explain.
- **A method defined twice fails at load,** through `installMixins`. test-install-mixins shows that a getter installs as a getter.
- **Every export has an importer.** Each mixin file exports its class. engine-fallbacks.js also exports `midi` for engine-music.js, the same way js/game/combat.js imports `dropId` from js/game/rounds.js.
- **The core keeps the constructor line validate-game-invariants pins,** and the imports of the js/audio/ modules the core still uses, with their tokens.

Rejected alternatives:
- **Move the class to js/audio/engine.js and have js/audio.js only re-export `audio`**, as js/player.js does. The class would still need the same five mixins. The core would move for no gain.
- **The groups from the map plan's ranking:** jingles, song and music box, ambience, and listener and room.
  - The first three are 191 lines together and share `loopFile`.
  - Take them and the listener's ~90 lines out, and ~1,200 lines are left to split some other way.
- **Keep the "New public API" section (996–1086) as one file.** Its ten methods would stay under their banner. But `setAmmoState`, `setIntensity` and `setListenerRoom` would each end up in a different file from the methods that read the fields they set.
- **Split the listener from the footsteps and health.**
  - `updateListener` calls `_landing` and feeds `_gait`. `_slowTick` calls `_decayHurtHeuristic`, and `setIntensity` sets the flag `_noteHurt` reads.
  - The two files would be ~180 and ~130 lines, with all of those calls running between them.
- **Put the constants in one data module.**
  - Every one but `midi` has one group of readers, so moving them away means exporting 11 more names.
  - The comments on `CONCUSSIVE` and `CONCUSSION_MIN_RADIUS` would end up a file away from `_playShot` and `_playExplosionLayers`, the code they explain.
- **Move `midi` into js/utils.js, or copy it into both files.** The first changes a module nearly every file imports, for a one-liner that two files use. The second duplicates code.
- **Split the playback file (~385 lines) in two.** `play` and `playProcedural` both read `FILE_MAP` and `PROC_MAP`, so both tables would have to be exported.
- **Give the new imports `?v=` tokens.**
  - None of the earlier split files has a token.
  - `assertMethodFilesInstalled` loads each file without a token. So it would get a second copy of each class, and every method check would fail.

### 1.3 Target modules

| Module | Takes from audio.js | ≈ lines |
|---|---|---|
| `js/audio.js` | 1–10, the header, plus one new sentence. The imports it still uses (§1.4). `AudioEngine`: 177–284, the class line, the constructor, `init`, `applyVolumes`, `setVolume`; 1062–1086, `debugState`; 1487–1498, `dispose` and the closing brace. The mixin install. 1500, the export. | 185 |
| `js/audio/engine-listener.js` | 33–38, `airCutoff`. 134–141, `STEP_FILES`. 286–408: the listener and spatialisation banners, `updateListener` through `_spatial3`. 883–994: footsteps and low health. 996–1034: the "New public API" banner, `setZone`, `setListenerRoom`, `setOcclusionTest`, `setIntensity`. | 300 |
| `js/audio/engine-playback.js` | 40–95, `FILE_MAP`. 97–133, `PROC_MAP`. 167–168, `EXPLOSIVE`. 174–175, `NON_POSITIONAL`. 444–715: the emitter banner through `playBuffer`. 1042–1043, `setRound`. | 385 |
| `js/audio/engine-weapons.js` | 24–28, `CASING_BY_SFX`'s comment and import. 31, `DB`. 142–143, `IMPACT_SURFACES`. 145–166, `SHOT_WEIGHT` and `CONCUSSIVE`. 169–173, `CONCUSSION_MIN_RADIUS`. 717–881: the weapon-layering banner through `_concuss`. 1036–1040, `setAmmoState`. 1045–1060: `bulletImpact`, `whizBy`, `concussion`. | 235 |
| `js/audio/engine-fallbacks.js` | 30, `midi`. 410–442: `_out`, `_noise`, `_tone`. 1104–1293: `_gunshot` through `sfx_gameover`. | 235 |
| `js/audio/engine-music.js` | 1088–1102, `loopFile`. 1295–1485: the jingles, the music box, the ambience and the song. | 215 |

Outside the imports, each line of audio.js ends up in exactly one of these files. The core keeps the constructor and 5 methods. The listener takes 15, playback 10, weapons 7, the fallbacks 87 and music 13.

Ordering, headers and exports:
- Members keep their original relative order. In each file the tables come first and the class after them, as in audio.js today.
- Each new file opens with a comment naming its part of the engine, then: "Methods of AudioEngine: js/audio.js copies them onto AudioEngine.prototype."
- Each new file exports its class, as `export class`. engine-fallbacks.js also ends with `export { midi };`, so line 30 moves unchanged.
- No new comment may quote `sfx_bottle_break(o)`, `sfx_belch(o)` or `_dogVoiceGate = createConcurrencyGate(2)`. A copy in a comment would keep that pin passing even if the code were gone (§1.7).

### 1.4 What stays in js/audio.js

```js
// Audio engine: plays generated sound files (assets/audio) with positional
// … 2–10, verbatim …
// AudioEngine's methods are in js/audio/engine-*.js, installed below.
import { installMixins } from './utils.js';
import { createConcurrencyGate } from './gameplay-rules.js';
// `?v=` tokens follow the convention already used for site-audio.js: they let
// an edited sub-module bust the browser's per-origin ES-module cache.
import { buildAllImpulseResponses, ZONE_SPECS, ZONE_NAMES } from './audio/ir.js?v=1';
import { DEFAULT_ZONE } from './audio/zones.js?v=1';
import { OcclusionCache } from './audio/occlusion.js?v=2';
import { renderBank } from './audio/synth.js?v=1';
import { MasterMix } from './audio/mix.js?v=1';
import { VoicePool } from './audio/pool.js?v=1';
import { AmbienceBed } from './audio/ambience.js?v=1';
import { AudioEngineListener } from './audio/engine-listener.js';
import { AudioEnginePlayback } from './audio/engine-playback.js';
import { AudioEngineWeapons } from './audio/engine-weapons.js';
import { AudioEngineFallbacks } from './audio/engine-fallbacks.js';
import { AudioEngineMusic } from './audio/engine-music.js';

class AudioEngine {
  // … 178–284, verbatim: constructor, init, applyVolumes, setVolume …

  // … 1062–1086, verbatim: debugState …

  // … 1487–1497, verbatim: dispose …
}

// … the install, as in §1.2 …

export const audio = new AudioEngine();
```

The file still exports one name, `audio`. `AudioEngine` stays unexported, and the contract test gets the class through `audio.constructor`.

**No caller changes:**
- game.js, main.js, net.js and fx.js
- 12 files in js/game/, plus js/player/local.js and js/player/remote.js
- js/audio/ambience.js, which calls the engine through the instance
- the 3 tests that load audio.js and the 5 validators that load game.js

**During steps 1–4,** audio.js keeps the methods and tables that haven't moved yet, and imports whatever they need.
- From step 1 until step 2, that includes `midi`, from ./audio/engine-fallbacks.js, for the jingles and the music box.
- Each step drops only the names used by the code it moves. Every other name stays on its original import line.

### 1.5 Imports

Paths are relative to js/audio/. A module's path is given the first time it appears in the table.

| Module | Imports |
|---|---|
| engine-listener.js | `clamp, rand` (../utils.js); `ZONE_SPECS, ZONE_NAMES` (./ir.js?v=1); `roomIdAt, zoneForRoom, surfaceForRoom` (./zones.js?v=1) |
| engine-playback.js | `clamp, rand, choice`; `assets` (../assets.js); `ZONE_SPECS` |
| engine-weapons.js | `clamp, rand`; `ZONE_SPECS`; `CASING_KINDS, CASING_SURFACE, GENERIC_CASING, BOLT_EJECT_DELAY` (./casings.js?v=1); `CASING_BY_SFX` (../weapons.js) |
| engine-fallbacks.js | `rand` |
| engine-music.js | `clamp, rand`; `assets`; `midi` (./engine-fallbacks.js) |

Every name audio.js imports today is still used. Each one either goes to the modules above that use it or stays in the core (§1.4). The core stops importing `clamp`, `rand`, `choice`, `assets`, `roomIdAt`, `zoneForRoom`, `surfaceForRoom`, the four casing names and `CASING_BY_SFX`.

**Cache tokens.**
- **Every import of an existing js/audio/ module keeps its exact token:** `?v=2` for occlusion.js, `?v=1` for the rest.
  - From inside js/audio/, `./ir.js?v=1` resolves to the URL /js/audio/ir.js?v=1. audio.js's `./audio/ir.js?v=1` resolves to that same URL, and catalog.js's `../audio/casings.js?v=1` matches casings.js the same way.
  - So `ZONE_SPECS`, the zone tables and the casing tables each stay a single module instance.
  - A token dropped or changed would load a second copy. test-audio-modules fails when that happens (§1.7).
- **The new files get no token,** like every split file before them (§1.2).
- **No token is needed for fresh copies.** vercel.json serves /js/ with `max-age=0`, so browsers revalidate the new files on every load.

**Deploy.** No changes are needed:
- The new files are same-origin, so the CSP allows them.
- vercel.json's `/js/(.*)` headers already cover subfolders.
- .vercelignore doesn't exclude js/audio/, and it mustn't.

**Load order.**
- `installMixins` runs as audio.js evaluates, on the line before `new AudioEngine()`. The constructor doesn't call any methods anyway.
- The only moved code that runs at load is the tables. That includes `FILE_MAP`'s PaP and class-fallback names (89–95), which are now added when engine-playback.js loads.
- In audio.js's import graph, assets.js now evaluates after the eight existing js/audio/ modules instead of before them. assets.js doesn't import any of them, and none of them imports assets.js.

### 1.6 Circular imports: none are created

Three rules keep it that way:
- **No file under js/audio/ imports js/audio.js.** The contract test enforces this at every step, for the eight existing modules too.
- **The split adds one import edge inside js/audio/:** engine-music.js imports engine-fallbacks.js, which imports nothing from js/audio/.
  - The other three engine files import only ir.js, zones.js and casings.js from js/audio/.
  - None of the eight existing modules imports another module in js/audio/.
- **Nothing the new files import from outside leads back in.**
  - js/audio.js is imported by game.js, main.js, net.js, fx.js, 12 files in js/game/ and 2 in js/player/.
  - From outside js/audio/, the new files import utils.js, assets.js and weapons.js, and zones.js and occlusion.js import map-layout.js.
  - Following each of those imports all the way down (2, 3, 28 and 1 modules) never reaches any of the 18 files that import js/audio.js.

### 1.7 Validators

**Text pins (2 files, 3 checks).** These validators read `js/audio.js` by path:

| Validator | Checks | Where the pinned text ends up |
|---|---|---|
| validate-perk-drink | 2 | engine-fallbacks.js: `sfx_bottle_break(o)` and `sfx_belch(o)` |
| validate-game-invariants | 1 | js/audio.js: `_dogVoiceGate = createConcurrencyGate(2)`, in the constructor |

The change:
1. **Add the source helper.** In `scripts/lib/game-source.mjs`:
   - New `readAudioSource()` calls `readSplitSource(js, 'audio', '.js')`.
   - It returns js/audio.js, then every .js file under js/audio/ in path order, joined. That includes the eight modules already there.
   - The file's header comment gains a sentence.
2. **Switch the reads.**
   - Both validators swap the `readFile` of js/audio.js in their `Promise.all` for `readAudioSource()`, and add the name to their existing import from `./lib/game-source.mjs`.
   - Both still use `readFile` for other files.

No pin changes:
- Each pin is a single line. None depends on the order of the joined files, and none is negative.
- None of the three matches anything in the eight existing modules, so reading those in can't make a pin pass by accident.
- validate-game-invariants' pin doesn't move. It switches anyway, as every reader did in the earlier splits, so it keeps passing if the constructor ever moves.

**Behavioural checks (no changes).**
- **Loading.**
  - test-game-modules, test-local-player and test-remote-player load audio.js.
  - The 5 validators that load game.js pull it in too: test-game-modules, validate-frame-budget, validate-prop-cover, validate-shot-occlusion and validate-zombie-hitboxes.
  - Loading runs every module's top level, `installMixins` and the constructor. So these fail at load on a wrong path, a missing export, a name defined twice, or a constructor that reads a missing name.
- **Stubs.** test-game-modules swaps `audio.setOcclusionTest` out and puts it back, and the two player tests replace `audio.play` with a logger. Each sets a property on the instance, which works whichever file defines the method.
- **validate-module-syntax** parses every new file.
- **validate-audio-loudness** reads js/audio/casings.js by path, and casings.js doesn't change.

**New: `scripts/test-audio-modules.mjs` (~70 lines).** This is the audio counterpart of test-player-modules. It checks:
- js/audio.js exports exactly `audio`.
- No file under js/audio/ imports js/audio.js, through `assertNoImportOf`.
- **The mixins are installed.**
  - Each `engine-*.js` file exports one class, and every method of that class is on `AudioEngine.prototype`, through `assertMethodFilesInstalled(audio.constructor, 'audio', …)`.
  - The `engine-` filter matters: `MasterMix`, `VoicePool`, `AmbienceBed` and `OcclusionCache` are also classes in js/audio/.
  - For `songPlaying`, the helper reads the getter on both prototypes. If it's installed, both give `false`. If it isn't, the engine gives `undefined`, so a missing install still fails.
- **Each module is imported under one specifier.**
  - Every relative `import … from` and `export … from` in every .js file under js/ is resolved, and its query string recorded.
  - A module imported with two different query strings, or with one and without, fails, and the failure names both importers.
  - Today this holds for the eight js/audio/ modules and for site-audio.js, the only modules imported with a token.
  - The check also runs on a doctored list with `./audio/ir.js` untokened, and must reject it.
- `readAudioSource()` holds every file.

split-modules.mjs's header comment gains the new test's name. The validator count goes up by one, to 50.

**What still isn't caught.**
- **Nothing plays a sound.**
  - If a moved method uses a name its file doesn't import, the error only happens when that line runs.
  - On the paths in §1.1 it happens silently: a count in `stats.errors`, and a missing sound.
  - The proof in §1.8 prints `stats` after every call, and the browser checks read `stats.errors` through `window.__audio`.
- **A standing check is possible.**
  - The proof's recording AudioContext could be committed as `scripts/test-audio-engine.mjs`. It would call every public method and play every `sfx_` name once, and assert that none throws and `stats.errors` stays 0.
  - That would catch this on every run, during the split and after it.
  - It isn't one of the steps. Whether to add it is John's call.
- **What anything sounds like.** Only the browser checks cover that.

**No validator splits.** Both are under 500 lines, and each covers more than audio.js:

| Validator | Lines | Covers in js/audio.js and js/audio/ |
|---|---|---|
| validate-game-invariants | 463 | js/audio.js |
| validate-perk-drink | 109 | engine-fallbacks.js |

### 1.8 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one, and stop it when the check is done.
- Open the game on localhost with `?debug=1`, so that `window.__audio` is set.
- Read `__audio.debugState().stats.errors` at the start and at the end of each check. The count must not change.

Why this order:
- **The fallbacks go first.** They are the lowest-risk group: they hold no state, and they only build nodes and return. Two of the three text pins move with them, so step 1 also tests the source helper.
- **The music goes second,** because it imports `midi` from step 1's file.
- **Then the weapons, then the listener.** `play` calls into the weapons and `updateListener` into the listener. Both groups can fail silently, so each gets its own step and its own proof run.
- **Playback goes last.** Every sound passes through it. Once it moves, js/audio.js is the core shown in §1.4.

| # | Change | Out of audio.js | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readAudioSource()`, with the 2 validators switched; `test-audio-modules.mjs`; **engine-fallbacks.js**, with audio.js importing `midi` back from it | ~225 | Very low. The 87 methods only build nodes. `play` looks the fallbacks up by name, so one left uninstalled would just go silent. The contract test catches that. | Solo, with DevTools blocking `*/assets/audio/*` so that no sound file loads. Fire the M1911 and the MP40, reload, buy a wall weapon, try one you can't afford, open a door, drink a perk (glass break and belch), spin the box, and start a round. Each should make a synthesised sound, with no console error. Unblock and reload: the recorded files play again. |
| 2 | **engine-music.js**; audio.js drops `midi`; NOTICE.md's line (§1.10) | ~205 | Low. Each piece keeps its own field, and no validator reaches this code. `dispose` in the core and ambience.js call into it by name. | The menu music plays. Solo: a perk jingle gets louder as you walk up to its machine, and pans as you turn. The radio's music box fades with distance. The gramophone's song plays from the gramophone. The ambience bed runs: wind, the generator's buzz, drips. Exit to the menu, and all of it stops. With `*/assets/audio/*` blocked, the jingles and the music box play their synthesised tunes. |
| 3 | **engine-weapons.js** | ~220 | Low. `_playShot` and the explosion layers run inside `play`'s `try`, so a missing import would silence the layers without an error. The casings import has to keep `?v=1`, which the contract test checks. | Solo: fire an MP40 burst. Fire the Kar98: its case lands after the bolt is worked. The M1 Garand's last round pings. Up close, the PTRS-41 rings your ears and the Ray Gun doesn't. A grenade rings your ears and a trap doesn't. Cases sound different on the catwalk than on the factory floor. Shots hit walls, metal and zombies, with the odd ricochet. Co-op: when a teammate empties a Thompson, your gun doesn't ping or change pitch. |
| 4 | **engine-listener.js** | ~285 | Low to medium. `updateListener` runs every frame, and `_spatial3` places every positional sound. `_slowTick` runs inside a `try`, so a missing zone import would freeze the reverb without an error. | Solo: walk through the left corridor, the factory and the courtyard. `__audio.debugState().zone` reads corridor, hall and courtyard in turn, and the reverb changes with it. Footsteps change on the catwalk's metal and the courtyard's gravel, and sprinting adds cloth. Drop off the catwalk: a landing thud. Take two quick hits: the heartbeat starts, and stops after you regenerate. A zombie behind a wall sounds muffled, and sounds pan as you turn. |
| 5 | **engine-playback.js**; audio.js is left as in §1.4; README.md's layout lines | ~370 | Medium. Every sound passes through `play` and `_emit`. A wrong path or a name defined twice fails at load in 7 scripts, but nothing plays a sound. | AGENTS.md's normal round and dog round: never more than two groans at once, and never more than two hounds barking. The round start and end stingers play, with the ambience ducking under them. A character's voice line ducks the music. In the menu, hover and click sounds play. Slide into a wall: the scrape stops. The master, SFX, music and voice sliders each change only their own sounds. |

**Proof for every step.** It runs in plain Node, with no server and no browser. It's a throwaway script, not committed, because a saved expected output would break on every later intentional change.
1. **Take a baseline before step 1, and run it twice** to show that the output is the same each time.
   - Load audio.js through headless-three.mjs. After the imports, seed `Math.random` with headless-map.mjs's `seedRandom`.
   - Before `init`, install three stand-ins:
     - **A recording `AudioContext` on `window`.**
       - It has the nine factories the engine and js/audio/ call: `createGain`, `createBiquadFilter`, `createStereoPanner`, `createConvolver`, `createDynamicsCompressor`, `createBufferSource`, `createOscillator`, `createBuffer` and `createMediaElementSource`.
       - It also has `destination`, `sampleRate`, `state` and `resume()`, and `currentTime` comes from the script's clock.
       - Its AudioParams log every value write and every automation call. Its nodes log `connect`, `disconnect`, `start` and `stop`.
     - **A recording `Audio` element** whose `play()` resolves.
     - **A fake clock.** `performance.now`, `setTimeout` and `clearTimeout` are replaced by a clock and a timer queue that the script advances.
   - Name nodes and timers by creation order.
   - There is no `OfflineAudioContext`, so synth.js renders nothing. Once `renderBank` settles, the script sets `audio.bank` itself.
   - `init` builds the engine only once, so each of four runs uses its own process:
     - every file and every render present
     - no files, but every render present
     - no files and no renders, so every name reaches its synth fallback
     - every other file present, and no renders
2. **What it prints.**
   - **The prototype.**
     - Every property name on `audio.constructor.prototype`, sorted.
     - For each method, a SHA-256 of its source text from `Function.prototype.toString`. For `songPlaying`, the getter's source.
     - The methods move verbatim, so these must match.
   - **Every public call, in each run:**
     - `init`; `setVolume` for each kind; `enabled` set off, then on
     - `updateListener` along a track: a walk, a sprint, a 3 m fall and the landing, and a frame of NaN coordinates
     - `setListenerRoom` with an id, with a room object, and with null. `setZone` for each zone, and null. `setOcclusionTest` with a test that occludes half the map.
     - `play` for every `FILE_MAP` name, every `PROC_MAP` name, and every `sfx_` name read off the prototype. Each with no position, nearby, and past `maxDist`.
     - Each `shot_` name and its `_pap` name, as a four-round burst and then a single shot. `setAmmoState` counted down to the last round, fired from the listener's position and from 10 m away.
     - Explosions with `blastRadius` 0, 2, 4 and 5, at 5 m and at 20 m, and a trap
     - `bulletImpact` for each surface and for one unknown surface; `whizBy`; `concussion`
     - Four `dog` plays within 100 ms; three groans; `playBuffer` with `vox`
     - `hurt` three times in 2 s, then 10 s on the clock through the heartbeat and its decay; `setIntensity`
     - `setRound`, then `round_start` and `round_end`
     - `fadeOut` on a slide; `loopFile` with an offset and without one
     - `startJingle` for each perk, then `setJingleProximity` and `stopAllJingles`
     - `playMusicBox` at a position, `updateMusicBoxSpatial` and `stopMusicBox`. In the runs with no files, also the timer that ends the synthesised melody.
     - `startAmbience` with the bank ready, and again with it not ready, through its retry timer; then `stopAmbience`
     - `playSong` at a position, `updateSongSpatial`, the element's `ended` event, `stopSong` and `songPlaying`
     - `debugState()` after each group, and `dispose` at the end
   - **After every call:**
     - the Web Audio calls recorded since the previous call
     - the timers set and fired
     - the return value
     - `stats`
3. **After each step, run it again.** The output must be identical to the baseline.
4. **Review the diff.**
   - Check that every line that left audio.js appears verbatim in a new file.
   - Then run `git diff --color-moved=zebra`. The only changed lines should be:
     - file headers and imports
     - the five new class lines and their closing braces
     - `export { midi };`
     - the `installMixins` call and audio.js's new header sentence

If a piece can't be checked headless, check it in the browser instead, once John has agreed to the server.

### 1.9 Found while reading

**Dead code.** This plan doesn't touch any of it. Whether to remove it is John's call.
- **Fields nothing reads.** The constructor sets `_groanSlots` (182), `_musicTimer` (185) and `_lastStepT` (204), and nothing in js/ reads them.
- **A condition that changes nothing.** `_emit` sets `cutoff = noAir ? 22000 : 22000` (462). Both branches give 22000.
- **A parameter nothing uses.** `_out(busName, vol, pan = 0, when = 0)` (410) never reads `when`.
- **Methods nothing calls.**
  - Nothing in js/ or scripts/ calls `dispose` (1487). game.js's exit calls the four stops itself (474–477).
  - Nothing calls `setZone` (1002), `whizBy` (1055) or `concussion` (1060) either. The banner at 996 calls that section optional, so they may be kept on purpose.

**Comments.** The comment on AmbienceBed's constructor (js/audio/ambience.js:40–41) says the bed uses only `playProcedural`, `bank`, `bus.amb` and `ctx`. It also calls `_sample`, `_loopSafe`, `loopFile`, `play` and `_spatial`. The split renames none of them.

### 1.10 Docs and comments

- **NOTICE.md:55 changes in step 2.**
  - It lists the two places that reference Beauty of Annihilation, and one of them, `playSong`, moves.
  - The line becomes "`js/audio/engine-music.js` — playback".
- **README.md's layout section** changes in step 5, in the same form as the other split folders:
  - `audio.js`, a new line before `audio/`: "Audio entry point: engine setup and teardown"
  - `audio/` (269): "Engine methods (listener, playback, weapons, fallbacks, music), mixing, occlusion, ambience, impulse responses"
- **Optional.** These comments point at audio.js for code that moves:
  - js/assets.js:299, the fallback to the procedural render: now `_sample` in engine-playback.js
  - js/audio/casings.js:57, `FILE_MAP`: now in engine-playback.js
  - scripts/audio/design_raygun.py:19 (`SHOT_WEIGHT`), design_shots.py:22 (the shot layers) and design_casings.py:44 (the casing level at play time): now in engine-weapons.js
- **Unchanged:**
  - README.md:202 and RENDERING.md:360 name `js/audio.js` and `js/audio/*` together, which stays true.
  - scripts/audio/normalise_library.py:8 says `js/audio.js` owns the mix. It means the engine as a whole, which is still js/audio.js and js/audio/.
  - validate-audio-loudness.mjs:12 and :144, and design_casings.py:15, describe what audio.js used to do.
  - AGENTS.md and llms.txt don't name audio.js.
- **Leave as is:**
  - The docs/split-*.md plans cite js/audio.js, but they're dated records.
  - README.md:272 and :278 still say 27 validators. That was out of date before this plan, and this plan doesn't touch it.

---

## 2. The other 18 files, ranked

None of these files has changed since `docs/split-map-plan.md` §2 was written: that doc's commit, `50028a4`, is the latest. So its verdicts stand. The ranks are renumbered without js/audio.js, and main.js's row gains one note.

Each file gets a full read and its own plan before it is split.

**Mid-split:** js/cinematic-director.js (970 lines). Steps 3 and 4 of its plan take it down to a ~60-line boot script.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. validate-performance-invariants and validate-coplanar-surfaces read the file's text by path, so they need a source helper like `readAudioSource()`. |
| 2 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` (689) and `auditMapEgress` (862) on the other | Pure module |
| 3 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move first: each binding goes to the module that assigns it, as in the director split. Heavily pinned. Its `site-audio.js?v=6` import has to keep its token, and test-audio-modules' specifier check will enforce that. |
| 4 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–780). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 5 | js/map-props.js | 959 | One 932-line `decorateMap` closure (28–959), in sections like map.js's were. The map plan's §1.2 mechanism may fit. | Its `R()` stream is a `const` function, so a builder can take it and draw in the same order. The only binding its helpers share that gets reassigned is `let roomY` (612). The room loop sets it (680), and `walkwayFree`, `zoneFree` and `alongWalls` read it (626–667), so those four have to stay in one module. Every prop in the map is placed through this file, so it needs a proof like the map plan's §1.8. |
| 6 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | Each keeps re-exporting whatever moves out. 3 files in js/zombies/ import HellhoundModel. 14 files in js/weapons/ and js/render/ import WeaponMaterials. js/map/interactables.js and 7 files in js/props/ import props/materials, and validate-coplanar-surfaces reads its text. 3 files in js/player/ import SoldierGear, and validate-remote-avatar reads its text. |
| 7 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | Each keeps re-exporting whatever moves out. 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. js/zombies/models.js, js/zombies/manager.js and js/game/graphics.js import ZombieDetail, and 2 validators load it. |
| 8 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so the payoff is low. |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal, 60–180 lines over. hud.js and PostFX.js are one class each (`HUD` 9–559, `PostFX` 52–680). navmesh.js is mostly `NavGrid` (200–604). | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force this

- **index.html (881 lines).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (693–875) could move out to a module file, and that would still leave ~700 lines.
