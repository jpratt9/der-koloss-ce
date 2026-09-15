// Additive, isolated trailer capture runtime. This module is loaded only by
// cinematic.html; it never touches normal gameplay, networking, saves, or input.
import * as THREE from 'three';
import {assets} from './assets.js';
import {buildMap} from './map.js';
import {SoldierVisual} from './player.js';
import {ZombieVisual, createZombieModel, zombiePoseForState, applyHellhoundPose, ZSTATES} from './zombies.js';
import {buildViewmodel,WeaponRig,getStats} from './weapons.js';
import {FPS,v,clamp01,shortestAngle,blendAngle,worldPoint,worldQuat,quatDelta,planarDistance} from './cinematic-director/math.js';
import {OPENING_GAMEPLAY_T0,openingGameplayForward} from './cinematic-director/opening.js';
import {SHOTS} from './cinematic-director/shots.js';

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
const requestedShot = params.get('shot') || 'factoryWake';
const requestedWeapon = params.get('weapon') || 'm1911';
const initialFrame = Math.max(0, Number(params.get('frame') || 0) | 0);
const captureWidth=capture?Math.max(1,Number(params.get('width')||innerWidth)|0):innerWidth;
const captureHeight=capture?Math.max(1,Number(params.get('height')||innerHeight)|0):innerHeight;
const stillGate=capture&&params.get('stillGate')==='1';
if (capture) document.body.classList.add('capture');

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seedForShot(name){
  let h=2166136261>>>0;
  for(let i=0;i<name.length;i++){h^=name.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h^0x8ec7a5d3)>>>0;
}

const shot = SHOTS[requestedShot] || SHOTS.factoryWake;
const canvas = document.querySelector('#cinematic-canvas');
const status = document.querySelector('#director-status');
const overlay = document.querySelector('#director-overlay');
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:capture});
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio,2));
renderer.setSize(captureWidth,captureHeight,false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02050a);
scene.fog = new THREE.FogExp2(0x07101b,0.012);
const camera = new THREE.PerspectiveCamera(42,captureWidth/captureHeight,.05,180);
scene.add(camera);
const fill = new THREE.HemisphereLight(0x759bc8,0x17110c,.58); scene.add(fill);
const rim = new THREE.DirectionalLight(0x8ab8e7,3.2); rim.position.set(-15,28,8); rim.castShadow=true; scene.add(rim);
const shotKey = new THREE.PointLight(0x91b9e8,18,24,1.7); shotKey.position.copy(shot.camera[1][1]).add(v(0,3,2)); scene.add(shotKey);

let map;
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
let mapPracticalLamps=[];
let openingEnv=null;
const combatTracers=[];
let papDiamondEquipped=false;
let papKnucklesStarted=false;
let frame=initialFrame;
let proofFrame=(shot.globalStart??0)+initialFrame;
let ready=false;
let lastValidation=[];
let lastMotionDiagnostics=[];
let validationHistory={frame:-2,actors:[],zombies:[],dog:null};

function bindOpeningEnvironment(){
  if(!shot.openingPlate)return;
  map.group.updateMatrixWorld(true);
  const near=(object,x,y,z,epsilon=.08)=>Math.abs(object.position.x-x)<epsilon&&Math.abs(object.position.y-y)<epsilon&&Math.abs(object.position.z-z)<epsilon;
  const westLamp=mapPracticalLamps.find(l=>near(l,-7,6.1,-52,.16));
  const eastLamp=mapPracticalLamps.find(l=>near(l,7,6.1,-52,.16));
  const dust=map.group.children.find(o=>o.isPoints&&o.geometry?.attributes?.position?.count===90);
  const chain=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='CylinderGeometry'&&near(o,-5,6.2,-48,.12));
  const hook=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='TorusGeometry'&&near(o,-5,5.32,-48,.14));
  let chainPivot=null;
  if(chain&&hook){chainPivot=new THREE.Group();chainPivot.position.set(-5,7,-48);map.group.add(chainPivot);chainPivot.attach(chain);chainPivot.attach(hook);}
  const v3Chain=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='CylinderGeometry'&&near(o,-2,6.4,-56,.12));
  const v3Hook=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='TorusGeometry'&&near(o,-2,5.72,-56,.14));
  let v3ChainPivot=null,v3SupportDust=null,v3SupportDustBase=null;
  if(shot.openingV3&&v3Chain&&v3Hook){
    v3ChainPivot=new THREE.Group();v3ChainPivot.position.set(-2,7,-56);map.group.add(v3ChainPivot);v3ChainPivot.attach(v3Chain);v3ChainPivot.attach(v3Hook);
    // Reuse the shipped skylight-dust material and deterministic factory-dust
    // language for a local support shake. This is capture-only atmosphere, not
    // replacement architecture or a proxy subject.
    v3SupportDustBase=new Float32Array([
      -.08,-.02,-.02, .05,.00,.01, -.02,-.04,.04, .10,-.01,-.04,
      -.12,.02,.02, .02,-.06,-.02, .13,.01,.03, -.05,-.08,-.05,
      .07,-.03,.06, -.10,-.05,.05, .00,-.10,.00, .11,-.07,-.02,
      -.04,-.12,.03, .04,-.14,-.04,
    ]);
    const supportDustGeometry=new THREE.BufferGeometry();supportDustGeometry.setAttribute('position',new THREE.BufferAttribute(v3SupportDustBase.slice(),3));
    const supportDustMaterial=dust?.material?.clone?.()||new THREE.PointsMaterial({color:0x9db4dd,size:.02,transparent:true,opacity:.55,sizeAttenuation:true});
    supportDustMaterial.size=Math.max(.035,supportDustMaterial.size||0);supportDustMaterial.opacity=.72;
    v3SupportDust=new THREE.Points(supportDustGeometry,supportDustMaterial);v3SupportDust.position.set(-2,6.82,-56);v3SupportDust.visible=false;map.group.add(v3SupportDust);
  }
  const v4Chain=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='CylinderGeometry'&&near(o,7,6.05,-58,.12));
  const v4Hook=map.group.children.find(o=>o.isMesh&&o.geometry?.type==='TorusGeometry'&&near(o,7,5.02,-58,.14));
  let v4ChainPivot=null,v4SupportDust=null,v4SupportDustBase=null,v4SubjectLight=null;
  if(shot.openingV4&&v4Chain&&v4Hook){
    v4ChainPivot=new THREE.Group();v4ChainPivot.position.set(7,7,-58);map.group.add(v4ChainPivot);v4ChainPivot.attach(v4Chain);v4ChainPivot.attach(v4Hook);
    v4SupportDustBase=new Float32Array([
      -.10,-.02,-.03, .06,.00,.02, -.03,-.04,.05, .12,-.01,-.05,
      -.14,.02,.03, .03,-.06,-.03, .15,.01,.04, -.06,-.08,-.06,
      .08,-.03,.07, -.12,-.05,.06, .00,-.10,.00, .13,-.07,-.03,
      -.05,-.12,.04, .05,-.14,-.05,
    ]);
    const supportDustGeometry=new THREE.BufferGeometry();supportDustGeometry.setAttribute('position',new THREE.BufferAttribute(v4SupportDustBase.slice(),3));
    const supportDustMaterial=dust?.material?.clone?.()||new THREE.PointsMaterial({color:0x9db4dd,size:.02,transparent:true,opacity:.55,sizeAttenuation:true});
    supportDustMaterial.size=Math.max(.045,supportDustMaterial.size||0);supportDustMaterial.opacity=.78;
    v4SupportDust=new THREE.Points(supportDustGeometry,supportDustMaterial);v4SupportDust.position.set(7,6.82,-58);v4SupportDust.visible=false;map.group.add(v4SupportDust);
    // A capture light motivated by the two shipped factory practicals lifts
    // the real metal arch and rear machine out of crushed black without adding
    // geometry or making the dormant ring read as powered.
    v4SubjectLight=new THREE.PointLight(0xa8bed6,24,14,1.8);v4SubjectLight.position.set(-1.2,3.1,-53.8);scene.add(v4SubjectLight);
  }
  openingEnv={
    westLamp,eastLamp,dust,dustBase:dust?.geometry?.attributes?.position?.array?.slice?.()||null,chainPivot,
    v3ChainPivot,v3SupportDust,v3SupportDustBase,v4ChainPivot,v4SupportDust,v4SupportDustBase,v4SubjectLight,
    teleC:map.teleporters.find(t=>t.id==='teleC'),
    dFact:map.doors.find(d=>d.id==='d_fact'),dMainL:map.doors.find(d=>d.id==='d_mainL'),papGroup:map.pap?.slot?.parent||null,
  };
}

function updateOpeningEnvironment(globalFrame){
  if(!openingEnv)return;
  map.power.on=false;
  for(const tele of map.teleporters){tele.linked=false;tele.ringMat.emissiveIntensity=tele===openingEnv.teleC?.15:.12;tele.ringMat.emissive.setHex(0x3366aa);}
  for(const door of [openingEnv.dFact,openingEnv.dMainL])if(door){door.open=false;door.animT=0;door.mesh.visible=true;door.mesh.position.y=1.5;}
  // V2 tells a locked -> power -> links -> PaP causal story. The physical PaP
  // prop is capture-hidden throughout this preactivation opening so OP07 cannot
  // leak even a peripheral sign/body pixel. Normal gameplay is untouched.
  if(openingEnv.papGroup)openingEnv.papGroup.visible=!shot.openingV2;
  if(openingEnv.chainPivot){const active=globalFrame>=90&&globalFrame<210,age=Math.max(0,globalFrame-90)/FPS;openingEnv.chainPivot.rotation.z=active?THREE.MathUtils.degToRad(1.8)*Math.sin(age*1.45)*Math.exp(-age*.12):0;}
  if(openingEnv.v3ChainPivot){
    const local=globalFrame-52,active=shot.openingV3&&local>=0&&globalFrame<90,age=Math.max(0,local)/FPS;
    openingEnv.v3ChainPivot.rotation.z=active?THREE.MathUtils.degToRad(5.2)*Math.sin(age*14)*Math.exp(-age*3):0;
    if(openingEnv.v3SupportDust&&openingEnv.v3SupportDustBase){
      const visible=shot.openingV3&&globalFrame>=54&&globalFrame<=65,arr=openingEnv.v3SupportDust.geometry.attributes.position.array,drop=Math.max(0,globalFrame-54);
      openingEnv.v3SupportDust.visible=visible;
      for(let i=0;i<arr.length/3;i++){
        arr[i*3]=openingEnv.v3SupportDustBase[i*3]+Math.sin(drop*.38+i*1.7)*.012;
        arr[i*3+1]=openingEnv.v3SupportDustBase[i*3+1]-.012*drop*drop*(.65+(i%4)*.11);
        arr[i*3+2]=openingEnv.v3SupportDustBase[i*3+2]+Math.cos(drop*.31+i)*.008;
      }
      openingEnv.v3SupportDust.material.opacity=visible?.72*(1-drop/18):0;
      openingEnv.v3SupportDust.geometry.attributes.position.needsUpdate=true;
    }
  }
  if(openingEnv.v4ChainPivot){
    const local=globalFrame-52,active=shot.openingV4&&local>=0&&globalFrame<90,age=Math.max(0,local)/FPS;
    openingEnv.v4ChainPivot.rotation.z=active?THREE.MathUtils.degToRad(5.2)*Math.cos(age*7)*Math.exp(-age*.8):0;
    if(openingEnv.v4SupportDust&&openingEnv.v4SupportDustBase){
      const visible=shot.openingV4&&globalFrame>=54&&globalFrame<=65,arr=openingEnv.v4SupportDust.geometry.attributes.position.array,drop=Math.max(0,globalFrame-54);
      openingEnv.v4SupportDust.visible=visible;
      for(let i=0;i<arr.length/3;i++){
        arr[i*3]=openingEnv.v4SupportDustBase[i*3]+Math.sin(drop*.38+i*1.7)*.015;
        arr[i*3+1]=openingEnv.v4SupportDustBase[i*3+1]-.013*drop*drop*(.65+(i%4)*.11);
        arr[i*3+2]=openingEnv.v4SupportDustBase[i*3+2]+Math.cos(drop*.31+i)*.010;
      }
      openingEnv.v4SupportDust.material.opacity=visible?.78*(1-drop/18):0;
      openingEnv.v4SupportDust.geometry.attributes.position.needsUpdate=true;
    }
  }
  if(openingEnv.dust&&openingEnv.dustBase){
    const arr=openingEnv.dust.geometry.attributes.position.array,time=globalFrame/FPS,span=6.65;
    for(let i=0;i<arr.length/3;i++){
      const y0=openingEnv.dustBase[i*3+1],wrapped=((y0-.15-time*.14)%span+span)%span;
      arr[i*3]=openingEnv.dustBase[i*3]+Math.sin(time*.4+i)*.045;arr[i*3+1]=.15+wrapped;arr[i*3+2]=openingEnv.dustBase[i*3+2];
    }
    openingEnv.dust.geometry.attributes.position.needsUpdate=true;
  }
  let west=5,east=5;
  if(globalFrame>=90&&globalFrame<210){
    east=1.8;const u=(globalFrame-146)/12,pulse=u<0||u>=1?0:(u<.24?u/.24:Math.pow(1-(u-.24)/.76,1.7));west=5+pulse*11;
  }else if(globalFrame>=210&&globalFrame<330){west=8;east=3;}
  else if(globalFrame>=330&&globalFrame<794){west=5.5;east=15.5;}
  if(openingEnv.westLamp)openingEnv.westLamp.intensity=west;
  if(openingEnv.eastLamp)openingEnv.eastLamp.intensity=east;
  const op1Lift=globalFrame>=72&&globalFrame<90?clamp01((globalFrame-72)/17)*.08:0;
  renderer.toneMappingExposure=1.14*(1+op1Lift);
  shotKey.intensity=globalFrame<90?7:(globalFrame<330?10:(globalFrame<794?14:17));
  shotKey.color.setHex(globalFrame<794?0x9eb9dc:0xc7d7ef);
}

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

function applyState(){
  map.power.on=!!shot.state.power;
  if(map.power.on){map.power.lever.rotation.x=.7; for(const p of map.perks)p.lamp.intensity=9;}
  for(const tp of map.teleporters){tp.linked=!!shot.state.tele?.includes(tp.id);tp.ringMat.emissiveIntensity=tp.linked?1.6:(map.power.on ? .7 : .12);}
  const mainDoor=map.doors.find(x=>x.id==='d_mainL'); if(mainDoor&&shot.state.mainDoor)map.openDoor(mainDoor);
}

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
function projectWitness(point){const ndc=point.clone().project(camera);return {ndc:ndc.toArray(),visible:ndc.z>=-1&&ndc.z<=1&&Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1};}
function objectScreenRect(object){
  if(!object?.visible)return null;
  const box=new THREE.Box3().setFromObject(object);if(box.isEmpty())return null;
  const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(v(x,y,z).project(camera));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.max(-1,Math.min(...xs)),maxX=Math.min(1,Math.max(...xs)),minY=Math.max(-1,Math.min(...ys)),maxY=Math.min(1,Math.max(...ys));
  if(minX>=maxX||minY>=maxY)return null;
  return {minX,maxX,minY,maxY,area:(maxX-minX)*(maxY-minY)/4,width:(maxX-minX)/2,height:(maxY-minY)/2};
}
function rectOverlapRatio(a,b){if(!a||!b)return 0;const w=Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)),h=Math.max(0,Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY));return w*h/Math.max(1e-6,Math.min(a.area,b.area)*4);}
function rectIntersectsCenter80(rect){return !!rect&&Math.min(rect.maxX,.8)>Math.max(rect.minX,-.8)&&Math.min(rect.maxY,.8)>Math.max(rect.minY,-.8);}
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

function validate(camPos,look){
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
  lastValidation=validate(position,target);
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
  lastValidation=validate(camera.position,new THREE.Vector3(target.x,target.y,target.z));
  renderFrame();
  return lastValidation;
}

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

async function init(){
  const originalRandom=Math.random;
  // Keep the shot seed installed through map *and cast* construction.  Zombie
  // proportions/tints and director-hound crack rotations are constructor-time
  // randomness, so restoring before buildCast made clean-page renders diverge.
  Math.random=mulberry32(seedForShot(shot.seedGroup||requestedShot));
  try{
    await assets.load();map=buildMap(scene);
    mapPracticalLamps=map.group.children.filter(o=>o.isPointLight);
    applyState();
    for(let i=0;i<180;i++)map.update(1/FPS,!!shot.state.power);
    bindOpeningEnvironment();
    buildCast();
  }finally{Math.random=originalRandom;}
  // Direct children are the shipped room practicals.  Keeping the references in
  // this isolated runtime lets the power insert show an actual map lamp waking.
  ready=true;
  window.__TRAILER__.ready=true;
  seek(initialFrame);
  if(!capture){let base=performance.now()-initialFrame/FPS*1000;const loop=(now)=>{seek(Math.floor((now-base)/1000*FPS)%shot.duration);requestAnimationFrame(loop);};requestAnimationFrame(loop);}
}

window.__TRAILER__={ready:false,fps:FPS,shot:requestedShot,weapon:requestedWeapon,manifest:SHOTS,validation:()=>lastValidation,seek,renderFrame,previewCamera,debugCast,debugScene,debugMotion};
if(stillGate){
  const save=document.createElement('button');save.type='button';save.textContent=`SAVE ${requestedShot} F${String(initialFrame).padStart(3,'0')} PNG`;
  Object.assign(save.style,{position:'fixed',left:'12px',top:'12px',zIndex:'20',padding:'10px 14px',font:'600 13px system-ui',color:'#eef6ff',background:'#132238',border:'1px solid #7da2c8',borderRadius:'6px'});
  save.addEventListener('click',()=>renderer.domElement.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`${requestedShot}-f${String(initialFrame).padStart(3,'0')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png'));
  document.body.appendChild(save);
}
addEventListener('resize',()=>{if(capture)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
init().catch((error)=>{console.error(error);status.textContent=`DIRECTOR FAILED\n${error.stack||error}`;overlay.className='bad';});
