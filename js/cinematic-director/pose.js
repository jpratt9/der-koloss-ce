// Cinematic director: deterministic poses. Clips sampled at an exact phase, bone
// chains, arm and leg IK, foot plants, and the pose snapshot validation compares.
import * as THREE from 'three';
import {clamp01,worldPoint,worldQuat} from './math.js';

function resetSkeleton(visual){
  visual.mixer.stopAllAction();
  visual.inner?.traverse?.(o=>{if(o.isSkinnedMesh)o.skeleton?.pose();});
  visual.current=null;
}

function configureAction(visual,action,phase,weight,{loop=true,timeScale=1}={}){
  const active=visual.actions?.[action];if(!active)return null;
  const duration=Math.max(.001,active.getClip().duration||1);
  active.reset();active.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce);active.clampWhenFinished=!loop;active.time=((phase%1)+1)%1*duration;
  active.enabled=true;active.setEffectiveWeight(weight);active.setEffectiveTimeScale(timeScale);active.play();
  return active;
}

function setDeterministicPose(visual,action,phase,{loop=true,timeScale=1}={}){
  resetSkeleton(visual);const active=configureAction(visual,action,phase,1,{loop,timeScale});if(!active)return false;
  visual.current=action;
  if(visual._tracked){visual._tracked.clear();for(const tr of active.getClip().tracks){const n=tr.name.split('.')[0];if(visual.bones?.[n])visual._tracked.add(n);}}
  visual.mixer.update(0);
  visual.update?.(0);
  return !!visual.current;
}

function setBlendedDeterministicPose(visual,from,to,fromPhase,toPhase,alpha,options={}){
  if(from===to||alpha>=.999)return setDeterministicPose(visual,to,toPhase,options.to);
  if(alpha<=.001)return setDeterministicPose(visual,from,fromPhase,options.from);
  resetSkeleton(visual);
  const a=configureAction(visual,from,fromPhase,1-alpha,options.from),b=configureAction(visual,to,toPhase,alpha,options.to);
  if(!a||!b)return setDeterministicPose(visual,to,toPhase,options.to);
  // Label the authored destination from the first blended frame.  The pose is
  // still a continuous weighted blend, but boundary diagnostics now compare the
  // true frame of the transition instead of a synthetic label flip at 50%.
  visual.current=to;
  if(visual._tracked){visual._tracked.clear();for(const act of [a,b])for(const tr of act.getClip().tracks){const n=tr.name.split('.')[0];if(visual.bones?.[n])visual._tracked.add(n);}}
  visual.mixer.update(0);visual.update?.(0);return true;
}

function findBone(actor,patterns){
  const values=Object.values(actor.bones||{});
  for(const pattern of patterns){const found=values.find(b=>pattern.test(b.name));if(found)return found;}
  return null;
}

function findArmChain(actor,side){
  const suffix=side==='R'?'(?:\\.R|_R|R$|Right)':'(?:\\.L|_L|L$|Left)';
  const hand=findBone(actor,[new RegExp(`^Hand${suffix}$`,'i'),new RegExp(`hand.*${side==='R'?'r|right':'l|left'}`,'i')]);
  const lowerArm=findBone(actor,[new RegExp(`^(?:LowerArm|ForeArm)${suffix}$`,'i'),new RegExp(`(?:lower|fore).*arm.*${side==='R'?'r|right':'l|left'}`,'i')]);
  const upperArm=findBone(actor,[new RegExp(`^UpperArm${suffix}$`,'i'),new RegExp(`upper.*arm.*${side==='R'?'r|right':'l|left'}`,'i')]);
  const shoulder=findBone(actor,[new RegExp(`^Shoulder${suffix}$`,'i'),new RegExp(`shoulder.*${side==='R'?'r|right':'l|left'}`,'i')]);
  let palm=hand;
  if(!palm&&lowerArm){
    actor.directorPalmEndpoints??={};palm=actor.directorPalmEndpoints[side];
    if(!palm){
      const fingerPattern=new RegExp(`^(?:Index1|Middle1|Pinky1|Thumb1)${suffix}$`,'i');
      const fingers=Object.values(actor.bones||{}).filter(b=>fingerPattern.test(b.name));
      if(fingers.length){
        actor.group.updateMatrixWorld(true);const center=new THREE.Vector3();for(const finger of fingers)center.add(worldPoint(finger));center.multiplyScalar(1/fingers.length);lowerArm.worldToLocal(center);
        palm=new THREE.Object3D();palm.name=`DirectorRenderedPalm${side}`;palm.position.copy(center);lowerArm.add(palm);actor.directorPalmEndpoints[side]=palm;
      }
    }
  }
  // The shipped Quaternius rig has fingers but no Hand bone.  Its LowerArm bone
  // exposes no explicit palm, so derive a fixed rendered-palm endpoint from the
  // average of its four real finger bases and solve the articulated chain to it.
  return palm&&lowerArm&&upperArm?{hand:palm,lower:lowerArm,upper:upperArm,root:shoulder||null,side}:
    lowerArm&&upperArm&&shoulder?{hand:lowerArm,lower:upperArm,upper:shoulder,side,endpointIsLowerArm:true}:null;
}

function findLegChain(visual,side){
  const suffix=side==='R'?'(?:\\.R|_R|R$|Right)':'(?:\\.L|_L|L$|Left)';
  const foot=findBone(visual,[new RegExp(`^Foot${suffix}$`,'i')]);
  const lower=findBone(visual,[new RegExp(`^LowerLeg${suffix}$`,'i')]);
  const upper=findBone(visual,[new RegExp(`^UpperLeg${suffix}$`,'i')]);
  if(!foot||!lower||!upper)return null;
  // FootL/FootR in this GLB are root-level IK targets, not descendants of the
  // rendered leg.  Create a marker at that target in LowerLeg local space so
  // validation and CCD measure the actual articulated endpoint.
  visual.group.updateMatrixWorld(true);const local=lower.worldToLocal(worldPoint(foot));
  const endpoint=new THREE.Object3D();endpoint.name=`DirectorRenderedFoot${side}`;endpoint.position.copy(local);lower.add(endpoint);
  return {hand:endpoint,sourceFoot:foot,lower,upper,side};
}

function rotateJointToward(joint,effector,target,strength=.82){
  const jp=new THREE.Vector3(),ep=new THREE.Vector3();joint.getWorldPosition(jp);effector.getWorldPosition(ep);
  const from=ep.sub(jp),to=target.clone().sub(jp);if(from.lengthSq()<1e-8||to.lengthSq()<1e-8)return;
  const delta=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
  const world=new THREE.Quaternion();joint.getWorldQuaternion(world);delta.multiply(world);
  const parentWorld=new THREE.Quaternion();joint.parent?.getWorldQuaternion(parentWorld);parentWorld.invert();
  const desiredLocal=parentWorld.multiply(delta);joint.quaternion.slerp(desiredLocal,clamp01(strength));
}

function solveArmIK(actor,chain,target,{iterations=4,strength=.86}={}){
  if(!chain)return Infinity;
  for(let i=0;i<iterations;i++){
    actor.group.updateMatrixWorld(true);rotateJointToward(chain.lower,chain.hand,target,strength);
    actor.group.updateMatrixWorld(true);rotateJointToward(chain.upper,chain.hand,target,strength*.88);
    if(chain.root){actor.group.updateMatrixWorld(true);rotateJointToward(chain.root,chain.hand,target,strength);}
  }
  actor.group.updateMatrixWorld(true);const p=new THREE.Vector3();chain.hand.getWorldPosition(p);return p.distanceTo(target);
}

function applyDeterministicFootPlant(visual,motion,mover,action,weight=1){
  if(!mover||motion.speed<.35)return;
  if(!visual.directorLegChains)visual.directorLegChains=[findLegChain(visual,'L'),findLegChain(visual,'R')];
  const frac=((motion.phase%1)+1)%1,slot=frac<.5?0:1,footIndex=slot===0?1:0,center=Math.floor(motion.phase)+(slot===0?.25:.75);
  if(Math.abs(frac-(slot===0?.25:.75))>.08)return;
  const distance=THREE.MathUtils.clamp((center-mover.phaseOffset)*mover.stride,0,mover.length),rootCenter=mover.positionAtDistance(distance);
  // Sample the shipped clip at the center of this stance, then transplant that
  // reachable local foot target onto the path position for the stance center.
  // This is frame-addressed (no prior-frame cache) and avoids asking the chain
  // to hit an arbitrary lateral point outside its anatomical reach.
  setDeterministicPose(visual,action,center,{loop:true});visual.group.updateMatrixWorld(true);
  const referenceLocal=visual.group.worldToLocal(worldPoint(visual.directorLegChains[footIndex].sourceFoot));
  setDeterministicPose(visual,action,motion.phase,{loop:true});visual.group.updateMatrixWorld(true);
  const target=visual.group.localToWorld(referenceLocal.clone()).add(rootCenter.clone().sub(motion.position));
  const error=solveArmIK(visual,visual.directorLegChains[footIndex],target,{iterations:16,strength:.98*clamp01(weight)});
  visual.group.userData.directorFootPlantActive=true;
  visual.group.userData.directorPlantedFootIndex=footIndex;
  visual.group.userData.directorFootPlantError=error;
}

function boneBySide(visual,kind,side){
  const suffix=side==='L'?'(?:\\.L|_L|L$|Left)':'(?:\\.R|_R|R$|Right)';
  return findBone(visual,[new RegExp(`^(?:${kind})${suffix}$`,'i'),new RegExp(`${kind}.*${side==='L'?'l|left':'r|right'}`,'i')]);
}
function poseSnapshot(visual,yaw,action){
  const feet=visual.directorLegChains?.every(Boolean)?visual.directorLegChains.map(c=>worldPoint(c.hand)):
    ['L','R'].map(s=>boneBySide(visual,'Foot|Toe|LowerLeg',s)).filter(Boolean).map(worldPoint);
  const bones=['L','R'].flatMap(s=>['UpperLeg','LowerLeg','UpperArm','LowerArm'].map(k=>boneBySide(visual,k,s))).filter(Boolean).map(worldQuat);
  return {feet,bones,yaw,action,footPlantActive:!!visual.group.userData.directorFootPlantActive,plantedFootIndex:visual.group.userData.directorPlantedFootIndex??-1,footPlantError:visual.group.userData.directorFootPlantError??Infinity};
}

function stanceFootIndex(phase){
  const p=((phase%1)+1)%1;
  if(p>=.20&&p<=.30)return 0;
  if(p>=.70&&p<=.80)return 1;
  return -1;
}
function contactFootIndex(feet){
  if(feet.length!==2)return -1;
  const i=feet[0].y<=feet[1].y?0:1;
  return Math.abs(feet[0].y-feet[1].y)>=.018?i:-1;
}

export {setBlendedDeterministicPose,findArmChain,solveArmIK,applyDeterministicFootPlant,poseSnapshot};
