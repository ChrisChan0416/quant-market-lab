"""End-to-end checks for news_sentiment.py against a fake OpenAI-compatible server (no network, no real key).
Run: python3 tests/test_sentiment.py"""
import json
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import news_sentiment as ns  # noqa: E402

CALLS = {"chat": 0, "fail_next": 0, "fence": False}


class FakeLLM(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.headers.get("Authorization") != "Bearer good-key":
            return self.reply(401, {"error": "bad key"})
        if not self.path.endswith("/v1/chat/completions"):
            return self.reply(404, {"error": "no route"})
        if body["model"] not in ("x-test-1", "default"):
            return self.reply(404, {"error": f"model {body['model']} not found"})
        if CALLS["fail_next"]:
            CALLS["fail_next"] -= 1
            self.send_response(429); self.send_header("Retry-After", "0"); self.end_headers(); return
        CALLS["chat"] += 1
        assert body["temperature"] == 0
        user = body["messages"][-1]["content"]
        if "OK" in user and "新闻" not in user:
            return self.reply(200, {"choices": [{"message": {"content": "OK"}}]})
        news = json.loads(user.split("新闻：\n", 1)[1])
        items = []
        for row in news:
            t = row["title"].lower()
            if "beats" in t:
                items.append({"id": row["id"], "relevance": 1, "sentiment": 0.8, "event": "earnings", "reason": "业绩超预期"})
            elif "lawsuit" in t:
                items.append({"id": row["id"], "relevance": 0.9, "sentiment": -0.6, "event": "litigation", "reason": "诉讼风险"})
            elif "market" in t:
                items.append({"id": row["id"], "relevance": 0.2, "sentiment": 0.1, "event": "MACRO", "reason": "大盘"})
            # anything else is silently dropped -> must come back unscored, not crash
        content = json.dumps({"items": items}, ensure_ascii=False)
        if CALLS["fence"]:
            content = f"<think>reasoning…</think>\n```json\n{content}\n```"
        self.reply(200, {"choices": [{"message": {"content": content}}]})

    def reply(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)


def start_fake():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeLLM)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


NOW = time.time()
NEWS = [
    {"title": "Acme beats Q3 estimates", "published": NOW - 3600, "source": "Reuters", "link": "https://x/1", "feed": "yahoo", "tagged": True},
    {"title": "Acme faces patent lawsuit", "published": NOW - 3 * 86400, "source": "Bloomberg", "link": "https://x/2", "feed": "google", "tagged": False},
    {"title": "Stock market wrap", "published": NOW - 86400, "source": "CNBC", "link": "https://x/3", "feed": "google", "tagged": False},
    {"title": "Something the model ignores", "published": NOW - 86400, "source": "Blog", "link": None, "feed": "google", "tagged": False},
]


def fake_fetch(symbol, name, **kwargs):
    return [dict(item) for item in NEWS], "Acme Corp", []


def main():
    srv = start_fake()
    base = f"http://127.0.0.1:{srv.server_address[1]}/v1"
    good = {"api_key": "good-key", "base_url": base, "model": "x-test-1"}
    db = Path(tempfile.mkdtemp()) / "s.sqlite"
    no_sleep = lambda s: None  # noqa: E731

    # 1. parsing helpers
    assert ns.parse_json_block('```json\n{"a": 1}\n```') == {"a": 1}
    assert ns.parse_json_block('<think>x</think>Sure: {"items": []} done') == {"items": []}

    # 2. aggregation math: one fresh, fully relevant +0.8 story -> 0.8 * 1 / (1 + K)
    agg = ns.aggregate([{"title": "t", "published": NOW, "relevance": 1.0, "sentiment": 0.8, "event": "earnings"}], NOW)
    assert abs(agg["score"] - 0.4) < 1e-9 and agg["raw"] == 0.8, agg
    old = ns.aggregate([{"title": "t", "published": NOW - 3 * 86400, "relevance": 1.0, "sentiment": 0.8, "event": "earnings"}], NOW)
    assert abs(old["evidence"] - 0.5) < 1e-3, old  # one half-life later the weight halves

    # 3. not configured -> headlines still returned, unscored, no crash
    out = ns.compute_sentiment("ACME", cfg={"api_key": None, "base_url": "", "model": "x-test-1"}, db_path=db, fetch=fake_fetch, now=NOW)
    assert out["status"] == "not_configured" and len(out["items"]) == 4 and out["score"] is None

    # 4. first run: one 429 is retried, 3 of 4 headlines scored, JSON fences / <think> tolerated
    CALLS.update(fail_next=1, fence=True)
    chat = lambda m, c: ns.chat(m, c, sleep=no_sleep)  # noqa: E731
    out = ns.compute_sentiment("ACME", cfg=good, db_path=db, fetch=fake_fetch, chat_fn=chat, now=NOW)
    assert out["status"] == "partial", out["status"]
    assert out["stats"] == {"cached": 0, "scored": 3, "llmCalls": 1}, out["stats"]
    assert CALLS["chat"] == 1
    by_title = {item["title"]: item for item in out["items"]}
    assert by_title["Stock market wrap"]["event"] == "macro"          # upper-case event normalised
    assert "sentiment" not in by_title["Something the model ignores"]  # dropped row stays unscored
    assert out["score"] > 0 and out["positive"] == 1 and out["negative"] == 1, out
    assert out["label"] in ("偏多", "中性", "明显偏多")
    assert len(out["history"]) == 1 and out["history"][0]["score"] == out["score"]

    # 5. second run: the 3 scored headlines come from the cache; only the unscored one is retried
    CALLS.update(fence=False)
    out2 = ns.compute_sentiment("ACME", cfg=good, db_path=db, fetch=fake_fetch, chat_fn=chat, now=NOW + 60)
    assert out2["stats"]["cached"] == 3 and out2["stats"]["scored"] == 0, out2["stats"]
    assert len(out2["history"]) == 1  # same day -> upsert, not a duplicate row

    # 6. clear error messages
    for cfg, needle in (({**good, "api_key": "wrong"}, "认证失败"), ({**good, "base_url": base[:-3]}, "/v1")):
        try:
            ns.chat([{"role": "user", "content": "hi"}], cfg, sleep=no_sleep)
            raise AssertionError("expected LLMError")
        except ns.LLMError as exc:
            assert needle in str(exc), exc
    bad = ns.compute_sentiment("BAD", cfg={**good, "api_key": "wrong"}, db_path=db, fetch=fake_fetch, now=NOW)
    assert bad["status"] == "llm_error" and "认证失败" in bad["llmError"] and len(bad["items"]) == 4

    # 6b. withdrawn trial model -> automatic fallback to the stable alias
    gone = {**good, "model": "x-gone", "fallback_model": "default"}
    out3 = ns.compute_sentiment("FALL", cfg=gone, db_path=db, fetch=fake_fetch, chat_fn=lambda m, c: ns.chat(m, c, sleep=no_sleep), now=NOW)
    assert out3["status"] == "partial" and out3["llm"]["model"] == "default", out3["llm"]
    nofb = {**good, "model": "x-gone", "fallback_model": None}
    try:
        ns.chat([{"role": "user", "content": "hi"}], nofb, sleep=no_sleep); raise AssertionError("expected LLMError")
    except ns.LLMError as exc:
        assert "x-gone" in str(exc), exc

    # 7. connection check + config file parsing (key never exposed)
    ok = ns.check_connection(good)
    assert ok["ok"] and ok["reply"] == "OK" and "api_key" not in ok, ok
    env = Path(tempfile.mkdtemp()) / "soclaas.env"
    env.write_text('# comment\nexport SOCLAAS_API_KEY="abc"\nSOCLAAS_BASE_URL=https://host.example/v1/\n', encoding="utf-8")
    cfg = ns.load_config(env)
    assert cfg == {"api_key": "abc", "base_url": "https://host.example/v1", "model": "x-test-1", "fallback_model": "default"}, cfg
    assert ns.public_config(cfg) == {"configured": True, "model": "x-test-1", "host": "host.example"}

    # 8. query building and RSS-title cleanup inputs
    assert ns.news_query("600519.SS", "Kweichow Moutai Co., Ltd.") == '"Kweichow Moutai" OR 600519'
    assert ns.news_query("AAPL", "Apple Inc.") == '"Apple" OR "AAPL stock"'
    assert ns.google_locale("0700.HK")[0] == "zh-HK"
    assert ns.news_query("0700.HK", None) == '"00700.HK"'
    assert ns.news_query("0700.HK", "Tencent Holdings Limited") == '"Tencent" OR "00700.HK"'
    assert ns.news_query("NVDA", None) == "NVDA stock"

    # 9. v2.4 non-equity assets: classification, FX direction, queries, prompt and event validation
    cls = {s: ns.asset_class(s) for s in ("AAPL", "0700.HK", "600519.SS", "^GSPC", "000300.SS", "HSTECH.HK", "CL=F", "KC=F",
                                          "XAUUSD=X", "EURUSD=X", "JPY=X", "BTC-USD", "SOL-USDT", "^FCHI")}
    assert cls == {"AAPL": "equity", "0700.HK": "equity", "600519.SS": "equity", "^GSPC": "index", "000300.SS": "index",
                   "HSTECH.HK": "index", "CL=F": "future", "KC=F": "future", "XAUUSD=X": "commodity", "EURUSD=X": "fx",
                   "JPY=X": "fx", "BTC-USD": "crypto", "SOL-USDT": "crypto", "^FCHI": "index"}, cls
    assert ns.fx_pair("EURUSD=X") == ("EUR", "USD") and ns.fx_pair("JPY=X") == ("USD", "JPY")
    jpy = ns.asset_profile("JPY=X")
    assert "USD/JPY 报价上升" in jpy["direction"] and any(loc == "CN" for _, loc in jpy["queries"]), jpy
    assert "VIX 上升" in ns.asset_profile("^VIX")["direction"] and "收益率下降" in ns.asset_profile("ZN=F")["direction"]
    assert ns.asset_profile("KC=F", "Coffee Dec 26")["queries"] == [('"Coffee" futures OR prices', "US")]
    assert ns.asset_profile("AAPL")["queries"] == []
    import hashlib  # equity cache keys are unchanged from v2.1, so stored scores stay valid
    assert ns.cache_key("AAPL", "Apple beats", "m") == hashlib.sha1("v1|m|AAPL|applebeats".encode()).hexdigest()
    assert ns.cache_key("CL=F", "Oil", "m") != hashlib.sha1("v1|m|CL=F|oil".encode()).hexdigest()

    def rss(titles):
        stamp = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(NOW - 7200))
        return ("<rss><channel>" + "".join(f"<item><title>{t} - Wire</title><link>https://n/{i}</link><pubDate>{stamp}</pubDate>"
                                           f"<source url='x'>Wire</source></item>" for i, t in enumerate(titles)) + "</channel></rss>").encode()
    seen_urls = []
    def fake_http(url, timeout=10):
        seen_urls.append(url)
        if "finance.yahoo.com" in url:
            raise OSError("429")
        return rss([f"US headline {i}" for i in range(30)]) if "hl=en-US" in url else rss([f"中文新闻{i}" for i in range(30)])
    real_http = ns._http_get
    ns._http_get = fake_http
    try:
        news, name, errors = ns.fetch_news("CL=F", "WTI 原油期货", now=NOW)
    finally:
        ns._http_get = real_http
    assert sum(1 for u in seen_urls if "news.google.com" in u) == 2 and any("hl=zh-CN" in u for u in seen_urls)
    assert len(news) == 30 and {n["feed"] for n in news} == {"google-us", "google-cn"}       # 15 per query, interleaved
    assert any("Yahoo" in e for e in errors)

    captured = {}
    def macro_chat(messages, cfg):
        captured["system"], captured["user"] = messages[0]["content"], messages[1]["content"]
        rows = json.loads(messages[1]["content"].split("新闻：\n", 1)[1])
        return json.dumps({"items": [{"id": r["id"], "relevance": 0.9, "sentiment": 0.4, "event": "monetary" if i == 0 else "earnings", "reason": "日本央行"}
                                     for i, r in enumerate(rows)]})
    fx_news = lambda symbol, name, **kw: ([{"title": "BOJ signals hike, yen jumps", "published": NOW - 3600, "source": "R", "link": None, "feed": "google-us"},
                                           {"title": "Yen slips", "published": NOW - 7200, "source": "R", "link": None, "feed": "google-us"}], None, [])
    fx = ns.compute_sentiment("JPY=X", cfg=good, db_path=db, fetch=fx_news, chat_fn=macro_chat, now=NOW)
    assert fx["status"] == "ok" and fx["asset"]["class"] == "fx" and fx["name"] == "美元/日元（USD/JPY）", fx.get("asset")
    assert "跨资产" in captured["system"] and "USD/JPY 报价上升" in captured["user"] and "两国央行" in captured["user"]
    assert [i["event"] for i in fx["items"]] == ["monetary", "other"]                      # "earnings" is not an FX event
    assert fx["items"][0]["eventLabel"] == "央行与利率" and fx["score"] > 0

    srv.shutdown()
    print("news_sentiment: all checks passed")


if __name__ == "__main__":
    main()
