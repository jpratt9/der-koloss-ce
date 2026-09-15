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
  AudioEngineListener, AudioEnginePlayback, AudioEngineWeapons, AudioEngineFallbacks, AudioEngineMusic,
]);

export const audio = new AudioEngine();
