// The map's interactables: wall-buys, perk machines, the power switch, the
// teleporters and the mainframe pad, Pack-a-Punch, the mystery box, traps, the
// gramophone and the radio.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { buildPerkMachine } from '../props/perkMachine.js';
import { buildMysteryBox } from '../props/mysteryBox.js';
import { buildPackAPunch, buildPapSignFrame } from '../props/packAPunch.js';
import { signTexture as papSignTexture } from '../props/materials.js';
import { buildTeleporter } from '../props/teleporter.js';
import { buildPowerSwitch } from '../props/powerSwitch.js';
import { buildWallBuy } from '../props/wallbuy.js';
import { WEAPONS } from '../weapons.js';
import { MAP_WALLBUYS, MAP_PERKS, MAP_TELEPORTERS, PAP_ENERGY_VISUAL, INITIAL_MYSTERY_BOX } from '../map-layout.js';

export function buildInteractables({ opts, group, colliders, interact, matMetal, matWood }) {
  // ---------- wall buys (authentic placements & prices) ----------
  const wallbuys = [];
  function wallbuy(x, y, z, nx, nz, weapon, price) {
    // Chalked straight onto the brick, on a lit surface (js/props/wallbuy.js) —
    // it takes the sodium light and dies with the power instead of floating.
    // Label from the weapon's REAL display name, not its internal id. The id is
    // an abbreviation ("kar98", "trench", "dbshotgun") and uppercasing it chalked
    // "KAR98" on the wall for a Kar98k, and "TRENCH" for an M1897 Trench Gun.
    const m = buildWallBuy(weapon, price, (WEAPONS[weapon]?.name || weapon).toUpperCase());
    m.position.set(x + nx * 0.05, y + 1.55, z + nz * 0.05);
    m.lookAt(x + nx * 3, y + 1.55, z + nz * 3);
    group.add(m);
    const wb = { id: 'wb_' + weapon, weapon, price, pos: { x, y: y + 1.4, z } };
    wallbuys.push(wb);
    interact.push({ id: wb.id, kind: 'wallbuy', pos: wb.pos, radius: 2.2, wb });
  }
  for (const wb of MAP_WALLBUYS) wallbuy(wb.x, wb.y || 0, wb.z, wb.nx, wb.nz, wb.weapon, wb.price);

  // ---------- perk machines ----------
  // Period enamelled-steel dispensers (js/props/perkMachine.js): chipped paint,
  // a backlit marquee, real bottles behind a dirty pane, coin mech and tray.
  const perks = [];
  const perkDefs = MAP_PERKS;
  for (const pd of perkDefs) {
    // Solo Quick Revive is charged at 500 (game.js), so the cabinet has to say
    // 500 too — otherwise the marquee argues with the prompt in front of it.
    const displayPrice = (pd.id === 'qr' && opts.mode === 'solo') ? 500 : pd.price;
    const machine = buildPerkMachine(pd, { displayPrice });
    const g = machine.group;
    const lamp = machine.lamp;
    g.position.set(pd.x, 0, pd.z);
    g.rotation.y = pd.ry;
    group.add(g);
    const perk = { ...pd, group: g, lamp, panel: machine.panel, machine, jingleId: 'jingle_' + pd.id };
    perks.push(perk);
    colliders.push({ minX: pd.x - 0.6, maxX: pd.x + 0.6, minZ: pd.z - 0.5, maxZ: pd.z + 0.5, y0: 0, h: 2.4, prop: true });
    interact.push({ id: 'perk_' + pd.id, kind: 'perk', pos: { x: pd.x, y: 1.2, z: pd.z }, radius: 2.2, perk });
  }

  // ---------- power switch (behind the courtyard generator) ----------
  // Open-blade knife switch on a slate panel (js/props/powerSwitch.js). The
  // blade assembly keeps the old lever's pivot, so the reach target and the
  // cinematic throw animation are unchanged.
  const powerProp = buildPowerSwitch();
  const powerGroup = powerProp.group;
  const lever = powerProp.lever;
  powerGroup.position.set(-4, 0, -27.6);
  group.add(powerGroup);
  const power = { pos: { x: -4, y: 1.4, z: -27.6 }, on: false, lever, group: powerGroup };
  interact.push({ id: 'power', kind: 'power', pos: power.pos, radius: 2.6, power });

  // ---------- teleporters ----------
  const teleporters = [];
  for (const td of MAP_TELEPORTERS) {
    // Electromagnetic apparatus (js/props/teleporter.js): bolted collar with
    // hazard striping, a grated deck, coil-wound I-beam columns and cabling.
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x3366aa, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.6 });
    const g = buildTeleporter(td, ringMat).group;
    g.position.set(td.x, td.y, td.z);
    group.add(g);
    const tele = {
      ...td, group: g, ringMat, linked: false, charging: false, cooldown: 0,
      pos: { x: td.x, y: td.y + 1, z: td.z },
    };
    teleporters.push(tele);
    interact.push({ id: td.id, kind: 'tele', pos: tele.pos, radius: 1.9, tele });
  }
  // Mainframe teleport destination. Keep only the unmistakable destination
  // pad: the former blocky green machine bank looked like an unexplained box
  // and needlessly occupied the spawn platform.
  const mf = new THREE.Group();
  const mfPad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 24), matMetal.clone());
  mfPad.position.set(0, 0.95, 17.5);
  mf.add(mfPad);
  group.add(mf);
  const mainframe = { x: 0, z: 17.5 };

  // ---------- pack-a-punch (at the mainframe, like the original) ----------
  const papG = new THREE.Group();
  // Cast-iron cabinet, riveted columns, brass gear, vacuum tubes and a caged
  // intake collar (js/props/packAPunch.js). The collar projects forward of the
  // face so the containment field lives inside a mouth behind bars.
  const papMachine = buildPackAPunch();
  const papBody = papMachine.group;
  // Containment haze filling the intake collar around the field. Its emissive
  // is the machine's state read-out, driven by the tick below.
  const papSlot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.22), new THREE.MeshStandardMaterial({
    color: 0x09060e, emissive: 0x6644aa, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  papSlot.position.set(0, 1.0, 0.5);
  // Lightweight dark-matter/electric field: low-poly meshes and static line
  // buffers animated in the existing map tick (no post-processing or shaders).
  const papEnergy = new THREE.Group();
  papEnergy.position.set(0, PAP_ENERGY_VISUAL.centerY, PAP_ENERGY_VISUAL.centerZ);
  const papCoreMat = new THREE.MeshStandardMaterial({ color: 0x07030d, emissive: 0x6e22aa, emissiveIntensity: 1.35, roughness: 0.18, metalness: 0.5 });
  const papCore = new THREE.Mesh(new THREE.SphereGeometry(PAP_ENERGY_VISUAL.coreRadius, 12, 8), papCoreMat);
  papCore.position.z = PAP_ENERGY_VISUAL.coreOffsetZ;
  papEnergy.add(papCore);
  const papRingMat = new THREE.MeshBasicMaterial({ color: 0xb76cff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PAP_ENERGY_VISUAL.ringRadii[i], PAP_ENERGY_VISUAL.ringTube, PAP_ENERGY_VISUAL.tubeSegments, PAP_ENERGY_VISUAL.ringSegments), papRingMat.clone());
    ring.rotation.set(i ? Math.PI / 2 : 0.35, i ? 0.4 : Math.PI / 2, 0);
    papEnergy.add(ring);
  }
  const papArcMat = new THREE.LineBasicMaterial({ color: 0x82c8ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let arc = 0; arc < PAP_ENERGY_VISUAL.arcCount; arc++) {
    const points = [];
    for (let i = 0; i < PAP_ENERGY_VISUAL.arcPoints; i++) {
      const t = i / (PAP_ENERGY_VISUAL.arcPoints - 1);
      points.push(new THREE.Vector3(
        -PAP_ENERGY_VISUAL.boltHalfWidth + t * PAP_ENERGY_VISUAL.boltHalfWidth * 2,
        Math.sin((t + arc * 0.17) * Math.PI * 3) * 0.04,
        PAP_ENERGY_VISUAL.boltDepth + (i % 2 ? 0.018 : -0.018) + arc * 0.006,
      ));
    }
    const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), papArcMat.clone());
    bolt.rotation.z = arc * Math.PI / PAP_ENERGY_VISUAL.arcCount;
    papEnergy.add(bolt);
  }
  // Enamel wall plate in a bracketed steel housing, not a floating decal.
  const papSignTex = papSignTexture('PACK-A-PUNCH');
  const papSignMat = new THREE.MeshStandardMaterial({
    map: papSignTex, emissiveMap: papSignTex, emissive: 0xffffff, emissiveIntensity: 0.42,
    color: 0x0d0c10, roughness: 0.46, metalness: 0.0,
  });
  const papSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), papSignMat);
  papSign.position.set(0, 2.1, 0.5);
  const papSignFrame = buildPapSignFrame(2.2, 0.4);
  papSignFrame.position.set(0, 2.1, 0.49);
  // Field spill out of the intake mouth. It sits inside the collar so the light
  // reads as coming from the containment, not from a lamp bolted to the front.
  const papLamp = new THREE.PointLight(0x8a5cff, 18, 5.5, 2);
  papLamp.position.set(0, 1.0, 0.62);
  papG.add(papBody, papSlot, papEnergy, papSign, papSignFrame, papLamp);
  papG.position.set(4, 0.9, 14.7);
  group.add(papG);
  colliders.push({ minX: 3.1, maxX: 4.9, minZ: 14.25, maxZ: 15.15, y0: 0.9, h: 1.7, prop: true });
  const pap = {
    pos: { x: 4, y: 2.1, z: 14.7 }, slot: papSlot,
    energy: papEnergy, coreMat: papCoreMat, lamp: papLamp, machine: papMachine,
    busy: false, processing: false, ready: false,
  };
  interact.push({ id: 'pap', kind: 'pap', pos: pap.pos, radius: 2.6, pap });

  // ---------- mystery box (initial spawn: courtyard, in front of the generator) ----------
  const boxLocations = [
    { ...INITIAL_MYSTERY_BOX },    // courtyard (initial)
    { x: 28, z: -8 },             // automobile garage, near the furnace
    { x: 20.5, z: -25, y: 2.9 },  // chemical testing
    { x: -19, z: -18.7 },         // animal lab, across from the trench gun
    { x: -10, z: -19, y: 2.9 },   // lab balcony
    { x: 11, z: -52, y: 3.1 },    // main factory, end of the catwalk
  ];
  // Banded shipping crate + volumetric beacon (js/props/mysteryBox.js). The lid
  // pivots on its real hinge line at the back top edge.
  const boxProp = buildMysteryBox();
  const boxG = boxProp.group;
  const boxLid = boxProp.lid;
  boxG.position.set(boxLocations[0].x, boxLocations[0].y || 0, boxLocations[0].z);
  group.add(boxG);
  // baseYaw is set from the room below, once roomAt/rooms exist (see boxYawAt).
  const box = { group: boxG, lid: boxLid, locations: boxLocations, locIdx: 0, baseYaw: 0, pos: { x: boxLocations[0].x, y: 0.9 + (boxLocations[0].y || 0), z: boxLocations[0].z }, state: 'idle', uses: 0, currentWeapon: null, spinT: 0, takeT: 0 };
  interact.push({ id: 'box', kind: 'box', pos: box.pos, radius: 2.2, box });
  colliders.push({
    minX: boxLocations[0].x - 0.75, maxX: boxLocations[0].x + 0.75,
    minZ: boxLocations[0].z - 0.45, maxZ: boxLocations[0].z + 0.45,
    y0: boxLocations[0].y || 0, h: 0.9, prop: true, boxCollider: true,
  });

  // ---------- traps (electro-shock defenses at the debris chokepoints) ----------
  const traps = [];
  for (const [tx, tz, px] of [[-14, -12, -12.6], [14, -12, 15.4]]) {
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), matMetal.clone());
    post1.position.set(tx, 1.3, tz - 1.1);
    const post2 = post1.clone(); post2.position.z = tz + 1.1;
    group.add(post1, post2);
    const zone = { minX: tx - 1.4, maxX: tx + 1.4, minZ: tz - 1.2, maxZ: tz + 1.2 };
    const trap = { id: 'trap' + tx, zone, x: tx, z: tz, active: false, t: 0, cd: 0, panel: { x: px, y: 1.3, z: tz + 2.5 } };
    traps.push(trap);
    interact.push({ id: trap.id, kind: 'trap', pos: trap.panel, radius: 2.2, trap });
  }

  // ---------- gramophone switch (Beauty of Annihilation easter egg) ----------
  {
    const gg = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), matWood.clone());
    stand.position.y = 0.55;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.28, 0.45, 14), new THREE.MeshStandardMaterial({ color: 0xc8a038, metalness: 0.85, roughness: 0.3 }));
    horn.position.set(0, 1.35, 0); horn.rotation.x = -0.6;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.4 }));
    disc.position.y = 1.12;
    const glow = new THREE.PointLight(0xffb050, 7, 5, 1.8);
    glow.position.set(0, 1.5, 0.2);
    gg.add(stand, horn, disc, glow);
    gg.position.set(-6.5, 0, -41.2);
    group.add(gg);
    const songSwitch = { pos: { x: -6.5, y: 1.2, z: -41.2 }, glow, disc };
    interact.push({ id: 'song', kind: 'song', pos: songSwitch.pos, radius: 2.2, songSwitch });
    colliders.push({ minX: -6.8, maxX: -6.2, minZ: -41.5, maxZ: -40.9, y0: 0, h: 1.2, prop: true });
  }

  // ---------- radio (music easter egg) ----------
  const radioMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), matWood.clone());
  // Wall-mount it on a clear solid panel. It previously occupied the same
  // footprint as the stacked spawn crates at (8,24).
  radioMesh.position.set(-7.5, 1.05, 25.72);
  group.add(radioMesh);
  interact.push({ id: 'radio', kind: 'radio', pos: { x: -7.5, y: 1.1, z: 25.72 }, radius: 2.0 });
  return {
    wallbuys, perks, power, powerProp, teleporters, mainframe,
    pap, papMachine, papEnergy, papCore, papCoreMat, papSlot, box, boxG, boxProp, traps,
  };
}
