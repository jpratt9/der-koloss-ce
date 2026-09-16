// Palettes: one wardrobe entry per playable character.

/**
 * One entry per playable character, in the order game.js resolves personas
 * (dempsey, nikolai, takeo, richtofen). `skin` and `hair` feed the atlas
 * recolour in player.js; everything else is worn.
 *
 * Silhouette is what reads at twenty metres, so the four differ first in
 * headgear and coat length and only then in colour.
 */
export const SOLDIER_LOOKS = [
  {
    id: 'dempsey',
    skin: 0xc79a72, hair: 0xc2a24e,           // USMC blond, high and tight
    cloth: 0x59603f, clothDark: 0x3d4430, webbing: 0x6f6b4a,
    leather: 0x33251a, hard: 0x474f3e, accent: 0x8a2f22,
    headgear: 'helmet', coat: 'short', pack: 'haversack',
    legs: 'leggings', beard: 'none', glasses: false,
    build: { chest: 1.06, waist: 1.0, arm: 1.06 },
  },
  {
    id: 'nikolai',
    skin: 0xcaa07c, hair: 0x2b1d14,
    cloth: 0x6a6142, clothDark: 0x494330, webbing: 0x6b6248,
    leather: 0x3c2c1c, hard: 0x4a4438, accent: 0xa32a20,   // the red star
    headgear: 'fieldcap_star', coat: 'quilted', pack: 'bedroll',
    legs: 'boots', beard: 'full', glasses: false,
    build: { chest: 1.16, waist: 1.14, arm: 1.12 },
  },
  {
    id: 'takeo',
    skin: 0xd0a87e, hair: 0x14100c,
    cloth: 0x8a7d55, clothDark: 0x655c3e, webbing: 0x7d7150,
    leather: 0x4e3822, hard: 0x5a5138, accent: 0x6b5a33,
    headgear: 'havelock', coat: 'tunic', pack: 'small',
    legs: 'puttees', beard: 'moustache', glasses: false,
    build: { chest: 0.94, waist: 0.93, arm: 0.94 },
  },
  {
    id: 'richtofen',
    skin: 0xd3b795, hair: 0x30231a,
    cloth: 0x353a3b, clothDark: 0x23282a, webbing: 0x2c2f30,
    leather: 0x1d1916, hard: 0x2a2e30, accent: 0x9a8548,   // spectacle wire
    headgear: 'peakcap', coat: 'long', pack: 'satchel',
    legs: 'boots', beard: 'none', glasses: true,
    build: { chest: 0.92, waist: 0.9, arm: 0.9 },
  },
];
