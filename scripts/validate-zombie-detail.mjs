#!/usr/bin/env node
// Zombie detail has to sit ON the corpse: in front of the skin, and against it.
//
// Regression this exists for (docs/model-audit, 2026-09-15): the bone-attached
// detail was placed from bone positions and authored radii, and on the two
// shipped models almost none of it landed on the body. The glowing eyes were
// inside the Basic zombie's head, down by its nose; the skull damage was inside
// both heads; the tunic was a tube inside the Basic's chest and a sail off the
// Chubby's back; the coat skirt was swallowed by the models' own shorts and
// floated over a crawler's back as a ring; the sleeve tatters were inside the
// upper arms. Nothing checked where any of it ended up.
//
// So this poses both real models through every proportion preset and the clips
// a live zombie plays, with every damage variant attached, and looks at each
// piece from six sides: how much of it is in front of the skin, and how much of
// it has no skin anywhere near it.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';
import { pointTriSq } from './lib/mesh-contact.mjs';

seedRandom(0x0d37a11);
await loadZombieModels();
const { ZombieVisual } = await loadGameModule('zombies.js');
const { attachZombieDetail } = await loadGameModule('render', 'ZombieDetail.js');

const VARIANTS = 8;   // the damage pool size in ZombieDetail.js; indices wrap
const CLIPS = [['Idle', 0.35], ['Walk', 0.25], ['Run', 0.6], ['Idle_Attack', 0.4], ['Crawl', 0.3]];
const MODELS = [[0, 'Basic'], [1, 'Chubby']];
// A piece is floating where no skin is within this many metres of it. Cloth
// stands a few centimetres off a body and a hem swings clear of a stride; a
// hand's width off it is a sail.
const LOOSE = 0.12;
// Skin within this much of a point, toward the viewer, does not hide it: that
// is the surface it is lying on.
const SURFACE = 0.003;

const presets = [];
for (let i = 0; i < 60; i++) {
  const { prop } = new ZombieVisual(i % 2);
  if (!presets.includes(prop)) presets.push(prop);
}
assert.ok(presets.length >= 3, `expected every proportion preset to be exercised (found ${presets.length})`);

// ---------------------------------------------------------------------------
// The posed skin, binned for the two questions asked of it
// ---------------------------------------------------------------------------
function posedSkin(visual) {
  const tris = [];
  const v = new THREE.Vector3();
  visual.inner.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const pos = o.geometry.attributes.position;
    const w = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      w[i * 3] = v.x; w[i * 3 + 1] = v.y; w[i * 3 + 2] = v.z;
    }
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const j = idx ? idx.getX(t + k) : t + k;
        tris.push(w[j * 3], w[j * 3 + 1], w[j * 3 + 2]);
      }
    }
  });
  return new Float64Array(tris);
}

const cellKey = (a, b, c = 0) => `${a},${b},${c}`;

/** Triangles binned in 3D, for "is any skin near this point". */
function nearGrid(tris, cell) {
  const grid = new Map();
  for (let t = 0; t < tris.length; t += 9) {
    const lo = [0, 1, 2].map((a) => Math.floor(Math.min(tris[t + a], tris[t + 3 + a], tris[t + 6 + a]) / cell));
    const hi = [0, 1, 2].map((a) => Math.floor(Math.max(tris[t + a], tris[t + 3 + a], tris[t + 6 + a]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = cellKey(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
  }
  return { grid, cell };
}
function skinNear(g, tris, p, dist) {
  const r = Math.ceil(dist / g.cell), d2 = dist * dist;
  const cx = Math.floor(p.x / g.cell), cy = Math.floor(p.y / g.cell), cz = Math.floor(p.z / g.cell);
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
    for (const t of g.grid.get(cellKey(x, y, z)) || []) {
      if (pointTriSq(p.x, p.y, p.z, tris[t], tris[t + 1], tris[t + 2], tris[t + 3], tris[t + 4], tris[t + 5],
        tris[t + 6], tris[t + 7], tris[t + 8]) <= d2) return true;
    }
  }
  return false;
}

// Six orthographic looks, each down one axis from one side.
const VIEWS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
const VIEW_CELL = 0.02;
function viewGrid(tris, axis, sign) {
  const [u, v] = [0, 1, 2].filter((a) => a !== axis);
  const grid = new Map();
  for (let t = 0; t < tris.length; t += 9) {
    const u0 = Math.floor(Math.min(tris[t + u], tris[t + 3 + u], tris[t + 6 + u]) / VIEW_CELL);
    const u1 = Math.floor(Math.max(tris[t + u], tris[t + 3 + u], tris[t + 6 + u]) / VIEW_CELL);
    const v0 = Math.floor(Math.min(tris[t + v], tris[t + 3 + v], tris[t + 6 + v]) / VIEW_CELL);
    const v1 = Math.floor(Math.max(tris[t + v], tris[t + 3 + v], tris[t + 6 + v]) / VIEW_CELL);
    for (let a = u0; a <= u1; a++) for (let b = v0; b <= v1; b++) {
      const k = cellKey(a, b);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
  }
  return { grid, axis, sign, u, v };
}
/** Is `p` hidden behind skin, looking down this view? */
function hidden(view, tris, p) {
  const P = [p.x, p.y, p.z];
  const pu = P[view.u], pv = P[view.v], pd = P[view.axis] * view.sign;
  for (const t of view.grid.get(cellKey(Math.floor(pu / VIEW_CELL), Math.floor(pv / VIEW_CELL))) || []) {
    const au = tris[t + view.u], av = tris[t + view.v];
    const bu = tris[t + 3 + view.u], bv = tris[t + 3 + view.v];
    const cu = tris[t + 6 + view.u], cv = tris[t + 6 + view.v];
    const area = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (Math.abs(area) < 1e-14) continue;
    const w1 = ((pu - au) * (cv - av) - (cu - au) * (pv - av)) / area;
    const w2 = ((bu - au) * (pv - av) - (pu - au) * (bv - av)) / area;
    if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
    const depth = (tris[t + view.axis] * (1 - w1 - w2) + tris[t + 3 + view.axis] * w1 + tris[t + 6 + view.axis] * w2) * view.sign;
    if (depth > pd + SURFACE) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pose every model, preset and clip with every damage variant on it
// ---------------------------------------------------------------------------
const SLOT = {
  Hips: 'coat skirt', Torso: 'tunic', Head: 'skull damage',
  UpperArmL: 'sleeve tatters', UpperArmR: 'sleeve tatters', ShoulderL: 'sleeve tatters', ShoulderR: 'sleeve tatters',
};
const tally = new Map();   // "Model slot" -> { verts, shown, loose }
const eyes = new Map();    // model -> { verts, shown }
const worldV = new THREE.Vector3();
const failures = [];

for (const [variant, modelName] of MODELS) {
  for (const prop of presets) {
    const visual = new ZombieVisual(variant);
    visual.prop = prop;
    visual.hunch = prop.hunch;
    visual.tongueOut = false;
    const meshes = [];
    for (let i = 0; i < VARIANTS; i++) meshes.push(...attachZombieDetail(visual, i));
    assert.ok(meshes.length > VARIANTS * 2, `${modelName}: expected damage detail to attach (got ${meshes.length} meshes)`);
    for (const m of meshes) assert.ok(SLOT[m.parent?.name], `${modelName}: detail parented to an unexpected bone '${m.parent?.name}'`);
    const eyeMeshes = visual.headBone.children.filter((o) => o.isMesh && o.material?.type === 'MeshBasicMaterial');
    assert.equal(eyeMeshes.length, 2, `${modelName}: expected two glowing eyes on the head bone`);
    visual.play('Walk');
    visual.update(0);   // the first animated frame calibrates height, as in a match

    for (const [clip, phase] of CLIPS) {
      visual.mixer.stopAllAction();
      visual.current = null;
      visual.play(clip, { loop: true, fade: 0, timeScale: 1 });
      visual.update(visual.actions[clip].getClip().duration * phase);
      visual.group.updateMatrixWorld(true);
      const tris = posedSkin(visual);
      const near = nearGrid(tris, 0.06);
      const views = VIEWS.map(([axis, sign]) => viewGrid(tris, axis, sign));

      for (const mesh of meshes) {
        const key = process.env.DETAIL_BY_CLIP ? `${modelName} ${SLOT[mesh.parent.name]} @${clip}` : `${modelName} ${SLOT[mesh.parent.name]}`;
        if (!tally.has(key)) tally.set(key, { verts: 0, shown: 0, loose: 0 });
        const row = tally.get(key);
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          worldV.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          row.verts++;
          if (views.some((view) => !hidden(view, tris, worldV))) row.shown++;
          if (!skinNear(near, tris, worldV, LOOSE)) row.loose++;
        }
      }
      // Eyes are judged face on, standing: a crawler's face is in the dirt.
      if (clip === 'Idle' || clip === 'Walk') {
        const front = views[4];   // looking back down Z from in front of the face
        for (const eye of eyeMeshes) {
          const key = `${modelName} ${eye.position.x < 0 ? 'right' : 'left'} eye`;
          if (!eyes.has(key)) eyes.set(key, { verts: 0, shown: 0 });
          const row = eyes.get(key);
          const pos = eye.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            worldV.fromBufferAttribute(pos, i).applyMatrix4(eye.matrixWorld);
            row.verts++;
            if (!hidden(front, tris, worldV)) row.shown++;
          }
        }
      }
    }
    for (const m of meshes) m.parent.remove(m);
  }
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------
// Most of a garment faces the world. What does not is hidden behind arms that
// hang in front of it and, on the Basic, a head as wide as its shoulders that
// hangs over its chest — a tunic loses a third of itself to those alone. When
// this was written the buried pieces showed 0-40% of themselves and the fitted
// ones 69-99%.
const MIN_SHOWN = { tunic: 0.6, 'coat skirt': 0.7, 'sleeve tatters': 0.6, 'skull damage': 0.45 };
// A coat skirt is allowed clear of the body where it spans the gap between the
// legs, and more so when a crawl spreads them; nothing else is. The sail the
// Chubby's tunic made stood 28% of itself off the body, and the skirt that
// ringed a crawler's back 19%.
const MAX_LOOSE = { tunic: 0.02, 'coat skirt': 0.15, 'sleeve tatters': 0.02, 'skull damage': 0.02 };
const lines = [];
for (const [key, row] of tally) {
  const slot = key.slice(key.indexOf(' ') + 1);
  const shown = row.shown / row.verts, loose = row.loose / row.verts;
  lines.push(`${key.padEnd(22)} shown ${(shown * 100).toFixed(0).padStart(3)}%  loose ${(loose * 100).toFixed(1).padStart(4)}%`);
  if (shown < MIN_SHOWN[slot]) failures.push(`${key}: only ${(shown * 100).toFixed(0)}% of it is ever in front of the skin — it is buried in the body`);
  if (loose > MAX_LOOSE[slot]) failures.push(`${key}: ${(loose * 100).toFixed(1)}% of it is more than ${LOOSE * 100}cm from any skin — it is standing off the body`);
}
for (const [slot] of Object.entries(MIN_SHOWN)) {
  for (const [, modelName] of MODELS) {
    assert.ok(tally.has(`${modelName} ${slot}`), `${modelName}: no variant carries any ${slot} — the check has nothing to look at`);
  }
}
// Some of each eye has to show face on. The Chubby's sit deep under a brow and
// show a sliver; the Basic's showed nothing at all.
for (const [key, row] of eyes) {
  const shown = row.shown / row.verts;
  lines.push(`${key.padEnd(22)} shown ${(shown * 100).toFixed(0).padStart(3)}% face on`);
  if (shown < 0.04) failures.push(`${key}: none of it can be seen from in front of the face — it is inside the head`);
}
console.log(lines.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} zombie detail problem(s):\n  ${failures.join('\n  ')}\n`);
  throw new Error(`${failures.length} zombie detail problem(s)`);
}
console.log(`zombie detail OK — ${MODELS.length} models x ${presets.length} presets x ${CLIPS.length} clips, every damage variant on the body`);
