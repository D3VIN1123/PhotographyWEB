#!/usr/bin/env python3
"""
Photography site server — zero dependencies (Python 3.8+ standard library only).

  python3 server.py            → site at http://localhost:4173  ·  admin at /admin

Serves the static public site from ./public, the admin UI from ./admin,
and a small JSON API the admin uses to edit content + upload images.

Environment variables (all optional):
  PORT            port to listen on (default 4173)
  HOST            interface to bind (default 127.0.0.1; use 0.0.0.0 on a server)
  ADMIN_PASSWORD  admin password (overrides the one created in the browser)
  CONTENT_DIR     folder holding data/content.json and uploads/ (default ./public)
"""
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import shutil
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
ADMIN = ROOT / "admin"
CONTENT = Path(os.environ.get("CONTENT_DIR") or PUBLIC).resolve()
DATA_FILE = CONTENT / "data" / "content.json"
UPLOADS = CONTENT / "uploads"
BACKUPS = ROOT / ".backups"
AUTH_FILE = ROOT / ".admin.json"

PORT = int(os.environ.get("PORT", "4173"))
HOST = os.environ.get("HOST", "127.0.0.1")
ENV_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

MAX_UPLOAD = 60 * 1024 * 1024
MAX_VIDEO = 95 * 1024 * 1024          # GitHub refuses files over 100 MB
MAX_JSON = 8 * 1024 * 1024
SESSION_TTL = 60 * 60 * 24 * 14
UPLOAD_EXT = {"jpg", "jpeg", "png", "webp", "avif", "gif"}
VIDEO_EXT = {"mp4", "m4v", "webm", "mov"}

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/mp4", ".m4v")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("video/quicktime", ".mov")

SESSIONS = {}  # token -> expiry timestamp
LOCK = threading.Lock()
FAILS = {"count": 0, "until": 0.0}

DEFAULT_CONTENT = {
    "site": {"title": "Studio Name", "tagline": "Photography", "footer": "", "email": "", "instagram": ""},
    "hero": {"mode": "custom", "projectId": "", "kicker": "Latest", "title": "Welcome",
             "text": "Open /admin to add your first project.", "image": "", "focus": [50, 50],
             "linkLabel": "", "linkUrl": ""},
    "projects": [],
}


# ---------- auth helpers ----------
def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return {"salt": salt, "hash": digest.hex()}


def stored_auth():
    try:
        return json.loads(AUTH_FILE.read_text("utf-8"))
    except Exception:
        return None


def needs_setup():
    return not ENV_PASSWORD and stored_auth() is None


def check_password(password):
    if ENV_PASSWORD:
        return hmac.compare_digest(password.encode("utf-8"), ENV_PASSWORD.encode("utf-8"))
    auth = stored_auth()
    if not auth:
        return False
    candidate = hash_password(password, auth["salt"])["hash"]
    return hmac.compare_digest(candidate, auth["hash"])


# ---------- content helpers ----------
def read_content():
    try:
        return json.loads(DATA_FILE.read_text("utf-8"))
    except FileNotFoundError:
        return json.loads(json.dumps(DEFAULT_CONTENT))


def write_content(doc):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOCK:
        if DATA_FILE.exists():
            BACKUPS.mkdir(exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S")
            shutil.copy2(DATA_FILE, BACKUPS / ("content-%s.json" % stamp))
            old = sorted(BACKUPS.glob("content-*.json"))
            for f in old[:-40]:
                f.unlink()
        tmp = DATA_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, DATA_FILE)


def safe_join(base, rel):
    """Resolve rel inside base; return None if it escapes."""
    base = base.resolve()
    target = (base / rel.lstrip("/")).resolve()
    if target == base or base in target.parents:
        return target
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "PhotoSite/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    # ----- low-level responses -----
    def send_json(self, obj, status=200, headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            return self.send_text("Not found", 404)
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        size = path.stat().st_size
        start, end = 0, size - 1
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", (self.headers.get("Range") or "").strip())
        partial = bool(m and (m.group(1) or m.group(2)) and size)
        if partial:   # byte ranges: Safari needs these to play video
            if m.group(1):
                start = int(m.group(1))
                end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        if partial:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        cache = "public, max-age=604800" if UPLOADS in path.parents else "no-cache"
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                try:
                    while left > 0:
                        chunk = f.read(min(262144, left))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        left -= len(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

    def send_text(self, text, status=200):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, to):
        self.send_response(302)
        self.send_header("Location", to)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def read_body(self, limit):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            return None
        return self.rfile.read(length) if length else b""

    def discard_body(self, length):
        while length > 0:
            chunk = self.rfile.read(min(1048576, length))
            if not chunk:
                break
            length -= len(chunk)

    def read_json(self):
        raw = self.read_body(MAX_JSON)
        if raw is None:
            return None
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return None

    # ----- session -----
    def token(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "sid":
                return v
        return ""

    def authed(self):
        tok = self.token()
        exp = SESSIONS.get(tok)
        if not exp:
            return False
        if exp < time.time():
            SESSIONS.pop(tok, None)
            return False
        return True

    def start_session(self):
        tok = secrets.token_urlsafe(32)
        SESSIONS[tok] = time.time() + SESSION_TTL
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return {"Set-Cookie": "sid=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%d%s" % (tok, SESSION_TTL, secure)}

    def is_local(self):
        return self.client_address[0] in ("127.0.0.1", "::1") and not self.headers.get("X-Forwarded-For")

    # ----- routing -----
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlparse(self.path)
        path = unquote(url.path)
        if path == "/api/state":
            return self.send_json({"authed": self.authed(), "needsSetup": needs_setup(),
                                   "canSetup": self.is_local()})
        if path == "/api/content":
            if not self.authed():
                return self.send_json({"error": "unauthorized"}, 401)
            return self.send_json(read_content())
        if path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        if path == "/admin":
            return self.redirect("/admin/")
        if path.startswith("/admin/"):
            target = safe_join(ADMIN, path[len("/admin/"):])
        elif path.startswith("/data/") or path.startswith("/uploads/"):
            target = safe_join(CONTENT, path)
        else:
            target = safe_join(PUBLIC, path)
        if target is None or any(p.startswith(".") for p in Path(path).parts if p != "/"):
            return self.send_text("Not found", 404)
        return self.send_file(target)

    def do_POST(self):
        url = urlparse(self.path)
        path = url.path
        query = parse_qs(url.query)

        if path == "/api/setup":
            body = self.read_json() or {}
            pw = str(body.get("password") or "")
            if not needs_setup():
                return self.send_json({"error": "Password already set."}, 400)
            if not self.is_local():
                return self.send_json({"error": "First-time setup only works on this computer (localhost)."}, 403)
            if len(pw) < 6:
                return self.send_json({"error": "Use at least 6 characters."}, 400)
            AUTH_FILE.write_text(json.dumps(hash_password(pw)), "utf-8")
            os.chmod(AUTH_FILE, 0o600)
            return self.send_json({"ok": True}, headers=self.start_session())

        if path == "/api/login":
            body = self.read_json() or {}
            now = time.time()
            if FAILS["until"] > now:
                return self.send_json({"error": "Too many attempts. Wait a moment."}, 429)
            if check_password(str(body.get("password") or "")):
                FAILS["count"] = 0
                return self.send_json({"ok": True}, headers=self.start_session())
            FAILS["count"] += 1
            time.sleep(0.6)
            if FAILS["count"] >= 6:
                FAILS["until"] = now + 60
                FAILS["count"] = 0
            return self.send_json({"error": "Wrong password."}, 401)

        if path == "/api/logout":
            self.read_body(MAX_JSON)
            SESSIONS.pop(self.token(), None)
            return self.send_json({"ok": True}, headers={"Set-Cookie": "sid=; Path=/; Max-Age=0"})

        if not self.authed():
            self.read_body(MAX_UPLOAD)
            return self.send_json({"error": "unauthorized"}, 401)

        if path == "/api/upload":
            ext = (query.get("ext", ["jpg"])[0] or "jpg").lower()
            pid = query.get("id", [""])[0]
            thumb = query.get("thumb", [""])[0] == "1"
            video = ext in VIDEO_EXT and not thumb
            limit = MAX_VIDEO if video else MAX_UPLOAD
            length = int(self.headers.get("Content-Length") or 0)
            if ext not in UPLOAD_EXT and not video:
                self.discard_body(length)
                return self.send_json({"error": "Unsupported file type."}, 400)
            if pid and not re.fullmatch(r"[a-z0-9]{8,40}", pid):
                self.discard_body(length)
                return self.send_json({"error": "Bad id."}, 400)
            if length > limit:
                self.discard_body(length)
                return self.send_json({"error": "File too large (max %d MB)." % (limit // 1048576)}, 413)
            if not length:
                return self.send_json({"error": "Empty upload."}, 400)
            pid = pid or (time.strftime("%y%m%d") + secrets.token_hex(5))
            ext = "jpg" if ext == "jpeg" else ext
            name = "%s%s.%s" % (pid, "_s" if thumb else "", ext)
            UPLOADS.mkdir(parents=True, exist_ok=True)
            tmp = UPLOADS / (name + ".part")
            left = length
            with open(tmp, "wb") as f:   # streamed to disk, so large videos never sit in memory
                while left > 0:
                    chunk = self.rfile.read(min(1048576, left))
                    if not chunk:
                        break
                    f.write(chunk)
                    left -= len(chunk)
            if left:
                tmp.unlink()
                return self.send_json({"error": "Upload interrupted."}, 400)
            os.replace(str(tmp), str(UPLOADS / name))
            return self.send_json({"ok": True, "id": pid, "src": "uploads/" + name})

        if path == "/api/delete-file":
            body = self.read_json() or {}
            removed = 0
            for src in body.get("files") or []:
                src = str(src)
                if not src.startswith("uploads/"):
                    continue
                target = safe_join(CONTENT, src)
                if target and target.is_file() and UPLOADS.resolve() in target.parents:
                    target.unlink()
                    removed += 1
            return self.send_json({"ok": True, "removed": removed})

        if path == "/api/password":
            body = self.read_json() or {}
            if ENV_PASSWORD:
                return self.send_json({"error": "Password is set by ADMIN_PASSWORD on the server."}, 400)
            if not check_password(str(body.get("current") or "")):
                return self.send_json({"error": "Current password is wrong."}, 401)
            new = str(body.get("password") or "")
            if len(new) < 6:
                return self.send_json({"error": "Use at least 6 characters."}, 400)
            AUTH_FILE.write_text(json.dumps(hash_password(new)), "utf-8")
            os.chmod(AUTH_FILE, 0o600)
            return self.send_json({"ok": True})

        self.read_body(MAX_JSON)
        return self.send_json({"error": "not found"}, 404)

    def do_PUT(self):
        if urlparse(self.path).path != "/api/content":
            self.read_body(MAX_JSON)
            return self.send_json({"error": "not found"}, 404)
        if not self.authed():
            self.read_body(MAX_JSON)
            return self.send_json({"error": "unauthorized"}, 401)
        doc = self.read_json()
        if not isinstance(doc, dict) or not isinstance(doc.get("projects"), list) \
                or not isinstance(doc.get("site"), dict) or not isinstance(doc.get("hero"), dict):
            return self.send_json({"error": "Invalid content."}, 400)
        write_content(doc)
        return self.send_json({"ok": True, "savedAt": int(time.time())})


def main():
    UPLOADS.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        write_content(json.loads(json.dumps(DEFAULT_CONTENT)))
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    httpd.daemon_threads = True
    shown = "localhost" if HOST in ("127.0.0.1", "0.0.0.0") else HOST
    print("\n  Site   →  http://%s:%d" % (shown, PORT))
    print("  Admin  →  http://%s:%d/admin\n" % (shown, PORT))
    if needs_setup():
        print("  First run: open the Admin link to create your password.\n")
    print("  Press Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
