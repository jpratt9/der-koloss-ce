// Load the shipped zombie models in Node: skin and skeleton only.
//
// Shared by the validators that pose the real corpses —
// validate-zombie-hitboxes.mjs (a bullet hits what is drawn) and
// validate-zombie-detail.mjs (the detail sits on what is drawn). The colour
// atlas cannot move a vertex, and decoding it needs a browser, so it is
// stripped before GLTFLoader sees the file.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGameModule, repoRoot } from './headless-three.mjs';

const { GLTFLoader } = await import(pathToFileURL(join(repoRoot, 'vendor/loaders/GLTFLoader.js')).href);

async function loadZombieModel(file) {
  const json = JSON.parse(await readFile(join(repoRoot, 'assets/models/zombies', file), 'utf8'));
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) delete m.pbrMetallicRoughness?.baseColorTexture;
  return new Promise((resolve, reject) => new GLTFLoader().parse(JSON.stringify(json), '', resolve, reject));
}

/** Load both zombie models into assets.models, where the game looks for them. */
export async function loadZombieModels() {
  const { assets } = await loadGameModule('assets.js');
  assets.models.zombie1 = await loadZombieModel('Zombie_Basic.gltf');
  assets.models.zombie2 = await loadZombieModel('Zombie_Chubby.gltf');
  return assets;
}
