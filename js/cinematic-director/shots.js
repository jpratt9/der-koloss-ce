// Cinematic director: the shot manifest. `?shot=` picks one of these shots, and
// each names its camera rail, cast, world state and dependencies.
import {v} from './math.js';
import {openingPlate,OPENING_FACTORY_ZOMBIES,OPENING_SQUAD_ACTORS,OPENING_V2_OP01_CAMERA,OPENING_V3_OP01_CAMERA,OPENING_V4_OP01_CAMERA,OPENING_V2_OP02_CAMERA,OPENING_V2_OP03_CAMERA,OPENING_V2_FACTORY_CAMERA,OPENING_V2_SQUAD_CAMERA,OPENING_V2_FACTORY_ZOMBIES,OPENING_V2_SQUAD_ACTORS,openingV2Plate,openingV3Plate,openingV4Plate} from './opening.js';

// Actor-free location plates for the standalone cinematic pack.  These shots
// are intentionally defined in the isolated director rather than the game:
// they cannot spawn a player, bot, zombie or hound and cannot mutate saves,
// networking, progression or normal input.  The real shipped map and machine
// props remain the only visible environment.
const cinematicPackShot=(camera,{duration=360,power=true,tele=[],pap=false,machine=null,boxLocation=0,room='map'}={})=>({
  duration,
  dependencies:['cinematic_pack_actor_free',room],
  state:{power,mainDoor:true,tele,pap},
  camera,
  actors:[],zombies:[],cinematicPack:true,machine,boxLocation,
});
const SHOTS = {
  openingOP01: openingPlate('OP01',0,90,[[v(1.30,.33,-55.20),v(.35,.15,-56),21],[v(1.30,.33,-55.20),v(.35,.15,-56),21]]),
  openingOP02: openingPlate('OP02',90,210,[[v(-2.60,4.75,-47.35),v(-5,5.55,-48),34],[v(-3.05,4.88,-47.70),v(-6.75,6.05,-51.8),38]]),
  openingOP03: openingPlate('OP03',210,330,[[v(4.80,1.55,-35),v(-2,2.65,-42),44],[v(3.70,1.72,-37.2),v(-2,2.45,-42),40]]),
  openingOP04: openingPlate('OP04',330,516,[[v(-1.25,1.22,-44.35),v(5.60,1.0,-53.25),42],[v(-.75,1.28,-45.45),v(6.10,.92,-53.60),36]],'factory',{zombies:OPENING_FACTORY_ZOMBIES}),
  openingOP05: openingPlate('OP05',516,636,[[v(-.75,1.28,-45.45),v(6.10,.92,-53.60),36],[v(-.58,1.32,-45.68),v(5.65,.98,-52.95),35]],'factory',{zombies:OPENING_FACTORY_ZOMBIES}),
  openingOP06: openingPlate('OP06',636,794,[[v(1.15,.38,-47.05),v(5.15,.62,-52.75),31],[v(.70,.46,-47.55),v(3.65,.72,-51.75),34]],'factory',{zombies:OPENING_FACTORY_ZOMBIES}),
  openingOP07: openingPlate('OP07',794,892,[[v(1.50,.34,25.70),v(1.50,.50,23.45),30],[v(1.50,.34,25.70),v(1.50,.50,23.45),30]],'squad',{actors:OPENING_SQUAD_ACTORS}),
  openingOP08: openingPlate('OP08',892,1016,[[v(4.30,1.05,25.55),v(.65,1.35,23.05),47],[v(3.45,2.55,24.15),v(-.75,1.72,21.65),40]],'squad',{actors:OPENING_SQUAD_ACTORS}),
  openingOP09: openingPlate('OP09',1016,1118,[[v(2.25,2.15,23.45),v(-3.10,1.75,21.15),39],[v(.40,2.10,22.40),v(-4.20,1.72,20.20),37]],'squad',{actors:OPENING_SQUAD_ACTORS}),
  openingOP10: openingPlate('OP10',1118,1250,[[v(2.20,.95,22.20),v(-7.75,1.50,14.10),41],[v(-.90,1.05,21.35),v(-7.90,1.48,14.05),38]],'squad',{actors:OPENING_SQUAD_ACTORS}),
  openingOP11: openingPlate('OP11',1250,1382,[[v(.10,2.32,21.55),v(-4.55,1.75,19.75),44],[v(-3.55,2.40,20.75),v(-7.75,1.55,14.10),58]],'squad',{actors:OPENING_SQUAD_ACTORS,shoulderHandoff:true}),
  openingOP01V2: openingV2Plate('OP01',0,90,OPENING_V2_OP01_CAMERA,'environment',{openingMinCameraTravel:3.6}),
  openingOP01V3: openingV3Plate('OP01',0,90,OPENING_V3_OP01_CAMERA,'environment',{openingMinCameraTravel:4.8}),
  openingOP01V4: openingV4Plate('OP01',0,90,OPENING_V4_OP01_CAMERA,'environment',{openingMinCameraTravel:4.8}),
  openingOP02V2: openingV2Plate('OP02',90,210,OPENING_V2_OP02_CAMERA,'environment',{openingMinCameraTravel:2.0}),
  openingOP03V2: openingV2Plate('OP03',210,330,OPENING_V2_OP03_CAMERA,'environment',{openingMinCameraTravel:3.5}),
  openingOP04V2: openingV2Plate('OP04',330,516,OPENING_V2_FACTORY_CAMERA,'factory',{zombies:OPENING_V2_FACTORY_ZOMBIES,openingMinCameraTravel:2.2,openingContinuousRail:'factory-threat'}),
  openingOP05V2: openingV2Plate('OP05',516,636,OPENING_V2_FACTORY_CAMERA,'factory',{zombies:OPENING_V2_FACTORY_ZOMBIES,openingMinCameraTravel:2.0,openingContinuousRail:'factory-threat'}),
  openingOP06V2: openingV2Plate('OP06',636,794,OPENING_V2_FACTORY_CAMERA,'factory',{zombies:OPENING_V2_FACTORY_ZOMBIES,openingMinCameraTravel:3.0,openingContinuousRail:'factory-threat'}),
  openingOP07V2: openingV2Plate('OP07',794,892,OPENING_V2_SQUAD_CAMERA,'squad',{actors:OPENING_V2_SQUAD_ACTORS,openingMinCameraTravel:1.4,openingContinuousRail:'squad-answer',excludePapFocal:true}),
  openingOP08V2: openingV2Plate('OP08',892,1016,OPENING_V2_SQUAD_CAMERA,'squad',{actors:OPENING_V2_SQUAD_ACTORS,openingMinCameraTravel:1.7,openingContinuousRail:'squad-answer'}),
  openingOP09V2: openingV2Plate('OP09',1016,1118,OPENING_V2_SQUAD_CAMERA,'squad',{actors:OPENING_V2_SQUAD_ACTORS,openingMinCameraTravel:1.1,openingContinuousRail:'squad-answer'}),
  openingOP10V2: openingV2Plate('OP10',1118,1250,OPENING_V2_SQUAD_CAMERA,'squad',{actors:OPENING_V2_SQUAD_ACTORS,openingMinCameraTravel:1.5,openingContinuousRail:'squad-answer'}),
  openingOP11V2: openingV2Plate('OP11',1250,1382,OPENING_V2_SQUAD_CAMERA,'squad',{actors:OPENING_V2_SQUAD_ACTORS,openingMinCameraTravel:3.0,openingContinuousRail:'squad-answer',shoulderHandoff:true}),
  armory: {
    duration: 180, dependencies: ['arsenal_roster_non_continuity'], state: {power:false}, armory:true,
    camera: [[v(1.55,.52,1.25),v(0,0,-.16),34],[v(1.38,.46,.88),v(0,0,-.18),31],[v(1.2,.42,.58),v(0,0,-.2),29]],
    actors: [], zombies: [],
  },
  factoryWake: {
    duration: 510, dependencies: ['facility_dormant'], state: {power:false},
    // One continuous visual sentence: begin almost on the blood trail, rise
    // beneath the catwalk, then reveal the dormant pad as three silhouettes
    // enter on separate lanes. The camera never crosses architecture and the
    // threat remains at a controlled distance from the lens.
    camera: [[v(-10.0,.62,-42.4),v(-6.4,.16,-48.2),56],[v(-9.0,1.82,-45.0),v(-2.0,1.00,-54.0),46],[v(-6.0,4.05,-47.0),v(0,1.10,-55.2),39]],
    actors: [], zombies: [
      {p:v(-5.4,0,-62.4),path:[v(-5.4,0,-62.4),v(-5.9,0,-59.1),v(-4.7,0,-56.4),v(-4.0,0,-53.6)],entryFrame:254,exitFrame:404,speedKeys:[[0,0],[18,.055],[118,.90],[136,.985],[150,1]],action:'Run',stride:1.42,beats:[{frame:0,action:'Run'},{frame:156,action:'Idle'}]},
      {p:v(.6,0,-63.0),path:[v(.6,0,-63.0),v(-.25,0,-60.6),v(.35,0,-57.7),v(-.15,0,-54.8)],entryFrame:206,exitFrame:494,speedKeys:[[0,0],[34,.045],[238,.91],[268,.985],[288,1]],action:'Walk',stride:1.05,beats:[{frame:0,action:'Walk'},{frame:296,action:'Idle'}]},
      {p:v(5.7,0,-62.1),path:[v(5.7,0,-62.1),v(5.0,0,-59.4),v(4.7,0,-56.8),v(3.8,0,-53.8)],entryFrame:226,exitFrame:374,speedKeys:[[0,0],[16,.05],[116,.90],[134,.985],[148,1]],action:'Run',stride:1.38,beats:[{frame:0,action:'Run'},{frame:154,action:'Idle'}]},
    ],
  },
  dossierThreat: {
    duration: 390, dependencies: ['facility_dormant','threat_confirmed'], state: {power:false},
    camera: [[v(6.8,1.35,-49.0),v(0,1.05,-54.5),52],[v(8.0,1.65,-52.0),v(-.5,1.05,-54.0),46],[v(7.2,2.05,-56.0),v(-1.0,1.02,-53.2),42]],
    actors: [], zombies: [
      {p:v(-4.5,0,-58.0),to:v(-1.5,0,-53.2),yaw:0,action:'Run'},
      {p:v(2.0,0,-59.5),to:v(1.2,0,-55.2),yaw:0,action:'Walk'},
    ],
  },
  spawnSquad: {
    duration: 360, dependencies: ['spawned'], state: {power:false,mainDoor:false},
    camera: [[v(0,1.72,-2.8),v(0,1.10,11.5),52],[v(-.8,1.95,-2.2),v(0,1.14,10.4),50],[v(.7,2.18,-1.7),v(0,1.18,9.4),48]],
    actors: [
      {p:v(-5.4,0,16.0),path:[v(-5.4,0,16.0),v(-5.0,0,12.7),v(-3.8,0,9.0)],entryFrame:92,exitFrame:196,speedKeys:[[0,0],[14,.055],[86,.93],[104,1]],yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.65,beats:[{frame:0,action:'Run'},{frame:86,action:'Walk'},{frame:104,action:'Idle'}]},
      {p:v(-1.0,0,14.0),path:[v(-1.0,0,14.0),v(-1.7,0,11.1),v(-.8,0,7.9)],entryFrame:126,exitFrame:220,speedKeys:[[0,0],[12,.055],[78,.93],[94,1]],yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.58,beats:[{frame:0,action:'Run'},{frame:78,action:'Walk'},{frame:94,action:'Idle'}]},
      {p:v(2.3,0,17.2),path:[v(2.3,0,17.2),v(1.4,0,13.5),v(1.5,0,9.5)],entryFrame:66,exitFrame:178,speedKeys:[[0,0],[14,.05],[94,.94],[112,1]],yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.70,beats:[{frame:0,action:'Run'},{frame:94,action:'Walk'},{frame:112,action:'Idle'}]},
      {p:v(5.2,0,13.0),path:[v(5.2,0,13.0),v(4.7,0,10.8),v(3.8,0,8.3)],entryFrame:150,exitFrame:234,speedKeys:[[0,0],[12,.055],[70,.93],[84,1]],yaw:Math.PI,weapon:'m1911',action:'Run',stride:1.60,beats:[{frame:0,action:'Run'},{frame:68,action:'Walk'},{frame:84,action:'Idle'}]},
    ], zombies: [],
  },
  powerWake: {
    duration: 300, dependencies: ['courtyard_reached'], state: {power:false,mainDoor:true}, powerEvent:true,
    camera: [[v(-1.8,2.2,-27.38),v(-4,1.55,-27.38),38],[v(-.45,2.45,-27.6),v(-4,1.48,-27.38),44],[v(1.15,2.8,-28.0),v(-4,1.4,-27.38),50]],
    actors: [{p:v(.2,0,-22.8),path:[v(.2,0,-22.8),v(-.8,0,-24.2),v(-2.2,0,-25.7),v(-3.82,0,-27.25)],entryFrame:0,exitFrame:96,speedKeys:[[0,0],[14,.05],[66,.76],[96,1]],yaw:-Math.PI/2,weapon:'m1911',action:'Run',stride:1.62,beats:[{frame:0,action:'Run'},{frame:78,action:'Walk'},{frame:102,action:'Idle'}]}], zombies: [{p:v(1.3,0,-19.6),path:[v(1.3,0,-19.6),v(.1,0,-21.4),v(-1.0,0,-23.3),v(-2.0,0,-25.2)],entryFrame:22,exitFrame:142,speedKeys:[[0,0],[18,.04],[86,.78],[120,1]],yaw:Math.PI,action:'Run',stride:1.38,beats:[{frame:0,action:'Run'},{frame:128,action:'Punch'}]}],
  },
  courtyardExit: {
    duration: 150, dependencies: ['power_on','team_in_motion'], state: {power:true,mainDoor:true},
    camera: [[v(0,2.00,-36.5),v(-3.0,1.15,-25.5),58],[v(-.7,2.28,-36.0),v(-2.7,1.18,-26.8),54],[v(.8,2.58,-35.4),v(-2.3,1.22,-28.1),50]],
    actors: [
      {p:v(-7.0,0,-22.7),to:v(-7.2,0,-29.2),yaw:Math.PI,weapon:'mg42',action:'Walk'},
      {p:v(-4.5,0,-23.3),to:v(-4.4,0,-29.8),yaw:Math.PI,weapon:'ppsh',action:'Walk'},
      {p:v(-2.0,0,-22.6),to:v(-1.8,0,-29.1),yaw:Math.PI,weapon:'trench',action:'Walk'},
      {p:v(.5,0,-23.4),to:v(.2,0,-29.9),yaw:Math.PI,weapon:'raygun',action:'Walk'},
    ],
    zombies: [
      {p:v(-6.6,0,-16.5),to:v(-6.8,0,-23.0),yaw:Math.PI,action:'Run'},
      {p:v(-3.7,0,-17.2),to:v(-3.9,0,-23.7),yaw:Math.PI,action:'Walk'},
      {p:v(-.8,0,-16.7),to:v(-1.1,0,-23.2),yaw:Math.PI,action:'Run'},
    ],
  },
  catwalkPressure: {
    duration: 360, dependencies: ['power_on','factory_reached'], state: {power:true,mainDoor:true}, combat:true,
    camera: [[v(-2.8,4.45,-43.5),v(0,3.8,-51),46],[v(-3.75,4.52,-44.0),v(-.5,3.82,-51),46],[v(-4.65,4.58,-44.5),v(-1,3.84,-51),45]],
    actors: [{p:v(-4.2,3.1,-51.7),to:v(-4.55,3.1,-52.35),yaw:.14,weapon:'mp40',hero:true},{p:v(-1.4,3.1,-52.2),to:v(-1.1,3.1,-52.75),yaw:-.10,weapon:'kar98'},{p:v(1.4,3.1,-51.6),to:v(1.15,3.1,-52.35),yaw:.18,weapon:'trench'},{p:v(4.2,3.1,-52.25),to:v(4.5,3.1,-52.8),yaw:-.12,weapon:'m1911'}],
    zombies: [
      {p:v(-5.3,3.1,-47.2),to:v(-5.0,3.1,-50.1),yaw:Math.PI,action:'Run'},{p:v(-2.5,3.1,-46.8),to:v(-2.0,3.1,-49.6),yaw:Math.PI,action:'Walk'},
      {p:v(.2,3.1,-47.5),to:v(.4,3.1,-50.0),yaw:Math.PI,action:'Run'},{p:v(2.6,3.1,-46.9),to:v(2.2,3.1,-49.7),yaw:Math.PI,action:'Walk'},
      {p:v(4.7,3.1,-47.6),to:v(4.5,3.1,-50.2),yaw:Math.PI,action:'Run'},
    ],
  },
  trapCauseEffect: {
    duration: 420, dependencies: ['power_on','monkey_owned'], state: {power:true,mainDoor:true}, monkeySwarm:true,
    camera: [[v(-14.0,3.45,-7.2),v(-14.2,1.0,-12),50],[v(-15.0,3.1,-7.5),v(-15.3,.9,-12),46],[v(-16.0,2.6,-8.2),v(-16.1,.82,-12),42]],
    actors: [{p:v(-12.5,0,-9.2),yaw:-Math.PI/2,weapon:'mp40'}],
    zombies: [
      {p:v(-9,0,-9),to:v(-16.25,0,-12.0),yaw:-Math.PI/2,action:'Run'},{p:v(-8,0,-11),to:v(-16.0,0,-11.55),yaw:-Math.PI/2,action:'Run'},
      {p:v(-7,0,-13),to:v(-16.55,0,-12.35),yaw:-Math.PI/2,action:'Walk'},{p:v(-10,0,-15),to:v(-15.8,0,-12.7),yaw:-Math.PI/2,action:'Run'},
      {p:v(-6,0,-10),to:v(-16.35,0,-11.25),yaw:-Math.PI/2,action:'Walk'},{p:v(-9,0,-14),to:v(-15.7,0,-12.15),yaw:-Math.PI/2,action:'Run'},
    ], monkey:v(-16.2,0,-12),
  },
  teleporterA: {
    duration: 195, dependencies: ['power_on'], state: {power:true,mainDoor:true,tele:[]}, teleEvent:'teleA',
    camera: [[v(-41,4.5,-9),v(-38,1.0,-13),52],[v(-40,4.0,-11),v(-38,1.0,-13),44],[v(-36,3.7,-10),v(-38,1.0,-13),38]],
    actors: [{p:v(-38,0,-11.5),to:v(-38,0,-13),yaw:Math.PI,weapon:'kar98'}], zombies: [{p:v(-34,0,-9),to:v(-37,0,-11),yaw:Math.PI,action:'Run'}],
  },
  teleporterB: {
    duration: 195, dependencies: ['power_on','teleA_linked'], state: {power:true,mainDoor:true,tele:['teleA']}, teleEvent:'teleB',
    camera: [[v(21,4.2,-24.5),v(17,3.5,-30.5),52],[v(20,4.4,-27),v(17,3.5,-30.5),44],[v(15,4.2,-27),v(17,3.5,-30.5),38]],
    actors: [{p:v(17,2.9,-29),to:v(17,2.9,-30.5),yaw:Math.PI,weapon:'type100'}], zombies: [{p:v(13,2.9,-25),to:v(16,2.9,-28),yaw:Math.PI,action:'Run'}],
  },
  lastRoute: {
    duration: 195, dependencies: ['power_on','teleA_linked','teleB_linked'], state: {power:true,mainDoor:true,tele:['teleA','teleB']},
    camera: [[v(6,3.4,19),v(0,1.1,15),50],[v(5.5,3.1,17),v(0,1.05,12),46],[v(5,2.8,15),v(0,1.0,9),42]],
    actors: [{p:v(-1.2,0,15),to:v(-1.2,0,8),yaw:Math.PI,weapon:'ppsh'},{p:v(1.2,0,15),to:v(1.2,0,8),yaw:Math.PI,weapon:'trench'}],
    zombies: [
      {p:v(-4,0,20),to:v(-3,0,15),yaw:Math.PI,action:'Run'},{p:v(0,0,21),to:v(0,0,16),yaw:Math.PI,action:'Walk'},
      {p:v(4,0,20),to:v(3,0,15),yaw:Math.PI,action:'Run'},{p:v(6,0,22),to:v(4,0,17),yaw:Math.PI,action:'Walk'},
    ],
  },
  teleporterC: {
    duration: 529, dependencies: ['power_on','teleA_linked','teleB_linked'], state: {power:true,mainDoor:true,tele:['teleA','teleB']}, teleEvent:'teleC',
    camera: [[v(-7,1.2,-52),v(0,1.0,-56),52],[v(-4,1.8,-58),v(0,1.0,-56),44],[v(1,2.2,-61),v(0,1.1,-56),38]],
    actors: [{p:v(-2,0,-56),to:v(0,0,-56),yaw:Math.PI/2,weapon:'mg42'},{p:v(2,0,-56),yaw:-Math.PI/2,weapon:'ppsh'}],
    zombies: [{p:v(-5,0,-49),to:v(-3.4,0,-54.2),yaw:Math.PI,action:'Run'},{p:v(0,0,-48),to:v(0,0,-54.0),yaw:Math.PI,action:'Run'},{p:v(5,0,-49),to:v(3.5,0,-54.1),yaw:Math.PI,action:'Run'}],
  },
  papRitual: {
    duration: 970, dependencies: ['teleA_linked','teleB_linked','teleC_linked','pap_prompt_active'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true}, papEvent:true, povWeapon:'mg42',
    camera: [[v(3.4,2.4,20.5),v(4,1.5,14.7),50],[v(4.4,1.62,17.45),v(4,1.4,14.7),60],[v(4.1,1.55,17.1),v(4,1.35,14.7),56]],
    actors: [{p:v(-3,0,17.1),to:v(-3.45,0,16.45),yaw:0,weapon:'ppsh'},{p:v(0,0,17.55),to:v(.15,0,16.8),yaw:0,weapon:'trench'},{p:v(3,0,17.15),to:v(3.5,0,16.55),yaw:0,weapon:'raygun'}],
    zombies: [{p:v(-6,0,24),to:v(-4.7,0,19.2),yaw:Math.PI,action:'Run'},{p:v(-2.2,0,23),to:v(-1.8,0,19.0),yaw:Math.PI,action:'Walk'},{p:v(2.2,0,24),to:v(1.5,0,19.3),yaw:Math.PI,action:'Run'},{p:v(6,0,23),to:v(4.6,0,19.0),yaw:Math.PI,action:'Walk'}],
  },
  squadFire: {
    duration: 360, dependencies: ['diamond_mg42_ready','team_reformed'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true}, combat:true,
    camera: [[v(-5.3,2.55,1.1),v(-.8,1.25,13),50],[v(-4.65,2.9,.7),v(0,1.3,13),46],[v(-3.85,3.2,.35),v(1.0,1.35,13),43]],
    actors: [{p:v(-4,0,12.6),to:v(-4.35,0,13.25),yaw:Math.PI+.10,weapon:'mg42',pap:true,diamond:true,hero:true},{p:v(-1.3,0,13.2),to:v(-1.05,0,13.75),yaw:Math.PI-.08,weapon:'ppsh'},{p:v(1.3,0,12.8),to:v(1.05,0,13.45),yaw:Math.PI+.12,weapon:'trench'},{p:v(4,0,13.35),to:v(4.35,0,13.9),yaw:Math.PI-.10,weapon:'raygun'}],
    zombies: [
      {p:v(-8,0,5),to:v(-6,0,10),yaw:0,action:'Run'},{p:v(-6,0,3),to:v(-4,0,9),yaw:0,action:'Walk'},{p:v(-4,0,4),to:v(-3,0,10),yaw:0,action:'Run'},
      {p:v(-2,0,2),to:v(-1,0,9),yaw:0,action:'Walk'},{p:v(0,0,4),to:v(0,0,10),yaw:0,action:'Run'},{p:v(2,0,2),to:v(1,0,9),yaw:0,action:'Walk'},
      {p:v(4,0,4),to:v(3,0,10),yaw:0,action:'Run'},{p:v(6,0,3),to:v(4,0,9),yaw:0,action:'Walk'},{p:v(8,0,5),to:v(6,0,10),yaw:0,action:'Run'},
    ],
  },
  dg2Aftermath: {
    duration: 510, dependencies: ['dg2_owned','team_reformed'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true}, dg2Event:true, combat:true,
    camera: [[v(10.5,2.7,-54.5),v(0,1.2,-55),50],[v(9.5,2.9,-54.0),v(-.5,1.15,-55),46],[v(8.2,3.1,-53.5),v(-1,1.1,-55),42]],
    actors: [{p:v(-3,0,-54),to:v(-3,0,-48),yaw:0,weapon:'dg2',action:'Idle'},{p:v(2,0,-53),to:v(2,0,-47.5),yaw:0,weapon:'mg42',pap:true,action:'Idle'}],
    zombies: [
      {p:v(-7,0,-59),to:v(-5.6,0,-55.2),yaw:0,action:'Run'},{p:v(-5.5,0,-57.5),to:v(-4.6,0,-54.8),yaw:0,action:'Walk'},{p:v(-4,0,-59),to:v(-3.5,0,-55.0),yaw:0,action:'Run'},
      {p:v(-2.5,0,-57),to:v(-2.5,0,-54.5),yaw:0,action:'Walk'},{p:v(-1,0,-59),to:v(-1.25,0,-54.8),yaw:0,action:'Run'},{p:v(.5,0,-57.5),to:v(.3,0,-54.4),yaw:0,action:'Walk'},
      {p:v(2,0,-59),to:v(1.75,0,-54.9),yaw:0,action:'Run'},{p:v(3.5,0,-57),to:v(3.0,0,-54.6),yaw:0,action:'Walk'},{p:v(5,0,-59),to:v(4.4,0,-55.0),yaw:0,action:'Run'},{p:v(6.5,0,-57.5),to:v(5.55,0,-54.9),yaw:0,action:'Walk'},
    ],
  },
  regroupMove: {
    duration: 250, dependencies: ['dog_round_survived','team_reformed'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true},
    camera: [[v(-5.3,2.25,1.1),v(-.3,1.18,10.8),48],[v(-4.65,2.45,.7),v(.1,1.22,13.0),45],[v(-3.85,2.7,.35),v(.5,1.26,15.0),42]],
    actors: [
      {p:v(-3.6,0,8.8),to:v(-3.0,0,16.0),yaw:0,weapon:'mg42',pap:true,diamond:true,action:'Walk'},
      {p:v(-1.25,0,10.0),to:v(-1.0,0,17.1),yaw:0,weapon:'ppsh',action:'Walk'},
      {p:v(1.1,0,9.3),to:v(1.35,0,16.4),yaw:0,weapon:'trench',action:'Walk'},
      {p:v(3.4,0,10.4),to:v(3.0,0,17.5),yaw:0,weapon:'raygun',pap:true,action:'Walk'},
    ],
    zombies: [
      {p:v(-5.5,0,1.2),to:v(-4.5,0,10.0),yaw:0,action:'Run'},{p:v(-3,0,.2),to:v(-2.4,0,9.5),yaw:0,action:'Walk'},
      {p:v(-.6,0,1.0),to:v(-.4,0,10.3),yaw:0,action:'Run'},{p:v(1.8,0,.4),to:v(1.6,0,9.8),yaw:0,action:'Walk'},
      {p:v(4.4,0,1.3),to:v(3.9,0,10.4),yaw:0,action:'Run'},
    ],
  },
  factoryCrane: {
    duration: 250, dependencies: ['facility_active','team_in_motion'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true},
    camera: [[v(10.8,2.25,-48.0),v(0,1.18,-52.0),52],[v(9.5,2.45,-53.0),v(-.4,1.22,-52.4),47],[v(8.2,2.65,-58.0),v(-1.0,1.26,-52.8),43]],
    actors: [
      {p:v(-5,0,-44),to:v(-4.2,0,-52),yaw:Math.PI,weapon:'mg42',pap:true,diamond:true,action:'Walk'},
      {p:v(-1.8,0,-43.2),to:v(-1.4,0,-51.2),yaw:Math.PI,weapon:'ppsh',action:'Walk'},
      {p:v(1.7,0,-44.4),to:v(1.4,0,-52.4),yaw:Math.PI,weapon:'trench',action:'Walk'},
      {p:v(4.8,0,-43.5),to:v(4.1,0,-51.5),yaw:Math.PI,weapon:'raygun',pap:true,action:'Walk'},
    ],
    zombies: [
      {p:v(-7,0,-36),to:v(-5.5,0,-46.5),yaw:Math.PI,action:'Run'},{p:v(-4.5,0,-35),to:v(-3.4,0,-46),yaw:Math.PI,action:'Walk'},
      {p:v(-2,0,-36.5),to:v(-1.4,0,-47),yaw:Math.PI,action:'Run'},{p:v(.5,0,-35.5),to:v(.4,0,-46.3),yaw:Math.PI,action:'Walk'},
      {p:v(3,0,-36.4),to:v(2.4,0,-47.2),yaw:Math.PI,action:'Run'},{p:v(5.5,0,-35.2),to:v(4.5,0,-46.1),yaw:Math.PI,action:'Walk'},
      {p:v(8,0,-36.2),to:v(6.2,0,-47.0),yaw:Math.PI,action:'Run'},
    ],
  },
  factoryDefense: {
    duration: 360, dependencies: ['diamond_mg42_ready','team_reformed','facility_active'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true}, combat:true,
    camera: [[v(12.5,2.4,-46.0),v(0,1.28,-49.0),52],[v(9.5,3.0,-52.0),v(-1.0,1.22,-50.5),46],[v(6.5,3.4,-58.0),v(-2.0,1.16,-51.0),42]],
    actors: [
      {p:v(-5.0,0,-44.0),to:v(-4.2,0,-53.0),yaw:Math.PI,weapon:'mg42',pap:true,diamond:true,hero:true,action:'Walk'},
      {p:v(-1.8,0,-43.2),to:v(-1.2,0,-52.2),yaw:Math.PI,weapon:'ppsh',pap:true,action:'Walk'},
      {p:v(1.7,0,-44.4),to:v(1.2,0,-53.2),yaw:Math.PI,weapon:'trench',action:'Walk'},
      {p:v(4.8,0,-43.5),to:v(4.0,0,-52.4),yaw:Math.PI,weapon:'raygun',pap:true,action:'Walk'},
    ],
    zombies: [
      {p:v(-7.2,0,-34.2),to:v(-5.6,0,-47.2),yaw:Math.PI,action:'Run'},{p:v(-5.0,0,-35.3),to:v(-3.9,0,-47.7),yaw:Math.PI,action:'Walk'},
      {p:v(-2.8,0,-33.8),to:v(-2.0,0,-48.2),yaw:Math.PI,action:'Run'},{p:v(-.5,0,-35.0),to:v(-.4,0,-47.8),yaw:Math.PI,action:'Walk'},
      {p:v(1.8,0,-34.0),to:v(1.4,0,-48.4),yaw:Math.PI,action:'Run'},{p:v(4.0,0,-35.2),to:v(3.2,0,-47.9),yaw:Math.PI,action:'Walk'},
      {p:v(6.2,0,-34.0),to:v(4.9,0,-48.3),yaw:Math.PI,action:'Run'},{p:v(8.0,0,-35.4),to:v(6.2,0,-47.5),yaw:Math.PI,action:'Walk'},
    ],
  },
  // Capture-only key-art tableau. This is deliberately additive and can only
  // be reached through cinematic.html; normal gameplay never instantiates it.
  // It uses the shipped character, weapon, zombie and factory renderers so OG
  // artwork can stay visually faithful to the live Der Koloss build.
  ogWallpaperLastStand: {
    duration: 360, dependencies: ['key_art_only','facility_active','team_reformed'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true}, combat:true,
    camera: [[v(12.5,2.4,-46.0),v(0,1.28,-49.0),52],[v(9.5,3.0,-52.0),v(-1.0,1.22,-50.5),46],[v(6.5,3.4,-58.0),v(-2.0,1.16,-51.0),42]],
    actors: [
      {p:v(-5.0,0,-44.0),to:v(-4.2,0,-53.0),yaw:Math.PI,weapon:'raygun',pap:true,hero:true,action:'Walk'},
      {p:v(-1.8,0,-43.2),to:v(-1.2,0,-52.2),yaw:Math.PI,weapon:'dg2',pap:true,hero:true,action:'Walk'},
      {p:v(1.7,0,-44.4),to:v(1.2,0,-53.2),yaw:Math.PI,weapon:'browning',pap:true,hero:true,action:'Walk'},
      {p:v(4.8,0,-43.5),to:v(4.0,0,-52.4),yaw:Math.PI,weapon:'ppsh',pap:true,hero:true,action:'Walk'},
    ],
    zombies: [
      {p:v(-9.0,0,-68.0),to:v(-6.1,0,-54.0),yaw:0,action:'Run'},{p:v(-7.0,0,-65.5),to:v(-4.8,0,-53.4),yaw:0,action:'Walk'},
      {p:v(-5.0,0,-68.6),to:v(-3.5,0,-53.1),yaw:0,action:'Run'},{p:v(-3.0,0,-65.2),to:v(-2.0,0,-53.7),yaw:0,action:'Walk'},
      {p:v(-1.0,0,-68.2),to:v(-.7,0,-52.8),yaw:0,action:'Run'},{p:v(1.0,0,-65.4),to:v(.8,0,-53.5),yaw:0,action:'Walk'},
      {p:v(3.0,0,-68.8),to:v(2.2,0,-52.7),yaw:0,action:'Run'},{p:v(5.0,0,-65.1),to:v(3.8,0,-53.6),yaw:0,action:'Walk'},
      {p:v(7.0,0,-68.4),to:v(5.3,0,-53.0),yaw:0,action:'Run'},{p:v(9.0,0,-65.6),to:v(6.7,0,-53.9),yaw:0,action:'Walk'},
      {p:v(-10.5,0,-64.0),to:v(-7.0,0,-53.3),yaw:0,action:'Run'},{p:v(10.5,0,-63.8),to:v(7.6,0,-53.5),yaw:0,action:'Run'},
    ],
  },
  factoryFinale: {
    duration: 250, dependencies: ['facility_active','team_reformed','finale'], state: {power:true,mainDoor:true,tele:['teleA','teleB','teleC'],pap:true},
    camera: [[v(12.0,3.2,-57.5),v(0,1.25,-51.8),52],[v(12.6,3.0,-56.5),v(-.4,1.22,-49.2),46],[v(13.2,2.8,-55.3),v(-.8,1.18,-47.2),42]],
    actors: [
      {p:v(-5.0,0,-52.0),to:v(-4.2,0,-45.0),yaw:0,weapon:'mg42',pap:true,diamond:true,action:'Walk'},
      {p:v(-1.8,0,-51.2),to:v(-1.3,0,-44.2),yaw:0,weapon:'ppsh',pap:true,action:'Walk'},
      {p:v(1.7,0,-52.4),to:v(1.3,0,-45.2),yaw:0,weapon:'trench',pap:true,action:'Walk'},
      {p:v(4.8,0,-51.5),to:v(4.0,0,-44.5),yaw:0,weapon:'raygun',pap:true,action:'Walk'},
    ],
    zombies: [
      {p:v(-7.0,0,-60.0),to:v(-5.5,0,-50.0),yaw:0,action:'Run'},{p:v(-4.5,0,-61.0),to:v(-3.4,0,-50.5),yaw:0,action:'Walk'},
      {p:v(-2.0,0,-60.5),to:v(-1.4,0,-50.8),yaw:0,action:'Run'},{p:v(.5,0,-61.2),to:v(.4,0,-50.4),yaw:0,action:'Walk'},
      {p:v(3.0,0,-60.4),to:v(2.4,0,-50.9),yaw:0,action:'Run'},{p:v(5.5,0,-61.0),to:v(4.5,0,-50.5),yaw:0,action:'Walk'},
      {p:v(8.0,0,-60.2),to:v(6.2,0,-50.8),yaw:0,action:'Run'},
    ],
  },
  hellhoundSting: {
    duration: 150, dependencies: ['dg2_climax'], state: {power:true,tele:['teleA','teleB','teleC'],pap:true},
    camera: [[v(-2,0.55,-50),v(0,0.55,-55),32],[v(-1,0.65,-51),v(0,0.6,-55),28],[v(0,0.7,-52),v(0,0.65,-55),25]],
    actors: [], zombies: [], dog:v(4.8,0,-57.2),dogPath:[v(4.8,0,-57.2),v(3.1,0,-56.7),v(1.4,0,-56.2),v(-.15,0,-55.3),v(-1.15,0,-54.5)],dogEntryFrame:0,dogExitFrame:149,
  },

  // Der Riese actor-free cinematic library — 26 self-contained 6–8s plates.
  cp01MainframeEstablish: cinematicPackShot([
    [v(-8.8,3.6,25.5),v(0,1.45,17.7),52],[v(-5.9,3.2,25.45),v(0,1.35,17.4),46],[v(-2.8,2.75,24.8),v(0,1.25,17.1),42],
  ],{room:'mainframe courtyard'}),
  cp02MainframeOrbit: cinematicPackShot([
    [v(-7.4,2.45,20.8),v(-2.5,1.75,14.7),43],[v(-1.8,2.75,22.9),v(-2.3,1.75,14.65),40],[v(4.3,2.35,21.8),v(-2.1,1.72,14.7),44],
  ],{room:'mainframe machinery'}),
  cp03PapReveal: cinematicPackShot([
    [v(9.2,1.35,20.5),v(4,1.7,14.7),50],[v(7.1,1.7,19.0),v(4,1.65,14.7),42],[v(5.65,1.9,17.8),v(4,1.58,14.7),36],
  ],{pap:true,tele:['teleA','teleB','teleC'],room:'Pack-a-Punch'}),
  cp04PapCycle: cinematicPackShot([
    [v(6.5,1.28,17.15),v(4,1.15,14.7),35],[v(5.75,1.52,16.8),v(4,1.2,14.7),32],[v(5.15,1.65,16.45),v(4,1.25,14.7),30],
  ],{duration:480,pap:true,tele:['teleA','teleB','teleC'],machine:'papCycle',room:'Pack-a-Punch cycle'}),
  cp05BoxCourtyardReveal: cinematicPackShot([
    [v(-10.5,1.0,-18.2),v(-4,.72,-23.2),48],[v(-8.2,1.35,-19.1),v(-4,.72,-23.2),42],[v(-6.45,1.45,-20.2),v(-4,.76,-23.2),36],
  ],{machine:'boxIdle',boxLocation:0,room:'courtyard mystery box'}),
  cp06BoxSpin: cinematicPackShot([
    [v(-7.8,1.28,-18.8),v(-4,.85,-23.2),40],[v(-7.1,1.52,-19.55),v(-4,1.0,-23.2),35],[v(-6.45,1.68,-20.35),v(-4,1.05,-23.2),36],
  ],{duration:480,machine:'boxSpin',boxLocation:0,room:'mystery box spin'}),
  cp07PowerGenerator: cinematicPackShot([
    [v(3.6,3.35,-19.7),v(-4,1.25,-26.2),54],[v(1.8,2.95,-20.55),v(-4,1.25,-26.4),47],[v(.2,2.45,-21.5),v(-4,1.3,-26.7),40],
  ],{machine:'powerIdle',room:'factory courtyard generator'}),
  cp08PowerSwitch: cinematicPackShot([
    [v(.2,2.2,-24.1),v(-4,1.45,-27.6),42],[v(-.8,2.0,-24.35),v(-4,1.45,-27.6),36],[v(-1.85,1.85,-24.65),v(-4,1.45,-27.6),32],
  ],{duration:420,machine:'powerCycle',room:'power switch'}),
  cp09TeleporterAWide: cinematicPackShot([
    [v(-33.0,3.15,-7.0),v(-38,1.55,-13),53],[v(-34.3,3.0,-8.5),v(-38,1.55,-13),46],[v(-35.5,2.75,-10.0),v(-38,1.5,-13),40],
  ],{tele:['teleA'],room:'generator room teleporter A'}),
  cp10TeleporterACharge: cinematicPackShot([
    [v(-42.8,1.35,-12.1),v(-38,.8,-13),38],[v(-41.6,1.75,-11.7),v(-38,.9,-13),34],[v(-40.3,2.15,-10.8),v(-38,1.0,-13),32],
  ],{duration:420,machine:'teleCharge',tele:['teleA'],room:'teleporter A charge'}),
  cp11TeleporterBApproach: cinematicPackShot([
    [v(11.4,4.95,-23.4),v(17,3.8,-30.5),51],[v(13.0,4.7,-25.0),v(17,3.8,-30.5),45],[v(14.6,4.45,-27.0),v(17,3.75,-30.5),39],
  ],{tele:['teleA','teleB'],room:'chemical testing teleporter B'}),
  cp12TeleporterBCharge: cinematicPackShot([
    [v(20.6,3.62,-26.7),v(17,3.7,-30.5),38],[v(19.6,4.15,-27.3),v(17,3.75,-30.5),34],[v(18.3,4.55,-27.5),v(17,3.8,-30.5),32],
  ],{duration:420,machine:'teleCharge',tele:['teleA','teleB'],room:'teleporter B charge'}),
  cp13TeleporterCFactory: cinematicPackShot([
    [v(-11.8,1.45,-48.2),v(0,1.45,-56),52],[v(-8.0,1.9,-50.0),v(0,1.4,-56),45],[v(-4.3,2.35,-51.2),v(0,1.4,-56),39],
  ],{tele:['teleA','teleB','teleC'],room:'main factory teleporter C'}),
  cp14TeleporterCOrbit: cinematicPackShot([
    [v(-4.8,1.25,-59.8),v(0,1.25,-56),38],[v(0,2.2,-61.0),v(0,1.35,-56),34],[v(5.0,1.65,-59.4),v(0,1.3,-56),38],
  ],{duration:420,machine:'teleCharge',tele:['teleA','teleB','teleC'],room:'teleporter C orbit'}),
  cp15CatwalkLowAngle: cinematicPackShot([
    [v(-7.8,.48,-44.0),v(-5.5,3.65,-52),50],[v(-4.9,.72,-45.2),v(-1.5,3.65,-52),44],[v(-1.8,1.0,-47.0),v(3.0,3.65,-52),40],
  ],{room:'factory catwalk low angle'}),
  cp16CatwalkDeck: cinematicPackShot([
    [v(-10.2,4.4,-52),v(-2.2,3.72,-52),48],[v(-5.0,4.25,-52),v(3.0,3.7,-52),43],[v(.8,4.15,-52),v(9.3,3.65,-52),39],
  ],{room:'factory catwalk deck'}),
  cp17QuickRevive: cinematicPackShot([
    [v(-8.5,1.25,-55.0),v(-13.3,1.25,-58),44],[v(-10.0,1.55,-55.4),v(-13.3,1.35,-58),38],[v(-11.25,1.7,-56.2),v(-13.3,1.4,-58),34],
  ],{machine:'perkPulse',room:'Quick Revive'}),
  cp18Juggernog: cinematicPackShot([
    [v(-8.4,4.05,-14.0),v(-13.4,4.05,-18),44],[v(-9.8,4.35,-15.0),v(-13.4,4.05,-18),38],[v(-11.1,4.25,-16.0),v(-13.4,4.05,-18),34],
  ],{machine:'perkPulse',room:'Juggernog'}),
  cp19SpeedCola: cinematicPackShot([
    [v(7.6,1.35,6.2),v(13.4,1.25,10),44],[v(9.4,1.65,7.0),v(13.4,1.35,10),38],[v(11.0,1.75,8.0),v(13.4,1.4,10),34],
  ],{machine:'perkPulse',room:'Speed Cola'}),
  cp20DoubleTap: cinematicPackShot([
    [v(7.8,4.05,-17.0),v(13.4,4.0,-21),44],[v(9.5,4.3,-17.8),v(13.4,4.0,-21),38],[v(11.1,4.2,-19.0),v(13.4,4.0,-21),34],
  ],{machine:'perkPulse',room:'Double Tap'}),
  cp21ElectricTrapWest: cinematicPackShot([
    [v(-8.1,2.65,-6.2),v(-14,1.25,-12),50],[v(-9.8,2.35,-7.8),v(-14,1.25,-12),43],[v(-11.5,2.05,-9.3),v(-14,1.2,-12),38],
  ],{duration:420,machine:'trapWest',room:'west electro-shock trap'}),
  cp22ElectricTrapEast: cinematicPackShot([
    [v(8.1,2.65,-6.2),v(14,1.25,-12),50],[v(9.8,2.35,-7.8),v(14,1.25,-12),43],[v(11.5,2.05,-9.3),v(14,1.2,-12),38],
  ],{duration:420,machine:'trapEast',room:'east electro-shock trap'}),
  cp23AnimalLab: cinematicPackShot([
    [v(-16.2,2.0,-6.8),v(-25,1.2,-12),51],[v(-19.0,2.25,-7.8),v(-25,1.15,-12.5),45],[v(-22.0,2.4,-9.2),v(-25,1.1,-13),40],
  ],{room:'animal testing lab'}),
  cp24AutoGarage: cinematicPackShot([
    [v(16.0,2.4,-6.5),v(23,1.0,-11),52],[v(18.5,2.6,-7.4),v(24.5,1.1,-12.5),46],[v(21.0,2.7,-8.5),v(27.5,1.25,-17.5),41],
  ],{room:'automobile garage and furnace'}),
  cp25ChemicalVats: cinematicPackShot([
    [v(11.4,4.2,-28),v(17,3.8,-34.5),49],[v(13.8,4.5,-29.1),v(17,3.75,-34.5),43],[v(16.2,4.7,-29.8),v(18.2,3.7,-34.5),39],
  ],{room:'chemical testing vats'}),
  cp26FactoryGrandTour: cinematicPackShot([
    [v(12.0,6.1,-43.8),v(1.5,2.0,-50.5),55],[v(7.0,5.8,-45.0),v(0,1.8,-54),47],[v(1.0,5.25,-46.0),v(-1,1.7,-57),41],
  ],{duration:480,tele:['teleA','teleB','teleC'],room:'main factory grand tour'}),
};

export {SHOTS};
