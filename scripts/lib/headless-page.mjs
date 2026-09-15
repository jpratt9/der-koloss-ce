// A fake page for js/main.js, in Node.
//
// js/main.js boots the page as it loads: it looks up the menu's elements,
// wires every control and starts the menu music. headless-three.mjs only
// stubs the canvas the material library draws on, so this stands in for the
// rest of the browser the page script touches:
// - Every element index.html gives an id, with its classes. It records what the
//   code writes to it and keeps its listeners, so a test can fire them. An id
//   index.html doesn't have looks up as null, as it does in the browser.
// - window's and document's listeners, fullscreen, pointer lock, location, the
//   clipboard, localStorage and sessionStorage.
// - A clock. performance.now, setTimeout and setInterval move only when the
//   test advances it.
// - Recording fakes, through a resolve hook, for the modules the page script
//   drives: audio.js, assets.js, net.js, game.js, hud.js, input.js,
//   site-audio.js, and drawPortrait from personas.js. The fake initInput adds
//   the capture-phase Tab listener the real one does, which stops Tab from
//   reaching any listener added after it. config.js, weapons.js,
//   multiplayer-contracts.js and js/main/ are the real modules.
//
// Everything written, called and scheduled goes into one log. js/main.js boots
// once, as it loads, so each page needs its own Node process.
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from './headless-three.mjs';

const LABEL = Symbol('label');
const lines = [];
const log = (line) => { lines.push(line); };
const flags = {};
const missingSounds = new Set();
const nets = [];
const games = [];

export function fmt(v, depth = 0) {
  if (v === undefined || v === null || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return '[fn]';
  if (v[LABEL]) return `<${v[LABEL]}>`;
  if (v instanceof Error) return `Error(${JSON.stringify(v.message)})`;
  if (depth > 5) return '[deep]';
  if (Array.isArray(v)) return `[${v.map((x) => fmt(x, depth + 1)).join(', ')}]`;
  if (v instanceof Set || v instanceof Map) return `${v.constructor.name}(${[...v].map((x) => fmt(x, depth + 1)).join(', ')})`;
  if (v.constructor && v.constructor !== Object) return `[${v.constructor.name}]`;
  return `{${Object.keys(v).map((k) => `${k}: ${fmt(v[k], depth + 1)}`).join(', ')}}`;
}

/** Run fn as the page would run a listener: log what it throws or rejects with, and carry on. */
function call(fn, where) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') r.then(null, (e) => log(`REJECTED in ${where}: ${e?.message ?? e}`));
  } catch (e) {
    log(`THROWN in ${where}: ${e?.message ?? e}`);
  }
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
const clock = { now: 0 };
const timers = new Map();
let timerSeq = 0;
const addTimer = (repeat, fn, ms, args) => {
  const d = Math.max(0, Number(ms) || 0);
  timers.set(++timerSeq, { repeat, fn, d, at: clock.now + d, args });
  return timerSeq;
};
export async function flush() { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); }
async function advance(ms) {
  const end = clock.now + ms;
  for (;;) {
    let next = null;
    for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
    if (!next) break;
    const [id, t] = next;
    clock.now = t.at;
    if (t.repeat) t.at += Math.max(1, t.d); else timers.delete(id);
    call(() => t.fn(...t.args), `timer #${id}`);
    await flush();
  }
  clock.now = end;
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
const ids = new Map();
for (const m of readFileSync(join(repoRoot, 'index.html'), 'utf8').matchAll(/<([a-zA-Z][\w-]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)) {
  const classes = /\bclass="([^"]*)"/.exec(`${m[2]} ${m[4]}`)?.[1].split(/\s+/).filter(Boolean) ?? [];
  if (!ids.has(m[3])) ids.set(m[3], { tag: m[1], classes });
}

function makeEl(label, tag, classes = []) {
  const t = { [LABEL]: label, tagName: tag.toUpperCase(), dataset: {}, children: [], listeners: [] };
  const cls = new Set(classes);
  t.classList = {
    add: (...c) => { log(`${label}.classList.add(${c.map(fmt).join(', ')})`); c.forEach((x) => cls.add(x)); },
    remove: (...c) => { log(`${label}.classList.remove(${c.map(fmt).join(', ')})`); c.forEach((x) => cls.delete(x)); },
    toggle: (c, force) => {
      const on = force === undefined ? !cls.has(c) : !!force;
      if (on) cls.add(c); else cls.delete(c);
      log(`${label}.classList.toggle(${fmt(c)}) -> ${on}`);
      return on;
    },
    contains: (c) => cls.has(c),
  };
  t.style = new Proxy({}, { set(o, k, v) { log(`${label}.style.${String(k)} = ${fmt(v)}`); o[k] = v; return true; } });
  t.setAttribute = (k, v) => log(`${label}.setAttribute(${fmt(k)}, ${fmt(v)})`);
  t.addEventListener = (type, fn) => { t.listeners.push({ type, fn }); };
  t.append = (...nodes) => { t.children.push(...nodes); };
  t.appendChild = (node) => { t.children.push(node); return node; };
  t.focus = () => log(`${label}.focus()`);
  t.select = () => log(`${label}.select()`);
  t.closest = (sel) => (cls.has(sel.slice(1)) ? el : null);
  t.querySelector = (sel) => t.parts?.[sel] ?? null;
  const el = new Proxy(t, {
    set(o, k, v) {
      if (k === 'innerHTML') o.children = [];
      log(`${label}.${String(k)} = ${fmt(v)}`);
      o[k] = v;
      return true;
    },
  });
  return el;
}

const byId = new Map();
const getElementById = (id) => {
  if (!byId.has(id)) byId.set(id, ids.has(id) ? makeEl(`#${id}`, ids.get(id).tag, ids.get(id).classes) : null);
  return byId.get(id);
};
const pickers = ['p1', 'p2'].map((slot) => {
  const wrap = makeEl(`wpn-pick ${slot}`, 'div', ['wpn-pick']);
  wrap.dataset.slot = slot;
  wrap.parts = { '.wpn-list': makeEl(`wpn-list ${slot}`, 'div'), '.wpn-search': makeEl(`wpn-search ${slot}`, 'input') };
  wrap.parts['.wpn-search'].value = '';
  return wrap;
});
const menuLinks = ['/assets', '/about/'].map((href) => Object.assign(makeEl(`menu-link ${href}`, 'a', ['menu-link']), { href }));
const speakers = new Map();
function querySelectorAll(sel) {
  if (sel === '.wpn-pick') return pickers;
  if (sel === '.menu-link') return menuLinks;
  if (sel === '.lobby-spk[data-pid]') {
    return [...(byId.get('lobby-players')?.innerHTML ?? '').matchAll(/class="lobby-spk" data-pid="([^"]*)"/g)].map(([, pid]) => {
      if (!speakers.has(pid)) speakers.set(pid, Object.assign(makeEl(`lobby-spk ${pid}`, 'span', ['lobby-spk']), { dataset: { pid } }));
      return speakers.get(pid);
    });
  }
  throw new Error(`the fake page has no elements for ${sel}`);
}

// ---------------------------------------------------------------------------
// Window, document and storage
// ---------------------------------------------------------------------------
const windowListeners = [];
const documentListeners = [];
let fullscreen = null;

function dispatchWindow(type, props = {}) {
  let stopped = false;
  const event = { type, button: 0, repeat: false, ...props, preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
  const listeners = windowListeners.filter((l) => l.type === type);
  for (const l of [...listeners.filter((x) => x.capture), ...listeners.filter((x) => !x.capture)]) {
    if (stopped) break;
    if (l.once) windowListeners.splice(windowListeners.indexOf(l), 1);
    call(() => l.fn(event), `window ${type}`);
  }
}
function dispatchDocument(type) {
  for (const l of documentListeners.filter((x) => x.type === type)) call(() => l.fn({ type, button: 0 }), `document ${type}`);
}
function fire(target, type, props = {}) {
  const el = typeof target === 'string' ? getElementById(target) : target;
  if (!el) throw new Error(`no element to fire ${type} on: ${target}`);
  const event = { type, target: el, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...props, preventDefault() {} };
  for (const l of el.listeners.filter((x) => x.type === type)) call(() => l.fn(event), `${fmt(el)} ${type}`);
}
function makeStorage(name, entries) {
  const m = new Map(Object.entries(entries));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { log(`${name}.setItem(${fmt(k)}, ${fmt(String(v))})`); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    peek: (k) => (m.has(k) ? m.get(k) : null),
  };
}
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

// ---------------------------------------------------------------------------
// Fakes for the modules the page script drives
// ---------------------------------------------------------------------------
const input = { keys: Object.create(null), pressed: Object.create(null), locked: false, enabled: false, onKey: null };
const fakes = {
  audio: new (class FakeAudio {
    init() { log('audio.init()'); this.ctx ??= { get currentTime() { return clock.now / 1000; } }; }
    setVolume(kind, v) { log(`audio.setVolume(${fmt(kind)}, ${fmt(v)})`); }
    play(name, opts) { log(`audio.play(${fmt(name)})`); }
    playBuffer(buffer, name, opts) { log(`audio.playBuffer(${fmt(name)})`); }
    loopFile(name, vol, bus, offset) {
      log(`audio.loopFile(${fmt(name)}, ${fmt(offset)})`);
      return { startedAt: this.ctx.currentTime, offset: offset ?? 0, duration: 90, stop: () => log(`${name}.stop()`) };
    }
  })(),
  assets: new (class FakeAssets {
    ready = false;
    audioReady = false;
    async load(onProgress) { log('assets.load()'); await fakes.assetsLoaded; onProgress(1); this.ready = true; }
    async loadAudio() { log('assets.loadAudio()'); await null; this.audioReady = true; }
    sound(name) { return missingSounds.has(name) ? null : { duration: 90 }; }
  })(),
  Net: class Net {
    code = null; myId = null; isHost = false; lobbyPlayers = []; lobbyCheats = {}; lobbyVoiceEnabled = false;
    myStream = null; voiceFailed = false; micMuted = false; mySpeaking = false; mutedPeers = new Set(); voiceStreams = new Map();
    onLobby = null; onStart = null; onClosed = null;
    constructor() { log('new Net()'); nets.push(this); }
    async host(name) {
      log(`net.host(${fmt(name)})`); await null;
      if (flags.failHost) throw new Error('Could not reach the lobby server.');
      Object.assign(this, { isHost: true, code: 'HST42', myId: 'h', lobbyPlayers: [{ id: 'h', name, color: 0, host: true, ready: false }] });
    }
    async join(code, name) {
      log(`net.join(${fmt(code)}, ${fmt(name)})`); await null;
      if (flags.failJoin) throw new Error('Lobby not found.');
      Object.assign(this, { code, myId: 'g', lobbyPlayers: [{ id: 'h', name: 'Host', color: 0, host: true, ready: false }, { id: 'g', name, color: 1, ready: false }] });
    }
    majorityReady() { const n = this.lobbyPlayers.length; return n > 0 && this.lobbyPlayers.filter((p) => p.ready).length >= Math.floor(n / 2) + 1; }
    setLobbyVoiceEnabled(on) { log(`net.setLobbyVoiceEnabled(${fmt(on)})`); this.lobbyVoiceEnabled = !!on; return this.lobbyVoiceEnabled; }
    async enableVoice() { log('net.enableVoice()'); await null; if (flags.voiceDenied) this.voiceFailed = true; else this.myStream = {}; }
    setMicMuted(m) { log(`net.setMicMuted(${fmt(m)})`); this.micMuted = m; }
    mutePeer(id, m) { log(`net.mutePeer(${fmt(id)}, ${fmt(m)})`); if (m) this.mutedPeers.add(id); else this.mutedPeers.delete(id); }
  },
  Game: class Game {
    paused = false; over = false; micMuted = false; player = { adsT: 0 };
    camera = { updateProjectionMatrix() {}, set fov(v) { log(`camera.fov = ${fmt(v)}`); } };
    constructor(opts) { log(`new Game(${fmt({ ...opts, options: undefined, hud: undefined, onExit: undefined })})`); this.opts = opts; this.mode = opts.mode; games.push(this); }
    init(canvas) { log(`game.init(${fmt(canvas)})`); if (flags.failInit) throw new Error('WebGL is unavailable'); }
    setPaused(p) { log(`game.setPaused(${fmt(p)})`); this.paused = p; }
    setMicMuted(m) { log(`game.setMicMuted(${fmt(m)})`); this.micMuted = m; }
    endMatchToLobby() { log('game.endMatchToLobby()'); return !!flags.endMatch; }
  },
  HUD: class HUD {
    show() { log('hud.show()'); }
    hide() { log('hud.hide()'); }
    showFps(on) { log(`hud.showFps(${fmt(on)})`); }
  },
  input,
  initInput(canvas) {
    log(`initInput(${fmt(canvas)})`);
    addEventListener('keydown', (e) => { if (e.code === 'Tab') { input.keys.Tab = true; e.stopImmediatePropagation(); } }, { capture: true });
    addEventListener('keydown', (e) => { input.keys[e.code] = true; input.onKey?.(e.code, e); });
  },
  lockPointer(canvas) { log(`lockPointer(${fmt(canvas)})`); input.locked = true; },
  unlockPointer() { log('unlockPointer()'); input.locked = false; },
  clearPressed() { log('clearPressed()'); },
  resetInputState() { log('resetInputState()'); },
  getMenuMusicOffset: () => 12.5,
  keepMenuMusicClock(position) { log(`keepMenuMusicClock(${fmt(position)})`); },
  drawPortrait(canvas, id) { log(`drawPortrait(${fmt(id)})`); },
};
// Methods the page calls that only need recording.
for (const name of ['setLobbyCheats', 'setPersona', 'setName', 'setReady', 'resetLobbyReady', 'startGame', 'disableVoice', 'setVoiceVolume', 'updateVoiceSpeaking', 'leave']) {
  fakes.Net.prototype[name] = function (...args) { log(`net.${name}(${args.map(fmt).join(', ')})`); };
}
for (const name of ['applyQuality', 'dispose']) fakes.Game.prototype[name] = () => log(`game.${name}()`);
const FAKED = {
  'audio.js': ['audio'], 'assets.js': ['assets'], 'net.js': ['Net'], 'game.js': ['Game'], 'hud.js': ['HUD'],
  'input.js': ['input', 'initInput', 'lockPointer', 'unlockPointer', 'clearPressed', 'resetInputState'],
  'site-audio.js': ['getMenuMusicOffset', 'keepMenuMusicClock'], 'personas.js': ['drawPortrait'],
};

/**
 * Put the fake page in place and boot js/main.js on it. `search` is the URL's
 * query, `storage` localStorage's entries, and `missing` the sounds assets.js
 * has no file for. Assets finish loading when the test calls loadAssets().
 */
export async function startPage({ search = '', storage = {}, missing = [] } = {}) {
  missing.forEach((name) => missingSounds.add(name));
  fakes.assetsLoaded = new Promise((resolve) => { fakes.loadAssets = resolve; });
  globalThis.__pageFakes = fakes;
  const personas = pathToFileURL(join(repoRoot, 'js', 'personas.js')).href;
  const modules = Object.fromEntries(Object.entries(FAKED).map(([file, names]) => [
    pathToFileURL(join(repoRoot, 'js', file)).pathname,
    `data:text/javascript,${encodeURIComponent(`${file === 'personas.js' ? `export * from '${personas}?real';\n` : ''}${names.map((n) => `export const ${n} = globalThis.__pageFakes.${n};`).join('\n')}`)}`,
  ]));
  register(`data:text/javascript,${encodeURIComponent(`
    let modules;
    export function initialize(data) { modules = data; }
    export async function resolve(spec, ctx, next) {
      const r = await next(spec, ctx);
      if (!r.url.startsWith('file:') || r.url.endsWith('?real')) return r;
      const fake = modules[new URL(r.url).pathname];
      return fake ? { url: fake, shortCircuit: true } : r;
    }`)}`, { data: modules });

  const headless = globalThis.document;
  define('document', {
    getElementById, querySelectorAll, querySelector: () => null,
    createElement: (tag) => (tag === 'canvas' && !byId.has('game-canvas') ? headless.createElement(tag) : makeEl(`new ${tag}`, tag)),
    createElementNS: headless.createElementNS, body: headless.body,
    documentElement: { async requestFullscreen() { fullscreen = this; await null; dispatchDocument('fullscreenchange'); } },
    async exitFullscreen() { fullscreen = null; await null; dispatchDocument('fullscreenchange'); },
    get fullscreenElement() { return fullscreen; },
    get pointerLockElement() { return input.locked ? getElementById('game-canvas') : null; },
    addEventListener: (type, fn) => { documentListeners.push({ type, fn }); },
  });
  define('addEventListener', (type, fn, opts) => { windowListeners.push({ type, fn, capture: opts === true || !!opts?.capture, once: !!opts?.once }); });
  define('location', { hostname: 'localhost', search, set href(v) { log(`location.href = ${fmt(v)}`); } });
  define('navigator', { clipboard: { async writeText(text) { log(`clipboard.writeText(${fmt(text)})`); if (flags.clipboardFails) throw new Error('denied'); } } });
  const local = makeStorage('localStorage', storage);
  define('localStorage', local);
  define('sessionStorage', makeStorage('sessionStorage', {}));
  define('performance', { now: () => clock.now });
  define('requestAnimationFrame', () => 1);
  define('matchMedia', () => ({ matches: false, addEventListener() {} }));
  define('setTimeout', (fn, ms, ...args) => addTimer(false, fn, ms, args));
  define('clearTimeout', (id) => { timers.delete(id); });
  define('setInterval', (fn, ms, ...args) => addTimer(true, fn, ms, args));
  define('clearInterval', (id) => { timers.delete(id); });
  let seed = 7;
  Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  console.error = (...args) => log(`console.error(${args.map(fmt).join(', ')})`);
  process.on('unhandledRejection', (e) => log(`UNHANDLED: ${e?.message ?? e}`));

  await import(pathToFileURL(join(repoRoot, 'js', 'main.js')).href);
  await flush();

  let actions = 0;
  const page = {
    lines, flags, nets, games, input, fmt,
    /** Run one step of a scenario and return the log lines it wrote. */
    async act(fn) {
      const from = lines.length;
      actions++;
      await fn();
      await flush();
      return lines.slice(from);
    },
    get actions() { return actions; },
    loadAssets: () => fakes.loadAssets(),
    advance, flush, fire,
    click: (target, props) => fire(target, 'click', props),
    type(target, value, event = 'input') { const el = typeof target === 'string' ? getElementById(target) : target; el.value = value; fire(el, event); },
    tick(target, checked) { const el = getElementById(target); el.checked = checked; fire(el, 'change'); },
    key: (code) => dispatchWindow('keydown', { code, key: code }),
    mouseDown: () => dispatchWindow('mousedown'),
    documentEvent: dispatchDocument,
    el: getElementById,
    shown: (id) => !getElementById(id).classList.contains('hidden'),
    text: (id) => getElementById(id).textContent,
    stored: (key) => local.peek(key),
    children: (id) => getElementById(id).children,
    weaponList: (i) => pickers[i].parts['.wpn-list'],
    weapons: (i) => pickers[i].parts['.wpn-list'].children.filter((c) => String(c.className).startsWith('wpn-item')),
    search: (i) => pickers[i].parts['.wpn-search'],
    menuLinks,
    muteButton: (pid) => Object.assign(makeEl(`mute ${pid}`, 'button', ['lobby-mute']), { dataset: { pid } }),
    speaker: (pid) => speakers.get(pid),
    net: () => nets.at(-1),
    game: () => games.at(-1),
    lobby(players, extra = {}) { const net = nets.at(-1); Object.assign(net, extra); if (players) net.lobbyPlayers = players; net.onLobby?.(); },
    errors: () => lines.filter((l) => /^(THROWN|REJECTED|UNHANDLED)/.test(l)),
  };
  return page;
}
