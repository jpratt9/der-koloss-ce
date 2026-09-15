// Pack-a-Punch: the host-clocked upgrade cycle, the whirr that spans it, the
// weapon tracked by slot through the machine, and the hand-over back to the rig.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readGameSource, readWeaponsSource } from './lib/game-source.mjs';

import {
  papEventMatches,
  papLifecyclePhase,
  PAP_PROCESS_SECONDS,
  PAP_READY_TIMEOUT_SECONDS,
} from '../js/gameplay-rules.js';

const root = new URL('../', import.meta.url);
const [gameSource, weaponSource, mapSource] = await Promise.all([
  readGameSource(),
  readWeaponsSource(),
  readFile(new URL('js/map.js', root), 'utf8'),
]);

// Pack-a-Punch is host-clocked and has three explicit presentation phases.
assert.equal(PAP_PROCESS_SECONDS, 4);
assert.equal(PAP_READY_TIMEOUT_SECONDS, 30);
assert.equal(papLifecyclePhase({ busy: false }), 'idle');
assert.equal(papLifecyclePhase({ busy: true, ready: false }), 'processing');
assert.equal(papLifecyclePhase({ busy: true, ready: true }), 'ready');
const papCycle = { busy: true, ready: false, owner: 'guest-a', weapon: 'mg42' };
assert.equal(papEventMatches(papCycle, 'guest-a', 'mg42'), true);
assert.equal(papEventMatches(papCycle, 'guest-b', 'mg42'), false, 'stale/wrong-owner ready event rejected');
assert.equal(papEventMatches(papCycle, 'guest-a', 'dg2'), false, 'stale/wrong-weapon ready event rejected');
assert.match(gameSource, /ps\.t <= 0 && this\.isAuthority/,
  'only the authority may complete the PaP processing clock');
assert.match(gameSource, /case 'pap_ready':[\s\S]{0,180}papEventMatches\(this\.papState, msg\.pid, msg\.w\)/);
assert.match(gameSource, /case 'pap_reject':[\s\S]{0,220}_cancelLocalPapAttempt\(true\)/);
assert.match(gameSource, /case 'pap_take':[\s\S]{0,900}this\.papTake\(false\)/,
  'owner must accept an authority timeout grant without echoing another request');
assert.match(gameSource, /dispose\(\)[\s\S]{0,800}_clearPapOutputWeapon\(\)/,
  'world PaP weapon must be removed when the game exits');
assert.match(gameSource, /p\.weapons\.length > 1 && p\.weapon\.upgrading[\s\S]{0,500}papHide = !!p\.weapon\?\.upgrading/,
  'a single weapon must stay hidden while it is inside Pack-a-Punch');

// The whirr is one shot spanning the whole cycle, so the sample length and the
// process clock have to stay welded together — change one, change the other.
const audioLoudness = JSON.parse(await readFile(new URL('scripts/audio-loudness.json', root), 'utf8'));
const papWhirrSeconds = audioLoudness.files?.pap?.seconds;
assert.equal(papWhirrSeconds, PAP_PROCESS_SECONDS,
  `pap.mp3 is ${papWhirrSeconds}s but a PaP cycle is ${PAP_PROCESS_SECONDS}s — the whirr must span exactly one cycle`);
assert.match(gameSource, /_papWhirrStarted[\s\S]{0,200}audio\.play\('pap_whirr'/,
  'the whirr must fire once per cycle, not on a retrigger timer');
assert.match(gameSource, /_resetPapState\(\)[\s\S]{0,320}_stopPapWhirr\(\)/,
  'a cycle that ends early must cut the whirr');
assert.doesNotMatch(gameSource, /_papSndT/, 'the old whirr retrigger timer must be gone');
assert.match(gameSource, /const echoOfMine = this\.papState\.mine && msg\.pid === p\.id && this\.papState\.weapon === msg\.w;/,
  'pap_start must recognise the authority echo of our own request');
assert.match(gameSource, /if \(!echoOfMine\) audio\.play\('pap_insert'/,
  'the authority echo of our own pap_start must not double-ring the insert');
assert.match(gameSource, /const slot = echoOfMine \? this\.papState\.slot : null;/,
  'the echo must carry the recorded slot forward');

// The gun in the machine is tracked by slot identity: the box can hand out a
// second copy of the same id mid-cycle, and an id lookup would upgrade the wrong
// one and strand the real slot as permanently `upgrading`.
assert.match(gameSource, /_papSlot\(\)[\s\S]{0,300}this\.player\.weapons\.includes\(slot\)/,
  'PaP must resolve its weapon by slot reference before falling back to id');
// This used to pin `this._papSlot() || p.weapon`, which is the exact expression
// that BREAKS the invariant stated above it: when the recorded slot is no longer
// in the player's hands (goDown stashes the loadout and issues a fresh m1911)
// the fallback upgraded whatever was being held — the down pistol, discarded on
// revive — and left the real slot stranded as permanently `upgrading`, which is
// the failure the comment above describes. There must be no fallback.
assert.match(gameSource, /papTake\(notifyAuthority = true\)[\s\S]{0,1200}const w = this\._papSlot\(\);/,
  'papTake must upgrade the exact slot that went into the machine, with no fallback');
assert.doesNotMatch(gameSource, /this\._papSlot\(\) \|\| p\.weapon/,
  'papTake must never substitute the held weapon for the slot in the machine');
assert.match(gameSource, /this\.papState\.slot = p\.weapon/,
  'papUse must record the slot handed to the machine');
// Buying bypasses switchWeapon(), the only other thing that clears papHide.
assert.equal((gameSource.match(/this\._revealAcquiredWeapon\(\);/g) || []).length, 2,
  'both the wall buy and the box must reveal a weapon acquired mid-PaP');
assert.match(gameSource, /_revealAcquiredWeapon\(\) \{[\s\S]{0,220}papHide = false/,
  'a gun bought while your other gun is in the machine must be visible and fireable');
assert.match(mapSource, /const papProcessing = pap\.processing/);
assert.match(mapSource, /papSlot\.material\.emissiveIntensity = papProcessing/);

// Taking the upgraded gun out of the machine used to open on one frame of
// full-frame blurred receiver. equip() is called from papTake() and from the box,
// both of which run AFTER the rig update in the same tick that renders — so a
// model left on the identity transform is drawn once with its authored origin ON
// the lens, and that frame is the longest in the hand-over because it is also the
// frame the view-model's materials compile. The pose has to be applied by equip()
// itself, not left for the next update(). Same class as the perk bottle
// (validate-perk-drink.mjs) — that one appeared on the camera, this one fills it.
{
  const equipBody = weaponSource.match(/\n  equip\(id, pap\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(equipBody, 'WeaponRig.equip not found');
  assert.match(equipBody, /this\._poseRaiseStart\(group\)/,
    'equip() must pose the new view-model on the frame it is built');
  assert.match(weaponSource, /_poseRaiseStart\(group\) \{[\s\S]{0,240}group\.position\.copy\(this\.hipPos\)[\s\S]{0,240}EQUIP_RAISE_DROP/,
    'the primed pose must be the bottom of the raise, in the rig frame');
  const papTakeBody = gameSource.match(/papTake\(notifyAuthority = true\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(papTakeBody, 'Game.papTake not found');
  assert.doesNotMatch(papTakeBody, /current\.group\.visible = true/,
    'papTake must leave view-model visibility to the rig gate, or a scoped take draws the gun into the scope picture');
  // uFlash is a scalar added pre-tonemap, so the post path cannot be tinted: at
  // the old 0.3 this purple event flashed the screen white for three frames.
  const takeFlash = papTakeBody.match(/screenFlash\('#c9a2ff', (\d+), ([\d.]+)\)/);
  assert.ok(takeFlash, 'papTake must keep its PaP-tinted screen wash');
  assert.ok(Number(takeFlash[2]) <= 0.12,
    `PaP take flash is ${takeFlash[2]}; a colourless post lift above ~0.12 reads as a glitch, not as feedback`);
  // The HUD is not refreshed again until the next shot, so it has to be handed
  // the upgraded capacity, not the one the gun went into the machine with.
  assert.ok(
    papTakeBody.indexOf('w.mag = s.mag') < papTakeBody.indexOf('this.hud.setAmmo'),
    'papTake must set the upgraded mag/reserve before it pushes them to the HUD',
  );
}

console.log('Pack-a-Punch OK: host clock, lifecycle, whirr, slot identity and hand-over.');
