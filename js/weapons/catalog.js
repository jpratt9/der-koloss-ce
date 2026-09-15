// Weapon definitions (real WWII-era firearms + sci-fi wonder weapons) and their
// Pack-a-Punch variants, the stat resolver, the mystery box pool, and what each
// weapon ejects.
import { CASING_KIND_NAMES } from '../audio/casings.js?v=1';

// fire: 'hitscan' | 'projectile' | 'arc'
// cls: pistol|smg|rifle|shotgun|lmg|sniper|wonder|launcher
// casing: none|pistol|rifle|shell|link — what the weapon throws on the floor,
//   which is NOT the same question as what class it is: a revolver keeps its
//   brass in the cylinder until you reload, and an energy weapon has none at
//   all. See js/audio/casings.js.
export const WEAPONS = {
  m1911: {
    name: 'M1911', cls: 'pistol', casing: 'pistol', fire: 'hitscan', auto: false,
    dmg: 20, headMult: 2.5, rpm: 480, mag: 8, reserve: 80, reload: 1.6,
    spreadHip: 0.022, spreadAds: 0.008, kick: 0.011, zoom: 0.92, sfx: 'shot_pistol', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_slide']], relRate: 1.0,
    price: null, box: false, move: 1.0,
    // The classic upgrade fires explosive grenade rounds. Keep the ordinary
    // M1911 hitscan; only the Pack-a-Punched variant enters the authoritative
    // projectile/splash path used by the launchers and Ray Gun.
    pap: {
      name: 'C-3000 b1at-ch35', fire: 'projectile', dmg: 1000,
      splash: { radius: 3.2, dmg: 400 }, projSpeed: 44,
      mag: 6, reserve: 50, reload: 1.4, kick: 0.026,
    },
  },
  magnum: {
    name: '.357 Magnum', cls: 'pistol', casing: 'none', fire: 'hitscan', auto: false,
    dmg: 300, headMult: 2, rpm: 150, mag: 6, reserve: 80, reload: 2.4, penetrate: 2,
    spreadHip: 0.02, spreadAds: 0.004, kick: 0.04, zoom: 0.92, sfx: 'shot_magnum', reloadStages: [[0.10,'rel_open'],[0.35,'rel_shell'],[0.50,'rel_shell'],[0.62,'rel_shell'],[0.78,'rel_close']], relRate: 0.9,
    price: null, box: true, move: 1.0,
    pap: { name: '.357 Plus 1 K1L-u', dmg: 1000, mag: 6, reserve: 96, kick: 0.06, penetrate: 3 },
  },
  kar98: {
    name: 'Kar98k', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: false, bolt: true,
    dmg: 100, headMult: 3, rpm: 46, mag: 5, reserve: 60, reload: 2.5, penetrate: 3,
    spreadHip: 0.05, spreadAds: 0.0015, kick: 0.035, zoom: 0.85, sfx: 'shot_kar98', reloadStages: [[0.10,'rel_boltopen'],[0.38,'rel_clip'],[0.72,'rel_boltclose']], relRate: 1.0,
    price: 200, box: false, move: 0.96,
    pap: { name: 'The Guillotine', dmg: 200, mag: 10, reserve: 90, rpm: 55, penetrate: 4 },
  },
  gewehr43: {
    name: 'Gewehr 43', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: false,
    dmg: 90, headMult: 2.5, rpm: 300, mag: 10, reserve: 120, reload: 2.2, penetrate: 2,
    spreadHip: 0.035, spreadAds: 0.006, kick: 0.02, zoom: 0.87, sfx: 'shot_gewehr43', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.70,'rel_charge']], relRate: 0.95,
    price: 600, box: false, move: 0.96,
    pap: { name: 'G115 Compressor', dmg: 140, mag: 12, reserve: 170, penetrate: 3 },
  },
  m1a1: {
    name: 'M1A1 Carbine', cls: 'rifle', casing: 'pistol', fire: 'hitscan', auto: false,
    dmg: 70, headMult: 2.5, rpm: 350, mag: 15, reserve: 120, reload: 2.0, penetrate: 2,
    spreadHip: 0.03, spreadAds: 0.005, kick: 0.016, zoom: 0.88, sfx: 'shot_m1a1', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.70,'rel_charge']], relRate: 1.05,
    price: 600, box: false, move: 0.97,
    pap: { name: 'Widdershins RC-1', dmg: 120, mag: 15, reserve: 150, rpm: 400, penetrate: 3 },
  },
  type100: {
    name: 'Type 100', cls: 'smg', casing: 'pistol', fire: 'hitscan', auto: true,
    dmg: 55, headMult: 2, rpm: 600, mag: 30, reserve: 180, reload: 2.2,
    spreadHip: 0.032, spreadAds: 0.013, kick: 0.01, zoom: 0.9, sfx: 'shot_type100', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1.12,
    price: 1000, box: false, move: 1.0,
    pap: { name: '1001 Samurais', dmg: 95, mag: 60, reserve: 360, rpm: 650 },
  },
  mp40: {
    name: 'MP40', cls: 'smg', casing: 'pistol', fire: 'hitscan', auto: true,
    dmg: 60, headMult: 2, rpm: 535, mag: 32, reserve: 192, reload: 2.3,
    spreadHip: 0.03, spreadAds: 0.012, kick: 0.009, zoom: 0.9, sfx: 'shot_mp40', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1.0,
    price: 1000, box: true, move: 1.0,
    pap: { name: 'The Afterburner', dmg: 100, mag: 64, reserve: 384, rpm: 600 },
  },
  thompson: {
    name: 'Thompson', cls: 'smg', casing: 'pistol', fire: 'hitscan', auto: true,
    dmg: 80, headMult: 2, rpm: 750, mag: 20, reserve: 200, reload: 2.1,
    spreadHip: 0.034, spreadAds: 0.014, kick: 0.011, zoom: 0.9, sfx: 'shot_thompson', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 0.88,
    price: 1200, box: true, move: 1.0,
    pap: { name: 'Gibs-O-Matic', dmg: 120, mag: 40, reserve: 400, rpm: 800 },
  },
  dbshotgun: {
    name: 'Double-Barreled', cls: 'shotgun', casing: 'shell', fire: 'hitscan', auto: false, breakAction: true,
    dmg: 70, headMult: 1.3, rpm: 200, mag: 2, reserve: 60, reload: 2.8, pellets: 8,
    spreadHip: 0.075, spreadAds: 0.055, kick: 0.055, zoom: 0.94, sfx: 'shot_dbshotgun', reloadStages: [[0.08,'rel_open'],[0.30,'rel_shell'],[0.45,'rel_shell'],[0.62,'rel_close']], relRate: 1.0, falloff: 14,
    price: 1200, box: false, move: 0.98,
    pap: { name: '24 Bore Long Range', dmg: 115, pellets: 8, spreadHip: 0.05, spreadAds: 0.035, falloff: 22 },
  },
  trench: {
    name: 'M1897 Trench Gun', cls: 'shotgun', casing: 'shell', fire: 'hitscan', auto: false, pump: true,
    dmg: 45, headMult: 1.3, rpm: 75, mag: 6, reserve: 60, reload: 3.0, pellets: 8,
    spreadHip: 0.072, spreadAds: 0.052, kick: 0.045, zoom: 0.94, sfx: 'shot_trench', reloadStages: [[0.10,'rel_shell'],[0.22,'rel_shell'],[0.34,'rel_shell'],[0.46,'rel_shell'],[0.58,'rel_shell'],[0.78,'rel_pump']], relRate: 1.0, falloff: 10,
    price: 1500, box: true, move: 0.98,
    pap: { name: 'The Gut Shot', dmg: 80, mag: 10, reserve: 90, falloff: 16, spreadHip: 0.06, spreadAds: 0.045 },
  },
  stg44: {
    name: 'STG-44', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 100, headMult: 2.5, rpm: 588, mag: 30, reserve: 180, reload: 2.5, penetrate: 2,
    spreadHip: 0.032, spreadAds: 0.009, kick: 0.013, zoom: 0.88, sfx: 'shot_stg44', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1.0,
    price: 1200, box: true, move: 0.97,
    pap: { redDot: true, name: 'Spatz-447+', dmg: 140, mag: 60, reserve: 360, rpm: 650, penetrate: 3 },
  },
  fg42: {
    name: 'FG42', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 100, headMult: 2.5, rpm: 937, mag: 32, reserve: 192, reload: 2.4, penetrate: 2,
    spreadHip: 0.035, spreadAds: 0.011, kick: 0.015, zoom: 0.88, sfx: 'shot_fg42', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1.08,
    price: 1500, box: true, move: 0.97,
    pap: { name: '420 Impeller', dmg: 140, mag: 64, reserve: 400, penetrate: 3 },
  },
  bar: {
    name: 'BAR', cls: 'lmg', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 140, headMult: 2.5, rpm: 375, mag: 20, reserve: 140, reload: 2.7, penetrate: 3,
    spreadHip: 0.04, spreadAds: 0.008, kick: 0.02, zoom: 0.88, sfx: 'shot_bar', reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 0.85,
    price: null, box: true, move: 0.9,
    pap: { name: 'The Widow Maker', dmg: 200, mag: 30, reserve: 240, rpm: 450, penetrate: 4 },
  },
  mg42: {
    name: 'MG42', cls: 'lmg', casing: 'link', fire: 'hitscan', auto: true,
    dmg: 130, headMult: 2, rpm: 937, mag: 125, reserve: 250, reload: 4.2, penetrate: 2,
    spreadHip: 0.055, spreadAds: 0.02, kick: 0.014, zoom: 0.9, sfx: 'shot_mg42', reloadStages: [[0.08,'rel_cover'],[0.28,'rel_belt'],[0.55,'rel_belt'],[0.72,'rel_cover'],[0.88,'rel_charge']], relRate: 1.0,
    price: null, box: true, move: 0.85,
    pap: { name: 'Barracuda FU-A11', dmg: 180, mag: 125, reserve: 500, penetrate: 3 },
  },
  browning: {
    name: 'Browning M1919', cls: 'lmg', casing: 'link', fire: 'hitscan', auto: true,
    dmg: 130, headMult: 2, rpm: 625, mag: 125, reserve: 375, reload: 4.5, penetrate: 3,
    spreadHip: 0.06, spreadAds: 0.022, kick: 0.015, zoom: 0.9, sfx: 'shot_browning', reloadStages: [[0.08,'rel_cover'],[0.28,'rel_belt'],[0.55,'rel_belt'],[0.72,'rel_cover'],[0.88,'rel_charge']], relRate: 0.85,
    price: null, box: true, move: 0.83,
    pap: { name: 'B115 Accelerator', dmg: 180, rpm: 800, mag: 125, reserve: 500, penetrate: 4 },
  },
  ptrs41: {
    name: 'PTRS-41', cls: 'sniper', casing: 'rifle', fire: 'hitscan', auto: false, scope: true,
    dmg: 1000, headMult: 2, rpm: 75, mag: 5, reserve: 60, reload: 3.2, penetrate: 5,
    spreadHip: 0.06, spreadAds: 0.001, kick: 0.06, zoom: 0.34, sfx: 'shot_ptrs41', reloadStages: [[0.12,'rel_boltopen'],[0.40,'rel_clip'],[0.68,'rel_boltclose']], relRate: 0.9,
    price: null, box: true, move: 0.88,
    pap: { name: 'The Penetrator', dmg: 1500, mag: 8, reserve: 80, penetrate: 8 },
  },
  panzerschreck: {
    name: 'Panzerschreck', cls: 'launcher', casing: 'none', fire: 'projectile', auto: false,
    dmg: 600, splash: { radius: 4, dmg: 400 }, rpm: 60, mag: 1, reserve: 20, reload: 2.8,
    spreadHip: 0.02, spreadAds: 0.004, kick: 0.06, zoom: 0.9, sfx: 'shot_panzerschreck', reloadStages: [[0.20,'rel_rocket'],[0.70,'rel_close']], relRate: 1.0, projSpeed: 26,
    price: null, box: true, move: 0.9,
    pap: { name: 'Longinus', dmg: 800, splash: { radius: 5, dmg: 600 }, mag: 3, reserve: 40 },
  },
  raygun: {
    name: 'Ray Gun', cls: 'wonder', casing: 'none', fire: 'projectile', auto: true,
    dmg: 1000, splash: { radius: 2, dmg: 300 }, rpm: 181, mag: 20, reserve: 160, reload: 2.2,
    spreadHip: 0.012, spreadAds: 0.002, kick: 0.012, zoom: 0.92, sfx: 'shot_raygun', reloadStages: [[0.12,'rel_cellout'],[0.50,'rel_cellin'],[0.78,'rel_charge']], relRate: 1.0, projSpeed: 60, tracerColor: 0x39ff6a,
    price: null, box: true, move: 1.0,
    pap: { name: "Porter's X2 Ray Gun", dmg: 2000, splash: { radius: 2.5, dmg: 500 }, mag: 40, reserve: 320, rpm: 220 },
  },
  m1garand: {
    name: 'M1 Garand', cls: 'rifle', casing: 'rifle', clipPing: true, fire: 'hitscan', auto: false,
    dmg: 100, headMult: 2.5, rpm: 350, mag: 8, reserve: 96, reload: 2.1, penetrate: 2,
    spreadHip: 0.03, spreadAds: 0.004, kick: 0.022, zoom: 0.87, sfx: 'shot_m1garand',
    price: null, box: true, move: 0.96,
    reloadStages: [[0.12,'rel_clip'],[0.28,'rel_ping'],[0.72,'rel_boltclose']], relRate: 1,
    pap: { name: 'M1000', dmg: 160, mag: 16, reserve: 160, rpm: 400, penetrate: 3 },
  },
  mosin: {
    name: 'Mosin-Nagant', cls: 'sniper', casing: 'rifle', fire: 'hitscan', auto: false, bolt: true, scope: true,
    dmg: 130, headMult: 3.5, rpm: 42, mag: 5, reserve: 50, reload: 2.9, penetrate: 3,
    spreadHip: 0.06, spreadAds: 0.001, kick: 0.045, zoom: 0.32, sfx: 'shot_mosin',
    price: null, box: true, move: 0.94,
    reloadStages: [[0.10,'rel_boltopen'],[0.38,'rel_clip'],[0.72,'rel_boltclose']], relRate: 1,
    pap: { name: 'Scythe of Siberia', dmg: 260, mag: 8, reserve: 70, penetrate: 4 },
  },
  springfield: {
    name: 'Springfield', cls: 'sniper', casing: 'rifle', fire: 'hitscan', auto: false, bolt: true, scope: true,
    dmg: 140, headMult: 3.5, rpm: 40, mag: 5, reserve: 50, reload: 3.0, penetrate: 3,
    spreadHip: 0.06, spreadAds: 0.001, kick: 0.048, zoom: 0.32, sfx: 'shot_springfield',
    price: null, box: true, move: 0.94,
    reloadStages: [[0.10,'rel_boltopen'],[0.38,'rel_clip'],[0.72,'rel_boltclose']], relRate: 1,
    pap: { name: 'Massachusetts Mauler', dmg: 280, mag: 8, reserve: 70, penetrate: 4 },
  },
  ppsh: {
    name: 'PPSh-41', cls: 'smg', casing: 'pistol', fire: 'hitscan', auto: true,
    dmg: 50, headMult: 2, rpm: 900, mag: 71, reserve: 284, reload: 3.2,
    spreadHip: 0.045, spreadAds: 0.02, kick: 0.011, zoom: 0.9, sfx: 'shot_ppsh',
    price: null, box: true, move: 1.0,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.72,'rel_charge']], relRate: 1,
    pap: { name: 'The Reaper', dmg: 85, mag: 115, reserve: 460 },
  },
  ump45: {
    name: 'UMP45', cls: 'smg', casing: 'pistol', fire: 'hitscan', auto: true,
    dmg: 70, headMult: 2, rpm: 750, mag: 25, reserve: 200, reload: 2.2,
    spreadHip: 0.028, spreadAds: 0.01, kick: 0.012, zoom: 0.9, sfx: 'shot_ump45', redDot: true,
    price: null, box: true, move: 1.0,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1,
    pap: { name: 'Undertaker MP', dmg: 110, mag: 40, reserve: 320 },
  },
  acr: {
    name: 'ACR', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 90, headMult: 2.5, rpm: 700, mag: 30, reserve: 210, reload: 2.3, penetrate: 2,
    spreadHip: 0.03, spreadAds: 0.007, kick: 0.014, zoom: 0.88, sfx: 'shot_acr', redDot: true,
    price: null, box: true, move: 0.97,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1,
    pap: { name: 'AC-130', dmg: 140, mag: 50, reserve: 350, penetrate: 3 },
  },
  famas: {
    name: 'FAMAS', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: false, burst: 3,
    dmg: 80, headMult: 2.5, rpm: 900, mag: 30, reserve: 210, reload: 2.4, burstDelay: 0.34, penetrate: 2,
    spreadHip: 0.032, spreadAds: 0.008, kick: 0.013, zoom: 0.88, sfx: 'shot_famas',
    price: null, box: true, move: 0.97,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1.1,
    pap: { redDot: true, name: 'G16-GL35', dmg: 130, mag: 45, reserve: 315, penetrate: 3 },
  },
  ak74u: {
    name: 'AK-74u', cls: 'smg', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 75, headMult: 2, rpm: 735, mag: 30, reserve: 210, reload: 2.3,
    spreadHip: 0.034, spreadAds: 0.013, kick: 0.013, zoom: 0.9, sfx: 'shot_ak74u', redDot: true,
    price: null, box: true, move: 1.0,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 0.9,
    pap: { name: 'AK74fu2', dmg: 120, mag: 45, reserve: 315 },
  },
  galil: {
    name: 'Galil', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 95, headMult: 2.5, rpm: 750, mag: 35, reserve: 245, reload: 2.6, penetrate: 2,
    spreadHip: 0.033, spreadAds: 0.009, kick: 0.015, zoom: 0.88, sfx: 'shot_galil',
    price: null, box: true, move: 0.95,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.7,'rel_charge']], relRate: 0.9,
    pap: { redDot: true, name: 'Lamentation', dmg: 150, mag: 55, reserve: 385, penetrate: 3 },
  },
  commando: {
    name: 'Commando', cls: 'rifle', casing: 'rifle', fire: 'hitscan', auto: true,
    dmg: 100, headMult: 2.5, rpm: 625, mag: 30, reserve: 210, reload: 2.4, penetrate: 2,
    spreadHip: 0.031, spreadAds: 0.008, kick: 0.016, zoom: 0.88, sfx: 'shot_commando', redDot: true,
    price: null, box: true, move: 0.96,
    reloadStages: [[0.08,'rel_magout'],[0.45,'rel_magin'],[0.68,'rel_charge']], relRate: 1,
    pap: { name: 'Predator', dmg: 160, mag: 45, reserve: 315, penetrate: 3 },
  },
  bowie: {
    name: 'Bowie Knife', cls: 'melee', casing: 'none', fire: 'none', auto: false,
    dmg: 1000, headMult: 1, rpm: 60, mag: 1, reserve: 0, reload: 0.1,
    spreadHip: 0, spreadAds: 0, kick: 0, zoom: 0.92, sfx: 'melee',
    price: null, box: true, move: 1.0,
    reloadStages: [], relRate: 1,
    pap: { name: 'Bowie Knife', dmg: 1600 },
  },
  monkey: {
    name: 'Monkey Bomb', cls: 'tactical', casing: 'none', fire: 'none', auto: false,
    dmg: 400, headMult: 1, rpm: 60, mag: 2, reserve: 0, reload: 0.1,
    spreadHip: 0, spreadAds: 0, kick: 0, zoom: 0.92, sfx: 'monkey_windup',
    price: null, box: true, move: 1.0,
    reloadStages: [], relRate: 1,
    pap: { name: 'Monkey Bomb', dmg: 600 },
  },
  dg2: {
    name: 'Wunderwaffe DG-2', cls: 'wonder', casing: 'none', fire: 'arc', auto: false,
    dmg: 99999, chain: 10, chainRadius: 8, rpm: 60, mag: 3, reserve: 15, reload: 4.0,
    spreadHip: 0.01, spreadAds: 0.002, kick: 0.03, zoom: 0.9, sfx: 'shot_dg2', reloadStages: [[0.15,'rel_cellout'],[0.55,'rel_cellin'],[0.80,'rel_charge']], relRate: 1.0,
    price: null, box: true, move: 0.95,
    pap: { name: 'Wunderwaffe DG-3 JZ', chain: 10, mag: 6, reserve: 30, reload: 3.2 },
  },
};

// global feel tuning: recoil is scaled per class, because kick compounds with
// rate of fire. An SMG at 900rpm stacks its climb thirty times before an LMG
// belt is half gone, so the sprayers get cut hardest; the slow, deliberate
// heavies (sniper, shotgun, launcher) keep most of their punch, since a single
// shove you have a second to recover from is the point of firing them.
// Anything here is still non-zero on purpose — the muzzle should walk, just
// not fight you.
const KICK_MUL = {
  smg: 0.45, rifle: 0.45, lmg: 0.42,
  pistol: 0.55, wonder: 0.55,
  shotgun: 0.62, sniper: 0.65, launcher: 0.65,
  melee: 1, tactical: 1,
};
// Hip-fire bloom was tuned against the OLD flat kick multiplier and is a
// separate axis of feel (how far the spray wanders), so it keeps its own
// scalar rather than shrinking along with the recoil cut above.
const BLOOM_MUL = 0.85;
// hip-fire has a SLIGHT zone of uncertainty EXCEPT rifles (precise from the
// shoulder, like CoD)
const HIP_MUL = { rifle: 0.75, sniper: 1.05, smg: 1.08, pistol: 1.08, lmg: 1.08, shotgun: 1.05, wonder: 1, launcher: 1, melee: 1, tactical: 1 };
export function getStats(id, pap) {
  // An unknown id used to throw on the very next property read, and this runs
  // during spawn from a saved loadout and from a host's cheat payload — both of
  // which can name a weapon this build does not have. A throw there happens
  // inside init(), before the first frame, so the player is left staring at a
  // black canvas. Fall back to the starting pistol and keep the game up.
  const known = WEAPONS[id] ? id : 'm1911';
  const base = WEAPONS[known];
  const out = pap
    ? { ...base, ...(base.pap || {}), id: known, pap: true, displayName: base.pap?.name || base.name }
    : { ...base, id: known, pap: false, displayName: base.name };
  const rawKick = out.kick ?? 0;
  // A bolt gun cannot compound its own recoil — you work the bolt between every
  // round — so it is tuned like the heavies no matter what class it sits in.
  // (Without this the Kar98k rides the 'rifle' cut and stops feeling like a
  // rifle you have to re-settle after.)
  out.kick = rawKick * (out.bolt ? Math.max(KICK_MUL[out.cls] ?? 0.5, KICK_MUL.sniper)
                                 : (KICK_MUL[out.cls] ?? 0.5));
  out.bloomKick = rawKick * BLOOM_MUL;
  out.spreadHip = (out.spreadHip ?? 0) * (HIP_MUL[out.cls] ?? 1);
  return out;
}

export const BOX_POOL = Object.keys(WEAPONS).filter((id) => WEAPONS[id].box);

/**
 * Ejection behaviour, keyed by the only thing the audio engine is ever handed:
 * the weapon's `sfx` name. Derived from the definitions above rather than
 * written out again, so it cannot drift when a weapon is added — a new entry
 * with no `casing` field lands on 'none' (silence) instead of inheriting
 * somebody else's brass, and scripts/validate-audio-loudness.mjs fails until it
 * is declared. `bolt` weapons hold the case until the bolt is worked, and only
 * the M1 Garand's en-bloc clip pings when the magazine runs dry.
 */
export const CASING_BY_SFX = Object.freeze(Object.fromEntries(
  Object.values(WEAPONS)
    .filter((w) => w.sfx)
    .map((w) => [w.sfx, Object.freeze({
      kind: CASING_KIND_NAMES.includes(w.casing) ? w.casing : 'none',
      bolt: !!w.bolt,
      ping: !!w.clipPing,
    })]),
));
