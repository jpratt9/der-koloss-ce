// Game's match flow: rounds, intermission, game over, and power-up drops.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { CFG } from '../config.js';
import { dist2D } from '../utils.js';
import { audio } from '../audio.js';
import { multiplayerExitDestination } from '../multiplayer-contracts.js';
import { ROUND_INTERMISSION_SECONDS } from '../gameplay-rules.js';

export class GameRounds {
  // ---------------- rounds (authority) ----------------
  updateRounds(dt) {
    // GHOST TOWN cheat: no waves, no zombies — the factory is yours to explore
    if (this.cheats.zero) {
      if (!this._zeroBannered) {
        this._zeroBannered = true;
        this.hud.banner('GHOST TOWN', '#7ec8e3', 'No zombies — explore freely');
      }
      // Still check for death. You can kill yourself with your own splash even
      // with nothing hunting you, and with no wave to clear there is no
      // intermission to respawn into — so skipping this left the player dead on
      // the floor forever, with no GAME OVER and no way out of the round.
      this._checkGameOver();
      return;
    }
    this.phaseT -= dt;
    switch (this.phase) {
      case 'pre':
        if (this.phaseT <= 0) this.beginRound(this.round + 1);
        break;
      case 'intermission':
        // Also covers an unusual late bleed-out during the intermission.
        if (this.player.dead) this.respawnSelf();
        if (this.phaseT <= 0) this.beginRound(this.round + 1);
        break;
      case 'active':
        if (!this.zombies.roundInProgress && this.phaseT <= 0) {
          this.phase = 'intermission';
          this.phaseT = ROUND_INTERMISSION_SECONDS;
          // Dead players return as soon as the wave is cleared so the entire
          // intermission is usable for buying, rebuilding and regrouping.
          if (this.player.dead) this.respawnSelf();
          this.netSend({ t: 'intermission', seconds: ROUND_INTERMISSION_SECONDS });
          audio.play('round_end');
        }
        break;
    }
    this._checkGameOver();
  }

  /** End the match once nobody is left standing. */
  _checkGameOver() {
    if (!this.over) {
      const all = this.allPlayerStates();
      const alive = all.filter((pl) => !pl.dead && !pl.down);
      const anyAlive = this.mode === 'solo'
        ? !this.player.dead
        : (alive.length > 0 || all.some((pl) => !pl.dead));
      let remoteStanding = false;
      for (const [, rp] of this.remotePlayers) {
        if (!rp.dead && !rp.down) { remoteStanding = true; break; }
      }
      // No `all.length > 0` guard. allPlayerStates() DROPS any source that is
      // already dead, so the moment the last two players die in the same frame
      // the list is empty — and that made this condition false at exactly the
      // point it should be true. The state was unrecoverable: nobody standing
      // means the horde goes dormant, so the wave never finishes, so the phase
      // never reaches intermission and respawnSelf is never called. No banner,
      // no lobby, no respawn. Empty means everybody is gone, which is precisely
      // game over, and `every` on an empty list is vacuously true.
      const everyoneDead = this.mode === 'solo'
        ? this.player.dead
        : (all.every((pl) => pl.dead || pl.down) && !remoteStanding && (this.player.dead || this.player.down));
      if (everyoneDead) this.gameOver();
    }
  }

  beginRound(n) {
    this.round = n;
    this.phase = 'active';
    this.phaseT = 0.5;
    this.zombies.startRound(n, Math.max(1, this.lobbyPlayers.length));
    this._dogRoundReward = this.zombies.dogRound ? { round: n, spawned: false } : null;
    // classic resupply: +2 grenades every round, up to 4
    const p = this.player;
    // Browser chrome/fullscreen and respawn transitions can land between resize
    // events. Reassert a centered full-canvas projection at the round boundary.
    this.onResize();
    if (!p.dead) {
      p.grenades = Math.min(4, p.grenades + 2);
      this.hud.setGrenades(p.grenades, p.monkeys);
    }
    this.hud.setRound(n, this.zombies.dogRound);
    // round 1: let the world settle before the battle cry (no spawn cacophony)
    if (n === 1) setTimeout(() => { if (!this.disposed) this.bark('start', { force: true }); }, 1400);
    else this.bark('round', { chance: 0.35 });
    if (this.zombies.dogRound) {
      this.hud.banner('HELLHOUNDS', '#ff7733', 'They come for your blood');
      audio.play('ann_dogs');
      audio.play('dog_howl');
      this.bark('dog', { force: true });
      this.netSend({ t: 'round', n, dog: 1 });
    } else {
      this.hud.banner(`ROUND ${n}`, n >= 10 ? '#ff4444' : '#c33', '');
      audio.setRound(this.round);
      audio.play('round_start');
      this.netSend({ t: 'round', n, dog: 0 });
    }
  }

  onDogRound() {}

  gameOver() {
    if (this.over) return;
    this.over = true;
    // There is nobody left to hunt. The horde stops mid-stride and stands over
    // the bodies instead of sprinting at a player who can no longer be reached.
    this.zombies.setDormant(true);
    audio.play('gameover');
    this.hud.banner('GAME OVER', '#ff3333', `You survived ${this.round} round${this.round === 1 ? '' : 's'}`);
    this.netSend({ t: 'gameover', round: this.round });
    const destination = multiplayerExitDestination({ mode: this.mode, gameOver: true });
    setTimeout(() => { if (!this.disposed) this.exit(destination); }, 6000);
  }

  // ---------------- drops ----------------
  updateDrops(dt) {
    const players = this.allPlayerStates();
    for (let i = 0; i < this.fx.drops.length;) {
      const d = this.fx.drops[i];
      let taken = false;
      for (const pl of players) {
        if (pl.down || pl.dead) continue;
        if (dist2D(pl.x, pl.z, d.x, d.z) < 1.2) {
          this.takeDrop(d, pl.id);
          taken = true;
          break;
        }
      }
      if (!taken) i++;
    }
  }

  takeDrop(d, pid) {
    this.fx.removeDrop(d);
    audio.play('pickup', { pos: d });
    this.applyDrop(d.type, pid);
    this.netSend({ t: 'drop_take', type: d.type, pid, id: dropId(d) });
  }

  applyDrop(type, pid) {
    switch (type) {
      case 'maxammo': {
        if (pid === this.player.id || true) { // max ammo applies to everyone
          this.player.refillAmmo();
          this.hud.setGrenades(this.player.grenades, this.player.monkeys);
        }
        audio.play('maxammo');
        this.hud.banner('MAX AMMO', '#8dff8d');
        break;
      }
      case 'insta':
        this.instaT = 30;
        audio.play('instakill');
        this.hud.banner('INSTA-KILL', '#ff6a5a');
        break;
      case 'double':
        this.doubleT = 30;
        audio.play('doublepoints');
        this.hud.banner('DOUBLE POINTS', '#ffd24a');
        break;
      case 'nuke': {
        audio.play('nuke');
        this.fx.screenFlash('#fff', 400, 0.8);
        this.fx.shake(0.7);
        if (this.isAuthority) {
          const n = this.zombies.nukeAll(pid);
          if (pid === this.player.id) this.awardPoints(CFG.NUKE_POINTS);
        } else if (pid === this.player.id) {
          this.awardPoints(CFG.NUKE_POINTS);
        }
        this.hud.banner('NUKE', '#c8b6ff');
        break;
      }
    }
  }

  _roundEvent(msg, from) {
    switch (msg.t) {
      case 'round': {
        this.round = msg.n;
        this.phase = 'active';
        this.zombies.dogRound = !!msg.dog; // clients need this for fog + hound counter
        if (!this.player.dead) { // +2 grenades per round (max 4), same as host
          this.player.grenades = Math.min(4, this.player.grenades + 2);
          this.hud.setGrenades(this.player.grenades, this.player.monkeys);
        }
        this.hud.setRound(msg.n, !!msg.dog);
        if (msg.dog) { this.hud.banner('HELLHOUNDS', '#ff7733', 'They come for your blood'); audio.play('dog_howl'); }
        else { this.hud.banner(`ROUND ${msg.n}`, msg.n >= 10 ? '#ff4444' : '#c33', ''); audio.setRound(msg.n); audio.play('round_start'); }
        break;
      }
      case 'intermission': {
        if (this.isAuthority) break;
        this.phase = 'intermission';
        this.phaseT = Math.max(0, Number(msg.seconds) || ROUND_INTERMISSION_SECONDS);
        if (this.player.dead) this.respawnSelf();
        audio.play('round_end');
        break;
      }
      case 'pause': {
        this.remotePaused = this.remotePaused || new Set();
        if (msg.on) this.remotePaused.add(msg.pid || from); else this.remotePaused.delete(msg.pid || from);
        break;
      }
      case 'drop': {
        if (!this.isAuthority) {
          const drop = this.fx.spawnDrop(msg.type, msg.x, msg.z);
          drop.netId = msg.id;
        }
        break;
      }
      case 'drop_take': {
        if (!this.isAuthority) {
          const d = this.fx.drops.find((dd) => dd.netId === msg.id) || this.fx.drops[0];
          if (d) this.fx.removeDrop(d);
          this.applyDrop(msg.type, msg.pid);
        }
        break;
      }
      case 'gameover': {
        if (!this.over) {
          this.over = true;
          this.zombies.setDormant(true);
          audio.play('gameover');
          this.hud.banner('GAME OVER', '#ff3333', `You survived ${msg.round} round${msg.round === 1 ? '' : 's'}`);
          setTimeout(() => { if (!this.disposed) this.exit('lobby'); }, 6000);
        }
        break;
      }
      case 'return_lobby': {
        if (!this.isAuthority) this.exit('lobby', String(msg.reason || 'The host ended the match.').slice(0, 120));
        break;
      }
    }
  }
}

let __dropId = 1;
export function dropId(d) { if (!d.__nid) d.__nid = __dropId++; return d.__nid; }
