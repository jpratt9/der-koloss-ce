// AudioEngine's synth fallbacks: the sounds play() synthesises when a name has no
// file and no render, and the node helpers they are built from.
// Methods of AudioEngine: js/audio.js copies them onto AudioEngine.prototype.
import { rand } from '../utils.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngineFallbacks {
  _out(busName, vol, pan = 0, when = 0) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    const p = c.createStereoPanner(); p.pan.value = pan;
    g.connect(p); p.connect(this.bus[busName] || this.bus.sfx);
    return g;
  }

  _noise(dest, { dur = 0.2, freq = 1200, q = 0.6, type = 'lowpass', vol = 1, at = 0.002, when = 0, rate = 1 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.05);
    return f;
  }

  _tone(dest, { freq = 440, freqEnd = null, dur = 0.15, type = 'sine', vol = 0.5, at = 0.003, when = 0, detune = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // base gunshot: crack (bandpass snap) + boom (low thump) + optional mech tail
  _gunshot(o, { crack = 3000, boom = 140, dur = 0.16, vol = 0.9, body = 0.5, mech = null, echo = 0 }) {
    const sp = this._spatial(o.pos, vol); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    const j = 1 + rand(-0.04, 0.04); // per-shot detune — no two identical
    this._noise(d, { dur: dur * 0.55, freq: crack * j, type: 'bandpass', q: 0.8, vol: sp.vol * 0.9, at: 0.001 });
    this._noise(d, { dur, freq: 500 * j, type: 'lowpass', vol: sp.vol, at: 0.001 });
    this._tone(d, { freq: boom * j, freqEnd: boom * 0.4, dur: dur * 1.4, type: 'triangle', vol: sp.vol * body });
    if (mech === 'clack') {
      this._noise(d, { dur: 0.03, freq: 2100, type: 'bandpass', q: 2.5, vol: sp.vol * 0.28, when: 0.07 });
      this._noise(d, { dur: 0.03, freq: 1600, type: 'bandpass', q: 2.5, vol: sp.vol * 0.22, when: 0.115 });
    } else if (mech === 'rattle') {
      for (const w of [0.05, 0.095, 0.14]) this._noise(d, { dur: 0.025, freq: 1900, type: 'bandpass', q: 3, vol: sp.vol * 0.2, when: w });
    } else if (mech === 'chug') {
      this._noise(d, { dur: 0.09, freq: 300, type: 'lowpass', vol: sp.vol * 0.5, when: 0.1 });
    }
    if (echo > 0) this._noise(d, { dur: echo, freq: 420, type: 'lowpass', vol: sp.vol * 0.3, at: 0.03, when: dur * 0.8 });
  }

  // ---- per-gun shots (synth fallbacks; generated files take priority) ----
  sfx_shot_pistol(o) { this._gunshot(o, { crack: 2600, boom: 180, dur: 0.13, vol: 0.55, body: 0.4, mech: 'clack' }); }
  sfx_shot_kar98(o) { this._gunshot(o, { crack: 2400, boom: 105, dur: 0.24, vol: 0.85, body: 0.65, echo: 0.5 }); }
  sfx_shot_gewehr43(o) { this._gunshot(o, { crack: 2300, boom: 130, dur: 0.18, vol: 0.75, body: 0.55, mech: 'clack' }); }
  sfx_shot_m1a1(o) { this._gunshot(o, { crack: 2900, boom: 175, dur: 0.12, vol: 0.65, body: 0.42, mech: 'clack' }); }
  sfx_shot_mp40(o) { this._gunshot(o, { crack: 3200, boom: 150, dur: 0.1, vol: 0.5, body: 0.38, mech: 'clack' }); }
  sfx_shot_type100(o) { this._gunshot(o, { crack: 3400, boom: 175, dur: 0.09, vol: 0.45, body: 0.32, mech: 'clack' }); }
  sfx_shot_thompson(o) { this._gunshot(o, { crack: 2600, boom: 115, dur: 0.13, vol: 0.55, body: 0.5, mech: 'clack' }); }
  sfx_shot_dbshotgun(o) { this._gunshot(o, { crack: 1500, boom: 80, dur: 0.32, vol: 0.95, body: 0.85, echo: 0.4 }); }
  sfx_shot_trench(o) { this._gunshot(o, { crack: 1800, boom: 95, dur: 0.27, vol: 0.9, body: 0.75 }); }
  sfx_shot_stg44(o) { this._gunshot(o, { crack: 2700, boom: 140, dur: 0.14, vol: 0.65, body: 0.5, mech: 'clack' }); }
  sfx_shot_fg42(o) { this._gunshot(o, { crack: 3100, boom: 130, dur: 0.12, vol: 0.6, body: 0.45, mech: 'clack' }); }
  sfx_shot_bar(o) { this._gunshot(o, { crack: 2200, boom: 105, dur: 0.17, vol: 0.7, body: 0.6 }); }
  sfx_shot_mg42(o) { this._gunshot(o, { crack: 3000, boom: 120, dur: 0.09, vol: 0.6, body: 0.5, mech: 'rattle' }); }
  sfx_shot_browning(o) { this._gunshot(o, { crack: 2000, boom: 95, dur: 0.16, vol: 0.65, body: 0.6, mech: 'chug' }); }
  sfx_shot_ptrs41(o) { this._gunshot(o, { crack: 1800, boom: 70, dur: 0.45, vol: 1.0, body: 0.95, echo: 0.7 }); }
  sfx_shot_magnum(o) { this._gunshot(o, { crack: 2200, boom: 130, dur: 0.26, vol: 0.8, body: 0.6 }); }
  sfx_shot_panzerschreck(o) {
    const sp = this._spatial(o.pos, 0.85); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    this._noise(d, { dur: 0.5, freq: 700, type: 'lowpass', vol: sp.vol, at: 0.02 });
    this._tone(d, { freq: 200, freqEnd: 60, dur: 0.4, type: 'sawtooth', vol: sp.vol * 0.4 });
    this._noise(d, { dur: 0.6, freq: 1400, type: 'bandpass', q: 0.7, vol: sp.vol * 0.35, at: 0.06, when: 0.08 });
  }
  sfx_shot_rocket(o) { this.sfx_shot_panzerschreck(o); }
  sfx_shot_raygun(o) {
    const sp = this._spatial(o.pos, 0.55); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    const j = 1 + rand(-0.05, 0.05);
    this._tone(d, { freq: 1400 * j, freqEnd: 220, dur: 0.22, type: 'sawtooth', vol: sp.vol * 0.5 });
    this._tone(d, { freq: 2400 * j, freqEnd: 500, dur: 0.18, type: 'square', vol: sp.vol * 0.22 });
    this._noise(d, { dur: 0.12, freq: 3200, type: 'highpass', vol: sp.vol * 0.3 });
  }
  sfx_shot_dg2(o) {
    const sp = this._spatial(o.pos, 0.7); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    this._tone(d, { freq: 90, freqEnd: 40, dur: 0.5, type: 'sawtooth', vol: sp.vol * 0.6 });
    this._noise(d, { dur: 0.5, freq: 5000, type: 'highpass', vol: sp.vol * 0.5, at: 0.005 });
    this._tone(d, { freq: 700, freqEnd: 1400, dur: 0.3, type: 'square', vol: sp.vol * 0.2 });
  }

  sfx_explosion(o) {
    const sp = this._spatial(o.pos, 1.0, 10, 70); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    this._noise(d, { dur: 0.7, freq: 320, type: 'lowpass', vol: sp.vol, at: 0.002 });
    this._tone(d, { freq: 70, freqEnd: 28, dur: 0.8, type: 'triangle', vol: sp.vol * 0.9 });
    this._noise(d, { dur: 0.25, freq: 2500, type: 'bandpass', vol: sp.vol * 0.4, at: 0.001 });
  }

  sfx_dry() { const d = this._out('sfx', 0.35); this._tone(d, { freq: 1400, dur: 0.03, type: 'square', vol: 0.5 }); }
  sfx_reload() {
    const d = this._out('sfx', 0.4);
    this._tone(d, { freq: 900, dur: 0.03, type: 'square', vol: 0.4, when: 0 });
    this._tone(d, { freq: 650, dur: 0.04, type: 'square', vol: 0.4, when: 0.12 });
  }
  sfx_reload_done() { const d = this._out('sfx', 0.45); this._tone(d, { freq: 1200, dur: 0.04, type: 'square', vol: 0.5 }); this._tone(d, { freq: 800, dur: 0.05, type: 'square', vol: 0.4, when: 0.07 }); }
  sfx_swap() { const d = this._out('sfx', 0.3); this._noise(d, { dur: 0.08, freq: 1500, type: 'bandpass', vol: 0.6 }); }
  sfx_melee() { const d = this._out('sfx', 0.4); this._noise(d, { dur: 0.12, freq: 900, type: 'bandpass', q: 2, vol: 0.7, at: 0.01, rate: 0.7 }); }
  sfx_melee_hit(o) { const sp = this._spatial(o.pos, 0.5); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.09, freq: 500, type: 'lowpass', vol: sp.vol, at: 0.001 }); }
  sfx_hitmarker() { const d = this._out('ui', 0.32); this._tone(d, { freq: 2200, dur: 0.025, type: 'square', vol: 0.5 }); }
  sfx_hitmarker_kill() { const d = this._out('ui', 0.4); this._tone(d, { freq: 1500, dur: 0.03, type: 'square', vol: 0.55 }); this._tone(d, { freq: 1000, dur: 0.04, type: 'square', vol: 0.4, when: 0.04 }); }

  sfx_zombie_hit(o) { const sp = this._spatial(o.pos, 0.5); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.1, freq: 700, type: 'lowpass', vol: sp.vol, at: 0.001 }); this._tone(d, { freq: 220, freqEnd: 120, dur: 0.08, type: 'triangle', vol: sp.vol * 0.4 }); }

  // ---- staged reload foley (one-shots, scheduled per weapon) ----
  _click(d, freq, vol, when = 0, dur = 0.03, q = 2.5) { this._noise(d, { dur, freq, type: 'bandpass', q, vol, at: 0.001, when }); }
  _thunk(d, vol, when = 0, dur = 0.07, freq = 380) { this._noise(d, { dur, freq, type: 'lowpass', vol, at: 0.001, when }); this._tone(d, { freq: 140, freqEnd: 80, dur: dur, type: 'triangle', vol: vol * 0.5, when }); }
  sfx_rel_magout(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._click(d, 1300, 0.5); this._noise(d, { dur: 0.09, freq: 2400, type: 'bandpass', q: 1.2, vol: 0.4, when: 0.04 }); }
  sfx_rel_magin(o) { const d = this._out('sfx', 0.55 * (o.vol ?? 1)); this._thunk(d, 0.7); this._click(d, 1700, 0.5, 0.05); }
  sfx_rel_boltopen(o) { const d = this._out('sfx', 0.55 * (o.vol ?? 1)); this._click(d, 900, 0.6, 0, 0.05, 1.5); this._click(d, 1500, 0.45, 0.09); }
  sfx_rel_boltclose(o) { const d = this._out('sfx', 0.6 * (o.vol ?? 1)); this._thunk(d, 0.75, 0, 0.06, 300); this._click(d, 1100, 0.6, 0.03, 0.05, 1.5); }
  sfx_rel_slide(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._click(d, 2000, 0.55); this._click(d, 1500, 0.5, 0.08); }
  sfx_rel_charge(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._click(d, 1200, 0.55, 0, 0.04); this._click(d, 1600, 0.5, 0.09); }
  sfx_rel_shell(o) { const d = this._out('sfx', 0.45 * (o.vol ?? 1)); this._click(d, 700, 0.45, 0, 0.04, 1.2); this._click(d, 1900, 0.35, 0.05); }
  sfx_rel_clip(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._noise(d, { dur: 0.14, freq: 3200, type: 'bandpass', q: 1.5, vol: 0.4, when: 0 }); this._click(d, 1400, 0.5, 0.14); }
  sfx_rel_open(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._noise(d, { dur: 0.1, freq: 500, type: 'lowpass', vol: 0.6 }); this._click(d, 1800, 0.45, 0.08); }
  sfx_rel_close(o) { const d = this._out('sfx', 0.55 * (o.vol ?? 1)); this._thunk(d, 0.8, 0, 0.06, 320); this._click(d, 1300, 0.5, 0.04); }
  sfx_rel_cellout(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._tone(d, { freq: 900, freqEnd: 380, dur: 0.1, type: 'square', vol: 0.3 }); this._click(d, 1000, 0.5, 0.1); }
  sfx_rel_cellin(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._tone(d, { freq: 320, freqEnd: 900, dur: 0.16, type: 'square', vol: 0.3 }); this._click(d, 1500, 0.45, 0.14); }
  sfx_rel_belt(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); for (const w of [0, 0.06, 0.13]) this._click(d, 1700, 0.4, w, 0.025, 3); }
  sfx_rel_cover(o) { const d = this._out('sfx', 0.55 * (o.vol ?? 1)); this._thunk(d, 0.8, 0, 0.09, 240); this._click(d, 900, 0.55, 0.06, 0.06, 1.2); }
  sfx_rel_rocket(o) { const d = this._out('sfx', 0.5 * (o.vol ?? 1)); this._noise(d, { dur: 0.28, freq: 750, type: 'bandpass', q: 0.9, vol: 0.45, at: 0.02 }); this._thunk(d, 0.6, 0.26); }
  sfx_rel_pump(o) { const d = this._out('sfx', 0.55 * (o.vol ?? 1)); this._click(d, 1300, 0.55, 0, 0.04, 1.4); this._click(d, 1700, 0.55, 0.09, 0.04, 1.4); }

  sfx_dog(o) {
    const sp = this._spatial(o.pos, 0.36, 5, 34); if (!sp) return;
    const d = this._out('voice', 1, sp.pan);
    const b = rand(300, 420);
    this._tone(d, { freq: b, freqEnd: b * 0.5, dur: 0.12, type: 'sawtooth', vol: sp.vol * 0.7 });
    this._tone(d, { freq: b * 0.9, freqEnd: b * 0.45, dur: 0.12, type: 'sawtooth', vol: sp.vol * 0.6, when: 0.16 });
  }
  sfx_dog_howl() { // distant, atmospheric, quiet
    const d = this._out('voice', 0.5);
    for (let i = 0; i < 2; i++) {
      const w = i * rand(1.2, 2.2);
      this._tone(d, { freq: rand(380, 460), freqEnd: 300, dur: 1.8, type: 'sine', vol: 0.16, at: 0.4, when: w });
    }
  }

  sfx_board_tear(o) { const sp = this._spatial(o.pos, 0.6); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.18, freq: 700, type: 'bandpass', q: 1.2, vol: sp.vol, at: 0.004, rate: 0.6 }); this._tone(d, { freq: 180, freqEnd: 90, dur: 0.12, type: 'triangle', vol: sp.vol * 0.5 }); }
  sfx_board_build() { const d = this._out('sfx', 0.5); this._tone(d, { freq: 320, dur: 0.05, type: 'triangle', vol: 0.6 }); this._noise(d, { dur: 0.06, freq: 1800, type: 'bandpass', vol: 0.5, when: 0.02 }); }
  sfx_door(o) { const sp = this._spatial(o.pos, 0.8); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.7, freq: 300, type: 'lowpass', vol: sp.vol, at: 0.05 }); this._tone(d, { freq: 90, freqEnd: 60, dur: 0.7, type: 'sawtooth', vol: sp.vol * 0.3 }); }
  sfx_buy() { const d = this._out('ui', 0.5); this._tone(d, { freq: 1320, dur: 0.06, type: 'square', vol: 0.4 }); this._tone(d, { freq: 1760, dur: 0.09, type: 'square', vol: 0.4, when: 0.07 }); }
  sfx_deny() { const d = this._out('ui', 0.4); this._tone(d, { freq: 160, dur: 0.16, type: 'square', vol: 0.4 }); this._tone(d, { freq: 120, dur: 0.2, type: 'square', vol: 0.4, when: 0.12 }); }
  sfx_drink() { const d = this._out('sfx', 0.5); for (let i = 0; i < 3; i++) this._tone(d, { freq: 300 - i * 40, freqEnd: 200, dur: 0.12, type: 'sine', vol: 0.5, when: i * 0.22 }); }
  sfx_bottle_break(o) {
    const sp = this._spatial(o.pos, 0.82, 7, 36); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    // Initial floor impact, bright shard burst, then irregular ringing pieces.
    this._noise(d, { dur: 0.13, freq: 620, type: 'lowpass', vol: sp.vol * 0.62, at: 0.001 });
    this._noise(d, { dur: 0.42, freq: 4300, type: 'highpass', vol: sp.vol, at: 0.001 });
    [2960, 3880, 5170, 6410, 7590].forEach((freq, i) => {
      this._tone(d, { freq, freqEnd: freq * 0.58, dur: 0.15 + i * 0.035, type: 'sine', vol: sp.vol * (0.22 - i * 0.022), when: 0.018 + i * 0.031 });
    });
    this._noise(d, { dur: 0.28, freq: 1300, type: 'bandpass', q: 1.6, vol: sp.vol * 0.38, when: 0.075 });
  }
  sfx_belch(o) {
    const sp = this._spatial(o.pos, 0.86, 8, 34); if (!sp) return;
    const d = this._out('sfx', 1, sp.pan);
    // Low voiced fundamental, two mouth-formant harmonics and a soft airy
    // release. This remains obviously a burp if a file fails to decode.
    this._tone(d, { freq: 96, freqEnd: 58, dur: 0.94, type: 'sawtooth', vol: sp.vol * 0.58, at: 0.035 });
    this._tone(d, { freq: 188, freqEnd: 112, dur: 0.78, type: 'triangle', vol: sp.vol * 0.38, at: 0.025, when: 0.025 });
    this._tone(d, { freq: 286, freqEnd: 168, dur: 0.62, type: 'sine', vol: sp.vol * 0.2, at: 0.018, when: 0.04 });
    this._noise(d, { dur: 0.82, freq: 360, type: 'bandpass', q: 0.85, vol: sp.vol * 0.34, at: 0.045, rate: 0.7 });
    this._tone(d, { freq: 68, freqEnd: 48, dur: 0.3, type: 'triangle', vol: sp.vol * 0.3, when: 0.7 });
  }
  sfx_power() { const d = this._out('sfx', 0.9); this._tone(d, { freq: 60, dur: 0.4, type: 'square', vol: 0.7 }); this._tone(d, { freq: 50, freqEnd: 120, dur: 2.2, type: 'sawtooth', vol: 0.4, when: 0.4 }); this._noise(d, { dur: 1.2, freq: 200, type: 'lowpass', vol: 0.4, when: 0.4 }); }
  sfx_trap() { const d = this._out('sfx', 0.7); this._noise(d, { dur: 0.5, freq: 4000, type: 'highpass', vol: 0.5, at: 0.01 }); this._tone(d, { freq: 120, dur: 0.4, type: 'square', vol: 0.4 }); }
  sfx_tele_charge(o) { const sp = this._spatial(o.pos, 0.8); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._tone(d, { freq: 200, freqEnd: 1800, dur: 2.6, type: 'sine', vol: sp.vol * 0.6, at: 0.4 }); this._noise(d, { dur: 2.6, freq: 3000, type: 'highpass', vol: sp.vol * 0.25, at: 0.8 }); }
  sfx_teleport() { const d = this._out('sfx', 0.8); this._tone(d, { freq: 1800, freqEnd: 200, dur: 0.5, type: 'sine', vol: 0.5 }); this._noise(d, { dur: 0.5, freq: 4000, type: 'highpass', vol: 0.4 }); }
  sfx_pap_insert() { const d = this._out('sfx', 0.7); this._tone(d, { freq: 150, freqEnd: 90, dur: 0.5, type: 'square', vol: 0.4 }); this._noise(d, { dur: 0.6, freq: 500, type: 'lowpass', vol: 0.5 }); }
  sfx_pap_done() { const d = this._out('sfx', 0.8); this._tone(d, { freq: 880, dur: 0.4, type: 'sine', vol: 0.5 }); this._tone(d, { freq: 1320, dur: 0.5, type: 'sine', vol: 0.4, when: 0.15 }); }
  sfx_box_spin() { const d = this._out('ui', 0.45); for (let i = 0; i < 10; i++) this._tone(d, { freq: midi(76 + (i % 5)), dur: 0.07, type: 'square', vol: 0.25, when: i * 0.09 }); }
  sfx_box_ready() { const d = this._out('ui', 0.5); this._tone(d, { freq: 1046, dur: 0.15, type: 'square', vol: 0.4 }); this._tone(d, { freq: 1568, dur: 0.2, type: 'square', vol: 0.35, when: 0.1 }); }
  sfx_teddy() { const d = this._out('ui', 0.6); const seq = [84, 82, 79, 76, 79]; seq.forEach((m, i) => this._tone(d, { freq: midi(m), dur: 0.16, type: 'triangle', vol: 0.35, when: i * 0.13 })); this._tone(d, { freq: 90, freqEnd: 60, dur: 0.7, type: 'sawtooth', vol: 0.25, when: 0.6 }); }
  sfx_nuke() { const d = this._out('sfx', 0.9); this._tone(d, { freq: 440, freqEnd: 460, dur: 1.6, type: 'sawtooth', vol: 0.3, at: 0.2 }); this._tone(d, { freq: 60, freqEnd: 30, dur: 1.8, type: 'triangle', vol: 0.6, when: 1.2 }); }
  sfx_maxammo() { const d = this._out('ui', 0.55); [72, 76, 79, 84].forEach((m, i) => this._tone(d, { freq: midi(m), dur: 0.12, type: 'triangle', vol: 0.35, when: i * 0.09 })); }
  sfx_doublepoints() { const d = this._out('ui', 0.5); [79, 79].forEach((m, i) => this._tone(d, { freq: midi(m), dur: 0.1, type: 'square', vol: 0.3, when: i * 0.14 })); }
  sfx_instakill() { const d = this._out('ui', 0.5); this._tone(d, { freq: 600, freqEnd: 1500, dur: 0.4, type: 'sawtooth', vol: 0.2 }); this._tone(d, { freq: 1500, freqEnd: 500, dur: 0.4, type: 'sawtooth', vol: 0.15, when: 0.35 }); }
  sfx_pickup(o) { const sp = this._spatial(o.pos, 0.5); if (!sp) return; const d = this._out('ui', 1, sp.pan); this._tone(d, { freq: 990, dur: 0.07, type: 'sine', vol: sp.vol }); this._tone(d, { freq: 1490, dur: 0.1, type: 'sine', vol: sp.vol * 0.8, when: 0.06 }); }
  sfx_hurt() { const d = this._out('sfx', 0.6); this._noise(d, { dur: 0.15, freq: 400, type: 'lowpass', vol: 0.8, at: 0.001 }); this._tone(d, { freq: 150, freqEnd: 80, dur: 0.2, type: 'triangle', vol: 0.5 }); }
  sfx_down() { const d = this._out('sfx', 0.8); this._tone(d, { freq: 220, freqEnd: 55, dur: 1.2, type: 'sawtooth', vol: 0.5 }); }
  sfx_revive() { const d = this._out('ui', 0.6); [64, 68, 71, 76].forEach((m, i) => this._tone(d, { freq: midi(m), dur: 0.14, type: 'triangle', vol: 0.35, when: i * 0.1 })); }
  sfx_step() { const d = this._out('sfx', 0.08); this._noise(d, { dur: 0.06, freq: rand(320, 460), type: 'lowpass', vol: 0.7, at: 0.001, rate: rand(0.9, 1.1) }); }
  sfx_zstep(o) { const sp = this._spatial(o.pos, 0.11, 3, 14); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.06, freq: 300, type: 'lowpass', vol: sp.vol, at: 0.001 }); }
  sfx_ui() { const d = this._out('ui', 0.4); this._tone(d, { freq: 700, dur: 0.04, type: 'square', vol: 0.35 }); }
  sfx_ui_hover() { const d = this._out('ui', 0.2); this._tone(d, { freq: 500, dur: 0.03, type: 'square', vol: 0.3 }); }
  sfx_headshot(o) { const sp = this._spatial(o.pos, 0.45); if (!sp) return; const d = this._out('sfx', 1, sp.pan); this._noise(d, { dur: 0.08, freq: 2000, type: 'bandpass', q: 1.5, vol: sp.vol, at: 0.001 }); this._tone(d, { freq: 500, freqEnd: 200, dur: 0.09, type: 'triangle', vol: sp.vol * 0.6 }); }

  // Round stingers (original, atmospheric)
  sfx_round_start() {
    const d = this._out('music', 0.7);
    this._tone(d, { freq: 55, dur: 3.2, type: 'sawtooth', vol: 0.35, at: 0.8 });
    this._tone(d, { freq: 55 * 1.02, dur: 3.2, type: 'sawtooth', vol: 0.3, at: 1.0, detune: 8 });
    this._tone(d, { freq: 110, freqEnd: 108, dur: 2.6, type: 'triangle', vol: 0.22, at: 0.6, when: 0.3 });
    this._noise(d, { dur: 2.8, freq: 250, type: 'lowpass', vol: 0.2, at: 1.2 });
    this._tone(d, { freq: 880, freqEnd: 870, dur: 1.8, type: 'sine', vol: 0.06, at: 0.9, when: 0.4 });
  }
  sfx_round_end() {
    const d = this._out('music', 0.55);
    this._tone(d, { freq: 220, freqEnd: 110, dur: 1.6, type: 'triangle', vol: 0.25, at: 0.15 });
    this._tone(d, { freq: 165, dur: 1.8, type: 'sine', vol: 0.15, at: 0.4, when: 0.2 });
  }
  sfx_gameover() {
    const d = this._out('music', 0.8);
    [57, 56, 55, 50].forEach((m, i) => {
      this._tone(d, { freq: midi(m - 12), dur: 1.6, type: 'sawtooth', vol: 0.3, at: 0.3, when: i * 0.9 });
      this._tone(d, { freq: midi(m - 24), dur: 1.8, type: 'triangle', vol: 0.3, at: 0.3, when: i * 0.9 });
    });
  }
}

export { midi };
