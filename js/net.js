// Networking: PeerJS/WebRTC host-authoritative model.
// Host runs the lobby + zombie simulation; clients send inputs & hit claims.
// Two data channels per peer: reliable (events) + unreliable/unordered (snapshots).
// Also owns voice chat end-to-end (streams, analysers, mute state) so both the
// lobby UI and the in-game HUD can read speaking state.
// Net's methods are in js/net/, one file per side of the connection, installed below.
import { installMixins } from './utils.js';
import { clientIdentity } from './net/identity.js';
import { NetHost } from './net/host.js';
import { NetJoin } from './net/join.js';
import { NetLobby } from './net/lobby.js';
import { NetVoice } from './net/voice.js';

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
installMixins(Net, [NetHost, NetJoin, NetLobby, NetVoice]);
