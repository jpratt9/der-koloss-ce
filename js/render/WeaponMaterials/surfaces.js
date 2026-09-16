// Surface generators. Each returns the finished maps for one material:
// steel, wood, leather, bakelite, checkering and the Pack-a-Punch etch.
import * as THREE from 'three';
import { rng, canvas2d, texture, normalFromHeight } from './canvas.js';

/**
 * Machined / brushed steel. `finish` shifts the character:
 *   'machined' – lathe-turned circumferential tooling ridges
 *   'brushed'  – long directional polish streaks
 *   'cast'     – coarse phosphate / parkerised grain, no direction
 *   'stamped'  – rolled sheet with dents, ripples and wear scuffs
 */
export function steelSurface(seed, finish, opts = {}) {
  const size = opts.size || 256;
  const R = rng(seed);
  const { c: hc, g: hg } = canvas2d(size);
  const { c: rc, g: rg } = canvas2d(size);
  const roughBase = opts.rough ?? 0.38;

  hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size);
  const rb = Math.round(roughBase * 255);
  rg.fillStyle = `rgb(${rb},${rb},${rb})`; rg.fillRect(0, 0, size, size);

  // --- base grain -----------------------------------------------------------
  if (finish === 'cast') {
    for (let i = 0; i < size * 26; i++) {
      const x = R() * size, y = R() * size, r = 0.6 + R() * 2.4;
      const v = R() < 0.5 ? 0 : 255;
      hg.fillStyle = `rgba(${v},${v},${v},${0.05 + R() * 0.16})`;
      hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
      rg.fillStyle = `rgba(255,255,255,${R() * 0.09})`;
      rg.beginPath(); rg.arc(x, y, r * 1.6, 0, 7); rg.fill();
    }
  } else if (finish === 'stamped') {
    // rolled sheet: soft broad ripples plus press dents
    for (let i = 0; i < 46; i++) {
      const y = R() * size, hgt = 6 + R() * 26;
      const grd = hg.createLinearGradient(0, y, 0, y + hgt);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${0.06 + R() * 0.1})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      hg.fillStyle = grd; hg.fillRect(0, y, size, hgt);
    }
    for (let i = 0; i < size * 8; i++) {
      const x = R() * size, y = R() * size, r = 0.5 + R() * 1.8;
      hg.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.1})`;
      hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
    }
  } else {
    // machined / brushed: dense directional micro lines
    const vertical = finish === 'machined';
    for (let i = 0; i < size * 5; i++) {
      const p = R() * size;
      const len = vertical ? size : size * (0.3 + R() * 0.7);
      const off = R() * size;
      const a = 0.03 + R() * 0.13;
      const v = R() < 0.5 ? 0 : 255;
      hg.strokeStyle = `rgba(${v},${v},${v},${a})`;
      hg.lineWidth = R() < 0.85 ? 1 : 2;
      hg.beginPath();
      if (vertical) { hg.moveTo(0, p); hg.lineTo(size, p); }
      else { hg.moveTo(off, p); hg.lineTo(off + len, p + (R() - 0.5) * 3); }
      hg.stroke();
      rg.strokeStyle = `rgba(0,0,0,${a * 0.7})`;
      rg.lineWidth = hg.lineWidth;
      rg.beginPath();
      if (vertical) { rg.moveTo(0, p); rg.lineTo(size, p); }
      else { rg.moveTo(off, p); rg.lineTo(off + len, p + (R() - 0.5) * 3); }
      rg.stroke();
    }
  }

  // --- handling wear: scratches (polished => smoother) ----------------------
  const nScratch = opts.scratches ?? 90;
  for (let i = 0; i < nScratch; i++) {
    const x = R() * size, y = R() * size, ang = R() * Math.PI * 2;
    const len = 6 + R() * 60;
    const w = R() < 0.8 ? 1 : 2;
    hg.save(); hg.translate(x, y); hg.rotate(ang);
    hg.strokeStyle = `rgba(255,255,255,${0.14 + R() * 0.3})`;
    hg.lineWidth = w; hg.beginPath(); hg.moveTo(0, 0); hg.lineTo(len, 0); hg.stroke();
    hg.restore();
    rg.save(); rg.translate(x, y); rg.rotate(ang);
    rg.strokeStyle = `rgba(0,0,0,${0.22 + R() * 0.35})`;
    rg.lineWidth = w + 1; rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(len, 0); rg.stroke();
    rg.restore();
  }
  // --- pitting / corrosion speckle (rougher) --------------------------------
  for (let i = 0; i < (opts.pits ?? 140); i++) {
    const x = R() * size, y = R() * size, r = 0.7 + R() * 3.2;
    hg.fillStyle = `rgba(0,0,0,${0.12 + R() * 0.3})`;
    hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
    rg.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.45})`;
    rg.beginPath(); rg.arc(x, y, r * 1.3, 0, 7); rg.fill();
  }
  // broad roughness mottling so the sky IBL never looks uniform
  for (let i = 0; i < 22; i++) {
    const x = R() * size, y = R() * size, r = 18 + R() * 70;
    const grd = rg.createRadialGradient(x, y, 0, x, y, r);
    const dir = R() < 0.5 ? 0 : 255;
    grd.addColorStop(0, `rgba(${dir},${dir},${dir},${0.05 + R() * 0.12})`);
    grd.addColorStop(1, `rgba(${dir},${dir},${dir},0)`);
    rg.fillStyle = grd; rg.beginPath(); rg.arc(x, y, r, 0, 7); rg.fill();
  }

  const normal = normalFromHeight(hc, size, opts.strength ?? 1.8);
  return {
    normalMap: texture(normal, { repeat: opts.repeat ?? 2 }),
    roughnessMap: texture(rc, { repeat: opts.repeat ?? 2 }),
  };
}

/** Walnut / beech stock: grain albedo, matching normal, grain-locked roughness. */
export function woodSurface(seed, light, dark, opts = {}) {
  const size = opts.size || 256;
  const R = rng(seed);
  const { c: ac, g: ag } = canvas2d(size);
  const { c: hc, g: hg } = canvas2d(size);
  const { c: rc, g: rg } = canvas2d(size);

  const warp = new Float32Array(size * size);
  // two octaves of smooth value noise for grain warping
  for (const [freq, amp] of [[4, 1], [9, 0.45], [19, 0.22]]) {
    const gr = new Float32Array((freq + 1) * (freq + 1));
    for (let i = 0; i < gr.length; i++) gr[i] = R();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * freq, fy = (y / size) * freq;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = gr[y0 * (freq + 1) + x0], b = gr[y0 * (freq + 1) + x0 + 1];
        const cc = gr[(y0 + 1) * (freq + 1) + x0], d = gr[(y0 + 1) * (freq + 1) + x0 + 1];
        const top = a + (b - a) * sx, bot = cc + (d - cc) * sx;
        warp[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
  }

  const lc = new THREE.Color(light), dc = new THREE.Color(dark);
  const aimg = ag.createImageData(size, size);
  const himg = hg.createImageData(size, size);
  const rimg = rg.createImageData(size, size);
  const rings = opts.rings ?? 13;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const w = warp[i] / 1.67;
      // grain runs along +X (barrel axis) — warped ring bands across it
      let v = Math.sin((y / size) * Math.PI * 2 * rings + w * 5.2 + Math.sin(x / size * 3.1) * 1.4);
      v = Math.pow(Math.abs(v), 0.85) * Math.sign(v) * 0.5 + 0.5;
      // fine pore streaks
      const pore = (Math.sin(y * 2.7 + w * 30) * 0.5 + 0.5) * 0.22;
      const t = Math.min(1, Math.max(0, 0.18 + v * 0.56 + pore * 0.3 + (w - 0.5) * 0.20));
      const j = i * 4;
      aimg.data[j] = (dc.r + (lc.r - dc.r) * t) * 255;
      aimg.data[j + 1] = (dc.g + (lc.g - dc.g) * t) * 255;
      aimg.data[j + 2] = (dc.b + (lc.b - dc.b) * t) * 255;
      aimg.data[j + 3] = 255;
      const hv = 128 + (t - 0.5) * 90;
      himg.data[j] = himg.data[j + 1] = himg.data[j + 2] = hv;
      himg.data[j + 3] = 255;
      // dark late-wood is more open-pored => rougher
      const rv = (opts.rough ?? 0.52) + (1 - t) * 0.22;
      rimg.data[j] = rimg.data[j + 1] = rimg.data[j + 2] = rv * 255;
      rimg.data[j + 3] = 255;
    }
  }
  ag.putImageData(aimg, 0, 0);
  hg.putImageData(himg, 0, 0);
  rg.putImageData(rimg, 0, 0);

  // handling polish + dings on the wood
  for (let i = 0; i < 26; i++) {
    const x = R() * size, y = R() * size, r = 6 + R() * 26;
    const grd = rg.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${0.08 + R() * 0.16})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = grd; rg.beginPath(); rg.arc(x, y, r, 0, 7); rg.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = R() * size, y = R() * size, ang = R() * 6.28, len = 4 + R() * 24;
    hg.save(); hg.translate(x, y); hg.rotate(ang);
    hg.strokeStyle = `rgba(0,0,0,${0.2 + R() * 0.35})`; hg.lineWidth = 1 + R() * 2;
    hg.beginPath(); hg.moveTo(0, 0); hg.lineTo(len, 0); hg.stroke(); hg.restore();
  }

  return {
    map: texture(ac, { srgb: true, repeat: opts.repeat ?? 1 }),
    normalMap: texture(normalFromHeight(hc, size, opts.strength ?? 1.1), { repeat: opts.repeat ?? 1 }),
    roughnessMap: texture(rc, { repeat: opts.repeat ?? 1 }),
  };
}

/** Pebbled leather glove: grain cells, seam stitching, worn shine on knuckles. */
export function leatherSurface(seed, opts = {}) {
  const size = opts.size || 256;
  const R = rng(seed);
  const { c: hc, g: hg } = canvas2d(size);
  const { c: rc, g: rg } = canvas2d(size);
  hg.fillStyle = '#6e6e6e'; hg.fillRect(0, 0, size, size);
  rg.fillStyle = '#b4b4b4'; rg.fillRect(0, 0, size, size);
  // pebble cells
  for (let i = 0; i < size * 3.2; i++) {
    const x = R() * size, y = R() * size, r = 2 + R() * 5.5;
    const grd = hg.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.22 + R() * 0.3})`);
    grd.addColorStop(0.72, 'rgba(128,128,128,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0.30)');
    hg.fillStyle = grd; hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
    rg.fillStyle = `rgba(0,0,0,${R() * 0.18})`;
    rg.beginPath(); rg.arc(x, y, r * 0.6, 0, 7); rg.fill();
  }
  // creases
  for (let i = 0; i < 30; i++) {
    const x = R() * size, y = R() * size, ang = R() * 6.28;
    hg.save(); hg.translate(x, y); hg.rotate(ang);
    hg.strokeStyle = `rgba(0,0,0,${0.2 + R() * 0.3})`; hg.lineWidth = 1 + R() * 2.5;
    hg.beginPath(); hg.moveTo(0, 0);
    hg.quadraticCurveTo(20 + R() * 20, (R() - 0.5) * 22, 40 + R() * 50, (R() - 0.5) * 30);
    hg.stroke(); hg.restore();
  }
  // stitch rows
  for (let i = 0; i < 5; i++) {
    const y = R() * size;
    for (let x = 0; x < size; x += 7) {
      hg.fillStyle = 'rgba(255,255,255,0.5)';
      hg.fillRect(x, y, 4, 1.6);
      rg.fillStyle = 'rgba(0,0,0,0.30)';
      rg.fillRect(x, y, 4, 1.6);
    }
  }
  return {
    normalMap: texture(normalFromHeight(hc, size, opts.strength ?? 1.15), { repeat: opts.repeat ?? 5 }),
    roughnessMap: texture(rc, { repeat: opts.repeat ?? 5 }),
  };
}

/** Bakelite / phenolic resin: swirled marbling, glossy with a fine orange peel. */
export function bakeliteSurface(seed) {
  const size = 256;
  const R = rng(seed);
  const { c: ac, g: ag } = canvas2d(size);
  const { c: hc, g: hg } = canvas2d(size);
  ag.fillStyle = '#ffffff'; ag.fillRect(0, 0, size, size);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size;
    ag.save(); ag.translate(x, y); ag.rotate(R() * 6.28);
    ag.strokeStyle = R() < 0.5 ? `rgba(255,232,205,${0.1 + R() * 0.2})` : `rgba(60,30,18,${0.1 + R() * 0.22})`;
    ag.lineWidth = 2 + R() * 9;
    ag.beginPath(); ag.moveTo(-40, 0);
    ag.bezierCurveTo(-10, (R() - 0.5) * 40, 10, (R() - 0.5) * 40, 60, (R() - 0.5) * 20);
    ag.stroke(); ag.restore();
  }
  for (let i = 0; i < size * 4; i++) {
    const x = R() * size, y = R() * size, r = 1 + R() * 3;
    hg.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},128,${0.05 + R() * 0.1})`;
    hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
  }
  return {
    map: texture(ac, { srgb: true, repeat: 2 }),
    normalMap: texture(normalFromHeight(hc, size, 0.9), { repeat: 2 }),
  };
}

/** Diamond checkering for grip panels and stock wrists. */
export function checkerSurface(seed, pitch = 16) {
  const size = 256;
  const { c: hc, g: hg } = canvas2d(size);
  const { c: rc, g: rg } = canvas2d(size);
  hg.fillStyle = '#3c3c3c'; hg.fillRect(0, 0, size, size);
  rg.fillStyle = '#c8c8c8'; rg.fillRect(0, 0, size, size);
  hg.lineWidth = pitch * 0.42;
  for (let d = -size; d < size * 2; d += pitch) {
    for (const s of [1, -1]) {
      const grd = hg.createLinearGradient(0, 0, 6 * s, 6);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(120,120,120,0.85)');
      hg.strokeStyle = grd;
      hg.beginPath(); hg.moveTo(d, 0); hg.lineTo(d + s * size, size); hg.stroke();
    }
  }
  // pyramid tips catch light -> slightly polished
  for (let d = -size; d < size * 2; d += pitch) {
    rg.strokeStyle = 'rgba(0,0,0,0.22)'; rg.lineWidth = 2;
    rg.beginPath(); rg.moveTo(d, 0); rg.lineTo(d + size, size); rg.stroke();
    rg.beginPath(); rg.moveTo(d, 0); rg.lineTo(d - size, size); rg.stroke();
  }
  return {
    normalMap: texture(normalFromHeight(hc, size, 2.2), { repeat: 9 }),
    roughnessMap: texture(rc, { repeat: 9 }),
  };
}

/** Etched arcane panelling for the Pack-a-Punch finish. */
export function etchSurface(seed) {
  const size = 256;
  const R = rng(seed);
  const { c: hc, g: hg } = canvas2d(size);
  const { c: ec, g: eg } = canvas2d(size);
  hg.fillStyle = '#8c8c8c'; hg.fillRect(0, 0, size, size);
  eg.fillStyle = '#000000'; eg.fillRect(0, 0, size, size);
  // The height pass and the emissive pass walk an identical random sequence so
  // the glow sits exactly inside the engraved channel.
  const tracery = (ctx, style, w) => {
    const r = rng(seed);
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      let x = r() * size, y = r() * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        const dir = Math.floor(r() * 4);
        const len = 8 + r() * 34;
        if (dir === 0) x += len; else if (dir === 1) x -= len;
        else if (dir === 2) y += len; else y -= len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * size, y = r() * size, rad = 5 + r() * 16;
      ctx.beginPath(); ctx.arc(x, y, rad, r() * 6.28, r() * 6.28 + 2 + r() * 3); ctx.stroke();
    }
  };
  tracery(hg, 'rgba(18,18,18,0.95)', 3.2);
  tracery(eg, 'rgba(255,255,255,1)', 2.0);
  void R;
  return {
    normalMap: texture(normalFromHeight(hc, size, 2.4), { repeat: 2 }),
    emissiveMap: texture(ec, { repeat: 2 }),
  };
}

