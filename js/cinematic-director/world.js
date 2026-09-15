// Cinematic director: the world. The shipped map, the world state a shot asks
// for, and the opening plates' capture-only dressing and lighting.
import * as THREE from 'three';
import {buildMap} from '../map.js';
import {FPS,clamp01} from './math.js';
import {shot,renderer,scene,shotKey} from './stage.js';

let map;
let mapPracticalLamps=[];
let openingEnv=null;

function buildWorld(){
  map=buildMap(scene);
  // Direct children are the shipped room practicals.  Keeping the references in
  // this isolated runtime lets the power insert show an actual map lamp waking.
  mapPracticalLamps=map.group.children.filter(o=>o.isPointLight);
}

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

function applyState(){
  map.power.on=!!shot.state.power;
  if(map.power.on){map.power.lever.rotation.x=.7; for(const p of map.perks)p.lamp.intensity=9;}
  for(const tp of map.teleporters){tp.linked=!!shot.state.tele?.includes(tp.id);tp.ringMat.emissiveIntensity=tp.linked?1.6:(map.power.on ? .7 : .12);}
  const mainDoor=map.doors.find(x=>x.id==='d_mainL'); if(mainDoor&&shot.state.mainDoor)map.openDoor(mainDoor);
}

export {map,mapPracticalLamps,openingEnv,buildWorld,bindOpeningEnvironment,updateOpeningEnvironment,applyState};
