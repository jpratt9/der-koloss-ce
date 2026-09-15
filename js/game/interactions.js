// Game's interactions: prompts and holds, revives, doors, wall-buys, perks,
// barriers, the record and the radio.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { CFG } from '../config.js';
import { clamp, dist2D } from '../utils.js';
import { interactionLineClear } from '../interaction-rules.js';
import { teleporterPromptState } from '../map-layout.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { getStats } from '../weapons.js';
import { consumeBoardCredit } from '../multiplayer-contracts.js';

const INTERACT_HOLD = { power: 0.8, tele: 0.8, pap: 0.5, revive: 3, barrier: 0 };

export class GameInteractions {
  // ---------------- interactions ----------------
  interactionVisibleFrom(x, y, z, target, endpointTolerance = 0.9) {
    if (!target) return false;
    return interactionLineClear(
      { x: Number(x), y: Number(y), z: Number(z) },
      { x: Number(target.x), y: Number(target.y ?? 1.1), z: Number(target.z) },
      this.map.colliders,
      endpointTolerance,
    );
  }

  // What the DOWNED player knows about their own rescue. A single revive_start
  // packet carries the reviver and how long they need; progress is estimated
  // locally from there rather than streamed, which keeps one message per
  // attempt instead of ~10/s against the reliable-channel cap. The timeout is
  // the safety net: if the reviver's stop packet is dropped, the bar must not
  // sit there full forever promising a rescue that is not coming.
  beingRevivedState() {
    const b = this._beingRevived;
    if (!b) return null;
    const elapsed = this.time - b.at;
    if (elapsed > b.need + 0.75) { this._beingRevived = null; return null; }
    return { by: b.by, frac: clamp(elapsed / b.need, 0, 1) };
  }

  // Tell the target we have stopped, whatever the reason we stopped.
  _endReviveAnnounce() {
    if (!this._reviveAnnounced) return;
    this.netSend({ t: 'revive_stop', pid: this._reviveAnnounced, by: this.player.id });
    this._reviveAnnounced = null;
  }

  updateInteract(dt) {
    const p = this.player;
    if (p.dead) { this._endReviveAnnounce(); this.hud.prompt(null); this.hud.reviveUI(false); return; }

    // downed: show bleedout / self revive / who is picking you up
    if (p.down) {
      this._endReviveAnnounce();
      this.hud.prompt(null);
      const selfR = this.mode === 'solo' && p.selfReviveAvailable && this.qrSelfRevives > 0;
      const br = this.beingRevivedState();
      this.hud.downUI(true, p.bleedout / CFG.BLEEDOUT_TIME, br ? `BEING REVIVED BY ${br.by.toUpperCase()}` : false, selfR, this.mode !== 'solo');
      // The overlay headline already names the reviver; this bar carries the
      // progress, so it gets a complementary label rather than the same words.
      if (selfR) this.hud.reviveUI(true, 'REVIVING YOURSELF…', p.selfReviveT / 8);
      else if (br) this.hud.reviveUI(true, 'HOLD STILL', br.frac);
      else this.hud.reviveUI(false);
      return;
    }
    this.hud.downUI(false);
    if (this.localPerkDrink) {
      this._endReviveAnnounce();
      this.holdF = 0;
      this.hud.prompt(null);
      this.hud.reviveUI(false);
      return;
    }

    // revive nearby downed teammates
    let reviveTarget = null;
    for (const [, rp] of this.remotePlayers) {
      if (rp.down && dist2D(p.x, p.z, rp.x, rp.z) < 2.2
          && this.interactionVisibleFrom(p.x, p.y + 1.25, p.z, { x: rp.x, y: rp.y + 0.7, z: rp.z })) { reviveTarget = rp; break; }
    }
    if (reviveTarget) {
      const need = this.player.perks.has('qr') ? CFG.QR_REVIVE_TIME : CFG.REVIVE_TIME;
      if (input.keys['KeyF']) {
        // Announce once, on the rising edge, so the player on the floor can
        // see that help has actually arrived. Without this they get no signal
        // at all until the revive either lands or silently doesn't.
        if (this._reviveAnnounced !== reviveTarget.id) {
          this._endReviveAnnounce();
          this._reviveAnnounced = reviveTarget.id;
          this.netSend({ t: 'revive_start', pid: reviveTarget.id, by: p.id, need });
        }
        this.holdF += dt;
        if (this.holdF >= need) {
          this.holdF = 0;
          this._reviveAnnounced = null; // revive_done implies the hold ended
          this.netSend({ t: this.isAuthority ? 'revive_done' : 'revive_req', pid: reviveTarget.id, by: p.id });
          if (this.isAuthority) this.applyRevive(reviveTarget.id, p.id);
        }
      } else { this._endReviveAnnounce(); this.holdF = 0; }
      // The dedicated revive UI owns progress. Keep the interaction prompt as
      // text-only so the same revive action never renders two progress bars.
      this.hud.prompt(`Hold <b>F</b> — revive ${escapeHtml(reviveTarget.name)}`);
      this.hud.reviveUI(this.holdF > 0, `REVIVING ${reviveTarget.name.toUpperCase()}`, this.holdF / need);
      return;
    } else if (!p.down) {
      this._endReviveAnnounce(); // walked away mid-hold
      this.hud.reviveUI(false);
    }

    // barrier rebuild
    let barrier = null, bd = 2.4;
    for (const b of this.map.barriers) {
      if (b.boards >= b.maxBoards) continue;
      const d = dist2D(p.x, p.z, b.x, b.z);
      if (d < bd && this.interactionVisibleFrom(p.x, p.y + 1.25, p.z, { x: b.x, y: b.y ?? 1.2, z: b.z })) { bd = d; barrier = b; }
    }

    // scan interactables
    let best = null, bestD = 1e9;
    for (const it of this.map.interact) {
      const d = dist2D(p.x, p.z, it.pos.x, it.pos.z);
      if (d > it.radius) continue;
      if (it.pos.y !== undefined && Math.abs((p.y + 1.2) - it.pos.y) > 2.4) continue; // different level
      if (it.kind !== 'door' && !this.interactionVisibleFrom(p.x, p.y + 1.25, p.z, it.pos)) continue;
      if (d < bestD) { bestD = d; best = it; }
    }

    // choose barrier vs interactable
    if (barrier && (!best || bd < bestD)) {
      if (input.keys['KeyF'] && this.player.points >= 0) {
        this.holdF += dt;
        if (this.holdF >= 0.4) {
          this.holdF = 0;
          this.rebuildBoard(barrier);
        }
      } else this.holdF = 0;
      this.hud.prompt(`Hold <b>F</b> — rebuild barrier <span class="pts">+10</span>`, this.holdF / 0.4);
      return;
    }

    if (!best) { this.hud.prompt(null); this.holdF = 0; return; }
    const info = this.interactInfo(best);
    if (!info) { this.hud.prompt(null); this.holdF = 0; return; }
    this.hud.prompt(info.text, info.hold ? this.holdF / info.hold : null);
    if (info.hold) {
      if (input.keys['KeyF']) {
        this.holdF += dt;
        if (this.holdF >= info.hold) { this.holdF = 0; this.doInteract(best); }
      } else this.holdF = 0;
    } else {
      if (input.pressed['KeyF']) this.doInteract(best);
    }
  }

  interactInfo(it) {
    const p = this.player;
    const pts = (n) => `<span class="pts">[${n}]</span>`;
    switch (it.kind) {
      case 'door': {
        if (it.door.open) return null;
        if (it.door.id === 'd_pap') {
          return this.teleLinks >= 3 ? null : { text: 'This door is sealed by a strange mechanism…' };
        }
        return { text: `Press <b>F</b> — open door ${pts(it.door.cost)}`, hold: null };
      }
      case 'wallbuy': {
        const wb = it.wb;
        const s = getStats(wb.weapon, false);
        const owned = p.weapons.find((w) => w.id === wb.weapon);
        if (owned) {
          const cost = Math.floor(wb.price / 2);
          const full = owned.reserve >= s.reserve;
          return full ? { text: `${s.name} — ammo full` } : { text: `Press <b>F</b> — buy ammo ${pts(cost)}` };
        }
        return { text: `Press <b>F</b> — buy ${s.name} ${pts(wb.price)}` };
      }
      case 'perk': {
        const perk = it.perk;
        if (p.perks.has(perk.id) || this.localPerkDrink) return null;
        if (perk.id !== 'qr' && !this.map.power.on) return { text: `${perk.name} — no power` };
        if (perk.id === 'qr' && this.mode === 'solo') {
          if (this.qrSelfRevives <= 0) return { text: 'Quick Revive is depleted' };
          return { text: `Press <b>F</b> — Quick Revive ${pts(500)} <span class="dim">(${this.qrSelfRevives} left)</span>` };
        }
        return { text: `Press <b>F</b> — ${perk.name} ${pts(perk.price)}` };
      }
      case 'box': {
        const bs = this.boxState;
        if (bs.state === 'idle') return { text: `Press <b>F</b> — mystery box ${pts(950)}` };
        if (bs.state === 'ready') return { text: `Press <b>F</b> — take ${getStats(bs.weapon, false).name}` };
        return { text: '…' };
      }
      case 'pap': {
        if (this.teleLinks < 3) return { text: 'The machine is dormant…' };
        if (this.papState.busy) return { text: this.papState.ready && this.papState.owner === p.id ? 'Press <b>F</b> — take upgraded weapon' : 'Upgrading…' };
        // Offering an upgrade you cannot buy is a worse prompt than no prompt:
        // the player presses F, nothing happens, and the machine looks broken.
        if (p.weapon?.pap) return { text: `${getStats(p.weapon.id, true).name} is already upgraded` };
        return { text: `Hold <b>F</b> — Pack-a-Punch ${pts(5000)}`, hold: 0.4 };
      }
      case 'power': {
        if (this.map.power.on) return null;
        return { text: 'Hold <b>F</b> — turn on the power', hold: INTERACT_HOLD.power };
      }
      case 'tele': {
        const t = it.tele;
        const state = teleporterPromptState({ powerOn: this.map.power.on, charging: t.charging, cooldown: t.cooldown });
        if (state === 'no-power') return { text: 'The teleporter has no power' };
        if (state === 'charging') return { text: 'Teleporter charging… stand on the pad' };
        if (state === 'recharging') return { text: `Teleporter recharging… ${Math.ceil(t.cooldown)}s` };
        return { text: `Hold <b>F</b> — use teleporter`, hold: INTERACT_HOLD.tele };
      }
      case 'trap': {
        const t = it.trap;
        if (!this.map.power.on) return { text: 'No power' };
        if (t.active) return { text: 'Trap active!' };
        if (t.cd > 0) return { text: `Trap recharging… ${Math.ceil(t.cd)}s` };
        return { text: `Press <b>F</b> — activate electro-shock defense ${pts(1000)}` };
      }
      case 'song': {
        return { text: audio.songPlaying ? 'Press <b>F</b> — stop the record' : 'Press <b>F</b> — play the record' };
      }
      case 'radio': {
        return { text: 'Press <b>F</b> — play the old radio' };
      }
    }
    return null;
  }

  doInteract(it) {
    const p = this.player;
    switch (it.kind) {
      case 'door': {
        if (it.door.open || it.door.id === 'd_pap') return;
        if (!p.spend(it.door.cost)) { audio.play('deny'); return; }
        audio.play('buy');
        this.hud.setPoints(p.points);
        this.openDoor(it.door);
        this.netSend({ t: this.isAuthority ? 'door' : 'door_req', id: it.door.id });
        break;
      }
      case 'wallbuy': {
        const wb = it.wb;
        const owned = p.weapons.find((w) => w.id === wb.weapon);
        if (owned) {
          const cost = Math.floor(wb.price / 2);
          const s = getStats(owned.id, owned.pap);
          if (owned.reserve >= s.reserve) return;
          if (!p.spend(cost)) { audio.play('deny'); return; }
          owned.reserve = s.reserve;
          audio.play('buy');
        } else {
          if (!p.spend(wb.price)) { audio.play('deny'); return; }
          audio.play('buy');
          p.giveWeapon(wb.weapon, false);
          this.weaponRig.equip(wb.weapon, false);
          this._revealAcquiredWeapon();
          this.netSend({ t: 'swap', w: wb.weapon, pap: false });
        }
        this.hud.setPoints(p.points);
        break;
      }
      case 'perk': {
        const perk = it.perk;
        if (p.perks.has(perk.id) || this.localPerkDrink) return;
        if (perk.id !== 'qr' && !this.map.power.on) return;
        const price = perk.id === 'qr' && this.mode === 'solo' ? 500 : perk.price;
        if (!p.spend(price)) { audio.play('deny'); return; }
        audio.play('buy');
        this.beginLocalPerkDrink(perk);
        this.hud.setPoints(p.points);
        break;
      }
      case 'box': this.boxUse(); break;
      case 'pap': this.papUse(); break;
      case 'power': {
        if (this.map.power.on) return;
        this.setPower(true);
        this.netSend({ t: this.isAuthority ? 'power' : 'power_req' });
        break;
      }
      case 'tele': this.teleUse(it.tele); break;
      case 'trap': {
        const t = it.trap;
        if (!this.map.power.on || t.active || t.cd > 0) return;
        if (!p.spend(1000)) { audio.play('deny'); return; }
        audio.play('buy');
        this.activateTrap(t);
        this.netSend({ t: this.isAuthority ? 'trap_on' : 'trap_req', id: t.id });
        this.hud.setPoints(p.points);
        break;
      }
      case 'song': {
        const songPos = this.map.interact.find((i) => i.kind === 'song')?.pos || null;
        if (audio.songPlaying) {
          audio.stopSong();
          this.netSend({ t: this.isAuthority ? 'song' : 'song_req', on: 0 });
        } else {
          audio.playSong(songPos);
          this.netSend({ t: this.isAuthority ? 'song' : 'song_req', on: 1 });
          this.hud.banner('BEAUTY OF ANNIHILATION', '#c8402f', '♪');
        }
        break;
      }
      case 'radio': {
        const radioPos = it.pos || null;
        if (this._radioOn) { audio.stopMusicBox(); this._radioOn = false; }
        else { audio.playMusicBox(radioPos); this._radioOn = true; }
        this.netSend({ t: this.isAuthority ? 'radio' : 'radio_req', on: this._radioOn ? 1 : 0 });
        break;
      }
    }
  }

  openDoor(door) {
    this.map.openDoor(door);
    audio.play('door', { pos: { x: door.x, y: 1.5, z: door.z } });
    this.fx.spawnParticles(door.x, 0.5, door.z, { count: 10, color: [0.5, 0.45, 0.4], speed: 1.5, life: 0.8, size: 2 });
  }

  rebuildBoard(b) {
    if (this.isAuthority) {
      if (b.boards >= b.maxBoards) return;
      b.boards++;
      this.setBoards(b, b.boards);
      this.netSend({ t: 'barrier', id: b.id, n: b.boards });
      this.awardPoints(CFG.POINTS_BOARD, b);
    } else {
      this.netSend({ t: 'barrier_req', id: b.id });
      b.boards = Math.min(b.maxBoards, b.boards + 1);
      this.setBoards(b, b.boards);
    }
    audio.play('board_build', { pos: b });
  }

  setBoards(b, n) {
    b.boards = n;
    b.boardsMesh.children.forEach((m, i) => { m.visible = i < n; });
  }

  onBoardTorn(b) {
    this.setBoards(b, b.boards);
    audio.play('board_tear', { pos: b });
    if (this.net) this.netSend({ t: 'barrier', id: b.id, n: b.boards });
  }

  _interactEvent(msg, from) {
    const p = this.player;
    switch (msg.t) {
      case 'song': {
        const songPos = this.map.interact.find((i) => i.kind === 'song')?.pos || null;
        if (msg.on) audio.playSong(songPos); else audio.stopSong();
        break;
      }
      case 'door': {
        const d = this.map.doors.find((dd) => dd.id === msg.id);
        if (d && !d.open) this.openDoor(d);
        break;
      }
      case 'door_req': {
        if (!this.isAuthority) break;
        const d = this.map.doors.find((dd) => dd.id === msg.id);
        if (d && !d.open && d.id !== 'd_pap' && this._remoteNear(from, d, 3.2)) {
          this.openDoor(d);
          this.netSend({ t: 'door', id: d.id });
        }
        break;
      }
      case 'barrier': {
        const b = this.map.barriers.find((bb) => bb.id === msg.id);
        if (b) {
          // Clamped to the window's real capacity. The generic payload validator
          // bounds magnitude at 1e7, and a board count that large is untearable:
          // TEAR removes one board every 1.35s and only completes at zero, so the
          // zombie working it would be immortal and the round could never end.
          const n = clamp(Math.trunc(Number(msg.n)) || 0, 0, b.maxBoards);
          const torn = n < b.boards;
          this.setBoards(b, n);
          audio.play(torn ? 'board_tear' : 'board_build', { pos: b });
        }
        break;
      }
      case 'barrier_req': {
        if (!this.isAuthority) break;
        const b = this.map.barriers.find((bb) => bb.id === msg.id);
        if (b && b.boards < b.maxBoards && this._remoteNearVisible(from, b, 3)) {
          b.boards++;
          this.setBoards(b, b.boards);
          this.netSend({ t: 'barrier', id: b.id, n: b.boards });
          this.netSend({ t: 'boardpoints', pid: from, cid: `${b.id}:${this._nextBoardCreditId++}` });
        }
        break;
      }
      case 'boardpoints': {
        if (msg.pid !== p.id || !consumeBoardCredit(this._seenBoardCredits, msg.cid)) break;
        this.awardPoints(CFG.POINTS_BOARD);
        break;
      }
      case 'radio': {
        const radioIt = this.map.interact.find((i) => i.kind === 'radio');
        if (msg.on) audio.playMusicBox(radioIt?.pos || null); else audio.stopMusicBox();
        break;
      }
      case 'song_req': {
        if (!this.isAuthority) break;
        const songIt = this.map.interact.find((i) => i.kind === 'song');
        if (!this._remoteNearVisible(from, songIt?.pos, 3)) break;
        const songPos = songIt?.pos || null;
        if (msg.on) audio.playSong(songPos); else audio.stopSong();
        this.netSend({ t: 'song', on: msg.on ? 1 : 0 });
        break;
      }
      case 'radio_req': {
        if (!this.isAuthority) break;
        const radioIt = this.map.interact.find((i) => i.kind === 'radio');
        if (!this._remoteNearVisible(from, radioIt?.pos, 3)) break;
        if (msg.on) audio.playMusicBox(radioIt?.pos || null); else audio.stopMusicBox();
        this.netSend({ t: 'radio', on: msg.on ? 1 : 0 });
        break;
      }
    }
  }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
