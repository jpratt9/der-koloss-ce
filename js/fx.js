// Juice: GPU particles, tracers, shells, impacts, explosions, lightning,
// decals, screen shake, world popups, power-up drops.
//
// Everything is pooled — a frame allocates nothing. Particles run on the
// ParticlePool shader (per-particle size/rotation/colour ramps) rather than
// the old PointsMaterial, which could only draw one fixed dot size.
// FX's methods are in js/fx/, one file per kind of effect, installed below.
import * as THREE from 'three';
import { installMixins } from './utils.js';
import { ParticlePool, puffTexture, sparkTexture, splatTexture } from './render/Particles.js';
import { tracerTexture, holeTexture } from './fx/textures.js';
import { FxParticles } from './fx/particles.js';
import { FxShots } from './fx/shots.js';
import { FxBlasts } from './fx/blasts.js';
import { FxDecals } from './fx/decals.js';
import { FxScreen } from './fx/screen.js';
import { FxDrops } from './fx/drops.js';
import { FxUpdate } from './fx/update.js';

// js/map/hand-placed.js stamps the level's old blood with this, and imports it
// from here, as it did before the split.
export { BLOOD_DECAL_COLOR } from './fx/surfaces.js';

const MAX_DECALS = 64;

export class FX {
  constructor(scene) {
    this.scene = scene;

    // ---------- particle pools ----------
    // Two pools so smoke can alpha-blend while sparks and fire add.
    this.smoke = new ParticlePool(scene, { max: 900, texture: puffTexture(), blending: THREE.NormalBlending, renderOrder: 2 });
    this.sparks = new ParticlePool(scene, { max: 900, texture: sparkTexture(), blending: THREE.AdditiveBlending, renderOrder: 3 });
    this.gore = new ParticlePool(scene, { max: 500, texture: splatTexture(), blending: THREE.NormalBlending, renderOrder: 2 });
    this.pools = [this.smoke, this.sparks, this.gore];

    // ---------- tracers ----------
    // Camera-facing stretched quads with a hot core, not opaque boxes.
    this.tracers = [];
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      const tex = tracerTexture();
      for (let i = 0; i < 28; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: tex, color: 0xffe9b0, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }));
        m.visible = false; m.frustumCulled = false;
        scene.add(m);
        this.tracers.push({ mesh: m, t: 0, dur: 0.075 });
      }
    }

    // ---------- shells ----------
    this.shells = [];
    {
      // A tapered case with a rim reads as brass even at 3cm across.
      const geo = new THREE.CylinderGeometry(0.0045, 0.0052, 0.026, 7);
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8a63c, metalness: 1.0, roughness: 0.28 });
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.visible = false;
        m.castShadow = false;
        scene.add(m);
        this.shells.push({ mesh: m, t: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, bounced: 0 });
      }
      this.shellHead = 0;
    }

    // ---------- decals (bullet holes + blood) ----------
    // Oriented to the surface normal instead of always lying flat, so holes on
    // a wall actually sit on the wall.
    this.decals = [];
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      const holeTex = holeTexture();
      const bloodTex = splatTexture();
      for (let i = 0; i < MAX_DECALS; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: holeTex, transparent: true, opacity: 0, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        }));
        m.visible = false;
        scene.add(m);
        this.decals.push({ mesh: m, t: 0, dur: 1, holeTex, bloodTex });
      }
      this.decalHead = 0;
    }

    // ---------- lights ----------
    this.boomLights = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 18, 2);
      l.layers.enableAll();
      scene.add(l);
      this.boomLights.push({ light: l, t: 0, dur: 0.35, peak: 130 });
    }
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 11, 2);
    this.muzzleLight.layers.enableAll();
    scene.add(this.muzzleLight);
    this.muzzleT = 0;
    this.muzzlePeak = 0;

    // ---------- lightning ----------
    this.bolts = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0x9fd0ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.bolts.push({ line, t: 0 });
    }

    // ---------- popups ----------
    this.popups = [];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
      s.scale.set(0.8, 0.2, 1);
      s.renderOrder = 10;
      scene.add(s);
      this.popups.push({ sprite: s, t: 0, vy: 0 });
    }
    this.popupHead = 0;

    // ---------- shake ----------
    this.trauma = 0;
    this.shakeT = 0;
    this.drops = [];

    this.vignette = document.getElementById('dmg-vignette');
    this.flashEl = document.getElementById('screen-flash');
    this.postActive = false;

    // Scratch objects for the per-frame tracer basis. Allocating a Vector3
    // per tracer per frame is exactly the kind of churn the perf invariants
    // exist to prevent.
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._bx = new THREE.Vector3();
    this._bz = new THREE.Vector3();
    this._scaleV = new THREE.Vector3();
    this._decalFwd = new THREE.Vector3(0, 0, 1);
  }
}

// FX's methods are split by effect across js/fx/. Each file is a class whose
// methods are copied onto FX.prototype here: one `this`, one set of pools for
// every caller. A name defined twice is a split mistake, so it fails at load.
installMixins(FX, [FxParticles, FxShots, FxBlasts, FxDecals, FxScreen, FxDrops, FxUpdate]);
