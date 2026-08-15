from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import os


def json_body(payload):
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json_body(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        cron_secret = os.environ.get("CRON_SECRET", "").strip()
        if cron_secret and self.headers.get("Authorization") != f"Bearer {cron_secret}":
            self.send_json(401, {"ok": False, "error": "Unauthorized"})
            return

        supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        supabase_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
        missing = [
            name
            for name, value in (
                ("SUPABASE_URL", supabase_url),
                ("SUPABASE_ANON_KEY", supabase_key),
            )
            if not value
        ]
        if missing:
            self.send_json(500, {
                "ok": False,
                "error": f"Missing environment variables: {', '.join(missing)}",
            })
            return

        query = urlencode({"select": "updated_at", "limit": 1})
        request = Request(
            f"{supabase_url}/rest/v1/family_assets?{query}",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Accept": "application/json",
            },
            method="GET",
        )

        try:
            with urlopen(request, timeout=10) as response:
                response.read()
            self.send_json(200, {
                "ok": True,
                "message": "Supabase keepalive success",
                "time": datetime.now(timezone.utc).isoformat(),
            })
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            self.send_json(502, {
                "ok": False,
                "error": f"Supabase request failed ({error.code})",
                "detail": detail,
            })
        except (URLError, TimeoutError) as error:
            self.send_json(502, {
                "ok": False,
                "error": f"Supabase connection failed: {error}",
            })
        except Exception as error:  # noqa: BLE001
            self.send_json(500, {"ok": False, "error": str(error)})
