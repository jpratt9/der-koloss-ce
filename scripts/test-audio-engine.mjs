// The audio engine, run in Node against a stand-in for Web Audio.
//
// Nothing else runs it: Node has no AudioContext, so the other validators only
// load js/audio.js. And the engine swallows errors on its hot paths.
// updateListener runs the slow tick inside a try, and play() runs footsteps,
// round stingers, the hurt heuristic and the shot and explosion layers inside
// another; each catch only counts the error in stats.errors. A method that lost
// an import would go silent rather than throw. So this drives every part of the
// engine in js/audio.js and js/audio/engine-*.js and checks that:
//
// - no call throws, and stats.errors stays 0 from init to dispose;
// - every sfx_ synth fallback, every procedural render and every weapon's shot
//   starts a sound, and a shot is layered, with brass only where the weapon
//   throws it and a ping only on the M1 Garand's last round;
// - a close PTRS-41 and a 4 m blast ring the ears, and the Ray Gun and a 2 m
//   splash don't;
// - the listener follows rooms, forced zones and the position lookup, a fall
//   lands, and low health starts and stops the heartbeat;
// - hound barks and zombie voices keep to two at a time;
// - loops, jingles, the music box, the ambience bed and the song start and stop,
//   and dispose releases every voice.
import assert from 'node:assert/strict';
import { loadGameModule } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';

const { audio } = await loadGameModule('audio.js');
const { assets } = await loadGameModule('assets.js');
const { WEAPONS, getStats, CASING_BY_SFX } = await loadGameModule('weapons.js');
// Same ?v= tokens as js/audio.js, so these are the instances the engine uses.
const { PROCEDURAL_NAMES } = await import(new URL('../js/audio/synth.js?v=1', import.meta.url).href);
const { ZONE_NAMES } = await import(new URL('../js/audio/ir.js?v=1', import.meta.url).href);
const { roomIdAt } = await import(new URL('../js/audio/zones.js?v=1', import.meta.url).href);

// ---------------------------------------------------------------------------
// A clock, timers and Web Audio that record what starts playing
// ---------------------------------------------------------------------------
let now = 1000;
const timers = new Map();
let timerSeq = 0;
function advance(ms) {
  const end = now + ms;
  for (;;) {
    let next = null;
    for (const entry of timers) if (entry[1].due <= end && (!next || entry[1].due < next[1].due)) next = entry;
    if (!next) break;
    timers.delete(next[0]);
    now = Math.max(now, next[1].due);
    next[1].fn();
  }
  now = end;
}

const started = [];
const labels = new WeakMap();
const finite = (...values) => { for (const v of values) if (!Number.isFinite(v)) throw new TypeError(`non-finite AudioParam value ${v}`); };
class Param {
  #value;
  constructor(value) { this.#value = value; }
  get value() { return this.#value; }
  set value(v) { finite(v); this.#value = v; }
  setValueAtTime(v, t) { finite(v, t); this.#value = v; return this; }
  linearRampToValueAtTime(v, t) { finite(v, t); return this; }
  exponentialRampToValueAtTime(v, t) { finite(v, t); return this; }
  setTargetAtTime(v, t) { finite(v, t); return this; }
  cancelScheduledValues() { return this; }
}
class NodeStub {
  constructor(kind, params = {}) { this.kind = kind; for (const [name, v] of Object.entries(params)) this[name] = new Param(v); }
  connect(dest) { return dest; }
  disconnect() {}
}
class SourceStub extends NodeStub {
  addEventListener() {}
  start(when = 0) { started.push({ kind: this.kind, buffer: labels.get(this.buffer) ?? null, when }); }
  stop(when = 0) { this.stoppedAt = when; }
}
function makeBuffer(channels, length, sampleRate, label) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  const buf = { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (ch) => data[ch] };
  if (label) labels.set(buf, label);
  return buf;
}
class ContextStub {
  sampleRate = 48000;
  state = 'running';
  destination = new NodeStub('destination');
  get currentTime() { return now / 1000; }
  resume() { return Promise.resolve(); }
  createGain() { return new NodeStub('gain', { gain: 1 }); }
  createBiquadFilter() { return new NodeStub('biquad', { frequency: 350, Q: 1, gain: 0 }); }
  createStereoPanner() { return new NodeStub('panner', { pan: 0 }); }
  createConvolver() { return new NodeStub('convolver'); }
  createDynamicsCompressor() { return new NodeStub('compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }); }
  createBufferSource() { return new SourceStub('buffer', { playbackRate: 1, detune: 0 }); }
  createOscillator() { return new SourceStub('oscillator', { frequency: 440, detune: 0 }); }
  createBuffer(channels, length, sampleRate) { return makeBuffer(channels, length, sampleRate); }
  createMediaElementSource() { return new NodeStub('media'); }
}
const elements = [];
class AudioElementStub {
  constructor(src) { this.src = src; this.listeners = []; elements.push(this); }
  addEventListener(type, fn) { this.listeners.push([type, fn]); }
  play() { return Promise.resolve(); }
  pause() {}
  emit(type) { for (const [t, fn] of this.listeners) if (t === type) fn(); }
}

seedRandom();
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
globalThis.setTimeout = (fn, ms = 0, ...args) => { timers.set(++timerSeq, { due: now + Math.max(0, Number(ms) || 0), fn: () => fn(...args) }); return timerSeq; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.AudioContext = ContextStub;
globalThis.Audio = AudioElementStub;

// Recorded files and procedural renders, each labelled with its name.
const files = new Map();
const file = (name) => { if (!files.has(name)) files.set(name, makeBuffer(1, 8000, 8000, `file:${name}`)); return files.get(name); };
const bank = Object.create(null);
for (const name of PROCEDURAL_NAMES) { bank[name] = makeBuffer(1, 4000, 8000, `render:${name}`); bank[name].__loopEnd = 0.5; }
const useFiles = (on) => { assets.audioReady = true; assets.sound = on ? file : () => null; };
const useRenders = (on) => { audio.bank = on ? bank : Object.create(null); };

/** Run fn; fail if it throws or the engine swallows an error. Returns the sounds it started. */
function run(label, fn) {
  const from = started.length;
  try { fn(); } catch (e) { throw new Error(`${label} threw: ${e.message}`, { cause: e }); }
  assert.equal(audio.stats.errors, 0, `${label}: the engine swallowed an error`);
  return started.slice(from);
}
const played = (sounds, prefix) => sounds.some((s) => s.buffer?.startsWith(prefix));
const near = () => ({ x: audio.listener.x + 2, y: 1.2, z: audio.listener.z + 1 });
function spotIn(room) {
  for (let x = -60; x <= 60; x += 2) for (let z = -80; z <= 60; z += 2) if (roomIdAt(x, z, 0) === room) return { x, z };
  throw new Error(`no point found in ${room}`);
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
run('init', () => audio.init());
await new Promise((resolve) => setImmediate(resolve));   // renderBank settles: no OfflineAudioContext here
assert.ok(audio.ctx instanceof ContextStub, 'init must build its AudioContext');
assert.deepEqual(Object.keys(audio.zones.convolvers).sort(), [...ZONE_NAMES].sort(), 'init must build a convolver per reverb zone');
assert.ok(audio.pool && audio.ambience && audio.noiseBuf, 'init must build the voice pool, the ambience bed and the noise buffer');
const corridor = spotIn('leftcorridor');
run('updateListener', () => audio.updateListener(corridor.x, 1.6, corridor.z, 0));

// ---------------------------------------------------------------------------
// With no files and no renders, every name with a synth fallback still sounds
// ---------------------------------------------------------------------------
useFiles(false);
useRenders(false);
const fallbacks = Object.getOwnPropertyNames(Object.getPrototypeOf(audio)).filter((n) => n.startsWith('sfx_')).map((n) => n.slice(4));
assert.ok(fallbacks.length >= 80, `expected the synth fallbacks on AudioEngine, found ${fallbacks.length}`);
for (const name of fallbacks) {
  advance(700);
  const sounds = run(`play('${name}') with no files`, () => audio.play(name, { pos: near() }));
  assert.ok(sounds.length > 0, `play('${name}') with no file and no render must reach its synth fallback`);
}

// ---------------------------------------------------------------------------
// Every procedural render plays
// ---------------------------------------------------------------------------
useRenders(true);
for (const name of PROCEDURAL_NAMES) {
  advance(50);
  assert.ok(played(run(`playProcedural('${name}')`, () => audio.playProcedural(name, { pos: near() })), `render:${name}`),
    `playProcedural('${name}') must play its render`);
}

// ---------------------------------------------------------------------------
// Weapons, with every file present
// ---------------------------------------------------------------------------
useFiles(true);
const shots = [...new Set(Object.keys(WEAPONS).flatMap((id) => [getStats(id, false).sfx, getStats(id, true).sfx]))].filter((n) => n?.startsWith('shot_'));
assert.ok(shots.length >= 25, `expected every gun's shot name, found ${shots.length}`);
for (const name of shots) {
  advance(400);
  const layers = audio.stats.layers;
  const sounds = run(`play('${name}')`, () => audio.play(name, { pos: near() }));
  assert.ok(played(sounds, `file:${name}`), `play('${name}') must play its recorded shot`);
  assert.ok(audio.stats.layers - layers >= 3, `play('${name}') must layer the crack, the thump and the tail`);
  assert.equal(played(sounds, 'file:casing_'), CASING_BY_SFX[name].kind !== 'none', `play('${name}') must drop brass only if the weapon throws it`);
}
run('setAmmoState(0, 8)', () => audio.setAmmoState(0, 8));
advance(400);
assert.ok(played(run('the last M1 Garand round', () => audio.play('shot_m1garand')), 'file:rel_ping'), "the M1 Garand's last round must ping");
advance(400);
assert.equal(played(run('the last Thompson round', () => audio.play('shot_thompson')), 'file:rel_ping'), false, 'only the M1 Garand pings on its last round');
run('setAmmoState(null)', () => audio.setAmmoState(null));

advance(3000);
let ring = audio.mix._concussionUntil;
run('a close PTRS-41', () => audio.play('shot_ptrs41'));
assert.ok(audio.mix._concussionUntil > ring, 'a close PTRS-41 must ring the ears');
advance(3000);
ring = audio.mix._concussionUntil;
run('a close Ray Gun', () => audio.play('shot_raygun'));
run('a 2 m splash', () => audio.play('explosion', { pos: near(), blastRadius: 2 }));
assert.equal(audio.mix._concussionUntil, ring, 'the Ray Gun and a 2 m splash must not ring the ears');
advance(300);
const blast = run('a 4 m blast', () => audio.play('explosion', { pos: near(), blastRadius: 4 }));
assert.ok(audio.mix._concussionUntil > ring, 'a 4 m blast must ring the ears');
assert.ok(played(blast, 'file:sub_impact') && played(blast, 'file:explosion_tail'), 'an explosion must add its sub and its tail');
for (const surface of ['concrete', 'metal', 'wood', 'dirt', 'flesh', 'glass']) {
  assert.ok(played(run(`bulletImpact(${surface})`, () => audio.bulletImpact(near(), surface)), `file:impact_${surface}`), `a bullet must hit ${surface}`);
}
assert.ok(played(run('whizBy', () => audio.whizBy(near())), 'file:whizby'), 'a whiz-by must play');
run('concussion()', () => audio.concussion(0.5));

// ---------------------------------------------------------------------------
// Voice budgets
// ---------------------------------------------------------------------------
advance(3000);
const barks = [];
for (let i = 0; i < 4; i++) { advance(20); barks.push(...run(`bark ${i}`, () => audio.play('dog', { pos: near() }))); }
assert.equal(barks.filter((s) => s.buffer?.startsWith('file:dog')).length, 2, 'hellhound barks must share a two-voice budget');
advance(3000);
const groans = [];
for (let i = 0; i < 3; i++) { advance(20); groans.push(...run(`groan ${i}`, () => audio.play('groan', { pos: near() }))); }
assert.equal(groans.filter((s) => s.buffer?.startsWith('file:groan')).length, 2, 'zombie voices must share a two-voice budget');

// ---------------------------------------------------------------------------
// The listener: rooms, zones, footsteps, landings, health
// ---------------------------------------------------------------------------
advance(3000);
run("setListenerRoom('catwalk')", () => audio.setListenerRoom('catwalk'));
assert.deepEqual([audio.zones.current, audio.surface], ['hall', 'metal'], 'the catwalk must sound like the hall, with metal underfoot');
run("setZone('lab')", () => audio.setZone('lab'));
assert.equal(audio.zones.current, 'lab', 'setZone must force a zone');
run('setZone(null)', () => audio.setZone(null));
assert.equal(audio.zones.current, 'hall', 'setZone(null) must hand the zone back to the room');
advance(600);
run('updateListener, once game.js stops naming the room', () => audio.updateListener(corridor.x, 1.6, corridor.z, 0));
assert.deepEqual([audio.zones.current, audio.surface], ['corridor', 'concrete'], 'the position lookup must take over when the room stops being set');
assert.ok(played(run("play('step')", () => audio.play('step')), 'file:step_concrete'), 'a footstep must play the footfall for the floor');

let y = 4.6;
const fall = [];
for (let i = 0; i < 25; i++) {
  advance(16);
  if (i >= 5) y = Math.max(1.6, y - 0.25);
  fall.push(...run('falling', () => audio.updateListener(corridor.x, y, corridor.z, 0)));
}
assert.ok(played(fall, 'file:land_thud'), 'a 3 m fall must land with a thud');

run('two quick hits', () => { audio.play('hurt'); advance(300); audio.play('hurt'); });
assert.ok(audio._heartTimer, 'two quick hits must start the heartbeat');
assert.ok(played(run('the heartbeat', () => advance(2000)), 'render:heartbeat'), 'the heartbeat must beat');
run('recovering', () => { for (let i = 0; i < 80; i++) { advance(150); audio.updateListener(corridor.x, 1.6, corridor.z, 0); } });
assert.equal(audio._heartTimer, null, 'the heartbeat must stop once the hurt heuristic recovers');
run('setIntensity at low health', () => audio.setIntensity({ health: 0.1, threat: 1 }));
assert.ok(audio._heartTimer, 'low health from game.js must start the heartbeat');
run('setIntensity at full health', () => audio.setIntensity({ health: 1, threat: 0 }));
assert.equal(audio._heartTimer, null, 'full health must stop the heartbeat');

// ---------------------------------------------------------------------------
// Rounds, volumes, voice lines, the slide
// ---------------------------------------------------------------------------
run('setRound(5)', () => audio.setRound(5));
assert.deepEqual([audio.round, audio.ambience.round], [5, 5], 'setRound must set the round and the ambience density');
assert.ok(played(run("play('round_start')", () => audio.play('round_start')), 'file:stinger_round_start'), 'a round must start with its stinger');
assert.equal(audio.round, 6, 'round_start must count the round');
run("setVolume('music', 0.3)", () => audio.setVolume('music', 0.3));
assert.equal(audio.bus.music.gain.value, 0.3, 'the music slider must set the music bus');
run('mute', () => { audio.enabled = false; audio.applyVolumes(); });
assert.equal(audio.master.gain.value, 0, 'muting must silence the master bus');
assert.equal(run("play('ui') muted", () => audio.play('ui')).length, 0, 'nothing plays while muted');
run('unmute', () => { audio.enabled = true; audio.applyVolumes(); });
run('a voice line', () => audio.playBuffer(file('vox_line'), 'vox', { bus: 'sfx', vol: 1.8 }));
assert.ok(audio.mix._duckState.music.until > now / 1000, 'a voice line must duck the music');
let slide = null;
run("play('slide')", () => { slide = audio.play('slide'); });
run('fadeOut(slide)', () => audio.fadeOut(slide, 0.14));
assert.ok(slide?.stoppedAt > 0, 'fadeOut must stop the slide');

// ---------------------------------------------------------------------------
// Loops: the menu music, jingles, the music box, the ambience bed, the song
// ---------------------------------------------------------------------------
let menu = null;
assert.ok(played(run('loopFile(menu_music)', () => { menu = audio.loopFile('menu_music', 0.42, 'music', 12.5); }), 'file:menu_music'), 'the menu music must loop');
assert.equal(menu.offset, 0.5, 'the menu music must resume from its offset, wrapped to the track');
run('stop the menu music', () => menu.stop());

run('startJingle with its file', () => audio.startJingle('jug-1', 'jug'));
run('setJingleProximity', () => audio.setJingleProximity('jug-1', 3, 0.4));
useFiles(false);
run('startJingle with no file', () => audio.startJingle('qr-1', 'qr'));
assert.equal(audio._loops.size, 2, 'both jingles must be running');
assert.ok(run('the synth jingle', () => advance(9000)).filter((s) => s.kind === 'oscillator').length >= 8, 'a jingle with no file must play its motif');
run('stopAllJingles', () => audio.stopAllJingles());
assert.equal(audio._loops.size, 0, 'stopAllJingles must stop every jingle');
assert.equal(run('after the jingles stop', () => advance(9000)).filter((s) => s.kind === 'oscillator').length, 0, 'a stopped jingle must not play its motif again');

run('playMusicBox with no file', () => audio.playMusicBox(null));
assert.equal(audio._musicBox?.nodes?.length, 32, 'the music box with no file must play its melody');
run('the melody runs out', () => advance(14500));
assert.equal(audio._musicBox, null, 'the melody must stop itself');
useFiles(true);
run('playMusicBox at the radio', () => audio.playMusicBox({ x: corridor.x + 3, y: 1, z: corridor.z }));
assert.ok(audio._musicBox?.handle, 'the music box must loop its file');
run('updateMusicBoxSpatial', () => audio.updateMusicBoxSpatial());
run('stopMusicBox', () => audio.stopMusicBox());
assert.equal(audio._musicBox, null, 'stopMusicBox must stop the music box');

run('startAmbience', () => audio.startAmbience());
assert.equal(audio.ambience.running, true, 'startAmbience must start the bed');
const bed = run('a minute of ambience', () => { for (let i = 0; i < 60; i++) { advance(1000); audio.updateListener(corridor.x, 1.6, corridor.z, 0); } });
assert.ok(played(bed, 'file:amb_'), 'the ambience bed must play its one-shots');
run('stopAmbience', () => audio.stopAmbience());
assert.deepEqual([audio.ambience.running, audio.ambience.timers.length], [false, 0], 'stopAmbience must stop the bed and its timers');

run('playSong at the gramophone', () => audio.playSong({ x: corridor.x + 4, y: 1, z: corridor.z }));
assert.equal(audio.songPlaying, true, 'the song must be playing');
run('updateSongSpatial', () => audio.updateSongSpatial());
run('the track ends', () => elements.at(-1).emit('ended'));
assert.equal(audio.songPlaying, false, 'the song must stop when its track ends');

// ---------------------------------------------------------------------------
// debugState and dispose
// ---------------------------------------------------------------------------
let state = null;
run('debugState', () => { state = audio.debugState(); });
assert.equal(state.zone, 'corridor', 'debugState must report the zone');
assert.ok(state.pool.created > 0, 'debugState must report the voice pool');
run('everything running', () => { audio.startJingle('jug-2', 'jug'); audio.startAmbience(); audio.playMusicBox(null); audio.play('shot_mp40', { pos: near() }); });
run('dispose', () => audio.dispose());
assert.deepEqual([audio.pool.activeCount, audio._loops.size, audio.ambience.running, audio._musicBox], [0, 0, false, null],
  'dispose must release every voice and stop every loop');
assert.equal(audio.stats.errors, 0, 'the engine must finish without a swallowed error');

console.log(`Audio engine OK: ${fallbacks.length} synth fallbacks, ${PROCEDURAL_NAMES.length} renders and ${shots.length} shots played; `
  + `${audio.stats.plays} voices, ${audio.stats.layers} shot layers, ${started.length} sounds started, 0 swallowed errors; `
  + 'rooms, zones, footsteps, landings, health, voice budgets, loops, jingles, music box, ambience, song and dispose all checked.');
