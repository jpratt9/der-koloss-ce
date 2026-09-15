// Power-up drops: the spinning core, its halo, its light and its label, and
// taking one back out of the scene.
// FxDrops' methods are copied onto FX.prototype by js/fx.js.
import * as THREE from 'three';
import { textTexture } from '../utils.js';

export class FxDrops {
  // =========================================================================
  // power-up drops
  // =========================================================================
  spawnDrop(type, x, z) {
    const icons = { maxammo: 'MAX AMMO', insta: 'INSTA-KILL', double: '×2 POINTS', nuke: 'NUKE' };
    const colors = { maxammo: '#8dff8d', insta: '#ff6a5a', double: '#ffd24a', nuke: '#c8b6ff' };
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0c2410, emissive: new THREE.Color(colors[type]),
        emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.4, toneMapped: false,
      }),
    );
    core.position.y = 0.8;
    // A halo shell makes the drop readable across the map through fog.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colors[type]), transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, toneMapped: false,
      }),
    );
    halo.position.y = 0.8;
    const light = new THREE.PointLight(new THREE.Color(colors[type]), 22, 7, 2);
    light.position.y = 0.85;
    light.layers.enableAll();
    // Born hidden. The light pool adopts every point light in the scene and
    // hides it, but it only rescans twice a second — so a drop spawning in
    // between arrived VISIBLE, three counted one more point light than the
    // shaders were compiled for, and every material in the map recompiled on
    // that frame and again when the rescan hid it. Two full pipeline rebuilds
    // for a light the pool was going to mirror anyway. It costs nothing to
    // start hidden: the pool reads intensity and transform, not visibility.
    light.visible = false;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textTexture(icons[type], { w: 256, h: 56, bg: 'rgba(0,0,0,0)', fg: colors[type], font: 'bold 38px Arial', glow: colors[type] }),
      transparent: true, toneMapped: false,
    }));
    label.scale.set(1.4, 0.32, 1);
    label.position.y = 1.35;
    g.add(core, halo, light, label);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const drop = { type, group: g, x, z, t: 25, core, halo, light };
    this.drops.push(drop);
    return drop;
  }

  removeDrop(drop) {
    this.scene.remove(drop.group);
    const i = this.drops.indexOf(drop);
    if (i >= 0) this.drops.splice(i, 1);
  }
}
