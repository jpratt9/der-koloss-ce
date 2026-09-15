// Game's players: perk drinks, voice barks, damage, going down, revives
// and respawning.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { CFG } from '../config.js';
import { clamp, rand } from '../utils.js';
import { audio } from '../audio.js';
import { assets } from '../assets.js';
import { lineFor, variantCount } from '../personas.js';
import { SYNCED_PERK_IDS } from '../multiplayer-contracts.js';
import { isPerkId, PERK_DRINK_TIMELINE } from '../gameplay-rules.js';

export class GamePlayers {
  beginLocalPerkDrink(perk) {
    if (!perk || !isPerkId(perk.id) || this.localPerkDrink || !this.weaponRig.startPerkDrink(perk.id)) return false;
    this.localPerkDrink = { id: perk.id, elapsed: 0, granted: false, broke: false, belched: false };
    audio.play('drink');
    this.sendPerkDrinkAnimation(perk.id);
    return true;
  }

  updatePerkDrinks(dt) {
    const drink = this.localPerkDrink;
    if (!drink) return;
    const p = this.player;
    drink.elapsed += dt;
    if ((p.down || p.dead) && !drink.granted) {
      if (this.weaponRig.perkBottle) this.weaponRig.perkBottle.visible = false;
      this.weaponRig.perkDrinkT = 0;
      this.localPerkDrink = null;
      return;
    }
    if (!drink.granted && drink.elapsed >= PERK_DRINK_TIMELINE.grantAt) {
      drink.granted = true;
      p.perks.add(drink.id);
      if (drink.id === 'jug') p.hp = CFG.JUG_HP;
      this.hud.setPerks(p.perks);
      // No screen flash here. The grant lands at 1.56s, mid-gulp, so a white
      // full-screen blowout read as a random glitch rather than as feedback —
      // and the post path drives uFlash, which has no colour to tint toward the
      // perk. The HUD chip, the belch and the bottle smash carry the beat.
      this.netSend({ t: 'perk', id: drink.id });
    }
    if (!drink.broke && drink.elapsed >= PERK_DRINK_TIMELINE.breakAt) {
      drink.broke = true;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const x = p.x + fx * 1.2 - rx * 0.65, z = p.z + fz * 1.2 - rz * 0.65;
      const y = Math.max(0.08, this.map.floorY(x, z, p.y + 1) + 0.08);
      audio.play('bottle_break', { pos: { x, y, z } });
      this.fx.spawnParticles(x, y, z, { count: 18, color: [0.65, 0.88, 0.75], speed: 2.2, spread: 0.8, life: 0.55, grav: 8, size: 0.85 });
    }
    if (!drink.belched && drink.elapsed >= PERK_DRINK_TIMELINE.belchAt) {
      drink.belched = true;
      audio.play('belch', { pos: { x: p.x, y: p.y + 1.55, z: p.z } });
    }
    if (drink.elapsed >= PERK_DRINK_TIMELINE.duration) this.localPerkDrink = null;
  }

  sendPerkDrinkAnimation(perkId) {
    if (!this.net || !SYNCED_PERK_IDS.includes(perkId)) return false;
    // Host-originated events are already authoritative; guest identity is added
    // by Net from the authenticated connection, never from this payload.
    this.netSend(this.isAuthority
      ? { t: 'perk_anim', pid: this.player.id, id: perkId }
      : { t: 'perk_anim', id: perkId });
    return true;
  }

  startRemotePerkDrink(pid, perkId) {
    if (pid === this.player.id || !SYNCED_PERK_IDS.includes(perkId)) return false;
    const remote = this.remotePlayers.get(pid);
    if (!remote) return false;
    // RemotePlayer.startPerkDrink(perkId) is the actor-animation integration
    // point. The callback also lets a future cosmetic system observe the event.
    if (typeof remote.startPerkDrink === 'function') remote.startPerkDrink(perkId);
    this.onRemotePerkDrink?.(remote, perkId);
    return true;
  }

  // ---------------- persona voice barks ----------------
  bark(event, { force = false, chance = 1 } = {}) {
    if (this.over || this.disposed) return;
    if (this.barkCd > 0 && !force) return;
    if (!force && Math.random() > chance) return;
    const n = variantCount(this.personaIdx, event);
    if (!n) return;
    const v = Math.floor(Math.random() * n);
    this.barkCd = force ? 5 : 16;
    this.playBark(this.personaIdx, event, v);
    this.netSend({ t: 'bark', p: this.personaIdx, e: event, v, pid: this.player.id });
  }

  playBark(pIdx, event, variant, pos = null) {
    const line = lineFor(pIdx, event, variant);
    if (!line) return;
    const buf = assets.sound(line.file);
    if (buf) {
      // character speech rides the SFX bus at full presence — a spoken line is
      // ALWAYS heard (never gated by the zombie-voices slider); teammates positional
      audio.playBuffer(buf, 'vox', { bus: 'sfx', vol: 1.8, pos, refDist: 10, maxDist: 70 });
      if (!pos) this.barkCd = Math.max(this.barkCd, buf.duration + 4); // only my own lines throttle me
    }
    this.hud.voxSub(`${line.persona.label}: ${line.text}`);
  }

  // ---------------- zombie->player damage ----------------
  onZombieDamagePlayer(pid, dmg, x, z) {
    if (pid === this.player.id) {
      this.player.damage(dmg, this);
      return;
    }
    const bot = this.bots?.find((b) => b.id === pid);
    if (bot && !bot.down && !bot.dead) {
      bot.hp -= dmg;
      audio.play('hurt');
      if (bot.hp <= 0) {
        bot.hp = 0; bot.down = true; bot.downs++;
        bot.bleedout = CFG.BLEEDOUT_TIME;
        this.botBark(bot, 'down', 0.9);
        this.netSend({ t: 'down', pid: bot.id });
      }
      return;
    }
    this.netSend({ t: 'pdmg', pid, dmg, x, z });
  }

  onPlayerDown(player) {
    this.netSend({ t: 'down', pid: player.id });
    if (player === this.player) {
      this._beingRevived = null; // fresh down — nobody is coming for you yet
      this.bark('down', { force: true });
    }
    if (this.mode === 'solo' && !player.selfReviveAvailable) {
      // solo without quick revive = instant death
      setTimeout(() => { if (player.down && !this.disposed) player.die(this); }, 1200);
    }
  }

  onPlayerDead(player) {
    this.netSend({ t: 'dead', pid: player.id });
    if (player === this.player) this._beingRevived = null;
    if (this.mode !== 'solo') this.pickSpectate();
  }

  respawnSelf() {
    // back from the dead at the new round: full hp, starting pistol, perks gone
    const p = this.player;
    p.dead = false; p.down = false;
    p.bleedout = 0;
    p.weapons = [{ id: 'm1911', pap: false, mag: 8, reserve: 80 }];
    p.cur = 0;
    p.perks.clear();
    p.hp = p.maxHpNow; // after the perk wipe — plain 100, no leftover Jug health
    p.grenades = 2; p.monkeys = 0; p.ownsMonkeys = false;
    p.adsT = 0; p.recoilPitch = 0; p.spreadBloom = 0; p.sprinting = false;
    p.downEase = 0; // stand up instantly here — the teleport hides the cut
    this._deathCamHeld = false; // release the frozen death pose
    this._beingRevived = null;
    this.spectateTarget = null;
    this.syncSpectateView();
    const spawnBase = this.map.playerSpawns[0];
    p.x = spawnBase.x + rand(-1, 1); p.z = spawnBase.z + rand(-1, 1);
    p.y = this.map.floorY(p.x, p.z, 2); // settle onto the platform surface
    p.yaw = 0;
    this.weaponRig.papHide = false;
    this.weaponRig.equip('m1911', false);
    this.camera.fov = clamp(Number(this.options.fov) || 90, 70, 110);
    this.onResize();
    this.hud.downUI(false);
    this.hud.setPerks(p.perks);
    this.hud.setGrenades(p.grenades, p.monkeys);
    this.hud.banner('BACK IN THE FIGHT', '#7ee38a', 'Make it count this time');
    audio.play('revive');
    this.netSend({ t: 'respawn', pid: p.id });
  }

  applyRevive(pid, byPid) {
    const bot = this.bots?.find((b) => b.id === pid);
    if (bot) { bot.down = false; bot.hp = bot.maxHp; return; }
    if (pid === this.player.id) {
      this.player.revive(true, this);
      this._beingRevived = null;
      this.hud.downUI(false);
      this.hud.reviveUI(false);
      this.spectateTarget = null;
      this.syncSpectateView();
    }
    const rp = this.remotePlayers.get(pid);
    if (rp) {
      rp.down = false;
      // hand the real loadout back to the authoritative record
      if (rp._downStash) { rp.authorizeWeapon(rp._downStash.id, rp._downStash.pap, false); rp._downStash = null; }
    }
    if (byPid === this.player.id) {
      this.player.revives++; this.bark('revive', { force: true });
      this.awardPoints(0);
    }
  }

  perkCount(id) { return this.player.perks.has(id) ? 1 : 0; }

  _playerEvent(msg, from) {
    const p = this.player;
    switch (msg.t) {
      case 'bark': {
        const rp = msg.pid ? this.remotePlayers.get(msg.pid) : null;
        if (msg.pid && !rp) break; // unknown source — never a full-volume phantom line
        const pos = rp ? { x: rp.x, y: rp.y + 1.5, z: rp.z } : null;
        this.playBark(msg.p ?? 0, msg.e, msg.v ?? 0, pos);
        break;
      }
      case 'perk_anim': {
        // Sanitized host relay. The purchaser already started its first-person
        // animation locally, so ignore the echoed event for that same player.
        if (typeof msg.pid === 'string' && msg.pid !== p.id) this.startRemotePerkDrink(msg.pid, msg.id);
        break;
      }
      case 'perk': break; // legacy perk ownership cosmetic; animation uses perk_anim
      case 'pdmg': {
        if (msg.pid === p.id) p.damage(msg.dmg, this);
        break;
      }
      case 'down': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) {
          rp.down = true; rp.perks = [];
          // A downed player fights with the starting sidearm only. Record that
          // here rather than trusting a swap packet: the host validates shot
          // claims against this, so without it a player who had traded the
          // M1911 away would fire a pistol locally and do nothing in co-op.
          rp._downStash = { id: rp.weaponId, pap: rp.weaponPap };
          rp.authorizeWeapon('m1911', false, false);
        }
        if (msg.pid !== p.id) this.hud.banner(`${(this.remotePlayers.get(msg.pid)?.name || 'TEAMMATE').toUpperCase()} IS DOWN`, '#ff9944');
        break;
      }
      case 'dead': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) { rp.dead = true; rp.down = false; rp._downStash = null; }
        if (msg.pid === p.id) this._beingRevived = null;
        break;
      }
      case 'revive_start': {
        // Cosmetic-only state, but still worth a sanity check so a peer cannot
        // paint a phantom rescue on someone who is not even down.
        const target = msg.pid === p.id ? p : this.remotePlayers.get(msg.pid);
        if (!target?.down || target.dead) break;
        if (msg.pid === p.id) {
          const known = this.remotePlayers.get(msg.by)?.name;
          this._beingRevived = {
            by: known || 'A TEAMMATE',
            at: this.time,
            need: clamp(Number(msg.need) || CFG.REVIVE_TIME, 0.5, 10),
          };
          audio.play('ui');
        }
        if (this.isAuthority) this.netSend(msg); // relay to the rest of the squad
        break;
      }
      case 'revive_stop': {
        if (msg.pid === p.id) this._beingRevived = null;
        if (this.isAuthority) this.netSend(msg);
        break;
      }
      case 'respawn': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) {
          rp.dead = false; rp.down = false;
          if (this.isAuthority) {
            rp.setAuthoritativeLoadout([{ id: 'm1911', pap: false }]);
            rp.spawnWeaponAllowance = new Map([['m1911', false]]);
            rp.bowie = false;
          }
        }
        // A client announces its own respawn to the host; the host must relay
        // that authoritative identity to every other client as well.
        if (this.isAuthority) this.netSend(msg);
        break;
      }
      case 'revive_done': {
        this.applyRevive(msg.pid, msg.by);
        if (this.isAuthority) this.netSend(msg); // relay to others
        break;
      }
      case 'revive_req': {
        if (!this.isAuthority || msg.pid === from) break;
        const reviver = this.remotePlayers.get(from);
        const target = msg.pid === p.id ? p : this.remotePlayers.get(msg.pid);
        if (!reviver || reviver.down || reviver.dead || !target?.down || target.dead
            || !this._remoteNearVisible(from, target, 2.8)) break;
        this.applyRevive(msg.pid, from);
        this.netSend({ t: 'revive_done', pid: msg.pid, by: from });
        break;
      }
      case 'revive_self': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) rp.down = false;
        break;
      }
    }
  }
}
