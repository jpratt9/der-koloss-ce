// Cinematic director: motion addressed by frame. Actor, zombie and hound paths,
// action beats, the opening camera track and the three-key camera rail.
import * as THREE from 'three';
import {FPS,clamp01} from './math.js';
import {OPENING_GAMEPLAY_T0,openingGameplayForward} from './opening.js';

function openingRoleLook(role,globalFrame){
  if(globalFrame<892||globalFrame>1250)return 0;
  const pulse=(start,end,amount)=>amount*Math.sin(Math.PI*clamp01((globalFrame-start)/Math.max(1,end-start)));
  if(role==='Rook')return pulse(900,1070,THREE.MathUtils.degToRad(23));
  if(role==='Morrow')return pulse(915,1030,THREE.MathUtils.degToRad(-22));
  if(role==='Vega')return pulse(930,1110,THREE.MathUtils.degToRad(25));
  return 0;
}

class DirectorMover{
  constructor(spec,duration,index=0){
    this.spec=spec;this.duration=duration;this.index=index;
    this.entry=spec.entryFrame??0;this.exit=spec.exitFrame??Math.max(this.entry+1,duration-1);
    this.stride=Math.max(.35,spec.stride||(spec.action==='Run'?1.55:1.08));
    this.phaseOffset=spec.phaseOffset??((index*0.271828+0.113)%1);
    if(spec.worldKeys?.length>=2){
      this.worldKeys=spec.worldKeys.map(([f,p])=>[Number(f),p.clone()]).sort((a,b)=>a[0]-b[0]);
      this.entry=this.worldKeys[0][0];this.exit=this.worldKeys.at(-1)[0];
      const derivatives=this.worldKeys.map(([,p],i)=>{
        const before=this.worldKeys[Math.max(0,i-1)],after=this.worldKeys[Math.min(this.worldKeys.length-1,i+1)];
        return after[1].clone().sub(before[1]).multiplyScalar(1/Math.max(1,after[0]-before[0]));
      });
      const samplePosition=captureFrame=>{
        if(captureFrame<=this.entry)return this.worldKeys[0][1].clone();
        if(captureFrame>=this.exit)return this.worldKeys.at(-1)[1].clone();
        let segment=0;while(segment<this.worldKeys.length-2&&captureFrame>this.worldKeys[segment+1][0])segment++;
        const [fa,a]=this.worldKeys[segment],[fb,b]=this.worldKeys[segment+1],span=Math.max(1,fb-fa),q=clamp01((captureFrame-fa)/span),q2=q*q,q3=q2*q;
        return a.clone().multiplyScalar(2*q3-3*q2+1)
          .addScaledVector(derivatives[segment],(q3-2*q2+q)*span)
          .addScaledVector(b,-2*q3+3*q2)
          .addScaledVector(derivatives[segment+1],(q3-q2)*span);
      };
      this.worldSamples=[];this.worldDistances=[0];
      let previous=samplePosition(this.entry);this.worldSamples.push(previous);
      for(let f=this.entry+1;f<=this.exit;f++){
        const position=samplePosition(f);this.worldDistances.push(this.worldDistances.at(-1)+position.distanceTo(previous));this.worldSamples.push(position);previous=position;
      }
      this.length=Math.max(.0001,this.worldDistances.at(-1));
      return;
    }
    const points=(spec.path?.length?spec.path:[spec.p,spec.to||spec.p]).map(p=>p.clone());
    this.curve=points.length>2?new THREE.CatmullRomCurve3(points,false,'centripetal'):
      new THREE.LineCurve3(points[0],points[points.length-1]);
    this.length=Math.max(.0001,this.curve.getLength());
    this.keys=(spec.speedKeys?.length?spec.speedKeys:[[0,0],[this.exit-this.entry,1]])
      .map(([f,p])=>[Number(f),clamp01(Number(p))]).sort((a,b)=>a[0]-b[0]);
    const slopes=[];for(let i=0;i<this.keys.length-1;i++)slopes.push((this.keys[i+1][1]-this.keys[i][1])/Math.max(1,this.keys[i+1][0]-this.keys[i][0]));
    this.tangents=this.keys.map((_,i)=>{
      if(i===0||i===this.keys.length-1)return 0;
      const a=slopes[i-1],b=slopes[i];return a<=0||b<=0?0:2*a*b/(a+b);
    });
  }
  progress(localFrame){
    if(localFrame<=this.keys[0][0])return this.keys[0][1];
    const last=this.keys[this.keys.length-1];if(localFrame>=last[0])return last[1];
    for(let i=0;i<this.keys.length-1;i++){
      const a=this.keys[i],b=this.keys[i+1];if(localFrame<=b[0]){
        const span=Math.max(1,b[0]-a[0]),q=clamp01((localFrame-a[0])/span),q2=q*q,q3=q2*q;
        // Monotone cubic Hermite interpolation keeps velocity continuous through
        // authored progress keys.  The previous per-segment smoothstep forced
        // velocity to zero at *every* key, creating visible lurches and foot slip.
        return (2*q3-3*q2+1)*a[1]+(q3-2*q2+q)*this.tangents[i]*span+(-2*q3+3*q2)*b[1]+(q3-q2)*this.tangents[i+1]*span;
      }
    }
    return last[1];
  }
  evaluate(captureFrame){
    if(this.worldKeys){
      const clamped=Math.max(this.entry,Math.min(this.exit,captureFrame|0)),i=clamped-this.entry;
      const position=this.worldSamples[i].clone(),previous=this.worldSamples[Math.max(0,i-1)],next=this.worldSamples[Math.min(this.worldSamples.length-1,i+1)];
      const tangent=next.clone().sub(previous);if(tangent.lengthSq()<1e-8)tangent.set(0,0,-1);else tangent.normalize();
      const prevDistance=this.worldDistances[Math.max(0,i-1)],nextDistance=this.worldDistances[Math.min(this.worldDistances.length-1,i+1)],distance=this.worldDistances[i],speed=Math.max(0,(nextDistance-prevDistance)*FPS*.5);
      return {position,tangent,distance,speed,u:distance/this.length,active:captureFrame>=this.entry&&captureFrame<=this.exit,local:captureFrame-this.entry,phase:this.phaseOffset+distance/this.stride};
    }
    const local=captureFrame-this.entry,u=this.progress(local),prev=this.progress(local-1),next=this.progress(local+1);
    const position=this.curve.getPointAt(u),tangent=this.curve.getTangentAt(clamp01(u)).normalize();
    const distance=u*this.length,speed=Math.max(0,(next-prev)*this.length*FPS*.5);
    const active=captureFrame>=this.entry&&captureFrame<=this.exit;
    return {position,tangent,distance,speed,u,active,local,phase:this.phaseOffset+distance/this.stride};
  }
  positionAtDistance(distance){
    const d=THREE.MathUtils.clamp(distance,0,this.length);
    if(!this.worldKeys)return this.curve.getPointAt(d/this.length);
    let hi=this.worldDistances.findIndex(value=>value>=d);if(hi<0)hi=this.worldDistances.length-1;
    const lo=Math.max(0,hi-1),span=Math.max(1e-6,this.worldDistances[hi]-this.worldDistances[lo]),q=(d-this.worldDistances[lo])/span;
    return this.worldSamples[lo].clone().lerp(this.worldSamples[hi],q);
  }
}

function actionAt(spec,localFrame,fallback){
  let action=fallback;
  for(const beat of spec.beats||[])if(localFrame>=beat.frame)action=beat.action||action;
  return action;
}

const ACTION_BLEND_FRAMES=14;
function actionTimeline(spec,localFrame,fallback){
  const beats=[{frame:-1e9,action:fallback},...(spec.beats||[])].sort((a,b)=>a.frame-b.frame);
  let index=0;for(let i=1;i<beats.length;i++)if(localFrame>=beats[i].frame)index=i;
  const current=beats[index],previous=beats[Math.max(0,index-1)],blend=index>0?clamp01((localFrame-current.frame)/ACTION_BLEND_FRAMES):1;
  return {action:current.action||fallback,previous:previous.action||fallback,blend,boundary:index>0?current.frame:null};
}

const openingCameraTrackCache=new WeakMap();
function openingCameraTrack(keys){
  let cached=openingCameraTrackCache.get(keys);if(cached)return cached;
  const sorted=keys.map(([f,p,target,lens])=>({f:Number(f),p:p.clone(),target:target.clone(),lens:Number(lens)})).sort((a,b)=>a.f-b.f);
  const derivative=(field,index)=>{
    if(index===sorted.length-1)return field==='lens'?0:new THREE.Vector3();
    const before=sorted[Math.max(0,index-1)],after=sorted[Math.min(sorted.length-1,index+1)],span=Math.max(1,after.f-before.f);
    return field==='lens'?(after.lens-before.lens)/span:after[field].clone().sub(before[field]).multiplyScalar(1/span);
  };
  const pVelocity=sorted.map((_,i)=>derivative('p',i)),targetVelocity=sorted.map((_,i)=>derivative('target',i)),lensVelocity=sorted.map((_,i)=>derivative('lens',i));
  const secondDerivative=(velocities,index)=>{
    const before=Math.max(0,index-1),after=Math.min(sorted.length-1,index+1),span=Math.max(1,sorted[after].f-sorted[before].f);
    return typeof velocities[index]==='number'?(velocities[after]-velocities[before])/span:velocities[after].clone().sub(velocities[before]).multiplyScalar(1/span);
  };
  const pAcceleration=sorted.map((_,i)=>secondDerivative(pVelocity,i)),targetAcceleration=sorted.map((_,i)=>secondDerivative(targetVelocity,i)),lensAcceleration=sorted.map((_,i)=>secondDerivative(lensVelocity,i));
  pAcceleration.at(-1).set(0,0,0);targetAcceleration.at(-1).set(0,0,0);lensAcceleration[lensAcceleration.length-1]=0;
  cached={keys:sorted,pVelocity,targetVelocity,lensVelocity,pAcceleration,targetAcceleration,lensAcceleration};
  openingCameraTrackCache.set(keys,cached);return cached;
}
function sampleOpeningCameraTrack(keys,globalFrame){
  const track=openingCameraTrack(keys),list=track.keys;
  if(globalFrame<=list[0].f)return {position:list[0].p.clone(),target:list[0].target.clone(),lens:list[0].lens};
  if(globalFrame>=list.at(-1).f)return {position:list.at(-1).p.clone(),target:list.at(-1).target.clone(),lens:list.at(-1).lens};
  let segment=0;while(segment<list.length-2&&globalFrame>list[segment+1].f)segment++;
  const a=list[segment],b=list[segment+1],span=Math.max(1,b.f-a.f),q=clamp01((globalFrame-a.f)/span),q2=q*q;
  // Quintic Hermite is the minimum-integrated-jerk trajectory for the authored
  // endpoint position/velocity/acceleration constraints. Adjacent segments use
  // the same derivative arrays at a shared key, so carried shot boundaries are
  // C2 rather than merely C1.
  const quintic=(p0,p1,v0,v1,a0,a1)=>{
    const c0=p0.clone?.()||p0,c1=v0.clone?.().multiplyScalar(span)??v0*span,c2=a0.clone?.().multiplyScalar(.5*span*span)??a0*.5*span*span;
    const arithmetic=typeof p0==='number';
    const D=arithmetic?p1-c0-c1-c2:p1.clone().sub(c0).sub(c1).sub(c2);
    const V=arithmetic?v1*span-c1-2*c2:v1.clone().multiplyScalar(span).sub(c1).addScaledVector(c2,-2);
    const A=arithmetic?a1*span*span-2*c2:a1.clone().multiplyScalar(span*span).addScaledVector(c2,-2);
    const c3=arithmetic?10*D-4*V+.5*A:D.clone().multiplyScalar(10).addScaledVector(V,-4).addScaledVector(A,.5);
    const c4=arithmetic?-15*D+7*V-A:D.clone().multiplyScalar(-15).addScaledVector(V,7).addScaledVector(A,-1);
    const c5=arithmetic?6*D-3*V+.5*A:D.clone().multiplyScalar(6).addScaledVector(V,-3).addScaledVector(A,.5);
    if(arithmetic)return c0+c1*q+c2*q2+c3*q2*q+c4*q2*q2+c5*q2*q2*q;
    return c0.clone().addScaledVector(c1,q).addScaledVector(c2,q2).addScaledVector(c3,q2*q).addScaledVector(c4,q2*q2).addScaledVector(c5,q2*q2*q);
  };
  return {
    position:quintic(a.p,b.p,track.pVelocity[segment],track.pVelocity[segment+1],track.pAcceleration[segment],track.pAcceleration[segment+1]),
    target:quintic(a.target,b.target,track.targetVelocity[segment],track.targetVelocity[segment+1],track.targetAcceleration[segment],track.targetAcceleration[segment+1]),
    lens:quintic(a.lens,b.lens,track.lensVelocity[segment],track.lensVelocity[segment+1],track.lensAcceleration[segment],track.lensAcceleration[segment+1]),
  };
}
function openingCameraWindowDistance(keys,start,end){
  let distance=0,previous=sampleOpeningCameraTrack(keys,start).position;
  for(let f=start+1;f<end;f++){const current=sampleOpeningCameraTrack(keys,f).position;distance+=current.distanceTo(previous);previous=current;}
  return distance;
}

function openingV2CameraPoseAt(activeShot,globalFrame){
  const pose=sampleOpeningCameraTrack(activeShot.openingCameraKeys,globalFrame);
  if(activeShot.shoulderHandoff&&globalFrame>=1381){
    const position=OPENING_GAMEPLAY_T0.eye.clone();
    return {position,target:position.clone().addScaledVector(openingGameplayForward(),10),lens:OPENING_GAMEPLAY_T0.fov};
  }
  return pose;
}

function openingCameraKinematics(activeShot,globalFrame){
  const lo=activeShot.globalStart,hi=activeShot.globalEnd-1,at=f=>openingV2CameraPoseAt(activeShot,THREE.MathUtils.clamp(f,lo,hi));
  const m3=at(globalFrame-3),m2=at(globalFrame-2),m1=at(globalFrame-1),c=at(globalFrame),p1=at(globalFrame+1),p2=at(globalFrame+2),p3=at(globalFrame+3);
  let velocity,acceleration,jerk;
  if(globalFrame<=lo){
    velocity=p1.position.clone().sub(c.position).multiplyScalar(FPS);
    acceleration=p2.position.clone().addScaledVector(p1.position,-2).add(c.position).multiplyScalar(FPS*FPS);
    jerk=p3.position.clone().addScaledVector(p2.position,-3).addScaledVector(p1.position,3).addScaledVector(c.position,-1).multiplyScalar(FPS*FPS*FPS);
  }else if(globalFrame>=hi){
    velocity=c.position.clone().sub(m1.position).multiplyScalar(FPS);
    acceleration=c.position.clone().addScaledVector(m1.position,-2).add(m2.position).multiplyScalar(FPS*FPS);
    jerk=c.position.clone().addScaledVector(m1.position,-3).addScaledVector(m2.position,3).addScaledVector(m3.position,-1).multiplyScalar(FPS*FPS*FPS);
  }else{
    velocity=p1.position.clone().sub(m1.position).multiplyScalar(FPS/2);
    acceleration=p1.position.clone().add(m1.position).addScaledVector(c.position,-2).multiplyScalar(FPS*FPS);
    jerk=p2.position.clone().addScaledVector(p1.position,-2).addScaledVector(m1.position,2).addScaledVector(m2.position,-1).multiplyScalar(FPS*FPS*FPS/2);
  }
  const forward=c.target.clone().sub(c.position).normalize(),yaw=Math.atan2(-forward.x,-forward.z),pitch=Math.asin(THREE.MathUtils.clamp(forward.y,-1,1));
  return {position:c.position,target:c.target,fov:c.lens,yaw,pitch,roll:0,velocity,acceleration,jerk,speed:velocity.length(),accelerationMagnitude:acceleration.length(),jerkMagnitude:jerk.length()};
}

function pointOnRail(points,t,index){
  const values=points.map(p=>p[index]);
  if(values.length===1)return values[0].clone?.()||values[0];
  if(index===2){const scaled=clamp01(t)*(values.length-1),segment=Math.min(values.length-2,Math.floor(scaled)),a=values[segment],b=values[segment+1],f=scaled-segment;return THREE.MathUtils.lerp(a,b,f);}
  const curve=new THREE.CatmullRomCurve3(values,false,'centripetal');return curve.getPoint(t);
}

export {openingRoleLook,DirectorMover,actionAt,ACTION_BLEND_FRAMES,actionTimeline,openingCameraWindowDistance,openingV2CameraPoseAt,openingCameraKinematics,pointOnRail};
