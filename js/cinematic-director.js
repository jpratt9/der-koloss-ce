// Additive, isolated trailer capture runtime. This module is loaded only by
// cinematic.html; it never touches normal gameplay, networking, saves, or input.
// The code is in js/cinematic-director/. This file boots the page.
import {assets} from './assets.js';
import {FPS} from './cinematic-director/math.js';
import {SHOTS} from './cinematic-director/shots.js';
import {capture,requestedShot,requestedWeapon,initialFrame,stillGate,shot,status,overlay,renderer,camera} from './cinematic-director/stage.js';
import {map,buildWorld,applyState,bindOpeningEnvironment} from './cinematic-director/world.js';
import {buildCast} from './cinematic-director/cast.js';
import {lastValidation,seek,renderFrame,previewCamera} from './cinematic-director/playback.js';
import {debugCast,debugScene,debugMotion} from './cinematic-director/debug.js';

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

let ready=false;

async function init(){
  const originalRandom=Math.random;
  // Keep the shot seed installed through map *and cast* construction.  Zombie
  // proportions/tints and director-hound crack rotations are constructor-time
  // randomness, so restoring before buildCast made clean-page renders diverge.
  Math.random=mulberry32(seedForShot(shot.seedGroup||requestedShot));
  try{
    await assets.load();buildWorld();
    applyState();
    for(let i=0;i<180;i++)map.update(1/FPS,!!shot.state.power);
    bindOpeningEnvironment();
    buildCast();
  }finally{Math.random=originalRandom;}
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
