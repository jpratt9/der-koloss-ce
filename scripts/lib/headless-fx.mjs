// Run the real FX in Node: no browser, no renderer, no timers of its own.
//
// js/fx.js is the one part of the effect system nothing else can exercise — it
// draws into particle pools and sprite rings rather than returning anything, so
// a check on it has to watch what it did. Everything it reaches outside itself
// is replaced with something that records:
//
//   - Math.random is a seeded mulberry32, so every rand() in js/fx/ is fixed;
//   - the three ParticlePools record every emit, update, clear and rescale;
//   - document.getElementById returns elements that record each style write
//     (headless-three.mjs's document has none, so the DOM refs read null);
//   - setTimeout/clearTimeout are a hand-advanced clock: nothing fires until
//     fireTimers() is called, and a cleared timer never fires;
//   - audio.play records instead of reaching the audio engine.
//
// Everything records on itself, so a check asserts values rather than reading
// logs. Used by scripts/test-fx-effects.mjs.
import { loadGameModule, repoRoot } from './headless-three.mjs';

/** Deterministic PRNG, so a check can pin what a rand()-driven effect produced. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * A real FX, built on a real THREE.Scene, with everything it reaches outside
 * itself recording. Seeding happens after the module graph is loaded, so import
 * order can never shift the random sequence a check pins.
 */
export async function startFxHarness({ seed = 0x5eed } = {}) {
  const THREE = await import('three');
  const { FX, BLOOD_DECAL_COLOR } = await loadGameModule('fx.js');
  const { audio } = await loadGameModule('audio.js');

  // ---------- recording DOM ----------
  const domWrites = [];
  const element = (id) => ({
    id,
    style: new Proxy({}, { set(t, k, v) { domWrites.push({ id, prop: String(k), value: v }); t[k] = v; return true; } }),
  });
  const elements = { 'dmg-vignette': element('dmg-vignette'), 'screen-flash': element('screen-flash') };
  globalThis.document.getElementById = (id) => elements[id] ?? null;

  // ---------- hand-advanced clock ----------
  const timers = [];
  let nextTimer = 0;
  const cleared = [];
  globalThis.setTimeout = (fn, ms) => { const id = ++nextTimer; timers.push({ id, fn, ms }); return id; };
  globalThis.clearTimeout = (id) => {
    cleared.push(id ?? null);
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };

  // ---------- seeded randomness ----------
  const rng = mulberry32(seed);
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return rng(); };

  const scene = new THREE.Scene();
  const fx = new FX(scene);

  // ---------- recording pools ----------
  const calls = [];
  for (const [pool, name] of [[fx.smoke, 'smoke'], [fx.sparks, 'sparks'], [fx.gore, 'gore']]) {
    for (const method of ['emit', 'update', 'clear', 'setViewportScale']) {
      const inner = pool[method].bind(pool);
      pool[method] = (...args) => { calls.push({ pool: name, method, args }); return inner(...args); };
    }
  }

  // ---------- recording audio ----------
  const audioCalls = [];
  audio.play = (id, opts) => { audioCalls.push({ id, opts }); };

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.075, 500);
  camera.position.set(0, 1.7, 5);

  return {
    THREE, fx, scene, camera, BLOOD_DECAL_COLOR, repoRoot,
    /** Every recorded pool call since the last take(), oldest first. */
    take: () => calls.splice(0, calls.length),
    /** Only the emits since the last take(), as { pool, ...particle }. */
    takeEmits: () => calls.splice(0, calls.length).filter((c) => c.method === 'emit').map((c) => ({ pool: c.pool, ...c.args[0] })),
    /** Style writes since the last takeDom(). */
    takeDom: () => domWrites.splice(0, domWrites.length),
    /** audio.play calls since the last takeAudio(). */
    takeAudio: () => audioCalls.splice(0, audioCalls.length),
    /** Timer ids passed to clearTimeout since the last takeCleared(). */
    takeCleared: () => cleared.splice(0, cleared.length),
    /** Timers still waiting to fire. */
    pending: () => timers.map((t) => ({ id: t.id, ms: t.ms })),
    /** Fire every waiting timer, oldest first. */
    fireTimers: () => { for (const t of timers.splice(0, timers.length)) t.fn(); },
    /** Run n frames of dt seconds, starting the clock at `time`. */
    frames: (n, dt = 1 / 60, time = 0) => { for (let i = 0; i < n; i++) fx.update(dt, camera, time + i * dt); },
    randomCalls: () => randomCalls,
  };
}
