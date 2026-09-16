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
// script is js/main.js plus the modules in js/main/ that it imports. The co-op
// connection is js/net.js plus js/net/: the classes whose methods net.js copies
// onto Net.prototype, and the names they share. The effects are js/fx.js plus
// js/fx/: the classes whose methods fx.js copies onto FX.prototype, and the
// surface table and sprite textures they share. The post stack's GLSL is
// js/render/shaders.js plus the modules in js/render/shaders/ that it
// re-exports. The prop surfaces are js/props/materials.js plus the modules in
// js/props/materials/: the kit its generators draw through, the material map
// generators and the overlay textures. The soldiers' gear is
// js/render/SoldierGear.js plus the modules
// in js/render/SoldierGear/: the constants, palettes, materials and primitive
// kit its wardrobe is built from. The stylesheet is style.css plus the files in
// style/, which index.html links in name order. A check reads all of one as a single string,
// so it keeps passing when the text it pins moves between files.
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

/** js/net.js, then every .js file under js/net/ in path order, joined with newlines. */
export function readNetSource() {
  return readSplitSource(js, 'net', '.js');
}

/** js/fx.js, then every .js file under js/fx/ in path order, joined with newlines. */
export function readFxSource() {
  return readSplitSource(js, 'fx', '.js');
}

/** js/render/shaders.js, then every .js file under js/render/shaders/ in path order, joined with newlines. */
export function readShadersSource() {
  return readSplitSource(new URL('render/', js), 'shaders', '.js');
}

/** js/props/materials.js, then every .js file under js/props/materials/ in path order, joined with newlines. */
export function readPropMaterialsSource() {
  return readSplitSource(new URL('props/', js), 'materials', '.js');
}

/** js/render/SoldierGear.js, then every .js file under js/render/SoldierGear/ in path order, joined with newlines. */
export function readSoldierGearSource() {
  return readSplitSource(new URL('render/', js), 'SoldierGear', '.js');
}

/** style.css, then style/*.css in name order — the order index.html links them, which is the cascade order. */
export function readStyleSource() {
  return readSplitSource(root, 'style', '.css');
}

/** Asset Archive entry and its responsibility modules. */
export function readAssetsPageSource() {
  return readSplitSource(js, 'assets-page', '.js');
}
