// Weapon finishes: the Pack-a-Punch living camo, which materials can take a
// finish at all, and the textures behind the gold and diamond finishes.
import * as THREE from 'three';

// ---- PaP animated finishes: per-weapon palettes (Dark-Matter-style living camo) ----
const PAP_CAMOS = {
  default: { hues: [0.78, 0.88, 0.68], speed: 1.0, pattern: 'swirl' },  // cosmic violet
  kar98: { hues: [0.03, 0.08, 0.0], speed: 0.7, pattern: 'magma' },     // magma
  gewehr43: { hues: [0.05, 0.1, 0.02], speed: 0.8, pattern: 'magma' },
  m1a1: { hues: [0.1, 0.16, 0.06], speed: 0.9, pattern: 'tiger' },
  m1garand: { hues: [0.08, 0.14, 0.04], speed: 0.85, pattern: 'tiger' },
  mosin: { hues: [0.6, 0.68, 0.55], speed: 0.6, pattern: 'frost' },     // frozen steel
  springfield: { hues: [0.58, 0.66, 0.52], speed: 0.65, pattern: 'frost' },
  ptrs41: { hues: [0.52, 0.6, 0.45], speed: 0.5, pattern: 'frost' },
  mp40: { hues: [0.42, 0.5, 0.36], speed: 1.1, pattern: 'venom' },      // venom
  type100: { hues: [0.45, 0.52, 0.38], speed: 1.15, pattern: 'venom' },
  thompson: { hues: [0.13, 0.1, 0.16], speed: 0.75, pattern: 'tiger' }, // gold tiger
  ppsh: { hues: [0.0, 0.96, 0.04], speed: 1.0, pattern: 'magma' },
  stg44: { hues: [0.62, 0.7, 0.55], speed: 0.9, pattern: 'swirl' },
  fg42: { hues: [0.75, 0.82, 0.68], speed: 1.0, pattern: 'swirl' },
  bar: { hues: [0.05, 0.09, 0.02], speed: 0.8, pattern: 'tiger' },
  mg42: { hues: [0.58, 0.66, 0.5], speed: 1.3, pattern: 'frost' },
  browning: { hues: [0.55, 0.63, 0.48], speed: 1.1, pattern: 'frost' },
  dbshotgun: { hues: [0.02, 0.06, 0.0], speed: 0.7, pattern: 'magma' },
  trench: { hues: [0.04, 0.08, 0.01], speed: 0.75, pattern: 'magma' },
  panzerschreck: { hues: [0.08, 0.12, 0.04], speed: 0.6, pattern: 'tiger' },
  raygun: { hues: [0.38, 0.5, 0.3], speed: 1.6, pattern: 'swirl' },     // radioactive
  dg2: { hues: [0.7, 0.8, 0.6], speed: 1.4, pattern: 'swirl' },
  m1911: { hues: [0.85, 0.92, 0.78], speed: 1.2, pattern: 'swirl' },
  magnum: { hues: [0.95, 0.05, 0.9], speed: 1.0, pattern: 'tiger' },
  ump45: { hues: [0.55, 0.62, 0.48], speed: 1.2, pattern: 'venom' },
  acr: { hues: [0.6, 0.68, 0.52], speed: 1.1, pattern: 'swirl' },
  famas: { hues: [0.68, 0.75, 0.6], speed: 1.2, pattern: 'swirl' },
  ak74u: { hues: [0.02, 0.07, 0.0], speed: 1.1, pattern: 'magma' },
  galil: { hues: [0.1, 0.15, 0.06], speed: 0.95, pattern: 'tiger' },
  commando: { hues: [0.55, 0.62, 0.48], speed: 1.05, pattern: 'tiger' },
};
// scrolling pattern texture per style (drawn once)
const _papPats = {};
function papPattern(style) {
  if (_papPats[style]) return _papPats[style];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  if (style === 'magma') {
    for (let i = 0; i < 26; i++) { const x = Math.random() * 128, y = Math.random() * 128, r = 4 + Math.random() * 14; g.globalAlpha = 0.5 + Math.random() * 0.5; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  } else if (style === 'tiger') {
    for (let i = 0; i < 12; i++) { g.globalAlpha = 0.55 + Math.random() * 0.45; g.save(); g.translate(Math.random() * 128, Math.random() * 128); g.rotate(Math.random() * 3); g.fillRect(-20, -3, 40, 5); g.restore(); }
  } else if (style === 'frost') {
    for (let i = 0; i < 8; i++) { g.globalAlpha = 0.6; g.save(); g.translate(64, 64); g.rotate(i * 0.785); g.fillRect(-2, -64, 4, 64); g.restore(); }
  } else { // swirl
    g.globalAlpha = 0.7;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(64, 64, 14 + i * 12, i, i + 4); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke(); }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _papPats[style] = tex;
  return tex;
}

/**
 * Can this material carry a PBR finish (gold / diamond / PaP camo)?
 *
 * Only the lit materials have `emissive`, `metalness` and `envMap` uniforms.
 * A weapon group is NOT uniformly MeshStandardMaterial: every optic built by
 * `redDot()` carries two MeshBasicMaterial meshes — the reticle core and its
 * bloom halo — because a reticle is a projected light, not a lit surface.
 *
 * Writing `emissive` onto one of those is not a no-op. three checks
 * `if (material.emissive)` in refreshUniformsCommon and then dereferences
 * `uniforms.emissive.value`, which does not exist in the basic shader's
 * uniform set — so the assignment turns into a TypeError thrown from inside
 * `renderer.render()`. That aborts the pass mid-flight and leaves the renderer
 * bound to whatever target it was drawing into, which is why the symptom was a
 * permanently black screen rather than one dropped frame. It hit every red-dot
 * weapon (ACR, UMP45, AK74u, Commando, and the PaP variants that grow an
 * optic), and it is also the correct art call: a gold gun keeps a red dot.
 */
export function takesPbrFinish(material) {
  return !!material && material.isMeshStandardMaterial === true;
}

/**
 * Should this mesh wear the weapon's finish?
 *
 * `equip()` re-parents the gloves INTO the weapon group, so a plain traverse
 * reaches them too — GOLD STANDARD was gilding the player's hands along with
 * the gun. A camo belongs to the weapon, not to the person holding it.
 */
export function wearsWeaponFinish(o) {
  return o.isMesh && !o.userData?.isGlove && takesPbrFinish(o.material);
}

export function applyPapLivingFinish(group, id, seed = 0, isolatedTexture = false) {
  const style = PAP_CAMOS[id] || PAP_CAMOS.default;
  const mats = [];
  const sharedTexture = papPattern(style.pattern);
  const texture = isolatedTexture ? sharedTexture.clone() : sharedTexture;
  if (isolatedTexture) texture.needsUpdate = true;
  group.traverse((o) => {
    if (!wearsWeaponFinish(o)) return;
    o.material = o.material.clone();
    // Material.copy deep-copies userData, so the clone arrives still carrying
    // the library's `wmShared` flag. Clear it: this material belongs to this one
    // weapon, and leaving the flag on made disposePapDisplayWeapon's guard skip
    // exactly the clones it exists to release — every mystery-box and PaP
    // display weapon leaked its whole material set.
    o.material.userData = { ...o.material.userData, wmShared: false };
    o.material.emissive = new THREE.Color(0x000000);
    o.material.emissiveMap = texture;
    o.material.emissiveIntensity = 0.34;
    mats.push(o.material);
  });
  return { style, mats, texture, ownedTexture: isolatedTexture ? texture : null, t: seed };
}

export function advancePapLivingFinish(camo, dt) {
  camo.t += dt * camo.style.speed;
  const h0 = Math.floor(camo.t);
  const hue = camo.style.hues[h0 % 3]
    + (camo.style.hues[(h0 + 1) % 3] - camo.style.hues[h0 % 3]) * (camo.t % 1);
  const pulse = 0.45 + Math.sin(camo.t * 3.2) * 0.25;
  if (camo.texture) {
    camo.texture.offset.x = (camo.t * 0.06) % 1;
    camo.texture.offset.y = (camo.t * 0.023) % 1;
  }
  // Tuned for the HDR/AgX stack: bloom now catches anything over ~1.15 nits,
  // so the living finish glows and streaks without blowing out to white.
  for (const m of camo.mats) {
    m.emissive.setHSL(((hue % 1) + 1) % 1, 0.85, 0.24 + pulse * 0.10);
    m.emissiveIntensity = 0.26 + pulse * 0.34;
  }
}

// fake studio environment for polished metals (soft horizon band + streaks)
let _metalEnv = null;
export function metalEnvTex() {
  if (_metalEnv) return _metalEnv;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#39424f');
  sky.addColorStop(0.4, '#a8b6c8');
  sky.addColorStop(0.5, '#ffffff');  // hot horizon band = long metal streaks
  sky.addColorStop(0.6, '#6a7684');
  sky.addColorStop(1, '#0c0e12');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  // sparse vertical light streaks (window lights of the factory)
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 256, w = 2 + Math.random() * 7, h = 30 + Math.random() * 36;
    const lg = g.createLinearGradient(0, 44 - h / 2, 0, 44 + h / 2);
    lg.addColorStop(0, 'rgba(255,250,235,0)');
    lg.addColorStop(0.5, `rgba(255,250,235,${0.55 + Math.random() * 0.45})`);
    lg.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = lg; g.fillRect(x, 44 - h / 2, w, h);
  }
  _metalEnv = new THREE.CanvasTexture(c);
  _metalEnv.mapping = THREE.EquirectangularReflectionMapping;
  _metalEnv.colorSpace = THREE.SRGBColorSpace;
  return _metalEnv;
}

// tiny facet speckles for the diamond finish (emissive twinkle map)
let _sparkle = null;
export function sparkleTex() {
  if (_sparkle) return _sparkle;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, s = Math.random() < 0.85 ? 1 : 2;
    g.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
    g.fillRect(x, y, s, s);
  }
  _sparkle = new THREE.CanvasTexture(c);
  _sparkle.wrapS = _sparkle.wrapT = THREE.RepeatWrapping;
  return _sparkle;
}
