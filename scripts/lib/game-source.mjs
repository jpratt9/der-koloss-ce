// Source text of the split modules and of the stylesheet, for the validators
// that pin them with regexes.
//
// Game is js/game.js plus the per-domain files in js/game/, whose methods
// game.js copies onto Game.prototype. The weapons are js/weapons.js plus the
// modules in js/weapons/ that it re-exports, and the zombies are js/zombies.js
// plus js/zombies/ in the same way, as the player is js/player.js plus
// js/player/. The map is js/map.js plus the section builders in js/map/ that
// its buildMap() calls. The audio engine is js/audio.js plus js/audio/, whose
// engine-*.js methods audio.js copies onto AudioEngine.prototype. The page
// script is js/main.js plus the modules in js/main/ that it imports. The post
// stack's GLSL is js/render/shaders.js plus the modules in js/render/shaders/
// that it re-exports. The stylesheet is style.css plus the files in style/,
// which index.html links in name order. A check reads all of one as a single
// string, so it keeps passing when the text it pins moves between files.
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const js = new URL('js/', root);

/** <base><name><ext>, then every <ext> file under <base><name>/ in path order, joined with newlines. */
function readSplitSource(base, name, ext) {
  const parts = readdirSync(new URL(`${name}/`, base), { recursive: true })
    .filter((path) => path.endsWith(ext)).sort();
  return [
    readFileSync(new URL(`${name}${ext}`, base), 'utf8'),
    ...parts.map((path) => readFileSync(new URL(`${name}/${path}`, base), 'utf8')),
  ].join('\n');
}

/** js/game.js, then js/game/*.js in name order, joined with newlines. */
export function readGameSource() {
  return readSplitSource(js, 'game', '.js');
}

/** js/weapons.js, then every .js file under js/weapons/ in path order, joined with newlines. */
export function readWeaponsSource() {
  return readSplitSource(js, 'weapons', '.js');
}

/** js/zombies.js, then every .js file under js/zombies/ in path order, joined with newlines. */
export function readZombiesSource() {
  return readSplitSource(js, 'zombies', '.js');
}

/** js/player.js, then every .js file under js/player/ in path order, joined with newlines. */
export function readPlayerSource() {
  return readSplitSource(js, 'player', '.js');
}

/** js/map.js, then every .js file under js/map/ in path order, joined with newlines. */
export function readMapSource() {
  return readSplitSource(js, 'map', '.js');
}

/** js/audio.js, then every .js file under js/audio/ in path order, joined with newlines. */
export function readAudioSource() {
  return readSplitSource(js, 'audio', '.js');
}

/** js/main.js, then every .js file under js/main/ in path order, joined with newlines. */
export function readMainSource() {
  return readSplitSource(js, 'main', '.js');
}

/** js/render/shaders.js, then every .js file under js/render/shaders/ in path order, joined with newlines. */
export function readShadersSource() {
  return readSplitSource(new URL('render/', js), 'shaders', '.js');
}

/** style.css, then style/*.css in name order — the order index.html links them, which is the cascade order. */
export function readStyleSource() {
  return readSplitSource(root, 'style', '.css');
}
