#!/usr/bin/env python3
"""Deploy-time only: drop files in public/uploads that content.json doesn't mention, so the
published site stays under GitHub Pages' 1 GB limit. Run by .github/workflows/pages.yml on GitHub's
machine, on its own copy — it refuses to run on your computer unless you pass --yes.
"""
import json
import os
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "public")
if os.environ.get("GITHUB_ACTIONS") != "true" and "--yes" not in sys.argv:
    sys.exit("This deletes unused uploads. It is meant for the deploy; pass --yes to run it here anyway.")

text = (root / "data" / "content.json").read_text("utf-8")
json.loads(text)   # stop here (and fail the deploy) if content.json is broken, rather than delete everything
removed = size = 0
for f in (root / "uploads").rglob("*"):
    if f.is_file() and ("uploads/" + f.relative_to(root / "uploads").as_posix()) not in text:
        size += f.stat().st_size
        f.unlink()
        removed += 1
print("left out %d unused files (%.0f MB)" % (removed, size / 1e6))
