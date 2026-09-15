// Game's source text, for the validators that pin it with regexes.
//
// Game is js/game.js plus the per-domain files in js/game/, whose methods
// game.js copies onto Game.prototype. A check reads all of it as one string, so
// it keeps passing when the method it pins moves between those files.
import { readFileSync, readdirSync } from 'node:fs';

const js = new URL('../../js/', import.meta.url);

/** js/game.js, then js/game/*.js in name order, joined with newlines. */
export function readGameSource() {
  const parts = readdirSync(new URL('game/', js)).filter((name) => name.endsWith('.js')).sort();
  return [
    readFileSync(new URL('game.js', js), 'utf8'),
    ...parts.map((name) => readFileSync(new URL(`game/${name}`, js), 'utf8')),
  ].join('\n');
}
