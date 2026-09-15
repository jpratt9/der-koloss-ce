// Cinematic director: the page. The URL parameters and the shot they pick, the
// renderer, scene, camera and lights, and the screen-space helpers.
import * as THREE from 'three';
import {v} from './math.js';
import {SHOTS} from './shots.js';

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
const requestedShot = params.get('shot') || 'factoryWake';
const requestedWeapon = params.get('weapon') || 'm1911';
const initialFrame = Math.max(0, Number(params.get('frame') || 0) | 0);
const captureWidth=capture?Math.max(1,Number(params.get('width')||innerWidth)|0):innerWidth;
const captureHeight=capture?Math.max(1,Number(params.get('height')||innerHeight)|0):innerHeight;
const stillGate=capture&&params.get('stillGate')==='1';
if (capture) document.body.classList.add('capture');

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

export {capture,requestedShot,requestedWeapon,initialFrame,stillGate,shot,status,overlay,renderer,scene,camera,fill,rim,shotKey,projectWitness,objectScreenRect,rectOverlapRatio,rectIntersectsCenter80};
