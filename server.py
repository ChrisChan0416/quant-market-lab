#!/usr/bin/env python3
"""Small local server for QuantScope.

It serves the static dashboard and proxies Yahoo Finance data so the browser
does not need to make cross-origin requests directly:

* ``/api/chart``         daily / weekly price history (Yahoo chart API)
* ``/api/lbma``          LBMA gold AM fixing as a chart-shaped payload
* ``/api/fundamentals``  normalised statements, key statistics and analyst
                         estimates (Yahoo quoteSummary + fundamentals-timeseries)
* ``/api/sentiment``     news headlines scored by an OpenAI-compatible LLM
                         (NUS SoCLaaS, configured in ``soclaas.env``) -- see news_sentiment.py
* ``/api/llm/status``    whether the LLM is configured; ``?ping=1`` makes a test call
* ``/api/market-sentiment``  fear & greed readings for US / HK / A-shares (market_sentiment.py)
* ``/api/market-news``   today's top-10 market news + news-based market sentiment (market_news.py)

Only the Python standard library is required. If ``curl_cffi`` is installed
(``pip3 install curl_cffi``) it is used for Yahoo requests, because Yahoo is
increasingly strict with non-browser TLS fingerprints on the fundamentals
endpoints. The chart endpoint works either way.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import threading
import time
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener, urlopen

import fundamentals_providers
import market_news
import market_sentiment
import news_sentiment

try:
    import certifi  # type: ignore
except ImportError:
    certifi = None

try:  # optional: browser TLS impersonation makes the fundamentals API far more reliable
    from curl_cffi import requests as curl_requests  # type: ignore
except Exception:  # noqa: BLE001 - any import problem simply disables the optional backend
    curl_requests = None


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("QUANTSCOPE_PORT", "5173"))
CACHE: dict[tuple[str, ...], tuple[float, bytes]] = {}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9.^=_:-]{1,20}$")
CHART_RANGES = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"}
CHART_INTERVALS = {"1d", "1wk", "1mo"}
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
FUNDAMENTALS_TTL = 6 * 3600
SENTIMENT_TTL = 30 * 60
MARKET_TTL = 15 * 60
MARKET_NEWS_TTL = 30 * 60
MARKET_LOCKS = {"sentiment": threading.Lock(), "news": threading.Lock()}


def yahoo_ssl_context():
    """Use the local CA bundle when available; macOS Python may lack one."""
    if certifi:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl._create_unverified_context()  # noqa: S323 - public Yahoo endpoint fallback


class YahooClient:
    """Cookie + crumb aware HTTP client for Yahoo Finance.

    quoteSummary requires a crumb tied to a cookie set by ``fc.yahoo.com``.
    The crumb is cached for 30 minutes and refreshed automatically on 401/403.
    """

    def __init__(self):
        self.lock = threading.Lock()
        self.crumb: str | None = None
        self.crumb_time = 0.0
        self.crumb_fail_time = 0.0
        self.cooldown_until = 0.0  # set when Yahoo answers 429; fundamentals then skip Yahoo for a while
        if curl_requests is not None:
            self.session = curl_requests.Session(impersonate="chrome")
            self.opener = None
        else:
            self.session = None
            self.opener = build_opener(HTTPCookieProcessor(CookieJar()), HTTPSHandler(context=yahoo_ssl_context()))

    @property
    def backend(self) -> str:
        return "curl_cffi" if self.session is not None else "urllib"

    def get(self, url: str, timeout: float = 12) -> tuple[int, bytes]:
        if self.session is not None:
            response = self.session.get(url, timeout=timeout)
            return response.status_code, response.content
        request = Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9"})
        try:
            with self.opener.open(request, timeout=timeout) as response:
                return response.status, response.read()
        except HTTPError as exc:
            return exc.code, exc.read() if hasattr(exc, "read") else b""

    def get_crumb(self, force: bool = False) -> str | None:
        with self.lock:
            if not force and self.crumb and time.time() - self.crumb_time < 1800:
                return self.crumb
            if not force and self.crumb is None and time.time() - self.crumb_fail_time < 300:
                return None  # recent failure: do not hammer the cookie/crumb endpoints
            try:
                self.get("https://fc.yahoo.com", timeout=8)  # sets the A3 cookie (404 is expected)
            except Exception:  # noqa: BLE001 - cookie step is best-effort
                pass
            try:
                status, body = self.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=8)
                text = body.decode("utf-8", "ignore").strip()
                if status == 200 and text and "<" not in text and len(text) < 40:
                    self.crumb, self.crumb_time = text, time.time()
                    return self.crumb
            except Exception:  # noqa: BLE001
                pass
            self.crumb = None
            self.crumb_fail_time = time.time()
            return None

    def get_json(self, url: str, needs_crumb: bool = False, timeout: float = 12):
        crumb = self.get_crumb() if needs_crumb else None
        full = f"{url}{'&' if '?' in url else '?'}crumb={quote(crumb)}" if crumb else url
        status, body = self.get(full, timeout=timeout)
        if status in (401, 403) and needs_crumb:
            crumb = self.get_crumb(force=True)
            full = f"{url}{'&' if '?' in url else '?'}crumb={quote(crumb)}" if crumb else url
            status, body = self.get(full, timeout=timeout)
        if status == 429:
            self.cooldown_until = time.time() + 15 * 60
        if status != 200:
            raise RuntimeError(f"HTTP {status}")
        return json.loads(body)


YAHOO = YahooClient()


# --------------------------------------------------------------------------------------
# Fundamentals normalisation
# --------------------------------------------------------------------------------------

# field -> candidate Yahoo fundamentals-timeseries names (first available wins)
STATEMENT_FIELDS: dict[str, list[str]] = {
    "revenue": ["TotalRevenue", "OperatingRevenue"],
    "grossProfit": ["GrossProfit"],
    "ebit": ["EBIT", "OperatingIncome"],
    "operatingIncome": ["OperatingIncome"],
    "ebitda": ["EBITDA", "NormalizedEBITDA"],
    "netIncome": ["NetIncomeCommonStockholders", "NetIncome"],
    "pretaxIncome": ["PretaxIncome"],
    "taxProvision": ["TaxProvision"],
    "taxRate": ["TaxRateForCalcs"],
    "interestExpense": ["InterestExpense", "InterestExpenseNonOperating"],
    "netInterestIncome": ["NetInterestIncome"],
    "dilutedEps": ["DilutedEPS"],
    "dilutedShares": ["DilutedAverageShares"],
    "dps": ["DividendPerShare"],
    "operatingCashFlow": ["OperatingCashFlow", "CashFlowFromContinuingOperatingActivities"],
    "capex": ["CapitalExpenditure"],
    "freeCashFlow": ["FreeCashFlow"],
    "dividendsPaid": ["CashDividendsPaid", "CommonStockDividendPaid"],
    "buyback": ["RepurchaseOfCapitalStock"],
    "sbc": ["StockBasedCompensation"],
    "da": ["DepreciationAndAmortization", "ReconciledDepreciation"],
    "totalAssets": ["TotalAssets"],
    "currentAssets": ["CurrentAssets"],
    "currentLiabilities": ["CurrentLiabilities"],
    "totalLiabilities": ["TotalLiabilitiesNetMinorityInterest"],
    "totalDebt": ["TotalDebt"],
    "longTermDebt": ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligation"],
    "cash": ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalents"],
    "equity": ["StockholdersEquity", "CommonStockEquity"],
    "minorityInterest": ["MinorityInterest"],
    "retainedEarnings": ["RetainedEarnings"],
    "sharesOutstanding": ["OrdinarySharesNumber", "ShareIssued"],
    "investedCapital": ["InvestedCapital"],
    "workingCapital": ["WorkingCapital"],
}
FLOW_FIELDS = [
    "revenue", "grossProfit", "ebit", "operatingIncome", "ebitda", "netIncome", "pretaxIncome", "taxProvision",
    "interestExpense", "netInterestIncome", "dilutedEps", "operatingCashFlow", "capex", "freeCashFlow",
    "dividendsPaid", "buyback", "sbc", "da",
]
BALANCE_FIELDS = [
    "totalAssets", "currentAssets", "currentLiabilities", "totalLiabilities", "totalDebt", "longTermDebt", "cash",
    "equity", "minorityInterest", "retainedEarnings", "sharesOutstanding", "investedCapital", "workingCapital",
]
QUOTE_SUMMARY_MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,earningsTrend,quoteType"


def raw(value):
    """quoteSummary values are either plain numbers or {"raw":..,"fmt":..} objects."""
    if isinstance(value, dict):
        value = value.get("raw")
    if isinstance(value, (int, float)) and value == value:  # filters NaN
        return float(value)
    return None


def timeseries_names(prefix: str, fields: list[str]) -> list[str]:
    names: list[str] = []
    for field in fields:
        names.extend(f"{prefix}{name}" for name in STATEMENT_FIELDS[field])
    return names


def fetch_timeseries(symbol: str, names: list[str]) -> dict[str, list[dict]]:
    """Return {type_name: [ {date, value, currency}, ...]} for the requested Yahoo series."""
    period1 = int(datetime(2016, 12, 31, tzinfo=timezone.utc).timestamp())
    period2 = int(time.time()) + 86400
    out: dict[str, list[dict]] = {}
    for start in range(0, len(names), 55):  # keep URLs short (some proxies drop long URLs)
        chunk = names[start:start + 55]
        url = (
            "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"
            f"{quote(symbol, safe='')}?symbol={quote(symbol, safe='')}&type={','.join(chunk)}"
            f"&period1={period1}&period2={period2}"
        )
        data = YAHOO.get_json(url, needs_crumb=False)
        for item in (data.get("timeseries") or {}).get("result") or []:
            type_name = ((item.get("meta") or {}).get("type") or [None])[0]
            if not type_name:
                continue
            rows = []
            for entry in item.get(type_name) or []:
                if not entry:
                    continue
                value = raw(entry.get("reportedValue"))
                if value is None or not entry.get("asOfDate"):
                    continue
                rows.append({"date": entry["asOfDate"], "value": value, "currency": entry.get("currencyCode")})
            if rows:
                out[type_name] = sorted(rows, key=lambda row: row["date"])
    return out


def build_periods(series: dict[str, list[dict]], prefix: str, fields: list[str]) -> tuple[list[dict], str | None]:
    """Merge Yahoo series into a list of periods, ascending by date."""
    periods: dict[str, dict] = {}
    currency = None
    for field in fields:
        for name in STATEMENT_FIELDS[field]:
            rows = series.get(f"{prefix}{name}")
            if not rows:
                continue
            for row in rows:
                period = periods.setdefault(row["date"], {"date": row["date"]})
                period.setdefault(field, row["value"])
                currency = currency or row.get("currency")
    return [periods[key] for key in sorted(periods)], currency


def fetch_fx(from_ccy: str | None, to_ccy: str | None) -> float | None:
    if not from_ccy or not to_ccy or from_ccy.upper() == to_ccy.upper():
        return 1.0
    pair = f"{from_ccy.upper()}{to_ccy.upper()}=X"
    try:
        payload = YAHOO.get_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(pair, safe='')}?range=5d&interval=1d")
        closes = payload["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        closes = [value for value in closes if value]
        return float(closes[-1]) if closes else None
    except Exception:  # noqa: BLE001
        return None


def build_fundamentals(symbol: str) -> dict:
    """Free official/public sources first (SEC EDGAR for US, Eastmoney F10 for A-shares and HK), Yahoo as fallback."""
    payload, errors = fundamentals_providers.free_fundamentals(symbol)
    if payload and not payload["sources"].get("stale"):
        return payload
    if payload and time.time() < YAHOO.cooldown_until:
        return payload  # stale filings beat nothing; the panel shows the statement date
    if payload:  # e.g. a foreign filer whose latest XBRL is >15 months old: try Yahoo once, keep SEC if it fails
        try:
            out = build_fundamentals_yahoo(symbol)
            out["sources"]["provider"] = "Yahoo Finance"
            return out
        except Exception:  # noqa: BLE001
            return payload
    if time.time() < YAHOO.cooldown_until:
        wait = int((YAHOO.cooldown_until - time.time()) / 60) + 1
        errors.append(f"Yahoo: 刚被限流 (HTTP 429)，约 {wait} 分钟后再试")
        raise RuntimeError("; ".join(errors))
    try:
        out = build_fundamentals_yahoo(symbol)
        out["sources"]["provider"] = "Yahoo Finance"
        return out
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Yahoo: {exc}")
        raise RuntimeError("; ".join(errors)) from exc


def build_fundamentals_yahoo(symbol: str) -> dict:
    errors: list[str] = []
    summary: dict = {}
    try:
        modules_url = (
            f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{quote(symbol, safe='')}"
            f"?modules={QUOTE_SUMMARY_MODULES}&formatted=false&corsDomain=finance.yahoo.com"
        )
        data = YAHOO.get_json(modules_url, needs_crumb=True)
        summary = ((data.get("quoteSummary") or {}).get("result") or [{}])[0] or {}
    except Exception as exc:  # noqa: BLE001
        errors.append(f"quoteSummary: {exc}")

    annual: list[dict] = []
    quarterly: list[dict] = []
    ttm: dict = {}
    statement_currency = None
    try:
        names = (
            timeseries_names("annual", FLOW_FIELDS + BALANCE_FIELDS + ["taxRate", "dilutedShares", "dps"])
            + timeseries_names("trailing", FLOW_FIELDS)
            + timeseries_names("quarterly", BALANCE_FIELDS)
        )
        series = fetch_timeseries(symbol, names)
        annual, statement_currency = build_periods(series, "annual", FLOW_FIELDS + BALANCE_FIELDS + ["taxRate", "dilutedShares", "dps"])
        trailing, _ = build_periods(series, "trailing", FLOW_FIELDS)
        ttm = trailing[-1] if trailing else {}
        quarterly, _ = build_periods(series, "quarterly", BALANCE_FIELDS)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"timeseries: {exc}")

    price = summary.get("price") or {}
    detail = summary.get("summaryDetail") or {}
    stats = summary.get("defaultKeyStatistics") or {}
    fin = summary.get("financialData") or {}
    profile = summary.get("assetProfile") or {}
    quote_type = summary.get("quoteType") or {}
    trend = (summary.get("earningsTrend") or {}).get("trend") or []
    growth = {row.get("period"): raw(row.get("growth")) for row in trend if row.get("period")}
    revenue_growth_est = {row.get("period"): raw((row.get("revenueEstimate") or {}).get("growth")) for row in trend if row.get("period")}

    currency = price.get("currency") or detail.get("currency")
    financial_currency = fin.get("financialCurrency") or statement_currency or currency
    last_price = raw(price.get("regularMarketPrice")) or raw(fin.get("currentPrice"))
    market_cap = raw(price.get("marketCap")) or raw(detail.get("marketCap"))
    fx = fetch_fx(financial_currency, currency)

    if not summary and not annual:
        raise RuntimeError("; ".join(errors) or "no fundamentals")

    return {
        "symbol": symbol,
        "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currency": currency,
        "financialCurrency": financial_currency,
        "fxToPrice": fx,
        "price": last_price,
        "marketCap": market_cap,
        "profile": {
            "name": price.get("longName") or price.get("shortName") or quote_type.get("longName"),
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "country": profile.get("country"),
            "quoteType": quote_type.get("quoteType") or price.get("quoteType"),
            "employees": profile.get("fullTimeEmployees"),
        },
        "stats": {
            "trailingPE": raw(detail.get("trailingPE")),
            "forwardPE": raw(detail.get("forwardPE")) or raw(stats.get("forwardPE")),
            "priceToBook": raw(stats.get("priceToBook")),
            "priceToSales": raw(detail.get("priceToSalesTrailing12Months")),
            "evToEbitda": raw(stats.get("enterpriseToEbitda")),
            "evToRevenue": raw(stats.get("enterpriseToRevenue")),
            "pegRatio": raw(stats.get("pegRatio")) or raw(stats.get("trailingPegRatio")),
            "enterpriseValue": raw(stats.get("enterpriseValue")),
            "trailingEps": raw(stats.get("trailingEps")),
            "forwardEps": raw(stats.get("forwardEps")),
            "bookValuePerShare": raw(stats.get("bookValue")),
            "sharesOutstanding": raw(stats.get("sharesOutstanding")) or raw(stats.get("impliedSharesOutstanding")),
            "dividendRate": raw(detail.get("dividendRate")) or raw(detail.get("trailingAnnualDividendRate")),
            "dividendYield": raw(detail.get("dividendYield")) or raw(detail.get("trailingAnnualDividendYield")),
            "payoutRatio": raw(detail.get("payoutRatio")),
            "beta": raw(detail.get("beta")) or raw(stats.get("beta")),
            "heldPercentInsiders": raw(stats.get("heldPercentInsiders")),
        },
        "financial": {
            "totalCash": raw(fin.get("totalCash")),
            "totalDebt": raw(fin.get("totalDebt")),
            "ebitda": raw(fin.get("ebitda")),
            "revenue": raw(fin.get("totalRevenue")),
            "freeCashflow": raw(fin.get("freeCashflow")),
            "operatingCashflow": raw(fin.get("operatingCashflow")),
            "revenueGrowth": raw(fin.get("revenueGrowth")),
            "earningsGrowth": raw(fin.get("earningsGrowth")),
            "grossMargins": raw(fin.get("grossMargins")),
            "operatingMargins": raw(fin.get("operatingMargins")),
            "profitMargins": raw(fin.get("profitMargins")),
            "returnOnEquity": raw(fin.get("returnOnEquity")),
            "returnOnAssets": raw(fin.get("returnOnAssets")),
            "currentRatio": raw(fin.get("currentRatio")),
            "debtToEquity": raw(fin.get("debtToEquity")),
        },
        "analyst": {
            "targetMean": raw(fin.get("targetMeanPrice")),
            "targetMedian": raw(fin.get("targetMedianPrice")),
            "targetHigh": raw(fin.get("targetHighPrice")),
            "targetLow": raw(fin.get("targetLowPrice")),
            "count": raw(fin.get("numberOfAnalystOpinions")),
            "recommendationMean": raw(fin.get("recommendationMean")),
            "recommendationKey": fin.get("recommendationKey"),
            "epsGrowthCurrentYear": growth.get("0y"),
            "epsGrowthNextYear": growth.get("+1y"),
            "epsGrowthLongTerm": growth.get("+5y") if growth.get("+5y") is not None else growth.get("LTG"),
            "revenueGrowthNextYear": revenue_growth_est.get("+1y"),
        },
        "annual": annual,
        "ttm": ttm,
        "latestBalance": quarterly[-1] if quarterly else (annual[-1] if annual else {}),
        "sources": {"quoteSummary": bool(summary), "timeseries": bool(annual), "backend": YAHOO.backend, "errors": errors},
    }


class QuantScopeHandler(SimpleHTTPRequestHandler):
    """Static file handler plus small, cached data proxies."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):  # noqa: N802 - required by the stdlib HTTP server
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_GET(self):  # noqa: N802 - required by the stdlib HTTP server
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "service": "quant-scope", "version": "2.5", "http_backend": YAHOO.backend,
                            "llm": news_sentiment.public_config()})
            return
        if parsed.path == "/api/chart":
            self.proxy_chart(query)
            return
        if parsed.path == "/api/lbma":
            self.proxy_lbma(query)
            return
        if parsed.path == "/api/fundamentals":
            self.fundamentals(query)
            return
        if parsed.path == "/api/sentiment":
            self.sentiment(query)
            return
        if parsed.path == "/api/market-sentiment":
            self.market(query, "sentiment")
            return
        if parsed.path == "/api/market-news":
            self.market(query, "news")
            return
        if parsed.path == "/api/llm/status":
            ping = query.get("ping", ["0"])[0] == "1"
            self.send_json(news_sentiment.check_connection() if ping else news_sentiment.public_config())
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def proxy_chart(self, query):
        symbol = query.get("symbol", [""])[0].strip()
        period = query.get("range", ["1y"])[0]
        interval = query.get("interval", ["1d"])[0]
        if not SYMBOL_RE.fullmatch(symbol):
            self.send_json({"error": "invalid symbol"}, status=400)
            return
        if period not in CHART_RANGES:
            period = "1y"
        if interval not in CHART_INTERVALS:
            interval = "1d"
        cache_key = ("chart", symbol.upper(), period, interval)
        now = time.time()
        cached = CACHE.get(cache_key)
        if cached and now - cached[0] < 60:
            self.send_bytes(cached[1], "application/json")
            return
        endpoint = (
            "https://query1.finance.yahoo.com/v8/finance/chart/"
            f"{quote(symbol, safe='')}?{urlencode({'range': period, 'interval': interval, 'events': 'div,splits', 'includeAdjustedClose': 'true'})}"
        )
        try:
            request = Request(endpoint, headers={"User-Agent": "QuantScope/2.0 personal-research"})
            with urlopen(request, timeout=12, context=yahoo_ssl_context()) as response:
                payload = response.read()
            json.loads(payload)
            CACHE[cache_key] = (now, payload)
            self.send_bytes(payload, "application/json")
        except Exception as exc:  # the UI provides a demo-mode fallback
            try:  # second attempt through the cookie-aware client
                data = YAHOO.get_json(endpoint)
                payload = json.dumps(data).encode("utf-8")
                CACHE[cache_key] = (now, payload)
                self.send_bytes(payload, "application/json")
            except Exception:  # noqa: BLE001
                self.send_json({"error": "upstream unavailable", "detail": str(exc)}, status=502)

    def fundamentals(self, query):
        symbol = query.get("symbol", [""])[0].strip().upper()
        if not SYMBOL_RE.fullmatch(symbol):
            self.send_json({"error": "invalid symbol"}, status=400)
            return
        cache_key = ("fundamentals", symbol)
        now = time.time()
        cached = CACHE.get(cache_key)
        if cached and now - cached[0] < FUNDAMENTALS_TTL:
            self.send_bytes(cached[1], "application/json")
            return
        try:
            payload = json.dumps(build_fundamentals(symbol)).encode("utf-8")
            CACHE[cache_key] = (now, payload)
            self.send_bytes(payload, "application/json")
        except Exception as exc:  # noqa: BLE001 - UI falls back to manual inputs
            self.send_json({"error": "fundamentals unavailable", "detail": str(exc), "backend": YAHOO.backend}, status=502)

    def sentiment(self, query):
        symbol = query.get("symbol", [""])[0].strip().upper()
        name = re.sub(r"[^\w .,&'()-]", "", query.get("name", [""])[0], flags=re.UNICODE).strip()[:80] or None
        refresh = query.get("refresh", ["0"])[0] == "1"
        if not SYMBOL_RE.fullmatch(symbol):
            self.send_json({"error": "invalid symbol"}, status=400)
            return
        cache_key = ("sentiment", symbol)
        now = time.time()
        cached = CACHE.get(cache_key)
        if cached and not refresh and now - cached[0] < SENTIMENT_TTL:
            self.send_bytes(cached[1], "application/json")
            return
        try:
            data = news_sentiment.compute_sentiment(symbol, name, get_json=YAHOO.get_json)
            payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
            if data.get("status") in ("ok", "partial", "no_news"):  # LLM errors are retried on the next request
                CACHE[cache_key] = (now, payload)
            self.send_bytes(payload, "application/json")
        except Exception as exc:  # noqa: BLE001 - the panel shows the message
            self.send_json({"error": "sentiment unavailable", "detail": str(exc)}, status=502)

    def market(self, query, kind: str):
        """Market-wide sentiment / top news. One computation at a time per kind; results cached."""
        refresh = query.get("refresh", ["0"])[0] == "1"
        cache_key = ("market", kind)
        ttl = MARKET_TTL if kind == "sentiment" else MARKET_NEWS_TTL
        cached = CACHE.get(cache_key)
        if cached and not refresh and time.time() - cached[0] < ttl:
            self.send_bytes(cached[1], "application/json")
            return
        with MARKET_LOCKS[kind]:
            cached = CACHE.get(cache_key)  # another request may have filled it while we waited
            if cached and time.time() - cached[0] < (5 if refresh else ttl):
                self.send_bytes(cached[1], "application/json")
                return
            try:
                if kind == "sentiment":
                    data = market_sentiment.compute_market_sentiment(get_json=YAHOO.get_json)
                    ok = bool(data.get("regions"))
                else:
                    data = market_news.compute_market_news()
                    ok = data.get("status") in ("ok", "partial", "heuristic", "no_news")
                payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
                if ok:
                    CACHE[cache_key] = (time.time(), payload)
                self.send_bytes(payload, "application/json")
            except Exception as exc:  # noqa: BLE001 - the panel shows the message
                self.send_json({"error": f"market {kind} unavailable", "detail": str(exc)}, status=502)

    def proxy_lbma(self, query):
        """Return a Yahoo-chart-shaped payload for the LBMA AM gold series."""
        period = query.get("range", ["1y"])[0]
        if period not in CHART_RANGES:
            period = "1y"
        cache_key = ("LBMA_AM", period)
        now = time.time()
        cached = CACHE.get(cache_key)
        if cached and now - cached[0] < 3600:
            self.send_bytes(cached[1], "application/json")
            return
        lookback_days = {"1mo": 45, "3mo": 110, "6mo": 200, "1y": 380, "2y": 760, "5y": 1900, "10y": 3700, "max": 20000}[period]
        endpoint = "https://prices.lbma.org.uk/json/gold_am.json"
        try:
            request = Request(endpoint, headers={"User-Agent": "QuantScope/2.0 personal-research"})
            with urlopen(request, timeout=12, context=yahoo_ssl_context()) as response:
                rows = json.loads(response.read())
            cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
            timestamps = []
            closes = []
            for row in rows:
                value = row.get("v", [None])[0]
                date_text = row.get("d")
                if not date_text or value is None:
                    continue
                date_value = datetime.strptime(date_text, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if date_value < cutoff:
                    continue
                timestamps.append(int(date_value.timestamp()))
                closes.append(float(value))
            payload = {"chart": {"result": [{"meta": {"currency": "USD", "symbol": "XAUUSD=X", "shortName": "伦敦金（LBMA AM）"}, "timestamp": timestamps, "indicators": {"quote": [{"close": closes, "high": closes, "low": closes, "volume": [0] * len(closes)}]}}]}}
            encoded = json.dumps(payload).encode("utf-8")
            CACHE[cache_key] = (now, encoded)
            self.send_bytes(encoded, "application/json")
        except Exception as exc:
            self.send_json({"error": "lbma unavailable", "detail": str(exc)}, status=502)

    def send_json(self, data, status=200):
        self.send_bytes(json.dumps(data).encode("utf-8"), "application/json", status)

    def send_bytes(self, payload, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):  # keep the local terminal readable
        if self.path.startswith("/api/"):
            super().log_message(format, *args)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), QuantScopeHandler)
    print(f"QuantScope 2.5 running at http://{HOST}:{PORT}")
    llm = news_sentiment.public_config()
    print(f"News sentiment LLM: {llm['model']} @ {llm['host']}" if llm["configured"] else "News sentiment LLM: not configured (create soclaas.env, see README)")
    print("Fundamentals: SEC EDGAR (US) · Eastmoney F10 (A-shares, HK) · Yahoo fallback"
          + ("" if fundamentals_providers.SEC_EMAIL else "  (tip: put QUANTSCOPE_SEC_EMAIL=you@example.com in datasources.env for SEC)"))
    print(f"Yahoo HTTP backend: {YAHOO.backend}" + ("" if YAHOO.backend == "curl_cffi" else "  (tip: pip3 install curl_cffi for steadier fundamentals)"))
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nQuantScope stopped.")
    finally:
        server.server_close()
