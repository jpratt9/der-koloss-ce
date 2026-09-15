// The map's ground spawns: a lit, broken slab ringed with fragments at each
// outdoor riser.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { rand } from '../utils.js';

export function placeRisers({ group, risers, matConcrete }) {
  // ---------- risers (outdoor ground spawns) ----------
  function riser(x, z, room) {
    // A ground spawn is a broken slab, not a brown sticker. The old unlit
    // MeshBasicMaterial disc ignored every light in the scene and read as a
    // flat decal; this is lit geometry that sits in the world.
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1610'; g.fillRect(0, 0, 256, 256);
    // Radial cracks running out from the centre of the breach.
    g.strokeStyle = '#0a0806'; g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = rand(Math.PI * 2);
      g.lineWidth = rand(1.5, 5);
      g.beginPath(); g.moveTo(128, 128);
      let px = 128, py = 128, ang = a;
      for (let seg = 0; seg < 5; seg++) {
        ang += rand(-0.5, 0.5);
        px += Math.cos(ang) * rand(12, 30); py += Math.sin(ang) * rand(12, 30);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(9,7,5,0.85)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rand(20, 236), rand(20, 236), rand(3, 16), 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;   // a ground decal is always seen at a glancing angle
    const riserMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98, metalness: 0.0, color: 0x8a8a8a });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), riserMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.022, z);
    m.receiveShadow = true;
    group.add(m);
    // Displaced slab fragments around the rim so it reads in silhouette.
    const chunkMat = matConcrete;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand(-0.25, 0.25);
      const d = rand(1.0, 1.45);
      const s = rand(0.16, 0.4);
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), chunkMat);
      chunk.position.set(x + Math.cos(a) * d, rand(0.03, 0.12), z + Math.sin(a) * d);
      chunk.rotation.set(rand(Math.PI), rand(Math.PI), rand(Math.PI));
      chunk.scale.y = rand(0.35, 0.7);
      chunk.castShadow = true; chunk.receiveShadow = true;
      group.add(chunk);
    }
    risers.push({ x, z, room });
  }
  riser(-3.5, 18, 'mainframe'); riser(3.5, 17.5, 'mainframe');
  riser(-10, -26, 'courtyard'); riser(5, -28, 'courtyard'); riser(-6, -36, 'courtyard'); riser(3, -40, 'courtyard');
  riser(-6, -50, 'factory'); riser(6, -54, 'factory');
}
