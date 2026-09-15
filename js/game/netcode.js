// Game's networking: wiring to Net, snapshots, the player states the horde
// hunts, and the onNetEvent router.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { CFG } from '../config.js';
import { clamp, dist2D } from '../utils.js';
import { BOX_POOL } from '../weapons.js';
import { RemotePlayer } from '../player.js';

export class GameNetcode {
  // ================= net =================
  wireNet() {
    this.net.onEvent = (msg, from) => this.onNetEvent(msg, from);
    this.net.onSnap = (snap) => this.applySnapshot(snap);
    this.net.onPlayerState = (state, from) => {
      const rp = this.remotePlayers.get(from);
      if (rp) {
        // Movement is client-predicted, but lifecycle flags are changed only by
        // validated reliable events. Bound cosmetic scoreboard/loadout fields.
        state.down = rp.down ? 1 : 0;
        state.dead = rp.dead ? 1 : 0;
        state.hp = Number.isFinite(rp.hp) ? rp.hp : 100;
        state.points = clamp(Number(state.points) || 0, 0, 1e7);
        state.kills = clamp(Number(state.kills) || 0, 0, 1e6);
        state.downs = clamp(Number(state.downs) || 0, 0, 1e6);
        state.revives = clamp(Number(state.revives) || 0, 0, 1e6);
        state.perks = Array.isArray(state.perks) ? state.perks.filter((id) => ['jug', 'speed', 'dtap', 'qr'].includes(id)).slice(0, 4) : [];
        // Loadout is reliable host-owned state. Never let a high-frequency
        // cosmetic/movement snapshot smuggle a different gun or PaP flag.
        state.w = rp.weaponId;
        state.pap = rp.weaponPap ? 1 : 0;
        rp.applyState(state, this.time);
      }
      if (msgIsPlayerState(state)) this.hostPlayerStates.set(from, state);
    };
    this.net.onPeerLeave = (id, name = 'Player') => {
      const rp = this.remotePlayers.get(id);
      if (rp) { rp.dispose(this.scene); this.remotePlayers.delete(id); }
      this.hostPlayerStates?.delete(id);
      this._remoteShots.delete(id);
      this._remoteGrenades.delete(id);
      this._remoteCreditClaims.delete(id);
      this.remotePaused?.delete(id);
      this.lobbyPlayers = this.lobbyPlayers.filter((player) => player.id !== id);
      if (this.isAuthority && this.papState.busy && this.papState.owner === id) {
        // Tell the squad BEFORE clearing. Guests who are neither the owner nor
        // the authority have no exit from the ready branch of their own state
        // machine — they wait on this message — so a host that silently reset
        // left every other client stuck on "Upgrading…" with a dead
        // Pack-a-Punch for the rest of the match.
        this.netSend({ t: 'pap_take', pid: id, w: this.papState.weapon });
        this._resetPapState();
        this._syncPapPresentation(0);
      }
      this.hud.banner(`${String(name).toUpperCase()} LEFT THE GAME`, '#ff9944', 'Their soldier was removed');
    };
    this.hostPlayerStates = new Map();
  }

  netSend(msg) { if (this.net) this.net.sendRel(msg); }

  _configureRemoteSpawnLoadouts() {
    if (!this.isAuthority) return;
    const localLoadout = this.player.weapons.map((weapon) => ({ id: weapon.id, pap: !!weapon.pap }));
    for (const [, remote] of this.remotePlayers) {
      remote.bowie = !!this.cheats.papguns;
      if (this.cheats.papguns && !this.cheats.wunder) {
        // ARMED TO THE TEETH intentionally randomizes independently on each
        // machine. The host permits two authenticated selections from the
        // configured pool, but production/default matches get no such latitude.
        remote.setAuthoritativeLoadout([]);
        remote.ownedWeapons.clear();
        remote.spawnWeaponAllowance = new Map(BOX_POOL
          .filter((id) => !['panzerschreck', 'bowie', 'monkey'].includes(id))
          .map((id) => [id, true]));
      } else {
        remote.setAuthoritativeLoadout(localLoadout);
        remote.spawnWeaponAllowance = new Map(localLoadout.map((weapon) => [weapon.id, weapon.pap]));
      }
    }
  }

  _remoteNear(from, pos, radius = 3) {
    const rp = this.remotePlayers.get(from);
    return !!(rp && pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
      && dist2D(rp.x, rp.z, pos.x, pos.z) <= radius);
  }

  _remoteNearVisible(from, pos, radius = 3) {
    const rp = this.remotePlayers.get(from);
    if (!rp || !this._remoteNear(from, pos, radius)) return false;
    return this.interactionVisibleFrom(rp.x, rp.y + 1.25, rp.z, pos);
  }

  applySnapshot(snap) {
    this.zombies.applySnapshot(snap.z, this.time);
    const connected = this._snapshotPlayerIds;
    connected.clear();
    for (const player of this.lobbyPlayers) connected.add(player.id);
    for (const ps of snap.pl) {
      if (ps.id === this.player.id) continue;
      // A final in-flight unreliable packet can arrive after the reliable lobby
      // departure notice. Never resurrect a disconnected soldier from it.
      if (!connected.has(ps.id) && !String(ps.id).startsWith('bot-')) continue;
      let rp = this.remotePlayers.get(ps.id);
      if (!rp) { rp = new RemotePlayer(this.scene, { id: ps.id, name: ps.name, c: ps.c }); this.remotePlayers.set(ps.id, rp); }
      rp.applyState(ps, this.time);
    }
    if (snap.round !== this.round && snap.phase === 'active') {
      // round already announced via reliable event; this is a fallback
    }
  }

  // Is there anyone left for the horde to hunt? Solo bleedout counts as no:
  // the player is down with nobody coming, so the run is already over even
  // though the game-over banner is still a few seconds away. Every peer can
  // answer this from state it already has, so guests settle their local horde
  // at the same moment the host settles the authoritative one.
  hordeHasPrey() {
    if (this.zombies?.monkey) return true;
    if (!this.player.dead && !this.player.down) return true;
    for (const [, rp] of this.remotePlayers) if (!rp.dead && !rp.down) return true;
    for (const b of this.bots || []) if (!b.dead && !b.down) return true;
    return false;
  }

  packCentroid(excludeId) {
    const ps = this.allPlayerStates().filter((p) => p.id !== excludeId && !p.dead && !p.down);
    if (!ps.length) return null;
    return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length };
  }

  allPlayerStates() {
    // host: own + remote player states (latest) for zombie targeting
    const list = this._playerStateCache;
    list.length = 0;
    this._appendPlayerState(list, this.player.id, this.player);
    if (this.mode === 'host') {
      for (const [id, rp] of this.remotePlayers) this._appendPlayerState(list, id, rp);
    }
    for (const b of this.bots || []) this._appendPlayerState(list, b.id, b);
    return list;
  }

  _appendPlayerState(list, id, source) {
    if (source.dead) return;
    let state = this._playerStateById.get(id);
    if (!state) {
      state = { id, x: 0, z: 0, y: 0, down: false, dead: false };
      this._playerStateById.set(id, state);
    }
    state.x = source.x; state.z = source.z; state.y = source.y;
    state.down = !!source.down; state.dead = !!source.dead;
    list.push(state);
  }

  // ---------------- net update ----------------
  updateNet(dt) {
    if (this.mode === 'host') {
      this.snapTimer -= dt;
      if (this.snapTimer <= 0) {
        this.snapTimer = 1 / CFG.SNAPSHOT_HZ;
        const pl = [this.player.serialize()];
        for (const [, rp] of this.remotePlayers) {
          pl.push({ id: rp.id, name: rp.name, c: rp.colorIdx, x: rp.x, y: rp.y, z: rp.z, yaw: rp.yaw, pitch: rp.pitch, hp: rp.hp, down: rp.down ? 1 : 0, dead: rp.dead ? 1 : 0, points: rp.points, kills: rp.kills, downs: rp.downs, revives: rp.revives, w: rp.weaponId, pap: rp.weaponPap ? 1 : 0, perks: rp.perks, crouch: rp.crouch, sprint: rp.sprint, bleed: rp.bleed });
        }
        for (const b of this.bots || []) pl.push(b.serialize());
        this.net.sendUnrel({ t: 'snap', pl, z: this.zombies.serialize(), round: this.round });
      }
    } else {
      this.inputTimer -= dt;
      if (this.inputTimer <= 0) {
        this.inputTimer = 1 / CFG.INPUT_HZ;
        this.net.sendUnrel(this.player.serialize());
      }
    }
  }

  // Every message is offered to each domain handler in turn; each switches on
  // its own message types and ignores the rest.
  onNetEvent(msg, from) {
    this._combatEvent(msg, from);
    this._roundEvent(msg, from);
    this._interactEvent(msg, from);
    this._playerEvent(msg, from);
    this._machineEvent(msg, from);
    this._boxEvent(msg, from);
    this._papEvent(msg, from);
  }
}

function msgIsPlayerState(s) { return s && typeof s.x === 'number' && typeof s.yaw === 'number'; }
