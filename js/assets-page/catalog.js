import { PERSONAS, LINES } from '../personas.js';

export function renderArchiveCatalog({ makeSoundButton }) {
  const $ = (id) => document.getElementById(id);
  function titleCase(value) {
    const names = {
      pap: 'Pack-a-Punch', dg2: 'Wunderwaffe DG-2', dtap: 'Double Tap', qr: 'Quick Revive',
      jug: 'Juggernog', zdeath: 'Zombie Death', magin: 'Magazine In', magout: 'Magazine Out',
      maxammo: 'Max Ammo', double: 'Double Points', insta: 'Insta-Kill',
      cellin: 'Power Cell In', cellout: 'Power Cell Out', boltopen: 'Bolt Open', boltclose: 'Bolt Close',
    };
    return value.split('_').map((word) => names[word] || word.replace(/(\d+)/, ' $1').replace(/^./, (c) => c.toUpperCase())).join(' ');
  }

  function renderGroup(host, title, sounds) {
    const section = document.createElement('section');
    section.className = 'sound-group';
    const head = document.createElement('div');
    head.className = 'sound-group-head';
    head.innerHTML = `<h3>${title}</h3><span class="sound-group-count">${String(sounds.length).padStart(2, '0')} RECORDINGS</span>`;
    const list = document.createElement('div');
    list.className = 'sound-list';
    sounds.forEach((sound) => list.append(makeSoundButton(sound)));
    section.append(head, list);
    host.append(section);
  }

  function voiceSounds(persona) {
    const events = LINES[persona.id];
    return Object.entries(events).flatMap(([event, lines]) => lines.map((line, index) => ({
      id: `vox_${persona.id}_${event}${index + 1}`,
      label: `${titleCase(event)} ${index + 1} // “${line}”`,
      kind: persona.label,
    })));
  }
  PERSONAS.forEach((persona) => renderGroup($('voice-groups'), persona.label, voiceSounds(persona)));

  const EFFECT_GROUPS = [
    ['Weapon Handling', [
      'dry', 'melee', 'knuckles', 'grenade', 'shot_rocket', 'shot_rifle', 'shot_smg', 'shot_lmg', 'shot_shotgun', 'shot_sniper',
      'reload_bolt', 'reload_mag', 'reload_shell', 'rel_magout', 'rel_magin', 'rel_boltopen', 'rel_boltclose', 'rel_slide',
      'rel_charge', 'rel_shell', 'rel_clip', 'rel_open', 'rel_close', 'rel_cellout', 'rel_cellin', 'rel_belt', 'rel_cover',
      'rel_rocket', 'rel_pump', 'rel_ping', 'bolt_kar98_out', 'bolt_kar98_in', 'bolt_mosin_out', 'bolt_mosin_in',
      'bolt_springfield_out', 'bolt_springfield_in', 'inspect_rifle', 'inspect_smg', 'inspect_pistol', 'inspect_sniper',
      'inspect_lmg', 'inspect_shotgun', 'inspect_wonder', 'inspect_launcher',
    ]],
    ['The Undead', [
      ...Array.from({ length: 10 }, (_, index) => `groan${index + 1}`),
      ...Array.from({ length: 4 }, (_, index) => `snarl${index + 1}`),
      ...Array.from({ length: 4 }, (_, index) => `zdeath${index + 1}`),
      'dog_growl', 'dog_growl2', 'dog_howl',
    ]],
    ['Factory & Field', [
      'ambience', 'step1', 'step2', 'step3', 'step4', 'hurt', 'hurt1', 'hurt2', 'hurt3', 'revive', 'hitmarker', 'explosion',
      'board_tear', 'board_build', 'door_open', 'power', 'teleporter', 'tele_zap', 'trap', 'pap', 'pap_insert', 'pap_zap',
      'pap_done', 'box_spin', 'teddy', 'monkey_windup', 'monkey_cymbal', 'buy', 'deny', 'ui',
    ]],
    ['Rounds & Power-Ups', [
      'round_start', 'round_end', 'gameover', 'count_tick', 'count_go',
      'ann_nuke', 'ann_maxammo', 'ann_double', 'ann_insta', 'ann_dogs',
    ]],
    ['Perk Machines', ['drink', 'bottle_break', 'belch', 'perk_jug', 'perk_speed', 'perk_dtap', 'perk_qr']],
    ['Music & Atmosphere', ['menu_music', 'music_box']],
  ];
  EFFECT_GROUPS.forEach(([title, ids]) => renderGroup($('effect-groups'), title, ids.map((id) => ({ id, label: titleCase(id), kind: title }))));
  $('original-music-control').append(makeSoundButton({
    id: 'beauty-of-annihilation',
    label: 'Beauty of Annihilation // Play World at War recording',
    kind: 'World at War // Der Riese',
  }));

}
