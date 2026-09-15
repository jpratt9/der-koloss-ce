// A fake PeerJS, clock, microphone and analyser for js/net.js, in Node.
//
// net.js was the one module in js/ that nothing could run outside a browser: it
// needs the PeerJS global, two data channels per peer, media calls,
// getUserMedia, an <audio> element per remote voice and an analyser for each.
// None of that exists in Node, and a test must never reach the real signalling
// server, so this stands in for all of it. Nothing here talks to the network.
//
// Everything is recorded on the fakes themselves — conn.sent, peer.calls,
// call.answered, element.volume, track.enabled — so a test asserts on values
// rather than on a log. Time only moves when the test calls advance().
import { loadGameModule } from './headless-three.mjs';

const REAL_SET_IMMEDIATE = setImmediate;
/** Let every pending promise settle. The engine's async work is all microtasks. */
export const flush = async () => { for (let k = 0; k < 12; k++) await new Promise((r) => REAL_SET_IMMEDIATE(r)); };

/** Load js/net.js with the browser it needs faked out. Returns Net and the fakes. */
export async function startNetHarness({ savedClientId = null } = {}) {
  // ---------------- a clock the test moves by hand ----------------
  let now = 1000;
  let timerSeq = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, ms) => {
    const id = ++timerSeq;
    timers.set(id, { fn, at: now + Math.max(0, Number(ms) || 0), every: 0 });
    return id;
  };
  globalThis.setInterval = (fn, ms) => {
    const id = ++timerSeq;
    const every = Math.max(1, Number(ms) || 1);
    timers.set(id, { fn, at: now + every, every });
    return id;
  };
  globalThis.clearTimeout = (id) => { timers.delete(id); };
  globalThis.clearInterval = globalThis.clearTimeout;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
  Date.now = () => 1_700_000_000_000 + now;
  /** Run every timer due in the next `ms`, oldest first, then settle promises. */
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) {
        if (t.at <= target && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
      }
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.every) timer.at += timer.every; else timers.delete(id);
      timer.fn();
      await flush();
    }
    now = target;
    await flush();
  }

  // ---------------- lobby codes, the client id ----------------
  let seed = 0x13579bdf;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const store = new Map(savedClientId ? [['der-koloss-client-id', savedClientId]] : []);
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  });
  let uuidSeq = 0;
  define('crypto', { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, '0')}` });

  // ---------------- the microphone ----------------
  let streamSeq = 0;
  const makeStream = () => {
    const tracks = [{ kind: 'audio', enabled: true, contentHint: '', stopped: false, stop() { this.stopped = true; } }];
    return { id: `stream-${++streamSeq}`, tracks, getTracks: () => [...tracks], getAudioTracks: () => [...tracks] };
  };
  const mic = { mode: 'grant', asked: 0, pending: [] };
  define('navigator', {
    userAgent: 'node',
    mediaDevices: {
      getUserMedia() {
        mic.asked++;
        if (mic.mode === 'deny') return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
        if (mic.mode === 'wait') return new Promise((resolve, reject) => mic.pending.push({ resolve, reject }));
        return Promise.resolve(makeStream());
      },
    },
  });

  // ---------------- <audio> elements and analysers ----------------
  const elements = [];
  const baseCreateElement = document.createElement;
  document.createElement = (tag) => {
    if (tag !== 'audio') return baseCreateElement(tag);
    const el = { tag, volume: 1, muted: false, srcObject: null, attached: false, removed: false, remove() { this.removed = true; } };
    elements.push(el);
    return el;
  };
  document.body = { appendChild: (node) => { node.attached = true; } };

  const analysers = [];
  const { audio } = await loadGameModule('audio.js');
  audio.init = () => {};
  audio.ctx = {
    createMediaStreamSource: (stream) => ({ stream, connect(node) { node.source = stream; } }),
    createAnalyser() {
      // `loudness` is the peak the engine measures: it treats over 14 as speech.
      const a = { fftSize: 0, frequencyBinCount: 64, loudness: 0, source: null };
      a.getByteTimeDomainData = (buffer) => { for (let k = 0; k < buffer.length; k++) buffer[k] = 128 + (k % 2 ? a.loudness : -a.loudness); };
      analysers.push(a);
      return a;
    },
  };

  // ---------------- PeerJS ----------------
  const emitter = (obj) => {
    const handlers = new Map();
    obj.on = (event, fn) => { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event).push(fn); };
    obj.emit = (event, ...args) => { for (const fn of [...(handlers.get(event) || [])]) fn(...args); };
    return obj;
  };
  const peers = [];
  /** A data channel. `sent` is everything the code sent on it. */
  const makeConn = (remoteId, metadata, reliable) => emitter({
    peer: remoteId, metadata, reliable, open: false, sent: [], closed: false,
    send(msg) { this.sent.push(msg); },
    close() { this.closed = true; const was = this.open; this.open = false; if (was && this.closeFiresSync) this.emit('close'); },
  });
  /** A media call, as PeerJS hands one over. */
  const makeCall = (remoteId) => emitter({ peer: remoteId, answered: [], closed: false, answer(stream) { this.answered.push(stream ?? null); }, close() { this.closed = true; } });
  class FakePeer {
    constructor(id, options) {
      if (id && typeof id === 'object') { options = id; id = undefined; }
      emitter(this);
      this.requestedId = id ?? null;
      this.options = options;
      this.id = undefined;
      this.destroyed = false;
      this.calls = [];
      peers.push(this);
    }
    connect(id, options) { const conn = makeConn(id, options?.metadata, options?.reliable); this.connects = [...(this.connects || []), conn]; return conn; }
    call(id, stream) { const call = makeCall(id); this.calls.push({ id, stream, call }); return call; }
    destroy() { this.destroyed = true; }
  }
  define('Peer', FakePeer);

  const { Net } = await loadGameModule('net.js');
  return {
    Net,
    advance,
    flush,
    mic,
    elements,
    analysers,
    peers,
    makeCall,
    now: () => now,
    lastPeer: () => peers[peers.length - 1],
    /** Open a peer, as the signalling server does, with the id it asked for. */
    openPeer(peer, id = peer.requestedId) { peer.id = id; peer.emit('open', id); },
    /** A guest opening one channel to the host. */
    connectTo(peer, { id, ch = 'r', clientId = undefined, closeFiresSync = false }) {
      const conn = makeConn(id, clientId === undefined ? { ch } : { ch, clientId }, ch === 'r');
      conn.closeFiresSync = closeFiresSync;
      peer.emit('connection', conn);
      conn.open = true;
      conn.emit('open');
      return conn;
    },
    /** The last message sent on a channel. */
    lastSent: (conn) => conn.sent[conn.sent.length - 1],
    /** Host a lobby and let its peer open. Resolves to the lobby code. */
    async host(net, name) {
      const hosting = net.host(name);
      this.openPeer(this.lastPeer());
      await flush();
      return hosting;
    },
    /** Join a lobby and let the peer and the reliable channel open. Resolves when the host has the hello. */
    async join(net, code, name, { id = 'guest-self' } = {}) {
      const joining = net.join(code, name);
      const peer = this.lastPeer();
      this.openPeer(peer, id);
      await flush();
      net.hostConn.u.open = true;
      net.hostConn.r.open = true;
      net.hostConn.r.emit('open');
      await flush();
      await joining;
      return peer;
    },
  };
}
