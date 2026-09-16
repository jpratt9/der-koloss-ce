import { readFileSync } from 'node:fs';

// Keep setup and frame execution visible to source-based invariant checks.
export function readPostFXSource() {
  return [
    '../../js/render/PostFX.js',
    '../../js/render/PostFX/render.js',
  ].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
}
