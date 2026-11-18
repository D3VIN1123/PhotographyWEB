#!/usr/bin/env python3
"""Make the display copies (<id>_m.avif, 2560px on the long side) the website shows instead of the full-size photos.

The backstage makes these automatically for every new upload. This script fills them in for photos
uploaded before that existed (or still have an older JPEG copy), and records them in content.json as "mid"
(hero: "imageMid"). Old <id>_m.jpg copies that nothing uses any more are deleted afterwards.
Uses macOS's built-in `sips`, so it needs no installs. Safe to run again: existing copies are reused.

    python3 scripts/make_display.py            # all projects
    python3 scripts/make_display.py --dry-run  # only list what would be made
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = Path(os.environ.get("CONTENT_DIR") or ROOT / "public")
DATA = CONTENT / "data" / "content.json"
EDGE = 2560      # sharp on 2K (2560×1440) screens
QUALITY = 60     # AVIF 60 looks the same as JPEG 82 at about 40 % of the size


def make(src):
    """uploads/<id>.jpg → uploads/<id>_m.jpg; returns the relative path, or '' if not worth it."""
    if not src or not src.startswith("uploads/") or src.startswith("uploads/demo/"):
        return ""
    stem, ext = os.path.splitext(src)
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        return ""
    rel = stem + "_m.avif"
    out, inp = CONTENT / rel, CONTENT / src
    if out.exists():
        return rel
    if not inp.exists():
        return ""
    w, h = dims(inp)
    if max(w, h) <= EDGE * 1.1:          # already small: the original is the display copy
        return ""
    if "--dry-run" in sys.argv:
        print("would make", rel)
        return ""
    subprocess.run(["sips", "-Z", str(EDGE), "-s", "format", "avif", "-s", "formatOptions", str(QUALITY),
                    str(inp), "--out", str(out)], check=True, stdout=subprocess.DEVNULL)
    print("made", rel, "%d KB" % (out.stat().st_size // 1024))
    return rel


def dims(path):
    r = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                       capture_output=True, text=True, check=True).stdout
    vals = [int(line.split(":")[1]) for line in r.splitlines() if "pixel" in line]
    return vals[0], vals[1]


def main():
    doc = json.loads(DATA.read_text("utf-8"))
    for p in doc.get("projects", []):
        for ph in p.get("photos", []):
            kind = ph.get("type") or "image"
            if kind == "stack":
                for layer in ph.get("layers", []):
                    layer["mid"] = make(layer.get("src")) or ""
                if ph.get("layers"):
                    ph["mid"] = ph["layers"][0].get("mid", "")
            elif kind == "image":
                ph["mid"] = make(ph.get("src")) or ""
    hero = doc.get("hero", {})
    if hero.get("image"):
        hero["imageMid"] = make(hero["image"]) or ""
    if "--dry-run" in sys.argv:
        return
    # re-read just before writing and only add the "mid" fields, so edits made meanwhile are kept
    fresh = json.loads(DATA.read_text("utf-8"))
    mids = {}
    for p in doc.get("projects", []):
        for ph in p.get("photos", []):
            if ph.get("src") and ph.get("mid"):
                mids[ph["src"]] = ph["mid"]
            for layer in ph.get("layers", []) or []:
                if layer.get("src") and layer.get("mid"):
                    mids[layer["src"]] = layer["mid"]
    for p in fresh.get("projects", []):
        for ph in p.get("photos", []):
            if ph.get("src") in mids and (ph.get("type") or "image") in ("image", "stack"):
                ph["mid"] = mids[ph["src"]]
            for layer in ph.get("layers", []) or []:
                if layer.get("src") in mids:
                    layer["mid"] = mids[layer["src"]]
    fh = fresh.get("hero", {})
    if fh.get("image") and hero.get("imageMid") and fh["image"] == hero.get("image"):
        fh["imageMid"] = hero["imageMid"]
    tmp = DATA.with_suffix(".tmp")
    tmp.write_text(json.dumps(fresh, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, DATA)
    print("content.json updated")
    text = DATA.read_text("utf-8")
    for old in (CONTENT / "uploads").glob("*_m.jpg"):   # superseded JPEG copies
        if ("uploads/" + old.name) not in text:
            old.unlink()
            print("removed old", old.name)


if __name__ == "__main__":
    main()
