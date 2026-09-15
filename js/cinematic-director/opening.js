// Cinematic director: the opening plates (Plans 003, 010, 012 and 014): camera
// keys, world-keyed casts, visual gates, and the functions that build each plate.
import {v} from './math.js';

// Exact decoded t0 receipt from the canonical openingDoorRun capture. OP11's
// occluded cut must land on this rendered frame, not merely the paper path key:
// the native player has already advanced 2.654 cm during its first substeps.
const OPENING_GAMEPLAY_T0={
  eye:v(-3.5582089920543263,1.62,22.274762731825927),
  yaw:0.35563588430076,
  pitch:-.018,
  fov:86,
};
const openingGameplayForward=()=>v(
  -Math.sin(OPENING_GAMEPLAY_T0.yaw)*Math.cos(OPENING_GAMEPLAY_T0.pitch),
  Math.sin(OPENING_GAMEPLAY_T0.pitch),
  -Math.cos(OPENING_GAMEPLAY_T0.yaw)*Math.cos(OPENING_GAMEPLAY_T0.pitch),
).normalize();

// Plan 003 opening plates are separate camera takes over two continuous,
// global-frame performances.  Every plate evaluates the same world-keyed cast
// at its proof frame, so a camera cut never respawns, rephases or re-poses an
// actor.  These definitions are capture-only because this module is loaded only
// by cinematic.html.
const openingPlate=(id,start,end,camera,performance='environment',extra={})=>({
  duration:end-start,globalStart:start,globalEnd:end,openingPlate:id,
  openingPerformance:performance,seedGroup:'openingProof',
  dependencies:['plan003_opening','power_off','doors_closed'],
  state:{power:false,mainDoor:false,tele:[]},camera,actors:[],zombies:[],...extra,
});
const OPENING_FACTORY_ZOMBIES=[
  {p:v(8.2,0,-55.0),worldKeys:[[330,v(8.2,0,-55.0)],[516,v(7.1,0,-54.0)],[554,v(6.2,0,-53.4)],[600,v(4.8,0,-51.8)],[636,v(3.8,0,-50.6)],[700,v(2.5,0,-49.4)],[794,v(.9,0,-48.3)]],entryFrame:330,exitFrame:794,action:'Run',stride:1.42,phaseOffset:.18},
  {p:v(-6.0,0,-50.0),worldKeys:[[330,v(-6.0,0,-50.0)],[516,v(-5.65,0,-49.65)],[636,v(-4.8,0,-48.8)],[794,v(-3.55,0,-47.65)]],entryFrame:330,exitFrame:794,action:'Walk',stride:1.05,phaseOffset:.61},
];
const OPENING_SQUAD_ACTORS=[
  {p:v(-1.8,0,25.1),worldKeys:[[794,v(-1.8,0,25.1)],[892,v(-2.5,0,23.9)],[1016,v(-3.2,0,22.6)],[1118,v(-4.10,0,21.25)],[1250,v(-4.55,0,20.05)],[1382,v(-3.55,0,22.30)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Walk',stride:1.42,phaseOffset:.23,role:'Atlas',backpedalYaw:-2.7828},
  {p:v(.6,0,24.6),worldKeys:[[794,v(.6,0,24.6)],[892,v(-.2,0,23.4)],[1016,v(-.8,0,22.7)],[1118,v(-1.45,0,21.85)],[1250,v(-2.05,0,20.85)],[1382,v(-1.15,0,22.85)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Walk',stride:1.38,phaseOffset:.49,role:'Rook',backpedalYaw:-2.6012},
  {p:v(2.9,0,25.2),worldKeys:[[794,v(2.9,0,25.2)],[892,v(2.0,0,23.9)],[1016,v(1.35,0,23.0)],[1118,v(.70,0,22.10)],[1250,v(.10,0,21.15)],[1382,v(1.10,0,22.75)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Walk',stride:1.40,phaseOffset:.76,role:'Morrow',backpedalYaw:-2.5783},
  {p:v(5.4,0,24.8),worldKeys:[[794,v(5.4,0,24.8)],[892,v(4.4,0,23.5)],[1016,v(3.55,0,22.6)],[1118,v(2.85,0,21.90)],[1250,v(2.35,0,20.90)],[1382,v(3.25,0,22.95)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Walk',stride:1.36,phaseOffset:.04,role:'Vega',backpedalYaw:-2.6779},
];

// Plan 010 / Plan 003 V2 is additive and has distinct capture IDs.  The V1
// plates above remain immutable diagnostic evidence.  OP04–06 and OP07–11 each
// share the same global-frame camera-key array so their editorial boundaries
// cannot restart easing or camera velocity.
const OPENING_V2_OP01_CAMERA=[
  [0,v(3.10,1.25,-53.10),v(.15,1.25,-56.45),50],
  [22,v(2.42,1.46,-53.30),v(.05,1.22,-56.38),49],
  [58,v(1.02,1.84,-53.02),v(-.08,1.16,-56.20),47],
  [89,v(-.52,2.05,-52.42),v(-.22,1.10,-55.98),45],
];
// OP01 V3 is an additive, single-plate recovery. The fixed lens prevents the
// lateral move from inheriting V2's push/zoom read; the changing camera/target
// keys are still sampled by the same C2 piecewise-quintic implementation.
const OPENING_V3_OP01_CAMERA=[
  [0,v(8.35,2.10,-51.75),v(-5.00,3.55,-60.00),48],
  [12,v(7.78,2.18,-51.02),v(-5.05,3.50,-60.15),48],
  [42,v(6.18,2.34,-50.42),v(-5.10,3.35,-60.42),48],
  [68,v(4.65,2.49,-50.16),v(-5.18,3.18,-60.70),48],
  [89,v(3.38,2.60,-50.20),v(-5.25,3.00,-61.00),48],
];
// Plan 014 V4 is a fresh, capture-only still-gate candidate. It stays west of
// Teleporter C on the factory floor, clear of the catwalk deck, and uses a
// constant 48-degree lens. The west-to-east rail supplies genuine lateral and
// depth translation while the fixed three-quarter look keeps the full dormant
// arch, pad, rear machinery and the shipped west hanging chain in one axis.
const OPENING_V4_OP01_CAMERA=[
  [0,v(-12.40,1.50,-55.50),v(-0.45,2.30,-58.10),48],
  [9,v(-11.90,1.52,-55.45),v(-0.46,2.30,-58.00),48],
  [34,v(-10.40,1.56,-54.40),v(-0.48,2.30,-58.25),48],
  [60,v(-8.90,1.61,-54.80),v(-0.51,2.24,-57.95),48],
  [89,v(-7.50,1.66,-55.50),v(-0.55,2.12,-57.60),48],
];
const OPENING_V2_OP02_CAMERA=[
  [90,v(-2.80,5.30,-45.60),v(-5.00,5.20,-48.00),46],
  [118,v(-3.50,5.15,-46.60),v(-5.20,5.30,-49.00),44],
  [158,v(-4.40,4.80,-47.80),v(-6.20,5.60,-51.00),42],
  [209,v(-5.60,4.25,-49.30),v(-7.00,5.20,-53.00),40],
];
const OPENING_V2_OP03_CAMERA=[
  [210,v(5.85,1.45,-33.65),v(-1.70,2.10,-42.00),50],
  [242,v(4.55,1.52,-35.15),v(-1.80,2.00,-42.00),47],
  [286,v(2.95,1.62,-37.00),v(-1.90,1.82,-42.00),44],
  [329,v(1.55,1.68,-38.55),v(-2.00,1.52,-42.00),42],
];
const OPENING_V2_FACTORY_CAMERA=[
  [330,v(-6.25,1.48,-44.35),v(6.00,.92,-54.10),46],
  [400,v(-5.15,1.40,-45.65),v(5.75,.88,-53.75),44],
  [458,v(-4.10,1.30,-46.55),v(5.50,.84,-53.30),42],
  [516,v(-3.05,1.18,-47.20),v(5.00,.82,-52.75),40],
  [576,v(-1.85,.98,-47.25),v(4.55,.78,-52.25),38],
  [636,v(-.55,.76,-47.15),v(4.00,.72,-51.65),37],
  [700,v(1.00,.66,-47.25),v(3.15,.68,-50.70),36],
  [760,v(2.45,.57,-47.55),v(2.05,.62,-49.25),35],
  [793,v(3.18,.52,-47.88),v(1.10,.59,-48.42),34],
];
const OPENING_V2_SQUAD_CAMERA=[
  [794,v(-.15,.34,26.15),v(-2.65,.48,22.85),36],
  [834,v(-.70,.52,25.75),v(-2.95,.70,22.35),38],
  [892,v(-1.20,1.02,25.15),v(-3.20,1.12,21.85),42],
  [948,v(-1.45,1.68,24.35),v(-3.55,1.35,21.10),44],
  [1016,v(-1.95,2.12,23.45),v(-4.15,1.42,20.25),45],
  [1068,v(-2.55,2.08,22.75),v(-5.05,1.38,19.05),44],
  [1118,v(-3.20,1.92,22.20),v(-6.20,1.30,17.70),43],
  [1188,v(-5.70,1.52,21.30),v(-7.30,1.25,15.75),42],
  [1250,v(-3.30,1.30,21.45),v(-6.55,1.28,16.65),43],
  [1320,v(-1.90,1.52,21.80),v(-5.20,1.38,17.30),47],
  [1380,v(-3.5582089920543263,1.62,22.274762731825927),v(-7.03951024,1.44000972,12.90202860),72],
];
const OPENING_V2_FACTORY_ZOMBIES=[
  {p:v(9.0,0,-59.2),worldKeys:[[330,v(9.0,0,-59.2)],[400,v(8.85,0,-58.35)],[458,v(8.15,0,-56.75)],[516,v(6.55,0,-54.45)],[576,v(5.35,0,-53.15)],[636,v(4.30,0,-51.95)],[700,v(3.25,0,-50.55)],[760,v(1.95,0,-49.15)],[794,v(.80,0,-48.20)]],entryFrame:330,exitFrame:794,action:'Run',stride:1.42,phaseOffset:.18},
  {p:v(-7.2,0,-57.8),worldKeys:[[330,v(-7.2,0,-57.8)],[458,v(-6.75,0,-56.90)],[576,v(-6.10,0,-55.65)],[700,v(-5.20,0,-54.10)],[794,v(-4.45,0,-52.80)]],entryFrame:330,exitFrame:794,action:'Walk',stride:1.05,phaseOffset:.61},
];
const OPENING_V2_SQUAD_ACTORS=[
  {p:v(-2.0,0,25.9),worldKeys:[[794,v(-2.0,0,25.9)],[892,v(-2.65,0,24.25)],[1016,v(-3.55,0,22.45)],[1118,v(-4.55,0,20.40)],[1250,v(-5.25,0,18.55)],[1382,v(-3.55,0,22.30)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.58,phaseOffset:.23,role:'Atlas',backpedalYaw:-2.7828},
  {p:v(.3,0,26.5),worldKeys:[[794,v(.3,0,26.5)],[892,v(-.45,0,24.75)],[1016,v(-1.45,0,23.10)],[1118,v(-2.40,0,21.30)],[1250,v(-3.15,0,19.55)],[1382,v(-1.15,0,22.85)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.54,phaseOffset:.49,role:'Rook',backpedalYaw:-2.6012},
  {p:v(2.75,0,25.55),worldKeys:[[794,v(2.75,0,25.55)],[892,v(1.80,0,24.05)],[1016,v(.75,0,22.45)],[1118,v(-.15,0,20.70)],[1250,v(-.95,0,19.10)],[1382,v(1.10,0,22.75)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.56,phaseOffset:.76,role:'Morrow',backpedalYaw:-2.5783},
  {p:v(5.15,0,26.25),worldKeys:[[794,v(5.15,0,26.25)],[892,v(4.15,0,24.55)],[1016,v(3.05,0,22.95)],[1118,v(2.05,0,21.20)],[1250,v(1.10,0,19.60)],[1382,v(3.25,0,22.95)]],entryFrame:794,exitFrame:1382,yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.52,phaseOffset:.04,role:'Vega',backpedalYaw:-2.6779},
];
const OPENING_V2_VISUAL_GATES={
  OP01:{subject:{name:'dormant Teleporter-C arch',kind:'world',p:v(0,1.65,-56.8),height:3.2,revealFrame:18},witnesses:{near:[{name:'Tele-C right upright',p:v(1.5,1.6,-56.8)}],mid:[{name:'Tele-C cold ring',p:v(0,.14,-56)}],far:[{name:'factory back wall',p:v(0,2.8,-62)}]}},
  OP02:{subject:{name:'factory chain and hook',kind:'world',p:v(-5,5.55,-48),height:1.8,revealFrame:100},witnesses:{near:[{name:'moving hook',p:v(-5,5.32,-48)},{name:'near chain span',p:v(-5,5.7,-48.5)},{name:'west riser near beam',p:v(-6.1,4.8,-50.5)}],mid:[{name:'west practical',p:v(-7,6.1,-52)},{name:'west riser face',p:v(-6.2,4.5,-52)}],far:[{name:'factory west back wall',p:v(-7,3,-62)},{name:'far west wall seam',p:v(-7,5,-57)}]}},
  OP03:{subject:{name:'closed factory door',kind:'world',p:v(-2,1.5,-42),height:3,revealFrame:230},witnesses:{near:[{name:'courtyard post edge',p:v(4.6,1.5,-38.2)},{name:'courtyard barrel edge',p:v(2.8,.8,-39.1)},{name:'near facade return',p:v(.2,1.3,-40.2)}],mid:[{name:'closed d_fact',p:v(-2,1.5,-42)}],far:[{name:'Waffenfabrik facade',p:v(-2,3.25,-42.15)}]}},
  OP04:{subject:{name:'runner shadow then partial profile',kind:'actor',actorIndex:0,height:1.8,revealFrame:458},witnesses:{near:[{name:'factory entry post',p:v(-4.1,1.8,-46.7)},{name:'near factory lane post',p:v(-1.8,1.25,-48.3)}],mid:[{name:'east riser',p:v(6,2.4,-54)}],far:[{name:'factory rear wall',p:v(6,3,-62)}]}},
  OP05:{subject:{name:'side-profile factory runner',kind:'actor',actorIndex:0,height:1.8,revealFrame:555},witnesses:{near:[{name:'factory wipe post',p:v(-1.0,1.8,-47.7)},{name:'near runner lane edge',p:v(1.2,1,-49.0)}],mid:[{name:'east riser light pool',p:v(6,.4,-54)}],far:[{name:'factory rear wall',p:v(4,3,-62)}]}},
  OP06:{subject:{name:'runner planted side gait',kind:'actor',actorIndex:0,height:1.8,revealFrame:636},witnesses:{near:[{name:'runner-side rail',p:v(2.4,.65,-48.2)}],mid:[{name:'runner crossing lane',p:v(3.1,.8,-50.1)},{name:'west counter-walker lane',p:v(-4.8,1,-53.4)}],far:[{name:'factory rear wall',p:v(0,3,-62)},{name:'runner far-axis wall',p:v(3,1.8,-55)}]}},
  OP07:{subject:{name:'four moving hero boots',kind:'actors',height:.55,revealFrame:794},witnesses:{near:[{name:'Atlas lead boot lane',p:v(-2,.25,24.9)},{name:'Rook near boot lane',p:v(0,.25,25.2)},{name:'low moving boot track',p:v(-1,.48,24.3)},{name:'mainframe approach edge',p:v(-2,1,23.8)}],mid:[{name:'moving squad shin lane',p:v(-2.6,.65,22.8)},{name:'mainframe approach lane',p:v(-1,.65,23.5)}],far:[{name:'closed 750-point d_mainL',p:v(-8,1.5,14)}]}},
  OP08:{subject:{name:'four-person front-quarter echelon',kind:'actors',height:1.8,revealFrame:912},witnesses:{near:[{name:'mainframe near step',p:v(-2,.45,20.4)}],mid:[{name:'Atlas torso lane',p:v(-3.2,1.1,22)},{name:'Rook torso lane',p:v(-1,1.1,23)}],far:[{name:'closed 750-point d_mainL',p:v(-8,1.5,14)}]}},
  OP09:{subject:{name:'Atlas objective acquisition',kind:'actor',actorIndex:0,height:1.8,revealFrame:1024},witnesses:{near:[{name:'mainframe step rail',p:v(-3,.7,20.4)},{name:'near squad shoulder lane',p:v(-3.1,1.1,22.1)},{name:'Atlas near quarter',p:v(-3.2,1.8,22)},{name:'objective-track near post',p:v(-4.2,1.5,20.2)}],mid:[{name:'Atlas lead lane',p:v(-4,1,20)}],far:[{name:'closed 750-point d_mainL',p:v(-8,1.5,14)}]}},
  OP10:{subject:{name:'squad parallel run and closed door',kind:'actors',height:1.8,revealFrame:1118},witnesses:{near:[{name:'Atlas near run lane',p:v(-4.7,1.1,20.2)},{name:'Rook near run lane',p:v(-2.6,1.1,21)},{name:'near tracking rail west',p:v(-6,1.45,19.5)},{name:'near tracking rail return',p:v(-4,1.4,20.5)}],mid:[{name:'moving squad objective lane',p:v(-5.8,1.2,17.5)},{name:'mainframe door approach',p:v(-6.8,1.3,16)}],far:[{name:'closed 750-point d_mainL',p:v(-8,1.5,14)}]},doorReadableMinFrames:48,actorAreaMax:.20},
  OP11:{subject:{name:'Atlas shoulder-to-owning-eye takeover',kind:'actor',actorIndex:0,height:1.8,revealFrame:1250},witnesses:{near:[{name:'Atlas shoulder lane',p:v(-4.5,1.6,20)}],mid:[{name:'squad exit lane',p:v(-5,1.2,18)}],far:[{name:'closed 750-point d_mainL',p:v(-8,1.5,14)}]},centerContaminationMax:0,lastCleanFrames:[1380,1381]},
};
const OPENING_V3_OP01_VISUAL_GATE={
  subject:{name:'dormant Teleporter-C arch and C marker',kind:'world',p:v(0,1.95,-56.8),height:3.9,revealFrame:12},
  witnesses:{
    near:[
      {name:'catwalk support wipe',p:v(8,1.55,-52)},
      {name:'catwalk south deck edge x8',p:v(8,3.04,-50.9)},
      {name:'catwalk south deck edge x6',p:v(6,3.04,-50.9)},
      {name:'catwalk south deck edge x4',p:v(4,3.04,-50.9)},
      {name:'catwalk south deck edge x2',p:v(2,3.04,-50.9)},
    ],
    mid:[
      {name:'Tele-C C marker',p:v(0,3.9,-56.8)},
      {name:'Tele-C arch center',p:v(0,1.95,-56.8)},
      {name:'Tele-C dormant pad',p:v(0,.14,-56)},
      {name:'Tele-C overhead chain hook',p:v(-2,5.72,-56)},
    ],
    far:[
      {name:'factory rear machine',p:v(0,1.4,-58)},
      {name:'factory rear brick volume',p:v(-2,2.5,-61.8)},
    ],
  },
  constantFov:48,minCameraTravel:4.8,staticFloorCeilingSafetyMax:.235,
  decodedFloorCeilingMax:.25,occluderAreaMax:.20,wipeFrames:[0,11],
  nearFarParallaxRatioMin:3,midFarParallaxRatioMin:1.5,
  teleCEmissiveMax:.03,environmentBeat:{supportFrame:52,dustStartFrame:54,dustEndFrame:65},
};
const OPENING_V4_OP01_VISUAL_GATE={
  subject:{name:'complete dormant Teleporter-C geography',kind:'world',p:v(0,1.95,-56.65),height:3.9,revealFrame:9},
  witnesses:{
    near:[
      {name:'west wall vertical pipe wipe',p:v(-13.6,2.35,-56)},
      {name:'foreground east chain hook',p:v(7,5.02,-58)},
      {name:'foreground east chain span',p:v(7,6.05,-58)},
    ],
    mid:[
      {name:'Tele-C C marker',p:v(0,3.9,-56.8)},
      {name:'Tele-C left arch foot',p:v(-1.5,0,-56.8)},
      {name:'Tele-C right arch foot',p:v(1.5,0,-56.8)},
      {name:'Tele-C dormant pad center',p:v(0,.14,-56)},
    ],
    far:[
      {name:'rear factory machine',p:v(6,1.4,-54)},
      {name:'east factory brick volume',p:v(13.8,2.5,-58)},
      {name:'south factory door axis',p:v(-2,1.5,-42)},
    ],
  },
  constantFov:48,eyeHeight:[1.35,2.20],minLateralTranslation:3.5,minDepthChange:1,
  minCameraTravel:4.8,maxCameraTravel:7,actionSafe:.10,padVisibleMin:.80,
  staticFloorMax:.22,staticCeilingMax:.18,decodedOccluderAreaMax:.14,
  continuousBlackBandWidthMax:.45,wipeFrames:[0,9],teleCEmissiveMax:.03,
  environmentBeat:{supportFrame:52,dustStartFrame:54,dustEndFrame:65},
};
const openingV2Plate=(id,start,end,cameraKeys,performance='environment',extra={})=>openingPlate(
  `${id}V2`,start,end,[[cameraKeys[0][1],cameraKeys[0][2],cameraKeys[0][3]],[cameraKeys.at(-1)[1],cameraKeys.at(-1)[2],cameraKeys.at(-1)[3]]],performance,
  {openingV2:true,openingCameraKeys:cameraKeys,openingVisualGate:OPENING_V2_VISUAL_GATES[id],dependencies:['plan010_opening_v2','power_off','doors_closed'],...extra},
);
const openingV3Plate=(id,start,end,cameraKeys,performance='environment',extra={})=>openingPlate(
  `${id}V3`,start,end,[[cameraKeys[0][1],cameraKeys[0][2],cameraKeys[0][3]],[cameraKeys.at(-1)[1],cameraKeys.at(-1)[2],cameraKeys.at(-1)[3]]],performance,
  {openingV2:true,openingV3:true,openingCameraKeys:cameraKeys,openingVisualGate:OPENING_V3_OP01_VISUAL_GATE,dependencies:['plan012_opening_op01_v3','power_off','doors_closed','teleporters_unlinked'],...extra},
);
const openingV4Plate=(id,start,end,cameraKeys,performance='environment',extra={})=>openingPlate(
  `${id}V4`,start,end,[[cameraKeys[0][1],cameraKeys[0][2],cameraKeys[0][3]],[cameraKeys.at(-1)[1],cameraKeys.at(-1)[2],cameraKeys.at(-1)[3]]],performance,
  {openingV2:true,openingV4:true,openingCameraKeys:cameraKeys,openingVisualGate:OPENING_V4_OP01_VISUAL_GATE,dependencies:['plan014_opening_op01_v4_still_gate','power_off','doors_closed','teleporters_unlinked'],...extra},
);

export {OPENING_GAMEPLAY_T0,openingGameplayForward,openingPlate,OPENING_FACTORY_ZOMBIES,OPENING_SQUAD_ACTORS,OPENING_V2_OP01_CAMERA,OPENING_V3_OP01_CAMERA,OPENING_V4_OP01_CAMERA,OPENING_V2_OP02_CAMERA,OPENING_V2_OP03_CAMERA,OPENING_V2_FACTORY_CAMERA,OPENING_V2_SQUAD_CAMERA,OPENING_V2_FACTORY_ZOMBIES,OPENING_V2_SQUAD_ACTORS,openingV2Plate,openingV3Plate,openingV4Plate};
