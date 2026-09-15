// The same slab test bullets use. This module kept its own copy, and the copy
// allocated three arrays per collider per call — see collision.js. Prompts
// call this every frame for every nearby interactable and barrier.
import { segmentHitsBox } from './collision.js';

export function interactionLineClear(origin, target, colliders, endpointTolerance = 0.9) {
  if (!origin || !target || !Array.isArray(colliders)) return false;
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)
      || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return false;
  for (const collider of colliders) {
    if (collider.noRaycast) continue;
    const cx = (collider.minX + collider.maxX) / 2;
    const cz = (collider.minZ + collider.maxZ) / 2;
    // A usable machine's own body is expected at the endpoint. Structural
    // walls are never ignored, even when a box or perk sits close behind one.
    if (collider.prop && Math.hypot(cx - target.x, cz - target.z) < 1.35) continue;
    const t = segmentHitsBox(origin.x, origin.z, target.x, target.z, collider);
    if (t < 0 || t >= endpointTolerance) continue;
    const yAt = origin.y + (target.y - origin.y) * t;
    const y0 = collider.y0 || 0;
    if (yAt >= y0 && yAt <= y0 + (collider.h || 3)) return false;
  }
  return true;
}
