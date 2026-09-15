// The map's painted signage: weathered stencil lettering on the factory walls.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { rand } from '../utils.js';

export function paintSignage({ group }) {
  // ---------- painted factory signage (weathered stencil, original art) ----------
  function wallSign(text, x, y, z, w, ry = 0, opts = {}) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const g2 = c.getContext('2d');
    g2.clearRect(0, 0, 1024, 128);
    const fontSize = opts.fontSize || 84;
    g2.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`;
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    // Always reserve paint margin. Canvas fillText otherwise clips long copy at
    // the texture edge, which was cutting the final S from DER KOLOSS.
    const maxTextWidth = 920;
    const measured = g2.measureText(text).width;
    if (measured > maxTextWidth) {
      g2.font = `bold ${Math.floor(fontSize * maxTextWidth / measured)}px "Arial Narrow", Arial, sans-serif`;
    }
    // weathered paint: stamp the text many times at low alpha, then erase scratches
    for (let i = 0; i < (opts.stamps || 7); i++) {
      const paint = opts.paint || '214,208,190';
      const paintAlpha = opts.paintAlpha || 0.05;
      g2.fillStyle = `rgba(${paint},${paintAlpha + Math.random() * paintAlpha})`;
      g2.fillText(text, 512 + rand(-2, 2), 66 + rand(-2, 2), maxTextWidth);
    }
    g2.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < (opts.scratches ?? 260); i++) {
      g2.fillStyle = `rgba(0,0,0,${rand(0.2, 0.7)})`;
      g2.fillRect(rand(0, 1024), rand(20, 110), rand(1, 6), rand(1, 3));
    }
    g2.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Signage is painted along a wall, so it is read edge-on more often than
    // face-on. Without anisotropy the stencil dissolves into a shimmering band
    // the moment you walk past it.
    tex.anisotropy = 16;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opts.opacity ?? 0.85 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
  }
  wallSign('WAFFENFABRIK  DER  KOLOSS', -1, 5.6, -41.78, 16);
  wallSign('CREATED BY VESPER.INC', -1, 4.35, -41.775, 5.2, 0, {
    fontSize: 54, opacity: 0.9, scratches: 120, stamps: 7,
    paint: '255,255,255', paintAlpha: 0.11,
  });
  wallSign('SEKTOR  A', -13.78, 3.4, 20, 7, Math.PI / 2);
  wallSign('HALLE  3', 13.78, 3.6, -52, 8, -Math.PI / 2);
  wallSign('LABOR', -31.78, 3.2, -13, 5, Math.PI / 2);
  wallSign('HALLE  1', -13.78, 3.2, 6, 6, Math.PI / 2);
  wallSign('HALLE  2', 13.78, 3.2, 6, 6, -Math.PI / 2);
  wallSign('KRAFTWERK', -15.78, 3.4, -26, 7, Math.PI / 2);
  wallSign('COURTYARD  EXIT', 10.22, 5.35, -30, 4.2, Math.PI / 2);
  // Eye-level wayfinding on the Double Tap side, directly over the 1000-point
  // door at x=8. This is intentionally readable before the player reaches it.
  wallSign('COURTYARD  GATE   1000', 7.7, 3.72, -21.78, 5.4, 0);
  // The neighboring upper door is not a duplicate courtyard entrance: it is
  // the paid garage-balcony route into Chemical Testing and Teleporter B.
  wallSign('TELEPORTER  B   750', 12, 5.55, -21.78, 4.6, 0);
}
