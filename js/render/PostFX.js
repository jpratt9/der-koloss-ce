// AAA post-processing stack for Der Koloss.
//
//   scene (HDR, MSAA) ─┬─> SAO ──> bilateral blur ─┐
//                      ├─> volumetric shafts ──────┼─> resolve (AO * color + scatter)
//                      └─> depth ──────────────────┘
//        └─> camera motion blur -> DOF -> bloom chain -> AgX composite -> FXAA -> screen
//
// Everything is pooled and resized in place; a frame allocates nothing.
import * as THREE from 'three';
import { installMixins } from '../utils.js';
import { PostFXRender } from './PostFX/render.js';
import { FullScreenPass, makeRT } from './FullScreenPass.js';
import { SHADOW_EDGE_FADE } from './ShadowEdgeFade.js';
import {
  AO_FRAG, AO_BLUR_FRAG, VOLUMETRIC_FRAG, VOL_UPSAMPLE_FRAG,
  MOTION_BLUR_FRAG, BLOOM_PREFILTER_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG,
  COMPOSITE_FRAG, FXAA_FRAG, DOF_FRAG, SSR_FRAG, LUM_DOWN_FRAG, LUM_ADAPT_FRAG,
} from './shaders.js';

const BLOOM_MIPS = 6;

// Motion blur sampling contract. Streaking is undersampling, not length: at 2px
// between taps a high-contrast edge combs into discrete ghosts; it vanished by
// ~1.4px. So the blur LENGTH is never a free parameter — it is always tap count
// times this spacing, and anything that wants a longer smear has to buy the
// taps to keep it clean. `mbSamples` in each preset is the length at the slider
// default (100%); the slider scales taps and radius together through
// setMotionBlurScale so the spacing invariant survives every setting.
const MB_TAP_SPACING = 1.6;
const MB_TAPS_MIN = 6;
// Ceiling on the top tier at max slider. 32 taps is 64 texture fetches for a
// moving pixel, which is the most this pass can justify even on ultra.
const MB_TAPS_MAX = 32;

export const QUALITY_PRESETS = {
  low: {
    msaa: 0, aoScale: 0, volScale: 0, bloomMips: 4, motionBlur: false, dof: false,
    fxaa: true, aoSamples: 8, volSteps: 12, mbSamples: 8, sharpen: 0.25, ssr: false, ssrSteps: 12,
  },
  medium: {
    msaa: 0, aoScale: 0.5, volScale: 0.5, bloomMips: 5, motionBlur: true, dof: false,
    fxaa: true, aoSamples: 10, volSteps: 16, mbSamples: 12, sharpen: 0.3, ssr: false, ssrSteps: 14,
  },
  high: {
    msaa: 4, aoScale: 0.5, volScale: 0.5, bloomMips: 6, motionBlur: true, dof: true,
    fxaa: true, aoSamples: 12, volSteps: 24, mbSamples: 18, sharpen: 0.35, ssr: true, ssrSteps: 20,
  },
  ultra: {
    msaa: 4, aoScale: 1.0, volScale: 0.5, bloomMips: 6, motionBlur: true, dof: true,
    fxaa: true, aoSamples: 16, volSteps: 40, mbSamples: 22, sharpen: 0.35, ssr: true, ssrSteps: 32,
  },
};

export class PostFX {
  constructor(renderer, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.enabled = true;
    this.width = 1; this.height = 1;
    this.frame = 0;

    // ---- tunables the game drives per-frame ----
    this.exposure = 1.0;
    this.bloomStrength = 0.62;
    this.bloomThreshold = 1.05;
    this.chromatic = 0.11;
    this.vignette = 0.34;
    this.grain = 0.014;
    this.saturation = 1.06;
    this.contrast = 1.06;
    this.lift = new THREE.Vector3(0.012, 0.016, 0.030);   // cool shadows
    this.gamma = new THREE.Vector3(1.0, 1.0, 1.0);
    this.gain = new THREE.Vector3(1.03, 1.0, 0.96);       // warm highlights
    this.aoStrength = 0.85;
    this.aoRadius = 0.75;
    this.aoIntensity = 1.15;
    // Battlefield-grade shutter. This was briefly dialled almost off because
    // the near ground and ceiling beams smeared into hard parallel streaks —
    // but that was a BUG (taps leaving the frame sampled the clamped border
    // pixel), not the blur itself. With that fixed the blur can carry weight
    // again, which is a large part of the AAA feel.
    // Default tuned to the reference the user supplied: the WORLD smears
    // clearly while sprinting and turning, and the weapon stays readable. The
    // gun staying sharp is structural, not a tuning accident — the viewmodel
    // is drawn AFTER this pass, so it is never sampled by it.
    this.motionBlurStrength = 1.15;
    // The player's slider, 0..1.5, folded in through setMotionBlurScale. It is
    // NOT the same knob as motionBlurStrength: strength only decides how fast a
    // given camera speed reaches the length clamp, whereas this scales the
    // clamp itself — and the clamp is what you actually see, because any turn
    // brisker than roughly 150 deg/sec saturates it. Initialised before
    // setQuality runs at the end of the constructor.
    this._mbScale = 1;
    this._mbTaps = 0;
    this.damage = 0;
    this.flash = 0;
    this.dofFocus = 8;
    this.dofRange = 14;
    this.dofMaxBlur = 0;    // 0 disables the pass; ADS raises it

    // ---- auto-exposure ----
    // A single authored exposure cannot serve a moonlit courtyard and an
    // unpowered factory interior at once. This measures the frame and adapts,
    // scaling the authored baseline rather than replacing it.
    this.autoExposure = 1.0;      // 0..1 blend toward fully automatic
    this.keyValue = 0.105;        // target middle grey
    this.adaptUp = 2.6;           // rate when the scene gets brighter
    this.adaptDown = 1.1;         // slower going dark, like an eye
    this.minLum = 0.010;
    this.maxLum = 3.0;

    // ---- screen-space reflections (standing water only) ----
    this.ssrStrength = 0.85;
    this.ssrMaxDist = 9;      // view-space march length, metres
    this.ssrThickness = 0.55; // depth tolerance for a hit
    this.ssrWetScale = 0.30;  // MUST match the floor material's wetScale
    this.ssrWetHeight = 0.40; // MUST match the floor material's wetHeight

    // ---- volumetrics ----
    this.volDensity = 0.020;
    this.volHeightFalloff = 0.10;
    this.volFogBase = 0.0;
    this.volAnisotropy = 0.72;
    this.volAmbient = 0.35;
    this.volAmbientColor = new THREE.Color(0x2a3a5c);
    this.volMaxDist = 65;
    this.sunColor = new THREE.Color(0x93aad8);
    this.sunDir = new THREE.Vector3(0.5, 0.7, -0.5).normalize();
    this.shadowLight = null;

    this._prevViewProj = new THREE.Matrix4();
    this._curViewProj = new THREE.Matrix4();
    this._projInv = new THREE.Matrix4();
    this._viewInv = new THREE.Matrix4();
    this._camPos = new THREE.Vector3();
    this._identityShadow = new THREE.Matrix4();
    this._blackTex = null;

    this._buildPasses();
    this.setQuality(quality);
  }

  // ------------------------------------------------------------------ setup
  _buildPasses() {
    const V2 = () => new THREE.Vector2();
    const M4 = () => new THREE.Matrix4();

    this.aoPass = new FullScreenPass(AO_FRAG, {
      uDepth: { value: null }, uProjInv: { value: M4() }, uProj: { value: M4() },
      uResolution: { value: V2() }, uNear: { value: 0.1 }, uFar: { value: 400 },
      uRadius: { value: 0.75 }, uIntensity: { value: 1.15 }, uBias: { value: 0.02 },
      uFrame: { value: 0 },
    }, { AO_SAMPLES: 12 });

    this.aoBlurPass = new FullScreenPass(AO_BLUR_FRAG, {
      uAO: { value: null }, uTexel: { value: V2() }, uDir: { value: V2() },
      uNear: { value: 0.1 }, uFar: { value: 400 },
    });

    this.volPass = new FullScreenPass(VOLUMETRIC_FRAG, {
      uDepth: { value: null }, uShadow: { value: null }, uShadowMatrix: { value: M4() },
      uProjInv: { value: M4() }, uViewInv: { value: M4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Vector3() },
      uNear: { value: 0.1 }, uFar: { value: 400 }, uDensity: { value: 0.02 },
      uHeightFalloff: { value: 0.1 }, uFogBase: { value: 0 }, uAnisotropy: { value: 0.7 },
      uFrame: { value: 0 }, uMaxDist: { value: 65 }, uAmbient: { value: 0.35 },
      uAmbientColor: { value: new THREE.Vector3() }, uShadowRadius: { value: 1 },
      // Mirrors the ramp ShadowEdgeFade.js patches into three's surface shader.
      // If these two ever disagree, the shafts and the ground they land on fade
      // at different rates and the boundary becomes MORE visible, not less.
      uShadowEdgeFade: { value: SHADOW_EDGE_FADE },
      uPointPos: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uPointColor: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    }, { VOL_STEPS: 24, VOL_LIGHTS: 4 });

    this.resolvePass = new FullScreenPass(VOL_UPSAMPLE_FRAG, {
      uColor: { value: null }, uVolume: { value: null }, uAO: { value: null },
      uDepth: { value: null }, uTexelHalf: { value: V2() },
      uNear: { value: 0.1 }, uFar: { value: 400 }, uAOStrength: { value: 0.85 },
    });

    this.mbPass = new FullScreenPass(MOTION_BLUR_FRAG, {
      uColor: { value: null }, uDepth: { value: null }, uProjInv: { value: M4() },
      uViewInv: { value: M4() }, uPrevViewProj: { value: M4() }, uResolution: { value: V2() },
      uStrength: { value: 0.85 }, uMaxRadius: { value: 15 }, uFrame: { value: 0 },
    }, { MB_SAMPLES: 16 });

    this.dofPass = new FullScreenPass(DOF_FRAG, {
      uColor: { value: null }, uDepth: { value: null }, uTexel: { value: V2() },
      uNear: { value: 0.1 }, uFar: { value: 400 }, uFocusDist: { value: 8 },
      uFocusRange: { value: 14 }, uMaxBlur: { value: 0 }, uFrame: { value: 0 },
    });

    this.ssrPass = new FullScreenPass(SSR_FRAG, {
      uColor: { value: null }, uDepth: { value: null }, uProj: { value: M4() },
      uProjInv: { value: M4() }, uViewInv: { value: M4() }, uResolution: { value: V2() },
      uNear: { value: 0.1 }, uFar: { value: 400 }, uStrength: { value: 0.85 },
      uMaxDist: { value: 9 }, uThickness: { value: 0.55 },
      uWetScale: { value: 0.30 }, uWetHeight: { value: 0.40 }, uFrame: { value: 0 },
    }, { SSR_STEPS: 20 });

    this.bloomPre = new FullScreenPass(BLOOM_PREFILTER_FRAG, {
      uColor: { value: null }, uTexel: { value: V2() }, uThreshold: { value: 1.05 },
      uSoftKnee: { value: 0.7 }, uClamp: { value: 24 },
    });
    this.bloomDown = new FullScreenPass(BLOOM_DOWN_FRAG, { uColor: { value: null }, uTexel: { value: V2() } });
    this.bloomUp = new FullScreenPass(BLOOM_UP_FRAG, {
      uColor: { value: null }, uPrev: { value: null }, uTexel: { value: V2() }, uRadius: { value: 1.0 },
    });

    this.compositePass = new FullScreenPass(COMPOSITE_FRAG, {
      uColor: { value: null }, uBloom: { value: null }, uDepth: { value: null },
      uAdaptedLum: { value: null }, uAutoExposure: { value: 1 }, uKeyValue: { value: 0.105 },
      uResolution: { value: V2() }, uTime: { value: 0 }, uExposure: { value: 1 },
      uBloomStrength: { value: 0.62 }, uChromatic: { value: 0.11 }, uVignette: { value: 0.34 },
      uGrain: { value: 0.014 }, uSharpen: { value: 0.35 }, uSaturation: { value: 1.06 },
      uContrast: { value: 1.06 }, uLift: { value: new THREE.Vector3() },
      uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uDamage: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 400 },
      uDofStrength: { value: 0 }, uFlash: { value: 0 },
    });

    this.lumDownPass = new FullScreenPass(LUM_DOWN_FRAG, {
      uColor: { value: null }, uTexel: { value: V2() }, uIsFirst: { value: 1 },
    });
    this.lumAdaptPass = new FullScreenPass(LUM_ADAPT_FRAG, {
      uCurrent: { value: null }, uPrevious: { value: null }, uDt: { value: 0.016 },
      uSpeedUp: { value: 2.6 }, uSpeedDown: { value: 1.1 },
      uMinLum: { value: 0.01 }, uMaxLum: { value: 3.0 },
    });

    this.fxaaPass = new FullScreenPass(FXAA_FRAG, { uColor: { value: null }, uTexel: { value: V2() } });

    this.bloomRTs = [];
    this.bloomUpRTs = [];
  }

  setQuality(quality) {
    const p = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;
    this.quality = quality;
    this.preset = p;
    this.aoPass.material.defines.AO_SAMPLES = p.aoSamples;
    this.aoPass.material.needsUpdate = true;
    this.volPass.material.defines.VOL_STEPS = p.volSteps;
    this.volPass.material.needsUpdate = true;
    // Re-derive taps and radius from the new preset, keeping the player's
    // slider position. Doing it here rather than inline means setQuality and
    // setMotionBlurScale can arrive in either order without disagreeing.
    this._applyMotionBlurTaps();
    this.ssrPass.material.defines.SSR_STEPS = p.ssrSteps;
    this.ssrPass.material.needsUpdate = true;
    this.compositePass.set('uSharpen', p.sharpen);
    // Force a rebuild so the MSAA sample count and buffer scales take effect.
    this._sizeKey = null;
    if (this.width > 1) this.setSize(this.width, this.height, this._pixelRatio || 1);
  }

  // The player's motion blur slider, 0..1.5, where 1 is the art-directed
  // default. It scales the sampled LENGTH, which is the only thing that reads
  // on screen once the camera is moving at combat speed — and it buys the taps
  // to pay for that length, so the 1.6px spacing that keeps the smear free of
  // combing holds identically at every setting.
  //
  // Deliberately NOT a per-frame knob: changing the tap count edits a #define
  // and recompiles the shader, so this is only safe to call on an options
  // change. The per-frame knob is motionBlurStrength.
  setMotionBlurScale(scale) {
    const s = Number.isFinite(scale) ? Math.max(0, scale) : 1;
    if (s === this._mbScale) return;
    this._mbScale = s;
    this._applyMotionBlurTaps();
  }

  _applyMotionBlurTaps() {
    const base = this.preset?.mbSamples || 0;
    // At zero the pass does not run at all, so leave the compiled tap count
    // alone: recompiling on the way to Off would cost a hitch to configure a
    // shader nothing is about to execute.
    if (!base || this._mbScale <= 0.001) return;
    const taps = Math.max(MB_TAPS_MIN, Math.min(MB_TAPS_MAX, Math.round(base * this._mbScale)));
    // Radius always follows taps. This is the invariant — never set one alone.
    this.mbPass.set('uMaxRadius', taps * MB_TAP_SPACING);
    if (taps === this._mbTaps) return;   // no recompile unless the count moved
    this._mbTaps = taps;
    this.mbPass.material.defines.MB_SAMPLES = taps;
    this.mbPass.material.needsUpdate = true;
  }

  setSize(cssWidth, cssHeight, pixelRatio = 1) {
    // FLOOR, not round — three's setSize does `Math.floor(css * pixelRatio)` for
    // the canvas and for the gl viewport it derives from it. Rounding here made
    // every buffer in this stack up to one row and one column LARGER than the
    // backbuffer it is finally blitted into, at any non-integer pixel ratio
    // (the tiers are 1 / 1.15 / 1.5, and the dynamic scaler lands on 1.2, 1.35,
    // ...). The final pass then maps [0,1] of an h+1 texture across h viewport
    // rows, so the whole image is resampled by a fraction of a pixel that drifts
    // from top to bottom, and FXAA's uTexel — 1/bufH — no longer matches the
    // pixels it is antialiasing. Matching three exactly costs nothing and makes
    // the blit one-to-one.
    const w = Math.max(1, Math.floor(cssWidth * pixelRatio));
    const h = Math.max(1, Math.floor(cssHeight * pixelRatio));
    const key = `${w}x${h}:${this.quality}`;
    if (key === this._sizeKey) return;
    this._sizeKey = key;
    this.width = cssWidth; this.height = cssHeight;
    this._pixelRatio = pixelRatio;
    this.bufW = w; this.bufH = h;

    this._disposeTargets();
    const p = this.preset;

    const depth = new THREE.DepthTexture(w, h, THREE.FloatType);
    depth.format = THREE.DepthFormat;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;

    this.sceneRT = makeRT(w, h, { depthBuffer: true, samples: p.msaa });
    this.sceneRT.depthTexture = depth;

    // The ping-pong HDR buffers carry their own depth RENDERBUFFER (not a
    // texture): the viewmodel pass draws into whichever buffer is current and
    // needs depth to sort its own parts, but must never touch the scene depth
    // TEXTURE that SSAO, volumetrics, motion blur and DOF sample.
    this.hdrA = makeRT(w, h, { depthBuffer: true });
    this.hdrB = makeRT(w, h, { depthBuffer: true });
    this.ldrRT = makeRT(w, h, { type: THREE.UnsignedByteType });

    const aos = p.aoScale || 0.5;
    this.aoW = Math.max(1, Math.round(w * aos));
    this.aoH = Math.max(1, Math.round(h * aos));
    this.aoRT = makeRT(this.aoW, this.aoH, { type: THREE.HalfFloatType });
    this.aoRT2 = makeRT(this.aoW, this.aoH, { type: THREE.HalfFloatType });

    const vs = p.volScale || 0.5;
    this.volW = Math.max(1, Math.round(w * vs));
    this.volH = Math.max(1, Math.round(h * vs));
    this.volRT = makeRT(this.volW, this.volH);

    // Luminance reduction chain: successive 4x downsamples to 1x1, plus two
    // 1x1 targets ping-ponged to hold the adapted value across frames. All of
    // it is a few thousand pixels total, and it never leaves the GPU.
    this.lumRTs = [];
    {
      let lw = Math.max(1, w >> 2), lh = Math.max(1, h >> 2);
      for (let i = 0; i < 8; i++) {
        this.lumRTs.push(makeRT(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter }));
        if (lw === 1 && lh === 1) break;
        lw = Math.max(1, lw >> 2); lh = Math.max(1, lh >> 2);
      }
      // The adapted-luminance pair is 1x1 and carries no resolution-dependent
      // state, so it deliberately SURVIVES a resize. It used to be rebuilt
      // here, which reset _adaptPrimed and fed the adapt pass a black
      // uPrevious; that shader treats a non-positive previous value as "first
      // frame" and snaps straight to the instantaneous scene luminance. Since
      // the whole point of adaptation is that the adapted value differs from
      // the instantaneous one, every resize produced a one-frame full-screen
      // brightness jump. Dynamic resolution resizes during play, so that fired
      // while walking around and read as the entire image flickering.
      if (!this.adaptRT) {
        this.adaptRT = [makeRT(1, 1, { type: THREE.HalfFloatType }), makeRT(1, 1, { type: THREE.HalfFloatType })];
        this.adaptIndex = 0;
        this._adaptPrimed = false;
      }
    }

    this.bloomRTs = [];
    this.bloomUpRTs = [];
    let bw = w, bh = h;
    for (let i = 0; i < Math.min(BLOOM_MIPS, p.bloomMips); i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      this.bloomRTs.push(makeRT(bw, bh));
      this.bloomUpRTs.push(makeRT(bw, bh));
      if (bw <= 2 || bh <= 2) break;
    }
  }

  _disposeTargets() {
    for (const rt of this.lumRTs || []) rt.dispose();
    // adaptRT is intentionally NOT disposed here: _disposeTargets runs on every
    // resize, and the adapted exposure has to survive one. It is released in
    // dispose() instead, which is the only place the stack really goes away.
    this.lumRTs = [];
    for (const rt of [this.sceneRT, this.hdrA, this.hdrB, this.ldrRT, this.aoRT, this.aoRT2, this.volRT]) rt?.dispose();
    for (const rt of this.bloomRTs) rt.dispose();
    for (const rt of this.bloomUpRTs) rt.dispose();
    this.sceneRT?.depthTexture?.dispose();
    this.bloomRTs = []; this.bloomUpRTs = [];
  }

  get blackTexture() {
    if (!this._blackTex) {
      this._blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      this._blackTex.needsUpdate = true;
    }
    return this._blackTex;
  }

  dispose() {
    this._disposeTargets();
    // _disposeTargets deliberately spares adaptRT so it survives a resize; this
    // is the one place it genuinely goes away.
    for (const rt of this.adaptRT || []) rt.dispose();
    this.adaptRT = null;
    this._adaptPrimed = false;
    for (const k of ['aoPass', 'aoBlurPass', 'volPass', 'resolvePass', 'ssrPass', 'mbPass',
      'dofPass', 'bloomPre', 'bloomDown', 'bloomUp', 'lumDownPass', 'lumAdaptPass',
      'compositePass', 'fxaaPass']) this[k]?.dispose();
    this._blackTex?.dispose();
  }
}

installMixins(PostFX, [PostFXRender]);
