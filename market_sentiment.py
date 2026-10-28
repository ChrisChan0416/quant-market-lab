#!/usr/bin/env python3
"""Market-wide sentiment ("fear & greed") for QuantScope v2.3.

For each market (US, Hong Kong, China A-shares) a handful of well-known sentiment proxies are computed
from daily data, each one is turned into its percentile rank within the trailing 252 trading days
(0 = most fearful reading of the past year, 100 = most greedy), and the composite is the equal-weight
mean of the available components -- the same construction CNN uses for its Fear & Greed Index.

Data (all free, no API key; verified 2026-10-22):
* Eastmoney push2his daily klines -- S&P 500, SPDR sector ETFs, SPY/TLT/HYG/IEF, HSI, HSTECH, VHSI,
  HK heavyweights, CSI 300 / CSI 1000, SSE / SZSE turnover
* Eastmoney datacenter -- A-share margin financing balance (融资余额)
* Eastmoney push2 / push2ex -- today's A-share advance/decline counts and limit-up / limit-down pools
* Yahoo chart API -- VIX and VIX3M only (Eastmoney does not carry the VIX)

Only components with a full history enter the composite, so today's reading, the history line and the
forward test are built the same way. Same-day snapshots (advancers/decliners, limit-up/down) are shown
next to the gauge but kept out of the composite.

Command line::

    python3 market_sentiment.py          # print today's readings for the three markets
"""

from __future__ import annotations

import json
import math
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import news_sentiment as ns

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "sentiment.sqlite"
WINDOW = 252          # percentile look-back (trading days)
MIN_WINDOW = 120      # minimum history before a percentile is reported
LMT = 1000            # daily bars requested per series (~4 years)
FWD = 20              # forward-test horizon (trading days)
FFILL = 5             # a component may lag the index by at most this many sessions
EM_KLINE = ("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}"
            "&fields1=f1,f2,f3&fields2=f51,f53,f57&klt=101&fqt=1&lmt={lmt}&end=20500101")
US_SECTORS = ["XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE", "XLC"]
HK_LEADERS = ["00700", "09988", "03690", "01810", "00939", "01299", "00005", "00388", "00941", "01211", "02318", "00883"]
LABELS = [(25, "极度恐惧"), (45, "恐惧"), (55, "中性"), (75, "贪婪"), (101, "极度贪婪")]
# local trading session (open, close) used to tell whether the last daily bar is still in progress
SESSIONS = {"US": ("America/New_York", "09:30", "16:00"), "HK": ("Asia/Hong_Kong", "09:30", "16:10"), "CN": ("Asia/Shanghai", "09:15", "15:00")}


def session_state(region: str, last_date: str, now: datetime | None = None) -> str:
    """'open' if last_date is today's bar and the market has not closed yet, else 'closed'."""
    tz_name, start, end = SESSIONS[region]
    try:
        from zoneinfo import ZoneInfo
        local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(tz_name))
    except Exception:  # noqa: BLE001 - no tz database: assume UTC+8 for Asia, UTC-4 for US
        local = (now or datetime.now(timezone.utc)).astimezone(timezone(timedelta(hours=-4 if region == "US" else 8)))
    hhmm = local.strftime("%H:%M")
    if last_date == local.strftime("%Y-%m-%d") and local.weekday() < 5 and start <= hhmm < end:
        return "open"
    return "closed"


def drop_partial(series: dict) -> dict:
    """Series without its last (in-progress) bar -- used for volume, which is cumulative during the day."""
    return {k: (v[:-1] if isinstance(v, list) else v) for k, v in series.items()}


def label_for(score: float | None) -> str:
    if score is None:
        return "数据不足"
    return next(text for bound, text in LABELS if score < bound)


# ------------------------------------------------------------------------------------------- fetching
def http_json(url: str, timeout: float = 12):
    return json.loads(ns._http_get(url, timeout=timeout))


def em_kline(secid: str, lmt: int = LMT, get=http_json) -> dict:
    """{'name', 'dates', 'close', 'amount'} from Eastmoney daily klines (front-adjusted)."""
    data = (get(EM_KLINE.format(secid=secid, lmt=lmt)) or {}).get("data")
    if not data or not data.get("klines"):
        raise RuntimeError(f"{secid}: 无数据")
    dates, close, amount = [], [], []
    for row in data["klines"]:
        parts = row.split(",")
        try:
            d, c = parts[0], float(parts[1])
            a = float(parts[2]) if len(parts) > 2 and parts[2] not in ("", "-") else 0.0
        except (ValueError, IndexError):
            continue
        if c > 0:
            dates.append(d)
            close.append(c)
            amount.append(a)
    if len(close) < MIN_WINDOW:
        raise RuntimeError(f"{secid}: 历史太短")
    return {"name": data.get("name") or secid, "dates": dates, "close": close, "amount": amount}


def em_kline_any(secids: list[str], get=http_json) -> dict:
    last = None
    for secid in secids:
        try:
            return em_kline(secid, get=get)
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(str(last))


def yahoo_series(symbol: str, get_json) -> dict:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?range=5y&interval=1d"
    result = get_json(url)["chart"]["result"][0]
    closes = result["indicators"]["quote"][0]["close"]
    dates, values = [], []
    for ts, value in zip(result.get("timestamp") or [], closes):
        if value is not None:
            dates.append(datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d"))
            values.append(float(value))
    if len(values) < MIN_WINDOW:
        raise RuntimeError(f"{symbol}: 历史太短")
    return {"name": symbol, "dates": dates, "close": values, "amount": [0.0] * len(values)}


def em_margin(get=http_json) -> dict:
    """A-share margin financing balance (融资余额, CNY), oldest first."""
    rows = []
    for page in (1, 2, 3):
        url = ("https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ&columns=DIM_DATE,RZYE"
               f"&source=WEB&sortColumns=dim_date&sortTypes=-1&pageNumber={page}&pageSize=500")
        data = ((get(url) or {}).get("result") or {}).get("data") or []
        rows.extend(data)
        if len(data) < 500:
            break
    rows = [r for r in rows if r.get("RZYE")]
    rows.sort(key=lambda r: r["DIM_DATE"])
    if len(rows) < MIN_WINDOW:
        raise RuntimeError("融资余额历史不足")
    return {"name": "融资余额", "dates": [r["DIM_DATE"][:10] for r in rows], "close": [float(r["RZYE"]) for r in rows], "amount": []}


# ------------------------------------------------------------------------------------------- math
def as_map(series: dict, key: str = "close") -> dict[str, float]:
    return dict(zip(series["dates"], series[key]))


def sma(values: list[float], n: int) -> list[float | None]:
    out, s = [], 0.0
    for i, v in enumerate(values):
        s += v
        if i >= n:
            s -= values[i - n]
        out.append(s / n if i >= n - 1 else None)
    return out


def ret(values: list[float], n: int) -> list[float | None]:
    return [values[i] / values[i - n] - 1 if i >= n and values[i - n] else None for i in range(len(values))]


def realized_vol(values: list[float], n: int = 20) -> list[float | None]:
    r = [math.log(values[i] / values[i - 1]) if i and values[i - 1] > 0 and values[i] > 0 else 0.0 for i in range(len(values))]
    out = []
    for i in range(len(values)):
        if i < n:
            out.append(None)
            continue
        w = r[i - n + 1:i + 1]
        m = sum(w) / n
        out.append(math.sqrt(sum((x - m) ** 2 for x in w) / (n - 1)) * math.sqrt(252))
    return out


def pct_rank(values: list[float | None], window: int = WINDOW, min_window: int = MIN_WINDOW) -> list[float | None]:
    """Percentile (0-100) of each value within the trailing window, ties counted half. No look-ahead."""
    out: list[float | None] = []
    for i, x in enumerate(values):
        if x is None:
            out.append(None)
            continue
        hist = [v for v in values[max(0, i - window + 1):i + 1] if v is not None]
        if len(hist) < min_window:
            out.append(None)
            continue
        below = sum(1 for v in hist if v < x)
        equal = sum(1 for v in hist if v == x)
        out.append(100.0 * (below + 0.5 * equal) / len(hist))
    return out


def aligned(*maps: dict[str, float]) -> tuple[list[str], list[list[float]]]:
    dates = sorted(set.intersection(*(set(m) for m in maps)))
    return dates, [[m[d] for d in dates] for m in maps]


def spearman(a: list[float], b: list[float]) -> float | None:
    def ranks(x):
        order = sorted(range(len(x)), key=lambda i: x[i])
        r = [0.0] * len(x)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return r
    if len(a) < 10:
        return None
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    sab = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    saa = sum((x - ma) ** 2 for x in ra)
    sbb = sum((y - mb) ** 2 for y in rb)
    return sab / math.sqrt(saa * sbb) if saa and sbb else None


# ------------------------------------------------------------------------------------------- components
def component(key, name, desc, dates, raw, direction, unit):
    """direction +1: higher raw value = more greed; -1: higher = more fear."""
    pct = pct_rank(raw)
    score = [None if p is None else (p if direction > 0 else 100 - p) for p in pct]
    return {"key": key, "name": name, "desc": desc, "unit": unit, "direction": direction,
            "series": {d: (r, p, s) for d, r, p, s in zip(dates, raw, pct, score) if s is not None}}


def c_momentum(idx, name):
    ma = sma(idx["close"], 125)
    raw = [c / m - 1 if m else None for c, m in zip(idx["close"], ma)]
    return component("momentum", "价格动量", f"{name} 相对 125 日均线的偏离", idx["dates"], raw, +1, "pct")


def c_ratio_to_ma(series, key, name, desc, direction, n=50):
    ma = sma(series["close"], n)
    raw = [c / m - 1 if m else None for c, m in zip(series["close"], ma)]
    return component(key, name, desc, series["dates"], raw, direction, "pct")


def c_spread(a, b, key, name, desc, direction, n=20):
    dates, (va, vb) = aligned(as_map(a), as_map(b))
    ra, rb = ret(va, n), ret(vb, n)
    raw = [x - y if x is not None and y is not None else None for x, y in zip(ra, rb)]
    return component(key, name, desc, dates, raw, direction, "pct")


def c_breadth(members: list[dict], key, name, desc, n=50, min_members=6):
    """% of members trading above their own n-day moving average, per date."""
    above: dict[str, list[int]] = {}
    for s in members:
        ma = sma(s["close"], n)
        for d, c, m in zip(s["dates"], s["close"], ma):
            if m is not None:
                above.setdefault(d, []).append(1 if c > m else 0)
    dates = sorted(d for d, v in above.items() if len(v) >= min_members)
    raw = [sum(above[d]) / len(above[d]) for d in dates]
    return component(key, name, desc + f"（{len(members)} 个成分）", dates, raw, +1, "share")


def c_vol(idx, name):
    raw = realized_vol(idx["close"], 20)
    return component("volatility", "实际波动率", f"{name} 20 日年化波动率（越高越恐惧）", idx["dates"], raw, -1, "pct")


def c_vix_term(vix, vix3m):
    dates, (a, b) = aligned(as_map(vix), as_map(vix3m))
    raw = [x / y if y else None for x, y in zip(a, b)]
    return component("vix_term", "VIX 期限结构", "VIX ÷ VIX3M，>1 为倒挂（短期恐慌）", dates, raw, -1, "ratio")


def c_turnover(sh, sz):
    dates, (a, b) = aligned(as_map(sh, "amount"), as_map(sz, "amount"))
    total = [x + y for x, y in zip(a, b)]
    m5, m120 = sma(total, 5), sma(total, 120)
    raw = [x / y if x and y else None for x, y in zip(m5, m120)]
    return component("turnover", "成交热度", "沪深两市成交额 5 日均值 ÷ 120 日均值", dates, raw, +1, "ratio")


def c_margin(margin):
    raw = ret(margin["close"], 20)
    return component("margin", "融资余额变化", "两融融资余额 20 日变化率（杠杆资金进出）", margin["dates"], raw, +1, "pct")


# ------------------------------------------------------------------------------------------- composite
def composite(index: dict, comps: list[dict]) -> list[dict]:
    """Equal-weight mean of component scores on each index date (components forward-filled <= FFILL sessions)."""
    k = len(comps)
    need = max(2, math.ceil(k * 0.6))
    last_seen: dict[str, tuple[int, float]] = {}
    out = []
    for i, d in enumerate(index["dates"]):
        vals = []
        for c in comps:
            hit = c["series"].get(d)
            if hit is not None:
                last_seen[c["key"]] = (i, hit[2])
            seen = last_seen.get(c["key"])
            if seen and i - seen[0] <= FFILL:
                vals.append(seen[1])
        if len(vals) >= need:
            out.append({"date": d, "score": round(sum(vals) / len(vals), 2), "n": len(vals), "close": index["close"][i]})
    return out


def forward_test(history: list[dict], horizon: int = FWD) -> dict:
    """Contrarian check: forward index return after each sentiment zone (overlapping samples, n_eff = n / horizon)."""
    pairs = [(h["score"], history[i + horizon]["close"] / h["close"] - 1) for i, h in enumerate(history[:-horizon]) if h["close"]]
    buckets = []
    for lo, hi, name in [(0, 25, "极度恐惧"), (25, 45, "恐惧"), (45, 55, "中性"), (55, 75, "贪婪"), (75, 101, "极度贪婪")]:
        r = [x for s, x in pairs if lo <= s < hi]
        buckets.append({"zone": name, "range": f"{lo}–{min(hi, 100)}", "n": len(r),
                        "mean": sum(r) / len(r) if r else None, "hit": sum(1 for x in r if x > 0) / len(r) if r else None})
    ic = spearman([p[0] for p in pairs], [p[1] for p in pairs])
    n_eff = len(pairs) / horizon
    t = ic * math.sqrt((n_eff - 2) / max(1e-9, 1 - ic * ic)) if ic is not None and n_eff > 3 else None
    allr = [p[1] for p in pairs]
    return {"horizon": horizon, "n": len(pairs), "buckets": buckets, "ic": ic, "t": t,
            "unconditional": sum(allr) / len(allr) if allr else None, "start": history[0]["date"] if history else None}


def summarize(region: dict, index: dict, comps: list[dict], snapshot: dict | None, errors: list[str], now=None) -> dict:
    hist = composite(index, comps)
    live = session_state(region["key"], index["dates"][-1], now) == "open"
    today = hist[-1] if hist else None
    def back(n):
        return hist[-1 - n]["score"] if len(hist) > n else None
    rows = []
    for c in comps:
        if not c["series"]:
            continue
        d = max(c["series"])
        raw, pct, score = c["series"][d]
        rows.append({"key": c["key"], "name": c["name"], "desc": c["desc"], "unit": c["unit"], "direction": c["direction"],
                     "date": d, "raw": raw, "percentile": round(pct, 1), "score": round(score, 1), "label": label_for(score)})
    score = today["score"] if today else None
    return {
        "key": region["key"], "name": region["name"], "index": {"name": region["index_name"], "last": index["close"][-1], "date": index["dates"][-1],
                                                                  "chg1d": index["close"][-1] / index["close"][-2] - 1 if len(index["close"]) > 1 else None},
        "score": score, "label": label_for(score), "date": today["date"] if today else None, "intraday": live,
        "change1w": score - back(5) if score is not None and back(5) is not None else None,
        "change1m": score - back(21) if score is not None and back(21) is not None else None,
        "components": rows, "history": [{"date": h["date"], "score": h["score"]} for h in hist[-260:]],
        "forward": forward_test(hist[:-1] if live else hist), "snapshot": snapshot or {}, "errors": errors,
    }


# ------------------------------------------------------------------------------------------- regions
def _fetch_all(jobs: dict, workers: int = 8) -> tuple[dict, list[str]]:
    results, errors = {}, []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {key: pool.submit(fn) for key, fn in jobs.items()}
        for key, fut in futures.items():
            try:
                results[key] = fut.result()
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{key}: {str(exc)[:100]}")
    return results, errors


def us_region(get=http_json, get_json=None, now=None) -> dict:
    jobs = {"SPX": lambda: em_kline("100.SPX", get=get), "SPY": lambda: em_kline_any(["107.SPY", "105.SPY"], get=get),
            "TLT": lambda: em_kline_any(["105.TLT", "107.TLT"], get=get), "HYG": lambda: em_kline_any(["107.HYG", "105.HYG"], get=get),
            "IEF": lambda: em_kline_any(["105.IEF", "107.IEF"], get=get)}
    for s in US_SECTORS:
        jobs[s] = (lambda s=s: em_kline_any([f"107.{s}", f"105.{s}", f"106.{s}"], get=get))
    if get_json:
        jobs["VIX"] = lambda: yahoo_series("^VIX", get_json)
        jobs["VIX3M"] = lambda: yahoo_series("^VIX3M", get_json)
    data, errors = _fetch_all(jobs)
    if "SPX" not in data:
        raise RuntimeError("标普 500 数据不可用：" + "; ".join(errors))
    spx = data["SPX"]
    comps = [c_momentum(spx, "标普 500")]
    sectors = [data[s] for s in US_SECTORS if s in data]
    if len(sectors) >= 6:
        comps.append(c_breadth(sectors, "breadth", "市场广度", "站上 50 日均线的标普行业 ETF 占比", min_members=min(8, len(sectors))))
    if "VIX" in data:
        comps.append(c_ratio_to_ma(data["VIX"], "vix", "VIX 恐慌指数", "VIX 相对 50 日均线（越高越恐惧）", -1))
        if "VIX3M" in data:
            comps.append(c_vix_term(data["VIX"], data["VIX3M"]))
    else:
        comps.append(c_vol(spx, "标普 500"))
        errors.append("VIX 不可用（Yahoo），改用标普实际波动率")
    if "SPY" in data and "TLT" in data:
        comps.append(c_spread(data["SPY"], data["TLT"], "safe_haven", "避险需求", "SPY 与长债 TLT 的 20 日收益差（股强于债 = 贪婪）", +1))
    if "HYG" in data and "IEF" in data:
        comps.append(c_spread(data["HYG"], data["IEF"], "junk", "垃圾债需求", "高收益债 HYG 与国债 IEF 的 20 日收益差", +1))
    return summarize({"key": "US", "name": "美股", "index_name": "标普 500"}, spx, comps, None, errors, now)


def hk_region(get=http_json, now=None) -> dict:
    jobs = {"HSI": lambda: em_kline("100.HSI", get=get), "HSTECH": lambda: em_kline("124.HSTECH", get=get), "VHSI": lambda: em_kline("124.VHSI", get=get)}
    for code in HK_LEADERS:
        jobs[code] = (lambda code=code: em_kline(f"116.{code}", get=get))
    data, errors = _fetch_all(jobs)
    if "HSI" not in data:
        raise RuntimeError("恒生指数数据不可用：" + "; ".join(errors))
    hsi = data["HSI"]
    comps = [c_momentum(hsi, "恒生指数")]
    if "VHSI" in data:
        comps.append(c_ratio_to_ma(data["VHSI"], "vhsi", "恒指波幅指数 VHSI", "VHSI 相对 50 日均线（越高越恐惧）", -1))
    else:
        comps.append(c_vol(hsi, "恒生指数"))
    if "HSTECH" in data:
        comps.append(c_spread(data["HSTECH"], hsi, "tech_appetite", "科技股风险偏好", "恒生科技与恒指的 20 日收益差（高 β 跑赢 = 贪婪）", +1))
    leaders = [data[c] for c in HK_LEADERS if c in data]
    if len(leaders) >= 6:
        comps.append(c_breadth(leaders, "breadth", "龙头股广度", "站上 50 日均线的港股权重股占比", min_members=min(8, len(leaders))))
    return summarize({"key": "HK", "name": "港股", "index_name": "恒生指数"}, hsi, comps, None, errors, now)


def cn_snapshot(get=http_json, today: str | None = None) -> dict:
    """Same-day market temperature (not in the composite: no history)."""
    snap: dict = {}
    try:
        rows = ((get("https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001&fields=f12,f14,f3,f6,f104,f105,f106") or {})
                .get("data") or {}).get("diff") or []
        up = sum(int(r.get("f104") or 0) for r in rows)
        down = sum(int(r.get("f105") or 0) for r in rows)
        flat = sum(int(r.get("f106") or 0) for r in rows)
        amount = sum(float(r.get("f6") or 0) for r in rows)
        if up + down:
            snap.update(up=up, down=down, flat=flat, upShare=up / (up + down), amount=amount)
    except Exception as exc:  # noqa: BLE001
        snap["error"] = f"涨跌家数：{exc}"
    day = (today or datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d")).replace("-", "")
    for kind, key in (("ZT", "limitUp"), ("DT", "limitDown")):
        try:
            url = (f"https://push2ex.eastmoney.com/getTopic{kind}Pool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt"
                   f"&Pageindex=0&pagesize=1&sort=fund%3Aasc&date={day}")
            data = (get(url) or {}).get("data") or {}
            snap[key] = int(data.get("tc") or 0)
            snap["poolDate"] = str(data.get("qdate") or day)
        except Exception as exc:  # noqa: BLE001
            snap.setdefault("error", f"涨跌停：{exc}")
    return snap


def cn_region(get=http_json, now=None) -> dict:
    jobs = {"CSI300": lambda: em_kline("1.000300", get=get), "CSI1000": lambda: em_kline("1.000852", get=get),
            "SH": lambda: em_kline("1.000001", get=get), "SZ": lambda: em_kline("0.399001", get=get),
            "MARGIN": lambda: em_margin(get=get), "SNAP": lambda: cn_snapshot(get=get)}
    data, errors = _fetch_all(jobs)
    if "CSI300" not in data:
        raise RuntimeError("沪深 300 数据不可用：" + "; ".join(errors))
    csi = data["CSI300"]
    comps = [c_momentum(csi, "沪深 300"), c_vol(csi, "沪深 300")]
    live = session_state("CN", csi["dates"][-1], now) == "open"
    if "SH" in data and "SZ" in data:
        sh, sz = (drop_partial(data["SH"]), drop_partial(data["SZ"])) if live else (data["SH"], data["SZ"])
        comps.append(c_turnover(sh, sz))
    if "MARGIN" in data:
        comps.append(c_margin(data["MARGIN"]))
    if "CSI1000" in data:
        comps.append(c_spread(data["CSI1000"], csi, "smallcap", "小盘风险偏好", "中证 1000 与沪深 300 的 20 日收益差", +1))
    snap = data.get("SNAP") or {}
    snap["intraday"] = live
    if "SH" in data and "SZ" in data and snap.get("amount") and not live:
        amounts = [a + b for a, b in zip(*aligned(as_map(data["SH"], "amount"), as_map(data["SZ"], "amount"))[1])]
        prior = amounts[-21:-1] if len(amounts) > 21 else amounts[:-1]
        snap["amountVs20d"] = snap["amount"] / (sum(prior) / len(prior)) if prior else None
    return summarize({"key": "CN", "name": "A股", "index_name": "沪深 300"}, csi, comps, snap, errors, now)


# ------------------------------------------------------------------------------------------- storage
def record(regions: list[dict], db_path=None) -> None:
    """One row per market per day so the readings can be audited later."""
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=10)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS market_daily (region TEXT, date TEXT, fg REAL, news REAL, updated REAL, PRIMARY KEY (region, date))")
        for r in regions:
            if r.get("score") is not None and r.get("date"):
                con.execute("INSERT INTO market_daily (region, date, fg, updated) VALUES (?,?,?,?) "
                            "ON CONFLICT(region, date) DO UPDATE SET fg=excluded.fg, updated=excluded.updated",
                            (r["key"], r["date"], r["score"], time.time()))
        con.commit()
    finally:
        con.close()


def compute_market_sentiment(get=http_json, get_json=None, db_path=None, now=None) -> dict:
    regions, errors = [], []
    builders = [("US", lambda: us_region(get=get, get_json=get_json, now=now)), ("HK", lambda: hk_region(get=get, now=now)),
                ("CN", lambda: cn_region(get=get, now=now))]
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [(key, pool.submit(fn)) for key, fn in builders]
        for key, fut in futures:
            try:
                regions.append(fut.result())
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{key}: {str(exc)[:160]}")
    try:
        record(regions, db_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"记录失败：{exc}")
    return {"asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"), "window": WINDOW, "regions": regions, "errors": errors,
            "method": "各分项取过去 252 个交易日的分位数（0 = 一年内最恐惧，100 = 最贪婪），综合值为可用分项的等权平均。"}


if __name__ == "__main__":
    data = compute_market_sentiment()
    for r in data["regions"]:
        print(f"{r['name']:<4} {r['score'] if r['score'] is None else round(r['score'], 1):>6}  {r['label']}  ({r['date']})")
        for c in r["components"]:
            print(f"    {c['name']:<12} 分位 {c['percentile']:>5}  得分 {c['score']:>5}  {c['desc']}")
    for e in data["errors"]:
        print("!", e)
    sys.exit(0 if data["regions"] else 1)
