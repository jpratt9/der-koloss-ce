// WeaponRig's reload and bolt-cycle animation, and the glove and action posing
// both use.
// Methods of WeaponRig: js/weapons/rig.js copies them onto WeaponRig.prototype.
import { clamp, lerp } from '../utils.js';
import { setHandPose, resetHandPose } from '../render/WeaponHands.js';
import { WEAPONS } from './catalog.js';

export class WeaponRigReload {
  /** Authored rest transform of an animated part, captured on first touch. */
  _rest(o) {
    return o.userData.__rest ?? (o.userData.__rest = {
      p: o.position.clone(), r: o.rotation.clone(),
    });
  }

  /** Put both gloves back exactly where the view-model authored them. */
  _restHands() {
    const cur = this.current;
    if (!cur || !this._handsPosed) return;
    for (const key of ['hand_l', 'hand_r']) {
      const w = cur.parts[key];
      if (!w?.userData?.__rest) continue;
      w.position.copy(w.userData.__rest.p);
      w.rotation.copy(w.userData.__rest.r);
      if (w.userData.hand) resetHandPose(w.userData.hand);
    }
    this._handsPosed = false;
  }

  /**
   * Run a part of the action (bolt, bolt knob, slide, pump) `dz` back along the
   * bore from where it was authored.
   *
   * The travel is kept on the part as well as applied, because tuckStock() also
   * sets position.z, every frame, on anything that sits wholly behind the sight.
   * It adds the travel back on top of the tuck, and this adds the tuck under the
   * travel, so the two compose in whichever order they run.
   */
  _actionZ(node, dz) {
    if (dz) this._actionPosed = true;
    node.userData.actionZ = dz;
    node.position.z = (node.userData.z0 ?? (node.userData.z0 = node.position.z)) + (node.userData.tuckZ ?? 0) + dz;
  }

  /**
   * Put every part the action moved back where it was authored. A reload cut
   * short (a perk drink sets reloadT to 0) would otherwise leave a bolt or a
   * slide wherever it had got to.
   */
  _restAction() {
    const cur = this.current;
    if (!cur || !this._actionPosed) return;
    this._actionPosed = false;
    for (const node of Object.values(cur.parts)) {
      if (node.userData.actionZ) this._actionZ(node, 0);
    }
  }

  /**
   * Move a support/trigger hand onto something it is supposed to be holding.
   *
   * `amt` 0 leaves it on its authored grip, 1 puts it fully on the target.
   * `grip` re-closes the fingers, which is what stops a hand from sliding
   * around a magazine like a decal instead of taking hold of it.
   */
  _handTo(w, amt, tx, ty, tz, { roll = 0, pitch = 0, yaw = 0, grip = null, spread = 1 } = {}) {
    if (!w) return;
    const r = this._rest(w);
    this._handsPosed = true;
    const k = clamp(amt, 0, 1);
    w.position.set(
      lerp(r.p.x, tx, k),
      lerp(r.p.y, ty, k),
      lerp(r.p.z, tz, k),
    );
    w.rotation.set(r.r.x + pitch * k, r.r.y + yaw * k, r.r.z + roll * k);
    const h = w.userData.hand;
    if (h && grip !== null) {
      setHandPose(h, { curl: lerp(h.userData.baseCurl, grip, k), spread: lerp(1, spread, k) });
    }
  }

  _reloadAnim(t) {
    // t: 0..1 normalized reload progress. Returns {dip, roll} and moves parts.
    const cur = this.current;
    if (!cur) return { dip: 0, roll: 0 };
    const p = cur.parts;
    const dip = Math.sin(Math.min(t * 1.12, 1) * Math.PI);
    const cls = WEAPONS[cur.id].cls;
    const phase = (a, b) => clamp((t - a) / (b - a), 0, 1);
    const bell = (a, b) => Math.sin(phase(a, b) * Math.PI);
    // mag swap window for mag-fed weapons
    let magY = 0;
    if (p.mag && !WEAPONS[cur.id].breakAction) {
      const out = phase(0.08, 0.3), inn = phase(0.45, 0.68);
      const off = out < 1 ? -0.16 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.16 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.mag.position.y = p.mag.userData.y0 ?? (p.mag.userData.y0 = p.mag.position.y);
      p.mag.position.y += off;
      magY = off;
    }

    // ---- support hand: it has to actually HOLD what it is moving ----------
    //
    // The magazine used to slide out of the weapon on its own while the left
    // glove stayed welded to the handguard. Now the hand leaves the handguard,
    // closes on the magazine, rides it out, goes off-frame for a fresh one,
    // brings it back, seats it, slaps the floorplate, and only then goes back
    // to holding the gun.
    const hl = p.hand_l, hr = p.hand_r;
    if (hl && p.mag && !WEAPONS[cur.id].breakAction) {
      const m = p.mag.position, m0 = p.mag.userData.y0 ?? m.y;
      const reach = phase(0.04, 0.20);        // travel down to the magwell
      const carry = phase(0.20, 0.34);        // ride the mag out
      const away = phase(0.34, 0.44);         // drop it, go off-frame
      const back = phase(0.44, 0.60);         // return with a fresh one
      const seat = phase(0.60, 0.70);         // push it home
      const slap = bell(0.70, 0.80);          // palm the floorplate
      const home = phase(0.82, 1.0);          // back on the handguard
      // where the hand needs to be to have hold of the magazine body
      const gx = m.x, gy = m0 + magY - 0.055, gz = m.z + 0.012;
      let amt = 0, tx = gx, ty = gy, tz = gz, grip = 1.0;
      if (home > 0) { amt = 1 - home; grip = 1.0; }
      else if (back > 0) { amt = 1; tx = gx - 0.10 * (1 - back); ty = gy - 0.30 * (1 - back); grip = 1.0; }
      else if (away > 0) { amt = 1; tx = gx - 0.10 * away; ty = gy - 0.30 * away; grip = 1.0; }
      else if (carry > 0) { amt = 1; grip = 1.0; }
      else { amt = reach; grip = lerp(0.45, 1.0, reach); }
      if (seat > 0 && back >= 1) ty = gy + 0.012 * seat;
      this._handTo(hl, amt, tx, ty + slap * 0.016, tz, {
        roll: 0.42, pitch: -0.28, grip, spread: 0.9,
      });
    } else if (hl && (p.pump || p.magtube)) {
      // Pump gun: shells go in off-frame, then the forend is racked.
      const feed = bell(0.10, 0.62), rack = bell(0.68, 0.96);
      const rest = this._rest(hl);
      if (rack > 0.01 && p.pump) {
        this._handTo(hl, 1, rest.p.x, rest.p.y, (p.pump.userData.z0 ?? p.pump.position.z) + rack * 0.09 + 0.02, {
          grip: 1.05, spread: 0.9,
        });
      } else if (feed > 0.01) {
        this._handTo(hl, feed, rest.p.x - 0.10, rest.p.y - 0.13, rest.p.z + 0.16, {
          roll: 0.5, pitch: -0.4, grip: 0.55, spread: 1.15,
        });
      } else {
        this._restHands();
      }
    } else if (hl && !p.mag) {
      // Stripper clips, en-blocs, break actions: the hand leaves the forend,
      // loads over the open action, then comes back down.
      const load = bell(0.14, 0.70);
      if (load > 0.01) {
        const rest = this._rest(hl);
        this._handTo(hl, load, rest.p.x - 0.03, rest.p.y + 0.10, rest.p.z + 0.20, {
          roll: 0.55, pitch: -0.5, grip: 0.5, spread: 1.2,
        });
      } else {
        this._restHands();
      }
    }
    // Charging handle / bolt: the same hand comes off the handguard, yanks it
    // back and lets it fly. Sold by the hand leading the part, not trailing it.
    const charger = p.charge || p.oprod_handle || p.bolt_h || p.bolt_knob;
    if (hl && charger && p.mag && cls !== 'pistol') {
      const yank = bell(0.80, 0.94);
      if (yank > 0.01) {
        const c = charger.position;
        this._handTo(hl, yank, c.x + 0.030, c.y + 0.010, c.z + 0.030 + yank * 0.055, {
          roll: -0.55, pitch: 0.22, grip: 1.05, spread: 0.85,
        });
      }
    }
    // Pistols: the support hand comes across, cups the slide and racks it.
    if (hl && cls === 'pistol' && p.slide) {
      const rack = bell(0.60, 0.88);
      if (rack > 0.01) {
        this._handTo(hl, rack, 0.028, 0.046, 0.030 + rack * 0.05, { roll: -0.9, pitch: 0.3, grip: 1.05 });
      }
    }
    // The trigger hand stays on the grip, but the wrist rolls the weapon over
    // to present the magwell — the reason a real reload looks like one motion.
    if (hr) {
      const r = this._rest(hr);
      this._handsPosed = true;
      hr.rotation.set(r.r.x + dip * 0.10, r.r.y, r.r.z + dip * 0.14);
      const trig = hr.userData.hand;
      if (trig) setHandPose(trig, { curls: [1 - dip * 0.55, 1, 1, 1] }); // finger off the trigger
    }
    // charging / bolt / slide action near the end
    if (cur.cls === 'pistol' && p.slide) {
      this._actionZ(p.slide, t > 0.62 && t < 0.85 ? Math.sin((t - 0.62) / 0.23 * Math.PI) * 0.05 : 0);
    }
    if ((cur.id === 'kar98') && p.bolt) {
      const c = phase(0.55, 0.95);
      this._actionZ(p.bolt, Math.sin(c * Math.PI) * 0.07);
      this._actionZ(p.bolt_knob, Math.sin(c * Math.PI) * 0.07);
    }
    if (p.cover && (cur.id === 'mg42' || cur.id === 'browning')) {
      p.cover.rotation.x = t > 0.1 && t < 0.6 ? -0.5 * Math.sin(phase(0.1, 0.6) * Math.PI) : 0;
    }
    if (cur.id === 'mg42' && p.drum) {
      // drum drops out, fresh drum seats home (synced to the belt foley)
      const out = phase(0.14, 0.32), inn = phase(0.52, 0.74);
      const off = out < 1 ? -0.13 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.13 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.drum.position.y = (p.drum.userData.y0 ?? (p.drum.userData.y0 = p.drum.position.y)) + off;
      p.drum_cap.position.y = (p.drum_cap.userData.y0 ?? (p.drum_cap.userData.y0 = p.drum_cap.position.y)) + off;
      if (p.belt_link) p.belt_link.visible = t < 0.14 || t > 0.74;
    }
    if (cur.id === 'ptrs41' && p.clip) {
      // spent clip pops out the top; new one pressed down
      const out = phase(0.18, 0.36), inn = phase(0.5, 0.7);
      const off = out < 1 ? 0.12 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? 0.12 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.clip.position.y = (p.clip.userData.y0 ?? (p.clip.userData.y0 = p.clip.position.y)) + off;
    }
    if (cur.id === 'dbshotgun' && p.barrels) {
      // break open then close
      const open = t < 0.55 ? phase(0.05, 0.3) - phase(0.35, 0.55) : 0;
      p.barrels.rotation.x = open * 0.55;
    }
    if (cur.id === 'panzerschreck' && p.rocket) {
      p.rocket.visible = t > 0.5;
    }
    return { dip, roll: dip * 0.30 };
  }

  _boltAnim(dt) {
    // bolt/pump cycle between shots
    if (this.boltT <= 0) return;
    this.boltT += dt;
    const cur = this.current;
    const DUR = 0.62;
    const t = Math.min(1, this.boltT / DUR);
    const p = cur.parts;
    const arc = Math.sin(t * Math.PI);
    if (cur.id === 'kar98' && p.bolt) {
      this._actionZ(p.bolt, arc * 0.07);
      this._actionZ(p.bolt_knob, arc * 0.07);
      p.bolt_knob.rotation.y = arc * 0.7;
    }
    if ((cur.id === 'mosin' || cur.id === 'springfield') && p.bolt_h) {
      // handle rotates up, bolt draws back, then seats home again
      const pull = Math.sin(t * Math.PI);
      this._actionZ(p.bolt_h, pull * 0.075);
      p.bolt_h.rotation.z = (cur.id === 'mosin' ? -0.9 : -0.4) - pull * 0.55;
      this._actionZ(p.bolt_knob, pull * 0.075);
      p.bolt_knob.position.y = (p.bolt_knob.userData.y0 ?? (p.bolt_knob.userData.y0 = p.bolt_knob.position.y)) + pull * 0.02;
    }
    if (cur.id === 'trench' && p.pump) {
      this._actionZ(p.pump, arc * 0.09);
      // the hand goes WITH the forend — it is the thing racking it
      if (p.hand_l) {
        const r = this._rest(p.hand_l);
        this._handsPosed = true;
        p.hand_l.position.set(r.p.x, r.p.y, r.p.z + arc * 0.09);
        p.hand_l.rotation.set(r.r.x, r.r.y, r.r.z - arc * 0.12);
      }
    }
    // Bolt guns: the firing hand leaves the grip, lifts the handle, draws the
    // bolt and returns. Nothing else about a bolt action reads as deliberate.
    if (p.hand_r && (cur.id === 'kar98' || cur.id === 'mosin' || cur.id === 'springfield')) {
      const knob = p.bolt_knob || p.bolt_h;
      if (knob) {
        const reach = Math.min(1, arc * 1.6);
        this._handTo(p.hand_r, reach, knob.position.x + 0.006, knob.position.y + 0.030, knob.position.z + 0.045, {
          roll: -0.75, pitch: 0.30, grip: 1.05, spread: 0.8,
        });
      }
    }
    if (t >= 1) this.boltT = 0;
  }
}
