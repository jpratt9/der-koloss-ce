# Split plan: PostFX

2026-09-16. Planning only; no implementation authorized by this document.

## Current scan

```text
4 file(s) over 500 lines in /Users/john/dev/der-koloss-ce

FILE                   LINES  SPLIT INTO
-------------------  -------  ----------
js/render/PostFX.js      680           2
index.html               661           2
js/navmesh.js            625           2
js/hud.js                559           2

Total excess lines: 525
```

Source: `python3 /Users/john/.agents/skills/splitlargefiles/scripts/count_lines.py . --threshold 500`.
The split-count column is the scanner's estimate, not a recommendation to divide at arbitrary lines.

## Priority by risk and payoff

1. **PostFX.js:** largest offender, with a complete render-method seam. Move the frame pipeline intact; both resulting files comfortably fit under 500 lines. Detailed plan below.
2. **hud.js:** `drawMinimap` is a cohesive roughly 95-line canvas drawing method. Extracting it should leave the entry around 470 lines. Review its dependencies and validators before implementation.
3. **navmesh.js:** has distinct `ColliderHash`, `Heap`, grid construction, and pathfinding responsibilities. Extracting only the two helper classes would not remove the full 125-line excess. A complete plan needs to account for shared geometry constants and collision helpers, preserving the module's current dependency characteristics. Do that review separately rather than forcing a two-file split.
4. **index.html:** no clean static-include seam under the current build-free architecture. Its scripts are already external. Markup sections are identifiable, but fetching/injecting partials would change DOM readiness and failure behavior, and build-time partials would add a build requirement. Leave it intact until a separate architecture change is approved; do not compress markup to satisfy a line count.

## PostFX seams and destination files

The class separates configuration/resource lifetime from frame execution. Its render method is approximately 263 lines and already contains the entire ordered pipeline. Preserve that method as one unit rather than splitting tightly coupled ping-pong buffers across effects.

| Path | Contents | Estimated lines |
| --- | --- | ---: |
| `js/render/PostFX.js` | Existing imports, presets and constants; constructor; `_buildPasses`; quality and motion-blur controls; `setSize`; `_disposeTargets`; `blackTexture`; `dispose`; mixin installation | 415 |
| `js/render/PostFX/render.js` | `PostFXRender` class containing the unchanged `render(scene, camera, dt = 0.016, drawViewmodel = null)` method and its JSDoc/banner | 280 |
| `scripts/lib/postfx-source.mjs` | Source reader joining the entry and render module for the movement validator | 15–25 |
| `scripts/test-postfx-modules.mjs` | Focused module wiring and behavior checks described below | 150–250 |

Estimates include imports and wrappers. Recount the finished files; all new modules must remain at or below 500 lines.

Use the repository's existing `installMixins` utility once at module evaluation: `installMixins(PostFX, [PostFXRender])`. Keep the original render method body, signature, indentation and comments unchanged. This preserves `this`, prototype callers and shared render-target state without allocating a subsystem or callback every frame.

The original file continues exporting `PostFX` and `QUALITY_PRESETS` at their current paths. It retains all resource creation, disposal and configuration. No new public re-export is needed: the moved method remains available on `PostFX.prototype`.

## Imports and source consumers

- `js/render/PostFX.js`: add `installMixins` from `../utils.js` and `PostFXRender` from `./PostFX/render.js`. Retain all current imports: setup still uses Three.js, FullScreenPass, makeRT, SHADOW_EDGE_FADE and every shader export.
- `js/render/PostFX/render.js`: import `* as THREE` from `three` for the camera-position vector. The method needs no shader, preset or PostFX import; it accesses shared state through `this`.
- `scripts/lib/postfx-source.mjs`: import `readFileSync` from `node:fs`; use explicit URLs relative to `import.meta.url` to read the entry followed by the render module, joined with a newline. Export `readPostFXSource`.
- `scripts/validate-movement-feel.mjs`: import `readPostFXSource` from `./lib/postfx-source.mjs` and replace only its direct PostFX file read with that function. Keep the existing assertions unchanged. The assembled text must contain exactly one `uMaxRadius` writer and must retain the ordering of ambient occlusion before `drawViewmodel(src)`.
- `scripts/test-postfx-modules.mjs`: import Node assertion/source-reading utilities and use the repository's existing Three.js test-loading convention to load the real PostFX class. Do not introduce a package/build requirement just for this test.
- `scripts/validate-coplanar-surfaces.mjs`: no change. Its direct read checks the `uShadowEdgeFade` setup, which stays in the entry.
- `js/game/graphics.js`: no change to its `PostFX` import or calls.
- `scripts/test-shader-modules.mjs`: no functional change; it concerns the shader split rather than the frame method.
- `README.md` and `RENDERING.md`: their references to the public PostFX entry remain accurate.

Dependency direction: `PostFX.js → PostFX/render.js → three`, and `PostFX.js → utils.js → three`. Neither dependency imports PostFX, so this introduces no circular import. Do not import presets from the entry into the render module; the method already uses `this.preset`.

## Tests and preserved behavior

There is no dedicated PostFX test file to split. Existing movement and coplanar validators cover multiple concerns and remain whole; only the movement validator's source acquisition changes. Add the focused PostFX test alongside the extraction instead of moving unrelated assertions.

Check the installed prototype method and unchanged public exports. With a recording renderer/pass harness exercising the actual class methods, check the disabled fallback and enabled pipeline order, including the viewmodel between depth-consuming effects and bloom, plus continued rendering after a viewmodel callback throws. Verify resize retains the adapted-luminance pair and final disposal releases it. These protect meaningful frame and resource-lifetime behavior, not merely the new filenames.

Preserve without refactoring:

- AO, volume resolve, SSR, motion blur, DOF, viewmodel, bloom, exposure, composite and FXAA order.
- Shared HDR ping-pong targets, scene depth, renderer auto-clear restoration and final target reset.
- Camera-cut detection and previous-matrix updates.
- Tap-count/radius coupling, fractional pixel-ratio flooring, and adapted exposure surviving resize.
- Existing lazy allocations and pooled objects; introduce no additional per-frame allocations.

## Implementation sequence after approval

1. Move the complete render method and install its mixin; keep the original API and method body.
2. Add the source reader and update the movement validator in the same change, so existing guards still inspect the implementation.
3. Add the focused behavioral checks, then run every `scripts/*.mjs` using the repository's required loop. Rerun the line-count scan.
4. Browser-check a normal rendered scene across quality settings, fractional-resolution resize, motion blur settings, and a weapon swap. Confirm the weapon stays sharp and exposure remains continuous on resize. Automated source checks alone cannot establish visual equivalence.

This plan does not authorize deployment. Before any later production deployment, run every validator as required by AGENTS.md. The proposed split does not change spawning, rounds, models or asset loading; if implementation expands into those areas, normal-round and scheduled-dog-round browser verification also becomes mandatory.
