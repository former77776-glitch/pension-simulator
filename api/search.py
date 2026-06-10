from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
import sys
from pathlib import Path


sys.path.append(str(Path(__file__).resolve().parents[1]))
from price_proxy_server import yahoo_search  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        try:
            payload = yahoo_search((params.get("q") or [""])[0].strip())
            status = 200
        except Exception as exc:  # noqa: BLE001
            payload = {"error": str(exc)}
            status = 502
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
