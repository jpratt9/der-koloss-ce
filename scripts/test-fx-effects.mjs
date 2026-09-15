// Run a real FX and check what it actually drew.
//
// js/fx.js and js/fx/ are the only part of the effect system nothing else
// executes: validate-performance-invariants pins the shape of its text, and
// test-fx-modules pins the split's contract, but neither one plays an effect.
// This runs the class against recording particle pools, recording DOM elements,
// a hand-advanced clock, a recording audio.play and a seeded Math.random
// (scripts/lib/headless-fx.mjs), and asserts what each effect emitted, stamped,
// lit and retired.
import assert from 'node:assert/strict';
import { startFxHarness } from './lib/headless-fx.mjs';

const h = await startFxHarness();
const { fx, scene, BLOOD_DECAL_COLOR } = h;
let checks = 0;
const check = (fn) => { fn(); checks++; };

// ---------------------------------------------------------------------------
// Impacts: five surfaces, five different events.
// ---------------------------------------------------------------------------
// Tuned per surface in js/fx/surfaces.js. A bullet into steel must not look
// like a bullet into dirt — that difference is the whole point of the table.
const SURFACES = {
  concrete: { smoke: 9, sparks: 0, flash: false, decal: 0x2a2825 },
  metal: { smoke: 4, sparks: 9, flash: true, decal: 0x1c1d20 },
  wood: { smoke: 9, sparks: 0, flash: false, decal: 0x1a1208 },
  dirt: { smoke: 10, sparks: 0, flash: false, decal: 0x181209 },
  glass: { smoke: 10, sparks: 3, flash: true, decal: 0x22282c },
};
for (const [surface, want] of Object.entries(SURFACES)) {
  check(() => {
    const before = fx.decalHead;
    const litBefore = fx.boomLights.filter((b) => b.t > 0).length;
    fx.impact(2, 1.2, -3, 0, 1, 0, surface);
    const emits = h.takeEmits();
    assert.equal(emits.filter((e) => e.pool === 'smoke').length, want.smoke,
      `${surface} must throw its own count of dust and chips`);
    assert.equal(emits.filter((e) => e.pool === 'sparks').length, want.sparks,
      `${surface} must spark only if the table says it does`);
    const d = fx.decals[before];
    assert.equal(d.mesh.material.color.getHex(), want.decal, `${surface} must leave its own hole colour`);
    assert.equal(d.mesh.material.map, d.holeTex, `${surface} must leave a hole, not a splat`);
    assert.equal(d.t, 40, 'a bullet hole must stay ~40s');
    assert.equal(fx.boomLights.filter((b) => b.t > 0).length, litBefore + (want.flash ? 1 : 0),
      `${surface} must light the room only if it sparks`);
  });
}
check(() => {
  fx.impact(0, 1, 0, 0, 1, 0, 'obsidian');
  const emits = h.takeEmits();
  assert.equal(emits.filter((e) => e.pool === 'smoke').length, SURFACES.concrete.smoke,
    'an unknown surface must fall back to concrete rather than throwing');
});
check(() => {
  const before = fx.decalHead;
  fx.impact(1, 1, 1, 0, 3, 0);            // an unnormalised normal
  const d = fx.decals[before];
  assert.ok(Math.abs(d.mesh.position.y - 1.012) < 1e-6,
    'the hole must be offset along the unit normal, not along whatever length it arrived with');
  h.take();
});

// ---------------------------------------------------------------------------
// Blood: spray, mist and a pool on the floor, all one colour.
// ---------------------------------------------------------------------------
check(() => {
  const before = fx.decalHead;
  fx.blood(1, 1.4, 1, false);
  const small = h.takeEmits();
  assert.equal(small.filter((e) => e.pool === 'gore').length, 14, 'a normal hit sprays 14');
  assert.equal(small.filter((e) => e.pool === 'smoke').length, 5, 'and hangs 5 of mist');
  const d = fx.decals[before];
  // Pinned to the literal, not to the constant: a check that reads the value
  // out of the module it is checking passes whatever that value becomes. This
  // is the tuned one — a decal is unlit, so the post chain's exposure turns a
  // literal dried-blood hex into glowing vermillion.
  assert.equal(BLOOD_DECAL_COLOR, 0x2a0705, 'the blood colour must stay the value the HDR composite was tuned for');
  assert.equal(d.mesh.material.color.getHex(), BLOOD_DECAL_COLOR,
    'the pool must be the one blood colour js/map/hand-placed.js also stamps');
  assert.equal(d.mesh.material.map, d.bloodTex, 'the pool must use the splat map, not the hole map');
  assert.ok(d.mesh.position.y > 0.018 && d.mesh.position.y < 0.05,
    'the pool must lie on the floor, lifted just off it so it never z-fights');
});
check(() => {
  fx.blood(-2, 1.6, 0.5, true);
  const big = h.takeEmits();
  assert.equal(big.filter((e) => e.pool === 'gore').length, 26, 'a big hit sprays more');
  assert.equal(big.filter((e) => e.pool === 'smoke').length, 10, 'and hangs more mist');
});

// ---------------------------------------------------------------------------
// The decal ring is fixed: a long firefight must not grow it.
// ---------------------------------------------------------------------------
check(() => {
  const size = fx.decals.length;
  const head = fx.decalHead;
  for (let i = 0; i < size + 6; i++) fx.impact(i * 0.1, 1, -2, 0, 0, 1, 'wood');
  h.take();
  assert.equal(fx.decals.length, size, 'the decal ring must never grow');
  assert.equal(fx.decalHead, (head + size + 6) % size, 'the ring head must wrap, reusing the oldest slots');
});

// ---------------------------------------------------------------------------
// Tracers: too short to see, then billboarded at the eye and retired.
// ---------------------------------------------------------------------------
check(() => {
  fx.clearTransientEffects();
  h.take();
  fx.tracer(0, 1, 0, 0.1, 1, 0.05);
  assert.equal(fx.tracers.filter((t) => t.t > 0).length, 0,
    'a tracer shorter than the 0.25m floor must be dropped, not drawn as a dot');
});
check(() => {
  fx.tracer(0, 1.5, 0, 8, 1.5, -6);
  const t = fx.tracers.find((x) => x.t > 0);
  assert.ok(t, 'a long shot must take a tracer slot');
  assert.equal(t.mesh.visible, true);
  assert.deepEqual([t.mesh.position.x, t.mesh.position.y, t.mesh.position.z], [4, 1.5, -3],
    'the quad must sit at the midpoint of the beam');
  assert.ok(Math.abs(t.mesh.scale.y - Math.hypot(8, 0, 6)) < 1e-6, 'and be as long as the beam');
  h.frames(1);
  assert.equal(t.mesh.matrixAutoUpdate, false, 'a live tracer is oriented by hand, not by the scene graph');
  const expected = t.mesh.position.clone().sub(h.camera.position).length();
  assert.ok(expected > 0);
  h.frames(10);
  assert.equal(t.t <= 0, true, 'a tracer lives 0.075s, so ten frames retire it');
  assert.equal(t.mesh.visible, false);
  assert.equal(t.mesh.matrixAutoUpdate, true, 'a retired tracer must hand its matrix back to the scene graph');
  h.take();
});

// ---------------------------------------------------------------------------
// Brass: a fixed ring, bounces that lose energy, one click on the first bounce.
// ---------------------------------------------------------------------------
check(() => {
  fx.clearTransientEffects();
  h.take(); h.takeAudio();
  const size = fx.shells.length;
  for (let i = 0; i < size + 4; i++) fx.shell(0, 1.4, 0, 1, 0);
  assert.equal(fx.shells.length, size, 'the shell ring must never grow');
  assert.equal(fx.shellHead, 4, 'the shell head must wrap');
});
check(() => {
  fx.clearTransientEffects();
  h.take(); h.takeAudio();
  fx.shell(0, 1.4, 0, 1, 0);
  const s = fx.shells[fx.shellHead - 1];
  h.frames(120);
  assert.ok(s.bounced >= 1, 'a case dropped from 1.4m must hit the floor');
  assert.ok(s.bounced <= 3, 'and must stop bouncing after three, not ring forever');
  const clicks = h.takeAudio();
  assert.equal(clicks.length, 1, 'exactly one click, on the first bounce');
  assert.equal(clicks[0].id, 'ui');
  assert.equal(clicks[0].opts.vol, 0.09, 'and quiet: you hear this a few hundred times a round');
  assert.ok(s.mesh.position.y >= 0.008, 'a case must never sink through the floor');
  h.take();
});

// ---------------------------------------------------------------------------
// Muzzle flash: a light that spikes and is gone inside four frames.
// ---------------------------------------------------------------------------
check(() => {
  fx.muzzleFlash(0.3, 1.5, -0.4, 0, 0, -1, 1);
  const emits = h.takeEmits();
  assert.equal(emits.filter((e) => e.pool === 'sparks').length, 5, 'a hot core and four of burning gas');
  assert.equal(emits.filter((e) => e.pool === 'smoke').length, 1, 'and one wisp, so sustained fire builds up');
  assert.equal(fx.muzzleLight.intensity, 55, 'the shot must light the room');
  assert.deepEqual([fx.muzzleLight.position.x, fx.muzzleLight.position.y, fx.muzzleLight.position.z], [0.3, 1.5, -0.4]);
  h.frames(4);
  assert.equal(fx.muzzleLight.intensity, 0, 'and be dark again four frames later');
  h.take();
});
check(() => {
  fx.muzzleFlash(0, 1, 0, 0, 0, -1, 2);
  assert.equal(fx.muzzleLight.intensity, 110, 'a bigger weapon flashes brighter');
  h.frames(4); h.take();
});

// ---------------------------------------------------------------------------
// Explosions: bigger radius, more of everything, and it shakes the camera.
// ---------------------------------------------------------------------------
check(() => {
  fx.clearTransientEffects();
  fx.trauma = 0; h.take();
  fx.explosion(3, 0.4, -2, 2);
  const small = h.takeEmits().length;
  const traumaSmall = fx.trauma;
  fx.trauma = 0;
  fx.explosion(3, 0.4, -2, 8);
  const big = h.takeEmits().length;
  assert.ok(big > small, 'a bigger blast must throw more');
  assert.ok(fx.trauma > traumaSmall, 'and shake harder');
  assert.ok(fx.trauma <= 1, 'trauma must never exceed 1, however many go off at once');
  assert.equal(fx.boomLights.some((b) => b.t > 0), true, 'a blast lights the room');
});
check(() => {
  const a = fx.getShakeOffset();
  const b = fx.getShakeOffset();
  assert.equal(a, b, 'the shake result must be one reused object, not a new one every frame');
  h.frames(120);
  assert.equal(fx.trauma, 0, 'trauma must decay back to nothing');
  const rest = fx.getShakeOffset();
  assert.deepEqual([rest.yaw, rest.pitch, rest.roll].map((v) => v + 0), [0, 0, 0],
    'and a rested camera must not drift');
  h.take();
});

// ---------------------------------------------------------------------------
// Lightning: a bowed arc per segment, pinned at both ends.
// ---------------------------------------------------------------------------
check(() => {
  fx.clearTransientEffects(); h.take();
  const points = [{ x: 0, y: 2, z: 0 }, { x: 3, y: 2.4, z: -1 }, { x: 6, y: 1.8, z: -4 }];
  fx.lightning(points);
  const live = fx.bolts.filter((b) => b.t > 0);
  assert.equal(live.length, points.length - 1, 'one bolt per span, not one per point');
  const pos = live[0].line.geometry.attributes.position.array;
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) < 1e-5);
  assert.ok(near([pos[0], pos[1], pos[2]], [0, 2, 0]), 'the arc must start at the first point, not near it');
  assert.ok(near([pos[69], pos[70], pos[71]], [3, 2.4, -1]), 'and end at the second');
  const midOffset = Math.abs(pos[36] - (0 + 3 * (12 / 23)));
  assert.ok(midOffset > 0, 'the middle must be displaced, or it is a straight line');
  assert.equal(fx.boomLights.some((b) => b.t > 0), true, 'a discharge lights the room');
  h.frames(30);
  assert.equal(fx.bolts.every((b) => !b.line.visible), true, 'and is gone half a second later');
  h.take();
});

// ---------------------------------------------------------------------------
// Screen: the DOM path, the post path, and never both.
// ---------------------------------------------------------------------------
check(() => {
  fx.postActive = false;
  fx.onDamageFlash = null;
  fx.damageFlash();
  assert.deepEqual(h.takeDom(), [{ id: 'dmg-vignette', prop: 'opacity', value: '1' }],
    'with no post chain the vignette is a DOM element');
  const [first] = h.pending();
  assert.equal(first.ms, 180, 'and it clears itself on a timer');
  h.takeCleared();
  fx.damageFlash();
  assert.deepEqual(h.takeCleared(), [first.id], 'a second hit must cancel the first timer, not stack two');
  assert.equal(h.pending().length, 1, 'so only one fade is ever waiting');
  h.takeDom();
  h.fireTimers();
  assert.deepEqual(h.takeDom(), [{ id: 'dmg-vignette', prop: 'opacity', value: '0' }], 'the timer fades it back out');
});
check(() => {
  const seen = [];
  fx.postActive = true;
  fx.onDamageFlash = (amount) => seen.push(['damage', amount]);
  fx.onScreenFlash = (color, ms, opacity) => seen.push(['flash', color, ms, opacity]);
  fx.damageFlash(2);
  fx.screenFlash('#f00', 300, 0.9);
  assert.deepEqual(seen, [['damage', 2], ['flash', '#f00', 300, 0.9]], 'the post chain must get both events');
  assert.deepEqual(h.takeDom(), [], 'and the DOM overlays must stay out of it, or the screen flashes twice');
  assert.equal(h.pending().length, 0, 'with no DOM write there is no timer to clear');
  fx.postActive = false;
});

// ---------------------------------------------------------------------------
// Popups: a fixed ring that floats up and fades.
// ---------------------------------------------------------------------------
check(() => {
  const size = fx.popups.length;
  for (let i = 0; i < size + 2; i++) fx.popup(2, 1.8, -1, `+${i * 10}`);
  assert.equal(fx.popups.length, size, 'the popup ring must never grow');
  assert.equal(fx.popupHead, 2, 'the popup head must wrap');
  const p = fx.popups[0];
  const y0 = p.sprite.position.y;
  h.frames(20);
  assert.ok(p.sprite.position.y > y0, 'a popup must drift upward');
  h.frames(60);
  assert.equal(p.sprite.material.opacity, 0, 'and fade out');
  h.take();
});

// ---------------------------------------------------------------------------
// Power-up drops: born hidden, bob, blink out, and leave the scene.
// ---------------------------------------------------------------------------
check(() => {
  const before = scene.children.length;
  const drop = fx.spawnDrop('maxammo', 4, -4);
  assert.equal(fx.drops.length, 1);
  assert.equal(scene.children.length, before + 1, 'a drop must be one group in the scene');
  assert.equal(drop.light.visible, false,
    'a drop light must be born hidden: the light pool only rescans twice a second, and a visible one '
    + 'recompiles every material in the map');
  assert.equal(drop.t, 25, 'a drop must time out on its own');
  const y0 = drop.core.position.y;
  h.frames(30, 1 / 60, 1);
  assert.notEqual(drop.core.position.y, y0, 'a drop must bob');
  assert.notEqual(drop.core.rotation.y, 0, 'and spin');
  h.take();
});
check(() => {
  const drop = fx.drops[0];
  drop.t = 3;
  h.frames(1, 1 / 60, 5);
  assert.equal(typeof drop.group.visible, 'boolean', 'a drop about to expire blinks');
  drop.t = 1 / 60;
  const before = scene.children.length;
  h.frames(1);
  assert.equal(fx.drops.length, 0, 'an expired drop must retire itself');
  assert.equal(scene.children.length, before - 1, 'and leave the scene');
  h.take();
});
check(() => {
  const drop = fx.spawnDrop('nuke', 1, 1);
  const before = scene.children.length;
  fx.removeDrop(drop);
  assert.equal(fx.drops.length, 0);
  assert.equal(scene.children.length, before - 1);
  fx.removeDrop(drop);
  assert.equal(fx.drops.length, 0, 'removing a drop twice must not splice out somebody else');
  h.take();
});

// ---------------------------------------------------------------------------
// Teardown: a match that ends must not leave the last round on screen.
// ---------------------------------------------------------------------------
check(() => {
  fx.impact(0, 1, 0, 0, 1, 0, 'metal');
  fx.tracer(0, 1.5, 0, 6, 1.5, 0);
  fx.shell(0, 1.4, 0, 1, 0);
  fx.lightning([{ x: 0, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }]);
  h.take();
  fx.clearTransientEffects();
  const cleared = h.take().filter((c) => c.method === 'clear');
  assert.equal(cleared.length, 3, 'every particle pool must be emptied');
  assert.equal(fx.tracers.every((t) => t.t <= 0 && !t.mesh.visible), true, 'every tracer gone');
  assert.equal(fx.shells.every((s) => s.t <= 0 && !s.mesh.visible), true, 'every case gone');
  assert.equal(fx.bolts.every((b) => b.t <= 0 && !b.line.visible), true, 'every bolt gone');
  assert.equal(fx.boomLights.every((b) => b.t <= 0 && b.light.intensity === 0), true, 'every blast light dark');
  assert.equal(fx.muzzleLight.intensity, 0, 'and the muzzle light dark');
});

// ---------------------------------------------------------------------------
// The frame: it must survive a backgrounded tab and a camera-less call.
// ---------------------------------------------------------------------------
check(() => {
  fx.update(1 / 60, null, 1);
  fx.setViewportHeight(1080);
  const scaled = h.take().filter((c) => c.method === 'setViewportScale');
  assert.equal(scaled.length, 3, 'every pool must be told the new viewport height');
  fx.tracer(0, 1.5, 0, 6, 1.5, 0);
  fx.update(1 / 60, null, 1);
  assert.equal(fx.tracers.some((t) => t.t > 0), true, 'a frame with no camera must still age the world');
  h.take();
});

console.log(`FX effects OK: ${checks} checks against a real FX — five surfaces with their own dust, sparks, hole `
  + 'colour and light; blood spray, mist and a floor pool in the one blood colour; fixed decal, shell, tracer and '
  + 'popup rings that wrap instead of growing; a case that bounces at most three times and clicks once; a muzzle '
  + 'flash that spikes and dies in four frames; blasts that scale and shake; a bowed arc pinned at both ends; the '
  + 'DOM and post flash paths never both firing; drops born hidden that bob, blink and leave the scene; and a '
  + 'teardown that empties every pool.');
