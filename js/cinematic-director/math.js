// Cinematic director: the capture frame rate, and the vector, angle and
// world-space helpers every part of the director shares.
import * as THREE from 'three';

const FPS = 60;
const v = (x,y,z) => new THREE.Vector3(x,y,z);

const clamp01=x=>THREE.MathUtils.clamp(x,0,1);
const shortestAngle=(a,b)=>{
  let d=(b-a)%(Math.PI*2);
  if(d>Math.PI)d-=Math.PI*2;
  if(d<-Math.PI)d+=Math.PI*2;
  return d;
};
const blendAngle=(a,b,t)=>a+shortestAngle(a,b)*clamp01(t);

function worldPoint(object){const p=new THREE.Vector3();object?.getWorldPosition?.(p);return p;}
function worldQuat(object){const q=new THREE.Quaternion();object?.getWorldQuaternion?.(q);return q;}
function quatDelta(a,b){return 2*Math.acos(THREE.MathUtils.clamp(Math.abs(a.dot(b)),-1,1));}
function planarDistance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}

export {FPS,v,clamp01,shortestAngle,blendAngle,worldPoint,worldQuat,quatDelta,planarDistance};
