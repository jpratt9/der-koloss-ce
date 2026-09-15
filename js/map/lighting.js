// The map's lighting: the art direction the post stack reads, ground fog and
// skylight dust, the sky, and the lights (hemisphere bounce, the moon and its
// shadow box, the room lamps, the fire lights).
// buildMap() in js/map.js calls buildLighting() in build order, with the names in
// its parameter list, and re-exports MOON_DIR and GRADE.
import * as THREE from 'three';
import { rand } from '../utils.js';
import { Sky } from '../render/Sky.js';
import { SunShadow } from '../render/SunShadow.js';

// ---------------------------------------------------------------------------
// Art direction. One place to tune the whole look: the post stack reads this
// verbatim, so grading, fog and bloom stay consistent with the map's lighting.
// Moonlit industrial: cold cyan shadow, warm sodium practicals, heavy haze.
// ---------------------------------------------------------------------------
// Moon placement is shared by the sky shader, the key light and the post
// stack's in-scatter direction; one constant keeps all three in agreement.
export const MOON_DIR = new THREE.Vector3(0.46, 0.60, -0.65).normalize();

export const GRADE = {
  exposure: 2.45,
  bloomStrength: 0.55,
  bloomThreshold: 1.15,
  saturation: 1.10,
  contrast: 1.075,
  // Blacks are lifted, not crushed. AgX rolls the bottom end off hard, and
  // with the power off the factory interior went genuinely unnavigable — you
  // could not see a wall until it hit you. This keeps the night reading as
  // night while leaving enough separation to move through a dark room.
  lift: new THREE.Vector3(0.030, 0.040, 0.062),
  gamma: new THREE.Vector3(1.0, 1.0, 1.0),
  gain: new THREE.Vector3(1.045, 1.0, 0.955),     // sodium-warm highlights
  volDensity: 0.0125,
  volHeightFalloff: 0.14,
  volFogBase: -0.5,
  volAnisotropy: 0.76,
  volAmbient: 0.16,
  volAmbientColor: new THREE.Color(0x24344f),
};

export function buildLighting({ group, fires, matDark }) {
  // ---------- atmosphere: drifting ground fog + skylight dust ----------
  const fogPlaneTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(180,195,220,0.045)');
    grad.addColorStop(0.6, 'rgba(160,175,205,0.022)');
    grad.addColorStop(1, 'rgba(150,165,195,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const fogMat = new THREE.MeshBasicMaterial({ map: fogPlaneTex, transparent: true, depthWrite: false, fog: true });
  const fogPatches = [];
  // Raymarched volumetric fog in the post stack now carries the atmosphere.
  // These alpha planes remain only as a faint near-ground wisp layer.
  const fogSpots = [
    [0, 20, 16, 10], [-6, 16, 12, 8], [7, 23, 12, 8],           // mainframe courtyard
    [-8, -28, 16, 10], [4, -34, 16, 10], [-4, -40, 14, 9],      // factory courtyard
    [0, -52, 18, 10],                                            // factory floor
  ];
  // Intentionally not instantiated: the raymarched volumetric pass in the post
  // stack replaces these, and layering both produced visible banded planes.
  void fogSpots; void fogMat;
  // dust motes falling through the factory skylight
  const dustGeo = new THREE.BufferGeometry();
  const dustN = 90, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = rand(-8, 8); dustPos[i * 3 + 1] = rand(0.2, 6.8); dustPos[i * 3 + 2] = rand(-56, -48);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x9db4dd, size: 0.02, transparent: true, opacity: 0.55, sizeAttenuation: true }));
  group.add(dust);

  // ---------- sky ----------
  // Shader atmosphere: moon disc with limb darkening and halo, drifting
  // stratus, procedural stars, horizon haze. Also the source of the IBL bake.
  const sky = new Sky({
    moonDir: MOON_DIR.clone(),
    moonColor: 0xd6e4ff,
    moonSize: 0.0026,
    zenith: 0x040711,
    horizon: 0x1a2740,
    ground: 0x04060a,
    starDensity: 0.022,
    cloud: 0.5,
    skyExposure: 1.15,
  });
  group.add(sky.mesh);

  // ---------- lights (physical units: r160) ----------
  // Sky IBL replaces most of the old flat hemisphere fill; what remains is a
  // small bounce term so pure-shadow interiors never go fully black.
  // Sky IBL supplies the directional ambient; this is the bounce floor that
  // stops unlit interiors going to pure black with the power off.
  // The ground half of the hemisphere is BOUNCE, and it has to look like the
  // surface actually doing the bouncing. It was 0x171512 — near-black brown —
  // while every floor in the level is pale concrete, so any surface facing away
  // from the sky received almost nothing. On the spawn platform's steps that
  // turned each riser into a hard black band between two lit treads: measured
  // 16 luminance on the risers against 48 on the treads, which reads as
  // horizontal black lines painted across the screen rather than as steps.
  //
  // A neutral concrete bounce lifts exactly those crushed vertical and
  // downward faces and barely touches sky-facing surfaces, so overall exposure
  // is essentially unchanged.
  const hemi = new THREE.HemisphereLight(0x36496e, 0x3a3b3d, 3.6);
  group.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xa8c0f0, 2.6);
  moonLight.position.copy(MOON_DIR).multiplyScalar(90);
  moonLight.castShadow = true;
  group.add(moonLight, moonLight.target);
  moonLight.target.position.set(0, 0, -20);
  const sunShadow = new SunShadow(moonLight, { extent: 32, distance: 70, resolution: 2048 });

  // Room lamps (dim until power). Sodium practicals are the only warm source in
  // the map, so they carry the color contrast against the blue moonlight.
  const lamps = [];
  const lampDefs = [
    [-10, 3, 0xffb765], [10, 3, 0xffb765],           // corridors
    [-23, -13, 0xffb765], [23, -13, 0xffb765],       // labs / garage
    [-10, -15, 0xffb765, 5.4], [10, -15, 0xffb765, 5.4], // balconies (elevated)
    [-38, -13, 0x9dc4ff], [17, -30, 0x9dc4ff, 5.4],  // generator / chemical (cool)
    [-7, -52, 0xffb765], [7, -52, 0xffb765],         // factory (high)
  ];
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2723, roughness: 0.62, metalness: 0.55, side: THREE.DoubleSide });
  for (const [lx, lz, lc, ly0] of lampDefs) {
    const isHall = lz === -52;
    const ly = ly0 || (isHall ? 6.2 : 3.9);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0x201c16, emissive: lc, emissiveIntensity: 0.4, roughness: 0.25 }));
    bulb.position.set(lx, ly, lz);
    // Conical enamel shade: gives the pool of light a hard top edge and reads
    // as a real fixture in silhouette instead of a floating dot.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.26, 14, 1, true), shadeMat);
    shade.position.set(lx, ly + 0.14, lz);
    shade.castShadow = false;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8), matDark);
    cord.position.set(lx, ly + 0.62, lz);
    const pl = new THREE.PointLight(lc, 5, 22, 2);
    pl.position.set(lx, ly - 0.08, lz);
    group.add(bulb, shade, cord, pl);
    lamps.push({ pl, bulb, shade, base: lc, flicker: Math.random() < 0.35, t: rand(10) });
  }
  // fire lights
  for (const f of fires) {
    f.light = new THREE.PointLight(0xff7028, 52, 13, 2);
    f.light.position.set(f.x, f.y + 0.4, f.z);
    group.add(f.light);
  }
  return { fogPatches, dust, dustN, sky, moonLight, sunShadow, lamps };
}
