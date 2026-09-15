// The map's surfaces: the code-drawn brick, the PBR materials, and the solid
// geometry buckets pushBox() fills and mergeSolidGeometry() turns into meshes.
// buildMap() in js/map.js calls both, in build order, with the names in their parameter lists.
import * as THREE from 'three';
import { rand, choice } from '../utils.js';
import { assets } from '../assets.js';
import { enhanceMaterial } from '../render/Materials.js';

export function buildSurfaces() {
  /**
   * Separable box blur over the RED channel of an RGBA ImageData, wrapping at
   * the edges so a tiling texture stays tiling. Returns a Float32Array of
   * heights, which is all the Sobel below needs.
   */
  function boxBlur(data, S, radius) {
    const src = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) src[i] = data[i * 4];
    const tmp = new Float32Array(S * S);
    const n = radius * 2 + 1;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += src[y * S + ((x + k + S) % S)];
        tmp[y * S + x] = s / n;
      }
    }
    for (let x = 0; x < S; x++) {
      for (let y = 0; y < S; y++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += tmp[((y + k + S) % S) * S + x];
        src[y * S + x] = s / n;
      }
    }
    return src;
  }

  // ---------- code-drawn industrial brick (color + matching normal map) ----------
  // Regular running-bond courses — reads as factory brick, not rubble.
  function makeBrickMaps() {
    const S = 512, BW = 64, BH = 32, MORT = 3;
    const cc = document.createElement('canvas'); cc.width = cc.height = S;
    const hc = document.createElement('canvas'); hc.width = hc.height = S;
    const g = cc.getContext('2d'), h = hc.getContext('2d');
    // mortar
    g.fillStyle = '#4a453e'; g.fillRect(0, 0, S, S);
    h.fillStyle = '#303030'; h.fillRect(0, 0, S, S);
    // sooty brown-gray industrial brick (desaturated, wartime grime)
    const tones = ['#5e4f42', '#65564a', '#584a3f', '#6b5a4c', '#52453b', '#615245'];
    for (let row = 0; row < S / BH; row++) {
      const off = (row % 2) * (BW / 2);
      for (let col = -1; col < S / BW + 1; col++) {
        const x = col * BW + off, y = row * BH;
        const base = new THREE.Color(choice(tones));
        base.offsetHSL(rand(-0.012, 0.012), rand(-0.06, 0.05), rand(-0.045, 0.045));
        g.fillStyle = '#' + base.getHexString();
        g.fillRect(x + MORT / 2, y + MORT / 2, BW - MORT, BH - MORT);
        // per-brick speckle + tonal streaks
        for (let i = 0; i < 26; i++) {
          g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,235,210'},${rand(0.02, 0.08)})`;
          g.fillRect(x + MORT / 2 + rand(0, BW - MORT - 3), y + MORT / 2 + rand(0, BH - MORT - 2), rand(1, 4), rand(1, 2));
        }
        const hv = 200 + Math.floor(rand(-28, 28));
        h.fillStyle = `rgb(${hv},${hv},${hv})`;
        h.fillRect(x + MORT / 2, y + MORT / 2, BW - MORT, BH - MORT);
      }
    }
    // soot / grime wash
    for (let i = 0; i < 40; i++) {
      const gx = rand(0, S), gy = rand(0, S), r = rand(20, 90);
      const grad = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      grad.addColorStop(0, `rgba(10,8,6,${rand(0.04, 0.12)})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    // height -> normal (Sobel)
    //
    // Blur the height field first. Drawn straight, every brick edge is a
    // one-texel cliff from mortar (48) to face (200), and a Sobel across that
    // produces a normal that swings ~70 degrees between two adjacent texels.
    // No amount of mip filtering or anisotropy can band-limit a signal like
    // that: the mip chain averages the NORMALS, three renormalises whatever it
    // reads back, and the result flips direction with every sub-pixel step of
    // the camera. That is the crawling ladder of bright dashes along the mortar
    // lines. Real brickwork has a rounded arris anyway, so a two-texel bevel
    // costs nothing visually and makes the map resolvable.
    const hd = boxBlur(h.getImageData(0, 0, S, S).data, S, 2);
    const nc = document.createElement('canvas'); nc.width = nc.height = S;
    const ng = nc.getContext('2d');
    const out = ng.createImageData(S, S);
    const H = (x, y) => hd[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) / 255;
      const dy = (H(x, y + 1) - H(x, y - 1)) / 255;
      const inv = 1 / Math.hypot(dx * 2.2, dy * 2.2, 1);
      const i = (y * S + x) * 4;
      out.data[i] = (-dx * 2.2 * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * 2.2 * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = inv * 255;
      out.data[i + 3] = 255;
    }
    ng.putImageData(out, 0, 0);
    const map = new THREE.CanvasTexture(cc);
    map.colorSpace = THREE.SRGBColorSpace;
    const normalMap = new THREE.CanvasTexture(nc);
    // Anisotropy, same as the loaded CC0 sets get in assets.js. Every brick
    // wall in the map is a long surface you walk beside, so it is almost always
    // being minified far harder along the corridor than across it. At the
    // default anisotropy of 1 the sampler has to pick one mip for both axes,
    // and the mortar courses smear into a moire ladder as you move.
    for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; }
    return { map, normalMap };
  }
  const brickMaps = makeBrickMaps();

  // ---------- materials (CC0 PBR textures + generated brick) ----------
  const pbr = (key, rx, ry, opts = {}) => new THREE.MeshStandardMaterial({
    ...assets.texSet(key, rx, ry),
    roughness: 1.0, metalness: 0.05, ...opts,
  });
  const matFloor = pbr('concrete', 1, 1, { color: 0x4c5055 });
  // generated industrial brick — UVs are world-scaled in pushBox so density is uniform
  const matWall = new THREE.MeshStandardMaterial({
    map: brickMaps.map, normalMap: brickMaps.normalMap, normalScale: new THREE.Vector2(1.35, 1.35),
    color: 0x5f646a, roughness: 0.94, metalness: 0.02,
  });
  const matBrick = matWall;
  // Merged-bucket materials use world-scaled UVs (see solidGeos.*.uvScale), so
  // their texture repeat stays 1:1 — the tiling density is set in metres, not
  // per-face. Without this a 2x2 repeat spread one diamond-plate tile over four
  // metres of balcony soffit and the tread smeared into a lattice of bright
  // specular dashes across the whole ceiling.
  const matMetal = pbr('rust', 1, 1, { metalness: 0.5, roughness: 0.78, color: 0x686e75 });
  // Diamond tread on a large soffit is a specular-aliasing trap: every tread
  // edge is a tiny mirror, and from below under a sodium lamp the whole ceiling
  // fills with crawling bright dashes. Keep it rough and matte.
  const matPlate = pbr('plate', 1, 1, { metalness: 0.22, roughness: 0.88, color: 0x62676e, normalScale: new THREE.Vector2(0.28, 0.28) });
  const matWood = pbr('wood', 1, 1, { color: 0x7c736b, roughness: 0.92 });
  const matDirt = pbr('dirt', 40, 40, { color: 0x55534e });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 1 });
  const matConcrete = pbr('concrete', 4, 2, { color: 0x4a4e54 });
  // Ceilings need their own material. Sharing matConcrete meant one texture
  // tile was stretched to 2.2m x 11.4m across a corridor roof, so every pebble
  // in the normal map smeared into a long comma-shaped specular streak under
  // the sodium lamps — a lattice of bright dashes across the whole ceiling.
  // Here the UVs are world-scaled (see solidGeos.ceiling.uvScale) and the
  // surface is fully rough, because a concrete soffit has no gloss.
  const matCeiling = new THREE.MeshStandardMaterial({
    ...assets.texSet('concrete', 1, 1),
    color: 0x3c4045, roughness: 1.0, metalness: 0.0,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });

  // Triplanar micro-detail + macro variation on every large surface. Floors get
  // puddles; walls get the detail normal only (water does not cling to brick).
  enhanceMaterial(matFloor, { detailScale: 3.4, detailStrength: 0.72, macroAmount: 0.22, macroRough: 0.28, wetness: 0.9, wetScale: 0.30, wetHeight: 0.4 });
  enhanceMaterial(matDirt, { detailScale: 4.2, detailStrength: 0.8, macroAmount: 0.26, macroRough: 0.3, wetness: 0.6, wetScale: 0.38, wetHeight: 0.3 });
  enhanceMaterial(matWall, { detailScale: 5.5, detailStrength: 0.38, detailNear: 3, detailFar: 10, macroAmount: 0.19, macroRough: 0.22 });
  enhanceMaterial(matConcrete, { detailScale: 4.0, detailStrength: 0.42, detailNear: 2.5, detailFar: 8, macroAmount: 0.2, macroRough: 0.26 });
  enhanceMaterial(matCeiling, { detailScale: 3.0, detailStrength: 0.3, detailNear: 2, detailFar: 7, macroAmount: 0.24, macroRough: 0.16 });
  enhanceMaterial(matMetal, { detailScale: 7.0, detailStrength: 0.3, detailNear: 2.5, detailFar: 9, macroAmount: 0.22, macroRough: 0.3 });
  enhanceMaterial(matPlate, { detailScale: 7.0, detailStrength: 0.16, detailNear: 1.8, detailFar: 5.5, macroAmount: 0.14, macroRough: 0.22 });
  enhanceMaterial(matWood, { detailScale: 6.0, detailStrength: 0.45, macroAmount: 0.2, macroRough: 0.2 });

  const solidGeos = { wall: [], brick: [], metal: [], wood: [], dark: [], plate: [], concrete: [], ceiling: [] };
  // Every piece of geometry drawn, gathered before the merges below erase which
  // triangles made up which prop, so each prop collider can be given the shape
  // a bullet should actually stop on (see js/shot-cover.js).
  const shotPieces = [];
  // world-units per texture tile for each merged material (brick tile = 1.76m of wall)
  solidGeos.wall.uvScale = 1 / 1.76;
  solidGeos.brick.uvScale = 1 / 1.76;
  solidGeos.ceiling.uvScale = 1 / 2.4;   // one concrete tile every 2.4m
  solidGeos.plate.uvScale = 1 / 0.9;     // diamond tread reads at ~0.9m
  solidGeos.metal.uvScale = 1 / 1.4;
  solidGeos.wood.uvScale = 1 / 1.1;
  solidGeos.concrete.uvScale = 1 / 2.0;
  const tmpM = new THREE.Matrix4();

  // BoxGeometry UVs are 0..1 per face — rescale them to world units so every
  // wall/floor/crate has the same texel density regardless of its size.
  function worldUVs(geo, w, h, d, s) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) {
      const [du, dv] = dims[f];
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        uv.setXY(idx, uv.getX(idx) * du * s, uv.getY(idx) * dv * s);
      }
    }
  }

  function pushBox(arr, cx, cy, cz, w, h, d, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (arr.uvScale) worldUVs(g, w, h, d, arr.uvScale);
    tmpM.makeRotationY(ry).setPosition(cx, cy, cz);
    g.applyMatrix4(tmpM);
    arr.push(g);
  }
  return {
    pbr, matFloor, matWall, matBrick, matMetal, matPlate, matWood, matDirt, matDark, matConcrete, matCeiling,
    solidGeos, shotPieces, pushBox,
  };
}

export function mergeSolidGeometry({
  group, solidGeos, shotPieces, matWall, matBrick, matMetal, matWood, matDark, matPlate, matConcrete, matCeiling,
}) {
  // merge static geometry
  const matFor = { wall: matWall, brick: matBrick, metal: matMetal, wood: matWood, dark: matDark, plate: matPlate, concrete: matConcrete, ceiling: matCeiling };
  for (const key of Object.keys(solidGeos)) {
    const arr = solidGeos[key];
    if (!arr.length) continue;
    for (const g of arr) shotPieces.push({ geometry: g, matrix: null });
    // manual merge (BufferGeometryUtils-free)
    let total = 0;
    for (const g of arr) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), norm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const idx = [];
    let vo = 0;
    for (const g of arr) {
      pos.set(g.attributes.position.array, vo * 3);
      norm.set(g.attributes.normal.array, vo * 3);
      uv.set(g.attributes.uv.array, vo * 2);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vo);
      vo += g.attributes.position.count;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex(idx);
    const mesh = new THREE.Mesh(merged, matFor[key]);
    // Named so a coplanar-face audit can say WHICH bucket is fighting which,
    // instead of reporting two anonymous material uuids.
    mesh.name = `solid_${key}`;
    mesh.castShadow = key !== 'dark';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
