import base64
from http.server import BaseHTTPRequestHandler
import json
import os
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


def is_public_key(key):
    if key.startswith("sb_publishable_"):
        return True
    try:
        payload = key.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return claims.get("role") == "anon"
    except (IndexError, ValueError, AttributeError):
        return False


def production_config():
    if os.environ.get("VERCEL_ENV") != "production":
        return None
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    family = os.environ.get("PENSION_FAMILY_KEY", "kim_family").strip()
    parsed = urlparse(url)
    if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co")
            or parsed.netloc != parsed.hostname or parsed.path or parsed.query or parsed.fragment
            or not family or not is_public_key(key)):
        return None
    query = urlencode({"requested_family": family})
    req = Request(f"{url}/rest/v1/rpc/pension_lab_ready?{query}", headers={"apikey": key})
    try:
        with urlopen(req, timeout=3) as response:
            if json.loads(response.read(32)) is not True:
                return None
    except (OSError, ValueError):
        return None
    return {"supabaseUrl": url, "supabaseAnonKey": key, "familyKey": family}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        config = production_config()
        body = (
            "window.PENSION_LAB_CONFIG = " + json.dumps(config, ensure_ascii=True) + ";"
            if config else "// Family sync is not active."
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
