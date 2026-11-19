#!/usr/bin/env python3
"""
Generates placeholder "photos" (abstract SVG landscapes) and a sample content.json
so the site has something to show before real photos are uploaded.

  python3 scripts/make_demo.py          # refuses to overwrite existing content
  python3 scripts/make_demo.py --force  # overwrite public/data/content.json

Delete the demo projects from the admin once you have your own work in.
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "uploads" / "demo"
DATA = ROOT / "public" / "data" / "content.json"


def ridge(rnd, w, h, base, rough, steps=28):
    """A jagged mountain silhouette as an SVG path, filled down to the bottom."""
    pts, y = [], base
    for i in range(steps + 1):
        y += rnd.uniform(-rough, rough)
        y = max(base - rough * 3.2, min(base + rough * 2.2, y))
        pts.append((w * i / steps, y))
    d = "M0,%d " % h + " ".join("L%.0f,%.0f" % p for p in pts) + " L%d,%d Z" % (w, h)
    return d


def stops(colors):
    n = len(colors) - 1
    return "".join('<stop offset="%.2f" stop-color="%s"/>' % (i / n, c) for i, c in enumerate(colors))


def coast(rnd, w, h, pal):
    sky, sun, hills, water = pal
    horizon = h * rnd.uniform(.56, .66)
    sx, sy = w * rnd.uniform(.25, .75), horizon - h * rnd.uniform(.02, .16)
    s = ['<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % stops(sky),
         '<radialGradient id="g"><stop offset="0" stop-color="%s" stop-opacity=".95"/><stop offset=".25" stop-color="%s" stop-opacity=".5"/><stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient>' % (sun, sun, sun),
         '<linearGradient id="w" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % stops(water)]
    b = ['<rect width="%d" height="%d" fill="url(#s)"/>' % (w, h),
         '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="url(#g)"/>' % (sx, sy, h * .55),
         '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s"/>' % (sx, sy, h * .035, "#fff6e0")]
    for i, c in enumerate(hills):
        b.append('<path d="%s" fill="%s"/>' % (ridge(rnd, w, int(horizon) + 2, horizon - h * (.16 - i * .05), h * (.035 - i * .007)), c))
    b.append('<rect y="%.0f" width="%d" height="%.0f" fill="url(#w)"/>' % (horizon, w, h - horizon))
    for i in range(26):  # light streaks on the water
        yy = horizon + (h - horizon) * (i / 26.0) ** 1.6 + 6
        ww = w * rnd.uniform(.03, .16) * (1 + i / 9.0)
        b.append('<rect x="%.0f" y="%.0f" width="%.0f" height="%.1f" rx="3" fill="%s" opacity="%.2f"/>' %
                 (sx - ww / 2 + rnd.uniform(-w * .03, w * .03), yy, ww, 2 + i * .35, sun, rnd.uniform(.12, .5)))
    return s, b


def north(rnd, w, h, pal):
    sky, glow, peaks, _ = pal
    s = ['<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % stops(sky),
         '<filter id="b" x="-20%%" y="-50%%" width="140%%" height="200%%"><feGaussianBlur stdDeviation="%d"/></filter>' % (h // 28)]
    b = ['<rect width="%d" height="%d" fill="url(#s)"/>' % (w, h)]
    for _i in range(160):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.1f" fill="#fff" opacity="%.2f"/>' %
                 (rnd.uniform(0, w), rnd.uniform(0, h * .6), rnd.uniform(.6, 2.2), rnd.uniform(.25, .9)))
    for i in range(3):  # aurora ribbons
        y0 = h * rnd.uniform(.12, .4)
        d = "M%.0f,%.0f C%.0f,%.0f %.0f,%.0f %.0f,%.0f" % (-w * .1, y0, w * .3, y0 - h * rnd.uniform(.05, .25), w * .6, y0 + h * rnd.uniform(.02, .22), w * 1.1, y0 - h * rnd.uniform(0, .15))
        b.append('<path d="%s" fill="none" stroke="%s" stroke-width="%d" opacity="%.2f" filter="url(#b)"/>' % (d, glow[i % len(glow)], h // rnd.randint(9, 16), rnd.uniform(.45, .8)))
    for i, c in enumerate(peaks):
        b.append('<path d="%s" fill="%s"/>' % (ridge(rnd, w, h, h * (.6 + i * .11), h * (.05 - i * .008), 22), c))
    return s, b


def city(rnd, w, h, pal):
    sky, lights, towers, ground = pal
    floor = h * .74
    s = ['<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % stops(sky),
         '<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">%s</linearGradient>' % stops(ground),
         '<filter id="b"><feGaussianBlur stdDeviation="%d"/></filter>' % (w // 60)]
    b = ['<rect width="%d" height="%d" fill="url(#s)"/>' % (w, h)]
    for _i in range(5):
        b.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity=".35" filter="url(#b)"/>' % (rnd.uniform(0, w), floor - rnd.uniform(0, h * .3), w * rnd.uniform(.06, .16), rnd.choice(lights)))
    front = []
    for layer, col in enumerate(towers):
        x = -rnd.uniform(0, 80)
        while x < w:
            bw = w * rnd.uniform(.035, .085)
            bh = h * rnd.uniform(.16, .5) * (1 - layer * .22)
            g = ['<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s"/>' % (x, floor - bh, bw, bh + 4, col)]
            cw, chh = bw / 6.0, h * .022
            for r in range(int(bh / chh) - 1):
                for cidx in range(5):
                    if rnd.random() < .3 + layer * .12:
                        g.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" opacity="%.2f"/>' %
                                 (x + cw * (cidx + .7), floor - bh + chh * (r + .6), cw * .55, chh * .5, rnd.choice(lights), rnd.uniform(.35, .95)))
            (front if layer == len(towers) - 1 else b).extend(g)
            x += bw + rnd.uniform(-6, w * .012)
    b.extend(front)
    b.append('<rect y="%.0f" width="%d" height="%.0f" fill="url(#f)"/>' % (floor, w, h - floor))
    for _i in range(40):  # wet-street reflections
        xx = rnd.uniform(0, w)
        b.append('<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s" opacity="%.2f" filter="url(#b)"/>' %
                 (xx, floor + rnd.uniform(0, 30), w * rnd.uniform(.006, .02), (h - floor) * rnd.uniform(.3, 1), rnd.choice(lights), rnd.uniform(.25, .6)))
    return s, b


def svg(kind, seed, w, h, pal):
    rnd = random.Random(seed)
    defs, body = kind(rnd, w, h, pal)
    vignette = '<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-opacity="0"/><stop offset="1" stop-opacity=".45"/></radialGradient>'
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><defs>%s%s</defs>%s'
            '<rect width="%d" height="%d" fill="url(#v)"/></svg>') % (w, h, w, h, "".join(defs), vignette, "".join(body), w, h)


L, P = (2400, 1500), (1500, 2100)

COAST = [
    (["#1b1340", "#6d2a6b", "#e8663f", "#ffc46b"], "#ffd27a", ["#5a2c5e", "#3a1c4a", "#1f1033"], ["#e0704a", "#532a5e", "#150c26"]),
    (["#0e1b3d", "#3b4a8a", "#e58a7b", "#ffd9a0"], "#ffe2b0", ["#44487e", "#2b2c5c", "#15163a"], ["#d88b80", "#39407c", "#0c0f2a"]),
    (["#2a0f2e", "#8f2f4f", "#f08a3c", "#ffe08a"], "#ffe9a8", ["#6b2444", "#451631", "#230a1c"], ["#ef8a44", "#6c2545", "#1a0714"]),
]
NORTH = [
    (["#020814", "#06213a", "#0d3f52"], ["#4dffb5", "#38d6ff", "#9b7bff"], ["#3c6076", "#1f3b50", "#0b1c2b"], None),
    (["#050616", "#141a44", "#27456b"], ["#7dffcf", "#b08bff", "#3fe0ff"], ["#56708f", "#2c4160", "#101d33"], None),
]
CITY = [
    (["#06040f", "#1a1038", "#3a1c52"], ["#ffd36b", "#ff5fa2", "#52e0ff", "#fff1c9"], ["#1c1637", "#120e27", "#08060f"], ["#0a0716", "#04030a"]),
    (["#03070f", "#0b1e33", "#16405a"], ["#ffcf70", "#5ef0ff", "#ff7a59", "#ffffff"], ["#122a3d", "#0b1b2a", "#050b13"], ["#050d16", "#020409"]),
]

PROJECTS = [
    ("dusk-coast", "Dusk Coast", "Pacific Highway · 2026",
     "Three weeks following the last light down the coastline — where the land runs out and the colour begins.",
     [(coast, COAST[0], L, "Last light over the headland"), (coast, COAST[1], L, "Blue hour, low tide"),
      (coast, COAST[2], P, "Sun pillar"), (coast, COAST[0], P, "The long reflection"),
      (coast, COAST[2], L, "Ember sky"), (coast, COAST[1], P, "Standing alone"), (coast, COAST[0], L, "")]),
    ("northern-quiet", "Northern Quiet", "Tromsø · Winter",
     "Nights above the Arctic Circle. Cold enough to hear the snow, quiet enough to hear the sky.",
     [(north, NORTH[0], L, "First ribbon, 23:40"), (north, NORTH[1], L, "The valley holds its breath"),
      (north, NORTH[1], P, "Green fire"), (north, NORTH[0], P, "Violet seam"), (north, NORTH[0], L, "Before dawn")]),
    ("city-after-rain", "City After Rain", "Hong Kong · Night",
     "Neon, glass and wet asphalt. A city that looks its best right after the storm passes.",
     [(city, CITY[0], L, "Mong Kok, 1 a.m."), (city, CITY[1], L, "Harbour side"),
      (city, CITY[0], P, "Stacked lives"), (city, CITY[1], P, "Signal"), (city, CITY[0], L, "Every window a story"),
      (city, CITY[1], L, "")]),
]


def main():
    if DATA.exists() and "--force" not in sys.argv:
        existing = json.loads(DATA.read_text("utf-8"))
        if existing.get("projects"):
            print("content.json already has projects — run with --force to overwrite.")
            return
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.parent.mkdir(parents=True, exist_ok=True)
    projects, seed = [], 7
    for slug, title, sub, desc, shots in PROJECTS:
        photos = []
        for n, (kind, pal, (w, h), cap) in enumerate(shots, 1):
            seed += 13
            name = "%s-%02d.svg" % (slug, n)
            (OUT / name).write_text(svg(kind, seed, w, h, pal), "utf-8")
            photos.append({"id": "demo%s%02d" % (slug.replace("-", ""), n), "src": "uploads/demo/" + name,
                           "w": w, "h": h, "caption": cap, "focus": [50, 55], "layout": "auto"})
        projects.append({"id": "demo-" + slug, "slug": slug, "title": title, "subtitle": sub, "place": "", "placeEn": "", "coords": "", "description": desc,
                         "cover": photos[0]["id"], "published": True, "theme": "", "photos": photos})
    doc = {
        "site": {"title": "Studio Name", "tagline": "Photography",
                 "intro": "Coastlines at dusk, quiet northern light and cities after rain. A record of places, kept while walking.",
                 "footer": "All photographs © Studio Name. Please ask before using.", "email": "hello@example.com", "instagram": ""},
        "hero": {"mode": "project", "projectId": projects[0]["id"], "kicker": "Latest · 最新", "title": "", "text": "",
                 "image": "", "focus": [50, 50], "linkLabel": "View project", "linkUrl": ""},
        "projects": projects,
    }
    DATA.write_text(json.dumps(doc, ensure_ascii=False, indent=2), "utf-8")
    print("Wrote %d demo projects → %s" % (len(projects), DATA))


if __name__ == "__main__":
    main()
