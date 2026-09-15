// The page script, js/main.js and js/main/, run in Node on a fake page.
//
// Nothing else runs it: the validators pin its text, and test-main-modules
// loads js/main/ but can't boot the page. Nearly all of it runs in event
// handlers, and its modules share state through imports, so a function that
// uses a name its module doesn't import throws only when its control is used.
// In the browser the button just does nothing.
//
// So this boots js/main.js on the fake page in scripts/lib/headless-page.mjs and
// uses every control the way a player would:
// - the menu, the options, the character screens and the cheat codes, and a
//   solo match with its pause menu, pointer lock and fullscreen;
// - hosting a lobby: the roster, ready-up and the countdown, voice and mutes, a
//   match, the return to the lobby, and a dropped connection;
// - joining as a guest, with the host's cheat codes read-only and voice set by
//   the host;
// - settings saved by older builds, a start that fails, and invite links.
// Nothing may throw or reject, and each step checks what the player would see.
//
// Each scenario runs in its own Node process, because js/main.js boots once, as
// it loads.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RESULT = '@@main-page-result ';
const soldier = (o) => ({ color: 0, ready: false, ...o });

const SCENARIOS = {
  menu: {
    page: { search: '?debug=1', missing: ['vox_nikolai_power1'] },
    async run(page, { ok, eq }) {
      ok(page.shown('menu') && !page.shown('game-canvas'), 'the page boots to the menu, with the game canvas hidden');
      ok(globalThis.__audio, 'on localhost with ?debug=1, window.__audio is set');
      eq([page.el('opt-fov').value, page.text('btn-pause-fps')], [110, 'FPS COUNTER: OFF'], 'the options show their defaults');

      await page.act(() => page.mouseDown());
      await page.act(() => page.click('btn-char'));
      ok(page.shown('charselect') && page.children('char-cards').length === 4, 'CHARACTER shows the four marines');
      await page.act(() => page.click(page.children('char-cards')[1]));
      ok(page.shown('charpage'), 'a card opens its page');
      let log = await page.act(() => page.click(page.children('char-voice-lines')[0]));
      ok(log.includes('assets.loadAudio()') && log.some((l) => l.startsWith('audio.playBuffer(')), 'a voice preview loads the sounds first on a fresh page');
      await page.act(() => page.click(page.children('char-voice-lines')[3]));
      eq(page.text('toast'), 'Voice line not found.', 'a missing voice line says so');
      await page.act(() => page.click('btn-char-page-back'));
      ok(page.shown('charselect'), "the page's BACK returns to the cards");
      await page.act(async () => { page.click(page.children('char-cards')[2]); await page.flush(); page.click('btn-char-pick'); });
      ok(page.stored('der-riese-persona') === 'takeo' && page.shown('menu') && page.text('toast').endsWith(' selected'), 'SELECT keeps the marine and returns to the menu');

      log = await page.act(() => page.loadAssets());
      ok(log.some((l) => l.startsWith('audio.loopFile("menu_music"')), 'the menu music starts once the assets load');
      log = await page.act(() => page.click(page.menuLinks[0], { metaKey: true }));
      ok(!log.some((l) => l.startsWith('location.href')), 'a modified click on a menu link is left to the browser');
      log = await page.act(async () => { page.click(page.menuLinks[1]); await page.advance(100); });
      ok(log.includes('location.href = "/about/"') && log.some((l) => l.startsWith('keepMenuMusicClock(')), 'a menu link keeps the music clock, then navigates');

      await page.act(() => page.click('btn-options'));
      ok(page.shown('options'), 'OPTIONS opens the options screen');
      await page.act(() => {
        page.type('opt-fov', '95');
        page.type('opt-master', '0.5');
        page.type('opt-motionblur', '0');
        page.type('opt-quality', 'low', 'change');
        page.tick('opt-voicechat', false);
        page.tick('opt-invert', true);
        page.fire('opt-fps', 'change', { target: { checked: true } });
        page.type('opt-name', '   A very long soldier name  ', 'change');
      });
      const saved = JSON.parse(page.stored('dr_options_v1'));
      eq([saved.fov, saved.master, saved.masterTouched, saved.motionBlur, saved.quality, saved.voiceChat, saved.invertY, saved.showFps],
        [95, 0.5, true, 0, 'low', false, true, true], 'every options control saves its setting');
      eq([page.text('opt-motionblur-val'), page.text('btn-pause-fps')], ['Off', 'FPS COUNTER: ON'], 'the labels follow, including the pause menu FPS button');
      eq(page.stored('dr_player_name'), 'A very long so', 'a name is trimmed to 14 characters');
      await page.act(() => page.type('opt-name', '   ', 'change'));
      eq(page.el('opt-name').value, 'A very long so', 'a blank name keeps the old one');
      await page.act(() => page.click('btn-options-back'));
      ok(page.shown('menu'), "the options screen's BACK returns to the menu");

      await page.act(() => page.click('btn-cheats'));
      ok(page.shown('cheats'), 'CHEAT CODES opens the cheat screen');
      await page.act(() => { page.tick('cheat-papguns', true); page.tick('cheat-wunder', true); });
      eq([page.el('cheat-papguns').checked, page.el('cheat-wunder').checked], [false, true], 'WUNDERWAFFEN unticks ARMED TO THE TEETH');
      await page.act(() => page.type(page.search(0), 'mp'));
      ok(page.weapons(0).length && page.weapons(0).every((b) => /mp/i.test(b.innerHTML)), 'the search filters the gun list');
      await page.act(() => page.click(page.weapons(0)[0]));
      let cheats = JSON.parse(page.stored('der-riese-cheats'));
      ok(cheats.loadout.p1 && !cheats.wunder && !page.el('cheat-wunder').checked, 'picking a gun sets the loadout and unticks the spawn-gun codes');
      await page.act(() => page.click(page.weapons(0).find((b) => b.className.includes('sel'))));
      eq(JSON.parse(page.stored('der-riese-cheats')).loadout.p1, null, 'clicking the picked gun clears it');
      await page.act(() => page.type(page.search(1), 'zzz'));
      ok(page.weaponList(1).innerHTML.includes('no guns match'), 'a search with no match says so');
      await page.act(() => page.click('btn-titan'));
      cheats = JSON.parse(page.stored('der-riese-cheats'));
      eq([cheats.wunder, cheats.god, cheats.papguns, cheats.zero], [true, true, false, false], 'TITAN MODE arms its codes');
      await page.act(() => page.click('btn-cheats-all'));
      cheats = JSON.parse(page.stored('der-riese-cheats'));
      ok(cheats.zero && cheats.papguns && !cheats.wunder && page.text('toast').includes('GHOST TOWN'), 'ALL arms every code but WUNDERWAFFEN, and warns about GHOST TOWN');
      await page.act(() => page.click('btn-cheats-none'));
      ok(Object.entries(JSON.parse(page.stored('der-riese-cheats'))).every(([k, v]) => k === 'loadout' || !v), 'NONE clears every code');
      await page.act(() => page.type('cheat-round', '99', 'change'));
      eq(page.el('cheat-round').value, 40, 'the start round stops at 40');
      await page.act(() => { page.type('cheat-round', '0', 'change'); page.type('cheat-area', 'courtyard', 'change'); page.click(page.weapons(0)[2]); });
      cheats = JSON.parse(page.stored('der-riese-cheats'));
      eq([cheats.startRound, cheats.startArea, typeof cheats.loadout.p1], [1, 'courtyard', 'string'], 'the round, the area and the loadout are saved');
      await page.act(() => page.click('btn-cheats-back'));
      ok(page.shown('menu'), "the cheat screen's BACK returns to the menu");

      await page.act(() => page.click('btn-solo'));
      ok(page.shown('solo-fs-modal'), 'SOLO outside fullscreen offers fullscreen first');
      await page.act(() => page.click('btn-solo-fs-toggle'));
      eq(page.text('btn-solo-fs-start'), 'START GAME', 'entering fullscreen relabels the start button');
      await page.act(() => page.click('btn-solo-fs-toggle'));
      eq(page.text('btn-solo-fs-start'), 'START WITHOUT FULL SCREEN', 'and leaving it puts the label back');
      log = await page.act(() => page.click('btn-solo-fs-start'));
      const solo = page.game();
      ok(solo?.mode === 'solo' && solo.opts.net === null && solo.opts.cheats.loadout.p1, 'START builds a solo game with the cheat codes');
      ok(log.includes('game.init(<#game-canvas>)') && page.input.locked && page.shown('hud') && page.shown('game-canvas'), 'the game starts on the canvas, with the HUD up and the pointer locked');
      ok(log.includes('menu_music.stop()') && page.text('toast') === 'Survive. Good luck.', 'the menu music stops, and a toast says good luck');

      await page.act(() => page.key('Escape'));
      ok(solo.paused && page.shown('pause') && page.shown('hud') && !page.input.locked, 'Escape pauses and unlocks the pointer, and the HUD stays');
      ok(!page.shown('btn-pause-mic') && page.text('btn-quit') === 'QUIT TO MENU', 'a solo pause hides the mic and offers QUIT TO MENU');
      log = await page.act(async () => { page.click('btn-pause-options'); await page.flush(); page.type('opt-fov', '100'); });
      ok(log.includes('camera.fov = 100'), 'a field of view change applies to the running game');
      await page.act(() => page.key('Escape'));
      ok(page.shown('pause'), 'Escape on the options screen returns to the pause menu');
      await page.act(() => page.key('Escape'));
      ok(!solo.paused && page.input.locked && !page.shown('pause'), 'Escape on the pause menu resumes');

      await page.act(() => { page.input.keys.Tab = true; page.input.onPointerUnlock(); page.input.keys.Tab = false; });
      ok(!solo.paused && page.input.locked, 'losing the lock while Tab is held relocks instead of pausing');
      await page.act(async () => { page.input.locked = false; page.key('Tab'); page.input.keys.Tab = false; await page.advance(100); page.input.onPointerUnlock(); });
      ok(!solo.paused && page.input.locked, "losing it just after a Tab press relocks too: the page's Tab listener runs before input.js stops Tab");
      await page.act(async () => { await page.advance(1000); page.input.onPointerUnlock(); });
      ok(solo.paused && page.shown('pause'), 'losing it otherwise pauses');
      await page.act(async () => { page.click('btn-resume'); await page.flush(); page.input.locked = false; page.fire('game-canvas', 'mousedown'); });
      ok(page.input.locked && !solo.paused, 'RESUME, then a click on the canvas relocks a lost pointer');
      await page.act(() => { page.input.locked = false; page.documentEvent('pointerlockchange'); });
      ok(page.shown('lock-hint'), 'CLICK TO AIM shows while the pointer is unlocked mid-match');
      await page.act(() => { page.documentEvent('mousedown'); page.documentEvent('pointerlockchange'); });
      ok(page.input.locked && !page.shown('lock-hint'), 'a click anywhere relocks it, and the hint goes');
      await page.act(() => page.key('F11'));
      eq(page.text('btn-pause-fs'), 'FULLSCREEN: ON', 'F11 toggles fullscreen');
      log = await page.act(() => page.click('btn-quit'));
      ok(log.includes('game.dispose()') && page.shown('menu') && !page.input.locked && log.some((l) => l.startsWith('audio.loopFile("menu_music"')),
        'QUIT disposes the game and returns to the menu and its music');

      await page.act(() => { page.click('btn-join'); page.el('join-code').value = 'ab'; page.click('btn-join-go'); });
      eq(page.text('toast'), 'Enter the lobby code.', 'a short lobby code is refused');
      await page.act(() => page.advance(3300));
      ok(!page.shown('toast'), 'and the toast hides after about 3 s');
      await page.act(() => { page.flags.failJoin = true; page.el('join-code').value = 'bad12'; page.click('btn-join-go'); });
      ok(page.shown('menu') && page.text('toast') === 'Lobby not found.', 'a join that fails returns to the menu and says why');
      log = await page.act(() => { page.flags.failJoin = false; page.click('btn-join'); page.el('join-code').value = 'abcd1'; page.fire('join-code', 'keydown', { key: 'Enter' }); });
      ok(page.shown('lobby') && log.includes('net.join("ABCD1", "A very long so")'), 'Enter joins, with the code upper-cased');
      log = await page.act(() => page.click('btn-leave-lobby'));
      ok(log.includes('net.leave()') && page.shown('menu'), 'LEAVE leaves the room and returns to the menu');
    },
  },

  host: {
    page: { search: '?debug=1', storage: { dr_player_name: 'Host' } },
    async run(page, { ok, eq }) {
      const guest = (o) => soldier({ id: 'g1', name: 'Tak<b>"eo"</b>', color: 1, persona: 'dempsey', ...o });
      const me = (o) => soldier({ id: 'h', name: 'Host', host: true, persona: 'nikolai', ...o });
      await page.act(() => page.loadAssets());
      await page.act(() => { page.flags.failHost = true; page.click('btn-host'); });
      ok(page.shown('menu') && page.text('toast') === 'Could not reach the lobby server.' && page.text('btn-host') === 'HOST LOBBY' && !page.el('btn-host').disabled,
        'a host that fails stays in the menu, says why, and re-enables HOST LOBBY');
      let log = await page.act(() => { page.flags.failHost = false; page.click('btn-host'); });
      const net = page.net();
      ok(page.shown('lobby') && globalThis.__net === net, 'HOST LOBBY opens the lobby');
      ok(log.includes('net.setLobbyVoiceEnabled(true)') && log.some((l) => l.startsWith('net.setLobbyCheats(')) && log.includes('net.enableVoice()'),
        'the host publishes the voice policy and the cheat codes, then asks for the microphone');
      eq(page.el('lobby-link').value, 'https://www.derkoloss.com/invite/HST42?from=Host', 'the invite link carries the code and the host name');

      log = await page.act(() => page.lobby([guest(), me({ persona: 'dempsey' })]));
      ok(page.text('toast').includes('is taken') && log.includes('net.setPersona("nikolai")'), 'a marine someone claimed first is swapped for a free one');
      const roster = page.el('lobby-players').innerHTML;
      ok(roster.includes('Tak&lt;b&gt;&quot;eo&quot;&lt;/b&gt;') && !roster.includes('<b>'), 'names are escaped in the roster');
      await page.act(async () => { net.mySpeaking = true; net.voiceStreams.set('g1', { speaking: true }); await page.advance(200); });
      ok(page.speaker('h').classList.contains('on') && page.speaker('g1').classList.contains('on'), 'the speaking dots light for whoever is talking');

      log = await page.act(() => page.click('btn-ready'));
      ok(log.includes('net.setReady(true)') && page.text('btn-ready') === 'UNREADY', 'READY UP marks you ready');
      await page.act(() => page.lobby([guest(), me({ ready: true })]));
      eq(page.text('lobby-hint'), 'Waiting for majority to ready up (1/2, need 2)…', 'one of two ready is no majority');
      await page.act(async () => { page.lobby([guest({ ready: true }), me({ ready: true })]); await page.advance(3000); });
      eq(page.text('lobby-hint'), 'Starting in 7s — unready to cancel.', 'a majority starts a ten-second countdown');
      log = await page.act(async () => { page.lobby([guest(), me({ ready: true })]); await page.advance(12000); });
      ok(!log.some((l) => l.startsWith('net.startGame(')), 'losing the majority cancels it');
      log = await page.act(async () => { page.lobby([guest({ ready: true }), me({ ready: true })]); await page.advance(10500); });
      eq(log.filter((l) => l.startsWith('net.startGame(')).length, 1, 'the host starts the match when the countdown runs out');
      log = await page.act(() => page.click('btn-start-game'));
      eq(log.filter((l) => l.startsWith('net.startGame(')).length, 1, 'START GAME starts it at once');

      await page.act(() => page.click('btn-lobby-mic'));
      ok(!net.lobbyVoiceEnabled && page.text('btn-lobby-mic') === 'VOICE: OFF' && page.text('toast').startsWith('Voice chat disabled for this lobby'),
        "the host's VOICE button turns voice off for the lobby");
      eq(JSON.parse(page.stored('dr_options_v1')).voiceChat, false, 'and remembers it for the next lobby');
      await page.act(() => page.click('btn-lobby-mic'));
      ok(net.lobbyVoiceEnabled && page.text('btn-lobby-mic') === 'VOICE: ON', 'and turns it back on');
      const mute = page.muteButton('g1');
      await page.act(() => page.click('lobby-players', { target: mute }));
      ok(net.mutedPeers.has('g1') && mute.textContent === '🔇', "a player's mute button mutes them");
      await page.act(() => page.click('lobby-players', { target: mute }));
      ok(!net.mutedPeers.has('g1') && page.text('toast') === 'Player unmuted', 'and unmutes them');
      await page.act(() => page.click('btn-copy-link'));
      eq(page.text('toast'), 'Invite link copied — send it to your friend!', 'COPY LINK copies the invite');
      log = await page.act(() => { page.flags.clipboardFails = true; page.click('btn-copy-link'); });
      ok(log.includes('#lobby-link.select()') && page.text('toast') === 'Select and copy the link manually.', 'when the clipboard is refused, the link is selected instead');
      log = await page.act(() => page.type('lobby-name', '  Captain Miller the Second ', 'change'));
      ok(log.includes('net.setName("Captain Miller")') && page.el('lobby-link').value.endsWith('?from=Captain%20Miller'), 'a rename is sent and goes into the invite link');

      await page.act(() => page.click('btn-lobby-cheats'));
      ok(page.shown('cheats') && !page.el('cheat-god').disabled, 'the host can edit the cheat codes from the lobby');
      log = await page.act(() => page.tick('cheat-god', true));
      ok(log.some((l) => l.startsWith('net.setLobbyCheats(') && l.includes('god: true')), "the host's codes go to the lobby");
      log = await page.act(() => page.click('btn-cheats-back'));
      ok(page.shown('lobby') && log.some((l) => l.startsWith('#lobby-players.innerHTML')), "the cheat screen's BACK returns to the lobby and redraws it");
      await page.act(() => page.click('btn-lobby-char'));
      const cards = page.children('char-cards');
      ok(cards[0].className.includes('taken') && cards[0].listeners.length === 0, "a marine another player has is TAKEN and can't be opened");
      log = await page.act(async () => { page.click(cards[3]); await page.flush(); page.click('btn-char-pick'); });
      ok(page.shown('lobby') && log.includes('net.setPersona("richtofen")'), 'picking a free marine from the lobby returns to it and tells the room');
      await page.act(() => page.click('btn-lobby-fs'));
      eq(page.text('btn-lobby-fs'), 'EXIT FULL SCREEN', 'the lobby fullscreen button toggles fullscreen');

      log = await page.act(() => net.onStart({ players: net.lobbyPlayers, cheats: {} }));
      const match = page.game();
      ok(match.mode === 'host' && match.opts.net === net && match.opts.cheats.god === true, "the lobby's start builds a host game on the host's own codes");
      ok(log.includes('audio.setVolume("master", 0.15)') && page.text('toast').startsWith('Game started — master volume lowered to 15%'), 'a co-op start lowers the master volume, and says so');
      await page.act(() => net.onStart({ players: [], cheats: {} }));
      eq(page.games.length, 1, 'a second start while the match runs is ignored');
      await page.act(() => page.key('Escape'));
      ok(page.shown('pause') && page.text('btn-quit') === 'END GAME TO LOBBY' && page.shown('btn-pause-mic'), 'the host pause menu offers END GAME TO LOBBY and the mic');
      await page.act(() => page.click('btn-pause-mic'));
      ok(match.micMuted && page.text('btn-pause-mic') === 'MIC: OFF', 'the pause menu mic button mutes you');
      log = await page.act(() => { page.flags.endMatch = true; page.click('btn-quit'); });
      ok(log.includes('game.endMatchToLobby()') && !log.includes('game.dispose()'), 'END GAME TO LOBBY hands the match to the game to end');
      log = await page.act(() => match.opts.onExit('lobby', 'The host ended the match.'));
      ok(page.shown('lobby') && log.includes('game.dispose()') && log.includes('net.resetLobbyReady()') && !log.includes('net.leave()'),
        'the return to the lobby keeps the room and resets who is ready');
      ok(page.text('toast') === 'The host ended the match.' && log.some((l) => l.startsWith('audio.loopFile("menu_music"')) && log.includes('audio.setVolume("master", 0.8)'),
        'with the message, the menu music, and the master volume back');
      await page.act(() => net.onStart({ players: net.lobbyPlayers, cheats: {} }));
      log = await page.act(() => page.game().opts.onExit('menu'));
      ok(page.shown('menu') && log.includes('net.leave()') && log.includes('game.dispose()'), 'a match that exits to the menu leaves the room');
      eq(await page.act(() => net.onLobby()), [], "a late update from the room you left changes nothing");
      await page.act(async () => { page.click('btn-host'); await page.flush(); page.net().onClosed('Host closed the lobby.'); });
      ok(page.shown('menu') && page.text('toast') === 'Host closed the lobby.', 'a closed connection returns to the menu and says why');
      await page.act(async () => { page.click('btn-host'); await page.flush(); page.net().onClosed(); });
      eq(page.text('toast'), 'Connection lost.', 'or says Connection lost.');
    },
  },

  guest: {
    page: {},
    async run(page, { ok, eq }) {
      const host = (o) => soldier({ id: 'h', name: 'Host', host: true, persona: 'takeo', ready: true, ...o });
      const me = (o) => soldier({ id: 'g', name: 'Soldier', color: 1, persona: 'dempsey', ...o });
      await page.act(() => page.loadAssets());
      let log = await page.act(() => { page.click('btn-join'); page.el('join-code').value = 'wxyz9'; page.click('btn-join-go'); });
      const net = page.net();
      ok(page.shown('lobby') && log.includes('net.disableVoice()') && !log.includes('net.enableVoice()'), 'a guest joins without a microphone prompt until the host allows voice');
      ok(page.el('btn-lobby-mic').disabled && page.text('btn-lobby-mic') === 'VOICE: OFF', 'and the mic button is off');
      await page.act(() => { net.lobbyCheats = { god: true, startRound: 5, loadout: { p1: 'mp40' } }; page.lobby([host(), me()]); });
      eq(page.text('btn-lobby-cheats'), 'VIEW CHEAT CODES', 'a guest can only view the cheat codes');
      await page.act(() => page.click('btn-lobby-cheats'));
      ok(page.el('cheat-god').checked && page.el('cheat-god').disabled && page.el('cheats-panel').classList.contains('read-only') && page.text('cheats-note').startsWith('VIEW ONLY'),
        "the cheat screen shows the host's codes, read-only");
      log = await page.act(() => {
        page.tick('cheat-god', false);
        page.type('cheat-round', '9', 'change');
        page.click('btn-titan');
        page.click('btn-cheats-all');
        page.click(page.weapons(0)[0]);
      });
      ok(page.el('cheat-god').checked && page.el('cheat-round').value === 5 && page.stored('der-riese-cheats') === null && !log.some((l) => l.startsWith('net.setLobbyCheats(')),
        "no control changes a guest's view or the codes");
      await page.act(() => { net.lobbyCheats = { god: false }; page.lobby(null); });
      ok(!page.el('cheat-god').checked, "the host's changes show while the screen is open");
      await page.act(() => page.click('btn-cheats-back'));
      ok(page.shown('lobby'), "the cheat screen's BACK returns a guest to the lobby");

      await page.act(() => page.click('btn-lobby-mic'));
      eq(page.text('toast'), 'Voice chat is disabled by the host.', 'the mic button says the host has voice off');
      await page.act(() => { page.flags.voiceDenied = true; page.lobby(null, { lobbyVoiceEnabled: true }); });
      eq(page.text('btn-lobby-mic'), 'MIC: BLOCKED', 'when the host turns voice on, a refused microphone shows as blocked');
      await page.act(() => { page.flags.voiceDenied = false; page.click('btn-lobby-mic'); });
      ok(net.myStream && page.text('btn-lobby-mic') === 'MIC: ON', 'clicking it asks again');
      await page.act(() => page.click('btn-lobby-mic'));
      ok(net.micMuted && page.text('btn-lobby-mic') === 'MIC: MUTED', 'and then mutes you');

      await page.act(() => page.click('btn-ready'));
      log = await page.act(async () => { page.lobby([host(), me({ ready: true })]); await page.advance(11000); });
      ok(!log.some((l) => l.startsWith('net.startGame(')), "a guest's countdown never starts the match itself");
      await page.act(() => net.onStart({ players: net.lobbyPlayers, cheats: { god: true, loadout: { p1: 'ppsh' } } }));
      const match = page.game();
      ok(match.mode === 'client' && match.opts.cheats.loadout.p1 === 'ppsh', "a guest's match runs on the host's codes");
      await page.act(() => page.key('Escape'));
      ok(page.text('btn-quit') === 'LEAVE GAME' && page.shown('btn-pause-mic'), 'the guest pause menu offers LEAVE GAME and the mic');
      log = await page.act(() => page.click('btn-quit'));
      ok(page.shown('menu') && log.includes('net.leave()'), 'LEAVE GAME leaves the room');
    },
  },

  'saved-settings': {
    page: { storage: { dr_options_v1: '{"brightness":0.5,"settingsSchema":2,"fov":90,"master":0.3}', 'der-riese-cheats': '7', 'der-riese-persona': 'bogus' } },
    async run(page, { ok, eq }) {
      const saved = JSON.parse(page.stored('dr_options_v1'));
      eq([saved.brightness, saved.brightnessCalibration, saved.fov, page.el('opt-master').value], [1, 2, 90, 0.3],
        'brightness saved before calibration 2 resets to 100%, and the other settings stay');
      eq(page.text('lobby-char-name'), 'TANK DEMPSEY', 'an unknown saved marine falls back to Dempsey');
      await page.act(() => { page.click('btn-cheats'); page.tick('cheat-god', true); page.click('btn-cheats-back'); });
      eq(JSON.parse(page.stored('der-riese-cheats')), { god: true }, 'cheat codes saved as a bare number start empty, and save normally');
    },
  },

  'v1-settings': {
    page: { storage: { dr_options_v1: '{"settingsSchema":1,"fov":70,"quality":"low"}', 'der-riese-cheats': '{"loadout":{"p1":"kar98"},"startRound":5}', 'der-riese-persona': 'takeo' } },
    async run(page, { ok, eq }) {
      const saved = JSON.parse(page.stored('dr_options_v1'));
      eq([saved.settingsSchema, saved.fov, saved.quality], [2, 110, 'high'], 'settings saved by v1 are replaced with the defaults');
      eq(page.text('lobby-char-name'), 'TAKEO MASAKI', 'the saved marine is chosen');
      await page.act(() => page.loadAssets());
      await page.act(async () => { page.click('btn-solo'); await page.flush(); page.click('btn-solo-fs-start'); });
      eq([page.game().opts.cheats.loadout.p1, page.game().opts.cheats.startRound], ['kar98', 5], 'saved cheat codes carry into a match');
    },
  },

  'failed-start': {
    page: { search: '?debug=1' },
    async run(page, { ok, eq }) {
      await page.act(() => page.loadAssets());
      let log = await page.act(async () => { page.flags.failInit = true; page.click('btn-solo'); await page.flush(); page.click('btn-solo-fs-start'); });
      ok(log.includes('console.error("startGame failed", Error("WebGL is unavailable"))'), 'a start that throws is logged');
      ok(page.shown('menu') && !page.shown('loading') && !page.shown('hud') && log.includes('game.dispose()') && !page.input.locked,
        'the half-built game is disposed, and the player is back in the menu');
      ok(page.text('toast') === 'Failed to start: WebGL is unavailable' && log.some((l) => l.startsWith('audio.loopFile("menu_music"')), 'with the reason and the menu music');
      ok(globalThis.__bootlog.at(-1).startsWith('ERROR: Error: WebGL is unavailable'), "the debug boot log keeps the error");
      log = await page.act(async () => {
        page.click('btn-host');
        await page.flush();
        page.lobby([soldier({ id: 'h', name: 'Soldier', host: true, ready: true })]);
        page.net().onStart({ players: page.net().lobbyPlayers, cheats: {} });
      });
      ok(page.shown('lobby') && log.includes('#toast.textContent = "Failed to start: WebGL is unavailable"'), 'a co-op start that fails returns to the lobby');
    },
  },

  invite: {
    page: { search: '?join=abc12&from=Bob%01' },
    async run(page, { ok, eq }) {
      ok(page.shown('join-modal') && page.el('join-code').value === 'ABC12', 'an invite link opens the join modal with its code');
      eq(page.text('toast'), 'Bob invited you — press JOIN to drop in!', 'and names the inviter, without control characters');
      await page.act(() => page.loadAssets());
      const log = await page.act(() => page.click('btn-join-go'));
      ok(page.shown('lobby') && log.some((l) => l.startsWith('net.join("ABC12", ')), 'JOIN joins that lobby');
    },
  },

  'invite-without-name': {
    page: { search: '?join=QQQQ' },
    async run(page, { ok, eq }) {
      eq(page.text('toast'), 'Lobby invite detected — press JOIN to drop in!', 'an invite without a name still says what it is');
      await page.act(() => page.advance(4000));
      ok(!page.shown('toast'), 'and the toast hides');
    },
  },
};

const scenarioName = process.argv[2];
if (scenarioName) await runScenario(scenarioName);
else await runEveryScenario();

async function runEveryScenario() {
  const results = await Promise.all(Object.keys(SCENARIOS).map((name) => new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ name, code, out, err }));
  })));
  const failures = results.filter((r) => r.code !== 0 || !r.out.includes(RESULT));
  assert.equal(failures.length, 0, `page scenarios failed:\n  ${failures.map((r) => `${r.name}:\n    ${r.err.split('\n')
    .filter((l) => l.trim() && !/MODULE_TYPELESS|Reparsing as ES module|"type": "module"|trace-warnings/.test(l)).slice(0, 40).join('\n    ')}`).join('\n  ')}`);
  let actions = 0;
  let checks = 0;
  for (const r of results) {
    const result = JSON.parse(r.out.split('\n').find((l) => l.startsWith(RESULT)).slice(RESULT.length));
    actions += result.actions;
    checks += result.checks;
  }
  console.log(`Main page OK: ${results.length} scenarios boot js/main.js and take ${actions} actions through the menu, the options, `
    + `the characters, the cheat codes, solo and co-op matches, the lobby as host and guest, saved settings, a failed start and invites; `
    + `${checks} checks pass, and nothing throws.`);
}

async function runScenario(name) {
  const { startPage } = await import('./lib/headless-page.mjs');
  const scenario = SCENARIOS[name];
  assert.ok(scenario, `no scenario named ${name}`);
  const page = await startPage(scenario.page);
  let checks = 0;
  const ok = (value, message) => { checks++; assert.ok(value, message); };
  const eq = (actual, expected, message) => { checks++; assert.deepEqual(actual, expected, message); };
  try {
    await scenario.run(page, { ok, eq });
    eq(page.errors(), [], 'no handler, timer or promise may throw');
  } catch (e) {
    process.stderr.write(`${e.message}\nthe page's last log lines:\n  ${page.lines.slice(-30).join('\n  ')}\n`);
    process.exit(1);
  }
  console.log(`${RESULT}${JSON.stringify({ actions: page.actions, checks })}`);
  process.exit(0);
}
