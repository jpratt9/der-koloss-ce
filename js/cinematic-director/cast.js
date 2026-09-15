// Cinematic director: the cast. Soldiers, zombies and the hound, and the props,
// tracers and arcs a shot adds around them.
import * as THREE from 'three';
import {SoldierVisual} from '../player.js';
import {ZombieVisual,createZombieModel} from '../zombies.js';
import {buildViewmodel,WeaponRig} from '../weapons.js';
import {v} from './math.js';
import {DirectorMover,actionAt} from './motion.js';
import {makeDirectorWeapon,attachDirectorWeapon} from './director-weapon.js';
import {requestedShot,requestedWeapon,shot,scene,camera,fill,rim,shotKey} from './stage.js';
import {map} from './world.js';

const actors=[];
const zombies=[];
let dog=null;
let displayWeapon=null;
let packMachineProp=null;
let boxSpinProp=null;
let machineArc=null;
let monkeyProp=null;
let chainArcs=null;
let dgOrder=[];
let trapArc=null;
let viewRig=null;
let powerPractical=null;
let powerReach=null;
const combatTracers=[];

function buildCast(){
  if(shot.cinematicPack){
    map.moveBox(Math.max(0,Math.min(map.box.locations.length-1,shot.boxLocation||0)));
    fill.intensity=.72;
    rim.intensity=3.8;
    shotKey.intensity=16;
    shotKey.color.setHex(shot.state.power?0x9dbbd7:0xb18a64);
    if(shot.machine==='papCycle'){
      packMachineProp=buildViewmodel('mp40',true);
      packMachineProp.scale.setScalar(1.34);
      packMachineProp.position.set(0,1.12,.78);
      packMachineProp.rotation.set(-.04,-.18,.02);
      packMachineProp.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
      map.pap.slot.parent.add(packMachineProp);
    }
    if(shot.machine==='boxSpin'){
      boxSpinProp=buildViewmodel('raygun',false);
      boxSpinProp.scale.setScalar(1.38);
      boxSpinProp.position.set(0,1.18,0);
      boxSpinProp.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
      map.box.group.add(boxSpinProp);
    }
    if(shot.machine==='trapWest'||shot.machine==='trapEast'){
      const x=shot.machine==='trapWest'?-14:14,z=-12;
      machineArc=new THREE.Group();
      const coreMat=new THREE.MeshBasicMaterial({color:0xe8fbff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
      const haloMat=new THREE.MeshBasicMaterial({color:0x6ed8ff,transparent:true,opacity:.34,blending:THREE.AdditiveBlending,depthWrite:false});
      for(let strand=0;strand<4;strand++){
        const points=[];
        for(let i=0;i<=14;i++){
          const q=i/14;
          points.push(v(x+.02*Math.sin(q*Math.PI*2+strand),.35+q*2.15+.16*Math.sin(q*Math.PI*5+strand),z-1.05+q*2.10));
        }
        const curve=new THREE.CatmullRomCurve3(points);
        machineArc.add(new THREE.Mesh(new THREE.TubeGeometry(curve,28,.014,5,false),coreMat.clone()));
        machineArc.add(new THREE.Mesh(new THREE.TubeGeometry(curve,28,.045,5,false),haloMat.clone()));
      }
      scene.add(machineArc);
    }
    return;
  }
  if(shot.armory){
    map.group.visible=false;
    scene.fog=null;
    scene.background=new THREE.Color(0x020306);
    fill.intensity=1.35;
    rim.intensity=7.5;
    shotKey.intensity=32;
    shotKey.color.setHex(0xc4dcff);
    displayWeapon=buildViewmodel(requestedWeapon,false);
    displayWeapon.scale.setScalar(1.48);
    displayWeapon.position.set(0,.04,0);
    displayWeapon.rotation.set(-.08,-.72,.02);
    displayWeapon.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
    scene.add(displayWeapon);
    return;
  }
  if(shot.povWeapon){viewRig=new WeaponRig(camera);viewRig.equip(shot.povWeapon,false);viewRig.applyGoldCamo(true);}
  if(shot.powerEvent){
    powerPractical=new THREE.PointLight(0x78bfff,0,13,1.45);powerPractical.position.set(-4.05,2.15,-27.15);scene.add(powerPractical);
    // Reach state is metadata only.  The visible limb is the shipped skinned
    // player arm, solved to the real map lever below; no detached primitives.
    powerReach={active:false,error:Infinity,target:new THREE.Vector3()};
  }
  for(const [i,spec] of (shot.actors||[]).entries()){
    const groundY=map.floorY(spec.p.x,spec.p.z,spec.p.y),actor=new SoldierVisual(i%4),mover=(spec.worldKeys||spec.path||spec.to)?new DirectorMover(spec,shot.duration,i):null;
    actor.directorVariant=i%4;
    // The old trailer-only wardrobe was assembled from rigid boxes parented to
    // animated bones. At running poses those blocks swallowed the silhouette.
    // Keep the shipped skinned body/atlas and remove only those additive rigid
    // costume primitives in the isolated director.
    actor.inner.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){
      // The shipped uniform is now merged bone-attached gear that is fitted to
      // this rig in metres (js/render/SoldierGear.js). It is not the old loose
      // costume boxes and must not be hidden or rescaled.
      if(o.userData.soldierGear)return;
      const p=o.geometry?.parameters||{},smallPad=o.geometry?.type==='BoxGeometry'&&p.width<=.17&&p.height<=.14&&p.depth<=.31;
      o.visible=!smallPad;o.scale.multiplyScalar(.68);
    }});
    // The director solves its own arm IK against authored shot poses, so the
    // avatar's standing rifle-carry pose has to stand aside for it.
    actor.armPose=null;actor.handPose=null;
    if(actor.gun)actor.gun.visible=false;
    const initialAction=actionAt(spec,0,spec.action||(shot.combat?'Idle_Attack':(mover?'Walk':'Idle')));
    if(!actor.actions[initialAction])throw new Error(`Director actor ${i}: missing clip ${initialAction}`);
    actor.group.position.set(spec.p.x,groundY,spec.p.z);actor.group.rotation.y=spec.yaw||0;actor.play(initialAction);
    if(!actor.current)throw new Error(`Director actor ${i}: inactive clip after preflight`);
    attachDirectorWeapon(actor,spec.weapon||'m1911',!!spec.pap,!!spec.diamond);if(spec.papAfter){actor.papDirectorWeapon=makeDirectorWeapon(actor,spec.weapon||'m1911',true,!!spec.diamond);actor.papDirectorWeapon.anchor.visible=false;}
    // Some shipped clips do not key every arm joint. Cache their authored
    // starting quaternions so random seeks cannot inherit an earlier IK solve.
    actor.directorArmRest={};
    for(const [side,chain] of Object.entries(actor.armChains||{}))actor.directorArmRest[side]={upper:chain.upper.quaternion.clone(),lower:chain.lower.quaternion.clone(),root:chain.root?.quaternion.clone()||null};
    scene.add(actor.group);actors.push({actor,spec,groundY,mover});
  }
  for(const [i,spec] of (shot.zombies||[]).entries()){
    const groundY=map.floorY(spec.p.x,spec.p.z,spec.p.y),z=new ZombieVisual(i%2),mover=(spec.worldKeys||spec.path||spec.to)?new DirectorMover(spec,shot.duration,i+17):null;
    z.group.position.set(spec.p.x,groundY,spec.p.z);z.group.rotation.y=spec.yaw||0;
    // Calibration is destructive by design, so it must happen before—not after—
    // the authored action is issued.
    z.calibrate();
    const initialAction=actionAt(spec,0,spec.action||'Idle');
    if(!z.actions[initialAction])throw new Error(`Director zombie ${i}: missing clip ${initialAction}`);
    z.play(initialAction,{loop:initialAction!=='Death'});
    if(!z.current)throw new Error(`Director zombie ${i}: inactive clip after preflight`);
    scene.add(z.group);zombies.push({z,spec,groundY,mover});
  }
  if(requestedShot==='squadFire'||requestedShot==='papRitual'){
    const laneTargets=requestedShot==='papRitual'?[0,1,3]:[0,2,5,7];
    actors.forEach(({spec},i)=>{
      const positions=new Float32Array(6);
      const color=spec.weapon==='raygun'?0xff6651:(spec.diamond||spec.pap?0x9fe7ff:0xffbd72);
      const line=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false}));
      const impactCount=spec.weapon==='trench'?8:1,impacts=[];
      for(let p=0;p<impactCount;p++){const impact=new THREE.Mesh(new THREE.SphereGeometry(spec.weapon==='raygun'?.07:.035,8,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false}));impact.visible=false;scene.add(impact);impacts.push(impact);}
      line.visible=false;scene.add(line);combatTracers.push({line,impacts,weapon:spec.weapon,actorIndex:i,zombieIndex:laneTargets[i]});
    });
  }
  if(shot.monkey){
    monkeyProp=buildViewmodel('monkey',false);monkeyProp.scale.setScalar(.55);monkeyProp.visible=false;scene.add(monkeyProp);
    const points=[v(-15.35,.6,-13.4),v(-14.9,2.3,-12.6),v(-14.45,.75,-11.7),v(-13.85,2.1,-12.8),v(-13.2,.7,-11.6),v(-12.65,2.4,-12.5)];
    trapArc=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xa8eaff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending}));trapArc.visible=false;scene.add(trapArc);
  }
  if(shot.dg2Event){
    chainArcs=new THREE.Group();
    const remaining=zombies.map((_,i)=>i);let cursor=actors[0].actor.group.position;
    while(remaining.length){remaining.sort((a,b)=>zombies[a].z.group.position.distanceTo(cursor)-zombies[b].z.group.position.distanceTo(cursor));const next=remaining.shift();dgOrder.push(next);cursor=zombies[next].z.group.position;}
    for(let i=0;i<zombies.length;i++){
      const parts=[];
      for(let j=0;j<7;j++){
        const halo=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,1,6),new THREE.MeshBasicMaterial({color:0x57bfff,transparent:true,opacity:.40,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));
        const core=new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,1,6),new THREE.MeshBasicMaterial({color:0xf5fcff,transparent:true,opacity:.94,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));
        halo.frustumCulled=false;core.frustumCulled=false;halo.renderOrder=20;core.renderOrder=21;
        parts.push({halo,core});
      }
      const impact=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8),new THREE.MeshBasicMaterial({color:0xbcecff,transparent:true,opacity:.86,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));impact.frustumCulled=false;impact.renderOrder=22;
      const segment=new THREE.Group();for(const p of parts)segment.add(p.halo,p.core);segment.add(impact);segment.userData={parts,impact};segment.visible=false;chainArcs.add(segment);
    }
    scene.add(chainArcs);
  }
  if(shot.dog){dog=createZombieModel(true,{directorRig:true});dog.position.copy(shot.dog);dog.rotation.y=-Math.PI/2;dog.userData.directorMover=shot.dogPath?new DirectorMover({p:shot.dog,path:shot.dogPath,entryFrame:shot.dogEntryFrame,exitFrame:shot.dogExitFrame,speedKeys:[[0,0],[14,.04],[124,.90],[142,.985],[149,1]],stride:1.65},shot.duration,91):null;scene.add(dog);}
}

export {actors,zombies,dog,displayWeapon,packMachineProp,boxSpinProp,machineArc,monkeyProp,chainArcs,dgOrder,trapArc,viewRig,powerPractical,powerReach,combatTracers,buildCast};
