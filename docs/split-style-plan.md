# Split plan: style.css

2026-09-15. Source: `count_lines.py . --threshold 500`, which found 23 files with 13,928 lines over the cap.

This continues `docs/split-weapons-plan.md`, whose plan is done. This plan covers the largest file left, `style.css`. Its §2 replaces that doc's ranking of the other files.

**Status: done.** The plan was carried out on 2026-09-15 in commits `07507e7` to `9473de6`, one per step in §1.7. It went as planned, with these notes:
- **Every file landed at the length §1.3 estimated**, because the ranges are fixed: style.css 359, 10-menu 403, 20-menu-list 202, 30-lobby 361, 40-screens 359, 50-hud 359, 60-hud-overlays 207, 70-responsive 260. index.html is 881 lines.
- **The proof held at every commit.** The files, joined in name order with their first lines dropped, are `d1d8197:style.css` byte for byte.
- **All 39 validators pass** at every commit.
- **`scripts/test-style-parts.mjs` went further than §1.6 asked**, at 109 lines rather than ~70. Before it checks the real files, it runs each check against input the check must reject: an unclosed block, a stray `}`, an open comment, an open string, relative URLs. It also feeds the link reader query strings, other link types and attributes in either order.
- **style.css's token is `?v=14`.** Each of the three steps bumped it, as §1.5 says.
- **The browser checks in §1.7 have not been run.** They need a local server.
- **The dead code in §1.8 is untouched.**

```
FILE                            LINES  SPLIT INTO
----------------------------  -------  ----------
style.css                        2502           6
js/zombies.js                    2073           5
js/cinematic-director.js         1926           4
js/map.js                        1895           4
js/player.js                     1809           4
js/audio.js                      1500           3
js/main.js                       1077           3
js/render/shaders.js             1033           3
js/render/HellhoundModel.js       960           2
js/map-props.js                   959           2
js/map-layout.js                  925           2
js/net.js                         874           2
index.html                        873           2
js/fx.js                          842           2
js/render/WeaponParts.js          794           2
js/assets-page.js                 726           2
js/render/SoldierGear.js          717           2
js/render/WeaponMaterials.js      712           2
js/props/materials.js             685           2
js/render/ZombieDetail.js         682           2
js/render/PostFX.js               680           2
js/navmesh.js                     625           2
js/hud.js                         559           2

Total excess lines: 13928
```

The plan is in two parts:
1. `style.css`: the largest file. Its seams are clean. The one real constraint is that in CSS, order is behaviour.
2. The other 22 files, ranked by risk against payoff, then the files with no clean seam.

---

## 1. style.css: 2,502 lines → style.css (359) + 7 files in style/

### 1.1 What's in it

`style.css` is one stylesheet, and only `index.html` links it. Its `====` banner comments divide it into 20 sections, followed by one legacy rule:

| Lines | Section |
|---|---|
| 1–39 | FONTS: four `@font-face` rules. Their `url('assets/fonts/…')` paths are the file's only relative URLs. |
| 40–176 | Design system: the `:root` tokens, the reset, `#game-canvas`, `.hidden`, the focus ring, the shared kicker and section-head vocabulary |
| 177–233 | SCREEN LAYER + TRANSITIONS: `.screen`, `screenIn`, `contentIn`, the sub-screen backdrops, `.overlay-dark` |
| 234–294 | BUTTONS: `.mbtn` and its variants, `.row-buttons` |
| 295–358 | PANELS: `.panel`, the panel scrollbars, the form controls |
| 359–961 | MAIN MENU (603 lines): layout and parallax backdrop (359–525), the title block and hero wordmark with its four overlays (526–760), the menu list and its "more" flyout (761–878), the field manual (879–961) |
| 962–998 | LOADING |
| 999–1297 | LOBBY |
| 1298–1321 | JOIN + SOLO PREFLIGHT MODALS |
| 1322–1419 | OPTIONS |
| 1420–1513 | CHEAT CODES, including the loadout weapon picker |
| 1514–1603 | CHARACTER SELECT / CHARACTER PAGE |
| 1604–1655 | PAUSE |
| 1656–1679 | TOAST |
| 1680–1747 | FULL-SCREEN FX OVERLAYS: damage vignette, health pulse, screen flash, directional damage |
| 1748–2220 | HUD (473 lines): the frame, crosshair and hitmarker, bottom-left (1784), bottom-right (1906), top strip (1966), minimap (2014), prompts and banners (2038), revive and down (2083), scoreboard (2109), then the co-op roster, mic indicator, radio subtitles and pointer-lock hint (2144) |
| 2221–2243 | SCOPES: the scope and red-dot overlays |
| 2244–2305 | TOUCH-DEVICE GATE |
| 2306–2458 | RESPONSIVE: 15 `@media` blocks |
| 2459–2499 | REDUCED MOTION |
| 2500–2502 | the legacy `#hud-btns` rule |

Three facts shape the plan:
- **Order is behaviour.** At equal specificity the later rule wins, and the file relies on that throughout:
  - The RESPONSIVE block at the end overrides the menu, panels, options, lobby, pause, character pages, co-op roster, scoreboard, HUD and the type scale.
  - The field manual, the loading screen, the character pages and the co-op roster re-colour kickers first styled in the shared vocabulary (155–175).
  - The options, lobby, character and pause panels restyle `.panel h2`.

  So the split cuts contiguous ranges, and the page loads them in the original order. That makes the result provable: joined in load order, the files are the original file, byte for byte (§1.7).
- **A `<link>` can't go in the middle of a file.** style.css can only give up a range from its end, so the steps work up from the bottom of the file (§1.7).
- **Two validators read the file.** One of them looks up four lobby rules, and the RESPONSIVE block overrides all four later in the file. The lookup takes the first match, so the text the validators read has to keep the original order (§1.6).

Every cut in §1.3 falls on a blank line just before a top-level banner comment, at brace depth 0 and outside any comment. No rule, block or comment crosses a cut.

### 1.2 Mechanism: numbered files, linked in order

The moved ranges go into `style/`. Each name has a two-digit prefix, so name order is load order. index.html links style.css first, then the parts, then menu-bg.css as it does today:

```html
<link rel="stylesheet" href="style.css?v=12" />
<!-- style.css continues in style/, linked in name order. That order is the cascade order: later files override earlier ones. -->
<link rel="stylesheet" href="style/10-menu.css?v=1" />
<link rel="stylesheet" href="style/20-menu-list.css?v=1" />
<link rel="stylesheet" href="style/30-lobby.css?v=1" />
<link rel="stylesheet" href="style/40-screens.css?v=1" />
<link rel="stylesheet" href="style/50-hud.css?v=1" />
<link rel="stylesheet" href="style/60-hud-overlays.css?v=1" />
<link rel="stylesheet" href="style/70-responsive.css?v=1" />
<!-- menu background plate; every rule inside is scoped to #menu-bg -->
<link rel="stylesheet" href="menu-bg.css?v=1" />
```

Each moved range is copied verbatim, below one new first line:

```css
/* Part of style.css. index.html links style.css, then the files in style/ in name order, and that order is the cascade. */
```

style.css gets a matching first line that points at `style/`.

What this buys:
- **The same cascade.** Stylesheets linked from one document cascade in document order, exactly as one file would. The file has no `@charset`, `@import` or `@namespace`, the rules that are only valid at the top of a file.
- **No waterfall.** The parser meets all eight links together in the head and fetches them in parallel.
- **One order everywhere.** The file names, the `<link>`s and the text the validators read all follow the same order, and a contract test pins them together (§1.6).
  - `ls style/` shows the cascade.
  - The gaps of 10 leave room to add a file without renaming the others.
- **No `url()` rewrites** (§1.5).

Rejected alternatives:
- **`@import`s in style.css, leaving index.html alone.**
  - The browser only finds imports after it has downloaded and parsed style.css. Every part would start a round trip later, and the render-blocking wait would grow.
  - `@import` must come before every rule, so style.css couldn't keep the foundation. The foundation would move to `style/`, and its font URLs would need rewriting.
- **Grouping rules by screen**, e.g. moving each `@media` override next to the rules it adjusts. That reorders rules. Whether a reorder is safe depends on the specificity of every other rule that touches the same elements, and no diff can prove it.
- **Names without numbers**, with the helper reading the link order out of index.html. Nothing in the file tree would show the order that decides the cascade.

### 1.3 Target files

| File | Takes from style.css | Lines, with the new first line |
|---|---|---|
| `style.css` | 1–358: the fonts, design tokens, reset, focus ring, shared vocabulary, screen layer and transitions, buttons, panels, form controls | 359 |
| `style/10-menu.css` | 359–760: `#menu` layout, the parallax backdrop, the corner labels, the two-column grid, the title block, the hero wordmark and its bloom, reactor, crackle and micro-glitch overlays, the title rule, subtitle and stamp | 403 |
| `style/20-menu-list.css` | 761–961: the menu list, the "more" flyout, the field manual and credits | 202 |
| `style/30-lobby.css` | 962–1321: loading, the lobby, the join and solo preflight modals | 361 |
| `style/40-screens.css` | 1322–1679: options, cheat codes and the loadout picker, character select and page, pause, toast | 359 |
| `style/50-hud.css` | 1680–2037: the full-screen damage and flash overlays, the HUD frame, crosshair, hitmarker, bottom-left (round, vitals, points, perks), bottom-right (weapon, ammo, grenades), the top strip, the minimap | 359 |
| `style/60-hud-overlays.css` | 2038–2243: prompts and banners, revive and down, the scoreboard, the co-op roster, mic indicator, radio subtitles, pointer-lock hint, scopes | 207 |
| `style/70-responsive.css` | 2244–2502: the touch-device gate, RESPONSIVE, REDUCED MOTION, the legacy `#hud-btns` rule | 260 |

Why these groups:
- **MAIN MENU is too big for one file** at 603 lines. It splits at its "menu list" banner: the scene and wordmark on one side, the actions and reference column on the other.
- **LOADING goes with the lobby and the join and solo modals.** Together they are the screens between the menu and a match.
- **TOAST joins the panel screens.** It has to join a neighbour, and it shows over menus as well as matches, so it goes with the panels rather than the HUD.
- **The full-screen damage overlays go with the HUD.** Both are drawn over a live match.
- **The HUD splits at its "prompts + banners" banner:** the fixed corner readouts on one side, and on the other the centre messages, the scoreboard and the co-op roster. HUD plus SCOPES in one file would be 496 lines, one edit away from the cap.
- **The touch gate, RESPONSIVE and REDUCED MOTION close the cascade.** The last two override every screen, so they have to load last.

### 1.4 What stays in style.css

Lines 1–358 stay: the foundation every other file builds on.
- **The fonts have to stay.** CSS resolves a relative URL against the stylesheet, and `url('assets/fonts/…')` is only right from the repo root.
- **Everything else that stays is shared by more than one screen:** the tokens and reset, the focus ring, the kicker vocabulary, `.screen` with `screenIn` and `contentIn`, `.mbtn`, `.panel` and the form controls.
- **style.css stays the first `<link>`,** with its token bumped from `?v=11` to `?v=12`.

Unlike `js/weapons.js`, a stylesheet can't re-export, so its one caller changes (§1.5).

### 1.5 Links, URLs and cache tokens

**Callers.** index.html:83 is the only link to style.css.
- `about/` and `assets/` link site.css. 404.html and cinematic.html link neither.
- index.html gains 1 comment and 7 links, going from 873 to 881 lines.

**URLs: none change.**
- The only relative URLs are the four font `src`s, which stay in style.css.
- The `data:` URIs are absolute: the menu film grain (463), the stamp mask (752–753) and the gate grain (2259).
- `filter: url(#fx-title-plasma)` (656) and `url(#fx-title-crackle)` (671) move to 10-menu.css. They point at the SVG filters in index.html (197, 212). A fragment-only URL refers to the current document wherever the stylesheet lives. Still, these are the only references whose stylesheet changes directory, so step 3's browser check looks at them.

**Cache tokens.**
- Each new link gets `?v=1`, like menu-bg.css.
- The rule against query strings on JS imports doesn't apply. That rule exists because a query string loads a second copy of a module, and a stylesheet linked once has no second copy to load.
- Every step changes style.css, so every step bumps its token.
  - A browser with an older style.css cached would apply some rules twice, in the same order, with the same result.
  - So the bump is hygiene, not a fix.

**Cross-file references.** Keyframes, custom properties and classes are global to the page, so these keep working across files:

| Defined in | Used in |
|---|---|
| style.css: `screenIn` | 60-hud-overlays.css (`#down-overlay`) |
| style.css: `contentIn` | 40-screens.css (`.pause-shell`), 60-hud-overlays.css (`#scoreboard`), 70-responsive.css (`.device-gate-card`) |
| 10-menu.css: `.fog-layer`, `grainJit` | 70-responsive.css (the device gate) |
| 20-menu-list.css: `idleBreath` | 10-menu.css (`.title-rule em`) |
| 30-lobby.css: `slotIn` | 40-screens.css (`.char-card`) |

Every file also reads the `:root` tokens in style.css. No part works alone, which is fine because index.html is the only page that loads them.

**Deploy.**
- `style/` isn't listed in .vercelignore or .gitignore.
- No vercel.json header rule matches `/style.css` or `/style/`, so both get the same catch-all headers.
- The CSP's `style-src 'self'` covers same-origin files.
- Vercel and `python3 -m http.server` both serve `.css` as `text/css`, which the `nosniff` header requires.

**Circular imports: none.** `<link>`s can't form a cycle, and the contract test in §1.6 forbids `@import`.

### 1.6 Validators

**Text pins (2 files).** Both read style.css:

| Validator | What it checks | Where the text ends up |
|---|---|---|
| validate-game-invariants | `cssDeclarations()` on `.lobby-fullscreen-prompt`, `.lobby-fullscreen-note`, `#lobby .lobby-secondary-action` and `#lobby .lobby-action-row` | 30-lobby.css |
| validate-game-invariants | every `width` of `#lobby .lobby-secondary-action` (at least 3, none 100%) | 30-lobby.css and 70-responsive.css |
| validate-game-invariants | the 700px and 440px `@media` rules for `#lobby .lobby-action-row` | 70-responsive.css |
| test-multiplayer-contracts | the `#multiplayer-roster` width | 60-hud-overlays.css |
| test-multiplayer-contracts | its 700px `@media` override | 70-responsive.css |

The change:
1. **Generalize the source helper.** In `scripts/lib/game-source.mjs`, `readSplitSource(name)` becomes `readSplitSource(base, name, ext)`.
   - `readGameSource()` and `readWeaponsSource()` pass `js/` and `.js`, and return exactly what they do today.
   - The new `readStyleSource()` passes the repo root and `.css`. It returns style.css, then `style/*.css` in name order, joined.
   - The file's header comment gains a sentence about the stylesheet.
2. **Switch the reads.** Each validator swaps its one read of style.css for `readStyleSource()`, added to its existing import from `./lib/game-source.mjs`.

The pins themselves don't change.

**Order-sensitive pins: the four `cssDeclarations()` lookups.** `cssDeclarations(selector)` returns the first rule that matches, and the RESPONSIVE block overrides all four selectors later in the file. Joined in any other order, each lookup would land on an override:
- **`.lobby-fullscreen-prompt`:** the 820px-high override has no `align-items`, so the check fails.
- **`.lobby-fullscreen-note`:** the 440px override's `font-size: 15px` is under the floor of 16, so the check fails.
- **`#lobby .lobby-action-row`:** the 700px override has no `display`, so the check fails.
- **`#lobby .lobby-secondary-action`:** the 700px override's `min(440px, 88%)` still passes, so the check would quietly test the wrong rule.

That is why name order has to be load order.

**New: `scripts/test-style-parts.mjs` (~70 lines).** This is the stylesheet counterpart of test-weapon-modules. It checks:
- **The links match the files.** index.html's stylesheet `<link>`s, with query strings stripped, are exactly style.css, then every `style/*.css` in name order, then menu-bg.css. A part that is unlinked, linked twice or linked out of order fails.
- **Every file is whole.** Outside comments and strings, the braces balance and never go negative, and no comment or string is left open at the end.
  - In one file, an unclosed block swallows the next section, where someone will see it.
  - Split across files, the next file parses cleanly and the break hides.
- **Nothing in `style/` needs the root as its base.** There is no `@import`, and no `url()` other than `url(#…)` and `url("data:…")`. A relative URL in `style/` would resolve against `style/`, not the page.
- **`readStyleSource()` holds every file**, in link order.

**No validator splits.** No validator covers style.css alone. The two that read it are under the cap (463 and 350 lines), and CSS is a small part of each.

**Behavioural: none.** No validator loads the CSS into a page.

### 1.7 Steps, ordered by risk against payoff

Each step is one commit. Run `for f in scripts/*.mjs; do node "$f" || exit 1; done` before and after each one.

The browser checks need a local server. Ask John before starting one.

**The order is forced.** A `<link>` can't go in the middle of style.css, so each step moves a range off its end. Within that order, each step groups files so one browser pass covers one part of the game.

| # | Change | Out of style.css | Risk | Browser check |
|---|---|---|---|---|
| 1 | `readStyleSource()`, the 2 validators switched over, `test-style-parts.mjs`, style.css's first line, the index.html comment; **70-responsive.css**, **60-hud-overlays.css**, **50-hud.css** | 823 | Very low. The files move verbatim. The roster and `@media` pins now read across files, and the four lookups prove the join keeps the order. | solo match: HUD corners, damage arc, low and empty ammo, a prompt, a round banner, the scoreboard, a scope and a red dot. Co-op: the roster and voice indicator. The match at 700px wide and at 780px high. Touch-device emulation (the gate). Reduced-motion emulation. |
| 2 | **40-screens.css**, **30-lobby.css** | 718 | Very low. The four lookups now read across a file boundary. | the loading screen, the lobby as host and as guest, the join modal, solo preflight, options (sliders and switches), cheats (weapon list scroll), character select and page, pause, a toast |
| 3 | **20-menu-list.css**, **10-menu.css** | 603 | Low. This step moves the two title filters, the only URLs whose stylesheet changes directory (§1.5). | main menu: the backdrop layers; the wordmark's reactor, crackle and micro-glitch; the stamp; list hover and the idle rail; the "more" flyout; the field manual toggle. Windows 620px and 520px high, and 700px wide. Reduced motion. |

**Proof for every step.** Use a throwaway command, not a committed test. Before step 1, note the current commit as `<base>`. After each step, this must print nothing:

```sh
diff <(git show <base>:style.css) <(for f in style.css style/*.css; do tail -n +2 "$f"; done)
```

It drops each file's new first line and joins the files in name order. Name order is link order, so if the result is the original file byte for byte, the cascade is unchanged.

### 1.8 Dead code found

This plan doesn't touch any of it. Whether to remove it is John's call.

- **`#hud-btns` (2500–2501).** Its comment says the markup is no longer shipped. Nothing in index.html or js/ uses the id.
- **The legacy aliases `--red`, `--dim`, `--panel` and `--line` (83–87).** The comment says older rules still reference them, but nothing on the game page does. site.css declares its own copies for the about and assets pages.
- **Not dead:** `.scene-ridge` and `#skyline` are hidden on purpose, and the comment at 409–416 explains why.

### 1.9 Docs and comments

- **README.md, AGENTS.md, RENDERING.md and llms.txt** don't mention style.css, so none of them needs an update.
- **The comment at index.html:84** about menu-bg.css stays with its link, which now comes after the part links.

---

## 2. The other 22 files, ranked

These verdicts come from the structural skim behind `docs/split-weapons-plan.md` §2.
- No commit since then has touched any of these files.
- Three facts that depend on other files were checked again: the WeaponParts importers, the shader filter and the player.js readers.

Each file gets a full read and its own plan before it is split.

| Rank | File | Lines | Seams | Notes |
|---|---|---|---|---|
| 1 | js/zombies.js | 2,073 | Its first ~1,000 lines are clean: the model and corpse builders, `ZombieVisual` and its bound measurements, the hit hulls and aim points, the pose functions. `ZombieManager` (1048–2073) is one class. | The largest JS file left, and the headless zombie validators build through it. `ZombieManager` can use `installMixins`, which is now in utils.js. |
| 2 | js/player.js | 1,809 | Clean: `LocalPlayer` (11–668), the soldier eye, atlas and arm-IK helpers (669–1070), `SoldierVisual` (1071–1579), `RemotePlayer` (1580–1809) | `LocalPlayer` alone stays ~160 lines over: use `installMixins`, or accept it. 7 validators read its text. |
| 3 | js/render/shaders.js | 1,033 | The cleanest seam in the repo: independent GLSL strings | validate-module-syntax finds shader files with `/shaders\.js$/`, so that filter has to widen. |
| 4 | js/map-layout.js | 925 | Clean: topology tables on one side, `auditMapStructure` and `auditMapEgress` on the other | Pure module |
| 5 | js/audio.js | 1,500 | One 1,323-line `AudioEngine` (177–1500). Use `installMixins`, splitting along jingles, song and music box, ambience, and listener and room. | none |
| 6 | js/main.js | 1,077 | 46 functions share module-level `app` and options state. `boot` is 300 lines. | The shared state has to move into a module first. Heavily pinned. |
| 7 | js/net.js, js/fx.js | 874, 842 | One class each (`Net` 93–874, `FX` 59–785). Use `installMixins`. | net.js holds the event allowlists, so treat it like the game split's remote-combat step. |
| 8 | js/render/HellhoundModel.js, js/render/WeaponMaterials.js, js/props/materials.js, js/render/SoldierGear.js | 960, 712, 685, 717 | Clean top-level builder groups | none |
| 9 | js/render/WeaponParts.js, js/render/ZombieDetail.js | 794, 682 | Clean function groups | 12 files in js/weapons/, plus render/WeaponHands.js, import WeaponParts. Keep WeaponParts.js re-exporting whatever moves out of it. |
| 10 | js/cinematic-director.js | 1,926 | Clean: the `SHOTS` table, the cast builders, `seek` | Not deployed, so low payoff |
| 11 | js/assets-page.js | 726 | Many small functions | Only the /assets page uses it, so low payoff |
| — | js/hud.js, js/navmesh.js, js/render/PostFX.js | 559, 625, 680 | Marginal: one class each, 60–180 lines over | A split would likely cost more than it pays. Revisit if they grow. |

### No clean seam: don't force these

- **js/map.js (1,895 lines).**
  - One `buildMap` closure is 1,833 lines, and every inner helper reads its locals.
  - Splitting it means threading a context object through all of it.
  - Every headless-map validator builds the map through it.
- **js/map-props.js (959 lines).** One 933-line `decorateMap` closure, with the same problem.
- **index.html (873 lines, 881 after §1).**
  - It is static markup, and with no build step there's no way to include partials.
  - Only the 183-line inline presentation script (685–867 before §1) can move out to a module file, which still leaves ~700 lines.
