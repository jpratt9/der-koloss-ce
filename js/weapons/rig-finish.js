// WeaponRig's finishes on the weapon in hand: gold, diamond and the Pack-a-Punch
// living camo, and the gold knife.
// Methods of WeaponRig: js/weapons.js copies them onto WeaponRig.prototype.
import * as THREE from 'three';
import {
  takesPbrFinish, wearsWeaponFinish, applyPapLivingFinish, advancePapLivingFinish, metalEnvTex,
  sparkleTex,
} from './finishes.js';

export class WeaponRigFinish {
  applyGoldCamo(on) {
    // BO1 gold: deep polished metal, real env reflections, slow sheen sweep + occasional glint
    if (on && this.current) {
      const mats = [];
      this.current.group.traverse((o) => {
        if (wearsWeaponFinish(o)) {
          o.material = o.material.clone();
          o.material.color.set(0xd4af37);
          o.material.metalness = 1.0;
          o.material.roughness = 0.3;
          o.material.envMap = metalEnvTex();
          o.material.envMapIntensity = 1.7;
          o.material.emissive = new THREE.Color(0x3a2a00);
          o.material.emissiveIntensity = 0.08;
          mats.push(o.material);
        }
      });
      this.goldCamo = { mats, t: Math.random() * 9 };
    } else this.goldCamo = null;
  }

  applyDiamondCamo() {
    // BO6-style diamond: platinum-white metal, hard reflections, elegant twinkling facets
    if (!this.current) return;
    const mats = [];
    this.current.group.traverse((o) => {
      if (wearsWeaponFinish(o)) {
        o.material = o.material.clone();
        o.material.color.set(0xf4f6fa);
        o.material.metalness = 1.0;
        o.material.roughness = 0.06;
        o.material.envMap = metalEnvTex();
        o.material.envMapIntensity = 1.7;
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = sparkleTex();
        o.material.emissiveIntensity = 0.2;
        mats.push(o.material);
      }
    });
    this.diamondCamo = { mats, t: 0 };
    this.flash.material.color.set(0xd8ecff); // icy muzzle flash
  }

  setKnifeGold(on) {
    // golden glowing Bowie finish
    if (!this.knifeBlade) return;
    this.knifeGold = on;
    const m = this.knifeBlade.material;
    if (!takesPbrFinish(m)) return; // see takesPbrFinish: `emissive` on an unlit material throws mid-render
    if (on) {
      m.color.set(0xd8b84a);
      m.metalness = 0.9; m.roughness = 0.22;
      m.emissive = new THREE.Color(0xa87c14);
      m.emissiveIntensity = 0.9;
    } else {
      m.color.set(0x78808d); m.emissive = new THREE.Color(0x000000); m.emissiveIntensity = 0;
    }
    this.knifeTip.material = m;
  }

  /**
   * Dress a freshly built view-model in its finish: the Pack-a-Punch living camo,
   * diamond, or gold under GOLD STANDARD. equip() calls it once the weapon is
   * this.current, which applyDiamondCamo() and applyGoldCamo() work on.
   */
  _dressFinish(group, id, pap) {
    // PaP living finish: clone materials, attach scrolling pattern + palette
    this.camo = null;
    this.goldCamo = null;
    this.diamondCamo = null;
    const wantDiamond = pap && (this.alwaysGold || this.diamondNext);
    this.diamondNext = false;
    if (wantDiamond) {
      this.applyDiamondCamo();
    } else if (pap) {
      this.camo = applyPapLivingFinish(group, id, Math.random() * 10);
      // Settle the finish onto the frame it is built. applyPapLivingFinish leaves
      // emissive BLACK and only advance() gives it a colour, so a PaP weapon
      // handed over by papTake() — which runs after the rig update — spent its
      // first rendered frame as an unlit grey gun that then lit up. Dimmer than
      // steady state rather than brighter, so it was never the white flash, but
      // it is the same defect: the frame that builds a model must also dress it.
      advancePapLivingFinish(this.camo, 0);
      this.flash.material.color.setHSL(this.camo.style.hues[0], 0.95, 0.62); // PaP muzzle flash tint
    } else {
      this.flash.material.color.set(0xffffff);
      if (this.alwaysGold) this.applyGoldCamo(true); // GOLD STANDARD cheat
    }
  }

  /** Advance whichever finish the weapon in hand is wearing by one frame. */
  _animateFinish(dt) {
    if (this.goldCamo) {
      const gc = this.goldCamo;
      gc.t += dt;
      // slow sheen breathing + a sharp glint sweeping past every ~3.5s
      const base = 0.08 + Math.sin(gc.t * 1.7) * 0.04;
      const cyc = (gc.t % 3.5) / 3.5;
      const glint = cyc < 0.12 ? Math.sin((cyc / 0.12) * Math.PI) * 0.55 : 0;
      for (const m of gc.mats) m.emissiveIntensity = base + glint;
    }
    if (this.diamondCamo) {
      const dc = this.diamondCamo;
      dc.t += dt;
      // elegant twinkle: sparse sharp sparkles, faint icy hue drift
      for (let i = 0; i < dc.mats.length; i++) {
        const m = dc.mats[i];
        const tw = Math.max(0, Math.sin(dc.t * 2.2 + i * 2.39)) ** 9;
        m.emissiveIntensity = 0.16 + tw * 1.5;
        m.emissive.setHSL(0.58 + Math.sin(dc.t * 0.4 + i) * 0.06, 0.25, 0.9);
      }
    }
    // PaP finish: scroll pattern + pulse palette while you play
    if (this.camo) {
      advancePapLivingFinish(this.camo, dt);
    }
  }
}
