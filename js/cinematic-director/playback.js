// Cinematic director: playback. seek() poses the camera, world and cast for a
// frame, then validates and renders it.
import * as THREE from 'three';
import {zombiePoseForState,applyHellhoundPose,ZSTATES} from '../zombies.js';
import {getStats} from '../weapons.js';
import {FPS,v,clamp01,blendAngle,worldPoint} from './math.js';
import {OPENING_GAMEPLAY_T0,openingGameplayForward} from './opening.js';
import {openingRoleLook,ACTION_BLEND_FRAMES,actionTimeline,openingV2CameraPoseAt,pointOnRail} from './motion.js';
import {setBlendedDeterministicPose,solveArmIK,applyDeterministicFootPlant} from './pose.js';
import {updateDirectorWeaponBinding} from './director-weapon.js';
import {capture,requestedShot,initialFrame,shot,status,overlay,renderer,scene,camera,shotKey} from './stage.js';
import {map,mapPracticalLamps,openingEnv,updateOpeningEnvironment} from './world.js';
import {actors,zombies,dog,displayWeapon,packMachineProp,boxSpinProp,machineArc,monkeyProp,chainArcs,dgOrder,trapArc,viewRig,powerPractical,powerReach,combatTracers} from './cast.js';
import {validate} from './validate.js';

let papDiamondEquipped=false;
let papKnucklesStarted=false;
let frame=initialFrame;
let proofFrame=(shot.globalStart??0)+initialFrame;
let lastValidation=[];
let lastMotionDiagnostics=[];

function seek(nextFrame){
  frame=Math.max(0,Math.min(shot.duration-1,nextFrame|0));
  proofFrame=(shot.globalStart??0)+frame;
  const t=shot.duration<=1?0:frame/(shot.duration-1);
  const ease=THREE.MathUtils.smoothstep(t,0,1);
  let position=pointOnRail(shot.camera,ease,0);
  let target=pointOnRail(shot.camera,ease,1);
  let lens=pointOnRail(shot.camera,ease,2);
  if(shot.openingV2&&shot.openingCameraKeys){
    const sampled=openingV2CameraPoseAt(shot,proofFrame);
    position=sampled.position;target=sampled.target;lens=sampled.lens;
  }
  if(shot.shoulderHandoff&&!shot.openingV2){
    const atlasMover=actors[0]?.mover,motion=atlasMover?.evaluate(proofFrame);
    if(frame<=108){
        const q=THREE.MathUtils.smoothstep(frame/108,0,1);
        position=v(.10,2.32,21.55).lerp(v(-3.55,2.40,20.75),q);
        target=v(-4.55,1.75,19.75).lerp(v(-7.75,1.55,14.10),q);lens=THREE.MathUtils.lerp(44,58,q);
    }else if(frame<130&&motion){
        const q=THREE.MathUtils.smoothstep((frame-108)/21,0,1),shoulder=motion.position.clone().add(v(.10,1.72,.40));
        position=v(-3.55,2.40,20.75).lerp(shoulder,q);target=v(-7.75,1.55,14.10).lerp(motion.position.clone().add(v(0,1.55,0)),q);lens=58;
    }else if(atlasMover){
        // The camera never travels through Atlas's head. A shoulder fill conceals
        // the hard camera cut, then the final two source frames are already at the
        // exact decoded openingDoorRun t0 eye transform and ramp 58→72→86° into
        // its canonical gameplay FOV, avoiding a 25%-speed lens or pose snap.
        position=OPENING_GAMEPLAY_T0.eye.clone();target=position.clone().addScaledVector(openingGameplayForward(),10);lens=THREE.MathUtils.lerp(58,OPENING_GAMEPLAY_T0.fov,(frame-129)/2);
    }
  }else if(shot.powerEvent){
    if(t<.48){const q=THREE.MathUtils.smoothstep(t/.48,0,1);position=v(-.50,2.34,-27.30).lerp(v(-.72,2.20,-27.42),q);target=v(-4,1.55,-27.38);lens=39;}
    else if(frame<192){const q=THREE.MathUtils.smoothstep((frame-144)/48,0,1);position=v(-12.45,2.0,-2.1).lerp(v(-12.0,2.15,-1.75),q);target=v(-10,3.35,3).lerp(v(-10,3.15,3),q);lens=43;}
    else if(frame<240){const q=THREE.MathUtils.smoothstep((frame-192)/48,0,1);position=v(-10.1,4.35,-46.0).lerp(v(-9.4,4.55,-46.55),q);target=v(-7,6.0,-52).lerp(v(-7,5.7,-52),q);lens=44;}
    else{const q=THREE.MathUtils.smoothstep((frame-240)/59,0,1);position=v(-33.2,2.45,-8.8).lerp(v(-34.0,2.75,-9.6),q);target=v(-38,3.65,-13).lerp(v(-38,3.45,-13),q);lens=45;}
  }else if(shot.monkeySwarm){
    if(t<.5){const q=THREE.MathUtils.smoothstep(t/.5,0,1);position=v(-15.35,2.52,-6.35).lerp(v(-15.6,2.68,-6.75),q);target=v(-12.8,1.05,-9.4).lerp(v(-15.0,.85,-11.3),q);lens=47;}
    else{const q=THREE.MathUtils.smoothstep((t-.5)/.5,0,1);position=v(-19.1,2.42,-11.55).lerp(v(-18.75,2.65,-12.4),q);target=v(-16.0,.9,-12.0).lerp(v(-15.4,1.05,-12.0),q);lens=44;}
  }else if(shot.papEvent&&frame>=220&&frame<737){const q=THREE.MathUtils.smoothstep((frame-220)/517,0,1);position=v(7.45,2.72,24.75).lerp(v(6.55,2.95,23.9),q);target=v(1.15,1.24,16.35).lerp(v(1.9,1.18,16.05),q);lens=58;}
  else if(shot.dg2Event){
    // Stay on the same unobstructed factory axis proven by the accepted crane
    // plate. The previous reverse angle looked through structural uprights,
    // hid the second player and over-emphasized corpses. This lateral rise
    // keeps both withdrawing players and the still-moving survivors readable.
    const q=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((frame-300)/190,0,1),0,1);
    position=v(10.8,2.25,-48.0).lerp(v(8.2,2.65,-58.0),q);
    target=v(0,1.18,-52.0).lerp(v(-1.0,1.26,-52.8),q);
    lens=THREE.MathUtils.lerp(52,43,q);
  }
  camera.position.copy(position);camera.lookAt(target);camera.fov=lens;camera.updateProjectionMatrix();
  shotKey.position.lerpVectors(position,target,.34);shotKey.position.y+=2.2;
  const seconds=proofFrame/FPS;
  updateOpeningEnvironment(proofFrame);
  if(shot.cinematicPack){
    // Machine choreography is a pure function of the requested frame so a
    // still, a sequential frame render and a re-render are pixel-repeatable.
    renderer.toneMappingExposure=1.08;
    const pulse=.5+.5*Math.sin(seconds*4.4);
    if(shot.machine==='powerCycle'){
      const q=THREE.MathUtils.smootherstep(clamp01((frame-36)/84),0,1);
      map.power.on=q>.5;
      map.power.lever.rotation.x=THREE.MathUtils.lerp(-.7,.7,q);
      for(const p of map.perks)p.lamp.intensity=THREE.MathUtils.lerp(.5,9,q);
      shotKey.intensity=12+q*18;
      shotKey.color.setHex(q>.5?0xa9d7ff:0x986f4a);
    }
    if(shot.machine==='boxIdle'||shot.machine==='boxSpin'){
      map.box.group.rotation.y=Math.sin(seconds*.7)*.025;
      const lidQ=shot.machine==='boxSpin'?THREE.MathUtils.smootherstep(clamp01((frame-24)/54),0,1):0;
      // The lid is now a Group pivoting on the crate's REAL hinge line at
      // (0, 0.86, -0.42), so rotation alone opens it correctly. The old
      // position offsets were compensating for a lid that pivoted about its
      // own centre; applied to a real hinge they just shove the hinge itself
      // around and make the lid wobble off the crate.
      map.box.lid.rotation.x=-lidQ*1.12;
      const boxLight=map.box.group.children.find(o=>o.isPointLight);
      if(boxLight)boxLight.intensity=shot.machine==='boxSpin'?12+pulse*8:8+pulse*2;
      if(boxSpinProp){
        const visible=frame>=64&&frame<430;
        boxSpinProp.visible=visible;
        boxSpinProp.rotation.y=seconds*2.15;
        boxSpinProp.rotation.z=Math.sin(seconds*1.9)*.08;
        boxSpinProp.position.y=1.18+Math.sin(seconds*2.5)*.08;
      }
      shotKey.color.setHex(0xffc879);shotKey.intensity=18+pulse*8;
    }
    if(shot.machine==='papCycle'){
      const q=clamp01((frame-30)/360),active=frame>=30&&frame<410;
      map.pap.slot.material.emissiveIntensity=active?.9+pulse*1.2:.5;
      if(packMachineProp){
        packMachineProp.visible=active;
        packMachineProp.rotation.y=-.18+seconds*1.35;
        packMachineProp.rotation.z=Math.sin(seconds*7.5)*.025;
        packMachineProp.position.y=1.12+Math.sin(seconds*5.5)*.045;
        const settle=THREE.MathUtils.smootherstep(clamp01((q-.82)/.18),0,1);
        packMachineProp.position.z=THREE.MathUtils.lerp(.78,1.02,settle);
      }
      shotKey.color.setHex(0xb985ff);shotKey.intensity=18+pulse*14;
    }
    if(shot.machine==='teleCharge'){
      const activeId=requestedShot.includes('ACharge')?'teleA':requestedShot.includes('BCharge')?'teleB':'teleC';
      for(const tp of map.teleporters){
        const active=tp.id===activeId,q=THREE.MathUtils.smootherstep(clamp01((frame-30)/150),0,1);
        tp.ringMat.emissiveIntensity=active?.6+q*2.6+pulse*.65:(tp.linked?1.25:.55);
        tp.ringMat.emissive.setHex(active?0x7fd5ff:(tp.linked?0x55aaff:0x3366aa));
      }
      shotKey.color.setHex(0x94ddff);shotKey.intensity=20+pulse*13;
    }
    if(shot.machine==='perkPulse'){
      const perkId=requestedShot.includes('Quick')?'qr':requestedShot.includes('Jugger')?'jug':requestedShot.includes('Speed')?'speed':'dtap';
      for(const perk of map.perks)perk.lamp.intensity=perk.id===perkId?10+pulse*5:7;
    }
    if(machineArc){
      const active=frame>=54&&frame<shot.duration-32;
      machineArc.visible=active;
      machineArc.rotation.y=Math.sin(seconds*5)*.012;
      machineArc.children.forEach((mesh,i)=>{mesh.material.opacity=active?(i%2===0?.72+pulse*.28:.18+pulse*.22):0;});
      shotKey.color.setHex(0x9cecff);shotKey.intensity=active?30+pulse*18:14;
    }
  }
  if(shot.openingV4){shotKey.intensity=24;shotKey.color.setHex(0xa8bed6);}
  if(shot.powerEvent){const on=frame>=144,leverQ=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((frame-132)/12,0,1),0,1);map.power.on=on;map.power.lever.rotation.x=THREE.MathUtils.lerp(-.7,.7,leverQ);for(const p of map.perks)p.lamp.intensity=on?9:.4;for(const [li,l] of mapPracticalLamps.entries()){const wake=144+Math.min(12,li*4);l.intensity=frame>=wake?18:5;}shotKey.intensity=on?12:7;shotKey.color.setHex(on?0xffd9a0:0x6f5538);if(powerPractical)powerPractical.intensity=on?28:0;}
  for(const tp of map.teleporters){
    if(shot.openingV4){
      tp.linked=false;tp.ringMat.emissiveIntensity=(tp===openingEnv?.teleC ? .03 : .02);tp.ringMat.emissive.setHex(0x111923);continue;
    }
    if(shot.openingV3){
      tp.linked=false;tp.ringMat.emissiveIntensity=(tp===openingEnv?.teleC ? .03 : .02);tp.ringMat.emissive.setHex(0x182234);continue;
    }
    const base=!!shot.state.tele?.includes(tp.id),event=shot.teleEvent===tp.id,linked=base||(event&&t>=.72);
    tp.linked=linked;tp.ringMat.emissiveIntensity=event?(t<.72?.55+t*3.8:2.15+Math.sin(seconds*10)*.45):(linked?1.55:.55);tp.ringMat.emissive.setHex(linked?0x55aaff:0x3366aa);
  }
  for(const [i,{actor,spec,groundY,mover}] of actors.entries()){
    const motion=mover?.evaluate(proofFrame);
    for(const [side,rest] of Object.entries(actor.directorArmRest||{})){
      const chain=actor.armChains?.[side];if(chain){chain.upper.quaternion.copy(rest.upper);chain.lower.quaternion.copy(rest.lower);if(chain.root&&rest.root)chain.root.quaternion.copy(rest.root);}
    }
    actor.group.userData.directorFootPlantActive=false;
    actor.group.userData.directorPlantedFootIndex=-1;
    actor.group.userData.directorFootPlantError=Infinity;
    actor.group.visible=proofFrame>=(mover?.entry??0)&&proofFrame<=(mover?.exit??Infinity);
    if(shot.papEvent)actor.group.visible=actor.group.visible&&frame>=220&&frame<737;
    // The owning third-person avatar is not rendered after first-person camera
    // ownership begins. This mirrors normal local-player visibility and keeps
    // the canonical f1380/f1381 takeover frames free of head/body interiors.
    if(shot.openingV2&&shot.shoulderHandoff&&i===0&&proofFrame>=1380)actor.group.visible=false;
    let authoredAction=requestedShot==='dg2Aftermath'?(frame>=300?'Walk':'Idle'):(spec.action||(shot.combat?'Idle_Attack':(mover?'Walk':'Idle')));
    const timeline=mover?actionTimeline(spec,motion.local,authoredAction):null;
    if(timeline)authoredAction=timeline.action;
    if(!actor.actions[authoredAction])authoredAction=motion?.speed>4.2?'Run':motion?.speed>.35?'Walk':'Idle';
    if(mover){
      const ax=motion.position.x,az=motion.position.z;
      actor.group.position.set(ax,map.floorY(ax,az,groundY),az);
      const pathYaw=Math.atan2(motion.tangent.x,motion.tangent.z),yawEase=THREE.MathUtils.smoothstep(clamp01((motion.local+8)/20),0,1);
      actor.group.rotation.y=blendAngle(spec.yaw??pathYaw,pathYaw,yawEase);
      if(spec.backpedalYaw!==undefined&&proofFrame>=1216){
        // Ease onto the already-nearby incoming bearing before the path's
        // positional reversal, then hold it through shoulder occlusion. This
        // is readable defensive backpedalling, not a 180° snap or moonwalking
        // accident, and it preserves the first sprint tangent for the POV cut.
        const backpedalBlend=THREE.MathUtils.smoothstep(clamp01((proofFrame-1216)/12),0,1);
        actor.group.rotation.y=blendAngle(actor.group.rotation.y,spec.backpedalYaw,backpedalBlend);
      }
      const locomotion=a=>a==='Run'||a==='Walk',phaseFor=(a,start=0)=>locomotion(a)?motion.phase:Math.min(.999,Math.max(0,motion.local-start)/FPS/Math.max(.001,actor.actions[a]?.getClip().duration||1));
      const from=timeline.previous,to=authoredAction,boundary=timeline.boundary||0;
      setBlendedDeterministicPose(actor,from,to,phaseFor(from),phaseFor(to,boundary),timeline.blend,{from:{loop:from!=='Death'},to:{loop:to!=='Death'}});
      const nextBeat=(spec.beats||[]).find(b=>b.frame>motion.local),plantWeight=nextBeat?clamp01((nextBeat.frame-motion.local)/ACTION_BLEND_FRAMES):1;
      if((to==='Run'||to==='Walk')&&timeline.blend>=.999&&plantWeight>.001)applyDeterministicFootPlant(actor,motion,mover,to,plantWeight);
    }else{
      actor.play(authoredAction,{loop:!['Death'].includes(authoredAction),fade:.1,timeScale:1});
      actor.mixer.setTime(seconds+i*.31);actor.update(0);
      const move=spec.to?(requestedShot==='dg2Aftermath'?THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((frame-300)/190,0,1),0,1):shot.powerEvent?THREE.MathUtils.smoothstep(Math.min(1,t*2.35),0,1):THREE.MathUtils.smoothstep(t,0,1)):0;
      const ax=spec.to?THREE.MathUtils.lerp(spec.p.x,spec.to.x,move):spec.p.x,az=spec.to?THREE.MathUtils.lerp(spec.p.z,spec.to.z,move):spec.p.z;
      actor.group.position.set(ax,map.floorY(ax,az,groundY),az);
    }
    if(shot.powerEvent&&i===0&&frame>=88){const q=THREE.MathUtils.smoothstep(clamp01((frame-88)/38),0,1);actor.group.rotation.y=blendAngle(actor.group.rotation.y,.70,q);}
    if(shot.openingPerformance==='squad'){
      const look=openingRoleLook(spec.role,proofFrame),head=actor.bones?.Head,torso=actor.bones?.Torso;
      if(head)head.rotation.y+=look*.72;
      if(torso)torso.rotation.y+=look*.20;
      actor.group.updateMatrixWorld(true);
    }
    const usePap=!!spec.pap||(!!spec.papAfter&&t>=.68);
    if(actor.papDirectorWeapon){actor.directorWeapon.anchor.visible=!usePap;actor.papDirectorWeapon.anchor.visible=usePap;}
    const rig=usePap&&actor.papDirectorWeapon?actor.papDirectorWeapon:actor.directorWeapon;
    const stats=getStats(spec.weapon||'m1911',usePap);
    const cycle=Math.max(4,Math.round(3600/Math.max(1,stats.rpm||300)));
    let fire=!!shot.combat&&((frame+i*5)%cycle)<2&&t>.12;
    if(requestedShot==='squadFire'){
      if(spec.weapon==='mg42')fire=frame>=44&&frame<68&&(frame%cycle)<3;
      else if(spec.weapon==='ppsh')fire=frame>=84&&frame<106&&(frame%cycle)<2;
      else if(spec.weapon==='trench')fire=frame>=112&&frame<116;
      else if(spec.weapon==='raygun')fire=(frame>=188&&frame<193)||(frame>=208&&frame<213);
    }else if(requestedShot==='factoryDefense'){
      if(spec.weapon==='mg42')fire=((frame>=70&&frame<145)||(frame>=278&&frame<326))&&(frame%cycle)<3;
      else if(spec.weapon==='ppsh')fire=((frame>=126&&frame<198)||(frame>=300&&frame<344))&&(frame%cycle)<2;
      else if(spec.weapon==='trench')fire=(frame>=202&&frame<207)||(frame>=316&&frame<321);
      else if(spec.weapon==='raygun')fire=(frame>=244&&frame<250)||(frame>=334&&frame<340);
    }else if(requestedShot==='catwalkPressure'){
      fire=(i===0&&frame>=161&&frame<190&&(frame%cycle)<2)||(i===2&&frame>=214&&frame<218);
    }else if(requestedShot==='dg2Aftermath'){
      fire=(i===0&&frame>=180&&frame<186)||(i===1&&frame>=224&&frame<248&&(frame%cycle)<2);
    }else if(requestedShot==='papRitual'){
      fire=(i===0&&frame>=300&&frame<340&&(frame%cycle)<2)||(i===1&&frame>=420&&frame<424)||(i===2&&frame>=520&&frame<526);
    }
    actor.group.userData.directorFiring=fire;
    if(rig.flash)rig.flash.visible=fire;
    updateDirectorWeaponBinding(actor,rig,fire);
  }
  if(powerReach&&actors[0]){
    const actor=actors[0].actor,reachIn=THREE.MathUtils.smoothstep(clamp01((frame-96)/30),0,1),reachOut=1-THREE.MathUtils.smoothstep(clamp01((frame-146)/18),0,1),q=reachIn*reachOut,reaching=q>.01;
    const rig=actor.papDirectorWeapon?.anchor.visible?actor.papDirectorWeapon:actor.directorWeapon;
    map.power.lever.updateMatrixWorld(true);const lever=map.power.lever.localToWorld(new THREE.Vector3(0,.14,0));
    const hand=new THREE.Vector3();actor.armChains?.right?.hand.getWorldPosition(hand);const target=hand.clone().lerp(lever,q);
    rig.anchor.visible=!reaching;powerReach.active=reaching;powerReach.target.copy(lever);
    if(reaching){
      solveArmIK(actor,actor.armChains?.right,target,{iterations:64,strength:.98});
      powerReach.error=worldPoint(actor.armChains.right.hand).distanceTo(lever);
    }else powerReach.error=Infinity;
    actor.group.userData.powerReachActive=reaching;
  }
  for(const [zi,{z,spec,groundY,mover}] of zombies.entries()){
    const motion=mover?.evaluate(proofFrame);
    z.group.userData.directorFootPlantActive=false;
    z.group.userData.directorPlantedFootIndex=-1;
    z.group.userData.directorFootPlantError=Infinity;
    z.group.visible=proofFrame>=(mover?.entry??0)&&proofFrame<=(mover?.exit??Infinity);
    if(shot.papEvent)z.group.visible=z.group.visible&&frame>=220&&frame<737;
    if(mover){
      const timeline=actionTimeline(spec,motion.local,spec.action||(motion.speed>3?'Run':'Walk')),desired=timeline.action;
      const state=desired==='Death'?ZSTATES.DIE:(desired==='Punch'||desired==='Idle_Attack'?ZSTATES.ATTACK:(motion.speed>3?ZSTATES.CHASE:ZSTATES.APPROACH));
      const pose=zombiePoseForState({state,speed:motion.speed,current:z.current,deterministic:true,variant:zi});
      // Authored locomotion clip wins when explicitly specified; action beats use
      // the same shipped clip names and never invent a cinematic-only species.
      const action=z.actions[desired]?desired:pose.action;
      const zx=motion.position.x,zz=motion.position.z,zy=map.floorY(zx,zz,groundY);
      z.group.position.set(zx,zy,zz);
      const pathYaw=Math.atan2(motion.tangent.x,motion.tangent.z),yawEase=THREE.MathUtils.smoothstep(clamp01((motion.local+8)/18),0,1);
      z.group.rotation.y=blendAngle(spec.yaw??pathYaw,pathYaw,yawEase);
      const previous=z.actions[timeline.previous]?timeline.previous:action,locomotion=a=>a==='Run'||a==='Run_Arms'||a==='Walk',phaseFor=(a,start=0)=>locomotion(a)?motion.phase:Math.min(.999,Math.max(0,motion.local-start)/FPS/Math.max(.001,z.actions[a]?.getClip().duration||1));
      setBlendedDeterministicPose(z,previous,action,phaseFor(previous),phaseFor(action,timeline.boundary||0),timeline.blend,{from:{loop:!['Death','Punch'].includes(previous),timeScale:pose.timeScale},to:{loop:!['Death','Punch'].includes(action),timeScale:pose.timeScale}});
      const nextBeat=(spec.beats||[]).find(b=>b.frame>motion.local),plantWeight=nextBeat?clamp01((nextBeat.frame-motion.local)/ACTION_BLEND_FRAMES):1;
      if(locomotion(action)&&timeline.blend>=.999&&plantWeight>.001)applyDeterministicFootPlant(z,motion,mover,action,plantWeight);
    }else{
      z.mixer.setTime(seconds);z.update?.(0);
      const end=spec.to||spec.p,rawMove=shot.monkeySwarm?Math.max(0,Math.min(1,(t-.42)/.5)):t,move=spec.to?THREE.MathUtils.smoothstep(rawMove,0,1):0;
      const zx=THREE.MathUtils.lerp(spec.p.x,end.x,move),zz=THREE.MathUtils.lerp(spec.p.z,end.z,move),zy=THREE.MathUtils.lerp(spec.p.y||groundY,end.y||map.floorY(zx,zz,groundY),move);
      z.group.position.set(zx,zy,zz);
    }
    if(shot.dg2Event){const rank=dgOrder.indexOf(zi),hitAt=183+Math.max(0,rank)*3;if(frame>hitAt)z.group.rotation.z=Math.min(1.32,(frame-hitAt)*.095)*(zi%2?-1:1);}
    if(requestedShot==='papRitual'){
      if(zi===0&&frame>340){const fall=Math.min(1,(frame-340)/22);z.group.position.x-=fall*.42;z.group.rotation.z=-fall*1.25;}
      else if(zi===1&&frame>=420&&frame<455){const hit=Math.sin((frame-420)/35*Math.PI);z.group.position.z-=hit*.28;z.group.rotation.x=-hit*.24;}
      else if(zi===3&&frame>=526&&frame<565){const hit=Math.sin((frame-526)/39*Math.PI);z.group.position.x+=hit*.34;z.group.rotation.z=hit*.30;}
    }else if(requestedShot==='squadFire'){
      const lethalAt=zi===0?58:(zi===7?215:9999);
      if(frame>lethalAt){const seeded=(zi*1.618)%1,zDir=seeded>.5?1:-1,fall=Math.min(1,(frame-lethalAt)/24);z.group.position.x+=fall*(zi===0?-.42:.38);z.group.position.z-=fall*.22;z.group.rotation.z=Math.min(1.2+seeded*.25,(frame-lethalAt)*(.058+seeded*.018))*zDir;z.group.rotation.y=(spec.yaw||0)+(frame-lethalAt)*.0015*(zi%2?-1:1);}
      else if(zi===2&&frame>=96&&frame<126){const hit=Math.sin((frame-96)/30*Math.PI);z.group.position.x+=hit*.2;z.group.rotation.z=hit*.18;}
      else if(zi===5&&frame>=116&&frame<146){const hit=Math.sin((frame-116)/30*Math.PI);z.group.position.z-=hit*.24;z.group.rotation.x=-hit*.20;}
    }else if(requestedShot==='factoryDefense'){
      const lethalAt=[132,176,205,246,292,318,338,9999][zi]??9999;
      if(frame>lethalAt&&lethalAt<9999){const fall=Math.min(1,(frame-lethalAt)/24),side=zi%2?-1:1;z.group.position.x+=side*fall*.34;z.group.position.z-=fall*.24;z.group.rotation.z=side*fall*1.18;}
    }else if(requestedShot==='catwalkPressure'){
      if(zi===2&&frame>215){const fall=Math.min(1,(frame-215)/18);z.group.position.z-=fall*.78;z.group.rotation.x=-fall*1.12;z.group.rotation.z=-fall*.28;}else{z.group.rotation.x=0;z.group.rotation.z=0;}
    }
  }
  for(const trace of combatTracers){
    const a=actors[trace.actorIndex]?.actor,b=zombies[trace.zombieIndex]?.z,active=!!a?.group.userData.directorFiring;
    trace.line.visible=active&&trace.weapon!=='raygun'&&trace.weapon!=='trench';
    trace.impacts.forEach(p=>p.visible=false);
    if(a&&b){
      const start=a.group.localToWorld(v(.18,1.18,.95));
      const end=b.group.position.clone().add(v(0,1.02,0));
      if(trace.weapon==='raygun'){
        const launch=requestedShot==='papRitual'?520:(frame>=205?208:188),hit=launch+6,q=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((frame-launch)/6,0,1),0,1),orb=trace.impacts[0];
        orb.visible=frame>=launch&&frame<=hit+4;orb.position.lerpVectors(start,end,q);orb.scale.setScalar(frame>=hit?1.55-(frame-hit)*.18:1.0);
      }else if(trace.weapon==='trench'&&active){
        trace.impacts.forEach((spark,p)=>{spark.visible=true;spark.position.copy(end).add(v((p-3.5)*.10,((p%3)-1)*.10,(p-3.5)*.028));spark.scale.setScalar(.68+(p%2)*.22);});
      }else if(active){
        const dir=end.clone().sub(start),len=dir.length(),unit=dir.clone().normalize(),travel=.12+(((frame+trace.actorIndex*7)%9)/9)*.55,p0=start.clone().addScaledVector(dir,travel),p1=p0.clone().addScaledVector(unit,Math.min(.82,len*.32));
        const attr=trace.line.geometry.attributes.position;attr.setXYZ(0,p0.x,p0.y,p0.z);attr.setXYZ(1,p1.x,p1.y,p1.z);attr.needsUpdate=true;
        const spark=trace.impacts[0];spark.visible=((frame+trace.actorIndex*3)%3)===0;spark.position.copy(end);spark.scale.setScalar(.7);
      }
    }
  }
  if(monkeyProp){
    const q=Math.max(0,Math.min(1,(t-.18)/.24));monkeyProp.visible=t>=.18;
    const start=v(-12.5,1.25,-9.2),end=shot.monkey;
    monkeyProp.position.lerpVectors(start,end,q);monkeyProp.position.y+=.42+Math.sin(q*Math.PI)*2.1+Math.sin(seconds*10)*.025;monkeyProp.rotation.set(.15+q*3.4,.8+seconds*4,-.1+q*2.2);
    if(trapArc){trapArc.visible=t>=.78&&t<=.94;trapArc.material.opacity=.62+Math.sin(seconds*55)*.34;shotKey.color.setHex(0x9de9ff);if(trapArc.visible)shotKey.intensity=48;}
  }
  if(chainArcs){
    const points=[actors[0].actor.group.position.clone().add(v(0,1.25,.7)),...dgOrder.map((zi,i)=>zombies[zi].z.group.position.clone().add(v(0,1.0,0)))];
    let any=false;
    chainArcs.children.forEach((segment,i)=>{
      const age=frame-(180+i*3),active=age>=0&&age<9;segment.visible=active;any=any||active;if(!active)return;
      const a=points[i],b=points[i+1],dir=b.clone().sub(a),side=dir.clone().cross(v(0,1,0)).normalize();if(!Number.isFinite(side.x))side.set(1,0,0);
      const {parts,impact}=segment.userData,jag=[];
      for(let j=0;j<8;j++){const q=j/7,p=a.clone().lerp(b,q),env=Math.sin(q*Math.PI),jitter=(Math.sin(frame*2.31+i*5.7+j*7.13)*.10+Math.sin(frame*.91+j*3.17)*.055)*env,upJ=Math.cos(frame*1.77+i+j*5.9)*.08*env;p.addScaledVector(side,jitter);p.y+=upJ;jag.push(p);}
      const fade=1-age/9,up=v(0,1,0);parts.forEach((part,j)=>{const p0=jag[j],p1=jag[j+1],dir=p1.clone().sub(p0),len=dir.length(),mid=p0.clone().add(p1).multiplyScalar(.5),quat=new THREE.Quaternion().setFromUnitVectors(up,dir.normalize());for(const mesh of [part.halo,part.core]){mesh.position.copy(mid);mesh.quaternion.copy(quat);mesh.scale.set(1,len,1);}part.core.material.opacity=.92*fade;part.halo.material.opacity=.46*fade;});
      impact.position.copy(b);impact.visible=age>=2&&age<7;impact.scale.setScalar(.55+Math.sin(Math.min(1,(age-2)/5)*Math.PI)*.42);
    });
    chainArcs.visible=any;if(any){shotKey.color.setHex(0x94dcff);shotKey.intensity=36;}
  }
  if(viewRig){
    if(!papKnucklesStarted&&frame>=250){viewRig.knuckleCrack();papKnucklesStarted=true;}
    if(!papDiamondEquipped&&frame>=737){viewRig.diamondNext=true;viewRig.equip(shot.povWeapon,true);papDiamondEquipped=true;}
    // Keep arbitrary frame seeks deterministic: the capture tools may jump
    // directly to a hero frame rather than simulating every preceding update.
    viewRig.equipT=1;
    viewRig.inspectT=frame>=737&&frame<881?(frame-737)/FPS:0;
    if(frame>=250&&frame<322)viewRig.knuckleT=(frame-250)/FPS;
    else if(frame>=322)viewRig.knuckleT=0;
    viewRig.root.position.set(0,0,0);
    viewRig.update(1/FPS,{ads:false,moving:false,sprinting:false,mouseX:0,mouseY:0});
    if(viewRig.current)viewRig.current.group.scale.setScalar(.82);
    if(frame<220&&viewRig.goldCamo)for(const m of viewRig.goldCamo.mats){m.color.setHex(0xa87924);m.roughness=.28;m.emissiveIntensity=Math.min(m.emissiveIntensity,.07);}
    if(frame>=737&&viewRig.diamondCamo)for(const m of viewRig.diamondCamo.mats){m.color.setHex(0x7f9caf);m.roughness=.17;m.metalness=1;m.emissiveIntensity=Math.min(m.emissiveIntensity,.16);}
    const inserting=frame>=120&&frame<220,hidden=frame>=220&&frame<737;
    if(viewRig.current)viewRig.current.group.visible=!hidden;
    if(inserting){const q=THREE.MathUtils.smoothstep((frame-120)/100,0,1);viewRig.root.position.x=THREE.MathUtils.lerp(.23,.02,q);viewRig.root.position.y=THREE.MathUtils.lerp(-.205,-.13,q);viewRig.root.position.z=THREE.MathUtils.lerp(-.4,-.78,q);}
    if(shot.papEvent){const pulse=Math.max(0,Math.sin(Math.max(0,frame-240)*.09));shotKey.color.setHex(frame>=737?0xbfd8ee:0xb76dff);shotKey.intensity=frame>=737?12:18+(frame>=240&&frame<737?pulse*16:8);renderer.toneMappingExposure=frame>=737?.90:1.08;}
  }
  if(dog){
    const mover=dog.userData.directorMover,motion=mover?.evaluate(proofFrame);
    if(motion){
      dog.visible=proofFrame>=mover.entry;
      const x=motion.position.x,zp=motion.position.z,ground=map.floorY(x,zp,shot.dog.y||0);
      dog.position.set(x,ground,zp);dog.rotation.y=Math.atan2(motion.tangent.x,motion.tangent.z)-Math.PI/2;
      // This diagnostic is a motivated chase pass, not an attack at empty air.
      // The hound keeps running through the frame and decelerates only after it
      // has cleared the hero axis; a later edit may cut to a target-owned lunge.
      applyHellhoundPose(dog,{state:ZSTATES.CHASE,phase:motion.phase*Math.PI*2,stateT:0,groundY:ground});
    }else applyHellhoundPose(dog,{state:ZSTATES.CHASE,phase:seconds*8,groundY:shot.dog.y||0});
  }
  if(displayWeapon){displayWeapon.rotation.y=-.72+Math.sin(t*Math.PI)*.28;displayWeapon.rotation.x=-.08+Math.sin(t*Math.PI*2)*.025;}
  // Director-only teleporter energy and PaP pulse are functions of absolute time.
  if(map.pap?.lamp){
    const base=shot.state.pap?12:(shot.state.power?4:.12);
    map.pap.lamp.intensity=Math.max(0,base+(shot.state.power?Math.sin(seconds*5)*2:0));
  }
  lastValidation=validate(position,target,frame,proofFrame);
  renderFrame();
  const cameraCollider=lastValidation.includes('CAMERA_COLLIDER')?map.colliders.find(c=>position.x>c.minX&&position.x<c.maxX&&position.z>c.minZ&&position.z<c.maxZ&&position.y>(c.y0||0)&&position.y<(c.y0||0)+(c.h||99)):null;
  return {frame,seconds,shot:requestedShot,validation:lastValidation,camera:position.toArray(),cameraCollider};
}

function renderFrame(){
  renderer.render(scene,camera);
  if(!capture){status.textContent=`SHOT ${requestedShot}\nFRAME ${String(frame).padStart(5,'0')} / ${shot.duration-1}\nTIME ${(frame/FPS).toFixed(3)} s\nDEPENDENCIES ${shot.dependencies.join(' → ')}\n${lastValidation.length?'FAIL '+lastValidation.join(', '):'VALIDATION OK'}`;overlay.className=lastValidation.length?'bad':'good';}
  return true;
}

function previewCamera(position,target,fov=42){
  camera.position.set(position.x,position.y,position.z);
  camera.lookAt(target.x,target.y,target.z);
  camera.fov=fov;
  camera.updateProjectionMatrix();
  lastValidation=validate(camera.position,new THREE.Vector3(target.x,target.y,target.z),frame,proofFrame);
  renderFrame();
  return lastValidation;
}

export {frame,proofFrame,lastValidation,seek,renderFrame,previewCamera};
