// Run the real Net against a fake PeerJS: the host's gate, the guest's reader
// and voice chat, end to end, with no network and no browser.
//
// Every other validator reads js/net.js and js/net/ as text. This one executes
// them, because the parts that matter are the ones a text pin can't check: that
// a guest cannot announce what only the host may, that a rate floor actually
// drops the second packet, that the host stamps the shooter id itself, that a
// swept peer leaves the roster, and that a lobby code nobody hosts says so.
// scripts/lib/headless-peerjs.mjs fakes PeerJS, the clock, the microphone and
// the analysers; nothing here reaches the signalling server.
import assert from 'node:assert/strict';
import { startNetHarness, flush } from './lib/headless-peerjs.mjs';

const CID = (k) => `client-${k}${'0'.repeat(20)}`;
const h = await startNetHarness();
let checks = 0;
const check = (fn) => { fn(); checks++; };

// ---------------------------------------------------------------------------
// The host: admission, the gate, the sweep, teardown
// ---------------------------------------------------------------------------
const host = new h.Net();
const events = [];
const rosters = [];
const left = [];
const states = [];
host.onEvent = (msg, from) => events.push({ ...msg, from });
host.onLobby = (players) => rosters.push(players.map((p) => `${p.name}/${p.color}/${p.ready ? 'ready' : 'not'}`));
host.onPeerLeave = (id, name) => left.push(`${id}:${name}`);
host.onPlayerState = (msg) => states.push(msg);

const code = await h.host(host, '  Zed the Long Name ');
const hostPeer = h.lastPeer();
check(() => assert.match(code, /^[A-Z2-9]{5}$/, 'a lobby code is five unambiguous characters'));
check(() => assert.deepEqual(host.lobbyPlayers.map((p) => p.name), ['Zed the Long N'], 'a name is stripped of control characters and cut to 14'));

// A guest whose unreliable channel arrives first still ends up with both.
const aU = h.connectTo(hostPeer, { id: 'zzz-guest', ch: 'u', clientId: CID('a'), closeFiresSync: true });
const aR = h.connectTo(hostPeer, { id: 'zzz-guest', ch: 'r', clientId: CID('a') });
check(() => assert.equal(host.peers.get('zzz-guest').openU, true, 'an unreliable channel that arrives before its partner is kept and paired'));

// Nothing counts until hello.
aR.emit('data', { t: 'ready', ready: true });
aU.emit('data', { x: 1, y: 1, z: 1, yaw: 0, pitch: 0 });
check(() => assert.deepEqual([rosters.length, states.length], [0, 0], 'a peer that has not said hello can neither change the lobby nor move'));

aR.emit('data', { t: 'hello', name: 'Anna', persona: 'takeo', clientId: CID('a') });
check(() => assert.deepEqual(rosters.at(-1), ['Zed the Long N/0/not', 'Anna/1/not'], 'hello authenticates the peer and broadcasts the roster'));
check(() => assert.equal(h.lastSent(aR).t, 'lobby', 'and the guest is sent that roster'));

// The gate drops what a guest may not send.
const before = events.length;
aR.emit('data', { t: 'nope' });
aR.emit('data', { t: 'power', on: true });
aR.emit('data', 'not an object');
aR.emit('data', null);
aR.emit('data', { t: 'door_req', deep: { a: { b: { c: { d: { e: 1 } } } } } });
check(() => assert.equal(events.length, before, 'an unknown type, a host-only type, a non-object and an oversized payload are all dropped'));

const doorReqs = () => events.filter((e) => e.t === 'door_req').length;
aR.emit('data', { t: 'door_req', id: 2 });
aR.emit('data', { t: 'door_req', id: 2 });
check(() => assert.equal(doorReqs(), 1, 'door_req has a 500 ms floor'));
await h.advance(600);
aR.emit('data', { t: 'door_req', id: 2 });
check(() => assert.equal(doorReqs(), 2, 'and the floor lets the next one through'));

await h.advance(1000);
for (let k = 0; k < 120; k++) aR.emit('data', { t: 'heartbeat' });
const rostersAfterFlood = rosters.length;
aR.emit('data', { t: 'name', name: 'Flood' });
check(() => assert.equal(rosters.length, rostersAfterFlood, 'the 121st reliable packet in a second is dropped'));
await h.advance(1000);
aR.emit('data', { t: 'name', name: 'Anna B' });
check(() => assert.equal(rosters.at(-1)[1], 'Anna B/1/not', 'the next second lets it through'));

await h.advance(1000);
const relays = () => aR.sent.filter((m) => m.t === 'shoot').length;
aR.emit('data', { t: 'shoot', w: 'mp40', pid: 'spoofed' });
check(() => assert.equal(events.at(-1).pid, 'zzz-guest', 'the host stamps the shooter id itself rather than trusting the sender'));
check(() => assert.equal(relays(), 1, 'a guest shot is relayed so the other guests see the flash'));
await h.advance(30);
aR.emit('data', { t: 'shoot', w: 'mp40' });
check(() => assert.equal(relays(), 1, 'a shot inside the 55 ms relay budget is not relayed again'));
await h.advance(30);
aR.emit('data', { t: 'shoot', w: 'mp40' });
check(() => assert.equal(relays(), 2, 'past the budget it is'));

await h.advance(2000);
aR.emit('data', { t: 'perk_anim', id: 'jug', pid: 'spoofed' });
check(() => assert.deepEqual(h.lastSent(aR), { t: 'perk_anim', pid: 'zzz-guest', id: 'jug' },
  'a relayed perk animation carries the authenticated id, never the claimed one'));
await h.advance(2000);
const perkAnims = events.filter((e) => e.t === 'perk_anim').length;
aR.emit('data', { t: 'perk_anim', id: 'not-a-perk' });
check(() => assert.equal(events.filter((e) => e.t === 'perk_anim').length, perkAnims, 'an unknown perk id is dropped'));

aU.emit('data', { x: 500, y: -80, z: -500, yaw: 150, pitch: 3, id: 'spoofed', name: 'spoofed' });
check(() => assert.deepEqual(
  [states.at(-1).x, states.at(-1).y, states.at(-1).z, states.at(-1).yaw, states.at(-1).pitch, states.at(-1).id, states.at(-1).name],
  [200, -50, -200, 100, Math.PI / 2, 'zzz-guest', 'Anna B'],
  'player state is clamped to the world, and its identity comes from the connection',
));
const statesBefore = states.length;
aU.emit('data', { x: 'abc', y: 0, z: 0, yaw: 0, pitch: 0 });
check(() => assert.equal(states.length, statesBefore, 'a coordinate that is not a number drops the update'));

// A guest that reloads and reconnects takes back its seat, not a second one.
const a2R = h.connectTo(hostPeer, { id: 'zzz-guest-2', ch: 'r', clientId: CID('a') });
a2R.emit('data', { t: 'hello', name: 'Anna', persona: 'takeo', clientId: CID('a') });
check(() => assert.deepEqual(left, ['zzz-guest:Anna B'], 'the peer it replaces leaves'));
check(() => assert.deepEqual(host.lobbyPlayers.map((p) => `${p.name}/${p.color}`), ['Zed the Long N/0', 'Anna/1'],
  'the returning player keeps one row and its colour'));

const guests = new Map([['guest-b', CID('b')], ['guest-c', CID('c')]]);
for (const [id, clientId] of guests) {
  const conn = h.connectTo(hostPeer, { id, ch: 'r', clientId });
  conn.emit('data', { t: 'hello', name: id, persona: 'nikolai', clientId });
  guests.set(id, conn);
}
const dR = h.connectTo(hostPeer, { id: 'guest-d', ch: 'r', clientId: CID('d') });
check(() => assert.match(h.lastSent(dR).reason, /Lobby is full/, 'a fifth player is turned away'));
check(() => assert.equal(dR.closed, true));

host.startGame({ seed: 1 });
const eR = h.connectTo(hostPeer, { id: 'guest-e', ch: 'r', clientId: CID('e') });
check(() => assert.match(h.lastSent(eR).reason, /Match in progress/, 'and so is anyone who knocks mid-match'));
host.resetLobbyReady();
check(() => assert.deepEqual([host.matchActive, host.lobbyPlayers.every((p) => !p.ready)], [false, true],
  'returning to the lobby clears the match and every ready flag'));

left.length = 0;
for (let k = 0; k < 5; k++) {
  guests.get('guest-b').emit('data', { t: 'heartbeat' });
  await h.advance(5000);
}
check(() => assert.equal(left.includes('guest-c:guest-c'), true, 'a peer silent for 20 s is swept'));
check(() => assert.equal(left.includes('guest-b:guest-b'), false, 'one that heartbeats is not'));

left.length = 0;
guests.get('guest-b').emit('data', { t: 'leave' });
check(() => assert.deepEqual(left, ['guest-b:guest-b'], 'a guest that leaves is dropped at once'));

host.leave();
check(() => assert.deepEqual([host.peers.size, host.peer, host.onEvent, host.lobbyPlayers.length], [0, null, null, 0],
  'teardown drops every peer and every callback, so a dead transport cannot deliver late'));
await h.advance(60000);
const quiet = [rosters.length, events.length, states.length];
a2R.emit('data', { t: 'ready', ready: true });
aU.emit('data', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
check(() => assert.deepEqual([rosters.length, events.length, states.length], quiet,
  'and a packet that arrives on a torn-down transport is ignored'));

// ---------------------------------------------------------------------------
// The guest: what it accepts from the host
// ---------------------------------------------------------------------------
const HOST_ID = 'der-koloss-z-ABC1X';
const guest = new h.Net();
const views = [];
const closed = [];
const snaps = [];
const gone = [];
guest.onLobby = (players, lobbyCode) => views.push({ lobbyCode, players: players.map((p) => `${p.name}/${p.color}/${p.persona}`) });
guest.onClosed = (reason) => closed.push(reason);
guest.onSnap = (msg) => snaps.push(msg);
guest.onPeerLeave = (id, name) => gone.push(`${id}:${name}`);
guest.setPersona('takeo');
await h.join(guest, 'ab-c1x9', 'Guest One', { id: 'aaa-guest' });
check(() => assert.equal(guest.code, 'ABC1X', 'a typed code is upper-cased, stripped and cut to five'));
check(() => assert.deepEqual(guest.hostConn.r.sent[0], { t: 'hello', name: 'Guest One', persona: 'takeo', clientId: guest._clientId },
  'joining says hello with a clean name and the chosen soldier'));

const lobby = (players, extra = {}) => guest.hostConn.r.emit('data', { t: 'lobby', code: 'ABC1X', players, ...extra });
lobby([
  { id: HOST_ID, name: 'Host', host: true, ready: true, color: 0, persona: 'nikolai' },
  { id: 'aaa-guest', name: 'Guest', color: 7, persona: 'bogus' },
  { id: 'guest-b', name: 'Bo ', color: 2, persona: 'richtofen' },
], { cheats: 'not an object' });
check(() => assert.deepEqual(views.at(-1).players, ['Host/0/nikolai', 'Guest/3/dempsey', 'Bo/2/richtofen'],
  'a roster off the wire is cleaned: colours bounded, unknown soldiers replaced, names stripped'));
check(() => assert.deepEqual(guest.lobbyCheats, {}, 'cheats that are not an object are ignored'));
lobby([{ id: HOST_ID, name: 'Host', host: true, color: 0 }, { id: 'aaa-guest', name: 'Guest', color: 3 }]);
check(() => assert.deepEqual(gone, ['guest-b:Bo'], 'a player missing from the next roster has left'));
lobby(Array.from({ length: 5 }, (_, k) => ({ id: `p${k}`, name: `P${k}`, color: k })));
check(() => assert.equal(views.length, 2, 'a roster with more than four players is not a roster'));

guest.hostConn.u.emit('data', { t: 'snap', pl: [{ id: 'aaa-guest', x: 1, y: 0, z: 2, yaw: 0, pitch: 0 }], z: [[1, 10, 20, 0, 0, 2, 0, 0, 0]] });
check(() => assert.equal(snaps.length, 1, 'a snapshot that fits the schema is delivered'));
guest.hostConn.u.emit('data', { t: 'snap', pl: [], z: Array.from({ length: 41 }, () => [1, 0, 0, 0, 0, 0, 0, 0, 0]) });
guest.hostConn.u.emit('data', { t: 'snap', pl: [{ id: 'x', x: 1e6, y: 0, z: 0, yaw: 0, pitch: 0 }], z: [] });
check(() => assert.equal(snaps.length, 1, '41 zombies, or a player outside the world, is not'));

guest.hostConn.r.emit('data', { t: 'reject', reason: 'Match in progress. Rejoin when the host returns to the lobby.' });
check(() => assert.deepEqual(closed, ['Match in progress. Rejoin when the host returns to the lobby.'], 'a rejection reaches the menu with its reason'));
check(() => assert.equal(guest.peer, null, 'and tears the transport down'));

// The message for a code nobody is hosting has to be the one the player sees.
{
  const lost = new h.Net();
  let error = null;
  const joining = lost.join('QQQQQ', 'Nobody').catch((e) => { error = e; });
  const peer = h.lastPeer();
  h.openPeer(peer, 'lost-guest');
  await flush();
  peer.emit('error', { type: 'peer-unavailable' });
  await joining;
  check(() => assert.match(error.message, /^Lobby not found\. Check the code\.$/,
    'PeerJS reports an unknown code after the peer is open, so the handler for never reaching the server must stand down by then'));
}
{
  const offline = new h.Net();
  let error = null;
  const joining = offline.join('QQQQQ', 'Nobody').catch((e) => { error = e; });
  h.lastPeer().emit('error', { type: 'network' });
  await joining;
  check(() => assert.match(error.message, /^Could not connect: network$/, 'an error before the peer opens is still a connection failure'));
}
{
  const leaver = new h.Net();
  await h.join(leaver, 'ABC1X', 'Bye', { id: 'bye-guest' });
  const channel = leaver.hostConn.r;
  leaver.leave();
  check(() => assert.deepEqual(channel.sent.at(-1), { t: 'leave' }, 'leaving tells the host, so the roster does not wait for the sweep'));
  check(() => assert.equal(leaver.peer, null));
}

// ---------------------------------------------------------------------------
// Voice: the policy, the pairing, the meters and the mutes
// ---------------------------------------------------------------------------
const room = new h.Net();
await h.host(room, 'Host');
const roomPeer = h.lastPeer();
for (const [id, key] of [['aaa-guest', 'l'], ['mmm-guest', 'm'], ['zzz-guest', 'z']]) {
  const conn = h.connectTo(roomPeer, { id, ch: 'r', clientId: CID(key) });
  conn.emit('data', { t: 'hello', name: id, persona: 'takeo', clientId: CID(key) });
}
const asked = h.mic.asked;
check(() => assert.equal(room.lobbyVoiceEnabled, false, 'voice starts off, so a guest is never prompted before the host says so'));
const offPolicyStream = await room.enableVoice();
check(() => assert.deepEqual([offPolicyStream, h.mic.asked], [null, asked], 'and with the policy off nothing asked for the microphone'));

room.setMicMuted(true);
check(() => assert.equal(room.setLobbyVoiceEnabled(true), true));
const stream = await room.enableVoice();
check(() => assert.equal(stream.getAudioTracks()[0].contentHint, 'speech', 'the capture is hinted as speech'));
check(() => assert.equal(stream.getAudioTracks()[0].enabled, false, 'a mute set before the prompt is re-applied to the fresh stream'));
check(() => assert.deepEqual(roomPeer.calls.map((c) => c.id), ['mmm-guest', 'zzz-guest'],
  'each pair calls once: we dial only the ids that sort after ours'));

const fromLow = h.makeCall('aaa-guest');
roomPeer.emit('call', fromLow);
await flush();
check(() => assert.deepEqual(fromLow.answered, [stream], 'and answer the one that sorts before ours when it dials us'));
const stranger = h.makeCall('nobody-here');
roomPeer.emit('call', stranger);
await flush();
check(() => assert.deepEqual([stranger.answered.length, stranger.closed], [0, true],
  'a peer that is not in the lobby never gets a microphone stream, however it learned the id'));

fromLow.emit('stream', { id: 'remote-low' });
for (const { call, id } of roomPeer.calls) call.emit('stream', { id: `remote-${id}` });
check(() => assert.equal(room.voiceStreams.size, 3, 'every remote voice gets its own element and analyser'));
check(() => assert.equal([...room.voiceStreams.values()].every((vs) => vs.el.attached && vs.analyser), true));

room.mutePeer('mmm-guest', true);
check(() => assert.equal(room.voiceStreams.get('mmm-guest').el.muted, true, 'muting a player silences its element'));
room.setMicMuted(false);
room._myAnalyser.loudness = 40;
for (const [, vs] of room.voiceStreams) vs.analyser.loudness = 40;
await h.advance(60);
room.updateVoiceSpeaking();
check(() => assert.equal(room.mySpeaking, true, 'the meter reads your own microphone'));
check(() => assert.equal([...room.voiceStreams.values()].every((vs) => vs.speaking), true, 'and each remote voice'));
check(() => assert.equal([...room.voiceStreams.values()].every((vs) => vs.el.volume === room.voiceVolume * 0.65), true,
  'three people talking at once duck each other'));
room.setMicMuted(true);
await h.advance(60);
room.updateVoiceSpeaking();
check(() => assert.equal(room.mySpeaking, false, 'a muted microphone never reads as speaking'));

room.disableVoice();
check(() => assert.equal(stream.getAudioTracks()[0].stopped, true, 'turning voice off stops the capture'));
check(() => assert.deepEqual([room.voiceStreams.size, room.myStream], [0, null], 'and detaches every remote voice'));
check(() => assert.equal(roomPeer.calls.every(({ call }) => call.closed), true, 'and closes every call'));
room.leave();

console.log(`Net session OK: ${checks} checks against a fake PeerJS — admission and hello, the gate (unknown, host-only, `
  + 'malformed and oversized packets, rate floors, the packet cap), the stamped shooter id and the throttled shot relay, '
  + 'sanitized perk animations, clamped player state, a reconnect that reclaims its seat, a full lobby, a mid-match knock, '
  + 'the stale sweep, teardown; the guest reader (roster, snapshots, rejection, an unknown code, leaving); and voice '
  + '(policy, pairing, answers, mutes, ducking, teardown).');
