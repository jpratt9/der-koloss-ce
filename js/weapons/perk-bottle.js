// The perk bottle: the soda prop a perk is drunk from, shared by the first-person
// rig and remote players, and where it sits at each moment of the drink.
import * as THREE from 'three';
import { clamp, lerp } from '../utils.js';
import { PERK_DRINK_TIMELINE, perkDrinkPhase } from '../gameplay-rules.js';
import { foreGripHand } from '../render/WeaponHands.js';

const PERK_BOTTLE_STYLE = {
  jug:   { wrap: 0xa7191f, trim: '#f3d27a', title: 'JUGGERNOG', mark: 'shield' },
  speed: { wrap: 0x168b49, trim: '#e5f4cf', title: 'SPEED COLA', mark: 'bolt' },
  dtap:  { wrap: 0xc78816, trim: '#fff0a8', title: 'DOUBLE TAP', mark: 'double' },
  qr:    { wrap: 0x247eb1, trim: '#eef8ff', title: 'QUICK REVIVE', mark: 'revive' },
};

// Bottle geometry and branding are cached because the same prop is used by
// the first-person rig and every remote player. A drink creates only a few
// lightweight Mesh instances; it never rebuilds geometry or uploads another
// label texture during combat.
const PERK_BOTTLE_GEO = {
  glass: new THREE.LatheGeometry([
    new THREE.Vector2(0.046, -0.17), new THREE.Vector2(0.059, -0.16),
    new THREE.Vector2(0.064, -0.14), new THREE.Vector2(0.063, 0.065),
    new THREE.Vector2(0.058, 0.09), new THREE.Vector2(0.047, 0.116),
    new THREE.Vector2(0.031, 0.139), new THREE.Vector2(0.025, 0.162),
    new THREE.Vector2(0.025, 0.218), new THREE.Vector2(0.029, 0.223),
  ], 16),
  soda: new THREE.LatheGeometry([
    new THREE.Vector2(0.041, -0.154), new THREE.Vector2(0.054, -0.145),
    new THREE.Vector2(0.055, 0.06), new THREE.Vector2(0.049, 0.085),
    new THREE.Vector2(0.037, 0.11), new THREE.Vector2(0.022, 0.137),
    new THREE.Vector2(0.021, 0.174),
  ], 12),
  wrap: new THREE.CylinderGeometry(0.0665, 0.0665, 0.09, 16, 1, true),
  foot: new THREE.TorusGeometry(0.051, 0.006, 5, 16),
  cap: new THREE.CylinderGeometry(0.032, 0.029, 0.019, 16),
  capRidge: new THREE.TorusGeometry(0.031, 0.004, 5, 16),
  label: new THREE.PlaneGeometry(0.105, 0.073),
  bubble: new THREE.SphereGeometry(0.004, 5, 4),
};
PERK_BOTTLE_GEO.foot.rotateX(Math.PI / 2);
PERK_BOTTLE_GEO.capRidge.rotateX(Math.PI / 2);
const PERK_BOTTLE_MAT = {
  // Standard transparent shading is intentionally used instead of real-time
  // transmission: it reads as amber glass at view-model size without the
  // extra screen-space pass that physical transmission can impose per bottle.
  glass: new THREE.MeshStandardMaterial({
    color: 0x6f491e, transparent: true, opacity: 0.48, roughness: 0.12,
    metalness: 0.08, depthWrite: false,
  }),
  cap: new THREE.MeshStandardMaterial({ color: 0xc6aa62, roughness: 0.32, metalness: 0.72 }),
  foot: new THREE.MeshStandardMaterial({ color: 0x6e451d, roughness: 0.2, metalness: 0.04 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x3d352c, roughness: 0.94 }),
  gloveDark: new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 0.92 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x2e2f26, roughness: 0.95 }),
};
const perkBottleMaterials = new Map();

function makePerkLabelTexture(perkId, style) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 160;
  const c = canvas.getContext('2d');
  const color = `#${style.wrap.toString(16).padStart(6, '0')}`;
  c.fillStyle = color; c.fillRect(0, 0, 256, 160);
  c.strokeStyle = style.trim; c.lineWidth = 7; c.strokeRect(8, 8, 240, 144);
  c.strokeStyle = 'rgba(20, 12, 7, .46)'; c.lineWidth = 2; c.strokeRect(16, 16, 224, 128);
  c.save(); c.translate(128, 55); c.fillStyle = style.trim; c.strokeStyle = style.trim;
  if (style.mark === 'shield') {
    c.lineWidth = 7; c.beginPath(); c.moveTo(-25, -25); c.lineTo(25, -25); c.lineTo(20, 13);
    c.quadraticCurveTo(0, 34, -20, 13); c.closePath(); c.stroke();
    c.fillRect(-5, -17, 10, 36); c.fillRect(-18, -4, 36, 10);
  } else if (style.mark === 'bolt') {
    c.beginPath(); c.moveTo(10, -31); c.lineTo(-20, 6); c.lineTo(-4, 5);
    c.lineTo(-13, 31); c.lineTo(22, -10); c.lineTo(5, -8); c.closePath(); c.fill();
  } else if (style.mark === 'double') {
    c.fillRect(-23, -28, 13, 56); c.fillRect(10, -28, 13, 56);
    c.fillRect(-31, -28, 62, 6); c.fillRect(-31, 22, 62, 6);
  } else {
    c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.stroke();
    c.fillRect(-6, -22, 12, 44); c.fillRect(-22, -6, 44, 12);
  }
  c.restore();
  c.fillStyle = '#120e09'; c.globalAlpha = 0.82; c.fillRect(18, 101, 220, 39); c.globalAlpha = 1;
  c.fillStyle = style.trim; c.font = '700 24px "Arial Narrow", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(style.title, 128, 121);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

function perkBottleStyle(perkId) {
  const id = PERK_BOTTLE_STYLE[perkId] ? perkId : 'jug';
  if (perkBottleMaterials.has(id)) return perkBottleMaterials.get(id);
  const style = PERK_BOTTLE_STYLE[id];
  const wrap = new THREE.MeshStandardMaterial({ color: style.wrap, roughness: 0.58, metalness: 0.04 });
  const soda = new THREE.MeshStandardMaterial({
    color: style.wrap, transparent: true, opacity: 0.82, roughness: 0.24,
    emissive: new THREE.Color(style.wrap).multiplyScalar(0.055),
  });
  const labelTexture = makePerkLabelTexture(id, style);
  const label = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: labelTexture, roughness: 0.55, metalness: 0.02,
    side: THREE.FrontSide,
  });
  const bubble = new THREE.MeshStandardMaterial({ color: 0xfff4c7, emissive: 0xffd978, emissiveIntensity: 0.18, transparent: true, opacity: 0.66 });
  const materials = { wrap, soda, label, bubble };
  perkBottleMaterials.set(id, materials);
  return materials;
}

// Where the bottle sits at a given point in the drink, as a pure function of
// elapsed time. Shared by the per-frame rig update and by startPerkDrink: the
// bottle is parented to the rig root, so an unposed group sits exactly on the
// camera and fills the screen. Posing it at t=0 on the frame it is created is
// what keeps the raise from starting with a full-screen flash of glass.
export function posePerkBottle(b, t) {
  const ease = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
  const phase = perkDrinkPhase(t);
  if (phase === 'raise') {
    const q = ease(t / PERK_DRINK_TIMELINE.raiseEnd);
    b.position.set(lerp(0.34, 0.08, q), lerp(-0.42, -0.04, q), lerp(-0.56, -0.28, q));
    b.rotation.set(lerp(-0.2, 1.02, q), lerp(-0.25, 0.08, q), lerp(-0.2, 0.1, q));
  } else if (phase === 'drink') {
    const q = clamp((t - PERK_DRINK_TIMELINE.raiseEnd) / (PERK_DRINK_TIMELINE.gulpEnd - PERK_DRINK_TIMELINE.raiseEnd), 0, 1);
    b.position.set(0.08 + Math.sin(q * 11) * 0.008, -0.04 + Math.sin(q * 17) * 0.006, -0.28);
    b.rotation.set(1.02 + Math.sin(q * Math.PI) * 0.2, 0.08, 0.1);
  } else if (phase === 'lower') {
    const q = ease((t - PERK_DRINK_TIMELINE.gulpEnd) / (PERK_DRINK_TIMELINE.throwAt - PERK_DRINK_TIMELINE.gulpEnd));
    b.position.set(lerp(0.08, 0.27, q), lerp(-0.04, -0.2, q), lerp(-0.28, -0.42, q));
    b.rotation.set(lerp(1.02, -0.1, q), 0.08, lerp(0.1, -0.45, q));
  } else if (phase === 'throw') {
    const q = (t - PERK_DRINK_TIMELINE.throwAt) / (PERK_DRINK_TIMELINE.breakAt - PERK_DRINK_TIMELINE.throwAt);
    b.position.set(0.27 - q * 0.85, -0.2 - q * q * 0.7, -0.42 - q * 0.4);
    b.rotation.set(-0.1 + q * 8, q * 5, -0.45 - q * 4);
  } else {
    b.visible = false;
  }
}

// Classic long-neck fizzy-drink silhouette with colored wrappers and an
// unmistakable perk emblem on both faces. It is deliberately not a real-world
// branded asset and stays resilient when external model loading fails.
export function buildPerkBottle(perkId) {
  const g = new THREE.Group();
  const mats = perkBottleStyle(perkId);
  const body = new THREE.Mesh(PERK_BOTTLE_GEO.glass, PERK_BOTTLE_MAT.glass);
  const soda = new THREE.Mesh(PERK_BOTTLE_GEO.soda, mats.soda);
  const band = new THREE.Mesh(PERK_BOTTLE_GEO.wrap, mats.wrap); band.position.y = -0.014;
  const foot = new THREE.Mesh(PERK_BOTTLE_GEO.foot, PERK_BOTTLE_MAT.foot); foot.position.y = -0.155;
  const cap = new THREE.Mesh(PERK_BOTTLE_GEO.cap, PERK_BOTTLE_MAT.cap); cap.position.y = 0.229;
  const capRidge = new THREE.Mesh(PERK_BOTTLE_GEO.capRidge, PERK_BOTTLE_MAT.cap); capRidge.position.y = 0.221;
  const labelFront = new THREE.Mesh(PERK_BOTTLE_GEO.label, mats.label);
  labelFront.position.set(0, -0.014, 0.0675);
  const labelBack = new THREE.Mesh(PERK_BOTTLE_GEO.label, mats.label);
  labelBack.position.set(0, -0.014, -0.0675); labelBack.rotation.y = Math.PI;
  const bubbles = [
    [-0.018, 0.03, 0.028], [0.021, 0.067, -0.018], [-0.012, 0.104, -0.002],
  ].map(([x, y, z], index) => {
    const bubble = new THREE.Mesh(PERK_BOTTLE_GEO.bubble, mats.bubble);
    bubble.position.set(x, y, z); bubble.scale.setScalar(0.72 + index * 0.13); return bubble;
  });
  for (const mesh of [body, soda, band, foot, cap, capRidge, labelFront, labelBack]) {
    mesh.castShadow = true; mesh.renderOrder = mesh === body ? 4 : 3;
  }
  // A gloved hand actually wrapped round the bottle. The old prop was a single
  // box, which read as a brick stuck to the glass in first person and on every
  // remote player holding one.
  const hand = foreGripHand(0.058, -0.048, 0.006, 0.06, {
    side: 1, curl: 0.54, spread: 1.15, thumb: 0.55, cuff: true, scale: 0.97,
    glove: PERK_BOTTLE_MAT.glove, dark: PERK_BOTTLE_MAT.gloveDark,
    sleeve: PERK_BOTTLE_MAT.sleeve,
  });
  hand.rotation.z -= 0.12;
  g.add(body, soda, band, foot, cap, capRidge, labelFront, labelBack, ...bubbles, hand);
  g.userData.perkId = perkId;
  g.userData.perkBottle = true;
  return g;
}
