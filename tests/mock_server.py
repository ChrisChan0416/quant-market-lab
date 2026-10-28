"""Offline test server: serves the app with synthetic Yahoo-shaped price data and fixture fundamentals.
Usage: python3 tests/mock_server.py <port> <fixtures.json>"""
import json, math, random, sys, time
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

FIXTURES = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else {}
BY_SYMBOL = {v["symbol"]: v for v in FIXTURES.values()}
LEVEL = {"AAPL": 255, "0700.HK": 640, "JPM": 300, "^GSPC": 6600, "^HSI": 26000, "^TNX": 4.6}

def chart(symbol, years=5):
    rnd = random.Random(sum(map(ord, symbol)))
    n = int(252 * years); end = int(datetime(2026, 10, 2, 20, tzinfo=timezone.utc).timestamp())
    ts, t = [], end
    while len(ts) < n:
        d = datetime.fromtimestamp(t, timezone.utc).weekday()
        if d < 5: ts.append(t)
        t -= 86400
    ts.reverse()
    mkt = random.Random(7)
    target = LEVEL.get(symbol, 100.0); p = [1.0]
    beta = 1.0 if symbol.startswith("^") else 1.15
    for i in range(1, n):
        m = mkt.gauss(0.0004, 0.011)
        p.append(p[-1] * math.exp(beta * m + (0 if symbol.startswith("^") else rnd.gauss(0.0002, 0.012))))
    scale = target / p[-1]; closes = [x * scale for x in p]
    div_adj = [c * (0.97 ** ((n - 1 - i) / 252)) for i, c in enumerate(closes)]  # ~3%/yr dividend adjustment
    highs = [c * (1 + abs(rnd.gauss(0, .006))) for c in closes]; lows = [c * (1 - abs(rnd.gauss(0, .006))) for c in closes]
    vols = [int(5e7 * (0.6 + rnd.random())) if not symbol.startswith("^") else 0 for _ in closes]
    return {"chart": {"result": [{"meta": {"currency": "HKD" if symbol.endswith(".HK") or symbol == "^HSI" else "USD", "symbol": symbol, "shortName": symbol},
            "timestamp": ts, "indicators": {"quote": [{"close": closes, "high": highs, "low": lows, "volume": vols}], "adjclose": [{"adjclose": div_adj}]}}]}}

class Handler(server.QuantScopeHandler):
    def proxy_chart(self, query):
        symbol = query.get("symbol", [""])[0]
        rng = query.get("range", ["1y"])[0]
        years = {"1mo": .1, "3mo": .25, "6mo": .5, "1y": 1, "2y": 2, "5y": 5}.get(rng, 1)
        if symbol == "IPO1": years = min(years, 0.12)  # ~30 bars: a freshly listed stock
        if symbol in ("FAIL",):
            self.send_json({"error": "x"}, status=502); return
        self.send_json(chart(symbol, years))
    def fundamentals(self, query):
        symbol = query.get("symbol", [""])[0].upper()
        if symbol in BY_SYMBOL: self.send_json(BY_SYMBOL[symbol]); return
        self.send_json({"error": "fundamentals unavailable", "detail": "HTTP 401"}, status=502)

if __name__ == "__main__":
    port = int(sys.argv[1])
    srv = server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("mock on", port, flush=True); srv.serve_forever()
