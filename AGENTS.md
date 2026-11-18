# AGENTS.md — handoff notes for any coding agent (Claude Code, Codex, Cursor, …)

Photography portfolio with an Apple "Liquid Glass" UI and a small admin ("backstage").
Current look is **v2 "paper + glass"**: full-bleed photos and glass controls, alternating with warm paper-white
sections, serif display type and framed photos (inspired by a site the owner likes). v1 (all-dark, every photo
full-screen) is kept in `versions/v1-liquid-glass/` — see its README to restore; do not delete it.
The owner is a photographer, not a developer: keep things dependency-free and explain changes plainly.
They write in a mix of Chinese and English; the admin UI is bilingual, the public site is English.

## Hard constraints

- **No dependencies, no build step.** Vanilla HTML/CSS/JS; the server is Python **standard library only**.
  The machine has system Python 3.9 and **no Node** — do not add npm, bundlers, frameworks or pip packages
  without asking. Keep Python 3.8/3.9-compatible syntax (no `match`, no `X | Y` type unions).
- **`public/` must stay a fully static site.** It is deployed as-is (GitHub Pages via
  `.github/workflows/pages.yml`). It may only read `data/content.json` and `uploads/*`; it must never call `/api/*`.
- **Relative URLs only** inside `public/` (`data/…`, `uploads/…`, `#/p/slug`) so it works under a sub-path.
- Desktop-first. A dedicated mobile pass is **pending and waits for the owner's instructions** — only basic
  small-screen rules exist (`@media (max-width: 760px)` at the end of `site.css`).

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
  index.html           shell: nav, #view, HUD, SVG <defs> for glass filters
  css/site.css         all styling; .glass is the material
  js/site.js           router, templates, scroll loop, charge, glass refraction
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
    "cover": "<photo id>", "published": true,
    "theme": "" | "indigo" | "yunnan" | "paris", // page style; indigo = dark tie-dye, yunnan = editorial field journal,
                                  // paris = limestone + Didot, street-sign chapters (public/css/paris.css)
    "photos": [{ "type": "image"|"stack"|"video"|"youtube"|"text",   // missing = image
                 "id", "src", "thumb", "w", "h", "caption",
                 "focus": [x%, y%],             // object-position when cropped to fill
                 "layout": "auto"|"fill"|"fit"|"wide"|"pair",   // pair = sit side by side with the next photo
                 "mid": "uploads/<id>_m.avif",  // 2560px AVIF display copy the page shows; "src" (5120px) only loads in zoom
                 "fx": "" | "mist" | "dawn" | "sparkle" }]   // sparkle = twinkling lights on the bright parts (sparkleHTML / placeSparkles)  // mist = drifting cloud overlay; dawn = pinned, scroll raises the sun   // fill = always full-bleed, fit = always framed on paper,
                                                       // wide = whole photo at screen width (.panel.wide), snaps by its centre
  }]
}
// stack:   + "layers": [{ "id","src","thumb","w","h","label" }]  — src/thumb/w/h mirror layers[0] (admin syncStack)
//            layout "fill" = full screen, otherwise framed on paper
// video:   src = uploads/<id>.mp4|mov|webm, thumb = poster jpg (may be ""), layout "fill" | framed
// youtube: "yt" (11-char id), "url", thumb = i.ytimg.com poster, w/h = aspect ratio; always framed
// stack:   layout "scroll" = horizontal handscroll (rollHTML / sizeRolls / rolls in frame)
// text:    "style": "" | "chapter" (numbered 壹贰叁…, vertical title, "kicker" English line, "ornament"
//          contour|flags|shibori|roofs|rose|opera|seine|versailles|none; the last five only on paris pages —
//          opera/seine/versailles are line-drawn scenes (SCENES). On a paris page a plain text block's "ornament" can be a
//          small line drawing above the verse: metro|cafe|lamp|chandelier|eiffel (DOODLES)., plus "kicker" on plain blocks too. shibori = tie-dye medallions
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

- **Routes**: `#/` home (hero panel → paper `.intro` with statement + album index → `.marquee` → one
  `.panel.proj` per project → paper footer); `#/p/<slug>` project (cover panel → paper `.preface` with the
  description → photos → `.next` block). `render()` swaps `#view` with a blur/fade.
- **Photo layout** (`layoutShots`): auto landscapes alternate between a full-bleed `.panel.shot` and a paper
  `.spread` holding a pair of framed photos (`.frame`, numbered caption underneath); portraits are always framed;
  a leftover photo becomes a `.spread.single`. `fill` forces full-bleed, `fit` forces framed.
- **Paper sections** (`.paper`): light background, dark ink (`--pink*` tokens), serif (`--serif`, system fonts
  only — no web-font download). While a `.paper` section is under the nav the scroll loop sets `body.on-light`,
  which turns the nav glass to dark ink.
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
- **Liquid Glass** (`.glass` in CSS + `Glass` in JS): CSS gives tint, blur, specular rim and a pointer-following
  sheen everywhere. In Chromium, each `[data-lg="<strength>"]` element also gets a generated SVG
  `feDisplacementMap` (lens-shaped rim) applied through `backdrop-filter: url(#…)`. Safari/Firefox ignore SVG
  backdrop filters, so they keep the frosted fallback — do not remove the fallback declaration.
  `data-bezel` (px, default 22) and `data-blur` (px, default 5) are optional per element.
  `data-bezel` aside, the default backdrop blur is deliberately low (1.5px refracting / 7px fallback): the owner
  asked for *clear* glass, not frosted.
- **Rim colour** (`Rim` in JS, `--rim` / `--rim-glow` in CSS): the 1.5px ring on every `.glass` is a conic gradient
  of 12 colours sampled from the photo under the element's edge (tiny cached canvas per image), under white
  specular arcs at top-left / bottom-right (iOS 26 look). Re-sampled ~every 90 ms while scrolling.
- **Auto-hiding chrome** (`setUI` / `poke`, `body.ui-off` / `body.ui-on`): scrolling down half a screen (`HIDE_DOWN`) or `IDLE_MS` (5 s) without
  input wipes away the nav, caption HUD, project cover card and scroll hints with an iridescent mask sweep;
  only a click/tap, mouse movement inside the top 20 % of the screen (`TOP_ZONE`; ignored for 700 ms after
  any scroll), Tab, or scrolling up by half a screen (`SHOW_UP`, measured from the lowest point reached)
  restores them. The home-page cards (`.hero .card`, `.proj .card`) are
  intentionally excluded — to change what hides, edit the selector list in the "Auto-hiding chrome" CSS block.
- Glass is reserved for text surfaces and navigation (nav pill, cards, HUD). Photos stay untouched.

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

- `transform` on `.bg img` belongs to the JS parallax; CSS effects on those images use the separate `scale`
  property. `.next .bg img` is driven by `--charge` and has no `data-plx`.
- There is no CSS scroll-snap (the owner found it too pushy). `trySnap` eases a full-screen panel into place only
  when scrolling has rested within `SNAP_NEAR` (10 % of the screen) of its exact fit; any input cancels it.
- `.panel.grow` clips only its `.bg` / `.shade`; the glass card is not clipped and follows the frame inward with the
  `translate` property (`transform` on cards is used by hover).
- Changing a project's `slug` changes its URL.
- When adding content fields: update the schema above, `admin.js` (form), `site.js` (template) and
  `scripts/make_demo.py`.
