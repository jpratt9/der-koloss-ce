// Game's bot actions. Unreachable: the CPU squad bots were removed and
// this.bots is always empty.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { clamp, rand, dist2D } from '../utils.js';
import { audio } from '../audio.js';
import { variantCount } from '../personas.js';
import { buildMonkey } from '../weapons.js';

export class GameBots {
  // ---------------- bot actions (authority) ----------------
  botFire(bot, z) {
    const s = bot.stats;
    if (!s || bot.weapon.mag <= 0) return;
    bot.weapon.mag--;
    audio.play(s.sfx, { pos: { x: bot.x, y: bot.y + 1.5, z: bot.z }, vol: 0.8 });
    const d = dist2D(bot.x, bot.z, z.x, z.z);
    const acc = clamp(0.9 - d * 0.011, 0.3, 0.9) * (this.zombies.instakill ? 1 : 1);
    if (Math.random() > acc) { this.fx.tracer(bot.x, bot.y + 1.45, bot.z, z.x + rand(-1, 1), z.y + 1.2, z.z + rand(-1, 1), 0xffd9a0); return; }
    const head = Math.random() < 0.22;
    const dmg = s.dmg * (head ? s.headMult : 1) * (this.zombies.instakill ? 100 : 1);
    this.fx.tracer(bot.x, bot.y + 1.45, bot.z, z.x, z.y + (head ? 1.5 : 1.0), z.z, 0xffd9a0);
    const res = this.zombies.damage(z.id, dmg, { head, by: bot.id, weapon: s, pap: bot.weapon.pap });
    if (res.ok && res.killed) { bot.kills++; bot.points += head ? 100 : 60; }
  }

  botMelee(bot, z) {
    if ((bot.meleeCd || 0) > this.time) return;
    bot.meleeCd = this.time + 0.7;
    audio.play('melee');
    const res = this.zombies.damage(z.id, bot.bowie ? 1000 : 150, { head: false, by: bot.id, weapon: { headMult: 1 } });
    if (res.ok && res.killed) { bot.kills++; bot.points += 130; }
  }

  botRevive(bot, target) {
    const pl = this.allPlayerStates().find((p) => p.id === target.id);
    if (!pl || !pl.down) return;
    if (target.id === this.player.id) {
      this.player.down = false; this.player.hp = this.player.maxHpNow;
    } else {
      const rp = this.remotePlayers.get(target.id);
      if (rp) { rp.down = false; }
      const b2 = this.bots.find((b) => b.id === target.id);
      if (b2) { b2.down = false; b2.hp = b2.maxHp; }
    }
    bot.revives++;
    audio.play('revive');
    this.netSend({ t: 'revive', pid: target.id });
  }

  botUsePower(bot) {
    if (this.map.power.on) return;
    this.setPower(true);
    this.netSend({ t: 'power' });
    this.botBark(bot, 'power', 0.9);
  }

  botUseBox(bot) {
    const bs = this.boxState;
    if (bs.state !== 'idle' || !bot.spend(950)) return;
    audio.play('buy');
    this.boxStartSpin(bot.weapons.map((w) => w.id));
    // bot takes whatever comes up when ready
    bot._takeBoxT = 4.6;
  }

  botLinkTele(bot, tele) {
    if (this.teleLinks >= 3) return;
    this.linkTeleporter(tele);
    this.botBark(bot, 'tele', 0.8);
  }

  botThrowMonkey(bot) {
    audio.play('monkey_windup');
    const dir = { x: Math.sin(bot.yaw), z: Math.cos(bot.yaw) };
    const e = {
      kind: 'monkey', x: bot.x, y: bot.y + 1.4, z: bot.z,
      vx: dir.x * 10, vy: 4, vz: dir.z * 10, fuse: 8, mesh: null, by: bot.id,
    };
    e.mesh = buildMonkey();
    e.mesh.scale.setScalar(1.15);
    e.clashT = 0;
    e.mesh.position.set(e.x, e.y, e.z);
    this.scene.add(e.mesh);
    this.grenades.push(e);
  }

  botDied(bot) {
    this.netSend({ t: 'dead', pid: bot.id });
  }

  botBark(bot, event, chance = 1) {
    if (Math.random() > chance) return;
    const n = variantCount(bot.personaIdx, event);
    if (!n) return;
    this.playBark(bot.personaIdx, event, Math.floor(Math.random() * n), { x: bot.x, y: bot.y + 1.5, z: bot.z });
    this.netSend({ t: 'bark', p: bot.personaIdx, e: event, v: Math.floor(Math.random() * n), pid: bot.id });
  }
}
