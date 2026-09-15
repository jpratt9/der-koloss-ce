// Audio engine: plays generated sound files (assets/audio) with positional
// mixing; synthesized fallback for anything missing. Zombie voices stay mellow.
//
// Upgraded to a layered, spatialised, dynamically-mixed engine:
//   - convolution reverb zones crossfaded from the listener position
//   - multi-layer gunshots (sample + sub thump + reverb tail + action clack)
//   - inverse-distance gain, air-absorption low-pass, budgeted occlusion
//   - master compressor -> limiter, voice ducking, concussion, low-health state
//   - layered procedural ambience and surface-aware footsteps
// Every public method that existed before keeps its exact signature.
// AudioEngine's methods are in js/audio/engine-*.js, installed below.
import { clamp, rand, choice, installMixins } from './utils.js';
import { assets } from './assets.js';
import { createConcurrencyGate } from './gameplay-rules.js';
// `?v=` tokens follow the convention already used for site-audio.js: they let
// an edited sub-module bust the browser's per-origin ES-module cache.
import { buildAllImpulseResponses, ZONE_SPECS, ZONE_NAMES } from './audio/ir.js?v=1';
import { roomIdAt, zoneForRoom, surfaceForRoom, DEFAULT_ZONE } from './audio/zones.js?v=1';
import { OcclusionCache } from './audio/occlusion.js?v=2';
import { renderBank } from './audio/synth.js?v=1';
import { MasterMix } from './audio/mix.js?v=1';
import { VoicePool } from './audio/pool.js?v=1';
import { AmbienceBed } from './audio/ambience.js?v=1';
import { CASING_KINDS, CASING_SURFACE, GENERIC_CASING, BOLT_EJECT_DELAY } from './audio/casings.js?v=1';
// Ejection behaviour comes off the weapon definitions themselves — see the
// comment on CASING_BY_SFX. weapons.js is already in this bundle's graph (both
// main.js and game.js import it) and does not import the audio engine, so this
// is a lookup table, not a new dependency.
import { CASING_BY_SFX } from './weapons.js';
import { AudioEngineFallbacks, midi } from './audio/engine-fallbacks.js';

const DB = (db) => Math.pow(10, db / 20);

// Air absorption: open at 2 m, ~1.5 kHz by 40 m.
const AIR_NEAR_M = 2, AIR_FAR_M = 40, AIR_NEAR_HZ = 20000, AIR_FAR_HZ = 1500;
function airCutoff(d) {
  const t = clamp((d - AIR_NEAR_M) / (AIR_FAR_M - AIR_NEAR_M), 0, 1);
  return AIR_NEAR_HZ * Math.pow(AIR_FAR_HZ / AIR_NEAR_HZ, t);
}

// play-name -> file name(s). Missing files fall back to synth.
const FILE_MAP = {
  // per-gun shot sounds (files generated per weapon; synth fallback per weapon)
  shot_pistol: ['shot_pistol'], shot_magnum: ['shot_magnum'], shot_raygun: ['shot_raygun'],
  shot_dg2: ['shot_dg2'], shot_rocket: ['shot_rocket'],
  shot_kar98: ['shot_kar98'], shot_gewehr43: ['shot_gewehr43'], shot_m1a1: ['shot_m1a1'],
  shot_mp40: ['shot_mp40'], shot_thompson: ['shot_thompson'], shot_type100: ['shot_type100'],
  shot_dbshotgun: ['shot_dbshotgun'], shot_trench: ['shot_trench'], shot_stg44: ['shot_stg44'],
  shot_fg42: ['shot_fg42'], shot_bar: ['shot_bar'], shot_mg42: ['shot_mg42'],
  shot_browning: ['shot_browning'], shot_ptrs41: ['shot_ptrs41'], shot_panzerschreck: ['shot_panzerschreck'],
  shot_m1garand: ['shot_m1garand'], shot_mosin: ['shot_mosin'], shot_springfield: ['shot_springfield'],
  shot_ppsh: ['shot_ppsh'], shot_ump45: ['shot_ump45'], shot_acr: ['shot_acr'], shot_famas: ['shot_famas'],
  shot_ak74u: ['shot_ak74u'], shot_galil: ['shot_galil'], shot_commando: ['shot_commando'],
  rel_ping: ['rel_ping'],
  explosion: ['explosion'],
  // staged reload foley (scheduled per weapon, synced to rig sub-animations)
  rel_magout: ['rel_magout'], rel_magin: ['rel_magin'], rel_boltopen: ['rel_boltopen'],
  rel_boltclose: ['rel_boltclose'], rel_slide: ['rel_slide'], rel_charge: ['rel_charge'],
  rel_shell: ['rel_shell'], rel_clip: ['rel_clip'], rel_open: ['rel_open'], rel_close: ['rel_close'],
  rel_cellout: ['rel_cellout'], rel_cellin: ['rel_cellin'], rel_belt: ['rel_belt'],
  rel_cover: ['rel_cover'], rel_rocket: ['rel_rocket'], rel_pump: ['rel_pump'],
  dry: ['dry'], melee: ['melee'],
  // bolt-action foley (unique per rifle)
  bolt_kar98_out: ['bolt_kar98_out'], bolt_kar98_in: ['bolt_kar98_in'],
  bolt_mosin_out: ['bolt_mosin_out'], bolt_mosin_in: ['bolt_mosin_in'],
  bolt_springfield_out: ['bolt_springfield_out'], bolt_springfield_in: ['bolt_springfield_in'],
  groan: ['groan1', 'groan2', 'groan3', 'groan4', 'groan5', 'groan6', 'groan7', 'groan8', 'groan9', 'groan10'],
  snarl: ['snarl1', 'snarl2', 'snarl3', 'snarl4'], zdeath: ['zdeath1', 'zdeath2', 'zdeath3', 'zdeath4'],
  dog: ['dog_growl', 'dog_growl2'], dog_howl: ['dog_howl'], dog_death: ['dog_death'],
  count_tick: ['count_tick'], count_go: ['count_go'],
  board_tear: ['board_tear'], board_build: ['board_build'],
  door: ['door_open'], buy: ['buy'], deny: ['deny'], drink: ['drink'],
  bottle_break: ['bottle_break'], belch: ['belch'],
  power: ['power'], tele_charge: ['teleporter'], teleport: ['tele_zap'],
  pap_insert: ['pap_insert'], pap_done: ['pap_done'], pap_whirr: ['pap'],
  box_spin: ['box_spin'], box_ready: ['pap_done'], teddy: ['teddy'],
  round_start: ['round_start'], round_end: ['round_end'], gameover: ['gameover'],
  nuke: ['ann_nuke'], maxammo: ['ann_maxammo'], doublepoints: ['ann_double'], instakill: ['ann_insta'], ann_dogs: ['ann_dogs'],
  hurt: ['hurt1', 'hurt2', 'hurt3'], revive: ['revive'], step: ['step1', 'step2', 'step3', 'step4'], zstep: ['step1'],
  hitmarker: ['hitmarker'], hitmarker_kill: ['hitmarker'],
  trap: ['trap'], ui: ['ui'], ui_hover: ['ui'],
  grenade: ['grenade'], monkey_windup: ['monkey_windup'], monkey_cymbal: ['monkey_cymbal'],
  pap_zap: ['pap_zap'],
  knuckles: ['knuckles'],
  inspect_rifle: ['inspect_rifle'], inspect_smg: ['inspect_smg'], inspect_pistol: ['inspect_pistol'],
  inspect_sniper: ['inspect_sniper'], inspect_lmg: ['inspect_lmg'], inspect_shotgun: ['inspect_shotgun'],
  inspect_wonder: ['inspect_wonder'], inspect_launcher: ['inspect_launcher'],
};
// every gun gets a PaP variant name (file generated per weapon; synth fallback handled by caller)
for (const k of Object.keys(FILE_MAP)) if (k.startsWith('shot_')) FILE_MAP[k + '_pap'] = [k + '_pap'];
// generic class fallbacks game.js can reach via `s.sfx || 'shot_rifle'`
FILE_MAP.shot_rifle = ['shot_rifle', 'shot_kar98'];
FILE_MAP.shot_smg = ['shot_smg', 'shot_mp40'];
FILE_MAP.shot_lmg = ['shot_lmg', 'shot_mg42'];
FILE_MAP.shot_sniper = ['shot_sniper', 'shot_kar98'];
FILE_MAP.shot_shotgun = ['shot_shotgun', 'shot_trench'];

// ---------------------------------------------------------------------------
// Sounds that FILE_MAP does not cover: bullet impacts, ricochets, whiz-bys,
// shell casings, weapon foley, stingers and the explosion sub/tail layers.
//
// Each name resolves through `_sample()`, which prefers the recorded
// ElevenLabs asset in assets/audio/ and falls back to the identically-named
// procedural render in audio/synth.js. The synth bank is therefore still the
// live degradation path for any file that fails to fetch or decode.
// ---------------------------------------------------------------------------
const PROC_MAP = {
  impact_concrete: ['impact_concrete1', 'impact_concrete2', 'impact_concrete3'],
  impact_metal: ['impact_metal1', 'impact_metal2', 'impact_metal3'],
  impact_wood: ['impact_wood1', 'impact_wood2', 'impact_wood3'],
  impact_dirt: ['impact_dirt1', 'impact_dirt2', 'impact_dirt3'],
  impact_flesh: ['impact_flesh1', 'impact_flesh2', 'impact_flesh3'],
  impact_glass: ['impact_glass1', 'impact_glass2', 'impact_glass3'],
  ricochet: ['ricochet1', 'ricochet2', 'ricochet3'],
  whizby: ['whizby1', 'whizby2', 'whizby3'],
  // One family per casing kind per floor surface — see js/audio/casings.js.
  casing_pistol_concrete: ['casing_pistol_concrete1', 'casing_pistol_concrete2', 'casing_pistol_concrete3'],
  casing_pistol_metal: ['casing_pistol_metal1', 'casing_pistol_metal2', 'casing_pistol_metal3'],
  casing_rifle_concrete: ['casing_rifle_concrete1', 'casing_rifle_concrete2', 'casing_rifle_concrete3'],
  casing_rifle_metal: ['casing_rifle_metal1', 'casing_rifle_metal2', 'casing_rifle_metal3'],
  casing_shell_concrete: ['casing_shell_concrete1', 'casing_shell_concrete2', 'casing_shell_concrete3'],
  casing_shell_metal: ['casing_shell_metal1', 'casing_shell_metal2', 'casing_shell_metal3'],
  casing_link_concrete: ['casing_link_concrete1', 'casing_link_concrete2', 'casing_link_concrete3'],
  casing_link_metal: ['casing_link_metal1', 'casing_link_metal2', 'casing_link_metal3'],
  foley_sling: ['foley_sling'], foley_cloth: ['foley_cloth'],
  foley_raise: ['foley_raise'], foley_lower: ['foley_lower'],
  slide: ['foley_slide'],
  land: ['land_thud'], land_foley: ['land_foley'],   // synth-only (no recorded take)
  sub_impact: ['sub_impact'], explosion_tail: ['explosion_tail'],
  stinger_round_start: ['stinger_round_start'], stinger_round_end: ['stinger_round_end'],
  amb_metal: ['amb_metal1', 'amb_metal2', 'amb_metal3'],
  amb_drip: ['amb_drip1', 'amb_drip2', 'amb_drip3'],
  amb_artillery: ['amb_artillery1', 'amb_artillery2', 'amb_artillery3'],
};
// Recorded single footfalls per surface. The toe half of the gait stays
// procedural, so a footstep is still a two-part heel/toe event.
const STEP_FILES = {
  concrete: ['step_concrete1', 'step_concrete2'],
  metal: ['step_metal1', 'step_metal2'],
  gravel: ['step_gravel1', 'step_gravel2'],
  water: ['step_water1', 'step_water2'],
};
const IMPACT_SURFACES = ['concrete', 'metal', 'wood', 'dirt', 'flesh', 'glass'];
// (shells land on whatever you stand on: CASING_SURFACE in audio/casings.js)

// Per-shot low-end character. Anything unlisted uses the default.
const SHOT_WEIGHT = {
  shot_pistol: 0.45, shot_m1a1: 0.5, shot_mp40: 0.5, shot_type100: 0.45, shot_ump45: 0.5,
  shot_thompson: 0.6, shot_ppsh: 0.55, shot_stg44: 0.7, shot_fg42: 0.7, shot_ak74u: 0.55,
  shot_acr: 0.6, shot_famas: 0.6, shot_galil: 0.65, shot_commando: 0.65, shot_gewehr43: 0.7,
  shot_kar98: 0.95, shot_mosin: 0.95, shot_springfield: 0.95, shot_m1garand: 0.85,
  shot_bar: 0.9, shot_mg42: 0.8, shot_browning: 0.95, shot_ptrs41: 1.25, shot_magnum: 0.85,
  shot_dbshotgun: 1.15, shot_trench: 1.05, shot_panzerschreck: 1.3, shot_rocket: 1.3,
  shot_raygun: 0.35, shot_dg2: 0.9,
};
// Shots that trigger the concussion / ear-ring treatment when fired close by.
// This is ONLY about the player's ears. It used to double as "does this weapon
// eject brass", which is a different question with different members — see
// js/audio/casings.js.
//
// Membership is about CADENCE as much as muzzle energy. The ring runs for ~2 s;
// anything you can fire faster than that leaves the tone permanently up, and a
// 4 kHz sine that never decays is a chime sitting on top of the gun, not a
// concussion. That is why the DG-2 (one shot a second) is not in here despite
// being the loudest thing in the game — the duck and the low-pass sweep give it
// its weight, and every member below is a deliberate single shot.
const CONCUSSIVE = new Set(['shot_panzerschreck', 'shot_rocket', 'shot_ptrs41']);
// (`nuke` is the announcer line, not a blast — deliberately excluded.)
const EXPLOSIVE = new Set(['explosion', 'grenade', 'monkey_cymbal', 'trap']);
// Smallest blast that rings the player's ears, in metres of splash radius. Sits
// between the wonder-weapon/C-3000 splashes (2 - 3.2 m) and the ordnance a
// player only sets off now and then: frag and monkey (4 m), Panzerschreck (4 m),
// Longinus (5 m). See `_playExplosionLayers`.
const CONCUSSION_MIN_RADIUS = 4;
// Anything that should never be layered, spatially processed as a weapon, etc.
const NON_POSITIONAL = new Set(['ui', 'ui_hover', 'buy', 'deny', 'hitmarker', 'hitmarker_kill']);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, sfx: 1.0, music: 0.7, voice: 0.55 };
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this._groanSlots = 0;
    this._dogVoiceGate = createConcurrencyGate(2);
    this._loops = new Map();
    this._musicTimer = null;
    this.enabled = true;

    // --- new subsystems (all created in init()) ---------------------------
    this.mix = null;            // MasterMix
    this.pool = null;           // VoicePool
    this.ambience = null;       // AmbienceBed
    this.bank = null;           // procedural AudioBuffers (null until rendered)
    this.bankReady = false;
    this.occlusion = new OcclusionCache({ testsPerSecond: 15 });
    this.zones = { irs: null, convolvers: {}, gains: {}, current: DEFAULT_ZONE, forced: null };
    // Inferred from `round_start` (which fires once at the top of every round),
    // or set authoritatively via setRound(). 0 until the first round begins.
    this.round = 0;
    this.surface = 'concrete';          // listener's current footstep surface
    this.roomId = null;

    // listener motion tracking (drives footstep gait + landing, no game.js help)
    this._lm = { t: 0, x: 0, y: 0, z: 0, speed: 0, vy: 0, fallFrom: null, airborne: 0, valid: false };
    this._lastStepT = 0;
    this._stepToe = 0;
    this._lastLandT = 0;

    // weapon state derived at the call site
    this._shotT = new Map();    // sfx name -> last fire time (ms)
    this._burstN = new Map();   // sfx name -> shots since the burst began
    this._ammo = null;          // { cur, max } when game.js calls setAmmoState
    this._lastConcussionT = 0;
    this._hurtTimes = [];
    this._slowT = 0;
    this.stats = { plays: 0, culled: 0, layers: 0, errors: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;

    // ---- master chain, buses, dynamic-mix effects -------------------------
    this.mix = new MasterMix(c);
    this.master = this.mix.master;
    this.comp = this.mix.comp;        // kept for backwards compatibility
    this.limiter = this.mix.limiter;
    this.bus = this.mix.buses;

    // ---- convolution reverb zones -----------------------------------------
    // One shared send bus feeds four always-on convolvers; crossfading happens
    // at the convolver *outputs*, so moving between rooms never rebuilds a node.
    this.revSend = c.createGain(); this.revSend.gain.value = 1;
    this.revReturn = c.createGain(); this.revReturn.gain.value = 1;
    this.revReturn.connect(this.bus.sfx);
    try {
      this.zones.irs = buildAllImpulseResponses(c);
      for (const name of ZONE_NAMES) {
        const ir = this.zones.irs[name];
        if (!ir) continue;
        const conv = c.createConvolver();
        conv.normalize = true;
        conv.buffer = ir;
        const g = c.createGain();
        g.gain.value = name === DEFAULT_ZONE ? (ZONE_SPECS[name].wet || 0.3) : 0;
        this.revSend.connect(conv);
        conv.connect(g);
        g.connect(this.revReturn);
        this.zones.convolvers[name] = conv;
        this.zones.gains[name] = g;
      }
    } catch (e) { this.stats.errors++; } // no reverb is survivable; silence is not

    // ---- pooled voices -----------------------------------------------------
    this.pool = new VoicePool(c, this.revSend);

    // legacy noise buffer, still used by every synth fallback below
    const len = c.sampleRate * 1.2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.ambience = new AmbienceBed(this);
    this.applyVolumes();

    // Render the procedural sample bank in the background; nothing waits on it
    // and every consumer treats a missing buffer as "skip silently".
    renderBank(c.sampleRate).then((bank) => {
      this.bank = bank;
      this.bankReady = true;
    }).catch(() => { this.bank = Object.create(null); this.bankReady = false; });
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.enabled ? this.volumes.master : 0;
    this.bus.sfx.gain.value = this.volumes.sfx;
    this.bus.music.gain.value = this.volumes.music;
    this.bus.voice.gain.value = this.volumes.voice * 1.8;
    this.bus.ui.gain.value = Math.min(1, this.volumes.sfx * 0.9);
    if (this.bus.amb) this.bus.amb.gain.value = 0.9;
  }
  setVolume(kind, v) { this.volumes[kind] = v; this.applyVolumes(); }

  // =====================================================================
  // Listener
  // =====================================================================
  updateListener(x, y, z, yaw) {
    // A single bad frame must not poison every subsequent spatial solve.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (!Number.isFinite(yaw)) yaw = this.listener.yaw;
    const l = this.listener;
    const lm = this._lm;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (lm.valid) {
      const dt = Math.min(0.25, Math.max(0.001, (now - lm.t) / 1000));
      const dx = x - lm.x, dz = z - lm.z, dy = y - lm.y;
      const s = Math.hypot(dx, dz) / dt;
      // light smoothing: a single dropped frame must not read as a sprint
      lm.speed += (s - lm.speed) * 0.35;
      lm.vy = dy / dt;
      if (lm.vy < -1.1) {
        lm.airborne++;
        if (lm.fallFrom == null) lm.fallFrom = lm.y;
      } else if (Math.abs(lm.vy) < 0.6 && lm.airborne >= 2) {
        const height = (lm.fallFrom == null ? 0 : lm.fallFrom - y);
        lm.airborne = 0; lm.fallFrom = null;
        if (height > 0.5) this._landing(height, now);
      } else if (lm.vy > 0.2) {
        lm.airborne = 0; lm.fallFrom = null;
      }
    }
    lm.t = now; lm.x = x; lm.y = y; lm.z = z; lm.valid = true;
    l.x = x; l.y = y; l.z = z; l.yaw = yaw;

    // Slow tick: zone crossfade, ambience follow, duck bookkeeping. ~8 Hz, no
    // allocation, so this is safe to drive from the render loop.
    if (now - this._slowT > 125) {
      this._slowT = now;
      try { this._slowTick(); } catch (e) { this.stats.errors++; }
    }
  }

  _slowTick() {
    const l = this.listener;
    // game.js is authoritative when it drives setListenerRoom(); only fall back
    // to the position lookup when it has gone quiet for half a second.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - (this._roomDrivenT || 0) > 500) {
      // feet are ~1.6 m below the ear; room lookup wants the body position
      this.roomId = roomIdAt(l.x, l.z, l.y - 1.6);
      this.surface = surfaceForRoom(this.roomId);
    }
    const zone = this.zones.forced || zoneForRoom(this.roomId);
    this._crossfadeZone(zone);
    this.ambience?.update();
    this.mix?.tick(this.ctx.currentTime);
    // low-health heuristic decay (only when game.js is not authoritative)
    if (!this._intensityDriven) this._decayHurtHeuristic();
  }

  _crossfadeZone(zone) {
    if (!this.ctx) return;
    this.zones.current = zone;
    const t = this.ctx.currentTime;
    for (const name of ZONE_NAMES) {
      const g = this.zones.gains[name];
      if (!g) continue;
      const target = name === zone ? (ZONE_SPECS[name].wet || 0.3) : 0;
      g.gain.setTargetAtTime(target, t, 0.35);
    }
  }

  // =====================================================================
  // Spatialisation
  // =====================================================================
  /** Legacy shape, unchanged: `{ vol, pan }` or null when out of range. */
  _spatial(pos, baseVol, refDist = 6, maxDist = 42) {
    const s = this._spatial3(pos, baseVol, refDist, maxDist);
    return s && { vol: s.vol, pan: s.pan };
  }

  /**
   * Full spatial solve: inverse-distance gain with rolloff, air-absorption
   * cutoff, occlusion (budgeted), equal-power pan from the listener's right
   * vector, and a distance-scaled reverb send.
   */
  _spatial3(pos, baseVol, refDist = 6, maxDist = 42, opts = null) {
    if (!pos) {
      return { vol: baseVol, pan: 0, dist: 0, cutoff: 22000, occl: 0, send: (ZONE_SPECS[this.zones.current]?.wet || 0.3) * 0.35 };
    }
    const l = this.listener;
    const px = pos.x, py = (pos.y == null ? 1 : pos.y), pz = pos.z;
    // A NaN/Infinity emitter position must never reach an AudioParam.
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return null;
    const dx = px - l.x, dy = py - l.y, dz = pz - l.z;
    const d = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(d) || d > maxDist) return null;

    // proper inverse-distance rolloff (was a quadratic that killed anything >15 m)
    const rolloff = 1.6;
    let vol = baseVol * clamp(refDist / (refDist + rolloff * Math.max(0, d - refDist)), 0.0, 1);

    let cutoff = opts?.noAir ? 22000 : airCutoff(d);

    // occlusion — memoised and hard-budgeted, never a raycast per sound
    let occl = 0;
    if (d > 1.5) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      occl = this.occlusion.amountFor(px, py, pz, l.x, l.y, l.z, now);
      if (occl > 0) {
        vol *= 1 - 0.55 * occl;              // -7 dB fully occluded
        cutoff = Math.min(cutoff, 22000 * Math.pow(0.028, occl)); // down to ~600 Hz
      }
    }

    // equal-power pan across the listener's right vector
    const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
    const horiz = Math.max(0.001, Math.hypot(dx, dz));
    const pan = clamp(((dx * rx + dz * rz) / horiz) * 0.85, -0.95, 0.95);

    // wetter with distance and with occlusion — the far room is mostly its tail
    const zoneWet = ZONE_SPECS[this.zones.current]?.wet || 0.3;
    const send = clamp(zoneWet * (0.28 + d / 26 + occl * 0.55), 0, 1.2);

    return { vol, pan, dist: d, cutoff, occl, send };
  }

  // =====================================================================
  // Core emitter — every buffer playback in the engine funnels through here.
  // Uses a pooled voice chain, so sustained fire adds no nodes to the graph.
  // =====================================================================
  _emit(buf, {
    pos = null, vol = 1, rate = 1, bus = 'sfx', refDist = 6, maxDist = 42,
    delay = 0, send = 1, sendOnly = false, cutoffScale = 1, noAir = false,
    pan: forcedPan = null, offset = 0, duration = null,
  } = {}) {
    if (!buf || !this.ctx || !this.enabled) return null;
    const c = this.ctx;
    let v = vol, pan = forcedPan ?? 0, cutoff = 22000, sendAmt = 0;
    if (pos) {
      const sp = this._spatial3(pos, vol, refDist, maxDist, { noAir });
      if (!sp) { this.stats.culled++; return null; }
      v = sp.vol; if (forcedPan == null) pan = sp.pan;
      cutoff = sp.cutoff; sendAmt = sp.send * send;
    } else {
      cutoff = noAir ? 22000 : 22000;
      sendAmt = (ZONE_SPECS[this.zones.current]?.wet || 0.3) * 0.3 * send;
    }
    // Final guard: no non-finite value may ever be written to an AudioParam.
    if (!Number.isFinite(v)) v = 0;
    if (!Number.isFinite(pan)) pan = 0;
    if (!Number.isFinite(cutoff)) cutoff = 22000;
    if (!Number.isFinite(sendAmt)) sendAmt = 0;
    if (!Number.isFinite(rate) || rate <= 0) rate = 1;
    if (!Number.isFinite(delay) || delay < 0) delay = 0;
    if (v <= 0.0004 && !sendOnly) { this.stats.culled++; return null; }

    const voice = this.pool.acquire();
    if (!voice) { this.stats.culled++; return null; }

    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.05, rate);

    voice.gain.gain.value = sendOnly ? 0 : v;
    voice.lp.frequency.value = clamp(cutoff * cutoffScale, 60, Math.min(22000, c.sampleRate * 0.49));
    voice.pan.pan.value = clamp(pan, -1, 1);
    voice.send.gain.value = clamp(sendAmt, 0, 1.5);
    this.pool.route(voice, this.bus[bus] || this.bus.sfx);
    src.connect(voice.gain);
    voice.src = src;

    const when = c.currentTime + Math.max(0, delay);
    const dur = (duration == null ? buf.duration : duration) / Math.max(0.05, rate);
    try {
      if (duration == null) src.start(when, offset);
      else src.start(when, offset, duration);
    } catch (e) { this.stats.errors++; this.pool.release(voice); return null; }

    const done = () => { if (voice.src === src) this.pool.release(voice); };
    src.onended = done;
    // Safety net: `ended` does not fire while a context is suspended.
    voice.endTimer = setTimeout(done, (Math.max(0, delay) + dur) * 1000 + 250);
    this.stats.plays++;
    return src;
  }

  /**
   * Fade a still-playing one-shot out and retire its voice early.
   *
   * One-shots are fire-and-forget, but a few of them describe a motion that
   * the player can cut short — the slide scrape is authored for the full
   * 1.05 s and has to stop when a wall does. `src` is whatever `play()`
   * returned; a sound that has already finished is a no-op.
   */
  fadeOut(src, sec = 0.12) {
    if (!src || !this.ctx) return;
    const voice = this.pool.active.find((v) => v.src === src);
    if (!voice) return;
    const t = this.ctx.currentTime;
    const g = voice.gain.gain;
    // Exponential, so it reads as the scrape running out rather than a gate.
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + sec);
    try { src.stop(t + sec + 0.01); } catch (e) { this.stats.errors++; }
  }

  /**
   * Resolve one sample name to a buffer, preferring the recorded ElevenLabs
   * asset and falling back to the identically-named procedural render. This is
   * the single degradation seam: if a file fails to fetch or decode, the synth
   * version takes over silently and nothing else in the engine changes.
   */
  _sample(name) {
    const real = assets.audioReady ? assets.sound(name) : null;
    return real || (this.bank ? this.bank[name] || null : null);
  }

  /**
   * Seam-smooth a buffer for looping: fold the tail back over the head with a
   * crossfade and mark the shortened loop point. Recorded assets have no loop
   * markers, so a raw `loop = true` on one clicks once per cycle.
   * Result is cached per source buffer — done once, never per play.
   */
  _loopSafe(buf, fadeSec = 0.35) {
    if (!buf || !this.ctx) return buf;
    if (Number.isFinite(buf.__loopEnd)) return buf;          // already prepared
    this._loopCache = this._loopCache || new WeakMap();
    const hit = this._loopCache.get(buf);
    if (hit) return hit;
    try {
      const sr = buf.sampleRate;
      const fade = Math.floor(Math.min(fadeSec, buf.duration * 0.25) * sr);
      if (fade < 64) { this._loopCache.set(buf, buf); return buf; }
      const out = this.ctx.createBuffer(buf.numberOfChannels, buf.length, sr);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const src = buf.getChannelData(ch);
        const dst = out.getChannelData(ch);
        dst.set(src);
        const head = src.length - fade;
        for (let i = 0; i < fade; i++) {
          const w = i / fade;
          dst[i] = src[i] * w + src[head + i] * (1 - w);
        }
      }
      out.__loopEnd = (buf.length - fade) / sr;
      this._loopCache.set(buf, out);
      return out;
    } catch (e) { this.stats.errors++; return buf; }
  }

  /** Pick a random available variant from a list of names. */
  _sampleAny(list) {
    if (!list || !list.length) return null;
    const first = this._sample(list.length > 1 ? choice(list) : list[0]);
    if (first) return first;
    for (const n of list) { const b = this._sample(n); if (b) return b; }
    return null;
  }

  /** Play a name from PROC_MAP (recorded file first, synth render second). */
  playProcedural(name, opts = {}) {
    const buf = PROC_MAP[name] ? this._sampleAny(PROC_MAP[name]) : this._sample(name);
    if (!buf) return null;
    return this._emit(buf, opts);
  }

  /** First matching decoded buffer for a play-name, or null. */
  _resolveBuffer(name) {
    const files = FILE_MAP[name];
    if (files && assets.audioReady) {
      if (files.length > 1) {
        const picked = choice(files);
        const b = assets.sound(picked);
        if (b) return b;
        for (const f of files) { const x = assets.sound(f); if (x) return x; }
      } else {
        const b = assets.sound(files[0]);
        if (b) return b;
      }
    }
    return null;
  }

  // ================= SFX =================
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    // Hellhound barks/growls share a strict two-voice budget. Reserve before
    // choosing file vs synth so missing assets cannot bypass the limit.
    let releaseDogVoice = null;
    if (name === 'dog') {
      if (!this._dogVoiceGate.tryAcquire()) return;
      let released = false;
      releaseDogVoice = () => {
        if (released) return;
        released = true;
        this._dogVoiceGate.release();
      };
    }

    // --- special treatments that need to run before/around the base sample ---
    try {
      if (name === 'step') { const r = this._playFootstep(opts); if (r !== undefined) return r; }
      if (name === 'round_start') {
        this.round++;
        this.ambience?.setRound(this.round);
        this.playProcedural('stinger_round_start', { vol: 0.55, bus: 'music', send: 0.8 });
        this.mix?.duck('amb', 7, 3.4);
      }
      if (name === 'round_end') {
        this.playProcedural('stinger_round_end', { vol: 0.5, bus: 'music', send: 0.8 });
        this.mix?.duck('amb', 5, 2.4);
      }
      if (name === 'hurt') this._noteHurt();
      if (name.startsWith('shot_')) {
        const r = this._playShot(name, opts);
        if (r !== undefined) { if (releaseDogVoice) releaseDogVoice(); return r; }
      }
      if (EXPLOSIVE.has(name)) this._playExplosionLayers(name, opts);
    } catch (e) { this.stats.errors++; }

    // generated file path
    const files = FILE_MAP[name];
    if (files && assets.audioReady) {
      const picked = files.length > 1 ? choice(files) : files[0];
      const buf = assets.sound(picked);
      if (buf) {
        const src = this.playBuffer(buf, name, opts);
        if (releaseDogVoice) {
          if (src) {
            src.addEventListener('ended', releaseDogVoice, { once: true });
            setTimeout(releaseDogVoice, Math.ceil(buf.duration / Math.max(0.01, opts.rate || 1) * 1000) + 100);
          } else releaseDogVoice();
        }
        return src;
      }
    }
    // impacts, casings, foley, stingers — recorded asset first, synth fallback
    if (PROC_MAP[name] || this._sample(name)) {
      const src = this.playProcedural(name, opts);
      if (src) { if (releaseDogVoice) releaseDogVoice(); return src; }
    }
    const fn = this['sfx_' + name];
    if (fn) fn.call(this, opts);
    if (releaseDogVoice) setTimeout(releaseDogVoice, 600);
  }

  playBuffer(buf, name, { pos = null, vol = 1, rate = 1, bus = 'sfx', refDist = 6, maxDist = 42 } = {}) {
    if (!buf || !this.ctx) return;
    // zombie voices live on their own bus so the "Zombie voices" option is real
    if (name === 'groan' || name === 'snarl' || name === 'zdeath' || name === 'dog' || name === 'dog_howl' || name === 'dog_death') bus = 'voice';
    let v = vol;
    // footsteps: hushed, with take + pitch variety (no stompy repetition)
    if (name === 'step') { v *= 0.5; rate *= rand(0.92, 1.1); }
    if (name === 'zstep') v *= 0.6;
    // `ui` and `ui_hover` share one asset, so the relationship between a
    // confirm and a mere hover can only live here: a hover is a whisper.
    if (name === 'ui_hover') { v *= 0.45; rate *= 1.06; }
    // The kill variant is the same tick pitched up, not a louder one.
    if (name === 'hitmarker_kill') rate *= 1.18;
    // player hurt: soft, brief, never spammy (0.4s personal space between grunts)
    if (name === 'hurt') {
      v *= 0.55;
      if (this._hurtT && performance.now() - this._hurtT < 400) return;
      this._hurtT = performance.now();
    }
    // zombie voices: one shared budget (max 2 overlapping) so a horde never turns
    // into a wall of noise — plus per-kind shaping
    if (name === 'groan' || name === 'snarl' || name === 'zdeath') {
      if ((this._zvoice || 0) >= 2) return;
      this._zvoice = (this._zvoice || 0) + 1;
      setTimeout(() => { this._zvoice = Math.max(0, this._zvoice - 1); }, buf.duration * 1000);
      // These factors used to be 0.32/0.34 because the zombie takes shipped
      // 12-14 dB hotter than everything else in the library (snarl1 peaked at
      // +1.0 dBTP). The assets are now normalised to the voice family target,
      // so the same in-game balance — the horde sitting a few dB under gunfire
      // — needs a much smaller cut. See scripts/audio-loudness.json.
      if (name === 'groan') { v *= 0.75; rate *= rand(0.88, 1.1); }
      if (name === 'snarl') v *= 0.75;
      if (name === 'zdeath') { v *= 0.8; rate *= rand(0.9, 1.1); }
    }
    if (name === 'bolt_kar98_out' || name === 'bolt_kar98_in' ||
        name === 'bolt_mosin_out' || name === 'bolt_mosin_in' ||
        name === 'bolt_springfield_out' || name === 'bolt_springfield_in') v *= 0.9;

    // Character voice lines duck music and ambience for their whole duration.
    if (name === 'vox') {
      this.mix?.duck('music', 6, buf.duration / Math.max(0.05, rate) + 0.2);
      this.mix?.duck('amb', 6, buf.duration / Math.max(0.05, rate) + 0.2);
    }

    // Reload/bolt foley is first-person kit: keep it dry and present.
    const dryish = name.startsWith('rel_') || name.startsWith('bolt_') || name.startsWith('inspect_') || NON_POSITIONAL.has(name);
    return this._emit(buf, {
      pos, vol: v, rate, bus, refDist, maxDist,
      send: dryish ? 0.35 : 1,
    }) || undefined;
  }

  // =====================================================================
  // Weapon layering
  //
  // A single mono `shot_*.mp3` is only the mechanism/crack. Every shot is
  // assembled from four layers with per-shot randomisation:
  //   1. the sample itself   (pitch +/-3 %, gain +/-1.5 dB)
  //   2. a synthesised sub thump for body
  //   3. a tail: the same sample pushed hard into the current reverb zone,
  //      send scaled by distance -> a real echo in the hall, a slap outdoors
  //   4. a mechanical action clack 30-60 ms behind
  // =====================================================================
  _playShot(name, opts = {}) {
    const buf = this._resolveBuffer(name);
    if (!buf) return undefined;               // let the synth fallback handle it

    const base = name.replace(/_pap$/, '');
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const last = this._shotT.get(name) || 0;
    const firstInBurst = nowMs - last > 260;
    this._shotT.set(name, nowMs);
    const n = firstInBurst ? 1 : (this._burstN.get(name) || 0) + 1;
    this._burstN.set(name, n);

    const pap = name.endsWith('_pap');
    const pos = opts.pos || null;
    const dist = pos ? Math.hypot(pos.x - this.listener.x, (pos.y ?? 1) - this.listener.y, pos.z - this.listener.z) : 0;

    // `_ammo` is the LOCAL player's magazine. A team-mate's or a bot's shot
    // arrives through the same call, so anything derived from it has to be
    // fenced to shots that come from where the listener is standing — otherwise
    // somebody else emptying a Thompson across the room re-pitched your gun and
    // rang your empty-mag ping.
    const selfShot = !pos || dist < 2;
    // game.js decrements the magazine BEFORE it calls setAmmoState, so `cur`
    // is what is left after this round: 0 is the round that just emptied it.
    // This used to test `cur === 1`, which is the round before the last one.
    const lastRound = opts.lastRound ?? (selfShot && this._ammo != null && this._ammo.cur === 0);

    const weight = SHOT_WEIGHT[base] ?? 0.7;

    // per-shot variation: +/-3 % pitch, +/-1.5 dB gain
    let rate = (opts.rate || 1) * rand(0.97, 1.03);
    let gain = (opts.vol ?? 1) * DB(rand(-1.5, 1.5));
    // a burst's opening round is fractionally hotter and brighter
    if (firstInBurst) gain *= DB(1.4);
    if (lastRound) { rate *= 0.985; gain *= DB(0.8); }

    const refDist = opts.refDist ?? 6;
    const maxDist = opts.maxDist ?? 42;

    // ---- 1. mechanism / crack -------------------------------------------
    const src = this._emit(buf, {
      pos, vol: gain, rate, bus: 'sfx', refDist, maxDist,
      send: firstInBurst ? 1.15 : 0.9,
      cutoffScale: firstInBurst ? 1.15 : 1,
    });
    this.stats.layers++;

    // ---- 2. low-end thump -------------------------------------------------
    const thump = this._sample(`gun_thump${1 + ((n + (base.length % 3)) % 3)}`);
    if (thump) {
      this._emit(thump, {
        pos, vol: gain * weight * 0.55 * (pap ? 1.15 : 1), rate: rand(0.94, 1.06) * (pap ? 0.9 : 1),
        bus: 'sfx', refDist: refDist * 1.6, maxDist: maxDist * 1.3,
        delay: 0.002, send: 0.5, noAir: true,
      });
      this.stats.layers++;
    }

    // ---- 3. reverb tail ---------------------------------------------------
    // The same sample again, mostly-dry-muted and shoved into the zone reverb;
    // its send climbs with distance so the far end of the factory really echoes.
    const zoneWet = ZONE_SPECS[this.zones.current]?.wet || 0.3;
    this._emit(buf, {
      pos, vol: gain * 0.001, rate: rate * 0.995, bus: 'sfx',
      refDist, maxDist: maxDist * 1.6,
      delay: 0.018, sendOnly: true,
      send: (1.1 + dist / 24) * (0.6 + zoneWet),
    });
    this.stats.layers++;

    // ---- 4. mechanical action (30-60 ms behind the crack) -----------------
    const mech = this._sample(`gun_mech${1 + (n % 3)}`);
    if (mech && dist < 30) {
      this._emit(mech, {
        pos, vol: gain * 0.34 * (lastRound ? 1.5 : 1), rate: rand(0.93, 1.08) * (lastRound ? 1.18 : 1),
        bus: 'sfx', refDist, maxDist: 30,
        delay: rand(0.03, 0.06), send: 0.4,
      });
      this.stats.layers++;
    }

    // What this weapon throws on the floor, and whether it pings when empty.
    const eject = CASING_BY_SFX[base] || GENERIC_CASING[base] || null;

    // ---- last round: the M1 Garand's en-bloc clip --------------------------
    // `rel_ping` is a clip ejecting, and exactly one weapon in the game has a
    // clip to eject. It used to fire on the last round of EVERY weapon — a
    // 6.6 kHz ring with 70 % of its energy in one twelfth-octave band, i.e. a
    // struck bell, landing behind a pistol shot and behind the Wunderwaffe.
    if (lastRound && eject?.ping) {
      const ping = this._resolveBuffer('rel_ping');
      if (ping) this._emit(ping, { pos, vol: gain * 0.5, rate: rand(0.97, 1.05), bus: 'sfx', refDist, maxDist: 24, delay: 0.075, send: 0.5 });
    }

    // ---- ejected casing ---------------------------------------------------
    // Presence AND timbre come from the weapon definition. The old gate was
    // `!CONCUSSIVE.has(base)` — "does this shot rattle the player's ears" — so
    // the Ray Gun, the Thundergun and every other energy weapon dropped brass,
    // while the PTRS-41 (which throws a 14.5 mm case the size of a banana) did
    // not.
    const kind = eject ? CASING_KINDS[eject.kind] : null;
    if (kind && dist < 14) {
      const surf = CASING_SURFACE[this.surface] || 'concrete';
      this.playProcedural(`${kind.sample}_${surf}`, {
        pos, vol: kind.vol, rate: rand(kind.rate[0], kind.rate[1]), bus: 'sfx',
        // A 12-gram object two metres away: close-range detail, and DRY. At the
        // old send of 0.7 the factory reverb answered every ejected case.
        refDist: 2.5, maxDist: 11, send: 0.18,
        // A bolt gun holds its case until the shooter works the bolt.
        delay: (eject.bolt ? BOLT_EJECT_DELAY : 0) + rand(kind.fall[0], kind.fall[1]),
      });
    }

    // ---- wonder weapons / launchers concuss ------------------------------
    if (CONCUSSIVE.has(base) && dist < 16) this._concuss(pap ? 1 : 0.8);

    return src || null;
  }

  /** Sub-bass + concussion under explosions, grenades and traps. */
  _playExplosionLayers(name, opts = {}) {
    // The ear-ring is for a BLAST — a frag, a rocket, a monkey. It is not for
    // every splash round that lands. The Ray Gun (r=2), Porter's X2 (r=2.5) and
    // the C-3000 (r=3.2) all fire faster than the 2 s ring decays, so ringing on
    // their impacts left a 4 kHz tone up permanently while the trigger was held
    // — the "chime" on exactly those weapons. Callers declare how big the blast
    // was; anything under CONCUSSION_MIN_RADIUS just gets the sub and the tail.
    const blastRadius = opts.blastRadius ?? 0;
    const pos = opts.pos || null;
    const dist = pos ? Math.hypot(pos.x - this.listener.x, (pos.y ?? 1) - this.listener.y, pos.z - this.listener.z) : 0;
    this.playProcedural('sub_impact', {
      pos, vol: (opts.vol ?? 1) * (name === 'trap' ? 0.4 : 0.95), rate: rand(0.9, 1.1),
      bus: 'sfx', refDist: 14, maxDist: 120, noAir: true, send: 0.7,
    });
    // Rolling tail behind the blast — louder and later the further away it is,
    // which is what sells a distant explosion as distant.
    if (name !== 'trap') {
      this.playProcedural('explosion_tail', {
        pos, vol: (opts.vol ?? 1) * clamp(0.3 + dist / 40, 0.3, 0.95), rate: rand(0.92, 1.06),
        bus: 'sfx', refDist: 20, maxDist: 160, noAir: true,
        delay: 0.06 + Math.min(0.35, dist * 0.0029), send: 1.1,
      });
    }
    if (name !== 'trap' && dist < 22 && blastRadius >= CONCUSSION_MIN_RADIUS) {
      this._concuss(clamp(1 - dist / 24, 0.2, 1));
    }
  }

  _concuss(strength) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - this._lastConcussionT < 220) return;   // rate limit
    this._lastConcussionT = now;
    this.mix?.concussion(strength);
  }

  // =====================================================================
  // Footsteps: surface-aware, heel + toe, gait derived from listener motion
  // =====================================================================
  _gait() {
    const s = this._lm.speed;
    if (s > 5.8) return 'sprint';
    if (s > 3.2) return 'walk';
    if (s > 1.4) return 'crouch';
    return 'slow';
  }

  _playFootstep(opts = {}) {
    const surface = opts.surface || this.surface || 'concrete';
    const gait = opts.gait || this._gait();
    const v = 1 + ((Math.random() * 3) | 0);
    // Heel: recorded footfall for this surface, else the procedural heel take.
    const heel = this._sampleAny(STEP_FILES[surface]) || this._sample(`step_${surface}_heel${v}`);
    // Toe: always procedural — it is the short second half of the gait and is
    // deliberately quieter and duller than the heel strike.
    const toe = this._sample(`step_${surface}_toe${((v % 3) + 1)}`);
    if (!heel) return undefined;              // fall through to the shipped step*.mp3

    const level = gait === 'sprint' ? 0.62 : gait === 'walk' ? 0.4 : gait === 'crouch' ? 0.17 : 0.24;
    const pos = opts.pos || null;             // local player steps are head-relative
    const rate = rand(0.94, 1.08) * (gait === 'sprint' ? 1.04 : 1);
    const pan = pos ? null : (this._stepToe ^= 1) ? 0.16 : -0.16;   // alternate feet

    this._emit(heel, {
      pos, vol: level, rate, bus: 'sfx', refDist: 3, maxDist: 26,
      pan, send: 0.55,
    });
    // toe lands 45-75 ms after the heel — this is what makes a step read as a
    // footfall rather than a single click
    if (toe) {
      this._emit(toe, {
        pos, vol: level * 0.55, rate: rate * rand(0.98, 1.06), bus: 'sfx',
        refDist: 3, maxDist: 26, pan, delay: rand(0.045, 0.075), send: 0.55,
      });
    }
    // sprinting adds gear/cloth movement
    if (gait === 'sprint') {
      const cloth = this._sample('foley_cloth');
      if (cloth && Math.random() < 0.7) {
        this._emit(cloth, { pos, vol: 0.2, rate: rand(0.9, 1.15), bus: 'sfx', refDist: 3, maxDist: 14, pan, delay: rand(0, 0.05), send: 0.3 });
      }
    }
    return null;
  }

  /** Landing thud + knee-bend foley, scaled by fall height. */
  _landing(height, nowMs) {
    if (nowMs - this._lastLandT < 180) return;
    this._lastLandT = nowMs;
    const h = clamp(height, 0, 6);
    const strength = clamp(h / 3.2, 0.12, 1);
    const thud = this._sample('land_thud');
    if (thud) {
      this._emit(thud, {
        vol: 0.22 + strength * 0.65, rate: rand(0.92, 1.06) * (1.08 - strength * 0.18),
        bus: 'sfx', send: 0.5,
      });
    }
    const foley = this._sample('land_foley') || this._sample('foley_cloth');
    if (foley) this._emit(foley, { vol: 0.14 + strength * 0.3, rate: rand(0.94, 1.08), bus: 'sfx', delay: 0.04, send: 0.35 });
    // a real drop also thumps the surface you land on
    const step = this._sampleAny(STEP_FILES[this.surface]) || this._sample(`step_${this.surface}_heel1`);
    if (step && strength > 0.4) this._emit(step, { vol: strength * 0.5, rate: 0.88, bus: 'sfx', delay: 0.01, send: 0.5 });
    if (strength > 0.8) this._concuss(0.25);
  }

  // =====================================================================
  // Low-health / intensity
  // =====================================================================
  _noteHurt() {
    if (this._intensityDriven) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._hurtTimes.push(now);
    while (this._hurtTimes.length > 6) this._hurtTimes.shift();
    const recent = this._hurtTimes.filter((t) => now - t < 3500).length;
    // 3 hits downs a player at base HP, so 2 quick hits really is "nearly dead"
    const est = recent >= 2 ? 0.14 : recent >= 1 ? 0.5 : 1;
    this._heurHealth = Math.min(this._heurHealth ?? 1, est);
    this._heurT = now;
    this.mix?.setIntensity(this._heurHealth, clamp(recent / 3, 0, 1));
    this._updateHeartbeat();
  }

  _decayHurtHeuristic() {
    if (this._heurHealth == null || this._heurHealth >= 1) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // mirrors CFG.REGEN_DELAY (4.5 s) then a fast recovery
    if (now - (this._heurT || 0) < 4500) return;
    this._heurHealth = Math.min(1, this._heurHealth + 0.06);
    this.mix?.setIntensity(this._heurHealth, 0);
    this._updateHeartbeat();
  }

  _updateHeartbeat() {
    const low = this.mix ? this.mix.lowHealth : 0;
    if (low > 0.15 && !this._heartTimer) {
      const beat = () => {
        const l = this.mix ? this.mix.lowHealth : 0;
        if (l <= 0.12 || !this.enabled) { this._heartTimer = null; return; }
        const buf = this.bank && this.bank.heartbeat;
        if (buf) this._emit(buf, { vol: 0.22 + l * 0.5, rate: 0.9 + l * 0.35, bus: 'sfx', send: 0.15, noAir: true });
        this._heartTimer = setTimeout(beat, (900 - l * 340));
      };
      this._heartTimer = setTimeout(beat, 120);
    } else if (low <= 0.12 && this._heartTimer) {
      clearTimeout(this._heartTimer); this._heartTimer = null;
    }
  }

  // =====================================================================
  // New public API. Everything here is optional — the engine works without
  // any of it (see the fallbacks noted per method).
  // =====================================================================

  /** Force an acoustic zone: 'corridor' | 'hall' | 'courtyard' | 'lab' | null. */
  setZone(name) {
    this.zones.forced = (name && ZONE_SPECS[name]) ? name : null;
    if (this.ctx) this._crossfadeZone(this.zones.forced || zoneForRoom(this.roomId));
  }

  /**
   * Authoritative room id from game.js (accepts an id string or a room object).
   * While this is being called the position-derived fallback stands down; if the
   * caller stops, the fallback resumes automatically within half a second.
   * Passing null means "outside every room" — the open courtyard treatment.
   */
  setListenerRoom(roomId) {
    this._roomDrivenT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const id = (roomId && typeof roomId === 'object') ? roomId.id : roomId;
    if (id === this.roomId) return;                 // nothing changed; stay cheap
    this.roomId = id ?? null;
    this.surface = surfaceForRoom(this.roomId);
    if (!this.zones.forced && this.ctx) this._crossfadeZone(zoneForRoom(this.roomId));
  }

  /**
   * Install a collider-accurate occlusion test.
   * fn(ex, ey, ez, lx, ly, lz) -> 0..1 (or boolean). Pass null to remove it and
   * fall back to the static wall shell derived from map-layout.js.
   */
  setOcclusionTest(fn) { this.occlusion.setTest(fn); }

  /** { health: 0..1, threat: 0..1 }. Overrides the internal hurt heuristic. */
  setIntensity({ health, threat } = {}) {
    if (Number.isFinite(health) || Number.isFinite(threat)) this._intensityDriven = true;
    this.mix?.setIntensity(health, threat);
    this._updateHeartbeat();
  }

  /** { cur, max } — enables the "last round" shot treatment. */
  setAmmoState(cur, max) {
    if (cur == null) { this._ammo = null; return; }
    this._ammo = { cur: cur | 0, max: max | 0 };
  }

  /** Current round; scales ambience density. Also inferred from round_start. */
  setRound(round) { if (Number.isFinite(round)) { this.round = Math.max(1, round | 0); this.ambience?.setRound(this.round); } }

  /** Surface-tagged bullet impact. surface: concrete|metal|wood|dirt|flesh|glass */
  bulletImpact(pos, surface = 'concrete', vol = 1) {
    const s = IMPACT_SURFACES.includes(surface) ? surface : 'concrete';
    this.playProcedural(`impact_${s}`, { pos, vol: 0.85 * vol, rate: rand(0.9, 1.12), bus: 'sfx', refDist: 5, maxDist: 44, send: 0.9 });
    if (s !== 'flesh' && s !== 'dirt' && Math.random() < 0.28) {
      this.playProcedural('ricochet', { pos, vol: 0.42 * vol, rate: rand(0.92, 1.1), bus: 'sfx', refDist: 6, maxDist: 50, delay: 0.015, send: 1.15 });
    }
  }

  /** Supersonic crack passing the listener. */
  whizBy(pos, vol = 1) {
    this.playProcedural('whizby', { pos, vol: 0.5 * vol, rate: rand(0.9, 1.15), bus: 'sfx', refDist: 2.5, maxDist: 14, send: 0.35 });
  }

  /** Explicit concussion trigger (0..1). */
  concussion(strength = 1) { this._concuss(strength); }

  /** Snapshot for debugging / automated verification. */
  debugState() {
    return {
      zone: this.zones.current,
      forcedZone: this.zones.forced,
      roomId: this.roomId,
      surface: this.surface,
      round: this.round,
      gait: this._gait(),
      listenerSpeed: this._lm.speed,
      bankReady: this.bankReady,
      bankSize: this.bank ? Object.keys(this.bank).length : 0,
      pool: this.pool ? {
        created: this.pool.created, active: this.pool.activeCount,
        free: this.pool.freeCount, steals: this.pool.steals, drops: this.pool.drops,
        nodes: this.pool.nodeCount,
      } : null,
      occlusion: { tests: this.occlusion.tests, cached: this.occlusion.map.size, custom: !!this.occlusion.custom },
      zoneGains: ZONE_NAMES.reduce((o, n) => { o[n] = this.zones.gains[n]?.gain.value ?? null; return o; }, {}),
      globalLP: this.mix ? this.mix.globalLP.frequency.value : null,
      lowHealth: this.mix ? this.mix.lowHealth : 0,
      ambience: this.ambience ? { running: this.ambience.running, loops: this.ambience.loops.length, timers: this.ambience.timers.length, density: this.ambience.density } : null,
      stats: { ...this.stats },
    };
  }

  // looped file (ambience / menu music / music box) with manual gain
  loopFile(name, vol, bus = 'music', startOffset = null) {
    const buf = assets.sound(name);
    if (!buf) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.bus[bus]);
    const offset = Number.isFinite(startOffset)
      ? Math.max(0, startOffset) % Math.max(0.01, buf.duration)
      : rand(0, Math.max(0, buf.duration - 1));
    src.start(0, offset);
    return { src, gain: g, offset, duration: buf.duration, startedAt: c.currentTime, stop: () => { try { src.stop(); } catch (e) {} g.disconnect(); } };
  }

  // ---- Perk jingles: generated vintage jingle files, looped near machines ----
  startJingle(id, kind) {
    if (!this.ctx || this._loops.has(id)) return;
    const file = { jug: 'perk_jug', speed: 'perk_speed', dtap: 'perk_dtap', qr: 'perk_qr' }[kind];
    const buf = file ? assets.sound(file) : null;
    if (buf) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = c.createGain(); g.gain.value = 0;
      const p = c.createStereoPanner();
      src.connect(g); g.connect(p); p.connect(this.bus.music);
      src.start();
      this._loops.set(id, { gain: g, pan: p, src, file: true });
      return;
    }
    // synth fallback (original motifs)
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const p = c.createStereoPanner();
    g.connect(p); p.connect(this.bus.music);
    const state = { gain: g, pan: p, timer: null, kind };
    const motifs = {
      jug:   { bpm: 92, wave: 'sawtooth', notes: [[53,0],[57,.75],[60,1.5],[58,2.25],[57,3],[53,3.75],[50,4.5],[53,5.25]], len: 6 },
      speed: { bpm: 132, wave: 'triangle', notes: [[72,0],[76,.25],[79,.5],[76,.75],[72,1],[79,1.5],[76,1.75],[72,2],[74,2.5],[71,2.75],[72,3]], len: 3.5 },
      dtap:  { bpm: 110, wave: 'square', notes: [[62,0],[62,.5],[66,.75],[69,1.25],[66,1.75],[62,2],[59,2.5],[62,3]], len: 4 },
      qr:    { bpm: 72, wave: 'sine', notes: [[74,0],[77,1],[81,2],[77,3],[74,4],[70,5],[69,6],[70,7]], len: 8 },
    };
    const mo = motifs[kind]; if (!mo) return;
    const beat = 60 / mo.bpm;
    const schedule = () => {
      if (!this._loops.has(id)) return;
      const t = c.currentTime + 0.05;
      for (const [m, b] of mo.notes) {
        const o = c.createOscillator(); o.type = mo.wave; o.frequency.value = midi(m);
        const og = c.createGain();
        const st = t + b * beat;
        og.gain.setValueAtTime(0.0001, st);
        og.gain.linearRampToValueAtTime(0.16, st + 0.02);
        og.gain.exponentialRampToValueAtTime(0.0001, st + beat * 0.9);
        o.connect(og); og.connect(g);
        o.start(st); o.stop(st + beat);
      }
      state.timer = setTimeout(schedule, mo.len * beat * 1000);
    };
    schedule();
    this._loops.set(id, state);
  }
  setJingleProximity(id, dist, pan = 0) {
    const l = this._loops.get(id); if (!l) return;
    const v = clamp(2.2 / (1 + dist * dist * 0.12), 0, 0.5);
    l.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    l.pan.pan.setTargetAtTime(clamp(pan, -0.8, 0.8), this.ctx.currentTime, 0.2);
  }
  stopAllJingles() {
    for (const [id, l] of this._loops) {
      clearTimeout(l.timer);
      try { l.src?.stop(); } catch (e) {}
      try { l.gain.disconnect(); l.pan?.disconnect(); } catch (e) {}
    }
    this._loops.clear();
  }

  // Music box easter egg — generated eerie lullaby, falls back to synth melody.
  // Positional like the gramophone: distance from the radio sets the level.
  playMusicBox(pos = null) {
    if (!this.ctx) return;
    this.stopMusicBox();
    this._musicBoxPos = pos;
    const h = this.loopFile('music_box', 0.5, 'music');
    if (h) { this._musicBox = { gain: h.gain, end: null, handle: h, base: 0.5 }; this.updateMusicBoxSpatial(); return; }
    // synth fallback (original composition)
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.4; g.connect(this.bus.music);
    const mel = [
      [76,0],[72,1],[69,2],[71,3],[72,4],[69,5],[64,6],[67,7],
      [69,8],[72,9],[76,10],[74,11],[71,12],[68,13],[71,14],[68,15],
      [69,16],[64,17],[67,18],[69,19],[71,20],[72,21],[76,22],[79,23],
      [76,24],[72,25],[69,26],[64,27],[69,28],[69,29],[69,30],[69,31],
    ];
    const beat = 0.42;
    const start = c.currentTime + 0.1;
    const nodes = [];
    for (const [m, b] of mel) {
      const t = start + b * beat;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = midi(m);
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(0.30, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.9);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + beat * 2);
      nodes.push(o);
    }
    this._musicBox = { gain: g, nodes, end: setTimeout(() => this.stopMusicBox(), 32 * beat * 1000 + 500), base: 0.42 };
    this.updateMusicBoxSpatial();
  }
  updateMusicBoxSpatial() {
    const mb = this._musicBox;
    if (!mb || !this._musicBoxPos || !mb.handle) return; // synth fallback + non-positional stay flat
    const sp = this._spatial(this._musicBoxPos, mb.base ?? 0.5, 4, 40);
    mb.gain.gain.value = sp ? sp.vol : 0;
  }
  stopMusicBox() {
    if (this._musicBox) {
      clearTimeout(this._musicBox.end);
      try { this._musicBox.handle ? this._musicBox.handle.stop() : this._musicBox.gain.disconnect(); } catch (e) {}
      this._musicBox = null;
    }
    this._musicBoxPos = null;
  }

  // Ambience: layered bed (wind loops + generator buzz + randomised positional
  // one-shots whose density scales with the round). Falls back, in order, to
  // the shipped ambience.mp3 and then to a synth wind bed.
  startAmbience() {
    if (!this.ctx || this._amb) return;
    if (this.ambience) {
      // The procedural bank may still be rendering; retry once it lands so the
      // bed is layered rather than silently degraded to the old single loop.
      const begin = () => { if (this._amb && this.ambience && !this.ambience.running) this.ambience.start(); };
      if (this.bankReady) { this.ambience.start(); this._amb = { bed: this.ambience }; return; }
      this._amb = { bed: this.ambience, pending: setTimeout(begin, 1500) };
      this.ambience.start();   // starts the legacy loop now; beds join on retry
      return;
    }
    const h = this.loopFile('ambience', 0.5, 'music');
    if (h) { this._amb = { handle: h }; return; }
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0.06;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.bus.music);
    src.start(); lfo.start();
    this._amb = { src, lfo, g };
  }
  stopAmbience() {
    if (this._amb) {
      clearTimeout(this._amb.pending);
      try {
        if (this._amb.bed) this._amb.bed.stop();
        else if (this._amb.handle) this._amb.handle.stop();
        else { this._amb.src.stop(); this._amb.lfo.stop(); this._amb.g.disconnect(); }
      } catch (e) {}
      this._amb = null;
    }
  }

  // Beauty of Annihilation easter egg: single playback, restartable.
  // Positional — the song comes FROM the gramophone; distance sets the level.
  playSong(pos = null) {
    if (!this.ctx) return null;
    this.stopSong();
    const c = this.ctx;
    // Stream the 11 MB easter-egg track only for players who activate it.
    // It no longer inflates every solo and multiplayer cold start.
    const el = new Audio('assets/audio/beauty-of-annihilation.mp3');
    el.preload = 'metadata';
    el.playsInline = true;
    const src = c.createMediaElementSource(el);
    const g = c.createGain(); g.gain.value = pos ? 0 : 0.38;
    const p = c.createStereoPanner();
    src.connect(g); g.connect(p); p.connect(this.bus.music);
    this._song = { src, el, gain: g, pan: p, pos, base: 0.5 };
    el.addEventListener('ended', () => { if (this._song?.el === el) this.stopSong(); }, { once: true });
    el.play().catch(() => { if (this._song?.el === el) this.stopSong(); });
    if (pos) this.updateSongSpatial();
    return null;
  }
  // called every frame while the song plays: volume/pan follow the listener
  updateSongSpatial() {
    const s = this._song;
    if (!s || !s.pos) return;
    const sp = this._spatial(s.pos, s.base, 5, 60);
    if (!sp) { s.gain.gain.value = 0; return; }
    // gentler curve for music: audible across the courtyard, full near the disc
    s.gain.gain.value = sp.vol;
    s.pan.pan.value = sp.pan * 0.7;
  }
  stopSong() {
    if (this._song) {
      try { this._song.el?.pause(); if (this._song.el) this._song.el.src = ''; } catch (e) {}
      try { this._song.src.stop(); } catch (e) {}
      try { this._song.gain.disconnect(); } catch (e) {}
      this._song = null;
    }
  }
  get songPlaying() { return !!this._song; }

  dispose() {
    this.stopAllJingles();
    this.stopAmbience();
    this.stopMusicBox();
    if (this._heartTimer) { clearTimeout(this._heartTimer); this._heartTimer = null; }
    try { this.pool?.releaseAll(); } catch (e) {}
    this.occlusion.clear();
    this._shotT.clear();
    this._burstN.clear();
    this._hurtTimes.length = 0;
  }
}

// AudioEngine's methods are split by part across js/audio/engine-*.js. Each file
// is a class whose methods are copied onto AudioEngine.prototype here: one `this`,
// one engine to every caller. A name defined twice is a split mistake, so it fails
// at load.
installMixins(AudioEngine, [
  AudioEngineFallbacks,
]);

export const audio = new AudioEngine();
