// Cinematic director: the debug reports __TRAILER__ gives the capture tools:
// weapons and grips, the scene and opening contracts, and motion per frame.
import * as THREE from 'three';
import {v,worldPoint,planarDistance} from './math.js';
import {OPENING_GAMEPLAY_T0,openingGameplayForward} from './opening.js';
import {openingCameraKinematics} from './motion.js';
import {poseSnapshot} from './pose.js';
import {requestedShot,shot,camera,projectWitness,objectScreenRect,rectOverlapRatio,rectIntersectsCenter80} from './stage.js';
import {map,openingEnv} from './world.js';
import {actors,zombies,dog,chainArcs,viewRig,powerReach} from './cast.js';
import {frame,proofFrame,lastValidation} from './playback.js';

function debugCast(){
  const cast=actors.map(({actor,spec})=>{
    const box=new THREE.Box3().setFromObject(actor.directorWeapon.anchor);
    const rig=actor.papDirectorWeapon?.anchor.visible?actor.papDirectorWeapon:actor.directorWeapon;
    return {weapon:spec.weapon,visible:rig.anchor.visible,min:box.min.toArray(),max:box.max.toArray(),actor:actor.group.position.toArray(),bones:Object.keys(actor.bones||{}),boneParents:Object.fromEntries(Object.entries(actor.bones||{}).map(([n,b])=>[n,b.parent?.name||null])),primaryPreError:rig.primaryPreError,supportPreError:rig.supportPreError,primaryError:rig.primaryError,supportError:rig.supportError,primary:worldPoint(rig.primaryBone).toArray(),primaryTarget:worldPoint(rig.primaryGrip).toArray(),support:worldPoint(rig.supportBone).toArray(),supportTarget:worldPoint(rig.supportGrip).toArray(),primaryJoints:rig.primaryChain?[worldPoint(rig.primaryChain.root||rig.primaryChain.upper).toArray(),worldPoint(rig.primaryChain.upper).toArray(),worldPoint(rig.primaryChain.lower).toArray()]:null,supportJoints:rig.supportChain?[worldPoint(rig.supportChain.root||rig.supportChain.upper).toArray(),worldPoint(rig.supportChain.upper).toArray(),worldPoint(rig.supportChain.lower).toArray()]:null,muzzle:worldPoint(rig.muzzleLocator).toArray()};
  });
  if(!viewRig?.current)return cast;
  const viewBox=new THREE.Box3().setFromObject(viewRig.current.group);
  return {cast,viewWeapon:{id:viewRig.current.id,visible:viewRig.current.group.visible,min:viewBox.min.toArray(),max:viewBox.max.toArray(),localPosition:viewRig.current.group.position.toArray(),camera:camera.position.toArray()}};
}
function debugScene(){
  map.power.lever.updateMatrixWorld(true);const lever=map.power.lever.localToWorld(new THREE.Vector3(0,.14,0));
  let opening=null;
  if(shot.openingPlate){
    const roots=[...actors.map(a=>a.actor.group),...zombies.map(z=>z.z.group)],screen=roots.map(root=>{const p=root.position.clone().add(v(0,1,0)).project(camera);return [p.x,p.y,p.z];});
    let minSeparation=Infinity;for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)minSeparation=Math.min(minSeparation,planarDistance(actors[i].actor.group.position,actors[j].actor.group.position));
    const dFact=map.doors.find(d=>d.id==='d_fact'),dMainL=map.doors.find(d=>d.id==='d_mainL');
    opening={plate:shot.openingPlate,globalFrame:proofFrame,camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,screen,minSeparation:Number.isFinite(minSeparation)?minSeparation:null,power:map.power.on,teleLinked:map.teleporters.filter(t=>t.linked).map(t=>t.id),doors:{d_fact:{open:dFact?.open,visible:dFact?.mesh.visible},d_mainL:{open:dMainL?.open,visible:dMainL?.mesh.visible,cost:dMainL?.cost}},westLamp:openingEnv?.westLamp?.intensity??null,eastLamp:openingEnv?.eastLamp?.intensity??null};
    if(shot.openingV2&&shot.openingVisualGate){
      const round=x=>Number(x.toFixed(6)),vec3=x=>x.toArray().map(round),motion=openingCameraKinematics(shot,proofFrame),gate=shot.openingVisualGate;
      const actorRects=actors.map(({actor,spec},i)=>({i,role:spec.role,visible:actor.group.visible,rect:objectScreenRect(actor.group)}));
      const witnessLayers=Object.fromEntries(Object.entries(gate.witnesses).map(([layer,list])=>[layer,list.map(w=>({name:w.name,...projectWitness(w.p)}))]));
      let subjectHeight=0;
      if(gate.subject.kind==='world'){
        const bottom=gate.subject.p.clone().add(v(0,-gate.subject.height/2,0)).project(camera),top=gate.subject.p.clone().add(v(0,gate.subject.height/2,0)).project(camera);subjectHeight=Math.min(1,Math.abs(top.y-bottom.y)/2);
      }else if(gate.subject.kind==='actor')subjectHeight=actorRects[gate.subject.actorIndex]?.rect?.height||0;
      else if(gate.subject.kind==='actors')subjectHeight=Math.max(0,...actorRects.map(a=>a.rect?.height||0));
      let maxActorOverlap=0;for(let i=0;i<actorRects.length;i++)for(let j=i+1;j<actorRects.length;j++)maxActorOverlap=Math.max(maxActorOverlap,rectOverlapRatio(actorRects[i].rect,actorRects[j].rect));
      const euler=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ'),doorRect=objectScreenRect(dMainL?.mesh),centerContamination=actorRects.filter(a=>rectIntersectsCenter80(a.rect)).map(a=>a.role);
      opening.v2={
        motion:{position:vec3(motion.position),target:vec3(motion.target),fov:round(motion.fov),yaw:round(motion.yaw),pitch:round(motion.pitch),roll:round(motion.roll),velocity:vec3(motion.velocity),acceleration:vec3(motion.acceleration),jerk:vec3(motion.jerk),speed:round(motion.speed),accelerationMagnitude:round(motion.accelerationMagnitude),jerkMagnitude:round(motion.jerkMagnitude)},
        witnesses:witnessLayers,subject:{name:gate.subject.name,revealFrame:gate.subject.revealFrame,heightRatio:round(subjectHeight)},
        actorRects,maxActorOverlap:round(maxActorOverlap),doorRect,papVisible:!!openingEnv?.papGroup?.visible,centerContamination,
        horizon:{yaw:round(euler.y),pitch:round(euler.x),roll:round(euler.z)},
        decodedPending:{floorCeilingCoverageMax:.25,occluderAreaMax:.20,depthOccupancyMin:.70,nearOpticalMotionFloor:'calibrate on grain-disabled OP01 proof',imageSpaceHandoff:'compare f1381 to canonical gameplay f1382'},
      };
      if(shot.openingV3)opening.v3={
        captureId:requestedShot,
        teleC:{linked:!!openingEnv?.teleC?.linked,emissiveIntensity:round(openingEnv?.teleC?.ringMat?.emissiveIntensity||0)},
        support:{rotationZ:round(openingEnv?.v3ChainPivot?.rotation?.z||0),dustVisible:!!openingEnv?.v3SupportDust?.visible},
        staticContract:{constantFov:gate.constantFov,floorCeilingSafetyMax:gate.staticFloorCeilingSafetyMax,decodedFloorCeilingMax:gate.decodedFloorCeilingMax,wipeFrames:gate.wipeFrames},
      };
      if(shot.openingV4)opening.v4={
        captureId:requestedShot,
        teleC:{linked:!!openingEnv?.teleC?.linked,emissiveIntensity:round(openingEnv?.teleC?.ringMat?.emissiveIntensity||0)},
        support:{rotationZ:round(openingEnv?.v4ChainPivot?.rotation?.z||0),dustVisible:!!openingEnv?.v4SupportDust?.visible},
        staticContract:{constantFov:gate.constantFov,eyeHeight:gate.eyeHeight,minLateralTranslation:gate.minLateralTranslation,minDepthChange:gate.minDepthChange,minCameraTravel:gate.minCameraTravel,maxCameraTravel:gate.maxCameraTravel,actionSafe:gate.actionSafe,padVisibleMin:gate.padVisibleMin,staticFloorMax:gate.staticFloorMax,staticCeilingMax:gate.staticCeilingMax,decodedOccluderAreaMax:gate.decodedOccluderAreaMax,continuousBlackBandWidthMax:gate.continuousBlackBandWidthMax,wipeFrames:gate.wipeFrames},
      };
    }
    if(shot.shoulderHandoff&&actors[0]?.mover){
      const eye=OPENING_GAMEPLAY_T0.eye,expectedForward=openingGameplayForward(),forward=new THREE.Vector3();camera.getWorldDirection(forward);
      opening.povMatch={expectedEye:eye.toArray(),eyeError:camera.position.distanceTo(eye),axisErrorDegrees:THREE.MathUtils.radToDeg(forward.angleTo(expectedForward)),expectedYaw:OPENING_GAMEPLAY_T0.yaw,expectedPitch:OPENING_GAMEPLAY_T0.pitch,expectedForward:expectedForward.toArray(),expectedGameplayFov:OPENING_GAMEPLAY_T0.fov,fovErrorAtHandoff:frame>=131?Math.abs(camera.fov-OPENING_GAMEPLAY_T0.fov):null};
    }
  }
  return {opening,powerLever:lever.toArray(),powerReach:powerReach?{active:powerReach.active,error:powerReach.error,target:powerReach.target.toArray()}:null,powerOrigin:map.power.group?.position?.toArray?.()||null,chain:chainArcs?{visible:chainArcs.visible,segments:chainArcs.children.map((s,i)=>({i,visible:s.visible,children:s.children.map(c=>({visible:c.visible,position:c.position.toArray(),scale:c.scale.toArray()}))}))}:null,colliders:map.colliders};
}

function debugMotion(){
  const round=n=>Number((n||0).toFixed(6)),vec=o=>o.toArray().map(round);
  return {
    frame,
    proofFrame,
    actors:actors.map(({actor,mover})=>{const m=mover?.evaluate(proofFrame),snap=poseSnapshot(actor,actor.group.rotation.y,actor.current);return {visible:actor.group.visible,position:vec(actor.group.position),feet:snap.feet.map(vec),footPlantError:round(snap.footPlantError),yaw:round(actor.group.rotation.y),action:actor.current,speed:round(m?.speed),distance:round(m?.distance),phase:round(m?.phase),firing:!!actor.group.userData.directorFiring};}),
    zombies:zombies.map(({z,mover})=>{const m=mover?.evaluate(proofFrame),snap=poseSnapshot(z,z.group.rotation.y,z.current);return {visible:z.group.visible,position:vec(z.group.position),feet:snap.feet.map(vec),footPlantError:round(snap.footPlantError),yaw:round(z.group.rotation.y),action:z.current,speed:round(m?.speed),distance:round(m?.distance),phase:round(m?.phase)};}),
    dog:dog?{visible:dog.visible,position:vec(dog.position),yaw:round(dog.rotation.y),legs:(dog.userData.legs||[]).map(l=>round(l.mesh.rotation.z)),paws:(dog.userData.legChains||[]).map(c=>({position:vec(worldPoint(c.paw)),stance:!!c.paw.userData.directorStance}))}:null,
    validation:[...lastValidation],
  };
}

export {debugCast,debugScene,debugMotion};
