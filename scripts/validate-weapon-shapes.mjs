// Every weapon has to be the shape it is drawn as: solid where it is solid,
// wound the right way out, fixed to what it hangs from, and nobody's twin.
//
// The model audit of 2026-09-15 (docs/model-audit) rendered the roster alone
// under flat light and found defects that validate-weapon-models.mjs cannot
// see, because every part involved still touched some other part:
//
// - Five stock outlines crossed themselves at the wrist. A self-crossing
//   outline cannot be filled, so six rifles carried a hollow frame of thin
//   strips where the stock should be.
// - 21 lathes across 13 weapons were wound inside-out. Every weapon material
//   is single-sided, so their near walls were culled: the Panzerschreck's
//   warhead showed through its tube, the MP40's receiver rings hung round
//   nothing, and every drum was see-through from one side.
// - The Thompson's and the PPSh's drum rings stood a quarter-turn off the
//   drum face, hoops through the drum and out past the receiver.
// - The Springfield was the Mosin-Nagant with its bolt handle turned.
// - The Mosin's and the Kar98k's magazines swallowed their trigger guards, the
//   Panzerschreck's rocket hung out of the back of its tube, the Type 100's
//   magazine swung out past the side of the gun, the double-barrel's forend
//   hung under the barrels, and the M1911's grip, the Magnum's ejector rod and
//   the Mosin's front scope mount all stopped short of what they fix to.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { meshData, touches } from './lib/mesh-contact.mjs';

const { WEAPONS, buildViewmodel } = await loadGameModule('weapons.js');
const ids = Object.keys(WEAPONS);
assert.ok(ids.length > 20, 'the weapon roster should not be nearly empty');

const built = new Map();
for (const id of ids) {
  const root = buildViewmodel(id, false);
  root.userData.viewNode.updateMatrixWorld(true);
  built.set(id, root);
}
const visibleMeshes = (node) => {
  const out = [];
  node.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    out.push(o);
  });
  return out;
};
const failures = [];

// ---------------------------------------------------------------------------
// 1. Outlines never cross themselves
// ---------------------------------------------------------------------------
// Proper crossing of segments ab and cd, touching endpoints excluded.
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
  const eps = 1e-12;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}
function selfCrossing(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;          // they share pts[0]
      const c = pts[j], d = pts[(j + 1) % n];
      if (cross(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return [i, j];
    }
  }
  return null;
}
{
  const seen = new Set();
  let outlines = 0;
  for (const [id, root] of built) {
    for (const mesh of visibleMeshes(root.userData.viewNode)) {
      const g = mesh.geometry;
      if (g.type !== 'ExtrudeGeometry' || seen.has(g)) continue;
      seen.add(g);
      const shapes = [].concat(g.parameters.shapes);
      for (const shape of shapes) {
        const { shape: outline, holes } = shape.extractPoints(g.parameters.options.curveSegments ?? 12);
        for (const [what, pts] of [['outline', outline], ...holes.map((h) => ['hole', h])]) {
          outlines++;
          const hit = selfCrossing(pts);
          if (hit) {
            failures.push(`${id}: a plate ${what} crosses itself (edges ${hit[0]} and ${hit[1]}, near `
              + `[${pts[hit[0]].x.toFixed(3)}, ${pts[hit[0]].y.toFixed(3)}]) — it cannot be filled and renders hollow`);
          }
        }
      }
    }
  }
  assert.ok(outlines > 90, `expected to check the roster's plate outlines, found ${outlines}`);
}

// ---------------------------------------------------------------------------
// 2. Lathes are wound outward
// ---------------------------------------------------------------------------
// three faces a lathe outward only when its profile, closed along the axis,
// runs counter-clockwise in (radius, axial).
function latheArea(points) {
  const loop = [{ x: 0, y: points[0].y }, ...points, { x: 0, y: points[points.length - 1].y }];
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}
{
  let lathes = 0;
  for (const [id, root] of built) {
    for (const mesh of visibleMeshes(root.userData.viewNode)) {
      if (mesh.geometry.type !== 'LatheGeometry') continue;
      lathes++;
      if (latheArea(mesh.geometry.parameters.points) <= 0) {
        failures.push(`${id}: a lathe is wound inside-out — its near wall is culled and you see straight through it`);
      }
    }
  }
  assert.ok(lathes > 40, `expected to check the roster's lathes, found ${lathes}`);
}

// ---------------------------------------------------------------------------
// 3. A ring on a round body lies round it
// ---------------------------------------------------------------------------
// Any torus centred near the axis of a lathe it overlaps, and sized like that
// lathe, is a band or a face ring on it — so it has to share the lathe's axis.
// latheGeo() turns every profile to run along its geometry's Z.
{
  const zAxis = (m) => new THREE.Vector3().setFromMatrixColumn(m.matrixWorld, 2).normalize();
  const worldScale = (m) => m.getWorldScale(new THREE.Vector3()).x;
  for (const [id, root] of built) {
    const meshes = visibleMeshes(root.userData.viewNode);
    const lathes = meshes.filter((m) => m.geometry.type === 'LatheGeometry').map((m) => {
      const pts = m.geometry.parameters.points;
      return {
        mesh: m, axis: zAxis(m), origin: m.getWorldPosition(new THREE.Vector3()),
        radius: Math.max(...pts.map((p) => p.x)) * worldScale(m),
        from: Math.min(...pts.map((p) => p.y)) * worldScale(m), to: Math.max(...pts.map((p) => p.y)) * worldScale(m),
      };
    });
    for (const ring of meshes.filter((m) => m.geometry.type === 'TorusGeometry')) {
      const centre = ring.getWorldPosition(new THREE.Vector3());
      const radius = ring.geometry.parameters.radius * worldScale(ring);
      const axis = zAxis(ring);
      for (const body of lathes) {
        const rel = centre.clone().sub(body.origin);
        const along = rel.dot(body.axis);
        const off = rel.addScaledVector(body.axis, -along).length();
        if (along < body.from || along > body.to) continue;
        if (off > body.radius * 0.5 || radius < body.radius * 0.5 || radius > body.radius * 1.5) continue;
        if (Math.abs(axis.dot(body.axis)) < 0.99) {
          failures.push(`${id}: a ring of radius ${(radius * 1000).toFixed(0)}mm on a round body is turned `
            + `${(Math.acos(Math.min(1, Math.abs(axis.dot(body.axis)))) * 180 / Math.PI).toFixed(0)}° off its axis`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. No weapon is another with a tweak
// ---------------------------------------------------------------------------
{
  const signature = (root) => {
    const out = new Map();
    const box = new THREE.Box3();
    const mm = (v) => Math.round(v * 1000);
    for (const mesh of visibleMeshes(root.userData.viewNode)) {
      box.setFromObject(mesh);
      const key = [mesh.geometry.attributes.position.count, mm(box.min.x), mm(box.min.y), mm(box.min.z),
        mm(box.max.x), mm(box.max.y), mm(box.max.z)].join(',');
      out.set(key, (out.get(key) || 0) + 1);
    }
    return out;
  };
  const sigs = ids.map((id) => [id, signature(built.get(id))]);
  const total = (m) => [...m.values()].reduce((a, c) => a + c, 0);
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const [a, A] = sigs[i], [b, B] = sigs[j];
      let shared = 0;
      for (const [key, n] of A) shared += Math.min(n, B.get(key) || 0);
      const share = shared / Math.max(total(A), total(B));
      if (share > 0.6) {
        failures.push(`${a} and ${b} share ${(share * 100).toFixed(0)}% of their parts, placed identically — one is a copy of the other`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Parts are where they belong
// ---------------------------------------------------------------------------
const partMeshes = (id, name) => {
  const part = built.get(id).userData.parts[name];
  assert.ok(part, `${id}: expected a '${name}' part`);
  return part;
};

// Is `p` inside the closed meshes under `node`? Odd crossings of a ray.
const _dir = new THREE.Vector3(1, 0.0123, 0.0071).normalize();
function inside(p, tris) {
  let crossings = 0;
  const far = 10;
  for (let t = 0; t < tris.length; t += 9) {
    const e1x = tris[t + 3] - tris[t], e1y = tris[t + 4] - tris[t + 1], e1z = tris[t + 5] - tris[t + 2];
    const e2x = tris[t + 6] - tris[t], e2y = tris[t + 7] - tris[t + 1], e2z = tris[t + 8] - tris[t + 2];
    const hx = _dir.y * e2z - _dir.z * e2y, hy = _dir.z * e2x - _dir.x * e2z, hz = _dir.x * e2y - _dir.y * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det;
    const sx = p.x - tris[t], sy = p.y - tris[t + 1], sz = p.z - tris[t + 2];
    const u = (sx * hx + sy * hy + sz * hz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (_dir.x * qx + _dir.y * qy + _dir.z * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d > 0 && d < far) crossings++;
  }
  return crossings % 2 === 1;
}
const worldTris = (node) => {
  const out = [];
  for (const m of meshData(node)) for (const i of m.tri) out.push(m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]);
  return out;
};
const worldVerts = (node) => {
  const out = [];
  for (const m of meshData(node)) for (let i = 0; i < m.verts.length; i += 3) out.push(new THREE.Vector3(m.verts[i], m.verts[i + 1], m.verts[i + 2]));
  return out;
};

// A trigger guard is something you put a finger through, not something buried
// in the magazine ahead of it.
for (const [id, root] of built) {
  const { guard, mag } = root.userData.parts;
  if (!guard?.visible || !mag?.visible) continue;
  const tris = worldTris(mag);
  const verts = worldVerts(guard);
  const buried = verts.filter((p) => inside(p, tris)).length / verts.length;
  if (buried > 0.1) failures.push(`${id}: ${(buried * 100).toFixed(0)}% of the trigger guard is buried inside the magazine`);
}

// Pairs that must touch directly, not merely through some third part.
for (const [id, a, b] of [
  ['m1911', 'grip', 'frame'],
  ['magnum', 'ejector', 'cylinder'],
  ['mosin', 'mount_f', 'barrel'],
  ['springfield', 'mount_f', 'receiver'],
  ['springfield', 'mount_r', 'receiver'],
  ['thompson', 'mag', 'receiver'],
  ['ppsh', 'drum', 'receiver'],
]) {
  const A = meshData(partMeshes(id, a)), B = meshData(partMeshes(id, b));
  if (!A.some((x) => B.some((y) => touches(x, y)))) failures.push(`${id}: '${a}' does not reach '${b}'`);
}

// The Panzerschreck's rocket is loaded: every part of it inside the bore.
{
  const tube = partMeshes('panzerschreck', 'tube');
  const pts = tube.geometry.parameters.points;
  const bore = Math.min(...pts.map((p) => p.x).filter((r) => r > 0.001));
  const [from, to] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  tube.updateMatrixWorld(true);
  const toTube = tube.matrixWorld.clone().invert();
  let outside = 0, n = 0;
  for (const p of worldVerts(partMeshes('panzerschreck', 'rocket'))) {
    p.applyMatrix4(toTube);
    n++;
    if (Math.hypot(p.x, p.y) > bore || p.z < from || p.z > to) outside++;
  }
  if (outside) failures.push(`panzerschreck: ${outside} of ${n} rocket vertices are outside the tube's ${(bore * 2000).toFixed(0)}mm bore`);
}

// The double-barrel's forend takes the barrels into its top.
{
  const forend = new THREE.Box3().setFromObject(partMeshes('dbshotgun', 'forend'));
  const lowest = new THREE.Box3().setFromObject(partMeshes('dbshotgun', 'barrels')).min.y;
  if (!(forend.max.y > lowest + 0.005)) {
    failures.push(`dbshotgun: the forend's top (${forend.max.y.toFixed(3)}) does not rise into the barrels (lowest ${lowest.toFixed(3)})`);
  }
}

// A magazine fed from under the receiver stays under it. A drum's wind key may
// stand a centimetre proud of its face; a whole magazine may not swing out.
for (const [id, root] of built) {
  const { mag, receiver } = root.userData.parts;
  if (!mag?.visible || !receiver?.visible) continue;
  if (Math.abs(mag.getWorldPosition(new THREE.Vector3()).x) > 0.02) continue;   // side-fed by design
  const m = new THREE.Box3().setFromObject(mag), r = new THREE.Box3().setFromObject(receiver);
  const over = Math.max(m.max.x - r.max.x, r.min.x - m.min.x);
  if (over > 0.015) failures.push(`${id}: the magazine sticks ${(over * 1000).toFixed(0)}mm out past the side of the receiver`);
}

if (failures.length) {
  console.error(`\n${failures.length} weapon shape problem(s):\n  ${failures.join('\n  ')}\n`);
  throw new Error(`${failures.length} weapon shape problem(s)`);
}
console.log(`weapon shapes OK — ${ids.length} weapons: outlines fill, lathes face out, rings sit square, no twins, parts fixed where they belong`);
