#!/usr/bin/env python3
"""News-sentiment factor for QuantScope, scored by an OpenAI-compatible LLM (NUS SoCLaaS).

Pipeline
--------
1. ``fetch_news``   recent headlines from Yahoo Finance search + Google News RSS (stdlib only).
                    Equities search by company; indices, futures, FX and crypto (v2.4) use preset
                    English / Chinese queries and a cross-asset prompt with an explicit price-direction
                    convention (e.g. FX: positive = base currency appreciates; VIX: positive = VIX rises).
2. ``score_batch``  headlines the cache has not seen yet go to the LLM in batches; the model
                    returns structured JSON (relevance, sentiment, event type, one-line reason).
3. ``aggregate``    relevance x time-decay weighted mean, shrunk toward 0 when evidence is thin.
4. Every run upserts one row per symbol per day into a history table, so the factor can be
   tested against forward returns once enough days have accumulated.

Configuration (environment variables, or a ``soclaas.env`` file next to this module)::

    SOCLAAS_API_KEY=...            required
    SOCLAAS_BASE_URL=https://...   required, OpenAI-compatible base URL (usually ends in /v1)
    SOCLAAS_MODEL=x-test-1         optional
    SOCLAAS_FALLBACK_MODEL=default optional, used automatically if SOCLAAS_MODEL is withdrawn

Command line::

    python3 news_sentiment.py --check              # test the SoCLaaS connection
    python3 news_sentiment.py AAPL 0700.HK D05.SI  # score and record today's sentiment
    python3 news_sentiment.py ^HSI CL=F JPY=X BTC-USD   # indices, futures, FX and crypto work the same way
"""

from __future__ import annotations

import email.utils
import hashlib
import html
import json
import os
import random
import re
import sqlite3
import ssl
import sys
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

try:
    import certifi  # type: ignore
except ImportError:
    certifi = None


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / "soclaas.env"
DB_PATH = ROOT / "data" / "sentiment.sqlite"

DEFAULT_MODEL = "x-test-1"
DEFAULT_FALLBACK_MODEL = "default"   # SoCLaaS alias that always points at a supported chat model
PROMPT_VERSION = "v1"        # bump when the prompt changes so old cached scores are not reused
HALF_LIFE_DAYS = 3.0         # news impact halves every 3 days
LOOKBACK_DAYS = 14
MAX_ITEMS = 30
MAX_ITEMS_MACRO = 40         # indices / futures / FX / crypto pull several queries
BATCH_SIZE = 15
SHRINK_K = 1.0               # pseudo-weight of a neutral prior: one fresh, fully relevant story => score x 0.5
RELEVANT = 0.5               # relevance threshold for the "relevant news" counts

EVENT_TYPES = ["earnings", "guidance", "m&a", "product", "regulation", "litigation",
               "management", "capital", "macro", "analyst", "other"]
EVENT_LABELS = {
    "earnings": "业绩", "guidance": "指引", "m&a": "并购重组", "product": "产品业务", "regulation": "监管政策",
    "litigation": "诉讼调查", "management": "管理层", "capital": "融资回购分红", "macro": "宏观行业",
    "analyst": "评级目标价", "other": "其他",
}
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

SYSTEM_PROMPT = (
    "你是买方股票研究员，负责判断新闻对指定上市公司未来 1–4 周股价的影响。"
    "只依据给出的标题和摘要判断，不要编造信息；拿不准时给 0 附近的分数。只输出 JSON。"
)
USER_TEMPLATE = """标的：{symbol}（{name}）

对下面每条新闻输出一个对象，字段：
- id：原样返回
- relevance：0 到 1，新闻与这家公司的直接相关程度（只是顺带提及、或泛泛的行业/大盘新闻 ≤ 0.3）
- sentiment：-1 到 1，对这家公司股价的影响方向和强度（0 = 中性或无法判断；常规新闻一般在 ±0.5 以内，只有重大超预期事件才接近 ±1）
- event：从 {events} 中选一个
- reason：不超过 30 个汉字的中文理由

只输出 {{"items": [ ... ]}}，不要输出其他文字。

新闻：
{news}"""


class LLMError(RuntimeError):
    """Raised when the LLM gateway cannot be reached or returns something unusable."""


# --------------------------------------------------------------------------------------
# Asset classes: indices, futures, commodities, FX and crypto get their own news queries,
# prompt (with an explicit price-direction convention) and event types.
# --------------------------------------------------------------------------------------

MACRO_PROMPT_VERSION = "a1"
ASSET_CLASS_LABELS = {"equity": "股票", "index": "指数", "future": "期货", "commodity": "大宗商品现货", "fx": "外汇", "crypto": "加密资产"}

EVENT_LABELS.update({
    "monetary": "央行与利率", "fiscal": "财政与产业政策", "geopolitics": "地缘政治", "trade": "贸易关税",
    "supply": "供需库存", "flows": "资金流向", "technical": "技术面与情绪", "adoption": "采用与机构化", "security": "安全事件",
})
CLASS_EVENTS = {
    "equity": EVENT_TYPES,
    "index": ["monetary", "macro", "fiscal", "geopolitics", "trade", "earnings", "flows", "regulation", "technical", "other"],
    "future": ["supply", "macro", "monetary", "geopolitics", "trade", "fiscal", "flows", "technical", "other"],
    "fx": ["monetary", "macro", "fiscal", "trade", "geopolitics", "flows", "technical", "other"],
    "crypto": ["regulation", "flows", "adoption", "security", "monetary", "macro", "technical", "other"],
}
CLASS_EVENTS["commodity"] = CLASS_EVENTS["future"]

RELEVANCE_RULES = {
    "index": "新闻与这个指数所代表市场整体走势的相关程度（宏观、政策、资金面、权重股的重大新闻可以高；单只非权重股的个别新闻、与该市场无关的新闻 ≤ 0.3）",
    "future": "新闻与该商品 / 合约价格的相关程度（供需、库存、产量、天气、地缘、美元和利率等直接驱动因素可以高；只是顺带提及 ≤ 0.3）",
    "fx": "新闻与这两种货币之间汇率的相关程度（两国央行、利率、通胀、就业、贸易、资本流动、汇率干预可以高；泛泛提及 ≤ 0.3）",
    "crypto": "新闻与该加密资产价格的相关程度（该币种本身的新闻高；整个加密行业的监管、ETF 资金流、宏观新闻中等；其他项目的新闻 ≤ 0.3）",
}
RELEVANCE_RULES["commodity"] = RELEVANCE_RULES["future"]

MACRO_SYSTEM_PROMPT = (
    "你是买方跨资产研究员（股指、商品、外汇、加密资产），负责判断新闻对指定资产未来 1–4 周价格的影响。"
    "严格按给定的价格方向约定打分。只依据给出的标题和摘要判断，不要编造信息；拿不准时给 0 附近的分数。只输出 JSON。"
)
MACRO_USER_TEMPLATE = """标的：{symbol}（{name}，{asset_label}）
价格方向约定：{direction}

对下面每条新闻输出一个对象，字段：
- id：原样返回
- relevance：0 到 1，{relevance_rule}
- sentiment：-1 到 1，按上面的方向约定判断对该资产价格的影响（0 = 中性或无法判断；常规新闻一般在 ±0.5 以内，只有重大超预期事件才接近 ±1）
- event：从 {events} 中选一个
- reason：不超过 30 个汉字的中文理由

只输出 {{"items": [ ... ]}}，不要输出其他文字。

新闻：
{news}"""

# Google News locales: (hl, gl, ceid)
LOCALES = {
    "US": ("en-US", "US", "US:en"), "CN": ("zh-CN", "CN", "CN:zh-Hans"), "HK": ("zh-HK", "HK", "HK:zh-Hant"),
    "SG": ("en-SG", "SG", "SG:en"), "JP": ("ja", "JP", "JP:ja"), "KR": ("ko", "KR", "KR:ko"),
}

# symbol -> (class, English name, Chinese name, [(Google News query, locale)], direction or None)
_ASSETS: dict[str, tuple] = {
    # indices
    "^GSPC": ("index", "S&P 500", "标普 500", [('"S&P 500" stocks OR "Wall Street"', "US"), ("标普500 美股", "CN")], None),
    "^IXIC": ("index", "Nasdaq Composite", "纳斯达克综合指数", [('Nasdaq stocks OR "Nasdaq Composite"', "US"), ("纳斯达克 美股", "CN")], None),
    "^NDX": ("index", "Nasdaq 100", "纳斯达克 100", [('"Nasdaq 100" OR "Nasdaq" tech stocks', "US")], None),
    "^DJI": ("index", "Dow Jones Industrial Average", "道琼斯工业指数", [('"Dow Jones" OR "the Dow" stocks', "US"), ("道指 美股", "CN")], None),
    "^RUT": ("index", "Russell 2000", "罗素 2000", [('"Russell 2000" OR "small-cap stocks"', "US")], None),
    "^HSI": ("index", "Hang Seng Index", "恒生指数", [("恒生指數 OR 恒指 OR 港股", "HK"), ('"Hang Seng" index OR "Hong Kong stocks"', "US")], None),
    "HSTECH.HK": ("index", "Hang Seng TECH Index", "恒生科技指数", [("恒生科技指數 OR 恒科指 OR 港股科技股", "HK"), ('"Hang Seng Tech"', "US")], None),
    "^STI": ("index", "Straits Times Index", "海峡时报指数", [('"Straits Times Index" OR "Singapore stocks" OR "Singapore shares"', "SG")], None),
    "^N225": ("index", "Nikkei 225", "日经 225", [('"Nikkei 225" OR "Japanese stocks" OR "Nikkei share average"', "US"), ("日経平均", "JP")], None),
    "^KS11": ("index", "KOSPI", "韩国综合指数", [('KOSPI OR "South Korean stocks"', "US"), ("코스피", "KR")], None),
    "^FTSE": ("index", "FTSE 100", "富时 100", [('"FTSE 100" OR "London stocks"', "US")], None),
    "^GDAXI": ("index", "DAX", "德国 DAX", [('DAX index OR "German stocks"', "US")], None),
    "^STOXX50E": ("index", "Euro Stoxx 50", "欧洲斯托克 50", [('"Euro Stoxx 50" OR "European shares"', "US")], None),
    "000001.SS": ("index", "SSE Composite Index", "上证综指", [("上证指数 OR 沪指 OR A股", "CN"), ('"Shanghai Composite" OR "China stocks"', "US")], None),
    "000300.SS": ("index", "CSI 300", "沪深 300", [("沪深300 OR A股 大盘", "CN"), ('"CSI 300" OR "China stocks"', "US")], None),
    "000016.SS": ("index", "SSE 50", "上证 50", [("上证50 OR 大盘蓝筹", "CN")], None),
    "000905.SS": ("index", "CSI 500", "中证 500", [("中证500 OR 中盘股", "CN")], None),
    "000852.SS": ("index", "CSI 1000", "中证 1000", [("中证1000 OR 小盘股 A股", "CN")], None),
    "399001.SZ": ("index", "SZSE Component Index", "深证成指", [("深证成指 OR 深成指", "CN")], None),
    "399006.SZ": ("index", "ChiNext Index", "创业板指", [("创业板指 OR 创业板", "CN")], None),
    "000688.SS": ("index", "STAR 50", "科创 50", [("科创50 OR 科创板", "CN")], None),
    "^VIX": ("index", "CBOE Volatility Index (VIX)", "VIX 恐慌指数", [('VIX volatility OR "fear gauge"', "US")],
             "正分 = VIX 上升（市场恐慌加剧、美股承压），负分 = VIX 下降（风险偏好回升）"),
    # futures
    "CL=F": ("future", "WTI crude oil futures", "WTI 原油期货", [('"WTI" crude OR "oil prices"', "US"), ("原油 油价", "CN")], None),
    "BZ=F": ("future", "Brent crude oil futures", "布伦特原油期货", [('"Brent" crude OR "oil prices"', "US"), ("布伦特 原油 油价", "CN")], None),
    "NG=F": ("future", "Henry Hub natural gas futures", "美国天然气期货", [('"natural gas" prices OR "Henry Hub"', "US")], None),
    "GC=F": ("future", "COMEX gold futures", "COMEX 黄金期货", [('"gold prices" OR "gold futures" OR bullion', "US"), ("金价 OR 黄金价格", "CN")], None),
    "SI=F": ("future", "COMEX silver futures", "COMEX 白银期货", [('"silver prices" OR "silver futures"', "US"), ("白银 价格", "CN")], None),
    "HG=F": ("future", "COMEX copper futures", "COMEX 铜期货", [('"copper prices" OR "copper futures"', "US"), ("铜价", "CN")], None),
    "ES=F": ("future", "E-mini S&P 500 futures", "标普 500 股指期货", [('"stock futures" OR "S&P 500 futures" OR "Wall Street"', "US")], None),
    "NQ=F": ("future", "E-mini Nasdaq 100 futures", "纳指 100 股指期货", [('"Nasdaq futures" OR "tech stocks" OR "stock futures"', "US")], None),
    "YM=F": ("future", "E-mini Dow futures", "道指期货", [('"Dow futures" OR "stock futures"', "US")], None),
    "ZN=F": ("future", "10-Year T-Note futures", "美国 10 年期国债期货", [('"Treasury yields" OR "10-year Treasury"', "US")],
             "正分 = 国债期货价格上涨（即美债收益率下降），负分 = 价格下跌（收益率上升）"),
    "ZB=F": ("future", "30-Year T-Bond futures", "美国 30 年期国债期货", [('"Treasury yields" OR "30-year Treasury" OR "long bond"', "US")],
             "正分 = 国债期货价格上涨（即美债收益率下降），负分 = 价格下跌（收益率上升）"),
    "ZC=F": ("future", "CBOT corn futures", "玉米期货", [('corn futures OR "corn prices"', "US")], None),
    "ZS=F": ("future", "CBOT soybean futures", "大豆期货", [('soybean futures OR "soybean prices"', "US")], None),
    "ZW=F": ("future", "CBOT wheat futures", "小麦期货", [('wheat futures OR "wheat prices"', "US")], None),
    # spot commodities quoted as =X pairs
    "XAUUSD=X": ("commodity", "spot gold (LBMA)", "伦敦金", [('"gold prices" OR "spot gold" OR bullion', "US"), ("金价 OR 黄金价格", "CN")], None),
    "XAGUSD=X": ("commodity", "spot silver", "伦敦银", [('"silver prices" OR "spot silver"', "US"), ("白银 价格", "CN")], None),
}

CURRENCIES = {  # code -> (English name used in queries, Chinese name)
    "USD": ("dollar", "美元"), "EUR": ("euro", "欧元"), "JPY": ("yen", "日元"), "GBP": ("sterling", "英镑"),
    "CNY": ("yuan", "人民币"), "CNH": ("offshore yuan", "离岸人民币"), "HKD": ("Hong Kong dollar", "港元"),
    "SGD": ("Singapore dollar", "新加坡元"), "AUD": ("Australian dollar", "澳元"), "NZD": ("New Zealand dollar", "新西兰元"),
    "CAD": ("Canadian dollar", "加元"), "CHF": ("Swiss franc", "瑞士法郎"), "KRW": ("won", "韩元"), "INR": ("rupee", "印度卢比"),
    "TWD": ("Taiwan dollar", "新台币"), "MYR": ("ringgit", "马来西亚林吉特"), "THB": ("baht", "泰铢"), "IDR": ("rupiah", "印尼盾"),
}
CRYPTO = {  # base code -> (English name, Chinese name)
    "BTC": ("Bitcoin", "比特币"), "ETH": ("Ethereum", "以太坊"), "SOL": ("Solana", "Solana"), "XRP": ("XRP", "瑞波币"),
    "BNB": ("BNB", "币安币"), "DOGE": ("Dogecoin", "狗狗币"), "ADA": ("Cardano", "艾达币"), "TON": ("Toncoin", "TON"),
    "AVAX": ("Avalanche", "Avalanche"), "LINK": ("Chainlink", "Chainlink"), "DOT": ("Polkadot", "波卡"), "LTC": ("Litecoin", "莱特币"),
}
_CRYPTO_RE = re.compile(r"^([A-Z0-9]{2,10})-(USD|USDT|USDC|EUR|GBP|JPY|SGD|HKD|CNY|BTC|ETH)$")
_FUTURE_MONTH_RE = re.compile(r"\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+'?\d{2,4}$", re.I)


def asset_class(symbol: str) -> str:
    s = symbol.upper()
    if s in _ASSETS:
        return _ASSETS[s][0]
    if s.endswith("=F"):
        return "future"
    if s.endswith("=X"):
        return "commodity" if s[:3] in ("XAU", "XAG", "XPT", "XPD") else "fx"
    if _CRYPTO_RE.match(s):
        return "crypto"
    if s.startswith("^"):
        return "index"
    return "equity"


def fx_pair(symbol: str) -> tuple[str, str] | None:
    """Yahoo FX codes: EURUSD=X is EUR/USD; a bare JPY=X / CNY=X is USD/JPY, USD/CNY."""
    code = symbol.upper().removesuffix("=X")
    if len(code) == 6 and code.isalpha():
        return code[:3], code[3:]
    if len(code) == 3 and code.isalpha():
        return "USD", code
    return None


def asset_profile(symbol: str, name: str | None = None) -> dict:
    """Everything the non-equity pipeline needs: display name, prompt name, queries and the direction convention."""
    s = symbol.upper()
    cls = asset_class(s)
    profile = {"class": cls, "label": ASSET_CLASS_LABELS[cls], "name": name or s, "prompt_name": name or s, "queries": [], "direction": None}
    if cls == "equity":
        return profile
    if s in _ASSETS:
        _, en, zh, queries, direction = _ASSETS[s]
        profile.update(name=zh, prompt_name=f"{zh} / {en}", queries=list(queries), direction=direction)
    elif cls == "fx" and fx_pair(s):
        base, quote_ccy = fx_pair(s)
        b_en, b_zh = CURRENCIES.get(base, (base, base))
        q_en, q_zh = CURRENCIES.get(quote_ccy, (quote_ccy, quote_ccy))
        queries = [(f'"{base}/{quote_ccy}" OR {base}{quote_ccy}', "US")]
        queries += [(f'"{en}" forex OR currency', "US") for code, en in ((base, b_en), (quote_ccy, q_en)) if code != "USD"][:1]
        zh_query = f"{b_zh}兑{q_zh} OR {b_zh}汇率" if base != "USD" else f"{b_zh}兑{q_zh} OR {q_zh}汇率"
        queries.append((zh_query, "CN"))
        profile.update(name=f"{b_zh}/{q_zh}（{base}/{quote_ccy}）", prompt_name=f"{base}/{quote_ccy}，{b_zh}兑{q_zh}", queries=queries,
                       direction=f"正分 = {b_zh}（{base}）相对{q_zh}（{quote_ccy}）升值，即 {base}/{quote_ccy} 报价上升；负分 = {b_zh}贬值")
    elif cls == "crypto":
        base = _CRYPTO_RE.match(s).group(1)
        en, zh = CRYPTO.get(base, (base, base))
        queries = [(f"{en} OR {base}" if en != base else f"{base} crypto", "US")]
        if zh != en:
            queries.append((f"{zh} OR {base} 加密货币", "CN"))
        profile.update(name=f"{zh}（{base}）" if zh != base else base, prompt_name=f"{en}（{base}），加密资产", queries=queries)
    else:  # an index / future / commodity we have no preset for: search by the name Yahoo gives us
        clean = _FUTURE_MONTH_RE.sub("", name or "").strip() or s.lstrip("^").split("=")[0]
        suffix = {"future": " futures OR prices", "commodity": " prices", "index": ""}[cls]
        profile.update(name=clean if cls != "index" else (name or s), prompt_name=clean, queries=[(f'"{clean}"{suffix}', "US")])
    if not profile["direction"]:
        what = "点位" if cls == "index" else "价格"
        profile["direction"] = f"正分 = {profile['name']}{what}上涨，负分 = {what}下跌"
    return profile


# --------------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------------

def load_config(env_file: Path | None = None) -> dict:
    """Environment variables win over ``soclaas.env``; the key is never logged or returned to the UI."""
    values: dict[str, str] = {}
    path = env_file or ENV_FILE
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip().removeprefix("export ").strip()] = value.strip().strip('"').strip("'")

    def pick(name: str, default: str | None = None) -> str | None:
        return os.environ.get(name) or values.get(name) or default

    return {
        "api_key": pick("SOCLAAS_API_KEY"),
        "base_url": (pick("SOCLAAS_BASE_URL") or "").rstrip("/"),
        "model": pick("SOCLAAS_MODEL", DEFAULT_MODEL),
        "fallback_model": pick("SOCLAAS_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL),
    }


def is_configured(cfg: dict | None = None) -> bool:
    cfg = cfg or load_config()
    return bool(cfg.get("api_key") and cfg.get("base_url"))


def public_config(cfg: dict | None = None) -> dict:
    """What is safe to show in the browser: no key."""
    cfg = cfg or load_config()
    host = re.sub(r"^https?://", "", cfg.get("base_url") or "").split("/")[0]
    return {"configured": is_configured(cfg), "model": cfg.get("active_model") or cfg.get("model"), "host": host or None}


# --------------------------------------------------------------------------------------
# LLM client (OpenAI-compatible /chat/completions)
# --------------------------------------------------------------------------------------

def _llm_ssl_context() -> ssl.SSLContext:
    # Certificate verification stays on: this request carries the API key.
    return ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()


def _post_json(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    request = Request(url, data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json", "Accept": "application/json", **headers}, method="POST")
    with urlopen(request, timeout=timeout, context=_llm_ssl_context()) as response:
        return json.loads(response.read())


def chat(messages: list[dict], cfg: dict, *, temperature: float = 0.0, json_mode: bool = True,
         max_tokens: int | None = None, max_retries: int = 4, timeout: float = 90, sleep=time.sleep) -> str:
    """One chat completion with retry + exponential backoff on 429 / 5xx / network errors."""
    if not is_configured(cfg):
        raise LLMError("SoCLaaS 未配置：请在项目文件夹的 soclaas.env 中填写 SOCLAAS_API_KEY 和 SOCLAAS_BASE_URL")
    url = f"{cfg['base_url']}/chat/completions"
    payload: dict = {"model": cfg["model"], "messages": messages, "temperature": temperature}
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}
    attempt = 0
    while True:
        try:
            body = _post_json(url, payload, headers, timeout)
            content = body["choices"][0]["message"].get("content")
            if content is None:
                raise LLMError("模型返回了空内容")
            return content
        except HTTPError as exc:
            detail = ""
            try:
                detail = exc.read()[:300].decode("utf-8", "ignore")
            except Exception:  # noqa: BLE001
                pass
            fallback = cfg.get("fallback_model")
            if exc.code in (400, 404) and fallback and payload["model"] != fallback and (exc.code == 404 or "model" in detail.lower()):
                payload["model"] = fallback  # trial model withdrawn: keep working on the stable alias
                cfg["active_model"] = fallback
                continue
            if exc.code == 400 and "response_format" in payload:
                payload.pop("response_format")  # some gateways/models reject JSON mode; the prompt still asks for JSON
                continue
            if exc.code in (401, 403):
                raise LLMError(f"认证失败（HTTP {exc.code}）：检查 SOCLAAS_API_KEY 是否正确、是否过期") from exc
            if exc.code == 404:
                raise LLMError(f"接口不存在（HTTP 404）：检查 SOCLAAS_BASE_URL 是否需要以 /v1 结尾，或模型 {payload['model']} 是否已下线") from exc
            if not (exc.code in (408, 409, 429) or exc.code >= 500) or attempt >= max_retries:
                raise LLMError(f"SoCLaaS 返回 HTTP {exc.code}：{detail.strip()[:160]}") from exc
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                delay = float(retry_after) if retry_after is not None else None
            except ValueError:
                delay = None
            if delay is None:
                delay = min(30.0, 2.0 ** attempt) + random.random()
        except (URLError, TimeoutError, ConnectionError) as exc:
            reason = getattr(exc, "reason", exc)
            if isinstance(reason, ssl.SSLError):
                raise LLMError("SSL 证书校验失败：macOS 请运行 “/Applications/Python 3.x/Install Certificates.command”，或 pip3 install certifi") from exc
            if attempt >= max_retries:
                raise LLMError(f"无法连接 SoCLaaS：{reason}（在校外时请先连接 NUS VPN）") from exc
            delay = min(30.0, 2.0 ** attempt) + random.random()
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise LLMError(f"SoCLaaS 返回格式无法解析：{exc}") from exc
        attempt += 1
        sleep(delay)


def parse_json_block(text: str):
    """Parse model output that may be wrapped in ``` fences or preceded by <think> reasoning."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}|\[.*\]", text, re.S)
        if match:
            return json.loads(match.group(0))
        raise


def check_connection(cfg: dict | None = None) -> dict:
    """Small round trip used by ``--check`` and ``/api/llm/status?ping=1``."""
    cfg = cfg or load_config()
    out = {**public_config(cfg), "ok": False}
    if not is_configured(cfg):
        out["error"] = "未配置 SOCLAAS_API_KEY / SOCLAAS_BASE_URL"
        return out
    started = time.time()
    try:
        # no max_tokens: reasoning models (e.g. GLM) spend tokens thinking before they answer
        reply = chat([{"role": "user", "content": "只回复两个字母：OK"}], cfg, json_mode=False, max_retries=1, timeout=60)
        out.update(ok=True, reply=reply.strip()[:40], latencyMs=int((time.time() - started) * 1000))
    except LLMError as exc:
        out["error"] = str(exc)
    return out


# --------------------------------------------------------------------------------------
# News sources (public feeds, no key needed)
# --------------------------------------------------------------------------------------

def _news_ssl_context() -> ssl.SSLContext:
    # Same policy as server.py's Yahoo proxy: public, unauthenticated feeds.
    if certifi:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl._create_unverified_context()  # noqa: S323


def _http_get(url: str, timeout: float = 10) -> bytes:
    request = Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8"})
    with urlopen(request, timeout=timeout, context=_news_ssl_context()) as response:
        return response.read()


def _clean_text(value: str | None) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return re.sub(r"\s+", " ", value).strip()


def fetch_yahoo_news(symbol: str, get_json=None) -> tuple[list[dict], str | None]:
    url = (f"https://query2.finance.yahoo.com/v1/finance/search?q={quote(symbol)}"
           "&quotesCount=1&newsCount=20&enableFuzzyQuery=false")
    data = get_json(url) if get_json else json.loads(_http_get(url))
    name = None
    for item in data.get("quotes") or []:
        if str(item.get("symbol", "")).upper() == symbol.upper():
            name = item.get("longname") or item.get("shortname")
    items = []
    for item in data.get("news") or []:
        title, published = _clean_text(item.get("title")), item.get("providerPublishTime")
        if not title or not published:
            continue
        related = [str(t).upper() for t in item.get("relatedTickers") or []]
        items.append({
            "title": title, "summary": "", "source": item.get("publisher") or "Yahoo Finance",
            "link": item.get("link"), "published": int(published), "feed": "yahoo",
            "tagged": symbol.upper() in related,
        })
    return items, name


def google_locale(symbol: str) -> tuple[str, str, str]:
    s = symbol.upper()
    if s.endswith((".SS", ".SZ", ".BJ")):
        return "zh-CN", "CN", "CN:zh-Hans"
    if s.endswith(".HK"):
        return "zh-HK", "HK", "HK:zh-Hant"
    if s.endswith(".SI"):
        return "en-SG", "SG", "SG:en"
    if s.endswith(".T"):
        return "ja", "JP", "JP:ja"
    if s.endswith((".KS", ".KQ")):
        return "ko", "KR", "KR:ko"
    return "en-US", "US", "US:en"


_SUFFIX_RE = re.compile(
    r"[,.]?\s*\b(co\.?,?\s*ltd\.?|company limited|holdings?|group|limited|ltd\.?|inc\.?|incorporated|corporation|corp\.?|plc|n\.v\.|s\.a\.|ag|class [a-z])\b\.?",
    re.I,
)


def news_query(symbol: str, name: str | None) -> str:
    base = symbol.split(".")[0].lstrip("^")
    if symbol.upper().endswith(".HK") and base.isdigit():
        code = f'"{int(base):05d}.HK"'      # HK press writes 騰訊(00700.HK)
    elif base.isdigit():
        code = base                          # A-share / Japan / Korea numeric codes
    else:
        code = f'"{base} stock"'
    short = _SUFFIX_RE.sub("", name or "").strip(" ,.-") if name else ""
    if short and short.upper() != base.upper():
        return f'"{short}" OR {code}'
    return code.strip('"') if code.endswith(' stock"') else code


def fetch_name_from_chart(symbol: str) -> str | None:
    """Fallback when Yahoo's search endpoint rate-limits: the chart endpoint also carries the name."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?range=5d&interval=1d"
    meta = ((json.loads(_http_get(url)).get("chart") or {}).get("result") or [{}])[0].get("meta") or {}
    return meta.get("longName") or meta.get("shortName")


def fetch_google_query(query: str, locale: str = "US", limit: int = 20) -> list[dict]:
    hl, gl, ceid = LOCALES.get(locale, LOCALES["US"])
    url = f"https://news.google.com/rss/search?q={quote(f'{query} when:{LOOKBACK_DAYS}d')}&hl={hl}&gl={gl}&ceid={quote(ceid)}"
    root = ET.fromstring(_http_get(url))
    items = []
    for node in root.iter("item"):
        title = _clean_text(node.findtext("title"))
        source = _clean_text(node.findtext("source"))
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        try:
            published = int(email.utils.parsedate_to_datetime(node.findtext("pubDate") or "").timestamp())
        except (TypeError, ValueError, IndexError):
            continue
        if title:
            items.append({"title": title, "summary": "", "source": source or "Google News", "link": node.findtext("link"),
                          "published": published, "feed": f"google-{locale.lower()}", "tagged": False})
        if len(items) >= limit:
            break
    return items


def fetch_google_news(symbol: str, name: str | None) -> list[dict]:
    hl, gl, ceid = google_locale(symbol)
    locale = next(key for key, value in LOCALES.items() if value == (hl, gl, ceid))
    items = fetch_google_query(news_query(symbol, name), locale)
    for item in items:
        item["feed"] = "google"
    return items


def _norm_title(title: str) -> str:
    return re.sub(r"[\W_]+", "", title.lower())


def _round_robin(groups: list[list[dict]]) -> list[dict]:
    """Interleave feeds (each newest first) so one chatty query cannot crowd out the others."""
    groups = [sorted(g, key=lambda row: -row["published"]) for g in groups if g]
    out = []
    for i in range(max((len(g) for g in groups), default=0)):
        out.extend(g[i] for g in groups if i < len(g))
    return out


def fetch_news(symbol: str, name: str | None = None, *, get_json=None, now: float | None = None) -> tuple[list[dict], str | None, list[str]]:
    """Merge Yahoo + Google News, keep the last LOOKBACK_DAYS, de-duplicate by title.

    Equities: one Google query built from the company name / code (unchanged since v2.1).
    Indices, futures, FX, crypto: the preset queries of ``asset_profile`` (often one English + one Chinese),
    interleaved so every query contributes, up to MAX_ITEMS_MACRO headlines.
    """
    now = now or time.time()
    errors: list[str] = []
    groups: list[list[dict]] = []
    equity = asset_class(symbol) == "equity"
    try:
        yahoo, yahoo_name = fetch_yahoo_news(symbol, get_json)
        groups.append(yahoo)
        name = name or yahoo_name
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Yahoo 新闻：{exc}")
    if not name:
        try:
            name = fetch_name_from_chart(symbol)
        except Exception:  # noqa: BLE001 - the query still works with the bare code
            pass
    if equity:
        try:
            groups.append(fetch_google_news(symbol, name))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Google News：{exc}")
    else:
        for query, locale in asset_profile(symbol, name)["queries"]:
            try:
                groups.append(fetch_google_query(query, locale, limit=15))
            except Exception as exc:  # noqa: BLE001
                errors.append(f"Google News（{query}）：{exc}")
    candidates = [row for g in groups for row in g] if equity else _round_robin(groups)
    if equity:
        candidates.sort(key=lambda row: (not row.get("tagged"), -row["published"]))
    seen: set[str] = set()
    unique = []
    for item in candidates:
        key = _norm_title(item["title"])
        if not key or key in seen or now - item["published"] > LOOKBACK_DAYS * 86400 or item["published"] > now + 3600:
            continue
        seen.add(key)
        unique.append(item)
    if equity:
        unique.sort(key=lambda row: -row["published"])
        return unique[:MAX_ITEMS], name, errors
    unique = sorted(unique[:MAX_ITEMS_MACRO], key=lambda row: -row["published"])
    return unique, name, errors


# --------------------------------------------------------------------------------------
# Scoring, cache and aggregation
# --------------------------------------------------------------------------------------

def _connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    path = Path(db_path or DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=10)
    con.execute("""CREATE TABLE IF NOT EXISTS scores (
        key TEXT PRIMARY KEY, symbol TEXT, title TEXT, relevance REAL, sentiment REAL,
        event TEXT, reason TEXT, model TEXT, created REAL)""")
    con.execute("""CREATE TABLE IF NOT EXISTS daily (
        symbol TEXT, date TEXT, score REAL, raw REAL, evidence REAL, n INTEGER, model TEXT, updated REAL,
        PRIMARY KEY (symbol, date))""")
    return con


def prompt_version(symbol: str) -> str:
    return PROMPT_VERSION if asset_class(symbol) == "equity" else MACRO_PROMPT_VERSION


def cache_key(symbol: str, title: str, model: str) -> str:
    # equities keep the v2.1 key so existing scores stay valid; other assets use their own prompt version
    return hashlib.sha1(f"{prompt_version(symbol)}|{model}|{symbol.upper()}|{_norm_title(title)}".encode("utf-8")).hexdigest()


def _clamp(value, low: float, high: float) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return max(low, min(high, number))


def _clean_result(row: dict, events: list[str] = EVENT_TYPES) -> dict | None:
    relevance, sentiment = _clamp(row.get("relevance"), 0, 1), _clamp(row.get("sentiment"), -1, 1)
    if relevance is None or sentiment is None:
        return None
    event = str(row.get("event") or "other").strip().lower()
    return {"relevance": relevance, "sentiment": sentiment, "event": event if event in events else "other",
            "reason": _clean_text(str(row.get("reason") or ""))[:80]}


def score_batch(batch: list[dict], symbol: str, name: str | None, cfg: dict, chat_fn=chat) -> list[dict | None]:
    """Score up to BATCH_SIZE headlines in one request. Missing/invalid rows come back as None (retried next time)."""
    news = [{
        "id": f"n{i + 1}", "title": item["title"], "summary": (item.get("summary") or "")[:300],
        "source": item.get("source"), "date": datetime.fromtimestamp(item["published"], timezone.utc).strftime("%Y-%m-%d"),
    } for i, item in enumerate(batch)]
    profile = asset_profile(symbol, name)
    events = CLASS_EVENTS[profile["class"]]
    payload = json.dumps(news, ensure_ascii=False, indent=1)
    if profile["class"] == "equity":
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_TEMPLATE.format(symbol=symbol, name=name or symbol, events=", ".join(events), news=payload)},
        ]
    else:
        messages = [
            {"role": "system", "content": MACRO_SYSTEM_PROMPT},
            {"role": "user", "content": MACRO_USER_TEMPLATE.format(
                symbol=symbol, name=profile["prompt_name"], asset_label=profile["label"], direction=profile["direction"],
                relevance_rule=RELEVANCE_RULES[profile["class"]], events=", ".join(events), news=payload)},
        ]
    text = chat_fn(messages, cfg)
    try:
        data = parse_json_block(text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMError(f"模型没有按 JSON 输出：{text[:120]!r}") from exc
    rows = data.get("items") if isinstance(data, dict) else data
    by_id = {str(row.get("id")): row for row in rows or [] if isinstance(row, dict)}
    return [_clean_result(by_id[f"n{i + 1}"], events) if f"n{i + 1}" in by_id else None for i in range(len(batch))]


def sentiment_label(score: float | None, evidence: float) -> str:
    if score is None or evidence < 0.3:
        return "证据不足"
    if score >= 0.35:
        return "明显偏多"
    if score >= 0.12:
        return "偏多"
    if score <= -0.35:
        return "明显偏空"
    if score <= -0.12:
        return "偏空"
    return "中性"


def aggregate(items: list[dict], now: float | None = None) -> dict:
    """factor = Σ w·s / (Σ w + K),  w = relevance × 0.5^(age / half-life).

    K acts as a neutral prior, so one fresh, fully relevant story gives half its own score and
    the factor only approaches the raw weighted mean when there is plenty of relevant, recent news.
    """
    now = now or time.time()
    scored = [item for item in items if item.get("sentiment") is not None]
    total_w = total_ws = 0.0
    events: dict[str, list[float]] = {}
    for item in scored:
        age = max(0.0, (now - item["published"]) / 86400)
        weight = item["relevance"] * 0.5 ** (age / HALF_LIFE_DAYS)
        item["weight"] = round(weight, 4)
        total_w += weight
        total_ws += weight * item["sentiment"]
        if item["relevance"] >= RELEVANT:
            events.setdefault(item["event"], []).append(item["sentiment"])
    raw = total_ws / total_w if total_w > 0 else None
    score = total_ws / (total_w + SHRINK_K) if scored else None
    relevant = [item for item in scored if item["relevance"] >= RELEVANT]
    return {
        "score": round(score, 4) if score is not None else None,
        "raw": round(raw, 4) if raw is not None else None,
        "evidence": round(total_w, 3),
        "label": sentiment_label(score, total_w),
        "n": len(scored),
        "relevant": len(relevant),
        "positive": sum(1 for item in relevant if item["sentiment"] > 0.15),
        "negative": sum(1 for item in relevant if item["sentiment"] < -0.15),
        "events": sorted(({"event": key, "label": EVENT_LABELS.get(key, key), "count": len(vals), "avg": round(sum(vals) / len(vals), 3)}
                          for key, vals in events.items()), key=lambda row: -row["count"]),
    }


_SYMBOL_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _symbol_lock(symbol: str) -> threading.Lock:
    with _LOCKS_GUARD:
        return _SYMBOL_LOCKS.setdefault(symbol.upper(), threading.Lock())


def load_history(con: sqlite3.Connection, symbol: str, limit: int = 250) -> list[dict]:
    rows = con.execute("SELECT date, score, raw, evidence, n FROM daily WHERE symbol = ? ORDER BY date DESC LIMIT ?",
                       (symbol.upper(), limit)).fetchall()
    return [{"date": d, "score": s, "raw": r, "evidence": e, "n": n} for d, s, r, e, n in reversed(rows)]


def compute_sentiment(symbol: str, name: str | None = None, *, cfg: dict | None = None, db_path=None,
                      fetch=fetch_news, chat_fn=chat, get_json=None, now: float | None = None) -> dict:
    symbol = symbol.upper()
    cfg = cfg or load_config()
    now = now or time.time()
    out: dict = {"symbol": symbol, "asOf": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"),
                 "llm": public_config(cfg), "halfLifeDays": HALF_LIFE_DAYS, "lookbackDays": LOOKBACK_DAYS,
                 "errors": [], "items": [], "stats": {"cached": 0, "scored": 0, "llmCalls": 0}}
    news, name, errors = fetch(symbol, name, get_json=get_json, now=now)
    profile = asset_profile(symbol, name)
    out["asset"] = {"class": profile["class"], "label": profile["label"], "direction": profile["direction"],
                    "queries": [query for query, _ in profile["queries"]]}
    out["name"], out["errors"] = (name if profile["class"] == "equity" else profile["name"]), list(errors)

    con = _connect(db_path)
    try:
        if not news:
            out.update(status="no_news", **aggregate([], now), history=load_history(con, symbol))
            return out
        if not is_configured(cfg):
            out.update(status="not_configured", items=news, **aggregate([], now), history=load_history(con, symbol))
            return out

        with _symbol_lock(symbol):
            keys = [cache_key(symbol, item["title"], cfg["model"]) for item in news]
            placeholders = ",".join("?" * len(keys))
            cached = {row[0]: {"relevance": row[1], "sentiment": row[2], "event": row[3], "reason": row[4]}
                      for row in con.execute(f"SELECT key, relevance, sentiment, event, reason FROM scores WHERE key IN ({placeholders})", keys)}
            out["stats"]["cached"] = sum(1 for key in keys if key in cached)
            missing = [(key, item) for key, item in zip(keys, news) if key not in cached]
            for start in range(0, len(missing), BATCH_SIZE):
                chunk = missing[start:start + BATCH_SIZE]
                try:
                    results = score_batch([item for _, item in chunk], symbol, name, cfg, chat_fn)
                    out["stats"]["llmCalls"] += 1
                except LLMError as exc:
                    out["llmError"] = str(exc)
                    out["errors"].append(str(exc))
                    break
                for (key, item), result in zip(chunk, results):
                    if result is None:
                        continue
                    cached[key] = result
                    out["stats"]["scored"] += 1
                    con.execute("INSERT OR REPLACE INTO scores VALUES (?,?,?,?,?,?,?,?,?)",
                                (key, symbol, item["title"], result["relevance"], result["sentiment"], result["event"],
                                 result["reason"], cfg.get("active_model") or cfg["model"], now))
                con.commit()

        items = [{**item, **cached[key], "eventLabel": EVENT_LABELS.get(cached[key]["event"], "其他")} if key in cached else dict(item)
                 for key, item in zip(keys, news)]
        summary = aggregate(items, now)
        if summary["n"]:
            day = datetime.fromtimestamp(now).strftime("%Y-%m-%d")  # local calendar day of the run
            con.execute("INSERT OR REPLACE INTO daily VALUES (?,?,?,?,?,?,?,?)",
                        (symbol, day, summary["score"], summary["raw"], summary["evidence"], summary["n"], cfg.get("active_model") or cfg["model"], now))
            con.commit()
        out["llm"] = public_config(cfg)
        out.update(summary, items=items, history=load_history(con, symbol),
                   status="ok" if summary["n"] == len(items) else ("partial" if summary["n"] else "llm_error"))
        return out
    finally:
        con.close()


# --------------------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------------------

def _main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "--check":
        result = check_connection()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("ok") else 1
    status = 0
    for symbol in argv:
        data = compute_sentiment(symbol)
        score = data.get("score")
        print(f"{data['symbol']:<10} {data.get('asset', {}).get('label', ''):<4} {data.get('label', '--'):<6} score={'--' if score is None else f'{score:+.3f}'} "
              f"新闻 {data.get('n', 0)}/{len(data.get('items', []))} 相关 {data.get('relevant', 0)} "
              f"新打分 {data['stats']['scored']} 缓存 {data['stats']['cached']}  [{data['status']}]")
        for error in data.get("errors", []):
            print(f"  ! {error}")
        if data["status"] not in ("ok", "partial", "no_news"):
            status = 1
    return status


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
