// Cinematic director: the third-person weapon a soldier carries, and the arm IK
// that keeps both hands on its grips.
import * as THREE from 'three';
import {buildViewmodel,WeaponRig} from '../weapons.js';
import {worldPoint} from './math.js';
import {findArmChain,solveArmIK} from './pose.js';

function bindDirectorWeapon(actor,rig){
  rig.primaryChain=findArmChain(actor,'R');rig.supportChain=findArmChain(actor,'L');
  rig.primaryBone=rig.primaryChain?.hand||null;rig.supportBone=rig.supportChain?.hand||null;
  actor.armChains={right:rig.primaryChain,left:rig.supportChain};
  rig.primaryGripFixed=rig.primaryGrip.position.clone();
  rig.supportGripFixed=rig.supportGrip.position.clone();
}

function updateDirectorWeaponBinding(actor,rig,fire=false){
  // The weapon has one authored shoulder-ready transform in actor space. Grip
  // locators remain fixed children of the rendered gun; both real arm chains
  // are driven toward those sockets. Never move the gun or its locators to the
  // current hands, which would make the grip validator self-fulfilling.
  for(const [side,rest] of Object.entries(actor.directorArmRest||{})){
    const chain=actor.armChains?.[side];if(chain){chain.upper.quaternion.copy(rest.upper);chain.lower.quaternion.copy(rest.lower);if(chain.root&&rest.root)chain.root.quaternion.copy(rest.root);}
  }
  actor.group.updateMatrixWorld(true);
  rig.anchor.position.copy(rig.mountPosition);
  rig.anchor.quaternion.copy(rig.mountQuaternion);
  rig.gun.position.z=fire?-.035:0;
  rig.gun.rotation.x=fire?-.055:0;
  actor.group.updateMatrixWorld(true);
  const primaryTarget=new THREE.Vector3(),supportTarget=new THREE.Vector3();
  rig.primaryGrip.getWorldPosition(primaryTarget);rig.supportGrip.getWorldPosition(supportTarget);
  rig.primaryPreError=worldPoint(rig.primaryBone).distanceTo(primaryTarget);rig.supportPreError=worldPoint(rig.supportBone).distanceTo(supportTarget);
  rig.primaryError=solveArmIK(actor,rig.primaryChain,primaryTarget,{iterations:64,strength:.98});
  rig.supportError=solveArmIK(actor,rig.supportChain,supportTarget,{iterations:64,strength:.98});
  actor.group.updateMatrixWorld(true);
}

function makeDirectorWeapon(actor,id,pap=false,diamond=false){
  const anchor=new THREE.Group();
  // The shipped remote-player model has no usable hand bone in this zombie-rig
  // animation set.  Build a deterministic third-person silhouette from the same
  // weapon IDs, while reserving the full shipped first-person models for hero
  // inserts (armory and PaP). This keeps wide-shot blocking readable and stable.
  const weaponColor=diamond?0xd9f6ff:(pap?0x533a78:(id==='raygun'?0x512c24:id==='dg2'?0x284653:0x20242b));
  const mat=new THREE.MeshStandardMaterial({color:weaponColor,emissive:diamond?0x8bd9ff:(pap?0x251338:(id==='raygun'?0x32110b:0x10151c)),emissiveIntensity:diamond?1.35:(pap?.42:.26),metalness:diamond?.92:.72,roughness:diamond?.12:.38});
  const gun=new THREE.Group(),fallback=new THREE.Group();gun.add(fallback);
  const pistol=id==='m1911'||id==='raygun',long=id==='kar98'||id==='trench'||id==='mg42'||id==='dg2';
  const receiver=new THREE.Mesh(new THREE.BoxGeometry(pistol?.16:.18,pistol?.13:.16,pistol?.34:(long?.72:.56)),mat);receiver.position.z=pistol?.16:(long?.34:.27);fallback.add(receiver);
  const barrelLen=pistol?.25:(long?.68:.48);const barrel=new THREE.Mesh(new THREE.CylinderGeometry(pistol?.025:.032,pistol?.032:.038,barrelLen,10),mat);barrel.rotation.x=Math.PI/2;barrel.position.z=(pistol?.34:(long?.72:.58))+barrelLen*.48;fallback.add(barrel);
  if(!pistol){const stock=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.34),mat);stock.position.set(0,-.02,-.22);stock.rotation.x=-.12;fallback.add(stock);}
  if(id==='ppsh'||id==='mg42'){const drum=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.10,16),mat);drum.rotation.z=Math.PI/2;drum.position.set(0,-.17,.15);fallback.add(drum);}
  if(id==='raygun'){const orb=new THREE.Mesh(new THREE.SphereGeometry(.11,12,8),mat);orb.position.z=.36;fallback.add(orb);}
  if(id==='dg2'){for(const x of [-.075,.075]){const coil=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.55,10),mat);coil.rotation.x=Math.PI/2;coil.position.set(x,.06,.56);fallback.add(coil);}}
  try{
    let detailed;
    if(pap||diamond){const staging=new THREE.Group(),rig=new WeaponRig(staging);rig.diamondNext=diamond;rig.equip(id,true);detailed=rig.current.group;rig.root.remove(detailed);}else detailed=buildViewmodel(id,false);
    detailed.position.set(0,0,0);detailed.rotation.set(0,0,0);detailed.scale.set(1,1,1);detailed.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(detailed),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z),targetLength=pistol?.88:(long?1.92:1.48);
    if(Number.isFinite(span)&&span>.001){detailed.position.copy(center).multiplyScalar(-1);const actual=new THREE.Group();actual.add(detailed);actual.scale.setScalar(targetLength/span);actual.rotation.y=Math.PI;gun.add(actual);}
  }catch(error){console.warn(`Director weapon fallback for ${id}`,error);}
  gun.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
  // The mesh remains a shipped-weapon silhouette, but its root is now a real
  // animated wrist socket instead of a rigid actor-root prop.
  anchor.position.set(0,1.05,.15);anchor.rotation.set(.08,0,0);anchor.add(gun);actor.group.add(anchor);
  actor.group.updateMatrixWorld(true);
  const weaponMount=actor.bones?.Torso||actor.group;
  if(weaponMount!==actor.group)weaponMount.attach(anchor);
  const flash=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),new THREE.MeshBasicMaterial({color:id==='dg2'?0x9ee8ff:(pap?0xa8dfff:0xffc06b),transparent:true,opacity:.94}));
  flash.position.set(0,0,(pistol?.34:(long?.72:.58))+barrelLen);
  flash.scale.set(.55,.55,2.6);flash.visible=false;gun.add(flash);
  const primaryGrip=new THREE.Object3D(),supportGrip=new THREE.Object3D(),muzzleLocator=new THREE.Object3D();primaryGrip.name='PrimaryGripLocator';supportGrip.name='SupportGripLocator';muzzleLocator.name='MuzzleLocator';
  // Persona 1's shipped skeleton has a shorter forearm and lower shoulder.
  // Author a second pair of immutable weapon-space sockets for that actual
  // morphology; the sockets are still fixed to the gun and never follow hands.
  const shortArms=actor.directorVariant===1;
  const vegaShoulder=actor.directorVariant===3;
  primaryGrip.position.set(shortArms?-.143:-.13,shortArms?-.07:-.025,pistol?(shortArms?-.09:.005):.0);
  // Vega's real left shoulder/palm chain is a few centimetres shorter on the
  // pistol-ready pose.  Keep a fixed, persona-authored socket on the gun (not a
  // hand-following locator) so the rendered palm stays in physical contact at
  // the locomotion extremes instead of hovering on four cadence frames.
  supportGrip.position.set(shortArms?.16:.13,shortArms?-.04:(vegaShoulder?-.04:.005),pistol?(shortArms?-.115:-.05):.30);
  muzzleLocator.position.copy(flash.position);gun.add(primaryGrip,supportGrip,muzzleLocator);
  const rig={anchor,gun,flash,muzzle:flash,muzzleLocator,primaryGrip,supportGrip,pap,pistol,weaponMeshes:[],mountPosition:anchor.position.clone(),mountQuaternion:anchor.quaternion.clone()};gun.traverse(o=>{if(o.isMesh&&o!==flash)rig.weaponMeshes.push(o);});bindDirectorWeapon(actor,rig);return rig;
}

function attachDirectorWeapon(actor,id,pap=false,diamond=false){
  actor.directorWeapon=makeDirectorWeapon(actor,id,pap,diamond);
}

export {updateDirectorWeaponBinding,makeDirectorWeapon,attachDirectorWeapon};
