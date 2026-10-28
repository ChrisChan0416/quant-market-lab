"""Offline tests for market_sentiment.py and market_news.py (no network, no LLM)."""
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import market_news as mn  # noqa: E402
import market_sentiment as ms  # noqa: E402

# ------------------------------------------------------------------ percentile / composite maths
vals = [float(i) for i in range(300)]
p = ms.pct_rank(vals)
assert p[118] is None and p[119] is not None                       # MIN_WINDOW
assert abs(p[-1] - 100 * (251 + 0.5) / 252) < 1e-9                 # newest value is the max of its window
assert ms.pct_rank([5.0] * 200)[-1] == 50.0                        # ties count half
future = vals[:200] + [-1e9] * 100                                 # changing the future must not change the past
assert ms.pct_rank(future)[:200] == p[:200], "look-ahead in pct_rank"

dates = [(datetime(2024, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(30)]
index = {"dates": dates, "close": [100.0 + i for i in range(30)]}
c1 = {"key": "a", "series": {d: (0, 0, 80.0) for d in dates}}
c2 = {"key": "b", "series": {d: (0, 0, 20.0) for d in dates[:20]}}  # stops updating after day 20
comp = ms.composite(index, [c1, c2])
assert comp[0]["score"] == 50.0 and comp[24]["score"] == 50.0      # forward-filled up to FFILL sessions
assert len(comp) == 25 and comp[-1]["date"] == dates[24]          # then dropped (needs >= 60% of components)
assert all(h["n"] == 2 for h in comp), "composite must require the minimum number of components"

hist = [{"date": d, "score": (10.0 if i % 2 else 90.0), "close": 100.0 * (1.01 ** i)} for i, d in enumerate(dates)]
f = ms.forward_test(hist, horizon=5)
assert f["n"] == 25 and abs(f["buckets"][0]["mean"] - (1.01 ** 5 - 1)) < 1e-9 and f["buckets"][0]["hit"] == 1.0
assert ms.label_for(10) == "极度恐惧" and ms.label_for(50) == "中性" and ms.label_for(100) == "极度贪婪" and ms.label_for(None) == "数据不足"

# ------------------------------------------------------------------ sessions & partial bars
utc = timezone.utc
assert ms.session_state("CN", "2026-10-22", datetime(2026, 10, 22, 3, 5, tzinfo=utc)) == "open"     # 11:05 Beijing
assert ms.session_state("CN", "2026-10-22", datetime(2026, 10, 22, 8, 0, tzinfo=utc)) == "closed"   # 16:00 Beijing
assert ms.session_state("US", "2026-10-21", datetime(2026, 10, 22, 3, 5, tzinfo=utc)) == "closed"   # yesterday's bar
assert ms.session_state("US", "2026-10-22", datetime(2026, 10, 22, 15, 0, tzinfo=utc)) == "open"    # 11:00 New York
assert ms.drop_partial({"dates": [1, 2, 3], "close": [4, 5, 6], "name": "x"}) == {"dates": [1, 2], "close": [4, 5], "name": "x"}

# ------------------------------------------------------------------ Eastmoney kline parsing (real response format)
rows = [f"2025-{1 + i // 28:02d}-{1 + i % 28:02d},{100 + i}.5,{1e9 + i:.2f}" for i in range(150)] + ["bad,row", "2025-12-31,-,0"]
k = ms.em_kline("1.000300", get=lambda url, timeout=12: {"data": {"name": "沪深300", "klines": rows}})
assert len(k["close"]) == 150 and k["close"][0] == 100.5 and k["amount"][1] == 1e9 + 1 and k["name"] == "沪深300"

# realised vol of a constant-growth series is ~0; of alternating returns is large
assert ms.realized_vol([100 * 1.01 ** i for i in range(40)])[-1] < 1e-9
assert ms.realized_vol([100 * (1.02 if i % 2 else 1.0) for i in range(40)])[-1] > 0.3

# ------------------------------------------------------------------ news: parsing, dedupe, LLM output handling
now = datetime(2026, 10, 22, 3, 20, tzinfo=utc).timestamp()
rss = """<rss><channel>
<item><title>Fed holds rates steady, signals patience - Reuters</title><link>https://n/1</link><pubDate>Thu, 22 Oct 2026 01:00:00 GMT</pubDate>
<description>&lt;ol&gt;&lt;li&gt;&lt;a href="x"&gt;Fed holds rates steady, signals patience&lt;/a&gt;&lt;font color="#6f6f6f"&gt;Reuters&lt;/font&gt;&lt;/li&gt;&lt;li&gt;&lt;a href="y"&gt;Powell: no rush to cut&lt;/a&gt;&lt;font color="#6f6f6f"&gt;CNBC&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;</description><source url="x">Reuters</source></item>
<item><title>Fed holds rates steady, signals patience - Bloomberg</title><link>https://n/2</link><pubDate>Thu, 22 Oct 2026 01:30:00 GMT</pubDate><source url="x">Bloomberg</source></item>
<item><title>Old story</title><link>https://n/3</link><pubDate>Mon, 19 Oct 2026 01:00:00 GMT</pubDate><source url="x">AP</source></item>
</channel></rss>"""
em = {"data": {"fastNewsList": [{"title": "央行开展逆回购操作", "summary": "【央行开展逆回购操作】央行今日开展1730亿元逆回购。", "showTime": "2026-10-22 09:15:00", "code": "1"}]}}
feeds = {f[3]: (rss if f[2] == "google" else json.dumps(em, ensure_ascii=False)) for f in mn.FEEDS}
items, errors = mn.collect(now, lambda url, timeout=10: feeds[url].encode("utf-8"))
assert not errors and all(now - i["published"] <= 86400 for i in items) and not any(i["title"] == "Old story" for i in items)
gb = [i for i in items if i["feed"] == "gbiz"]
assert gb[0]["title"] == "Fed holds rates steady, signals patience" and gb[0]["coverage"] == 2 and gb[0]["outlets"] == ["Reuters", "CNBC"]
assert [i for i in items if i["feed"] == "em"][0]["summary"].startswith("央行今日")
cands = mn.shortlist(items, now)
assert sum(1 for c in cands if c["title"].startswith("Fed holds")) == 1, "duplicates across feeds must merge"
fed = next(c for c in cands if c["title"].startswith("Fed holds"))
assert set(fed["feeds"]) >= {"gbiz", "gus"} and fed["keywords"] >= 1

ids = {c["title"][:3]: c["id"] for c in cands}
answer = {"top": [
    {"ids": [fed["id"], "nope"], "title": "美联储按兵不动", "summary": "鲍威尔称不急于降息", "category": "央行与利率", "regions": ["US", "GLOBAL", "MARS"], "sentiment": -2, "importance": 3},
    {"ids": [fed["id"]], "title": "重复", "category": "x"},                                        # already used -> dropped
    {"ids": [ids["央行开"]], "title": "央行逆回购", "category": "不存在", "regions": [], "sentiment": "0.3", "importance": None},
]}
res = mn.compute_market_news(cfg={"api_key": "k", "base_url": "https://x/v1", "model": "m"}, now=now,
                             http_get=lambda url, timeout=10: feeds[url].encode("utf-8"),
                             chat_fn=lambda m, c, **kw: "<think>...</think>```json\n" + json.dumps(answer, ensure_ascii=False) + "\n```",
                             db_path=tempfile.mktemp(suffix=".sqlite"))
top = res["top"]
assert top[0]["title"] == "美联储按兵不动" and top[0]["sentiment"] == -1 and top[0]["importance"] == 1 and top[0]["regions"] == ["US", "GLOBAL"]
assert top[1]["category"] == "其他" and top[1]["sentiment"] == 0.3 and top[1]["regions"] == ["CN"]
assert [t["rank"] for t in top] == list(range(1, len(top) + 1)) and len({t["ids"][0] for t in top}) == len(top)
s = res["sentiment"]
assert abs(s["US"]["score"] - (-1.0)) < 1e-9                       # only the Fed story concerns the US
assert abs(s["CN"]["score"] - ((1 * -1 + 0.5 * 0.3) / 1.5)) < 1e-3   # GLOBAL story counts for CN too; missing importance = 0.5
assert res["status"] in ("partial", "ok")

nollm = mn.compute_market_news(cfg={"api_key": None, "base_url": ""}, now=now, http_get=lambda url, timeout=10: feeds[url].encode("utf-8"),
                               db_path=tempfile.mktemp(suffix=".sqlite"))
assert nollm["status"] == "heuristic" and nollm["top"] and all(t["sentiment"] is None for t in nollm["top"])
print("market sentiment / news tests passed")
