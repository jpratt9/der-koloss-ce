// Networking: PeerJS/WebRTC host-authoritative model.
// Host runs the lobby + zombie simulation; clients send inputs & hit claims.
// Two data channels per peer: reliable (events) + unreliable/unordered (snapshots).
// Also owns voice chat end-to-end (streams, analysers, mute state) so both the
// lobby UI and the in-game HUD can read speaking state.
import { genCode, installMixins } from './utils.js';
import {
  availableLobbyColor,
  isValidNetworkPayload,
  peerConnectionIsCurrent,
  removeLobbyPeer,
  sanitizePerkAnimation,
  stableClientReplacement,
  stalePeerIds,
} from './multiplayer-contracts.js';
import { PREFIX, MAX_PLAYERS, cleanName, cleanPersona, cleanClientId, clientIdentity } from './net/identity.js';
import { NetJoin } from './net/join.js';
import { NetLobby } from './net/lobby.js';
import { NetVoice } from './net/voice.js';

const PEER_TIMEOUT_MS = 20000;
const PEER_SWEEP_INTERVAL_MS = 5000;
const CLIENT_EVENTS = new Set([
  'bark', 'barrier_req', 'box_spin_req', 'box_take', 'dead', 'door_req', 'down',
  'drop_take', 'grenade', 'hello', 'monkey', 'name', 'pap_req', 'pap_take',
  'pause', 'perk', 'perk_anim', 'persona', 'power_req', 'radio_req', 'ready', 'respawn',
  'revive_req', 'revive_self', 'revive_start', 'revive_stop', 'shoot', 'song_req', 'swap', 'tele_req',
  'trap_req', 'zhit', 'zsplash', 'heartbeat', 'leave',
]);
const HOST_ONLY_EVENTS = new Set([
  'barrier', 'boardpoints', 'box_move', 'box_state', 'door', 'drop', 'gameover',
  'hitcredit', 'killcredit', 'monkey_end', 'pap_door', 'pap_ready', 'pap_reject', 'pap_start', 'pdmg',
  'power', 'radio', 'revive_done', 'round', 'intermission', 'song', 'tele', 'tele_link',
  'trap_off', 'trap_on', 'return_lobby', 'zkill',
]);
const EVENT_MIN_MS = {
  hello: 60000, name: 250, persona: 250, ready: 250,
  barrier_req: 250, box_spin_req: 500, box_take: 500, door_req: 500,
  grenade: 500, pap_req: 500, pap_take: 500, power_req: 1000,
  perk_anim: 1500,
  radio_req: 500, revive_req: 500, song_req: 500, tele_req: 1000,
  // revive_start/stop are edge-triggered, but an input that flickers on the
  // F key would emit a pair per frame without a floor under them.
  revive_start: 250, revive_stop: 250, revive_self: 500,
  // A single shotgun/penetrating shot legitimately emits several zhit claims
  // in the same task. The global reliable-packet cap and host claim budgets
  // provide the abuse bound; spacing zhit packets discarded valid pellets.
  trap_req: 500, shoot: 25, zhit: 0, zsplash: 100,
};

// Cosmetic shot relay budget. 55 ms is ~18 flashes a second per shooter, which
// still reads as continuous automatic fire but keeps three guests firing an
// FG42 well inside the reliable-channel cap.
const SHOT_RELAY_MIN_MS = 55;

export class Net {
  constructor() {
    this.mode = null; // 'host' | 'client'
    this.peer = null;
    this.code = null;
    this.peers = new Map(); // id -> { r: conn, u: conn, name, ready, color, openR, openU }
    this._clientPeers = new Map(); // stable browser client id -> current PeerJS transport id
    this._clientId = clientIdentity();
    this.isHost = false;
    this.matchActive = false;
    // callbacks (assigned by consumer)
    this.onLobby = null;
    this.onStart = null;
    this.onEvent = null;      // reliable gameplay event (msg, fromId)
    this.onSnap = null;       // unreliable snapshot (client side)
    this.onPlayerState = null;// unreliable player state (host side)
    this.onPeerLeave = null;
    this.onClosed = null;
    this.lobbyPlayers = [];
    this.lobbyCheats = {};
    // Host-owned room policy. Starting false prevents a guest microphone
    // permission prompt before its first authenticated lobby snapshot.
    this.lobbyVoiceEnabled = false;
    // voice chat state
    this.myStream = null;
    this.voiceFailed = false;
    this.micMuted = false;
    this.voiceStreams = new Map(); // peerId -> { el, analyser, data, speaking }
    this._mediaConnections = new Map(); // peerId -> current PeerJS MediaConnection
    this.mutedPeers = new Set();   // locally-muted peer ids
    this.mySpeaking = false;
    this._myAnalyser = null;
    this._myData = null;
    this.voiceVolume = 0.55;
    this._voiceRequestGeneration = 0;
    this._rate = new Map();
    this._shotRelay = new Map();   // peer id -> last relayed shot, see 'shoot'
    this._eventAt = new Map();
    this._pendingUnreliable = new Map();
    this._intentionalLeave = false;
    this._closedHandled = false;
  }

  get connected() { return !!this.peer && !this.peer.destroyed; }
  get myId() { return this.peer?.id; }

  // ---------------- hosting ----------------
  host(playerName) {
    return new Promise((resolve, reject) => {
      this._intentionalLeave = false;
      this._closedHandled = false;
      const tryCode = (attempt) => {
        const code = genCode(5);
        const peer = new Peer(PREFIX + code, { debug: 0 });
        const kill = setTimeout(() => { peer.destroy(); reject(new Error('Connection to matchmaking timed out. Check your internet.')); }, 10000);
        peer.on('open', () => {
          clearTimeout(kill);
          this.peer = peer;
          this.code = code;
          this.isHost = true;
          this.mode = 'host';
          this.matchActive = false;
          this.lobbyPlayers = [{ id: peer.id, name: cleanName(playerName), ready: false, color: 0, host: true, persona: cleanPersona(this.myPersona) }];
          this._startPeerSweep();
          peer.on('connection', (conn) => this._hostAccept(conn));
          peer.on('error', (e) => { if (e.type !== 'peer-unavailable') console.warn('[net]', e.type); });
          this._setupVoiceAnswer();
          resolve(code);
        });
        peer.on('error', (e) => {
          clearTimeout(kill);
          if (e.type === 'unavailable-id' && attempt < 3) { peer.destroy(); tryCode(attempt + 1); }
          else reject(new Error('Could not create lobby: ' + e.type));
        });
      };
      tryCode(0);
    });
  }

  _hostAccept(conn) {
    const ch = conn.metadata?.ch === 'u' ? 'u' : 'r';
    conn.on('open', () => {
      let p = this.peers.get(conn.peer);
      if (!p && this.matchActive) {
        try { if (ch === 'r') conn.send({ t: 'reject', reason: 'Match in progress. Rejoin when the host returns to the lobby.' }); } catch (e) {}
        try { conn.close(); } catch (e) {}
        return;
      }
      if (!p && ch === 'u') {
        if (this._pendingUnreliable.size >= 12) { try { conn.close(); } catch (e) {} return; }
        const old = this._pendingUnreliable.get(conn.peer);
        if (old) { try { old.conn.close(); } catch (e) {} clearTimeout(old.timer); }
        const timer = setTimeout(() => {
          const pending = this._pendingUnreliable.get(conn.peer);
          if (pending?.conn === conn) this._pendingUnreliable.delete(conn.peer);
          try { conn.close(); } catch (e) {}
        }, 5000);
        this._pendingUnreliable.set(conn.peer, { conn, timer });
        conn.on('close', () => { const pending = this._pendingUnreliable.get(conn.peer); if (pending?.conn === conn) { clearTimeout(pending.timer); this._pendingUnreliable.delete(conn.peer); } });
        conn.on('error', () => { try { conn.close(); } catch (e) {} });
        return;
      }
      const clientId = cleanClientId(conn.metadata?.clientId);
      let replacementColor = null;
      if (!p && ch === 'r' && clientId) {
        const previousId = stableClientReplacement(this._clientPeers, clientId, conn.peer);
        if (previousId) {
          replacementColor = this.lobbyPlayers.find((player) => player.id === previousId)?.color ?? null;
          this._dropPeer(previousId);
        }
      }
      if (!p && this.peers.size >= MAX_PLAYERS - 1) {
        try { if (ch === 'r') conn.send({ t: 'reject', reason: 'Lobby is full (4 players max).' }); } catch (e) {}
        try { conn.close(); } catch (e) {}
        return;
      }
      if (!p) {
        p = {
          name: '?', ready: false, color: availableLobbyColor(this.lobbyPlayers, replacementColor, MAX_PLAYERS),
          openR: false, openU: false, authenticated: false,
          clientId, lastSeen: Date.now(),
        };
        this.peers.set(conn.peer, p);
        if (clientId) this._clientPeers.set(clientId, conn.peer);
        p.helloTimer = setTimeout(() => { if (!p.authenticated) this._dropPeer(conn.peer, p); }, 5000);
      }
      if (p[ch]?.open) { try { conn.close(); } catch (e) {} return; }
      this._attachHostConn(conn, ch, p);
      const pending = this._pendingUnreliable.get(conn.peer);
      if (ch === 'r' && pending) {
        clearTimeout(pending.timer);
        this._pendingUnreliable.delete(conn.peer);
        this._attachHostConn(pending.conn, 'u', p);
      }
    });
  }

  _attachHostConn(conn, ch, p) {
    if (p[ch]?.open) { try { conn.close(); } catch (e) {} return; }
    p[ch] = conn;
    p[ch === 'r' ? 'openR' : 'openU'] = true;
    conn.on('data', (msg) => {
      if (peerConnectionIsCurrent(this.peers, conn.peer, p, ch, conn)) this._hostData(conn.peer, msg, ch);
    });
    conn.on('close', () => this._dropPeer(conn.peer, p));
    conn.on('error', () => this._dropPeer(conn.peer, p));
  }

  _dropPeer(id, expectedPeer = null) {
    const p = this.peers.get(id);
    if (!p || (expectedPeer && p !== expectedPeer)) return;
    const removal = removeLobbyPeer(this.lobbyPlayers, id);
    const departed = removal.departed;
    clearTimeout(p.helloTimer);
    // Delete first: PeerJS implementations and test doubles are allowed to emit
    // close synchronously, and both reliable/unreliable channels point here.
    // Re-entrant close/error notifications must observe an already-removed peer.
    this.peers.delete(id);
    if (p.clientId && this._clientPeers.get(p.clientId) === id) this._clientPeers.delete(p.clientId);
    try { p.r?.close(); } catch (e) {}
    try { p.u?.close(); } catch (e) {}
    this._rate.delete(id);
    this._shotRelay.delete(id);
    for (const key of [...this._eventAt.keys()]) if (key.startsWith(`${id}:`)) this._eventAt.delete(key);
    this.lobbyPlayers = removal.players;
    this._cleanupPeerVoice(id);
    if (departed) {
      this._broadcastLobby();
      this.onPeerLeave?.(id, departed.name || p.name || 'Player');
    }
  }

  _hostData(fromId, msg, ch) {
    // Count a packet before walking its nested payload so malformed traffic is
    // still covered by the per-peer CPU budget.
    if (!msg || typeof msg !== 'object' || !this._allowMessage(fromId, ch) || !isValidNetworkPayload(msg)) return;
    const sourcePeer = this.peers.get(fromId);
    if (sourcePeer) sourcePeer.lastSeen = Date.now();
    if (ch === 'u') {
      const peer = this.peers.get(fromId);
      if (!peer?.authenticated) return;
      const entry = this.lobbyPlayers.find((l) => l.id === fromId);
      if ([msg.x, msg.y, msg.z, msg.yaw, msg.pitch].some((value) => !Number.isFinite(Number(value)))) return;
      msg.id = fromId;
      msg.name = entry?.name || 'Player';
      msg.x = Math.max(-200, Math.min(200, Number(msg.x)));
      msg.y = Math.max(-50, Math.min(100, Number(msg.y)));
      msg.z = Math.max(-200, Math.min(200, Number(msg.z)));
      msg.yaw = Math.max(-100, Math.min(100, Number(msg.yaw)));
      msg.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(msg.pitch)));
      this.onPlayerState?.(msg, fromId);
      return;
    }
    const peer = this.peers.get(fromId);
    if (!CLIENT_EVENTS.has(msg.t) || HOST_ONLY_EVENTS.has(msg.t)) return;
    if (msg.t !== 'hello' && !peer?.authenticated) return;
    if (!this._allowEvent(fromId, msg.t)) return;
    if (['pause', 'down', 'dead', 'respawn', 'revive_self', 'drop_take', 'bark', 'pap_take', 'shoot'].includes(msg.t)) msg.pid = fromId;
    if (msg.t === 'revive_req' || msg.t === 'revive_start' || msg.t === 'revive_stop') msg.by = fromId;
    switch (msg.t) {
      case 'shoot': {
        // The host has always consumed these itself; without a relay a guest
        // could only ever see the HOST shoot, never the other guests, so in a
        // four-player game two thirds of the gunfire was invisible from a
        // guest's seat. Relay it, with the shooter's identity stamped by us
        // rather than claimed by the sender.
        this.onEvent?.(msg, fromId);
        // Muzzle flashes are cosmetic and the reliable channel is shared with
        // the whole combat feed, so a fast automatic weapon is throttled down
        // to a rate the eye still reads as continuous fire.
        const now = performance.now();
        const last = this._shotRelay.get(fromId) || 0;
        if (now - last >= SHOT_RELAY_MIN_MS) {
          this._shotRelay.set(fromId, now);
          this._broadcastRel(msg);
        }
        break;
      }
      case 'hello': {
        const p = this.peers.get(fromId);
        if (!p?.openR) break;
        const claimedClientId = cleanClientId(msg.clientId);
        if (p.clientId && claimedClientId !== p.clientId) { this._dropPeer(fromId); break; }
        if (!p.clientId && claimedClientId) {
          const previousId = stableClientReplacement(this._clientPeers, claimedClientId, fromId);
          if (previousId) this._dropPeer(previousId);
          p.clientId = claimedClientId;
          this._clientPeers.set(claimedClientId, fromId);
        }
        p.authenticated = true;
        clearTimeout(p.helloTimer);
        if (p) { p.name = cleanName(msg.name); p.persona = cleanPersona(msg.persona); }
        const entry = this.lobbyPlayers.find((l) => l.id === fromId);
        if (!entry && this.lobbyPlayers.length < MAX_PLAYERS) this.lobbyPlayers.push({ id: fromId, name: p ? p.name : 'Player', ready: false, color: p.color, host: false, persona: cleanPersona(msg.persona) });
        else if (entry) { entry.name = p?.name || 'Player'; entry.persona = cleanPersona(msg.persona); }
        this._broadcastLobby();
        break;
      }
      case 'ready': {
        const entry = this.lobbyPlayers.find((l) => l.id === fromId);
        if (entry) entry.ready = !!msg.ready;
        this._broadcastLobby();
        break;
      }
      case 'persona': {
        const entry = this.lobbyPlayers.find((l) => l.id === fromId);
        if (entry) entry.persona = cleanPersona(msg.persona);
        this._broadcastLobby();
        break;
      }
      case 'name': {
        const entry = this.lobbyPlayers.find((l) => l.id === fromId);
        if (entry) entry.name = cleanName(msg.name);
        this._broadcastLobby();
        break;
      }
      case 'heartbeat':
        break;
      case 'leave':
        this._dropPeer(fromId, sourcePeer);
        break;
      case 'perk_anim': {
        const event = sanitizePerkAnimation(fromId, msg);
        if (!event) break;
        // The host observes it locally and relays only the sanitized identity.
        // The sender gets the relay too, but game code suppresses its local echo.
        this.onEvent?.(event, fromId);
        this._broadcastRel(event);
        break;
      }
      default:
        this.onEvent?.(msg, fromId);
    }
  }

  _allowMessage(id, ch) {
    const now = performance.now();
    let r = this._rate.get(id);
    if (!r || now - r.at >= 1000) { r = { at: now, r: 0, u: 0 }; this._rate.set(id, r); }
    r[ch]++;
    return r[ch] <= (ch === 'u' ? 45 : 120);
  }

  _allowEvent(id, type) {
    const min = EVENT_MIN_MS[type] || 0;
    if (!min) return true;
    const key = `${id}:${type}`;
    const now = performance.now();
    const last = this._eventAt.get(key);
    if (last != null && now - last < min) return false;
    this._eventAt.set(key, now);
    return true;
  }

  _startPeerSweep() {
    clearInterval(this._peerSweepTimer);
    this._peerSweepTimer = setInterval(() => this._pruneStalePeers(Date.now()), PEER_SWEEP_INTERVAL_MS);
  }

  _pruneStalePeers(now = Date.now()) {
    for (const id of stalePeerIds(this.peers, now, PEER_TIMEOUT_MS)) this._dropPeer(id);
  }

  // ---------------- send ----------------
  _broadcastRel(msg) {
    for (const [, p] of this.peers) {
      try { if (p.authenticated && p.r?.open) p.r.send(msg); } catch (e) {}
    }
  }
  _broadcastUnrel(msg) {
    for (const [, p] of this.peers) {
      try { if (p.authenticated && p.u?.open) p.u.send(msg); } catch (e) {}
    }
  }

  sendRel(msg) {
    if (this.isHost) this._broadcastRel(msg);
    else { try { if (this.hostConn?.r?.open) this.hostConn.r.send(msg); } catch (e) {} }
  }
  sendUnrel(msg) {
    if (this.isHost) this._broadcastUnrel(msg);
    else { try { if (this.hostConn?.u?.open) this.hostConn.u.send(msg); } catch (e) {} }
  }

  leave() {
    this._intentionalLeave = true;
    if (!this.isHost) {
      try { if (this.hostConn?.r?.open) this.hostConn.r.send({ t: 'leave' }); } catch (e) {}
    }
    this._teardown();
  }

  _teardown() {
    clearInterval(this._heartbeatTimer);
    clearInterval(this._peerSweepTimer);
    this._heartbeatTimer = null;
    this._peerSweepTimer = null;
    this.disableVoice();
    this.mutedPeers.clear();
    for (const [, p] of this.peers) clearTimeout(p.helloTimer);
    try { for (const [, p] of this.peers) { p.r?.close(); p.u?.close(); } } catch (e) {}
    try { this.hostConn?.r?.close(); this.hostConn?.u?.close(); } catch (e) {}
    try { this.peer?.destroy(); } catch (e) {}
    this.peer = null;
    this.hostConn = null;
    this.peers.clear();
    this._clientPeers.clear();
    this.lobbyPlayers = [];
    this.lobbyCheats = {};
    this.lobbyVoiceEnabled = false;
    this.isHost = false;
    this.matchActive = false;
    this.mode = null;
    this.code = null;
    this._rate.clear();
    this._shotRelay.clear();
    this._eventAt.clear();
    for (const [, pending] of this._pendingUnreliable) { clearTimeout(pending.timer); try { pending.conn.close(); } catch (e) {} }
    this._pendingUnreliable.clear();
    this._voiceAnswerWired = false;
    // A dead transport must not deliver late gameplay/lobby callbacks into a
    // newly visible menu or a later Net instance.
    this.onLobby = null;
    this.onStart = null;
    this.onEvent = null;
    this.onSnap = null;
    this.onPlayerState = null;
    this.onPeerLeave = null;
    this.onClosed = null;
  }
}

// Net's methods are split by side across js/net/. Each file is a class whose
// methods are copied onto Net.prototype here: one `this`, one connection to
// every caller. A name defined twice is a split mistake, so it fails at load.
installMixins(Net, [NetJoin, NetLobby, NetVoice]);
