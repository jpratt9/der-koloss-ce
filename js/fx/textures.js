// FX's two sprite textures. Both memoise into a module-level texture shared
// by every FX ever built, so they are plain functions rather than FX methods.
// js/fx.js's constructor is the only caller of either.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// sprite textures used only here
// ---------------------------------------------------------------------------
let _tracerTex = null;
export function tracerTexture() {
  if (_tracerTex) return _tracerTex;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  // Bright core down the middle, soft falloff across, faded at the tail.
  for (let y = 0; y < 64; y++) {
    const along = y / 63;
    const head = Math.pow(along, 0.55);           // brightest at the leading end
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x - 7.5) / 7.5;
      const across = Math.pow(1 - d, 2.6);
      const a = Math.min(1, across * head * 1.35);
      g.fillStyle = `rgba(255,${240 - d * 60 | 0},${190 - d * 90 | 0},${a})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  _tracerTex = new THREE.CanvasTexture(c);
  _tracerTex.colorSpace = THREE.SRGBColorSpace;
  return _tracerTex;
}

let _holeTex = null;
export function holeTexture() {
  if (_holeTex) return _holeTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const r = s / 2;
  // Bright pulverised rim around a dark core is what makes a bullet hole read.
  const rim = g.createRadialGradient(r, r, r * 0.12, r, r, r * 0.95);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.34, 'rgba(220,215,205,0.55)');
  rim.addColorStop(1, 'rgba(180,175,165,0)');
  g.fillStyle = rim;
  g.fillRect(0, 0, s, s);
  const core = g.createRadialGradient(r, r, 0, r, r, r * 0.34);
  core.addColorStop(0, 'rgba(0,0,0,1)');
  core.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, s, s);
  // radial cracks
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(r + Math.cos(a) * r * 0.2, r + Math.sin(a) * r * 0.2);
    g.lineTo(r + Math.cos(a) * r * (0.5 + Math.random() * 0.42), r + Math.sin(a) * r * (0.5 + Math.random() * 0.42));
    g.stroke();
  }
  _holeTex = new THREE.CanvasTexture(c);
  _holeTex.colorSpace = THREE.SRGBColorSpace;
  return _holeTex;
}
