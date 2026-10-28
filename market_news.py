#!/usr/bin/env python3
"""Today's top-10 market news and a news-based market sentiment reading (QuantScope v2.3).

Pipeline
--------
1. ``collect``   last-24h headlines from Google News (Business top stories, a US markets query, Chinese and
                 Hong Kong market queries) and Eastmoney's 7x24 "要闻" flash feed -- public, key-less feeds.
2. ``dedupe``    near-duplicate headlines are merged (word / character-bigram Jaccard).
3. ``prescore``  a transparent heuristic (feed rank, number of outlets covering the story, recency,
                 market-wide keywords) keeps the 60 strongest candidates.
4. ``rank_llm``  the SoCLaaS LLM (same gateway as the stock news factor) merges stories about the same event,
                 picks the ten most market-moving ones, writes a Chinese headline + summary and scores each
                 story's direction (-1..1) and importance (0..1) for the US, China and Hong Kong markets.
                 Without an LLM the heuristic order is used and no sentiment is reported.
5. ``aggregate`` news sentiment per market = importance-weighted mean of the selected stories that concern it.

Each run is stored (data/sentiment.sqlite, table market_news_daily) so past days can be reviewed.
"""

from __future__ import annotations

import email.utils
import hashlib
import json
import math
import re
import sqlite3
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import news_sentiment as ns

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "sentiment.sqlite"
WINDOW_HOURS = 24
MAX_CANDIDATES = 60
TOP_N = 10
SGT = timezone(timedelta(hours=8))

GOOGLE_BUSINESS = ("https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB"
                   "?hl=en-US&gl=US&ceid=US:en")
FEEDS = [
    # key, label, kind, url/query, weight, default regions
    ("gbiz", "Google 新闻·财经头条", "google", GOOGLE_BUSINESS, 1.00, ["US", "GLOBAL"]),
    ("gus", "Google 新闻·美股", "google",
     "https://news.google.com/rss/search?q=" + quote('(stocks OR "stock market" OR "Wall Street" OR Fed OR "Treasury yields" OR "oil prices" OR tariffs) when:1d')
     + "&hl=en-US&gl=US&ceid=US:en", 0.80, ["US"]),
    ("gcn", "Google 新闻·A股", "google",
     "https://news.google.com/rss/search?q=" + quote("(A股 OR 股市 OR 央行 OR 人民币 OR 证监会 OR 沪指) when:1d") + "&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", 0.75, ["CN"]),
    ("ghk", "Google 新闻·港股", "google",
     "https://news.google.com/rss/search?q=" + quote("(港股 OR 恒指 OR 恒生指數 OR 金管局 OR 港交所) when:1d") + "&hl=zh-HK&gl=HK&ceid=HK:zh-Hant", 0.65, ["HK"]),
    ("em", "东方财富 7×24 要闻", "eastmoney",
     "https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=101&sortEnd=&pageSize=60&req_trace=qs", 0.90, ["CN"]),
]
CATEGORIES = ["宏观数据", "央行与利率", "财政与监管", "地缘政治", "贸易与关税", "公司财报", "公司事件", "大宗商品", "科技与AI", "金融风险", "其他"]
REGIONS = ["US", "CN", "HK", "GLOBAL", "EU", "JP", "OTHER"]
KEYWORDS = re.compile(
    r"\b(fed|fomc|powell|rate (cut|hike)s?|inflation|cpi|pce|payrolls?|jobs report|gdp|recession|treasur(y|ies)|yields?|tariffs?|"
    r"trade war|sanctions?|opec|oil|crude|gold|dollar|ecb|boj|pboc|stimulus|default|bank(ing)? crisis|s&p ?500|nasdaq|dow|"
    r"nvidia|apple|microsoft|alphabet|google|amazon|meta|tesla|tsmc|earnings|guidance|ipo|merger|antitrust|ai)\b"
    r"|美联储|降息|加息|通胀|就业|国债|收益率|关税|制裁|原油|黄金|美元|人民币|汇率|央行|降准|逆回购|证监会|国常会|政治局|财政|"
    r"稳增长|地产|楼市|A股|沪指|港股|恒指|恒生|美股|纳指|标普|财报|业绩|并购|IPO|芯片|半导体|人工智能|AI|地缘|冲突|停火",
    re.I,
)

SYSTEM_PROMPT = (
    "你是一名资深的全球宏观与股票市场编辑，负责每天为投资者挑选最重要的市场新闻。"
    "只依据给出的标题和摘要判断，不要编造数字或细节；只输出 JSON。"
)
USER_TEMPLATE = """现在是新加坡时间 {now}。下面是过去 24 小时抓到的 {n} 条候选新闻（id、标题 t、来源 s、距今小时数 h、报道该事件的媒体数 c、摘要 d）。

任务：
1. 选出对全球股市、尤其是美股 / A 股 / 港股影响最大的 {top} 个事件。同一事件的多条报道合并为一个，把它们的 id 全部放进 ids。
   优先：央行与利率、关键宏观数据、重大政策与监管、地缘政治、贸易与关税、大型公司财报与指引、大宗商品剧烈波动、系统性金融风险。
   不要选：软文、个人理财建议、地方性或娱乐新闻、与市场无关的社会新闻。
2. 按重要性从高到低排列，对每个事件输出：
   - ids：合并的候选 id 列表
   - title：中文标题，不超过 30 字
   - summary：中文摘要，不超过 70 字，写清事件和对市场的含义
   - category：从 {categories} 中选一个
   - regions：受影响的市场，从 {regions} 中选 1–3 个（GLOBAL 表示全球性影响）
   - sentiment：-1 到 1，对相关市场风险偏好 / 股价的影响方向和强度（0 = 中性或不确定；常规新闻在 ±0.5 以内）
   - importance：0 到 1，对市场的重要程度
   - assets：最受影响的资产或板块，不超过 20 字
3. 输出 overview：US、CN、HK、GLOBAL 四个市场今天由新闻推动的情绪（-1 到 1），以及 summary（中文，不超过 100 字的今日市场情绪综述）。

只输出 {{"top": [...], "overview": {{...}}}}。

候选新闻：
{news}"""


# ------------------------------------------------------------------------------------------- collecting
def _parse_google(xml_bytes: bytes, feed: tuple, now: float) -> list[dict]:
    key, label, _, _, weight, regions = feed
    root = ET.fromstring(xml_bytes)
    out = []
    for rank, node in enumerate(root.iter("item")):
        title = ns._clean_text(node.findtext("title"))
        source = ns._clean_text(node.findtext("source"))
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        try:
            published = int(email.utils.parsedate_to_datetime(node.findtext("pubDate") or "").timestamp())
        except (TypeError, ValueError, IndexError):
            continue
        desc = node.findtext("description") or ""
        related = [ns._clean_text(m) for m in re.findall(r"<a [^>]*>(.*?)</a>", desc)]
        outlets = [ns._clean_text(m) for m in re.findall(r"<font[^>]*>(.*?)</font>", desc)]
        if title:
            out.append({"feed": key, "feedLabel": label, "title": title, "source": source or "Google News", "link": node.findtext("link"),
                        "published": published, "rank": rank, "coverage": max(1, len(outlets)), "outlets": [o for o in outlets if o][:6] or [source],
                        "related": related[1:4], "summary": "", "weight": weight, "regionHint": regions})
    return out


def _parse_eastmoney(data: dict, feed: tuple) -> list[dict]:
    key, label, _, _, weight, regions = feed
    out = []
    for rank, item in enumerate(((data or {}).get("data") or {}).get("fastNewsList") or []):
        title = ns._clean_text(item.get("title"))
        try:
            published = int(datetime.strptime(item.get("showTime", ""), "%Y-%m-%d %H:%M:%S").replace(tzinfo=SGT).timestamp())
        except ValueError:
            continue
        summary = re.sub(r"^【[^】]*】", "", ns._clean_text(item.get("summary")))
        code = item.get("code")
        if title:
            out.append({"feed": key, "feedLabel": label, "title": title, "source": "东方财富", "link": f"https://finance.eastmoney.com/a/{code}.html" if code else None,
                        "published": published, "rank": rank, "coverage": 1, "outlets": ["东方财富"], "related": [], "summary": summary[:160],
                        "weight": weight, "regionHint": regions})
    return out


def collect(now: float | None = None, http_get=None) -> tuple[list[dict], list[str]]:
    now = now or time.time()
    get = http_get or ns._http_get
    items, errors = [], []
    for feed in FEEDS:
        try:
            raw = get(feed[3])
            items.extend(_parse_google(raw, feed, now) if feed[2] == "google" else _parse_eastmoney(json.loads(raw), feed))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{feed[1]}：{str(exc)[:80]}")
    fresh = [i for i in items if 0 <= now - i["published"] <= WINDOW_HOURS * 3600 or (i["published"] > now and i["published"] - now < 3600)]
    return fresh, errors


# ------------------------------------------------------------------------------------------- dedupe & heuristic
def _tokens(title: str) -> set[str]:
    t = title.lower()
    words = set(re.findall(r"[a-z0-9]{3,}", t))
    cjk = re.sub(r"[^一-鿿]", "", t)
    return words | {cjk[i:i + 2] for i in range(len(cjk) - 1)}


def _similar(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def dedupe(items: list[dict], threshold: float = 0.55) -> list[dict]:
    """Greedy clustering; a headline joins a cluster when it matches the cluster's lead title or any of its titles
    (Google's related-coverage headlines included)."""
    clusters: list[dict] = []
    for item in sorted(items, key=lambda i: (-i["weight"], i["rank"])):
        title_tok = _tokens(item["title"])
        tok = title_tok | _tokens(" ".join(item.get("related", [])))
        for c in clusters:
            if max([_similar(title_tok, t) for t in c["_titles"]] + [_similar(tok, c["_tok"])]) >= threshold:
                c["_titles"].append(title_tok)
                c["coverage"] = max(c["coverage"], item["coverage"]) + (1 if item["source"] not in c["outlets"] else 0)
                c["outlets"] = list(dict.fromkeys(c["outlets"] + item["outlets"]))[:8]
                c["published"] = max(c["published"], item["published"])
                c["feeds"] = sorted(set(c["feeds"]) | {item["feed"]})
                c["_tok"] |= tok
                break
        else:
            clusters.append({**item, "feeds": [item["feed"]], "_tok": tok, "_titles": [title_tok] + [_tokens(r) for r in item.get("related", [])]})
    for c in clusters:
        c.pop("_tok", None)
        c.pop("_titles", None)
    return clusters


def prescore(item: dict, now: float) -> float:
    """Feed rank + breadth of coverage + recency + market-wide keywords. Used to shortlist (and as the ranking without an LLM)."""
    age_h = max(0.0, (now - item["published"]) / 3600)
    kw = len(set(m.group(0).lower() for m in KEYWORDS.finditer(item["title"] + " " + item.get("summary", ""))))
    item["keywords"] = kw
    return round(item["weight"] / (1 + item["rank"] / 10) + 0.25 * math.log2(1 + item["coverage"]) + 0.3 * max(0.0, 1 - age_h / WINDOW_HOURS)
                 + min(0.5, 0.15 * kw) + 0.1 * (len(item.get("feeds", [])) - 1), 4)


def shortlist(items: list[dict], now: float) -> list[dict]:
    clusters = dedupe(items)
    for c in clusters:
        c["prescore"] = prescore(c, now)
    clusters.sort(key=lambda c: -c["prescore"])
    for i, c in enumerate(clusters[:MAX_CANDIDATES]):
        c["id"] = f"n{i + 1}"
    return clusters[:MAX_CANDIDATES]


# ------------------------------------------------------------------------------------------- LLM ranking
def _clip(value, lo, hi):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return None if x != x else max(lo, min(hi, x))


def rank_llm(cands: list[dict], cfg: dict, now: float, chat_fn=ns.chat) -> tuple[list[dict], dict]:
    lines = [{"id": c["id"], "t": c["title"], "s": "/".join(c["outlets"][:3]), "h": round((now - c["published"]) / 3600, 1), "c": c["coverage"],
              **({"d": c["summary"][:90]} if c.get("summary") else {})} for c in cands]
    prompt = USER_TEMPLATE.format(now=datetime.fromtimestamp(now, SGT).strftime("%Y-%m-%d %H:%M"), n=len(cands), top=TOP_N + 2,
                                  categories="、".join(CATEGORIES), regions="、".join(REGIONS),
                                  news="\n".join(json.dumps(x, ensure_ascii=False) for x in lines))
    text = chat_fn([{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}], cfg, timeout=150)
    try:
        data = ns.parse_json_block(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ns.LLMError(f"模型没有按 JSON 输出：{str(text)[:120]!r}") from exc
    by_id = {c["id"]: c for c in cands}
    used, top = set(), []
    for row in (data.get("top") if isinstance(data, dict) else None) or []:
        ids = [i for i in (row.get("ids") or []) if i in by_id and i not in used]
        if not ids:
            continue
        used.update(ids)
        members = [by_id[i] for i in ids]
        lead = max(members, key=lambda m: (m["weight"], m["coverage"]))
        regions = [r for r in (row.get("regions") or []) if r in REGIONS][:3] or lead["regionHint"]
        category = row.get("category") if row.get("category") in CATEGORIES else "其他"
        top.append({
            "title": ns._clean_text(str(row.get("title") or lead["title"]))[:60], "summary": ns._clean_text(str(row.get("summary") or ""))[:160],
            "category": category, "regions": regions, "sentiment": _clip(row.get("sentiment"), -1, 1), "importance": _clip(row.get("importance"), 0, 1),
            "assets": ns._clean_text(str(row.get("assets") or ""))[:40], "original": lead["title"], "link": lead.get("link"),
            "published": max(m["published"] for m in members), "outlets": list(dict.fromkeys(o for m in members for o in m["outlets"]))[:8],
            "coverage": sum(m["coverage"] for m in members), "feeds": sorted({f for m in members for f in m["feeds"]}), "ids": ids,
        })
        if len(top) == TOP_N:
            break
    overview = data.get("overview") if isinstance(data, dict) and isinstance(data.get("overview"), dict) else {}
    view = {k: _clip(overview.get(k), -1, 1) for k in ("US", "CN", "HK", "GLOBAL")}
    view["summary"] = ns._clean_text(str(overview.get("summary") or ""))[:240]
    return top, view


def heuristic_top(cands: list[dict], n: int = TOP_N) -> list[dict]:
    """No-LLM ranking: market-keyword stories first, at least two A-share and two HK stories when available."""
    pool = sorted(cands, key=lambda c: (c.get("keywords", 0) == 0, -c.get("prescore", 0)))
    picked = []
    for feeds, k in ((("gcn", "em"), 2), (("ghk",), 2)):
        picked += [c for c in pool if set(c["feeds"]) & set(feeds) and c not in picked][:k]
    picked += [c for c in pool if c not in picked][: max(0, n - len(picked))]
    picked = sorted(picked[:n], key=lambda c: (c.get("keywords", 0) == 0, -c.get("prescore", 0)))
    return [{"title": c["title"], "summary": c.get("summary", ""), "category": None, "regions": c["regionHint"], "sentiment": None, "importance": None,
             "assets": "", "original": c["title"], "link": c.get("link"), "published": c["published"], "outlets": c["outlets"], "coverage": c["coverage"],
             "feeds": c["feeds"], "ids": [c["id"]]} for c in picked]


def aggregate(top: list[dict]) -> dict:
    """Importance-weighted news sentiment per market; GLOBAL stories count for every market."""
    out = {}
    for region in ("US", "CN", "HK", "ALL"):
        rows = [t for t in top if t.get("sentiment") is not None and (region == "ALL" or region in t["regions"] or "GLOBAL" in t["regions"])]
        w = sum((t.get("importance") or 0.5) for t in rows)
        score = sum((t.get("importance") or 0.5) * t["sentiment"] for t in rows) / w if w else None
        out[region] = {"score": round(score, 3) if score is not None else None, "n": len(rows),
                       "positive": sum(1 for t in rows if t["sentiment"] > 0.15), "negative": sum(1 for t in rows if t["sentiment"] < -0.15)}
    return out


# ------------------------------------------------------------------------------------------- storage & entry point
def store(result: dict, db_path=None) -> None:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=10)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS market_news_daily (date TEXT PRIMARY KEY, payload TEXT, updated REAL)")
        con.execute("CREATE TABLE IF NOT EXISTS market_daily (region TEXT, date TEXT, fg REAL, news REAL, updated REAL, PRIMARY KEY (region, date))")
        day = result["date"]
        con.execute("INSERT OR REPLACE INTO market_news_daily VALUES (?,?,?)", (day, json.dumps(result, ensure_ascii=False), time.time()))
        for region in ("US", "CN", "HK"):
            score = (result.get("sentiment") or {}).get(region, {}).get("score")
            if score is not None:
                con.execute("INSERT INTO market_daily (region, date, news, updated) VALUES (?,?,?,?) "
                            "ON CONFLICT(region, date) DO UPDATE SET news=excluded.news, updated=excluded.updated", (region, day, score, time.time()))
        con.commit()
    finally:
        con.close()


def compute_market_news(*, cfg: dict | None = None, now: float | None = None, http_get=None, chat_fn=ns.chat, db_path=None) -> dict:
    now = now or time.time()
    cfg = cfg or ns.load_config()
    items, errors = collect(now, http_get)
    cands = shortlist(items, now)
    result = {"asOf": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"), "date": datetime.fromtimestamp(now, SGT).strftime("%Y-%m-%d"),
              "windowHours": WINDOW_HOURS, "collected": len(items), "candidates": len(cands), "llm": ns.public_config(cfg), "errors": errors,
              "feeds": [{"key": f[0], "label": f[1]} for f in FEEDS]}
    if not cands:
        result.update(status="no_news", top=[], sentiment=aggregate([]), overview={})
        return result
    top, overview, status = [], {}, "heuristic"
    if ns.is_configured(cfg):
        try:
            top, overview = rank_llm(cands, cfg, now, chat_fn)
            status = "ok" if len(top) >= min(TOP_N, len(cands)) * 0.7 else "partial"
            if len(top) < TOP_N:  # top up with the strongest remaining heuristic picks that are not the same story
                used = {i for t in top for i in t["ids"]}
                chosen = [_tokens(c["title"]) for c in cands if c["id"] in used]
                rest = [c for c in cands if c["id"] not in used and max([_similar(_tokens(c["title"]), t) for t in chosen] + [0]) < 0.35]
                top += heuristic_top(rest, TOP_N - len(top))
        except ns.LLMError as exc:
            errors.append(str(exc))
            result["llmError"] = str(exc)
            status = "llm_error"
    if not top:
        top = heuristic_top(cands)
    for i, t in enumerate(top, 1):
        t["rank"] = i
    result["llm"] = ns.public_config(cfg)
    result.update(status=status, top=top, overview=overview, sentiment=aggregate(top))
    try:
        store(result, db_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"记录失败：{exc}")
    return result


if __name__ == "__main__":
    data = compute_market_news()
    print(f"status={data['status']} collected={data['collected']} candidates={data['candidates']}")
    for t in data["top"]:
        senti = "--" if t["sentiment"] is None else f"{t['sentiment']:+.2f}"
        print(f"{t['rank']:>2}. [{t.get('category') or '-'}] {senti} {t['title']}  ({'/'.join(t['outlets'][:3])})")
    print("sentiment:", data["sentiment"])
    for e in data["errors"]:
        print("!", e)
