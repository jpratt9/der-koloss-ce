// Overlay textures: single maps painted over another surface rather than
// full material sets — stencilled markings, hazard striping, backlit sign
// faces and the roughness of dirty glass.
import * as THREE from 'three';
import { mulberry32, mkCanvas, finish, blotches } from './kit.js';

// ---------------------------------------------------------------------------
// stencilled markings (alpha-only, painted over another surface)
// ---------------------------------------------------------------------------
export function stencilTexture(lines, opts = {}) {
  const W = opts.w || 512, H = opts.h || 256;
  const R = mulberry32(opts.seed || 5);
  const c = mkCanvas(W, H); const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const paint = opts.paint || '236,228,206';
  const size = opts.fontSize || Math.floor(H / (lines.length + 0.6));
  g.textAlign = opts.align || 'center';
  g.textBaseline = 'middle';
  const cx = opts.align === 'left' ? 14 : W / 2;
  lines.forEach((ln, i) => {
    const fs = Array.isArray(opts.fontSizes) ? opts.fontSizes[i] : size;
    g.font = `bold ${fs}px "Arial Narrow", "Haettenschweiler", Impact, sans-serif`;
    const y = H * ((i + 0.75) / (lines.length + 0.5));
    // stamp several times at low alpha: dry-brush stencil paint
    for (let s = 0; s < 8; s++) {
      g.fillStyle = `rgba(${paint},${0.1 + R() * 0.09})`;
      g.fillText(ln, cx + (R() - 0.5) * 2.4, y + (R() - 0.5) * 2.4, W - 24);
    }
  });
  // wear: erase flakes and scratches out of the paint
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (opts.wear ?? 260); i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.7})`;
    g.fillRect(R() * W, R() * H, 1 + R() * 7, 1 + R() * 3);
  }
  for (let i = 0; i < (opts.blobs ?? 26); i++) {
    g.beginPath(); g.arc(R() * W, R() * H, 2 + R() * 9, 0, 7);
    g.fillStyle = `rgba(0,0,0,${0.25 + R() * 0.5})`; g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = finish(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// yellow/black hazard striping, chipped
// ---------------------------------------------------------------------------
export function hazardTexture(opts = {}) {
  const W = opts.w || 256, H = opts.h || 64;
  const R = mulberry32(opts.seed || 31);
  const c = mkCanvas(W, H); const g = c.getContext('2d');
  g.fillStyle = opts.dark || '#16150f'; g.fillRect(0, 0, W, H);
  g.fillStyle = opts.light || '#c39a24';
  const pitch = opts.pitch || 30;
  g.save();
  for (let x = -H; x < W + H; x += pitch * 2) {
    g.beginPath();
    g.moveTo(x, H); g.lineTo(x + pitch, H); g.lineTo(x + pitch + H, 0); g.lineTo(x + H, 0);
    g.closePath(); g.fill();
  }
  g.restore();
  // grime + chips
  blotches(g, W, 22, [6, 30], (rr) => [`rgba(18,15,10,${0.1 + rr() * 0.3})`, 'rgba(18,15,10,0)'], R, H);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(${60 + R() * 40},${54 + R() * 30},${48 + R() * 26},${0.3 + R() * 0.5})`;
    g.fillRect(R() * W, R() * H, 1 + R() * 5, 1 + R() * 3);
  }
  const t = finish(c, true);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// backlit enamel sign face — used for perk marquees and machine placards
// ---------------------------------------------------------------------------
export function signTexture(text, opts = {}) {
  const W = opts.w || 512, H = opts.h || 160;
  const R = mulberry32(opts.seed || 61);
  const c = mkCanvas(W, H); const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#e8e2d2'; g.fillRect(0, 0, W, H);
  // aged, unevenly lit enamel
  blotches(g, W, 16, [20, 110], (rr) => [`rgba(120,104,74,${0.05 + rr() * 0.16})`, 'rgba(120,104,74,0)'], R, H);
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(255,255,255,0.12)');
  vig.addColorStop(1, 'rgba(60,50,34,0.30)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  if (opts.border !== false) {
    g.strokeStyle = opts.borderColor || 'rgba(40,32,22,0.75)';
    g.lineWidth = Math.max(3, H * 0.045);
    g.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14);
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = opts.fontSize || Math.floor(H * 0.46);
  g.font = `bold ${fs}px ${opts.font || 'Georgia, "Times New Roman", serif'}`;
  const maxW = W - H * 0.4;
  if (g.measureText(text).width > maxW) {
    fs = Math.floor(fs * maxW / g.measureText(text).width);
    g.font = `bold ${fs}px ${opts.font || 'Georgia, "Times New Roman", serif'}`;
  }
  g.fillStyle = opts.fg || '#1a1712';
  g.fillText(text, W / 2, H * (opts.baseline ?? 0.52), maxW);
  if (opts.sub) {
    g.font = `bold ${Math.floor(fs * 0.34)}px "Arial Narrow", Arial, sans-serif`;
    g.fillStyle = opts.subColor || 'rgba(30,26,18,0.72)';
    g.fillText(opts.sub, W / 2, H * 0.84, maxW);
  }
  // chips and crazing over the whole face
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(${40 + R() * 40},${36 + R() * 34},${30 + R() * 28},${0.12 + R() * 0.4})`;
    g.fillRect(R() * W, R() * H, 1 + R() * 4, 1 + R() * 2);
  }
  const t = finish(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// frosted / dirty glass — window panes and vacuum tube envelopes
// ---------------------------------------------------------------------------
export function glassRoughness(seed = 71, opts = {}) {
  const S = opts.size || 256;
  const R = mulberry32(seed);
  const c = mkCanvas(S); const g = c.getContext('2d');
  g.fillStyle = opts.base || '#1e1e1e'; g.fillRect(0, 0, S, S);
  blotches(g, S, 30, [14, 80], (rr) => [`rgba(255,255,255,${0.14 + rr() * 0.36})`, 'rgba(255,255,255,0)'], R);
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(255,255,255,${0.06 + R() * 0.24})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 10, 1 + R() * 2);
  }
  // dust settled at the bottom of the pane
  const grad = g.createLinearGradient(0, S * 0.55, 0, S);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.55)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return finish(c);
}
