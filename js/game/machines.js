// Game's power-gated machines: the power switch, teleporters and
// electro-shock traps.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { rand, dist2D } from '../utils.js';
import { audio } from '../audio.js';
import { ZSTATES } from '../zombies.js';

export class GameMachines {
  // ---------------- traps ----------------
  updateTraps(dt) {
    for (const trap of this.map.traps) {
      trap.cd = Math.max(0, trap.cd - dt);
      if (trap.active) {
        trap.t -= dt;
        if (Math.random() < dt * 10) {
          this.fx.lightning([
            { x: trap.x - 1.1, y: rand(0.5, 2.2), z: trap.z },
            { x: trap.x + 1.1, y: rand(0.5, 2.2), z: trap.z },
          ]);
          audio.play('trap', { pos: { x: trap.x, y: 1.2, z: trap.z }, refDist: 4, maxDist: 18, vol: 0.82 });
        }
        for (const [, z] of this.zombies.zombies) {
          if (z.state === ZSTATES.DIE) continue;
          if (z.x > trap.zone.minX && z.x < trap.zone.maxX && z.z > trap.zone.minZ && z.z < trap.zone.maxZ) {
            this.zombies.kill(z, { by: null });
            this.fx.spawnParticles(z.x, z.y + 1, z.z, { count: 10, color: [0.5, 0.75, 1], speed: 2.5, life: 0.4, size: 1.4 });
          }
        }
        // players take heavy damage in trap
        if (this.player.x > trap.zone.minX && this.player.x < trap.zone.maxX && this.player.z > trap.zone.minZ && this.player.z < trap.zone.maxZ && !this.player.down) {
          if (!this._trapHurtT || this.time - this._trapHurtT > 0.8) { this._trapHurtT = this.time; this.player.damage(60, this); }
        }
        if (trap.t <= 0) { trap.active = false; trap.cd = 45; this.netSend({ t: 'trap_off', id: trap.id }); }
      }
    }
  }

  // ---------------- power / teleporters ----------------
  setPower(on) {
    this.map.power.on = on;
    if (on) {
      audio.play('power', { pos: this.map.power.pos, maxDist: 60 });
      this.map.power.lever.rotation.x = 0.7;
      // Ramp the practicals up rather than snapping them. Ten lamps going
      // 0 -> 9 in a single frame is a hard step for the light pool to absorb
      // and it reads as a pop; over a few hundred milliseconds it reads as
      // current reaching the building. Staggered so they do not all strike at
      // once, which is also how a real sub-station comes back.
      const lamps = this.map.perks.map((perk) => perk.lamp);
      this._perkLampRamp = { lamps, t: 0, delays: lamps.map((_, i) => i * 0.11) };
      for (const lamp of lamps) lamp.intensity = 0;
      // power-sealed doors (corridor shortcuts + balcony bridge) open automatically
      for (const d of this.map.doors) if (d.auto && !d.open) this.openDoor(d);
      this.hud.banner('POWER ON', '#ffd24a');
      this.bark('power', { force: true });
    }
  }

  teleUse(tele) {
    if (!this.map.power.on || tele.charging || tele.cooldown > 0) return;
    // Charging and cooldown are different states. The old implementation set
    // the recharge timer before the 2.5s use animation even began, so the first
    // successful activation immediately (and incorrectly) read RECHARGING.
    tele.charging = true;
    if (!this.isAuthority) this.netSend({ t: 'tele_req', id: tele.id });
    audio.play('tele_charge', { pos: tele });
    // swirl particles during charge
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        if (this.disposed) return;
        this.fx.spawnParticles(tele.x + rand(-1, 1), tele.y + rand(0.2, 2.2), tele.z + rand(-1, 1), { count: 2, color: [0.4, 0.7, 1], speed: 0.6, life: 0.5, grav: -2, size: 1.2 });
      }, i * 80);
    }
    setTimeout(() => {
      if (this.disposed) return;
      tele.charging = false;
      tele.cooldown = 18;
      // teleport all players on the pad
      const onPad = [{ me: true, x: this.player.x, z: this.player.z }].filter((pl) => dist2D(pl.x, pl.z, tele.x, tele.z) < 2.0);
      if (onPad.length) {
        this.player.x = this.map.mainframe.x + rand(-1, 1);
        this.player.z = this.map.mainframe.z + rand(0, 1);
        this.player.y = this.map.floorY(this.player.x, this.player.z, 2); // arrive ON the pad platform
        this.fx.screenFlash('#bfd9ff', 300, 0.8);
        audio.play('teleport', { pos: tele });
        this.fx.shake(0.3);
      }
      this.fx.spawnParticles(tele.x, tele.y + 1.5, tele.z, { count: 24, color: [0.5, 0.8, 1], speed: 3, life: 0.6, grav: -1, size: 1.6 });
      this.fx.spawnParticles(this.map.mainframe.x, 1.5, this.map.mainframe.z, { count: 24, color: [0.5, 0.8, 1], speed: 3, life: 0.6, grav: -1, size: 1.6 });
      if (this.isAuthority) {
        this.linkTeleporter(tele);
        this.netSend({ t: 'tele', id: tele.id });
      }
    }, 2500);
  }

  linkTeleporter(tele) {
    if (tele.linked) return;
    tele.linked = true;
    this.teleLinks++; this.bark('tele', { chance: 0.9 });
    if (this.teleLinks >= 3) {
      this.hud.banner('PACK-A-PUNCH AVAILABLE', '#c9a2ff', 'All three teleporters are linked');
      audio.play('pap_done');
      this.netSend({ t: 'pap_door' });
    } else {
      this.hud.banner(`TELEPORTER LINKED ${this.teleLinks}/3`, '#7ec8e3');
    }
    this.netSend({ t: 'tele_link', id: tele.id });
  }

  activateTrap(t) {
    t.active = true;
    t.t = 25;
    audio.play('trap', { pos: { x: t.x, y: 1.2, z: t.z }, refDist: 4, maxDist: 18, vol: 0.9 });
  }

  _machineEvent(msg, from) {
    switch (msg.t) {
      case 'power': this.setPower(true); break;
      case 'power_req': {
        if (this.isAuthority && !this.map.power.on && this._remoteNearVisible(from, this.map.power.pos, 3)) {
          this.setPower(true);
          this.netSend({ t: 'power' });
        }
        break;
      }
      case 'tele': {
        const tele = this.map.teleporters.find((t) => t.id === msg.id);
        if (tele) {
          tele.charging = false;
          tele.cooldown = 18;
          audio.play('teleport', { pos: tele });
        }
        break;
      }
      case 'tele_req': {
        if (!this.isAuthority || !this.map.power.on) break;
        const tele = this.map.teleporters.find((t) => t.id === msg.id);
        if (!tele || tele.charging || tele.cooldown > 0 || !this._remoteNearVisible(from, tele, 3)) break;
        tele.charging = true;
        audio.play('tele_charge', { pos: tele });
        setTimeout(() => {
          if (this.disposed) return;
          tele.charging = false;
          tele.cooldown = 18;
          this.linkTeleporter(tele);
          this.netSend({ t: 'tele', id: tele.id });
        }, 2500);
        break;
      }
      case 'tele_link': {
        const tele = this.map.teleporters.find((t) => t.id === msg.id);
        if (tele && !tele.linked) {
          tele.linked = true;
          this.teleLinks = this.map.teleporters.filter((t) => t.linked).length;
          if (this.teleLinks < 3) this.hud.banner(`TELEPORTER LINKED ${this.teleLinks}/3`, '#7ec8e3');
        }
        break;
      }
      case 'trap_on': {
        const t = this.map.traps.find((tt) => tt.id === msg.id);
        if (t) this.activateTrap(t);
        break;
      }
      case 'trap_req': {
        if (!this.isAuthority || !this.map.power.on) break;
        const trap = this.map.traps.find((t) => t.id === msg.id);
        if (trap && !trap.active && trap.cd <= 0 && this._remoteNearVisible(from, trap, 3)) {
          this.activateTrap(trap);
          this.netSend({ t: 'trap_on', id: trap.id });
        }
        break;
      }
      case 'trap_off': {
        const t = this.map.traps.find((tt) => tt.id === msg.id);
        if (t) { t.active = false; t.cd = 45; }
        break;
      }
    }
  }
}
