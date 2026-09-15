// Net's lobby: the roster and the host's settings, as the lobby screen changes
// them. The host broadcasts each change, and a guest asks the host for it.
// Methods of Net: js/net.js copies them onto Net.prototype.
import { cleanName, cleanPersona } from './identity.js';

export class NetLobby {
  _broadcastLobby() {
    const payload = {
      t: 'lobby', players: this.lobbyPlayers, code: this.code,
      cheats: this.lobbyCheats, voiceEnabled: this.lobbyVoiceEnabled,
    };
    this._broadcastRel(payload);
    this.syncVoiceCalls();
    this.onLobby?.(this.lobbyPlayers, this.code);
  }

  setLobbyCheats(settings) {
    if (!this.isHost) return;
    // Keep the lobby payload data-only and detached from the menu's mutable
    // object. Guests receive this snapshot for a truthful read-only preview.
    try { this.lobbyCheats = JSON.parse(JSON.stringify(settings || {})); }
    catch (e) { this.lobbyCheats = {}; }
    this._broadcastLobby();
  }

  setLobbyVoiceEnabled(enabled) {
    if (!this.isHost) return false;
    this.lobbyVoiceEnabled = enabled === true;
    if (!this.lobbyVoiceEnabled) this.disableVoice();
    else this.voiceFailed = false;
    this._broadcastLobby();
    return this.lobbyVoiceEnabled;
  }

  resetLobbyReady() {
    this.matchActive = false;
    for (const player of this.lobbyPlayers) player.ready = false;
    if (this.isHost) this._broadcastLobby();
  }

  setPersona(persona) {
    persona = cleanPersona(persona);
    this.myPersona = persona;
    const me = this.lobbyPlayers.find((l) => l.id === this.myId);
    if (me) me.persona = persona;
    if (this.isHost) this._broadcastLobby();
    else this.sendRel({ t: 'persona', persona });
  }

  setName(name) {
    const n = cleanName(name);
    const me = this.lobbyPlayers.find((l) => l.id === this.myId);
    if (me) me.name = n;
    if (this.isHost) this._broadcastLobby();
    else this.sendRel({ t: 'name', name: n });
  }

  setReady(ready) {
    if (this.isHost) {
      const me = this.lobbyPlayers.find((l) => l.id === this.myId);
      if (me) me.ready = ready;
      this._broadcastLobby();
    } else {
      this.sendRel({ t: 'ready', ready });
      const me = this.lobbyPlayers.find((l) => l.id === this.myId);
      if (me) me.ready = ready;
      this.onLobby?.(this.lobbyPlayers, this.code);
    }
  }

  majorityReady() {
    const n = this.lobbyPlayers.length;
    const r = this.lobbyPlayers.filter((p) => p.ready).length;
    return r >= Math.floor(n / 2) + 1;
  }

  startGame(payload) {
    this.matchActive = true;
    const msg = { t: 'start', ...payload, players: this.lobbyPlayers };
    this._broadcastRel(msg);
    this.onStart?.(msg);
  }
}
