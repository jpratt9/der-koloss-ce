// AudioEngine's music and loops: looped files, the perk jingles, the music box,
// the ambience bed and the gramophone song.
// Methods of AudioEngine: js/audio.js copies them onto AudioEngine.prototype.
import { clamp, rand } from '../utils.js';
import { assets } from '../assets.js';
import { midi } from './engine-fallbacks.js';

export class AudioEngineMusic {
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
}
