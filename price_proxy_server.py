from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8765
TIMEOUT = 12

SYMBOL_ALIASES = {
    "삼성전자": {"name": "삼성전자", "symbol": "005930.KS"},
    "삼전": {"name": "삼성전자", "symbol": "005930.KS"},
    "sk하이닉스": {"name": "SK하이닉스", "symbol": "000660.KS"},
    "하이닉스": {"name": "SK하이닉스", "symbol": "000660.KS"},
    "tiger미국s&p500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
    "tiger미국sp500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
    "tigers&p500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
    "tigersp500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
    "미국s&p500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
    "미국sp500": {"name": "TIGER 미국S&P500", "symbol": "360750.KS"},
}


def normalize_query(value: str) -> str:
    return re.sub(r"\s+", "", value or "").lower().replace("(주)", "").replace("㈜", "")


def http_json(url: str, *, method: str = "GET", data: bytes | None = None, headers: dict[str, str] | None = None):
    request_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://finance.yahoo.com/",
    }
    if headers:
        request_headers.update(headers)
    request = Request(url, data=data, headers=request_headers, method=method)
    with urlopen(request, timeout=TIMEOUT) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def yahoo_search(query: str):
    normalized = normalize_query(query)
    if normalized in SYMBOL_ALIASES:
        return {**SYMBOL_ALIASES[normalized], "source": "alias"}
    if re.fullmatch(r"\d{6}", query):
        return {"name": query, "symbol": f"{query}.KS", "source": "code"}
    if re.fullmatch(r"[A-Za-z0-9.^=-]+(\.[A-Za-z]{1,3})?", query or ""):
        return {"name": query.upper(), "symbol": query.upper(), "source": "symbol"}

    url = (
        "https://query2.finance.yahoo.com/v1/finance/search?"
        + urlencode({"q": query, "quotesCount": 10, "newsCount": 0, "lang": "ko-KR", "region": "KR"})
    )
    data = http_json(url)
    quotes = data.get("quotes") or []
    preferred = next((q for q in quotes if str(q.get("symbol", "")).endswith((".KS", ".KQ"))), None)
    preferred = preferred or next((q for q in quotes if q.get("symbol")), None)
    if not preferred:
        raise ValueError(f"{query} search result not found")
    return {
        "name": preferred.get("shortname") or preferred.get("longname") or query,
        "symbol": preferred["symbol"],
        "source": "yahoo-search",
    }


def yahoo_close(symbol: str):
    if symbol.upper() in {"0080X0", "0080X0.KS"}:
        try:
            return pyony_etf_close("0080X0", "SOL 미국S&P500미국채혼합50")
        except Exception:
            try:
                return alphasquare_close("0080X0", "SOL 미국S&P500미국채혼합50")
            except Exception:
                return ketf_close("0080X0", "SOL 미국S&P500미국채혼합50")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol)}?range=10d&interval=1d"
    data = http_json(url)
    result = ((data.get("chart") or {}).get("result") or [None])[0]
    if not result:
        raise ValueError(f"{symbol} chart result not found")
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
    timestamps = result.get("timestamp") or []
    for index in range(len(closes) - 1, -1, -1):
        close = closes[index]
        if isinstance(close, (int, float)):
            date = datetime.fromtimestamp(timestamps[index]).strftime("%Y-%m-%d") if index < len(timestamps) else ""
            return {"symbol": symbol, "price": round(close), "date": date, "source": "yahoo-chart"}
    raise ValueError(f"{symbol} close price not found")


def ketf_close(code: str, name: str):
    html = http_text(f"https://www.k-etf.com/etf/{code}/")
    # K-ETF pages expose market stats such as NAV and 52-week prices. Prefer a won-denominated
    # current/market price if present, otherwise use NAV as a practical ETF valuation fallback.
    patterns = [
        r"현재가[^0-9]{0,80}([\d,]+)\s*원",
        r"종가[^0-9]{0,80}([\d,]+)\s*원",
        r"NAV[^0-9]{0,80}([\d,]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
        if match:
            return {
                "symbol": f"{code}.KS",
                "name": name,
                "price": int(match.group(1).replace(",", "")),
                "date": datetime.now().strftime("%Y-%m-%d"),
                "source": "k-etf-page",
            }
    raise ValueError(f"{code} K-ETF price not found")


def alphasquare_close(code: str, name: str):
    html = http_text(f"https://alphasquare.co.kr/home/stock-summary?code={quote(code)}")
    price_match = re.search(r"현재가\s*([\d,]+)\s*원", html)
    date_match = re.search(r"최종 업데이트:\s*([\d.:\s]+)", html)
    if not price_match:
        raise ValueError(f"{code} AlphaSquare price not found")
    date_text = date_match.group(1).strip() if date_match else datetime.now().strftime("%Y-%m-%d")
    return {
        "symbol": f"{code}.KS",
        "name": name,
        "price": int(price_match.group(1).replace(",", "")),
        "date": date_text,
        "source": "alphasquare-page",
    }


def pyony_etf_close(code: str, name: str):
    html = http_text(f"https://pyony.com/finance/etf/{quote(code)}/")
    price_match = re.search(r"현재가</div>\s*<div[^>]*>\s*([\d,]+)", html)
    date_match = re.search(r"updated:\s*([\d/: ]+)", html)
    if not price_match:
        raise ValueError(f"{code} Pyony price not found")
    price_text = price_match.group(1)
    return {
        "symbol": f"{code}.KS",
        "name": name,
        "price": int(price_text.replace(",", "")),
        "date": date_match.group(1).strip() if date_match else datetime.now().strftime("%Y-%m-%d"),
        "source": "pyony-page",
    }


def recent_krx_dates(days: int = 12):
    now = datetime.now()
    dates = []
    for offset in range(days):
        date = now - timedelta(days=offset)
        if date.weekday() < 5:
            dates.append(date.strftime("%Y%m%d"))
    return dates


def find_price(value):
    candidates = []

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            text = " ".join(str(v) for v in node.values())
            if "04020000" in text or "금" in text or "Gold" in text:
                candidates.append(node)
            for item in node.values():
                walk(item)

    walk(value)
    keys = ("TDD_CLSPRC", "CLSPRC", "CLOSE_PRC", "END_PRC", "PRICE", "trdPrc", "close")
    for row in candidates:
        for key in keys:
            if key in row:
                parsed = float(str(row[key]).replace(",", "").strip() or 0)
                if parsed > 0:
                    return round(parsed)
    return 0


def krx_gold_close():
    endpoint = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
    blds = (
        "dbms/MDC/STAT/standard/MDCSTAT22801",
        "dbms/MDC/STAT/standard/MDCSTAT22901",
        "dbms/MDC/STAT/standard/MDCSTAT23001",
    )
    errors = []
    for trd_dd in recent_krx_dates():
        for bld in blds:
            params = {
                "bld": bld,
                "locale": "ko_KR",
                "mktId": "GLD",
                "trdDd": trd_dd,
                "isuCd": "04020000",
                "isuCd2": "04020000",
                "share": "1",
                "money": "1",
            }
            try:
                data = http_json(
                    endpoint,
                    method="POST",
                    data=urlencode(params).encode("utf-8"),
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "Referer": "https://data.krx.co.kr/",
                    },
                )
                price = find_price(data)
                if price:
                    return {"symbol": "04020000", "price": price, "date": trd_dd, "source": "krx-gold"}
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))
    try:
        return goldnow_krx_close()
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))
    raise ValueError(errors[-1] if errors else "KRX gold price not found")


def http_text(url: str):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,*/*",
        },
    )
    with urlopen(request, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", errors="replace")


def goldnow_krx_close():
    html = http_text("https://goldnow.infovista.kr/gold/krx")
    price_match = re.search(r"([\d,]+)\s*원/g", html)
    date_match = re.search(r"업데이트:\s*([\d-]+\s*[\d:]+)", html)
    if not price_match:
        raise ValueError("fallback KRX gold page price not found")
    return {
        "symbol": "KRX-GOLD-1G",
        "price": int(price_match.group(1).replace(",", "")),
        "date": date_match.group(1).strip() if date_match else "",
        "source": "goldnow-krx-page",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def send_json(self, status: int, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self):
        self.send_json(200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/health":
                self.send_json(200, {"ok": True})
            elif parsed.path == "/api/search":
                self.send_json(200, yahoo_search((params.get("q") or [""])[0].strip()))
            elif parsed.path == "/api/close":
                self.send_json(200, yahoo_close((params.get("symbol") or [""])[0].strip()))
            elif parsed.path == "/api/gold":
                self.send_json(200, krx_gold_close())
            else:
                self.send_json(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            self.send_json(502, {"error": str(exc)})


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Price proxy server running on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
