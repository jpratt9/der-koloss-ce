// Materials — one set per persona, shared by every avatar wearing that persona.
import * as THREE from 'three';

const _matSets = new Map();
export function materials(look) {
  let set = _matSets.get(look.id);
  if (set) return set;
  const std = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  set = {
    cloth: std(look.cloth, 0.95),
    clothDark: std(look.clothDark, 0.93),
    webbing: std(look.webbing, 0.9),
    leather: std(look.leather, 0.62),
    hard: std(look.hard, 0.45, 0.55),
    accent: std(look.accent, 0.6, 0.25),
    hair: std(look.hair, 0.94),
  };
  _matSets.set(look.id, set);
  return set;
}
