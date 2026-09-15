// The soldiers' skin atlas: the shared corpse texture recoloured per persona,
// with an eye painted into the patch js/render/SoldierFace.js maps the sockets to.
import * as THREE from 'three';
import { assets } from '../assets.js';
import { EYE_PATCH } from '../render/SoldierFace.js';
import { SOLDIER_LOOKS } from '../render/SoldierGear.js';

/**
 * Recolour the shared corpse atlas into a living man.
 *
 * The body underneath the uniform is the shipped humanoid, so this is what
 * makes the face, neck and hands read as skin rather than as a green corpse.
 * Only the surfaces the uniform does not cover are actually seen, which is why
 * the skin branch gets all the care and the cloth branch just needs to be a
 * plausible dark undershirt.
 */
/**
 * Iris colour per persona. The four are meant to stay distinguishable at any
 * range, and this is the cheapest axis left: the silhouette work is done by the
 * headgear, the coat and the pack, so the eyes only have to avoid being four
 * copies of the same eye when someone is being revived at arm's length.
 * Deliberately muted — 1945, a dark map, and men who have not slept.
 */
const IRIS = {
  dempsey: 0x4e6f8a,      // pale cold blue
  nikolai: 0x6b4a29,      // warm brown
  takeo: 0x46331f,        // near-black brown
  richtofen: 0x74855e,    // washed-out hazel green
};

/**
 * Paint one eye into the atlas patch that SoldierFace re-mapped the sockets to.
 *
 * Everything here is in patch-normalised coordinates: (0,0) is the brow corner
 * nearest the nose, (1,1) the cheek corner nearest the temple. Both sockets
 * sample this one patch through |x|, so it is drawn as a right eye and the left
 * eye comes out mirrored, which is what a face does anyway.
 *
 * Restraint is the whole job. A wide bright eye on a low-poly head at 1945
 * light levels reads as a cartoon; what has to survive to 20 m is only this —
 * a socket that is darker than the cheek, a pale sliver inside it, and one dark
 * point in the middle of the sliver. The catchlight and the limbal ring are for
 * the two metres where somebody is bleeding out and you are stood over them.
 */
function paintSoldierEye(g, size, look, face) {
  const { u0, v0, u1, v1 } = EYE_PATCH;
  const x0 = u0 * size, y0 = v0 * size;
  const S = (u1 - u0) * size, T = (v1 - v0) * size;
  const px = (sx) => x0 + sx * S;
  const py = (sy) => y0 + sy * T;
  const css = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

  const mix = (a, b, t) => new THREE.Color().copy(a).lerp(b, t);
  const BLACK = new THREE.Color(0, 0, 0);
  const shadow = mix(face, BLACK, 0.62);
  const hair = new THREE.Color(look.hair);
  const lash = mix(hair, BLACK, 0.45);
  // Warm bone, never white: a white sclera on a face this dark reads as a doll.
  const sclera = mix(new THREE.Color(0xcdc6b8), face, 0.22);
  const iris = new THREE.Color(IRIS[look.id] ?? look.hair);

  // A margin of plain face tone around the patch, so that once the head is a
  // dozen pixels tall and the sampler is deep in the mip chain, what bleeds in
  // is cheek rather than the blank white the rest of this atlas is.
  g.fillStyle = css(face, 1);
  g.fillRect(x0 - S * 0.5, y0 - T * 0.5, S * 2, T * 2);

  g.save();
  g.beginPath(); g.rect(x0, y0, S, T); g.clip();

  // ---- the socket ---------------------------------------------------------
  // A recess, not a hole: the cheek tone dropped toward shadow, deepest just
  // under the brow where a real orbit is deepest.
  let grd = g.createRadialGradient(px(0.5), py(0.46), S * 0.06, px(0.5), py(0.5), S * 0.66);
  grd.addColorStop(0, css(shadow, 0.92));
  grd.addColorStop(0.62, css(shadow, 0.55));
  grd.addColorStop(1, css(shadow, 0));
  g.fillStyle = grd;
  g.fillRect(x0, y0, S, T);

  // ---- the brow -----------------------------------------------------------
  // The top of this swatch is brow ridge in the sculpt, so it is brow here.
  grd = g.createLinearGradient(0, py(0), 0, py(0.30));
  grd.addColorStop(0, css(hair, 0.96));
  grd.addColorStop(0.45, css(hair, 0.80));
  grd.addColorStop(1, css(hair, 0));
  g.fillStyle = grd;
  g.fillRect(x0, y0, S, T * 0.32);

  // ---- the eye opening ----------------------------------------------------
  const opening = () => {
    g.beginPath();
    g.moveTo(px(0.10), py(0.545));
    g.quadraticCurveTo(px(0.51), py(0.285), px(0.92), py(0.500));
    g.quadraticCurveTo(px(0.51), py(0.725), px(0.10), py(0.545));
    g.closePath();
  };

  opening();
  g.fillStyle = css(sclera, 1);
  g.fill();

  g.save();
  opening(); g.clip();

  // The upper lid throws a shadow across the top of the eyeball. Without it
  // the sclera reads as a flat sticker no matter how well the iris is drawn.
  grd = g.createLinearGradient(0, py(0.28), 0, py(0.62));
  grd.addColorStop(0, css(shadow, 0.85));
  grd.addColorStop(0.55, css(shadow, 0.22));
  grd.addColorStop(1, css(shadow, 0.05));
  g.fillStyle = grd;
  g.fillRect(x0, y0, S, T);
  // and a much fainter one off the lower lid
  grd = g.createLinearGradient(0, py(0.74), 0, py(0.60));
  grd.addColorStop(0, css(shadow, 0.45));
  grd.addColorStop(1, css(shadow, 0));
  g.fillStyle = grd;
  g.fillRect(x0, y0, S, T);

  // Iris: lighter toward the middle, so the limbal ring reads as a rim rather
  // than an outline drawn round a disc.
  const ix = px(0.50), iy = py(0.505), ir = S * 0.155;
  grd = g.createRadialGradient(ix, iy - ir * 0.22, ir * 0.12, ix, iy, ir);
  grd.addColorStop(0, css(mix(iris, new THREE.Color(0xffffff), 0.30), 1));
  grd.addColorStop(0.72, css(iris, 1));
  grd.addColorStop(1, css(mix(iris, BLACK, 0.55), 1));
  g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2);
  g.fillStyle = grd; g.fill();
  g.lineWidth = S * 0.014;
  g.strokeStyle = css(mix(iris, BLACK, 0.72), 0.9);
  g.stroke();

  g.beginPath(); g.arc(ix, iy, ir * 0.38, 0, Math.PI * 2);
  g.fillStyle = 'rgba(9,9,12,1)'; g.fill();

  // One catchlight, high and off to the nose side, matching a key light that
  // comes from above. Two would be a mistake; none reads as a corpse.
  grd = g.createRadialGradient(px(0.452), py(0.437), 0, px(0.452), py(0.437), S * 0.040);
  grd.addColorStop(0, 'rgba(255,255,250,0.92)');
  grd.addColorStop(0.55, 'rgba(255,255,250,0.45)');
  grd.addColorStop(1, 'rgba(255,255,250,0)');
  g.fillStyle = grd;
  g.fillRect(x0, y0, S, T);
  g.restore();

  // ---- lids ---------------------------------------------------------------
  // The lash line is what actually holds the eye in the socket at range: it is
  // the darkest thing on the face and it is exactly where the sculpt creases.
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(px(0.10), py(0.545));
  g.quadraticCurveTo(px(0.51), py(0.285), px(0.92), py(0.500));
  g.lineWidth = S * 0.055;
  g.strokeStyle = css(lash, 0.95);
  g.stroke();

  g.beginPath();
  g.moveTo(px(0.11), py(0.552));
  g.quadraticCurveTo(px(0.51), py(0.720), px(0.90), py(0.508));
  g.lineWidth = S * 0.022;
  g.strokeStyle = css(lash, 0.55);
  g.stroke();

  // The lid crease above, and the wet line of the lower lid below — both faint.
  g.beginPath();
  g.moveTo(px(0.14), py(0.455));
  g.quadraticCurveTo(px(0.52), py(0.215), px(0.90), py(0.420));
  g.lineWidth = S * 0.020;
  g.strokeStyle = css(shadow, 0.42);
  g.stroke();

  g.beginPath();
  g.moveTo(px(0.16), py(0.775));
  g.quadraticCurveTo(px(0.52), py(0.815), px(0.88), py(0.740));
  g.lineWidth = S * 0.018;
  g.strokeStyle = css(mix(face, new THREE.Color(0xffffff), 0.22), 0.30);
  g.stroke();

  g.restore();
}

const _atlasCache = new Map();
function soldierAtlas(variant) {
  const src = assets.models.zombie1;
  const srcTex = src?.scene?.getObjectByProperty('isSkinnedMesh', true)?.material?.map;
  if (!srcTex?.image) return null;
  const look = SOLDIER_LOOKS[variant % SOLDIER_LOOKS.length];
  if (_atlasCache.has(look.id)) return _atlasCache.get(look.id);
  const img = srcTex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  const skin = new THREE.Color(look.skin);
  const hair = new THREE.Color(look.hair);
  const under = new THREE.Color(look.clothDark);
  const tmp = new THREE.Color();
  // The eye patch has to start from the exact tone the FACE ends up, or it
  // reads as a sticker pasted on the cheek. Rather than hardcode that tone,
  // count which skin-branch source colour covers the most of the atlas — that
  // is the face swatch by a wide margin — and run it through the same branch.
  const skinCount = new Map();
  let faceKey = -1, faceBest = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
    const lum = 0.3 * r + 0.55 * gg + 0.15 * b;
    if (gg > r * 1.12 && gg > b * 1.12) {
      // Corpse green is the skin channel. Keep its shading via luminance so
      // the sculpted brow, cheekbones and knuckles survive the recolour.
      const t = Math.min(1.2, lum * 2.05);
      tmp.copy(skin).multiplyScalar(0.58 + t * 0.52);
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      const n = (skinCount.get(key) || 0) + 1;
      skinCount.set(key, n);
      if (n > faceBest) { faceBest = n; faceKey = key; }
    } else if (lum > 0.78) {
      tmp.setRGB(1, 1, 1);                 // eyes and teeth stay white
    } else if (lum < 0.16) {
      tmp.copy(hair).multiplyScalar(0.7 + lum * 2.0);   // brows, lashes, scalp
    } else {
      tmp.copy(under).multiplyScalar(0.5 + lum * 1.5);  // undershirt
    }
    px[i] = tmp.r * 255; px[i + 1] = tmp.g * 255; px[i + 2] = tmp.b * 255;
  }
  g.putImageData(d, 0, 0);

  // Give him eyes. This is the last thing that happens to the canvas, so the
  // recolour above cannot walk over it, and it lands in a corner of the atlas
  // no vertex of the shipped model samples — the zombies go on sampling the
  // flat black texel their sockets have always sampled, which is right for
  // them. See js/render/SoldierFace.js for the UVs that reach this patch.
  if (faceKey >= 0 && c.width === c.height) {
    const fl = (0.3 * ((faceKey >> 16) & 255) + 0.55 * ((faceKey >> 8) & 255)
      + 0.15 * (faceKey & 255)) / 255;
    const face = new THREE.Color().copy(skin)
      .multiplyScalar(0.58 + Math.min(1.2, fl * 2.05) * 0.52);
    paintSoldierEye(g, c.width, look, face);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // GLTF convention
  _atlasCache.set(look.id, tex);
  return tex;
}

export { soldierAtlas };
