// Net's guest side: joining a lobby over both channels, the heartbeat, reading
// what the host sends, and closing when the host goes.
// Methods of Net: js/net.js copies them onto Net.prototype.
import {
  departedLobbyPlayers,
  isValidNetworkPayload,
  isValidSnapshotPayload,
  shouldHandleRemoteClose,
} from '../multiplayer-contracts.js';
import { PREFIX, MAX_PLAYERS, cleanName, cleanPersona } from './identity.js';

const HEARTBEAT_INTERVAL_MS = 5000;

export class NetJoin {
  _startHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => this.sendRel({ t: 'heartbeat' }), HEARTBEAT_INTERVAL_MS);
  }

  // ---------------- joining ----------------
  join(code, playerName) {
    return new Promise((resolve, reject) => {
      this._intentionalLeave = false;
      this._closedHandled = false;
      const peer = new Peer({ debug: 0 });
      let peerOpen = false;
      const kill = setTimeout(() => { peer.destroy(); reject(new Error('Connection timed out. Check the code and try again.')); }, 12000);
      peer.on('open', () => {
        peerOpen = true;
        this.peer = peer;
        this.isHost = false;
        this.mode = 'client';
        this.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        this._setupVoiceAnswer();
        const hostId = PREFIX + this.code;
        const r = peer.connect(hostId, { metadata: { ch: 'r', clientId: this._clientId }, reliable: true });
        const u = peer.connect(hostId, { metadata: { ch: 'u', clientId: this._clientId }, reliable: false });
        this.hostConn = { r, u };
        let opened = false;
        r.on('open', () => {
          clearTimeout(kill);
          opened = true;
          r.send({ t: 'hello', name: cleanName(playerName), persona: cleanPersona(this.myPersona), clientId: this._clientId });
          this._startHeartbeat();
          resolve();
        });
        r.on('data', (msg) => {
          if (this._allowMessage('host', 'r')) this._clientData(msg);
        });
        u.on('data', (msg) => {
          if (!this._allowMessage('host', 'u') || !isValidSnapshotPayload(msg, { maxPlayers: MAX_PLAYERS })) return;
          this.onSnap?.(msg);
        });
        r.on('close', () => {
          if (this.peer === peer && this.hostConn?.r === r) this._closed('The host left or lost connection — returned to the main menu.');
        });
        r.on('error', () => {
          if (this.peer === peer && this.hostConn?.r === r) this._closed('The host connection was lost — returned to the main menu.');
        });
        peer.on('error', (e) => {
          if (!opened) {
            clearTimeout(kill);
            reject(new Error(e.type === 'peer-unavailable' ? 'Lobby not found. Check the code.' : 'Network error: ' + e.type));
          }
        });
      });
      // Only for failing to reach the signalling server at all. PeerJS reports a
      // lobby code nobody is hosting as a `peer-unavailable` error on the peer,
      // AFTER its socket is open, and listeners run in the order they were
      // added — so this one used to answer first and reject with its own
      // message, and "Lobby not found. Check the code." never reached anyone.
      peer.on('error', (e) => { if (peerOpen) return; clearTimeout(kill); reject(new Error('Could not connect: ' + e.type)); });
    });
  }

  _clientData(msg) {
    if (!msg || typeof msg !== 'object' || !isValidNetworkPayload(msg)) return;
    switch (msg.t) {
      case 'lobby':
        if (!Array.isArray(msg.players) || msg.players.length > MAX_PLAYERS) return;
        {
          const previous = this.lobbyPlayers;
          this.lobbyPlayers = msg.players.map((p, i) => ({
            id: String(p.id || '').slice(0, 80), name: cleanName(p.name), ready: !!p.ready,
            color: Number.isFinite(Number(p.color)) ? Math.abs(Math.trunc(Number(p.color))) % MAX_PLAYERS : i % MAX_PLAYERS,
            host: !!p.host, persona: cleanPersona(p.persona),
          }));
          this.lobbyCheats = msg.cheats && typeof msg.cheats === 'object' ? msg.cheats : {};
          this.lobbyVoiceEnabled = msg.voiceEnabled === true;
          if (!this.lobbyVoiceEnabled) this.disableVoice();
          this.syncVoiceCalls();
          this.onLobby?.(this.lobbyPlayers, String(msg.code || '').slice(0, 5));
          for (const player of departedLobbyPlayers(previous, this.lobbyPlayers, this.myId)) {
            this._cleanupPeerVoice(player.id);
            this.onPeerLeave?.(player.id, player.name);
          }
        }
        break;
      case 'start':
        if (!Array.isArray(msg.players) || msg.players.length > MAX_PLAYERS) return;
        this.matchActive = true;
        msg.players = msg.players.map((p, i) => ({
          ...p,
          id: String(p.id || '').slice(0, 80),
          name: cleanName(p.name),
          color: Number.isFinite(Number(p.color)) ? Math.abs(Math.trunc(Number(p.color))) % MAX_PLAYERS : i % MAX_PLAYERS,
          persona: cleanPersona(p.persona),
        }));
        this.onStart?.(msg);
        break;
      case 'reject':
        this._closed(String(msg.reason || 'The lobby rejected the connection.').slice(0, 120));
        break;
      default:
        this.onEvent?.(msg, 'host');
    }
  }

  _closed(reason) {
    if (!shouldHandleRemoteClose({
      intentional: this._intentionalLeave,
      handled: this._closedHandled,
      connected: this.connected,
    })) return;
    this._closedHandled = true;
    const onClosed = this.onClosed;
    this._teardown();
    onClosed?.(reason);
  }
}
