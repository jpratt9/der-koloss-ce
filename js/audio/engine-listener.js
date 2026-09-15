// AudioEngine's listener: where it is, which room and reverb zone it's in, how a
// point sounds from there, and its own footsteps, landings and health.
// Methods of AudioEngine: js/audio.js copies them onto AudioEngine.prototype.
import { clamp, rand } from '../utils.js';
import { ZONE_SPECS, ZONE_NAMES } from './ir.js?v=1';
import { roomIdAt, zoneForRoom, surfaceForRoom } from './zones.js?v=1';

// Air absorption: open at 2 m, ~1.5 kHz by 40 m.
const AIR_NEAR_M = 2, AIR_FAR_M = 40, AIR_NEAR_HZ = 20000, AIR_FAR_HZ = 1500;
function airCutoff(d) {
  const t = clamp((d - AIR_NEAR_M) / (AIR_FAR_M - AIR_NEAR_M), 0, 1);
  return AIR_NEAR_HZ * Math.pow(AIR_FAR_HZ / AIR_NEAR_HZ, t);
}

// Recorded single footfalls per surface. The toe half of the gait stays
// procedural, so a footstep is still a two-part heel/toe event.
const STEP_FILES = {
  concrete: ['step_concrete1', 'step_concrete2'],
  metal: ['step_metal1', 'step_metal2'],
  gravel: ['step_gravel1', 'step_gravel2'],
  water: ['step_water1', 'step_water2'],
};

export class AudioEngineListener {
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
}
