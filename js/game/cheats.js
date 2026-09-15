// Game's cheat codes: the menu toggles, applied once at spawn.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { choice } from '../utils.js';
import { getStats, WEAPONS, BOX_POOL } from '../weapons.js';

export class GameCheats {
  // ---------------- cheat codes (menu toggles) ----------------
  applyCheats() {
    const c = this.cheats, p = this.player;
    if (!c || !p) return;
    if (c.warbond) { p.points = 50000; this.hud.setPoints(p.points); }
    if (c.perkaholic) {
      for (const k of ['jug', 'speed', 'dtap', 'qr']) p.perks.add(k);
      // Buying Jugg raises hp as well as maxHp (see the drink handler). Granting
      // the perk alone left the player spawning at 165/250 — a red health bar
      // and a damage pulse on frame one, for a cheat that is meant to be a gift.
      p.hp = p.maxHpNow;
      this.hud.setPerks(p.perks);
    }
    // Set BEFORE anything equips a weapon. equip() decides the finish at build
    // time — gold for a stock gun, diamond for a Pack-a-Punched one — so a flag
    // raised after the spawn guns were built used to leave them gold, breaking
    // the "Pack-a-Punch turns it to diamond" promise and stacking a second set
    // of material clones on top of the first.
    if (c.goldguns) {
      this.weaponRig.alwaysGold = true;
      this.weaponRig.setKnifeGold(true);
    }
    if (c.opensesame) {
      for (const d of this.map.doors) {
        if (!d.open && (d.cost != null || d.auto)) this.openDoor(d);
      }
    }
    if (c.papguns) {
      p.bowie = true;
      this.weaponRig.setKnifeGold(true);
      const pool = BOX_POOL.filter((id) => id !== 'panzerschreck' && id !== 'bowie' && id !== 'monkey');
      const picks = new Set();
      // Bounded by the pool as well as the target. choice([]) returns undefined,
      // so a pool that ever shrank below 2 would spin this loop forever — a hard
      // tab freeze with no error to point at. It is 22 today; the guard is free.
      while (picks.size < 2 && picks.size < pool.length) picks.add(choice(pool));
      p.weapons = [...picks].map((id) => {
        const s = getStats(id, true);
        return { id, pap: true, mag: s.mag, reserve: s.reserve };
      });
      p.cur = 0;
      this.weaponRig.equip(p.weapon.id, p.weapon.pap);
      this.hud.setAmmo(p.weapon.mag, p.weapon.reserve, getStats(p.weapon.id, true).displayName);
    }
    if (c.wunder) {
      // WUNDERWAFFEN: Ray Gun + DG-2 in hand, two monkeys on the belt
      p.weapons = ['raygun', 'dg2'].map((id) => {
        const s = getStats(id, c.papguns ? true : false);
        return { id, pap: !!c.papguns, mag: s.mag, reserve: s.reserve };
      });
      p.cur = 0;
      p.monkeys = 2;
      p.ownsMonkeys = true;
      this.hud.setGrenades(p.grenades, p.monkeys);
      this.weaponRig.equip(p.weapon.id, p.weapon.pap);
      this.hud.setAmmo(p.weapon.mag, p.weapon.reserve, getStats(p.weapon.id, p.weapon.pap).displayName);
      this.hud.banner('WUNDERWAFFEN', '#7ec8e3', 'Ray Gun + DG-2 · X throws Monkey Bombs');
    }
    // A loadout is persisted in localStorage and can also arrive from the host,
    // so it can name a weapon this build does not have. Drop unknown ids here
    // rather than spawning a gun with no model.
    const loadoutIds = [c.loadout?.p1, c.loadout?.p2].filter((id) => id && WEAPONS[id]);
    if (!c.papguns && !c.wunder && loadoutIds.length) {
      // CUSTOM LOADOUT: spawn with exactly the chosen guns
      const ids = loadoutIds;
      p.weapons = ids.map((id) => {
        const s = getStats(id, false);
        return { id, pap: false, mag: s.mag, reserve: s.reserve };
      });
      p.cur = 0;
      this.weaponRig.equip(p.weapon.id, false);
      this.hud.setAmmo(p.weapon.mag, p.weapon.reserve, getStats(p.weapon.id, false).displayName);
      this.hud.banner('CUSTOM LOADOUT', '#7ec8e3', p.weapons.map((w) => WEAPONS[w.id]?.name).filter(Boolean).join(' + '));
    }
    // Only the starting M1911 needs dressing by hand — it was equipped during
    // init, before alwaysGold was raised. Every branch above re-equips, and
    // equip() applies the right finish itself.
    if (c.goldguns && !c.papguns && !c.wunder && !loadoutIds.length) this.weaponRig.applyGoldCamo(true);
    if (c.god) this.godMode = true;
    if (c.power) setTimeout(() => { if (!this.disposed) this.setPower(true); }, 300); // staggered: not everything at t=0
    if (c.tele) {
      for (const tp of this.map.teleporters) tp.linked = true;
      this.teleLinks = 3;
      this.hud.banner('TELEPORTERS LINKED', '#7ec8e3');
    }
    // spawn config: start round + area. Non-default starts are testing/explore
    // shortcuts, so open the smallest route back to Mainframe as well. Without
    // this, spawning behind the normal progression doors can strand the player.
    // Clamped to the same 1-40 the menu spinner allows. In co-op these cheats
    // are the HOST's, so this value arrives over the wire and is only bounded by
    // the generic payload validator (|n| <= 1e7) — round 1e7 is not a crash, but
    // zombie health scales past 1e9 and the run is unplayable on arrival.
    const startRound = Math.max(1, Math.min(40, Math.trunc(Number(c.startRound)) || 1));
    if (startRound > 1) this.round = startRound - 1;
    const AREAS = {
      courtyard: { x: 0, z: -32, route: ['d_pwrR', 'd_mainR'] },
      factory: { x: 0, z: -48, route: ['d_fact', 'd_pwrR', 'd_mainR'] },
      teleA: { x: -38, z: -13, route: ['d_gen', 'd_mainL'] },
      chem: { x: 17, z: -30, y: 2.9, route: ['d_chem', 'd_mainR'] },
    };
    if (c.startArea && AREAS[c.startArea]) {
      const a = AREAS[c.startArea];
      p.x = a.x; p.z = a.z; p.y = a.y || 0;
      for (const id of a.route) {
        const door = this.map.doors.find((d) => d.id === id);
        if (door && !door.open) this.openDoor(door);
      }
    }
  }
}
