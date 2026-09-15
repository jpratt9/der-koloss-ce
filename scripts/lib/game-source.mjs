// Source text of the split modules, for the validators that pin it with regexes.
//
// Game is js/game.js plus the per-domain files in js/game/, whose methods
// game.js copies onto Game.prototype. The weapons are js/weapons.js plus the
// modules in js/weapons/ that it re-exports. A check reads all of one as a
// single string, so it keeps passing when the text it pins moves between files.
import { readFileSync, readdirSync } from 'node:fs';

const js = new URL('../../js/', import.meta.url);

/** js/<name>.js, then every .js file under js/<name>/ in path order, joined with newlines. */
function readSplitSource(name) {
  const parts = readdirSync(new URL(`${name}/`, js), { recursive: true })
    .filter((path) => path.endsWith('.js')).sort();
  return [
    readFileSync(new URL(`${name}.js`, js), 'utf8'),
    ...parts.map((path) => readFileSync(new URL(`${name}/${path}`, js), 'utf8')),
  ].join('\n');
}

/** js/game.js, then js/game/*.js in name order, joined with newlines. */
export function readGameSource() {
  return readSplitSource('game');
}

/** js/weapons.js, then every .js file under js/weapons/ in path order, joined with newlines. */
export function readWeaponsSource() {
  return readSplitSource('weapons');
}
