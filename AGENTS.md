# AGENTS.md — handoff notes for any coding agent (Claude Code, Codex, Cursor, …)

Photography portfolio with a quiet "zen" UI and a small admin ("backstage").
Current look is **v3 "zen"** (Nov 2026): no glass anywhere; plain type on photographs, grey rice-paper sections,
lots of empty space. Type system from the owner's reference screenshot: mono letter-spaced capitals for every label/number
(`--mono`), italic display serif for English (`--serif`), heavy Song with a gold fade for big Chinese titles (`--song`, `--gold`).
v2 ("paper + glass") is in `.backups/before-zen-redesign/`; v1 (all-dark) is in `versions/v1-liquid-glass/` — do not delete either.

## Project ledger — read this first when the owner talks about albums

The table below records, per album, its style, what it held, a fingerprint (`Sig`) of it, a version (bumped by each
agent pass) and who changed it last. `python3 scripts/ledger.py` compares it with the live backstage content
(`public/data/content.json`) and prints every album that is **NEW**, **CHANGED** (edited in the backstage since its
row was written: photos added / removed / reordered, captions, title, cover…) or **REMOVED**.

**Workflow** — run the check at the start of any request about albums ("build the new projects", "added photo",
"update X", "what changed?"), then:

1. **NEW album** and the owner wants new albums built → lay it out in the site's current house style for albums,
   which is **时空集** (skill `.claude/skills/spatial-album/`; the 新疆 approach): new place tones, textile strip,
   chapters, captions. Ask nothing first unless the photos are ambiguous.
2. **CHANGED album** → do not assume. **Ask the owner**: "Should I continue as always? (blend the new photographs into
   the rest of the album)" — or follow their own instructions instead.
   **Exception:** when the owner's message already says **"added photo(s)"** for that album, that *is* the answer:
   blend the new photographs into the album's existing style (chapter, caption in the album's voice, layout that keeps
   the rhythm; no style change).
3. **REMOVED album** → mention it; `--record` drops the row.
4. After you change an album: `python3 scripts/ledger.py --record agent "<what you did>" <title|slug|id>`.
   If the owner says to leave their edit as it is: `--record user "<their edit>" <album>` (no version bump).
5. Never edit the table by hand except the Notes cell; the script writes it.

<!-- ledger:start -->
| Album | id | Style | Items | Sig | Ver | Last change | Notes |
|---|---|---|---|---|---|---|---|
| 彩云之南 | `mwl4uvcugvpo0` | dian | 39 ph / 13 txt | 60bd4fd2 | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21); chapter line drawings (code, Nov 21) |
| 徽州 | `mwmr1dqe105a5` | huizhou | 21 ph / 7 txt | 3e6716ed | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21) |
| Paris | `mwl4fiotklvap` | paris | 35 ph / 18 txt | 4c1f75f2 | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21) |
| 北京 | `mwl4oippauve5` | beijing | 36 ph / 9 txt | 967a9e8d | v1 | agent 2026-11-21 | beijing zen; 神武门 snow photo blended into 雪 |
| 新疆 | `mwjmi8ubzaj03` | xinjiang | 14 ph / 6 txt | aaeb1124 | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21); chapter line drawings (code, Nov 21) |
| Fujisan | `mwpc8f4i4e7ja` | fuji | 10 ph / 5 txt | 4cf5492f | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21); chapter line drawings (code, Nov 21) |
| Deep in the Alps | `mwl4kwkz15m33` | alps | 10 ph / 5 txt | a7dd6de3 | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21); chapter line drawings (code, Nov 21) |
| Yunnan | `mwmd69nuoum0t` | yunnan | 51 ph / 9 txt | be445500 | v1 | agent 2026-11-21 | baseline: yunnan field-journal theme |
| 灵隐寺 | `mwpc344zeznhz` | lingyin | 12 ph / 5 txt | 5676390b | v2 | agent 2026-11-21 | lone singles: side notes / pairs (Nov 21); chapter line drawings (code, Nov 21) |
<!-- ledger:end -->

## Hard constraints

- **No dependencies, no build step.** Vanilla HTML/CSS/JS; the server is Python **standard library only**.
  The machine has system Python 3.9 and **no Node** — do not add npm, bundlers, frameworks or pip packages
  without asking. Keep Python 3.8/3.9-compatible syntax (no `match`, no `X | Y` type unions).
- **`public/` must stay a fully static site.** It is deployed as-is (GitHub Pages via
  `.github/workflows/pages.yml`). It may only read `data/content.json` and `uploads/*`; it must never call `/api/*`.
- **Relative URLs only** inside `public/` (`data/…`, `uploads/…`, `#/p/slug`) so it works under a sub-path.
- Desktop-first, with a phone layout in `public/css/mobile.css` (loaded last; `max-width: 760px`): album tabs hidden
  (brand pill leads home), every side-by-side layout stacked, full-screen shots shown whole via `--ar` on `.panel.shot`.

## Run

```bash
python3 server.py          # site: http://localhost:4173   admin: http://localhost:4173/admin
python3 scripts/make_demo.py --force   # regenerate placeholder SVG "photos" + sample content
```

Env: `PORT`, `HOST` (default 127.0.0.1), `ADMIN_PASSWORD` (overrides `.admin.json`), `CONTENT_DIR`.
`start.command` is the owner's double-click launcher. There are no automated tests; verify in a browser.

## Layout

```
server.py              static server + JSON API (auth, content, uploads)
start.command          macOS launcher
public/                THE SITE (static, deployable)
  index.html           shell: nav, albums menu, #view, HUD
  css/site.css         shared styling (themes: yunnan/paris/huizhou/beijing.css, phones: mobile.css)
  js/site.js           router, templates, threshold, scroll loop, charge, zoom lens
  data/content.json    all content (written by the admin)
  uploads/             images (<id>.jpg + <id>_s.jpg thumbnail); uploads/demo/ = placeholders
admin/                 backstage UI, served at /admin by server.py (NOT deployed)
  index.html · admin.css · admin.js
scripts/make_demo.py   demo content generator
docs/                  README screenshots (taken from v1)
versions/              frozen copies of earlier looks (not deployed)
.admin.json            password hash (gitignored)   .backups/  content.json history (gitignored)
```

## Content schema (`public/data/content.json`)

```jsonc
{
  "site": { "title", "tagline", "intro", "footer", "email", "instagram" },  // intro = big statement on the home page
  "hero": {                       // the pinned top page ("常驻页面")
    "mode": "project" | "custom", // project = feature + link to a project; custom = free content
    "projectId", "kicker", "title", "text",   // empty title/text fall back to the project's
    "linkLabel", "linkUrl",       // linkUrl used in custom mode only
    "image", "imageThumb", "focus": [x%, y%]  // custom background
  },
  "projects": [{                  // array order = gallery order = "next project" queue (wraps around)
    "id", "slug", "title", "subtitle", "description",
    "place", "placeEn", "coords",  // title plate: big word (else title), English italic line (else subtitle), "39.92°N · 116.39°E"
    "cover": "<photo id>", "published": true,
    "theme": "" | "indigo" | "yunnan" | "paris" | "huizhou" | "beijing" | "caiyun" | "xinjiang" | "fuji" | "alps" | "dian" | "lingyin", // page style; indigo = dark tie-dye, yunnan = editorial field journal,
                                  // paris = limestone + Didot, street-sign chapters (public/css/paris.css)
    "photos": [{ "type": "image"|"stack"|"video"|"youtube"|"text",   // missing = image
                 "id", "src", "thumb", "w", "h", "caption",
                 "focus": [x%, y%],             // object-position when cropped to fill
                 "layout": "auto"|"fill"|"fit"|"wide"|"pair",   // pair = sit side by side with the next photo
                 "note": "中文\nEnglish",              // side note: shown beside the photo when it ends up as a single framed photo
                                                       // (.spread.single.note, sideNote in site.js); ignored in pairs / full-bleed
                 "mid": "uploads/<id>_m.avif",  // 2560px AVIF display copy the page shows; "src" (5120px) only loads in zoom
                 "fx": "" | "mist" | "dawn" | "sparkle" | "embers" | "fireworks" }]   // embers = rising sparks (CSS), fireworks = canvas bursts while on screen (startFireworks)   // sparkle = twinkling lights on the bright parts (sparkleHTML / placeSparkles)  // mist = drifting cloud overlay; dawn = pinned, scroll raises the sun   // fill = always full-bleed, fit = always framed on paper,
                                                       // wide = whole photo at screen width (.panel.wide), snaps by its centre
  }]
}
// stack:   + "layers": [{ "id","src","thumb","w","h","label" }]  — src/thumb/w/h mirror layers[0] (admin syncStack)
//            layout "fill" = full screen, otherwise framed on paper
// video:   src = uploads/<id>.mp4|mov|webm, thumb = poster jpg (may be ""), layout "fill" | framed
// youtube: "yt" (11-char id), "url", thumb = i.ytimg.com poster, w/h = aspect ratio; always framed
// stack:   layout "scroll" = horizontal handscroll (rollHTML / sizeRolls / rolls in frame)
// text:    "style": "" | "chapter" (numbered 壹贰叁…, vertical title, "kicker" English line, "ornament"
//          (时空集 pages: "sketch" = chapter line drawing, see Gotchas → 时空集)
//          contour|flags|shibori|roofs|rose|opera|seine|versailles|huiwalls|fishdance|eaves|studs|none; scenes (SCENES) draw on
//          paris / huizhou / beijing pages, studs only on beijing —
//          opera/seine/versailles are line-drawn scenes (SCENES). On a paris page a plain text block's "ornament" can be a
//          small line drawing above the verse: metro|cafe|lamp|chandelier|eiffel|fish|lantern|cloud (DOODLES)., plus "kicker" on plain blocks too. shibori = tie-dye medallions
//          (`drawShibori`, seeded, avoids the text boxes).
// text:    "tone": "" | indigo|dye|jade|maroon|dusk|night — indigo pages only: the whole page re-dyes to that
//          colour as the block scrolls in (`TONES`, `applyTones` in frame → --cloth/--cloth-hi/--cloth-lo/--pink*/
//          --accent/--pat on body). "" = keep the previous colour. --pat fades in the tie-dye dot tile (.paper::before).
// text:    subtitle block on paper — "title", "caption", "align" left|center|right, "height" px ("" = auto),
//          "size" / "csize" px ("" = auto), "font" serif|sans|song|kai|mono, "color" #rrggbb ("" = ink).
//          Not counted or numbered as a picture (`countOf`, `num[]` in layoutShots); breaks auto pairs.
```
Only image and stack modules can be a project cover (`visual()` in both JS files).

Unpublished projects are filtered client-side, so they are still present in the public JSON.

## API (`server.py`, cookie session, all JSON)

`GET /api/state` · `POST /api/setup {password}` (localhost only, first run) · `POST /api/login` · `POST /api/logout`
· `GET|PUT /api/content` (PUT replaces the whole document, backs up the old one; GET returns an `X-Content-Rev`
header = sha1 of content.json, and PUT must send it back as `If-Match` or gets **409** — so a stale backstage tab,
or one opened before an agent edited content.json by hand, can't overwrite newer content. This actually happened
once: keep it) ·
`POST /api/upload?ext=jpg[&id=…&thumb=1]` (raw body, streamed to disk; images ≤ 60 MB, videos mp4/m4v/mov/webm ≤ 95 MB
because GitHub refuses files over 100 MB) · `POST /api/delete-file {files:[…]}` · `POST /api/password`.

Static files are served with HTTP byte ranges (Safari needs them for `<video>`).
**Display copies (performance):** the page never shows the 5120px originals (≈5.5 MB / 17 MP each — decoding ~30 of
them per page was what made scrolling stutter). `img()` uses `mid` (2560px AVIF q60, ≈0.3 MB; browsers without AVIF fall back to the original via `onerror`) and keeps the original in
`data-full`; `openZoom` swaps the original in for the magnifier. New uploads: the server makes `<id>_m.avif` with `sips` (`make_display` in server.py, returned as `mid`); only where
sips is missing does `processFile` upload a JPEG copy (`/api/upload?size=m`); `scripts/make_display.py` (macOS `sips`) fills in older photos — run it if a photo has no `mid`.
Deploys run `scripts/prune_unused.py` so uploads no album references aren't published (GitHub Pages limit is 1 GB).

Images are resized **in the browser** (`admin.js → processFile`, max edge 5120px, thumb 640px; the AVIF display copy is made by the server) because the
server has no image library.

## Front-end map (`public/js/site.js`)

- **Routes**: `#/` home (`.threshold` → paper `.intro` with statement + album index → one `.panel.proj` per project →
  paper footer); `#/p/<slug>` project (cover panel → paper `.preface` → photos → `.next` block). `render()` swaps `#view` with a dissolve.
- **Threshold** (`thresholdHTML` / `Threshold` in site.js): the home page's first screen. Paper with a round opening (clip-path circle
  on `.th-ap`) ringed by a baked dry-brush ensō (`ensoURL`, drawn in with a conic mask). Album covers cross-fade inside it every 5.6 s;
  it breathes, drifts with the mouse and closes/reopens on each change; hovering a name in `.th-list` holds that album. Scrolling
  (290vh section) opens the circle to full screen and fades in the title plate. `hero.projectId` picks the first album.
- **Landing page plug-in** (Nov 2026 trial): a script loaded before site.js may set `window.HomeLanding = { html(api), setup(view, api) }`;
  `homeHTML` then uses it instead of the threshold. `js/home-gallery.js` + `css/home-gallery.css` = 时空画廊 (photos floating in a 3D room,
  slow forward drift, film-edge type, hover glow + album card, room-colour swatches; `Dust` = light motes on two canvases
  behind/in front of the photos, projected with the same camera, streaking when the room moves fast). The "Matrix" trial (canvas slideshow with character transitions) was not chosen;
  it is kept locally in `.backups/matrix-home/` (gitignored) and the runnable `../PhotographyWEB-matrix` folder.
- **Loading screen** (`#loader` markup + `js/loader.js` right after it, `css/loader.css`): starfield, site name, hairline bar with
  real progress (content + the gallery's images, ≥1.4 s, gives up at 10 s). On the home page at 100 % the stars streak (fly forward),
  then `HomeLanding.warp()` starts 时空画廊 at speed and it eases down to its drift. Other routes just fade it out. `html.loading`
  locks scrolling meanwhile. Colour follows the gallery room colour (localStorage `sg-bg`).
- **Title plate** (`plate()`): the screenshot layout over covers, home panels and the opened threshold — mono top row (album n/N,
  coords), big title bottom-left, English italic + cover caption (`capRich`) + frame count beside it, outlined pill bottom-right.
- **Nav / menu**: brand left, `#where` (album number + place) centre, "Albums" right opens `#menu`, a full-screen index with a
  cover peek. There is no album tab bar any more.
- **Captions** everywhere go through `capRich`: English line in italic serif, Chinese line small and letter-spaced.
- **Film-edge text** (`frame1`, "Film-edge text" in site.css): framed photos carry the type that runs along a negative's rebate —
  a row `7 ▸ 7A  ALBUM NAME  8 ▸` and a vertical line (number — album — coords). Variants fe-a / fe-b / fe-c alternate. No film drawn.
- **Photo layout** (`layoutShots`): auto landscapes alternate between a full-bleed `.panel.shot` and a paper
  `.spread` holding a pair of framed photos (`.frame`, numbered caption underneath); portraits are always framed;
  a leftover photo becomes a `.spread.single`. `fill` forces full-bleed, `fit` forces framed.
- **Paper sections** (`.paper`): light background, dark ink (`--pink*` tokens), serif (`--serif`, system fonts
  only — no web-font download). While a `.paper` section is under the nav the scroll loop sets `body.on-light`,
  which turns the nav type to dark ink.
- **Scroll-driven motion** (all in `frame`): `.panel.grow` gets `--f` (1 = framed inside paper margins, 0 =
  full-bleed) so panels open up as they reach the centre; `.words` statements light up word by word. A pair of two landscapes is a `.spread.swap`: a 230vh section with a sticky `.stick`,
  where the loop trades the two photos' sizes (`--s`, grid columns 7fr/4fr ↔ 4fr/7fr) and rewinds on scroll-up.
  Landscape + portrait pairs do not swap. Clicking any photo (`ZOOMABLE`: framed photos, full-screen shots, the album cover, time stacks — not home-page
  panels, which are links, and not videos) opens it full screen (`openZoom` / `closeZoom`; `zoomFrom` animates from the
  exact cropped spot using a uniform scale + clip-path) —
  "zoom mode". In zoom mode a mouse pointer becomes a 2× glass magnifier (`Lens`: canvas; the photo is read into memory once
  per zoom at ½/¼/⅛ resolutions too, and a per-pixel lookup table is built once). Centre 2×; the rim (`B`) refracts like a
  glass bead edge, sampling up to `EDGE`× the radius away, with red/green/blue split by `DISPERSION`; squeezed rim pixels
  read from the smaller copies to avoid sparkle. Nothing opaque is drawn (owner's request: no shadow, tint or solid
  ring). A bevelled "small lens" edge between centre and rim was tried and rejected by the owner. Sizes: R 144, B 33. Cursor hidden over the photo.
- **Time stacks** (`stackHTML`, `stacks` in `frame`): a tall section with a sticky frame; scroll progress cross-fades
  layer to layer (hold → fade → hold), so mid-fade is a 50/50 average. Tick marks + layer `label` update with it.
- **Video / YouTube** (`mediaHTML`, `playMedia`): muted autoplay when ≥35 % on screen, pause when off. YouTube iframes
  (youtube-nocookie) are created on first view and paused/resumed via the iframe postMessage API. Framed media are not zoomable. Framed photos and paper text reveal once via the IntersectionObserver (`.in`).
- **Eased wheel scrolling** (`Smooth`, `SMOOTH = 0.13`): wheel/trackpad input moves a target and the page glides to it
  (non-linear, frame-rate independent); keys, scrollbar and touch stay native; inner scrollers and zoom mode are left
  alone. Set `SMOOTH = 0` to turn it off. `trySnap` waits until it has settled.
- **Scroll loop** (`frame`): all element rects are read first (`rect()` cache per frame), then styles are written — keep
  it that way (a read after a write forces a full layout mid-frame). parallax on `.bg img` (`data-plx` = % of travel), picks the centred panel to drive
  the caption HUD (full-bleed shots only), and decays the charge.
- **Keep-scrolling charge** (`feed` / `fire`): only counts once the page has rested at the very bottom for
  380 ms (so trackpad inertia does not trigger it). Wheel/touch/keys add to `charge.v` (0→1), exposed to CSS as
  `--charge` on `#next`. It drains at 0.9/s when input stops. At 1, a `.warp` overlay grows from the block to
  full screen, then the route changes underneath it. Tune feel via the divisors in the `wheel`/`touchmove`
  listeners and the decay rate.
- **Liquid Glass was removed** (owner's request, Nov 2026). The zoom-mode magnifier (`Lens`) is still there.
- **Auto-hiding chrome** (`setUI` / `poke`, `body.ui-off` / `body.ui-on`): scrolling down half a screen (`HIDE_DOWN`) or `IDLE_MS` (5 s) without
  input wipes away the nav, caption HUD, project cover card and scroll hints with an iridescent mask sweep;
  only a click/tap, mouse movement inside the top 20 % of the screen (`TOP_ZONE`; ignored for 700 ms after
  any scroll), Tab, or scrolling up by half a screen (`SHOW_UP`, measured from the lowest point reached)
  restores them. The home-page cards (`.hero .card`, `.proj .card`) are
  intentionally excluded — to change what hides, edit the selector list in the "Auto-hiding chrome" CSS block.
- Photos stay untouched: no overlays tint them (the 徽州 lantern glow hides over photographs).

- **Captions** may have two lines ("中文\nEnglish"): `capHTML` sets them as main + small line; the HUD joins them.
- **彩云之南** (project-vpo0) is the showcase for the indigo theme: chapters, handscroll, mist, dawn. Its pre-redesign
  content is in `.backups/content-before-yunnan-redesign.json`.
- **Yunnan** (`#/p/yunnan`, id `mwmd69nuoum0t`) is a separate project from 彩云之南. Its `theme: "yunnan"`
  uses `yunnanHTML` in `site.js` and scoped `public/css/yunnan.css`: five English chapters, paper/indigo spreads,
  original-photo handscroll, scroll-lit mountain and a fixed chapter guide. Chapter text (`style: "chapter"`),
  captions, photos and stacks are ordinary backstage modules. The guide derives from these chapters; no new
  content fields. All 51 original photos are retained (five river photos are layers in a scroll stack).
  Reduced motion / narrow screens use a native horizontal river gallery. Pre-edit copies are in
  `.backups/yunnan-journal-original/`. Do not apply this design to 彩云之南 or frozen versions.
  Chapter colours: mist green → uneven indigo dye → warm earth with a red-ochre opening → mineral grey →
  midnight blue. `ynDyeHTML` adds stitched resist-dye rings/petal knots to the old-town opening and interlude;
  patterns stay on the page around the photographs. The chapter guide follows the existing auto-hiding chrome.

## Admin map (`admin/admin.js`)

Content cards and stack layers are reordered with a pointer-based sortable (press anywhere that isn't an input,
drag; others slide aside via FLIP; the dragged card is moved to `<body>` while lifted because `.cardbox` has a
backdrop-filter that would trap `position: fixed`). Stacks are uploaded as a group (sorted by file name), videos via
XHR so progress shows, YouTube via a pasted link (`parseYouTube`).

One in-memory `doc`; inputs carry `data-bind="path.into.doc"`, buttons `data-act="…"`; every change calls
`dirty()` → debounced `save()` (PUT whole doc). Structural changes call `render()`; typing does not re-render.
`sel` is `'hero' | 'site' | <project id>`.

## Owner's wishes about AI

The owner does not want their photographs used to train AI. `index.html` carries `noai`/`noimageai` and
`tdm-reservation` meta tags and `public/robots.txt` blocks AI-training crawlers (effective once the site has its own
domain). Keep these.

## Gotchas

- **Zen design concept** (owner's name for it): the shared approach of the 徽州, 北京 and 彩云之南 pages — quiet tones that change per
  chapter, vertical Song-light titles, one small seal/dot for the number, one drawn line per chapter, faint ornaments, lots of
  empty space, photos that reveal softly. 彩云之南 used `theme: "caiyun"` until Nov 21 2026 (now 时空集 `dian`; the zen code is kept: `caiyunChapterHTML`, `css/caiyun.css`, tones cloud /
  indigodusk / jadewater / ochre / snowlight / night); the old dark `indigo` theme is unused but kept.
- **No lone single photos on one side** (owner, Nov 21 2026): a framed photo that would sit alone on one side of an empty
  page must either pair with a neighbour (`layout: "pair"` on the first) or carry a `note` (a few lines in the album's
  voice, 中文\nEnglish), which fills the free half. No fitting text → pair it. 北京 centres its singles on the axis
  (beijing.css) and is left as is.
- **No fades on photos or video** (owner: 绝对不要): never put gradient/mask edges, paper gradients or overlaps on photographs or
  films — they keep hard full edges. The `.next` hand-off is a blurred copy (`.next-blur`) whose opacity drops as the block
  scrolls in (`--nb`, set in `frame`), not a spatial gradient.
- **Full-width film**: a YouTube module with `layout: "fill"` plays muted with `controls=0` (iframe scaled 1.24 to crop YouTube's
  overlays, pointer-events off); clicking opens `.ytmodal` full screen with sound (`openFilm`).
- **时空集 "Spatial Album"** (codename; skill `.claude/skills/spatial-album/`): themes `xinjiang` / `fuji` / `alps` / `dian` (彩云之南) / `lingyin` (灵隐寺) (`SPATIAL` in
  site.js → `body.spatial`, `css/spatial.css`). Quiet chapter openings (`spatialChapterHTML`: meta row, the place's textile strip —
  `ikatSVG` 艾德莱斯 / `seigaihaSVG` 青海波 / `stitchSVG` Swiss cross-stitch / `zharanSVG` 白族扎染 (always indigo + white) /
  `latticeSVG` 灵隐 窗棂 lattice + lotus — plus a line drawing in the empty half (`sketchSVG`, library `SKETCHES`: road · dunes ·
  lake · willow · blossom · fuji · lakelamp · torii · toro · chochin · chalet · peaks · starhut · matterhorn · clouds · umbrella ·
  river · stupa · milkyway · incense · lattice · eave · bamboo · lotus; chapter field `sketch`, else `SPATIAL[theme].sketches[n-1]`,
  "none" = off; drawn in stroke by stroke when the chapter scrolls in; names for the backstage in `SKETCH_NAMES` in admin.js) — numeral, vertical title, text); the page re-dyes per
  chapter (tones xj… / fj… / al… / dn… / ly…). Framed photos turn towards you via `--p/--a` (set in `Xj.scroll`) and glow on hover. `.xj-air`
  (fixed canvas behind the page, html background off) = the chapter's air from the chapter block's `ornament`: snow · sand · glint ·
  motes · petals · bokeh · fireflies · stars · leaves · rain. A per-chapter fly-through was tried and removed at the owner's request
  (`.backups/site-xinjiang-with-flights.js`). Content backups: `content-before-xinjiang.json`, `content-before-fuji-alps.json`,
  `content-before-dian-lingyin.json` (彩云之南 as the zen `caiyun` page, before it became 时空集).
- **Title colour**: `.plate-big.cjk.t-<theme>` sets `--gold` per album (gold only for 北京).

- **AVIF display copies must have even width and height.** Chrome cannot decode sips' AVIFs with an odd side (2560×1707):
  the image stays blank and `onerror` never fires, so there is no fallback. `make_display` (server.py) and
  `scripts/make_display.py` now size to even numbers; `python3 scripts/make_display.py --fix-odd` remakes old odd ones.
- **徽州 (zen)**: `huizhouChapterHTML` — ghost characters, one ink ridge line, ink-drop bloom, tiny seal; photos bloom in through a
  growing radial mask (`--bloom`) and gain colour; centred verses are vertical; `Lantern` glow on dark tones. **北京 (zen)**:
  `beijingChapterHTML` — central axis hairline, title split across it, seal on the line; singles centred; `.bj-ruler` counts
  0 → 7.8 km (永定门 → 钟鼓楼) with scroll.

- `transform` on `.bg img` belongs to the JS parallax; CSS effects on those images use the separate `scale`
  property. `.next .bg img` is driven by `--charge` and has no `data-plx`.
- There is no CSS scroll-snap (the owner found it too pushy). `trySnap` eases a full-screen panel into place only
  when scrolling has rested within `SNAP_NEAR` (10 % of the screen) of its exact fit; any input cancels it.
- `.panel.grow` clips only its `.bg` / `.shade`; the glass card is not clipped and follows the frame inward with the
  `translate` property (`transform` on cards is used by hover).
- Changing a project's `slug` changes its URL.
- When adding content fields: update the schema above, `admin.js` (form), `site.js` (template) and
  `scripts/make_demo.py`.
