// Game's rendering: the renderer, scene and cameras, quality, the lights fed to
// the post stack, shader prewarm, resize, and the world and viewmodel passes.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { clamp } from '../utils.js';
import { assets } from '../assets.js';
import { ZombieVisual, createZombieModel } from '../zombies.js';
import { attachZombieDetail } from '../render/ZombieDetail.js';
import { PostFX } from '../render/PostFX.js';
import { SlotBank } from '../render/LightPool.js';

// Render layers. The world camera draws LAYER_WORLD; a second pass draws
// LAYER_VIEWMODEL on a cleared depth buffer with its own field of view.
const LAYER_WORLD = 0;
const LAYER_VIEWMODEL = 1;
// Viewmodel FOV is deliberately fixed and narrow: it is the "lens" the weapon
// is filmed with, and decoupling it from the player's world FOV is what keeps
// a 110-degree world view from distorting the gun.
const VIEWMODEL_FOV = 75;
// The rig's part positions were authored against the 110-degree world lens.
// Filming them at 75 degrees would make the weapon fill roughly twice the
// screen, so shrink it by the ratio of the two half-angle tangents (with a
// little extra presence, because a weapon that reads large is the point) and
// push it forward by the amount the shrink pulled it in — same distance from
// the eye, same framing, far less wide-angle distortion.
const VIEWMODEL_REF_FOV = 110;
const VIEWMODEL_PRESENCE = 1.28;
const VIEWMODEL_PIVOT_Z = 0.4;   // authored hip distance, metres

// Shutter weight at the slider's 100%. This governs how quickly a given camera
// speed reaches the length clamp — not how long the smear gets, which is the
// slider's other half (PostFX.setMotionBlurScale). Tuned so an ordinary look-
// around already carries some smear rather than only whip-turns tripping it.
const MB_BASE_STRENGTH = 1.0;

export class GameGraphics {
  // The renderer, the post stack, the scene and both cameras. First thing init
  // does: the map, quality settings and every pass after it build on these.
  _initRendering(canvas) {
    // Anti-aliasing, tone mapping and color conversion all happen inside PostFX
    // now: the world is rendered into an HDR buffer, so the backbuffer itself
    // must stay a plain linear surface that the composite pass writes sRGB into.
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.options.quality !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // The shadow pass re-renders every caster in the map, which is the single
    // biggest chunk of the frame's draw calls. Nothing in this game moves fast
    // enough for a one-frame-old shadow to read as wrong, so it runs at half
    // rate and the saved calls go back into the frame budget.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    this.renderer = r;
    this.postfx = new PostFX(r, { quality: this.options.quality || 'high' });
    // Seeded here so the per-frame camera path has a value even if it somehow
    // runs before applyQuality; applyQuality is the one that reads the slider.
    this._mbUserStrength = MB_BASE_STRENGTH;
    this.exposureScale = 1;

    this.scene = new THREE.Scene();
    // Deliberately null: the shader skybox covers every pixel the world pass
    // does not, and a Color background sets forceClear inside WebGLBackground,
    // which would wipe the HDR buffer at the start of the viewmodel pass even
    // with autoClear disabled.
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.028);
    this.fogNormal = { color: new THREE.Color(0x0a0d14), d: 0.028 };
    this.fogDog = { color: new THREE.Color(0x190c08), d: 0.05 };

    // Near plane is bounded by the player's collision radius, not by depth
    // precision. The camera can be pressed to CFG.PLAYER_RADIUS (0.35m) from a
    // wall, and the near plane's CORNER reaches `near * tan(fov/2) * aspect`
    // sideways — at near 0.15 and a 110 degree FOV that is 0.44m, so the
    // frustum poked through the wall and you could see the room beyond it.
    // 0.075 keeps the corner at 0.22m with margin for view bob and sway.
    // Precision is not the constraint it would normally be: the depth buffer
    // here is a FloatType texture, not 24-bit integer.
    this.camera = new THREE.PerspectiveCamera(clamp(Number(this.options.fov) || 90, 70, 110), innerWidth / innerHeight, 0.075, 400);
    this.camera.rotation.order = 'YXZ';
    this.camera.layers.set(LAYER_WORLD);
    this.scene.add(this.camera);

    // Viewmodel pass: same transform, its own (narrower, fixed) FOV and its own
    // depth range, drawn after the world with the depth buffer cleared. This is
    // why a 110-degree world FOV does not stretch the weapon into a fisheye,
    // and why the gun can never clip through a wall it is pressed against.
    this.viewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, innerWidth / innerHeight, 0.012, 8);
    this.viewCamera.rotation.order = 'YXZ';
    this.viewCamera.layers.set(LAYER_VIEWMODEL);
    this._drawViewmodel = (target) => this.renderViewmodel(target);
    // weapon-mounted flashlight (T toggles) — warm beam with soft falloff
    this.flashlight = new THREE.SpotLight(0xffe8c0, 0, 34, 0.46, 0.55, 1.1);
    this.flashlight.position.set(0.14, -0.12, -0.1);
    this.flashlight.target.position.set(0.02, -0.06, -8);
    this.camera.add(this.flashlight, this.flashlight.target);
  }

  // Re-parent the rig under a compensation node so the narrower viewmodel
  // lens does not double the weapon's apparent size (see VIEWMODEL_* above).
  _mountViewmodel() {
    const half = (f) => Math.tan(f * Math.PI / 360);
    const k = (half(VIEWMODEL_FOV) / half(VIEWMODEL_REF_FOV)) * VIEWMODEL_PRESENCE;
    this.vmRoot = new THREE.Group();
    this.vmRoot.scale.setScalar(k);
    this.vmRoot.position.z = -(1 - k) * VIEWMODEL_PIVOT_Z;
    this.camera.add(this.vmRoot);
    this.vmRoot.add(this.weaponRig.root);
    // The ADS pose solves for eye relief and buttstock clearance, both
    // measured from the lens — so the rig needs this transform to convert.
    this.weaponRig.setViewLens(k, this.vmRoot.position.z);
  }

  /** Real point lights kept alive at once. Each one costs every lit pixel. */
  _lightBudget() {
    const q = this.options.quality;
    return q === 'low' ? 4 : q === 'medium' ? 6 : 8;
  }

  applyQuality() {
    const q = this.options.quality;
    // Post runs at buffer resolution, so the pixel ratio ceiling is lower than
    // it was for forward rendering — 1.5 already costs 20 fullscreen passes.
    const pr = q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.15) : Math.min(devicePixelRatio, 1.5);
    this._qualityPixelRatio = pr;
    this._dynamicPixelRatio = Math.min(this._dynamicPixelRatio || pr, pr);
    this.renderer.setPixelRatio(this._dynamicPixelRatio);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.postfx?.setQuality(q === 'low' ? 'low' : q === 'medium' ? 'medium' : 'high');
    // Player control over motion blur. It is deliberate art direction and on by
    // default, but it is also the effect people are most likely to be sensitive
    // to, so it gets a slider that reaches zero rather than being locked on.
    // setQuality resets the preset, so this has to be applied after it.
    if (this.postfx) {
      const mb = this.options.motionBlur;
      const scale = mb == null ? 1 : Math.max(0, mb);
      // Slider position -> sampled length (and the taps that keep it clean).
      this.postfx.setMotionBlurScale(scale);
      // ...and -> shutter strength, cached because updateCamera rewrites
      // motionBlurStrength every frame for the ADS falloff. Writing the option
      // straight onto postfx here instead would last exactly one frame: that
      // was the bug that made this whole slider inert, including Off.
      this._mbUserStrength = MB_BASE_STRENGTH * scale;
    }
    this.lightPool?.setSize(this._lightBudget());
    if (this.map?.moonLight) {
      this.map.moonLight.castShadow = q !== 'low';
      const size = q === 'high' ? 2048 : 1024;
      // Resize through SunShadow, never straight at the light. SunShadow snaps
      // the box centre to the shadow map's texel grid, and the size of that
      // grid IS the map size — a resize it does not see leaves it quantising to
      // the wrong grid, which is shadow crawl: precisely the artifact the
      // snapping exists to remove. (SunShadow now also re-reads the size every
      // frame, so this is belt and braces rather than the only defence.)
      if (this.map.sunShadow) {
        this.map.sunShadow.setResolution(size);
      } else if (this.map.moonLight.shadow.mapSize.x !== size) {
        this.map.moonLight.shadow.mapSize.set(size, size);
        if (this.map.moonLight.shadow.map) { this.map.moonLight.shadow.map.dispose(); this.map.moonLight.shadow.map = null; }
      }
    }
    this._syncPostFxScene();
    this.onResize?.();
  }

  /**
   * Feed the four brightest nearby practicals to the volumetric raymarch so
   * lamps, fires and the muzzle flash actually cast visible cones through the
   * haze. The candidate list is gathered once; only the per-frame pick is hot.
   *
   * These four slots are ranked from the camera, so they reorder as you walk —
   * and a volumetric cone is a large, soft, high-contrast thing, so swapping
   * one hard is far more visible than swapping a point light. The original pick
   * had no incumbency and no fade at all: measured along a running path through
   * the courtyard and the factory it changed slot owners 11 times a second and
   * cut a cone dead 7 times a second, against zero of either standing still.
   * It shares the pool's slot machinery now, so a cone ramps in and out instead
   * of snapping, and near-equal sources stop trading places.
   */
  _updateVolumetricLights(dt) {
    const fx = this.postfx;
    if (!fx || !this.map) return;
    if (!this._volCandidates) {
      const list = [];
      for (const l of this.map.lamps || []) list.push(l.pl);
      for (const f of this.map.fires || []) if (f.light) list.push(f.light);
      for (const l of this.map.props?.lights || []) list.push(l.light);
      if (this.fx?.muzzleLight) list.push(this.fx.muzzleLight);
      for (const b of this.fx?.boomLights || []) list.push(b.light);
      this._volCandidates = list;
      this._volSlots = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, intensity: 0, radius: 1 }));
      this._volBank = new SlotBank(4);
      this._volWp = new THREE.Vector3();
    }
    const cam = this.camera.position;
    const bank = this._volBank, wp = this._volWp;
    bank.begin();
    // Insertion into a four-slot ranking: cheaper than sorting ~30 lights, and
    // the shift loop is at most three steps.
    for (const L of this._volCandidates) {
      if (!L) continue;
      // Rank on the peak-held intensity the light pool already computed this
      // frame, not the instantaneous one. The old `intensity < 1` gate was a
      // hard cutoff, so a deliberately flickering tube dipping through it
      // dropped its cone for two frames and brought it straight back.
      const smooth = L.userData.poolSmooth ?? L.intensity;
      if (smooth < 1) continue;
      wp.setFromMatrixPosition(L.matrixWorld);
      const dx = wp.x - cam.x, dy = wp.y - cam.y, dz = wp.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      // Same hysteresis band on the cull as the point-light pool, and for the
      // same reason: the cull is a `continue`, so without it an incumbent that
      // grazes the boundary is dropped before incumbency can protect it.
      const reach = ((L.distance || 12) + 6) * (bank.holds(L) ? 1.25 : 1);
      if (d2 > reach * reach) continue;
      // Rank by how much a light can actually contribute here, not just range.
      bank.offer(L, smooth / (d2 + 1));
    }
    bank.commit(dt);
    const slots = this._volSlots;
    for (let i = 0; i < 4; i++) {
      const sl = bank.slots[i];
      const L = sl.source;
      const s = slots[i];
      if (!L || sl.weight <= 0) { s.intensity = 0; continue; }
      wp.setFromMatrixPosition(L.matrixWorld);
      s.x = wp.x; s.y = wp.y; s.z = wp.z;
      s.r = L.color.r; s.g = L.color.g; s.b = L.color.b;
      s.radius = L.distance || 12;
      // Three.js point-light intensity is in candela; scale it into the
      // scatter integral's units so lamps read without blowing out. The slot
      // weight only cross-fades the cone in and out — the light's own authored
      // flicker still comes through at full strength.
      s.intensity = L.intensity * sl.weight * 0.006;
    }
    fx.volLights = slots;
  }

  // Keep the post stack pointed at whatever the map currently calls the sun.
  _syncPostFxScene() {
    const fx = this.postfx;
    if (!fx || !this.map) return;
    const sun = this.map.moonLight;
    if (sun) {
      fx.shadowLight = sun;
      fx.sunDir.copy(sun.position).sub(sun.target.position).normalize();
      fx.sunColor.copy(sun.color).multiplyScalar(Math.min(1, sun.intensity * 0.35));
    }
    const grade = this.map.grade;
    if (grade) {
      fx.volDensity = grade.volDensity;
      fx.volHeightFalloff = grade.volHeightFalloff;
      fx.volFogBase = grade.volFogBase;
      fx.volAnisotropy = grade.volAnisotropy;
      fx.volAmbient = grade.volAmbient;
      fx.volAmbientColor.copy(grade.volAmbientColor);
      fx.lift.copy(grade.lift);
      fx.gain.copy(grade.gain);
      fx.gamma.copy(grade.gamma);
      fx.saturation = grade.saturation;
      fx.contrast = grade.contrast;
      fx.bloomStrength = grade.bloomStrength;
      fx.bloomThreshold = grade.bloomThreshold;
      fx.baseExposure = grade.exposure;
    }
  }

  /**
   * Compile every shader the match needs now, instead of on the frame each
   * thing first appears.
   *
   * three compiles a material's program the first time it is drawn, and the
   * frame waits for it. The first zombie of a match, the first hellhound and
   * the first shot's tracer, decal and sparks each stalled the frame they
   * appeared on while their shaders built. compile() walks hidden objects
   * too, so the pooled effects that start invisible are covered by the scene
   * as it stands; enemies do not exist yet, so one of each is built, compiled
   * and dropped.
   *
   * Compiled with the HDR target bound: the program key includes the output
   * colour space, and a program built for the canvas would never be reused by
   * the world pass.
   */
  _prewarmShaders() {
    const probes = new THREE.Group();
    probes.visible = false;
    try {
      for (const variant of [0, 1]) {
        if (!assets.models[variant ? 'zombie2' : 'zombie1']) continue;
        const visual = new ZombieVisual(variant);
        attachZombieDetail(visual);
        probes.add(visual.group);
      }
      probes.add(createZombieModel(true));
      this.scene.add(probes);
      this.renderer.setRenderTarget(this.postfx?.sceneRT || null);
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      console.warn('[render] shader prewarm failed; shaders will compile on first use', e);
    } finally {
      this.renderer.setRenderTarget(null);
      this.scene.remove(probes);
    }
  }

  onResize() {
    const w = Math.max(1, this.canvas?.clientWidth || document.documentElement.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas?.clientHeight || document.documentElement.clientHeight || innerHeight);
    this.camera.clearViewOffset?.();
    this.camera.filmOffset = 0;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewCamera) {
      this.viewCamera.aspect = w / h;
      this.viewCamera.updateProjectionMatrix();
    }
    // CSS owns the fixed full-viewport size; writing inline dimensions caused
    // stale browser-toolbar measurements to crop/pan the first gameplay frames.
    this.renderer.setSize(w, h, false);
    this.postfx?.setSize(w, h, this._dynamicPixelRatio || 1);
    // gl_PointSize is in device pixels, so particles must be told the buffer
    // height or they change world size whenever the render scale moves.
    this.fx?.setViewportHeight(h * (this._dynamicPixelRatio || 1));
  }

  /**
   * Second pass: the first-person weapon, on a cleared depth buffer with its
   * own camera. Runs inside the HDR target before any post pass, so the gun
   * still receives bloom, grain, grading and AA — but contributes nothing to
   * SSAO or the volumetric raymarch, which would otherwise see a wall of
   * geometry 5cm from the lens and darken the entire screen.
   */
  renderViewmodel(target) {
    const rig = this.weaponRig;
    if (!rig?.root || rig.rigHidden) return;
    const vc = this.viewCamera;
    vc.position.copy(this.camera.position);
    vc.quaternion.copy(this.camera.quaternion);
    // ADS pulls the viewmodel lens in, which is what makes irons feel like they
    // magnify slightly even on weapons with no optic.
    const ads = this.player?.adsT || 0;
    const wantFov = VIEWMODEL_FOV * (1 - ads * 0.22);
    if (Math.abs(vc.fov - wantFov) > 0.01) { vc.fov = wantFov; vc.updateProjectionMatrix(); }
    vc.updateMatrixWorld(true);

    this.renderer.setRenderTarget(target);
    this.renderer.clearDepth();
    // The world pass has already brought every matrix in the scene up to date
    // this frame, and nothing moves between the two passes (the lens above is
    // updated explicitly). Without this, three walks the whole graph again —
    // map, horde and every bone — to draw a handful of weapon meshes.
    const scene = this.scene;
    const autoUpdate = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try {
      this.renderer.render(scene, vc);
    } finally {
      scene.matrixWorldAutoUpdate = autoUpdate;
    }
  }

  /**
   * Put every viewmodel mesh on the viewmodel layer.
   *
   * This MUST run before anything is drawn. `WeaponRig.equip()` rebuilds the
   * weapon's meshes, and a fresh Object3D defaults to layer 0 — the world
   * layer. Re-tagging lazily inside the viewmodel pass meant that for exactly
   * one frame after every weapon swap the new meshes were still on layer 0
   * when the WORLD camera ran, so a full-detail gun was rendered at point
   * blank across the whole screen: the "weird flash" when changing guns.
   */
  _tagViewmodelLayer() {
    const rig = this.weaponRig;
    if (!rig?.root) return;
    if (this._vmCurrent === rig.current && this._vmCount === rig.root.children.length) return;
    this._vmCurrent = rig.current;
    this._vmCount = rig.root.children.length;
    rig.root.traverse((o) => { if (o.isLight) o.layers.enableAll(); else o.layers.set(LAYER_VIEWMODEL); });
  }

  render(dt = 1 / 60) {
    this._tagViewmodelLayer();
    // Half-rate shadow refresh (see the shadowMap.autoUpdate note in _initRendering).
    this._shadowFrame = ((this._shadowFrame || 0) + 1) & 1;
    this.renderer.shadowMap.needsUpdate = this._shadowFrame === 0;

    const fx = this.postfx;
    if (!fx) { this.renderer.render(this.scene, this.camera); return; }
    fx.exposure = (fx.baseExposure ?? 1) * this.exposureScale
      * clamp(Number(this.options.brightness ?? 1), 0.5, 1.6);
    fx.damage = this._postDamage || 0;
    fx.flash = this._postFlash || 0;
    // The post chain draws the world into an offscreen HDR target and only
    // unbinds it in its last statement. A throw anywhere in between therefore
    // leaves the renderer pointed at that target FOREVER: every later frame
    // lands offscreen and the canvas stays black even though the loop, the
    // netcode and the DOM HUD all keep running — which is exactly what a
    // "blank screen" / "frozen game" report looks like from the outside. One
    // bad material should cost a frame, not the session, so the unbind is
    // unconditional.
    try {
      fx.render(this.scene, this.camera, dt, this._drawViewmodel);
    } finally {
      this.renderer.setRenderTarget(null);
    }
  }
}
