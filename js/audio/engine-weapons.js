// AudioEngine's weapon sounds: the layered gunshot, explosions and the ear-ring,
// bullet impacts and whiz-bys.
// Methods of AudioEngine: js/audio.js copies them onto AudioEngine.prototype.
import { clamp, rand } from '../utils.js';
import { ZONE_SPECS } from './ir.js?v=1';
import { CASING_KINDS, CASING_SURFACE, GENERIC_CASING, BOLT_EJECT_DELAY } from './casings.js?v=1';
// Ejection behaviour comes off the weapon definitions themselves — see the
// comment on CASING_BY_SFX. weapons.js is already in this bundle's graph (both
// main.js and game.js import it) and does not import the audio engine, so this
// is a lookup table, not a new dependency.
import { CASING_BY_SFX } from '../weapons.js';

const DB = (db) => Math.pow(10, db / 20);

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

// Smallest blast that rings the player's ears, in metres of splash radius. Sits
// between the wonder-weapon/C-3000 splashes (2 - 3.2 m) and the ordnance a
// player only sets off now and then: frag and monkey (4 m), Panzerschreck (4 m),
// Longinus (5 m). See `_playExplosionLayers`.
const CONCUSSION_MIN_RADIUS = 4;

export class AudioEngineWeapons {
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

  /** { cur, max } — enables the "last round" shot treatment. */
  setAmmoState(cur, max) {
    if (cur == null) { this._ammo = null; return; }
    this._ammo = { cur: cur | 0, max: max | 0 };
  }

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
}
