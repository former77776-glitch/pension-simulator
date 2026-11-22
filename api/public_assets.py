from http.server import BaseHTTPRequestHandler
import json
from math import isfinite
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen

sys.path.append(str(Path(__file__).resolve().parents[1]))
from api.sync_config import production_config  # noqa: E402


CATEGORIES = {"부동산", "주식", "현금", "연금", "금", "기타"}


def project_summary(payload):
    def amount(value):
        if type(value) not in (int, float) or not isfinite(value) or abs(value) > 10**16:
            raise ValueError("Invalid public amount")
        return value

    period = payload["period"]
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", period):
        raise ValueError("Invalid public period")
    categories = [
        {"label": row["label"], "amount": amount(row["amount"])}
        for row in payload["categories"] if row["label"] in CATEGORIES
    ]
    return {
        "period": period, "assets": amount(payload["assets"]), "debt": amount(payload["debt"]),
        "net": amount(payload["net"]), "categories": categories,
    }


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        output = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(output)))
        self.end_headers()
        self.wfile.write(output)

    def do_GET(self):
        config = production_config()
        if not config:
            self.send_json(503, {"ok": False})
            return
        req = Request(
            config["supabaseUrl"] + "/rest/v1/rpc/pension_public_summary",
            headers={"apikey": config["supabaseAnonKey"], "Accept": "application/json"},
        )
        try:
            with urlopen(req, timeout=5) as response:
                data = json.loads(response.read(8192))
            summary = project_summary(data) if data is not None else None
        except (OSError, ValueError, KeyError, TypeError, OverflowError):
            self.send_json(502, {"ok": False})
            return
        self.send_json(200, {"ok": True, "summary": summary})
