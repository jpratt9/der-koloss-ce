// The four material map generators: enamel, cast iron, brass and planks.
// Each returns a map/normalMap/roughnessMap set for one surface.
//
// enamelMaps is the one that is NOT memoised in the shared singletons: every
// perk machine is a different colour, so each builds its own.
import {
  mulberry32, mkCanvas, finish, normalFromHeight, blotches, hexRGB, BLUR,
} from './kit.js';

// ---------------------------------------------------------------------------
// enamelled painted steel — the perk machine bodies
// ---------------------------------------------------------------------------
// Baked enamel over pressed steel: glossy where intact, chipped through to red
// oxide primer and bare metal at the corners, rust blooming up from the floor,
// a lifetime of trolley scuffs across the middle.
export function enamelMaps(hex, seed = 1, opts = {}) {
  const S = opts.size || 512;
  const R = mulberry32(seed);
  const [br, bg, bb] = hexRGB(hex);
  const col = mkCanvas(S); const c = col.getContext('2d');
  const hgt = mkCanvas(S); const h = hgt.getContext('2d');
  const rgh = mkCanvas(S); const r = rgh.getContext('2d');

  c.fillStyle = `rgb(${br},${bg},${bb})`; c.fillRect(0, 0, S, S);
  h.fillStyle = '#8a8a8a'; h.fillRect(0, 0, S, S);
  // enamel is glossy: dark = smooth in a roughness map
  r.fillStyle = '#4a4a4a'; r.fillRect(0, 0, S, S);

  // roller/spray unevenness — vertical banding, very low contrast
  for (let i = 0; i < 90; i++) {
    const x = R() * S, w = 4 + R() * 34;
    c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.015 + R() * 0.04})`;
    c.fillRect(x, 0, w, S);
  }
  // orange-peel micro texture in the height map
  for (let i = 0; i < 2600; i++) {
    const v = 128 + Math.floor((R() - 0.5) * 26);
    h.fillStyle = `rgb(${v},${v},${v})`;
    h.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
  }

  // grime settling downward (v = 1 is the bottom of the panel)
  const grime = c.createLinearGradient(0, S * 0.55, 0, S);
  grime.addColorStop(0, 'rgba(20,17,13,0)');
  grime.addColorStop(1, `rgba(20,17,13,${opts.grime ?? 0.55})`);
  c.fillStyle = grime; c.fillRect(0, 0, S, S);
  const grimeR = r.createLinearGradient(0, S * 0.5, 0, S);
  grimeR.addColorStop(0, 'rgba(255,255,255,0)');
  grimeR.addColorStop(1, 'rgba(255,255,255,0.62)');
  r.fillStyle = grimeR; r.fillRect(0, 0, S, S);

  // dirt blotches
  blotches(c, S, 26, [20, 110], (rr) => [`rgba(28,24,18,${0.05 + rr() * 0.12})`, 'rgba(28,24,18,0)'], R);
  blotches(r, S, 22, [16, 90], (rr) => [`rgba(255,255,255,${0.08 + rr() * 0.2})`, 'rgba(255,255,255,0)'], R);

  // paint chips: irregular polygons through to primer, then to bare steel
  const chip = (cx, cy, rad, fill, hh, rr2) => {
    c.beginPath(); h.beginPath(); r.beginPath();
    const n = 5 + Math.floor(R() * 4);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.55 + R() * 0.75);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) { c.moveTo(px, py); h.moveTo(px, py); r.moveTo(px, py); }
      else { c.lineTo(px, py); h.lineTo(px, py); r.lineTo(px, py); }
    }
    c.closePath(); h.closePath(); r.closePath();
    c.fillStyle = fill; c.fill();
    h.fillStyle = hh; h.fill();
    r.fillStyle = rr2; r.fill();
  };
  const chipCount = opts.chips ?? 120;
  for (let i = 0; i < chipCount; i++) {
    // chips concentrate low (kicked) and along the edges (knocked)
    const edge = R() < 0.5;
    const cx = edge ? (R() < 0.5 ? R() * 26 : S - R() * 26) : R() * S;
    const cy = edge ? R() * S : S * (0.45 + R() * 0.55);
    const rad = 2 + R() * (edge ? 7 : 9);
    if (R() < 0.55) chip(cx, cy, rad, `rgba(96,44,26,${0.7 + R() * 0.3})`, '#6e6e6e', '#c8c8c8');
    else chip(cx, cy, rad, `rgba(${58 + R() * 26},${52 + R() * 22},${48 + R() * 20},0.95)`, '#5c5c5c', '#a0a0a0');
  }

  // rust weeping from the floor line and from the lower chips
  const rust = c.createLinearGradient(0, S * 0.72, 0, S);
  rust.addColorStop(0, 'rgba(104,52,24,0)');
  rust.addColorStop(1, `rgba(104,52,24,${opts.rust ?? 0.5})`);
  c.fillStyle = rust; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = R() * S, y = S * (0.6 + R() * 0.4), len = 8 + R() * 60;
    c.fillStyle = `rgba(${104 + R() * 40},${48 + R() * 24},${20 + R() * 14},${0.1 + R() * 0.22})`;
    c.fillRect(x, y, 1 + R() * 3, len);
    r.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.3})`;
    r.fillRect(x, y, 1 + R() * 3, len);
  }

  // scuffs — long shallow scratches that catch a highlight
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = R() * S, len = 10 + R() * 90, a = (R() - 0.5) * 0.5;
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = `rgba(226,222,214,${0.05 + R() * 0.12})`;
    c.fillRect(0, 0, len, 1);
    c.restore();
    h.save(); h.translate(x, y); h.rotate(a);
    h.fillStyle = 'rgba(70,70,70,0.5)'; h.fillRect(0, 0, len, 1);
    h.restore();
  }

  return {
    map: finish(col, true),
    normalMap: finish(normalFromHeight(hgt, opts.relief ?? 1.6, BLUR.enamel)),
    roughnessMap: finish(rgh),
  };
}

// ---------------------------------------------------------------------------
// sand-cast iron — the Pack-a-Punch frame, teleporter bases, door jambs
// ---------------------------------------------------------------------------
export function castIronMaps(seed = 7, opts = {}) {
  const S = opts.size || 512;
  const R = mulberry32(seed);
  const col = mkCanvas(S); const c = col.getContext('2d');
  const hgt = mkCanvas(S); const h = hgt.getContext('2d');
  const rgh = mkCanvas(S); const r = rgh.getContext('2d');

  // Base value matters more than it looks: the colour map is *multiplied* by
  // the material colour, so a dark map times a grey tint lands at ~3% albedo
  // and every iron surface in the map renders as a black cut-out under two
  // sodium bulbs. Weathered painted iron sits far lighter than instinct says.
  const base = opts.base || '#8d9096';
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  r.fillStyle = '#9a9a9a'; r.fillRect(0, 0, S, S);

  // sand-cast grain: dense fine speckle
  for (let i = 0; i < 14000; i++) {
    const x = R() * S, y = R() * S, s = 1 + R() * 2;
    const d = R() < 0.5;
    c.fillStyle = `rgba(${d ? '0,0,0' : '150,148,144'},${0.05 + R() * 0.16})`;
    c.fillRect(x, y, s, s);
    const v = 128 + (d ? -1 : 1) * (10 + R() * 40);
    h.fillStyle = `rgb(${v},${v},${v})`;
    h.fillRect(x, y, s, s);
  }
  // casting pits
  for (let i = 0; i < 220; i++) {
    const x = R() * S, y = R() * S, rad = 1.5 + R() * 4.5;
    c.beginPath(); c.arc(x, y, rad, 0, 7);
    c.fillStyle = `rgba(12,10,9,${0.3 + R() * 0.45})`; c.fill();
    h.beginPath(); h.arc(x, y, rad, 0, 7);
    h.fillStyle = `rgb(${40 + R() * 30},${40 + R() * 30},${40 + R() * 30})`; h.fill();
    r.beginPath(); r.arc(x, y, rad, 0, 7);
    r.fillStyle = 'rgba(255,255,255,0.5)'; r.fill();
  }
  // rust bloom + oil sheen
  blotches(c, S, 34, [22, 120], (rr) => [`rgba(${96 + rr() * 50},${44 + rr() * 26},${18 + rr() * 16},${0.06 + rr() * 0.22})`, 'rgba(90,40,16,0)'], R);
  blotches(r, S, 30, [20, 110], (rr) => [`rgba(255,255,255,${0.12 + rr() * 0.3})`, 'rgba(255,255,255,0)'], R);
  blotches(r, S, 18, [24, 90], (rr) => [`rgba(0,0,0,${0.14 + rr() * 0.3})`, 'rgba(0,0,0,0)'], R);
  // wiped/handled polish streaks
  for (let i = 0; i < 40; i++) {
    const y = R() * S, len = 30 + R() * 180;
    r.fillStyle = `rgba(0,0,0,${0.06 + R() * 0.14})`;
    r.fillRect(R() * S, y, len, 1 + R() * 3);
  }

  return {
    map: finish(col, true),
    normalMap: finish(normalFromHeight(hgt, opts.relief ?? 1.1, BLUR.castIron)),
    roughnessMap: finish(rgh),
  };
}

// ---------------------------------------------------------------------------
// tarnished brass / bronze fittings
// ---------------------------------------------------------------------------
export function brassMaps(seed = 13, opts = {}) {
  const S = opts.size || 256;
  const R = mulberry32(seed);
  const col = mkCanvas(S); const c = col.getContext('2d');
  const rgh = mkCanvas(S); const r = rgh.getContext('2d');
  const hgt = mkCanvas(S); const h = hgt.getContext('2d');

  c.fillStyle = opts.base || '#a8813a'; c.fillRect(0, 0, S, S);
  r.fillStyle = '#3c3c3c'; r.fillRect(0, 0, S, S);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);

  // turned/polished circumferential streaks
  for (let i = 0; i < 220; i++) {
    const y = R() * S;
    c.fillStyle = `rgba(${R() < 0.5 ? '255,236,190' : '70,48,16'},${0.03 + R() * 0.1})`;
    c.fillRect(0, y, S, 1 + R() * 2);
    r.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + R() * 0.16})`;
    r.fillRect(0, y, S, 1 + R() * 2);
  }
  // tarnish + verdigris in the low spots
  blotches(c, S, 30, [14, 70], (rr) => [`rgba(${46 + rr() * 30},${44 + rr() * 26},${22 + rr() * 16},${0.14 + rr() * 0.3})`, 'rgba(40,38,20,0)'], R);
  blotches(c, S, 10, [10, 40], (rr) => [`rgba(${58 + rr() * 30},${104 + rr() * 30},${82 + rr() * 24},${0.1 + rr() * 0.22})`, 'rgba(58,104,82,0)'], R);
  blotches(r, S, 30, [14, 70], (rr) => [`rgba(255,255,255,${0.2 + rr() * 0.4})`, 'rgba(255,255,255,0)'], R);
  // handling wear polishes it back
  blotches(r, S, 12, [16, 46], (rr) => [`rgba(0,0,0,${0.24 + rr() * 0.3})`, 'rgba(0,0,0,0)'], R);
  for (let i = 0; i < 900; i++) {
    const v = 128 + Math.floor((R() - 0.5) * 22);
    h.fillStyle = `rgb(${v},${v},${v})`;
    h.fillRect(R() * S, R() * S, 1, 1 + R() * 2);
  }

  return {
    map: finish(col, true),
    normalMap: finish(normalFromHeight(hgt, 0.9, BLUR.brass)),
    roughnessMap: finish(rgh),
  };
}

// ---------------------------------------------------------------------------
// weathered crate boarding
// ---------------------------------------------------------------------------
export function plankMaps(seed = 23, opts = {}) {
  const S = opts.size || 512;
  const rows = opts.rows || 5;
  const R = mulberry32(seed);
  const col = mkCanvas(S); const c = col.getContext('2d');
  const hgt = mkCanvas(S); const h = hgt.getContext('2d');
  const rgh = mkCanvas(S); const r = rgh.getContext('2d');

  c.fillStyle = '#100c08'; c.fillRect(0, 0, S, S);      // gap shadow
  h.fillStyle = '#2a2a2a'; h.fillRect(0, 0, S, S);
  r.fillStyle = '#e0e0e0'; r.fillRect(0, 0, S, S);

  const ph = S / rows;
  for (let row = 0; row < rows; row++) {
    const y0 = row * ph + 2, hh = ph - 4;
    const tone = 96 + R() * 34;
    c.fillStyle = `rgb(${Math.round(tone)},${Math.round(tone * 0.84)},${Math.round(tone * 0.62)})`;
    c.fillRect(0, y0, S, hh);
    h.fillStyle = '#b4b4b4'; h.fillRect(0, y0, S, hh);
    r.fillStyle = '#c4c4c4'; r.fillRect(0, y0, S, hh);
    // grain: long wavering strokes along the plank
    for (let i = 0; i < 150; i++) {
      const gy = y0 + R() * hh;
      const dark = R() < 0.55;
      c.strokeStyle = `rgba(${dark ? '46,32,20' : '196,172,138'},${0.05 + R() * 0.22})`;
      c.lineWidth = 0.6 + R() * 1.8;
      c.beginPath(); c.moveTo(0, gy);
      let yy = gy;
      for (let x = 0; x <= S; x += 26) { yy += (R() - 0.5) * 2.6; c.lineTo(x, yy); }
      c.stroke();
      h.strokeStyle = `rgba(${dark ? '90,90,90' : '190,190,190'},0.35)`;
      h.lineWidth = c.lineWidth;
      h.beginPath(); h.moveTo(0, gy);
      yy = gy;
      for (let x = 0; x <= S; x += 26) { yy += (R() - 0.5) * 2.6; h.lineTo(x, yy); }
      h.stroke();
    }
    // knots
    for (let k = 0; k < 2; k++) {
      if (R() > 0.55) continue;
      const kx = R() * S, ky = y0 + hh * (0.25 + R() * 0.5), kr = 4 + R() * 9;
      for (let ring = kr; ring > 0; ring -= 1.6) {
        c.beginPath(); c.ellipse(kx, ky, ring, ring * 0.62, 0, 0, 7);
        c.strokeStyle = `rgba(38,24,14,${0.18 + R() * 0.3})`;
        c.lineWidth = 1.1; c.stroke();
      }
      h.beginPath(); h.ellipse(kx, ky, kr * 0.6, kr * 0.4, 0, 0, 7);
      h.fillStyle = '#8c8c8c'; h.fill();
    }
    // splintered / darkened plank ends
    const endGrad = c.createLinearGradient(0, y0, 0, y0 + hh);
    endGrad.addColorStop(0, 'rgba(20,14,8,0.34)');
    endGrad.addColorStop(0.18, 'rgba(20,14,8,0)');
    endGrad.addColorStop(0.82, 'rgba(20,14,8,0)');
    endGrad.addColorStop(1, 'rgba(20,14,8,0.4)');
    c.fillStyle = endGrad; c.fillRect(0, y0, S, hh);
  }
  // weathering: grey silvering, water stains, mildew
  blotches(c, S, 34, [18, 96], (rr) => [`rgba(${132 + rr() * 40},${128 + rr() * 34},${118 + rr() * 30},${0.05 + rr() * 0.14})`, 'rgba(130,126,116,0)'], R);
  blotches(c, S, 20, [16, 80], (rr) => [`rgba(24,20,14,${0.08 + rr() * 0.2})`, 'rgba(24,20,14,0)'], R);
  blotches(r, S, 26, [16, 90], (rr) => [`rgba(255,255,255,${0.1 + rr() * 0.24})`, 'rgba(255,255,255,0)'], R);
  // gouges
  for (let i = 0; i < 70; i++) {
    const x = R() * S, y = R() * S, len = 6 + R() * 40, a = (R() - 0.5) * 1.2;
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = `rgba(30,20,12,${0.14 + R() * 0.3})`; c.fillRect(0, 0, len, 1 + R() * 2);
    c.restore();
    h.save(); h.translate(x, y); h.rotate(a);
    h.fillStyle = 'rgba(60,60,60,0.6)'; h.fillRect(0, 0, len, 1 + R() * 2);
    h.restore();
  }

  return {
    map: finish(col, true),
    normalMap: finish(normalFromHeight(hgt, opts.relief ?? 2.4, BLUR.plank)),
    roughnessMap: finish(rgh),
  };
}
