// Cinematic director: validation. The checks run on every frame: camera,
// foot contact, grips, paths, hound paws and the opening plates' contracts.
import * as THREE from 'three';
import {FPS,shortestAngle,worldPoint,quatDelta,planarDistance} from './math.js';
import {OPENING_GAMEPLAY_T0,openingGameplayForward} from './opening.js';
import {openingCameraWindowDistance,openingCameraKinematics} from './motion.js';
import {poseSnapshot} from './pose.js';
import {shot,camera,objectScreenRect,rectIntersectsCenter80} from './stage.js';
import {map,openingEnv} from './world.js';
import {actors,zombies,dog,powerReach} from './cast.js';

let validationHistory={frame:-2,actors:[],zombies:[],dog:null};

function validate(camPos,look,frame,proofFrame){
  const issues=[];
  const sequential=validationHistory.frame===frame-1;
  const nextHistory={frame,actors:[],zombies:[],dog:null,camera:null};
  for(const c of map.colliders){if(camPos.x>c.minX&&camPos.x<c.maxX&&camPos.z>c.minZ&&camPos.z<c.maxZ&&camPos.y>(c.y0||0)&&camPos.y<(c.y0||0)+(c.h||99)){issues.push('CAMERA_COLLIDER');break;}}
  for(const [ai,{actor,mover}] of actors.entries()){
    if(!actor.group.visible)continue;
    const fy=map.floorY(actor.group.position.x,actor.group.position.z,actor.group.position.y);
    if(Math.abs(actor.group.position.y-fy)>.03)issues.push('ACTOR_FOOT_CONTACT');
    if(mover){
      const m=mover.evaluate(proofFrame),past=mover.evaluate(proofFrame-10);
      if(m.active&&m.speed>.25&&!actor.current)issues.push('ACTOR_ANIMATION_INACTIVE');
      const authoredAimLead=shot.powerEvent&&ai===0&&frame>=88;
      // The OP10→OP11 handoff is a tactical backpedal: the squad keeps its
      // low-ready bearing on the paid-door/threat axis while making room for
      // Atlas's shoulder-to-eyes camera. It must not be misclassified as a
      // forward locomotion yaw error while the world path reverses beneath it.
      const authoredBackpedal=shot.openingPerformance==='squad'&&actors[ai].spec?.backpedalYaw!==undefined&&proofFrame>=1216;
      if(m.active&&m.local>12&&m.speed>.25&&!authoredAimLead&&!authoredBackpedal&&Math.abs(shortestAngle(actor.group.rotation.y,Math.atan2(m.tangent.x,m.tangent.z)))>THREE.MathUtils.degToRad(5))issues.push('ACTOR_PATH_YAW');
      if(m.active&&m.distance-past.distance>.10&&Math.abs(m.phase-past.phase)<.025)issues.push('ACTOR_LEG_PHASE_STATIC');
    }
    const rig=actor.papDirectorWeapon?.anchor.visible?actor.papDirectorWeapon:actor.directorWeapon;
    const reaching=!!actor.group.userData.powerReachActive;
    if(!reaching){
      if(!rig?.primaryChain||!rig?.supportChain)issues.push('WEAPON_ARM_CHAIN_MISSING');
      const meshVisible=rig?.anchor.visible&&rig.weaponMeshes?.some(m=>m.visible&&m.parent?.visible!==false);
      const box=meshVisible?new THREE.Box3().setFromObject(rig.gun):new THREE.Box3();
      if(!meshVisible||box.isEmpty())issues.push('WEAPON_NOT_VISIBLE');
      if(rig?.primaryGripFixed&&rig.primaryGrip.position.distanceTo(rig.primaryGripFixed)>.0001)issues.push('PRIMARY_GRIP_LOCATOR_MUTATED');
      if(rig?.supportGripFixed&&rig.supportGrip.position.distanceTo(rig.supportGripFixed)>.0001)issues.push('SUPPORT_GRIP_LOCATOR_MUTATED');
      if(rig?.primaryBone&&worldPoint(rig.primaryBone).distanceTo(worldPoint(rig.primaryGrip))>.08)issues.push('PRIMARY_GRIP');
      if(rig?.supportBone&&worldPoint(rig.supportBone).distanceTo(worldPoint(rig.supportGrip))>.08)issues.push('SUPPORT_GRIP');
      const torso=actor.bones?.Torso?worldPoint(actor.bones.Torso):actor.group.position;
      if(meshVisible&&box.getCenter(new THREE.Vector3()).distanceTo(torso)<.20)issues.push('WEAPON_BURIED_IN_TORSO');
      if(rig?.muzzleLocator&&worldPoint(rig.muzzleLocator).distanceTo(actor.group.position)<.48)issues.push('WEAPON_BURIED_IN_TORSO');
    }else if(powerReach?.active&&frame>=126&&frame<=146&&powerReach.error>.055)issues.push('POWER_HAND_ENDPOINT');
    const snap=poseSnapshot(actor,actor.group.rotation.y,actor.current);nextHistory.actors[ai]=snap;
    const prev=validationHistory.actors[ai];
    if(sequential&&prev){
      const m=mover?.evaluate(proofFrame);
      const stance=snap.plantedFootIndex,prevStance=prev.plantedFootIndex;
      if(snap.footPlantActive&&prev.footPlantActive&&m?.speed>.35&&stance>=0&&stance===prevStance&&planarDistance(snap.feet[stance],prev.feet[stance])>.045)issues.push('ACTOR_PLANTED_FOOT_DRIFT');
      if(snap.footPlantActive&&snap.footPlantError>.14)issues.push('ACTOR_FOOT_ENDPOINT');
      if(prev.action!==snap.action&&snap.bones.some((q,i)=>prev.bones[i]&&quatDelta(q,prev.bones[i])>1.3))issues.push('ACTOR_ACTION_BOUNDARY_POP');
      const yawVel=shortestAngle(prev.yaw,snap.yaw)*FPS,prevVel=prev.yawVel||0;snap.yawVel=yawVel;
      if(Math.abs(yawVel)>8||Math.abs((yawVel-prevVel)*FPS)>300)issues.push('ACTOR_YAW_DERIVATIVE');
    }
  }
  for(const [zi,{z,mover}] of zombies.entries()){
    if(!z.group.visible)continue;
    const fy=map.floorY(z.group.position.x,z.group.position.z,z.group.position.y);
    if(Math.abs(z.group.position.y-fy)>.03)issues.push('ZOMBIE_FOOT_CONTACT');
    if(mover){
      const m=mover.evaluate(proofFrame),past=mover.evaluate(proofFrame-10);
      if(m.active&&m.speed>.25&&!z.current)issues.push('ZOMBIE_ANIMATION_INACTIVE');
      if(m.active&&m.local>12&&m.speed>.25&&Math.abs(shortestAngle(z.group.rotation.y,Math.atan2(m.tangent.x,m.tangent.z)))>THREE.MathUtils.degToRad(5))issues.push('ZOMBIE_PATH_YAW');
      if(m.active&&m.distance-past.distance>.10&&Math.abs(m.phase-past.phase)<.025)issues.push('ZOMBIE_LEG_PHASE_STATIC');
    }
    const snap=poseSnapshot(z,z.group.rotation.y,z.current);nextHistory.zombies[zi]=snap;
    const prev=validationHistory.zombies[zi];
    if(sequential&&prev){
      const m=mover?.evaluate(proofFrame);
      const stance=snap.plantedFootIndex,prevStance=prev.plantedFootIndex;
      if(snap.footPlantActive&&prev.footPlantActive&&m?.speed>.35&&stance>=0&&stance===prevStance&&planarDistance(snap.feet[stance],prev.feet[stance])>.045)issues.push('ZOMBIE_PLANTED_FOOT_DRIFT');
      if(snap.footPlantActive&&snap.footPlantError>.14)issues.push('ZOMBIE_FOOT_ENDPOINT');
      if(prev.action!==snap.action&&snap.bones.some((q,i)=>prev.bones[i]&&quatDelta(q,prev.bones[i])>1.3))issues.push('ZOMBIE_ACTION_BOUNDARY_POP');
      const yawVel=shortestAngle(prev.yaw,snap.yaw)*FPS,prevVel=prev.yawVel||0;snap.yawVel=yawVel;
      if(Math.abs(yawVel)>8||Math.abs((yawVel-prevVel)*FPS)>300)issues.push('ZOMBIE_YAW_DERIVATIVE');
    }
  }
  if(dog?.visible){
    const mover=dog.userData.directorMover,m=mover?.evaluate(proofFrame),past=mover?.evaluate(proofFrame-10);if(m?.active&&m.distance-past.distance>.1&&Math.abs(m.phase-past.phase)<.025)issues.push('HOUND_LEG_PHASE_STATIC');
    const paws=(dog.userData.legChains||[]).map(c=>({position:worldPoint(c.paw),stance:!!c.paw.userData.directorStance}));
    nextHistory.dog={paws,yaw:dog.rotation.y,yawVel:0};
    if(dog.userData.directorRig&&paws.length!==4)issues.push('HOUND_CHAIN_MISSING');
    for(const p of paws){
      const floor=map.floorY(p.position.x,p.position.z,0);
      if(p.position.y<floor-.02||p.position.y>floor+(p.stance?.025:.38))issues.push('HOUND_PAW_FLOOR');
    }
    if(sequential&&validationHistory.dog){
      for(let i=0;i<paws.length;i++)if(paws[i].stance&&validationHistory.dog.paws[i]?.stance&&planarDistance(paws[i].position,validationHistory.dog.paws[i].position)>.045)issues.push('HOUND_PAW_DRIFT');
      const yawVel=shortestAngle(validationHistory.dog.yaw,dog.rotation.y)*FPS,prevVel=validationHistory.dog.yawVel||0;nextHistory.dog.yawVel=yawVel;
      if(Math.abs(yawVel)>8||Math.abs((yawVel-prevVel)*FPS)>300)issues.push('HOUND_YAW_DERIVATIVE');
    }
  }
  if(shot.openingPlate){
    const dFact=map.doors.find(d=>d.id==='d_fact'),dMainL=map.doors.find(d=>d.id==='d_mainL');
    if(map.power.on)issues.push('OPENING_POWER_ON');
    if(dFact?.open||dMainL?.open||dFact?.mesh.visible===false||dMainL?.mesh.visible===false)issues.push('OPENING_DOOR_STATE');
    if(dMainL?.cost!==750)issues.push('OPENING_DOOR_COST');
    if(map.teleporters.some(t=>t.linked))issues.push('OPENING_TELE_LINKED');
    if(shot.globalEnd-shot.globalStart!==shot.duration)issues.push('OPENING_DURATION_CONTRACT');
    if(shot.openingV2&&shot.openingCameraKeys){
      const distance=openingCameraWindowDistance(shot.openingCameraKeys,shot.globalStart,shot.globalEnd);
      if(distance+.001<(shot.openingMinCameraTravel||1.2))issues.push('OPENING_V2_CAMERA_TRAVEL');
      if(openingEnv?.papGroup?.visible)issues.push('OPENING_V2_PAP_PRESENT');
      const motion=openingCameraKinematics(shot,proofFrame),previous=validationHistory.camera;
      const speed=sequential&&previous?camPos.distanceTo(previous.position)*FPS:motion.speed,trough=speed<.02?(previous?.trough||0)+1:0;
      if(trough>6)issues.push('OPENING_V2_CAMERA_SPEED_TROUGH');
      if(Math.abs(motion.roll)>THREE.MathUtils.degToRad(.25))issues.push('OPENING_V2_CAMERA_ROLL');
      if(shot.openingV3){
        if(Math.abs(camera.fov-48)>.0001)issues.push('OPENING_V3_FOV_NOT_CONSTANT');
        if(openingEnv?.teleC?.linked||openingEnv?.teleC?.ringMat?.emissiveIntensity>.0301)issues.push('OPENING_V3_TELE_C_NOT_DORMANT');
        if(!openingEnv?.v3ChainPivot||!openingEnv?.v3SupportDust)issues.push('OPENING_V3_SUPPORT_BINDING');
      }
      if(shot.openingV4){
        if(Math.abs(camera.fov-48)>.0001)issues.push('OPENING_V4_FOV_NOT_CONSTANT');
        if(camera.position.y<1.3499||camera.position.y>2.2001)issues.push('OPENING_V4_EYE_HEIGHT');
        if(openingEnv?.teleC?.linked||openingEnv?.teleC?.ringMat?.emissiveIntensity>.0301)issues.push('OPENING_V4_TELE_C_NOT_DORMANT');
        if(!openingEnv?.v4ChainPivot||!openingEnv?.v4SupportDust)issues.push('OPENING_V4_SUPPORT_BINDING');
      }
      nextHistory.camera={position:camPos.clone(),velocity:motion.velocity.clone(),acceleration:motion.acceleration.clone(),trough};
      if(shot.openingPlate==='OP10V2')for(const {actor} of actors){const rect=objectScreenRect(actor.group);if(rect?.area>.20)issues.push('OPENING_V2_ACTOR_AREA_CAP');}
      if(shot.shoulderHandoff&&proofFrame>=1380){
        if(actors[0]?.actor.group.visible)issues.push('OPENING_V2_OWNING_AVATAR_VISIBLE');
        if(actors.some(({actor})=>rectIntersectsCenter80(objectScreenRect(actor.group))))issues.push('OPENING_V2_HANDOFF_CONTAMINATION');
      }
    }
    if(shot.openingPerformance==='factory'&&zombies.some(({z})=>z.group.visible&&(z.current==='Punch'||z.current==='Idle_Attack')))issues.push('OPENING_EMPTY_AIR_ATTACK');
    if(shot.openingPerformance==='squad'){
      for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)if(actors[i].actor.group.visible&&actors[j].actor.group.visible&&planarDistance(actors[i].actor.group.position,actors[j].actor.group.position)<1.2)issues.push('OPENING_SQUAD_SEPARATION');
    }
    const castRoots=[...actors.map(a=>a.actor.group),...zombies.map(z=>z.z.group)].filter(g=>g.visible);
    for(const root of castRoots){
      const c=map.colliders.find(c=>c.prop&&root.position.x>c.minX&&root.position.x<c.maxX&&root.position.z>c.minZ&&root.position.z<c.maxZ&&root.position.y>=c.y0&&root.position.y<c.y0+c.h);
      if(c){issues.push('OPENING_CAST_COLLIDER');break;}
    }
    if(shot.shoulderHandoff&&frame>=130&&actors[0]?.mover){
      const expectedEye=OPENING_GAMEPLAY_T0.eye,captureForward=openingGameplayForward(),cameraForward=new THREE.Vector3();camera.getWorldDirection(cameraForward);
      if(camPos.distanceTo(expectedEye)>.001)issues.push('OPENING_POV_EYE_MATCH');
      if(THREE.MathUtils.radToDeg(cameraForward.angleTo(captureForward))>.01)issues.push('OPENING_POV_AXIS_MATCH');
      const expectedFov=frame===130?72:OPENING_GAMEPLAY_T0.fov;
      if(Math.abs(camera.fov-expectedFov)>.01)issues.push('OPENING_POV_FOV_MATCH');
    }
  }
  if(camPos.distanceTo(look)<.35)issues.push('INVALID_FOCUS_DISTANCE');
  validationHistory=nextHistory;
  return [...new Set(issues)];
}

export {validate};
