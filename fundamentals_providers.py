"""Free, key-less fundamentals providers for QuantScope (v2.2).

Yahoo's quoteSummary / fundamentals-timeseries endpoints rate-limit aggressively (HTTP 429). This module
adds official or long-standing public sources and returns the SAME normalised shape as
``server.build_fundamentals`` so the valuation engine does not change:

* US-listed (incl. ADRs filing 20-F)  -> SEC EDGAR XBRL "companyfacts" (data.sec.gov, official, free)
* China A-shares (.SS / .SZ / .BJ)    -> Eastmoney F10 datacenter (three statements, by company type)
* Hong Kong (.HK)                     -> Eastmoney HK F10 (long-format statements + company profile)
* Quotes (price, total shares)        -> Eastmoney push2 quote API

All endpoints and field names were checked against live responses on 2026-10-14.
Nothing here needs an API key. SEC asks automated clients to send a User-Agent with a contact
address: set the environment variable QUANTSCOPE_SEC_EMAIL to your e-mail (see README).
"""

from __future__ import annotations

import json
import os
import re
import ssl
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

try:
    import certifi  # type: ignore
except ImportError:  # pragma: no cover
    certifi = None

ROOT = Path(__file__).resolve().parent
DISK_CACHE = ROOT / "data" / "fundamentals_cache"
DISK_TTL = 12 * 3600
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
def _config_value(key: str) -> str:
    """Environment variable first, then datasources.env (KEY=VALUE lines) next to server.py."""
    if os.environ.get(key):
        return os.environ[key].strip()
    try:
        for line in (ROOT / "datasources.env").read_text("utf-8").splitlines():
            k, _, v = line.partition("=")
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


SEC_EMAIL = _config_value("QUANTSCOPE_SEC_EMAIL")
SEC_UA = f"QuantScope personal-research {SEC_EMAIL or 'quantscope-user@example.com'}"
EM_DATACENTER = "https://datacenter.eastmoney.com/securities/api/data/v1/get"
CURRENCY_CN = {
    "人民币": "CNY", "港元": "HKD", "港币": "HKD", "美元": "USD", "新加坡元": "SGD", "日元": "JPY", "欧元": "EUR",
    "英镑": "GBP", "澳元": "AUD", "加元": "CAD", "新台币": "TWD", "马来西亚林吉特": "MYR", "瑞士法郎": "CHF",
}


def _ssl():
    return ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()


def http_json(url: str, headers: dict | None = None, timeout: float = 15, retries: int = 1):
    last = None
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "application/json,*/*", **(headers or {})})
            with urlopen(req, timeout=timeout, context=_ssl()) as resp:
                return json.loads(resp.read())
        except HTTPError as exc:
            last = RuntimeError(f"HTTP {exc.code}")
            if exc.code in (400, 401, 403, 404):
                break
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(str(last))


def _num(v):
    if isinstance(v, (int, float)) and v == v:
        return float(v)
    if isinstance(v, str):
        try:
            x = float(v)
            return x if x == x else None
        except ValueError:
            return None
    return None


def _sum(*vals):
    xs = [v for v in vals if isinstance(v, (int, float))]
    return float(sum(xs)) if xs else None


def _first(*vals):
    for v in vals:
        if isinstance(v, (int, float)):
            return float(v)
    return None


def _neg(v):
    return -abs(v) if isinstance(v, (int, float)) else None


# ------------------------------------------------------------------------------------------- disk cache
def cache_get(key: str):
    path = DISK_CACHE / f"{re.sub(r'[^A-Za-z0-9._-]', '_', key)}.json"
    try:
        if path.exists() and time.time() - path.stat().st_mtime < DISK_TTL:
            return json.loads(path.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    return None


def cache_put(key: str, data) -> None:
    try:
        DISK_CACHE.mkdir(parents=True, exist_ok=True)
        (DISK_CACHE / f"{re.sub(r'[^A-Za-z0-9._-]', '_', key)}.json").write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    except Exception:  # noqa: BLE001 - cache is best-effort
        pass


# ------------------------------------------------------------------------------------------- market routing
def market_of(symbol: str) -> str:
    s = symbol.upper()
    if re.fullmatch(r"\d{6}\.(SS|SZ|BJ)", s):
        return "CN"
    if re.fullmatch(r"\d{1,5}\.HK", s):
        return "HK"
    if re.fullmatch(r"[A-Z][A-Z0-9]{0,5}([.-][A-Z])?", s):
        return "US"
    return "OTHER"


# ------------------------------------------------------------------------------------------- Eastmoney quote
def em_secid(symbol: str) -> list[str]:
    s = symbol.upper()
    code, _, suffix = s.partition(".")
    if suffix == "SS":
        return [f"1.{code}"]
    if suffix in ("SZ", "BJ"):
        return [f"0.{code}"]
    if suffix == "HK":
        return [f"116.{code.zfill(5)}"]
    us = s.replace("-", "_")
    return [f"105.{us}", f"106.{us}", f"107.{us}"]


def em_quote(symbol: str) -> dict:
    fields = "f43,f57,f58,f84,f85,f116,f162,f164,f167"
    for secid in em_secid(symbol):
        try:
            data = http_json(f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fltt=2&invt=2&fields={fields}", timeout=8)
        except Exception:  # noqa: BLE001
            continue
        d = (data or {}).get("data") or {}
        price = _num(d.get("f43"))
        if price and price > 0:
            return {"price": price, "name": d.get("f58"), "totalShares": _num(d.get("f84")), "marketCap": _num(d.get("f116")),
                    "peTTM": _num(d.get("f164")), "pb": _num(d.get("f167"))}
    return {}


# USD crosses quoted by Eastmoney push2 (checked 2026-10-14). Value = units of currency per 1 USD,
# except EUR/GBP which are quoted as USD per 1 unit (inverted below).
EM_USD_CROSS = {"CNY": "133.USDCNH", "HKD": "119.USDHKD", "JPY": "119.USDJPY", "KRW": "119.USDKRW", "SGD": "119.USDSGD",
                "EUR": "119.EURUSD", "GBP": "119.GBPUSD"}
_ER_CACHE: dict = {"t": 0, "rates": {}}


def _usd_rates_er_api() -> dict:
    """open.er-api.com: free daily reference rates for ~160 currencies (fallback, e.g. TWD)."""
    if time.time() - _ER_CACHE["t"] > 6 * 3600:
        data = http_json("https://open.er-api.com/v6/latest/USD", timeout=10)
        if data.get("result") == "success":
            _ER_CACHE.update(t=time.time(), rates=data.get("rates") or {})
    return _ER_CACHE["rates"]


def em_fx(from_ccy: str, to_ccy: str):
    """Units of to_ccy per 1 unit of from_ccy, via USD crosses. Eastmoney real-time first, open.er-api daily second."""
    def usd_to(ccy):
        if ccy == "USD":
            return 1.0
        secid = EM_USD_CROSS.get(ccy)
        if secid:
            try:
                v = _num((http_json(f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fltt=2&fields=f43", timeout=8).get("data") or {}).get("f43"))
                if v:
                    return 1 / v if ccy in ("EUR", "GBP") else v
            except Exception:  # noqa: BLE001
                pass
        try:
            return _num(_usd_rates_er_api().get(ccy))
        except Exception:  # noqa: BLE001
            return None
    a, b = usd_to(from_ccy), usd_to(to_ccy)
    return b / a if a and b else None


def em_report(report: str, filt: str, columns: str = "ALL", page_size: int = 50, sort_cols: str = "REPORT_DATE",
              sort_types: str = "-1", source: str = "HSF10"):
    params = {"reportName": report, "columns": columns, "quoteColumns": "", "filter": filt, "pageNumber": 1,
              "pageSize": page_size, "source": source, "client": "PC"}
    if sort_cols:
        params.update({"sortTypes": sort_types, "sortColumns": sort_cols})
    data = http_json(f"{EM_DATACENTER}?{urlencode(params)}", headers={"Referer": "https://emweb.securities.eastmoney.com/"})
    result = (data or {}).get("result") or {}
    rows = result.get("data") or []
    if not rows:
        raise RuntimeError(f"{report}: {data.get('message') or 'empty'}")
    return rows


# ------------------------------------------------------------------------------------------- A-shares
A_PREFIX = {"通用": "G", "银行": "B", "证券": "S", "保险": "I"}
YTD_TYPES = {"一季报": 3, "中报": 6, "三季报": 9, "年报": 12}


def _a_flows(inc: dict, cf: dict, general: bool) -> dict:
    interest = _num(inc.get("FE_INTEREST_EXPENSE")) if general else None
    op_profit = _num(inc.get("OPERATE_PROFIT"))
    revenue = _first(_num(inc.get("TOTAL_OPERATE_INCOME")), _num(inc.get("OPERATE_INCOME")))
    gross = None
    if general and _num(inc.get("OPERATE_INCOME")) is not None and _num(inc.get("OPERATE_COST")) is not None:
        gross = _num(inc.get("OPERATE_INCOME")) - _num(inc.get("OPERATE_COST"))
    ocf = _num(cf.get("NETCASH_OPERATE"))
    capex = _num(cf.get("CONSTRUCT_LONG_ASSET"))
    da = _sum(_num(cf.get("FA_IR_DEPR")), _num(cf.get("IA_AMORTIZE")), _num(cf.get("LPE_AMORTIZE")), _num(cf.get("USERIGHT_ASSET_AMORTIZE")))
    ebit = (op_profit + (interest or 0)) if op_profit is not None else None
    # "分配股利、利润或偿付利息支付的现金" also contains interest paid -> subtract the interest expense
    dividends = _num(cf.get("ASSIGN_DIVIDEND_PORFIT"))
    if dividends is not None:
        dividends = max(0.0, dividends - (interest or 0))
    return {
        "revenue": revenue, "grossProfit": gross, "operatingIncome": op_profit, "ebit": ebit,
        "ebitda": (ebit + da) if ebit is not None and da is not None else None,
        "netIncome": _num(inc.get("PARENT_NETPROFIT")), "pretaxIncome": _num(inc.get("TOTAL_PROFIT")),
        "taxProvision": _num(inc.get("INCOME_TAX")), "interestExpense": interest,
        "dilutedEps": _first(_num(inc.get("DILUTED_EPS")), _num(inc.get("BASIC_EPS"))),
        "operatingCashFlow": ocf, "capex": _neg(capex), "freeCashFlow": (ocf - capex) if ocf is not None and capex is not None else None,
        "dividendsPaid": _neg(dividends), "da": da,
    }


def _a_balance(bs: dict, general: bool) -> dict:
    ca, cl = _num(bs.get("TOTAL_CURRENT_ASSETS")), _num(bs.get("TOTAL_CURRENT_LIAB"))
    debt = _sum(*(_num(bs.get(k)) for k in ("SHORT_LOAN", "LONG_LOAN", "BOND_PAYABLE", "NONCURRENT_LIAB_1YEAR", "LEASE_LIAB", "SHORT_BOND_PAYABLE"))) if general else _num(bs.get("BOND_PAYABLE"))
    cash = _sum(*(_num(bs.get(k)) for k in ("MONETARYFUNDS", "TRADE_FINASSET_NOTFVTPL", "TRADE_FINASSET", "LEND_FUND"))) if general else _num(bs.get("CASH_DEPOSIT_PBC"))
    return {
        "totalAssets": _num(bs.get("TOTAL_ASSETS")), "currentAssets": ca, "currentLiabilities": cl,
        "totalLiabilities": _num(bs.get("TOTAL_LIABILITIES")), "totalDebt": debt or 0.0,
        "longTermDebt": _sum(_num(bs.get("LONG_LOAN")), _num(bs.get("BOND_PAYABLE")), _num(bs.get("LEASE_LIAB"))) or 0.0,
        "cash": cash or 0.0, "equity": _num(bs.get("TOTAL_PARENT_EQUITY")), "minorityInterest": _num(bs.get("MINORITY_EQUITY")) or 0.0,
        "retainedEarnings": _sum(_num(bs.get("UNASSIGN_RPOFIT")), _num(bs.get("SURPLUS_RESERVE"))),
        "workingCapital": (ca - cl) if ca is not None and cl is not None else None,
    }


def _ttm(periods: list[dict], key_type: str = "type") -> dict:
    """periods: newest first, each {date, type ('年报'/'中报'...), flows{}}. TTM = latest YTD + last FY - prior-year same YTD."""
    if not periods:
        return {}
    latest = periods[0]
    if latest[key_type] == "年报":
        return dict(latest["flows"], date=latest["date"])
    fy = next((p for p in periods if p[key_type] == "年报" and p["date"] < latest["date"]), None)
    prev = next((p for p in periods if p[key_type] == latest[key_type] and p["date"][:4] == str(int(latest["date"][:4]) - 1)), None)
    if not fy or not prev:
        return dict(fy["flows"], date=fy["date"]) if fy else {}
    out = {"date": latest["date"]}
    for k, v in latest["flows"].items():
        a, b = fy["flows"].get(k), prev["flows"].get(k)
        out[k] = (v + a - b) if all(isinstance(x, (int, float)) for x in (v, a, b)) else None
    out["dilutedEps"] = None  # per-share figures do not add up across periods
    return out


def fetch_cn(symbol: str) -> dict:
    code, _, suffix = symbol.upper().partition(".")
    secu = f"{code}.{'SH' if suffix == 'SS' else suffix}"
    main = em_report("RPT_F10_FINANCE_MAINFINADATA", f'(SECUCODE="{secu}")', page_size=40)
    org_type = main[0].get("ORG_TYPE") or "通用"
    prefixes = [A_PREFIX.get(org_type, "G")] + (["G"] if A_PREFIX.get(org_type, "G") != "G" else [])
    stmts = None
    for pre in prefixes:
        try:
            stmts = {kind: em_report(f"RPT_F10_FINANCE_{pre}{kind}", f'(SECUCODE="{secu}")', page_size=40) for kind in ("BALANCE", "INCOME", "CASHFLOW")}
            general = pre == "G"
            break
        except Exception:  # noqa: BLE001
            continue
    if not stmts:
        raise RuntimeError("东方财富 A 股报表为空")
    by_date = {}
    for kind, rows in stmts.items():
        for r in rows:
            d = (r.get("REPORT_DATE") or "")[:10]
            if r.get("REPORT_TYPE") in YTD_TYPES and d:
                by_date.setdefault(d, {"date": d, "type": r["REPORT_TYPE"], "currency": r.get("CURRENCY")})[kind] = r
    shares_by_date = {(m.get("REPORT_DATE") or "")[:10]: _num(m.get("TOTAL_SHARE")) for m in main}
    periods = []
    for d in sorted(by_date, reverse=True):
        p = by_date[d]
        if "INCOME" not in p:
            continue
        p["flows"] = _a_flows(p["INCOME"], p.get("CASHFLOW", {}), general)
        p["balance"] = _a_balance(p.get("BALANCE", {}), general) if "BALANCE" in p else {}
        p["balance"]["sharesOutstanding"] = shares_by_date.get(d)
        periods.append(p)
    annual = [dict(p["flows"], **p["balance"], date=p["date"]) for p in reversed(periods) if p["type"] == "年报"][-6:]
    latest_bal = next((dict(p["balance"], date=p["date"]) for p in periods if p["balance"].get("totalAssets")), {})
    quote_ = em_quote(symbol)
    shares = _first(latest_bal.get("sharesOutstanding"), quote_.get("totalShares"))
    sector, industry = ("Financial Services", {"银行": "Banks", "证券": "Capital Markets", "保险": "Insurance"}[org_type]) if org_type in ("银行", "证券", "保险") else ("", "")
    return assemble(
        symbol, provider="东方财富 F10", currency="CNY", financial_currency=periods[0].get("currency") or "CNY",
        price=quote_.get("price"), shares=shares, name=main[0].get("SECURITY_NAME_ABBR") or quote_.get("name"),
        sector=sector, industry=industry, country="China", annual=annual, ttm=_ttm(periods), latest_balance=latest_bal,
        extra_stats={"trailingPE": quote_.get("peTTM"), "priceToBook": quote_.get("pb")},
    )


# ------------------------------------------------------------------------------------------- Hong Kong
HK_FLOW_ITEMS = {
    "revenue": ["营业额", "经营收入总额", "营运收入"], "grossProfit": ["毛利"], "operatingIncome": ["经营溢利"],
    "pretaxIncome": ["除税前溢利"], "taxProvision": ["税项"], "netIncome": ["股东应占溢利"], "interestExpense": ["融资成本"],
    "dilutedEps": ["每股摊薄盈利", "每股基本盈利"], "basicEps": ["每股基本盈利"],
    "operatingCashFlow": ["经营业务现金净额"], "da": ["加:折旧及摊销", "折旧摊销"], "dividendsPaid": ["已付股息(融资)"],
    "buyback": ["回购股份"], "_capexFixed": ["购建固定资产"], "_capexIntangible": ["购建无形资产及其他资产"],
}
HK_BAL_ITEMS = {
    "totalAssets": ["总资产"], "currentAssets": ["流动资产合计"], "currentLiabilities": ["流动负债合计"], "totalLiabilities": ["总负债"],
    "equity": ["股东权益", "归属于母公司股东权益"], "minorityInterest": ["少数股东权益", "非控股股东权益"], "retainedEarnings": ["保留溢利(累计亏损)"],
}
HK_DEBT_ITEMS = ["短期贷款", "长期贷款", "应付票据(非流动)", "融资租赁负债(流动)", "融资租赁负债(非流动)", "可换股票据及债券", "已发行债券"]
HK_CASH_ITEMS = ["现金及等价物", "短期存款", "中长期存款"]


def _pick(items: dict, names: list[str]):
    for n in names:
        if items.get(n) is not None:
            return items[n]
    return None


def fetch_hk(symbol: str) -> dict:
    code5 = symbol.upper().split(".")[0].zfill(5)
    secu = f"{code5}.HK"
    summary = em_report("RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY", f'(SECUCODE="{secu}")',
                        columns="SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,START_DATE,REPORT_DATE,FISCAL_YEAR,CURRENCY,ACCOUNT_STANDARD,REPORT_TYPE",
                        page_size=1, sort_cols="", sort_types="", source="F10")
    reports = summary[0].get("REPORT_LIST") or []
    if not reports:
        raise RuntimeError("东方财富港股报告列表为空")
    # NOTE: Eastmoney's HK statement tables are converted into RMB for every company (verified 2026-10-14:
    # HKEX 2024 profit HK$13.05bn appears as 12.08bn; HSBC's USD figures also appear in RMB), whatever the
    # reporting currency listed in REPORT_LIST. EPS is converted too, so profit / EPS still gives the share count.
    reports = [{"date": r["REPORT_DATE"][:10], "type": r.get("REPORT_TYPE"), "currency": "CNY",
                "reported": CURRENCY_CN.get(r.get("CURRENCY"), r.get("CURRENCY"))} for r in reports if r.get("REPORT_DATE")]
    reports.sort(key=lambda r: r["date"], reverse=True)
    annual_dates = [r["date"] for r in reports if r["type"] == "年报"][:5]
    latest = reports[0]
    wanted = set(annual_dates) | {latest["date"]}
    if latest["type"] != "年报":
        prior = next((r for r in reports if r["type"] == latest["type"] and r["date"][:4] == str(int(latest["date"][:4]) - 1)), None)
        if prior:
            wanted.add(prior["date"])
    date_list = ",".join(f"'{d}'" for d in sorted(wanted))
    items_by_date: dict[str, dict] = {d: {} for d in wanted}
    for rep in ("RPT_HKF10_FN_INCOME_PC", "RPT_HKF10_FN_BALANCE_PC", "RPT_HKF10_FN_CASHFLOW_PC"):
        rows = em_report(rep, f'(SECUCODE="{secu}")(REPORT_DATE in ({date_list}))',
                         columns="SECUCODE,REPORT_DATE,STD_ITEM_CODE,STD_ITEM_NAME,AMOUNT", page_size=2000,
                         sort_cols="REPORT_DATE,STD_ITEM_CODE", sort_types="-1,1", source="F10")
        for r in rows:
            d = (r.get("REPORT_DATE") or "")[:10]
            if d in items_by_date and r.get("STD_ITEM_NAME"):
                items_by_date[d].setdefault(r["STD_ITEM_NAME"], _num(r.get("AMOUNT")))
    try:
        profile = em_report("RPT_HKF10_INFO_ORGPROFILE", f'(SECUCODE="{secu}")', page_size=1, sort_cols="", sort_types="", source="F10")[0]
    except Exception:  # noqa: BLE001
        profile = {}
    periods = []
    for r in reports:
        if r["date"] not in wanted:
            continue
        it = items_by_date.get(r["date"]) or {}
        if not it:
            continue
        flows = {k: _pick(it, v) for k, v in HK_FLOW_ITEMS.items()}
        capex = _sum(flows.pop("_capexFixed"), flows.pop("_capexIntangible"))
        flows["capex"] = _neg(capex)
        ocf = flows.get("operatingCashFlow")
        flows["freeCashFlow"] = (ocf - capex) if ocf is not None and capex is not None else None
        flows["dividendsPaid"] = _neg(flows.get("dividendsPaid"))
        flows["buyback"] = _neg(flows.get("buyback"))
        flows["ebit"] = _first(flows.get("operatingIncome"), (flows["pretaxIncome"] + (flows.get("interestExpense") or 0)) if flows.get("pretaxIncome") is not None else None)
        flows["ebitda"] = (flows["ebit"] + flows["da"]) if flows.get("ebit") is not None and flows.get("da") is not None else None
        basic = flows.pop("basicEps")
        bal = {k: _pick(it, v) for k, v in HK_BAL_ITEMS.items()}
        bal["totalDebt"] = _sum(*(it.get(n) for n in HK_DEBT_ITEMS)) or 0.0
        bal["longTermDebt"] = _sum(it.get("长期贷款"), it.get("应付票据(非流动)"), it.get("融资租赁负债(非流动)")) or 0.0
        bal["cash"] = _sum(*(it.get(n) for n in HK_CASH_ITEMS)) or _first(it.get("库存现金及短期资金")) or 0.0
        if bal.get("currentAssets") is not None and bal.get("currentLiabilities") is not None:
            bal["workingCapital"] = bal["currentAssets"] - bal["currentLiabilities"]
        # implied share count = profit / EPS (works for every share class structure)
        bal["sharesOutstanding"] = flows["netIncome"] / basic if flows.get("netIncome") and basic else None
        periods.append({"date": r["date"], "type": r["type"], "currency": r["currency"], "flows": flows, "balance": bal})
    if not periods:
        raise RuntimeError("东方财富港股报表为空")
    periods.sort(key=lambda p: p["date"], reverse=True)
    annual = [dict(p["flows"], **p["balance"], date=p["date"]) for p in reversed(periods) if p["type"] == "年报"]
    latest_bal = dict(periods[0]["balance"], date=periods[0]["date"])
    quote_ = em_quote(symbol)
    shares = _first(next((p["balance"]["sharesOutstanding"] for p in periods if p["balance"].get("sharesOutstanding")), None), quote_.get("totalShares"))
    industry_text = f"{profile.get('BELONG_INDUSTRY') or ''} {profile.get('INDUSTRY_TYPE') or ''}"
    sector, industry = "", profile.get("BELONG_INDUSTRY") or ""
    if "银行" in industry_text:
        sector, industry = "Financial Services", "Banks"
    elif "保险" in industry_text:
        sector, industry = "Financial Services", "Insurance"
    elif "房地产投资信托" in industry_text or "REIT" in industry_text.upper():
        sector, industry = "Real Estate", "REIT"
    elif re.search(r"证券|金融|投资", industry_text):
        sector, industry = "Financial Services", "Capital Markets"
    fin_ccy = "CNY"
    reported = next((r.get("reported") for r in reports if r["date"] == periods[0]["date"]), None)
    reg = profile.get("REG_PLACE") or ""
    country = "China" if reported == "CNY" else "United Kingdom" if "英国" in reg else "Hong Kong"
    return assemble(
        symbol, provider=f"东方财富 港股F10（{reported or '?'} 报表，已折算人民币）", currency="HKD", financial_currency=fin_ccy, price=quote_.get("price"), shares=shares,
        name=profile.get("ORG_EN_ABBR") or profile.get("SECURITY_NAME_ABBR") or quote_.get("name"), sector=sector, industry=industry,
        country=country, annual=annual, ttm=_ttm(periods), latest_balance=latest_bal,
    )


# ------------------------------------------------------------------------------------------- SEC EDGAR
_SEC_LOCK = threading.Lock()
_SEC_TICKERS: dict = {"t": 0, "map": {}}
ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"}
GAAP = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense"],
    "grossProfit": ["GrossProfit"], "operatingIncome": ["OperatingIncomeLoss"],
    "pretaxIncome": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
    "taxProvision": ["IncomeTaxExpenseBenefit"], "netIncome": ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"],
    "interestExpense": ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
    "dilutedEps": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"],
    "dilutedShares": ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
    "operatingCashFlow": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "dividendsPaid": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], "buyback": ["PaymentsForRepurchaseOfCommonStock"],
    "sbc": ["ShareBasedCompensation"], "da": ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization", "Depreciation"],
    "dps": ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
    # instants
    "totalAssets": ["Assets"], "currentAssets": ["AssetsCurrent"], "currentLiabilities": ["LiabilitiesCurrent"], "totalLiabilities": ["Liabilities"],
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "minorityInterest": ["MinorityInterest"],
    "retainedEarnings": ["RetainedEarningsAccumulatedDeficit"], "_liabEq": ["LiabilitiesAndStockholdersEquity"],
    "_cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "_sti": ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "_ltdTotal": ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"],
    "_ltdNon": ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"], "_ltdCur": ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
    "_cp": ["CommercialPaper"], "_stb": ["ShortTermBorrowings", "OtherShortTermBorrowings"],
    "_shares": ["CommonStockSharesOutstanding"],
}
IFRS = {
    "revenue": ["Revenue", "RevenueFromContractsWithCustomers"], "grossProfit": ["GrossProfit"], "operatingIncome": ["ProfitLossFromOperatingActivities"],
    "pretaxIncome": ["ProfitLossBeforeTax"], "taxProvision": ["IncomeTaxExpenseContinuingOperations"],
    "netIncome": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"], "interestExpense": ["FinanceCosts", "InterestExpense"],
    "dilutedEps": ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"], "dilutedShares": ["AdjustedWeightedAverageShares", "WeightedAverageShares"],
    "operatingCashFlow": ["CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "PurchaseOfPropertyPlantAndEquipment"],
    "dividendsPaid": ["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"], "buyback": ["PaymentsToAcquireOrRedeemEntitysShares"],
    "da": ["DepreciationAndAmortisationExpense", "DepreciationExpense"],
    "totalAssets": ["Assets"], "currentAssets": ["CurrentAssets"], "currentLiabilities": ["CurrentLiabilities"], "totalLiabilities": ["Liabilities"],
    "equity": ["EquityAttributableToOwnersOfParent", "Equity"], "minorityInterest": ["NoncontrollingInterests"], "retainedEarnings": ["RetainedEarnings"],
    "_cash": ["CashAndCashEquivalents"], "_sti": ["CurrentInvestments", "ShorttermDepositsNotClassifiedAsCashEquivalents"],
    "_ltdTotal": ["Borrowings"], "_ltdNon": ["LongtermBorrowings", "NoncurrentPortionOfNoncurrentBondsIssued"], "_ltdCur": ["ShorttermBorrowings", "CurrentPortionOfLongtermBorrowings"],
}
FLOW_KEYS = ["revenue", "grossProfit", "operatingIncome", "pretaxIncome", "taxProvision", "netIncome", "interestExpense", "dilutedEps", "dilutedShares",
             "operatingCashFlow", "capex", "dividendsPaid", "buyback", "sbc", "da", "dps"]
INSTANT_KEYS = ["totalAssets", "currentAssets", "currentLiabilities", "totalLiabilities", "equity", "minorityInterest", "retainedEarnings",
                "_liabEq", "_cash", "_sti", "_ltdTotal", "_ltdNon", "_ltdCur", "_cp", "_stb", "_shares"]


def sec_get(url: str):
    return http_json(url, headers={"User-Agent": SEC_UA, "Accept-Encoding": "identity"}, timeout=25)


def sec_cik(ticker: str) -> tuple[int, str]:
    t = ticker.upper().replace(".", "-")
    with _SEC_LOCK:
        if time.time() - _SEC_TICKERS["t"] > 86400 or not _SEC_TICKERS["map"]:
            data = cache_get("_sec_company_tickers") or sec_get("https://www.sec.gov/files/company_tickers.json")
            cache_put("_sec_company_tickers", data)
            _SEC_TICKERS["map"] = {row["ticker"].upper(): (int(row["cik_str"]), row.get("title", "")) for row in data.values()}
            _SEC_TICKERS["t"] = time.time()
    hit = _SEC_TICKERS["map"].get(t) or _SEC_TICKERS["map"].get(t.replace("-", ""))
    if not hit:
        raise RuntimeError(f"SEC 没有 {ticker} 的申报（可能不是美国上市公司）")
    return hit


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _unit_entries(concept: dict, kind: str, currency: str):
    units = concept.get("units") or {}
    if kind == "shares":
        return units.get("shares") or []
    if kind == "pershare":
        return units.get(f"{currency}/shares") or []
    return units.get(currency) or []


def _unit_currency(concept: dict):
    """Reporting currency. Foreign filers often add USD 'convenience translations' next to their own currency
    (e.g. TSMC: TWD and USD), so a non-USD currency wins when both are present."""
    ccys = [k for k in (concept.get("units") or {}) if re.fullmatch(r"[A-Z]{3}", k)]
    non_usd = [c for c in ccys if c != "USD"]
    return non_usd[0] if non_usd else (ccys[0] if ccys else None)


def _kind(key: str) -> str:
    return "shares" if key in ("dilutedShares", "_shares") else "pershare" if key in ("dilutedEps", "dps") else "money"


def _series(facts: dict, tax: str, names: list[str], kind: str, currency: str):
    """Union of candidate concepts; for each (start,end) the first candidate in priority order wins, latest filing wins."""
    out: dict[tuple, dict] = {}
    for name in names:
        concept = (facts.get(tax) or {}).get(name)
        if not concept:
            continue
        seen: dict[tuple, dict] = {}
        for e in _unit_entries(concept, kind, currency):
            if e.get("val") is None or not e.get("end"):
                continue
            key = (e.get("start"), e["end"])
            if key not in seen or (e.get("filed") or "") > (seen[key].get("filed") or ""):
                seen[key] = e
        for key, e in seen.items():
            out.setdefault(key, e)
    return out


def fetch_sec(symbol: str) -> dict:
    cik, title = sec_cik(symbol)
    cik10 = f"{cik:010d}"
    facts_doc = cache_get(f"_sec_facts_{cik10}")
    if not facts_doc:
        facts_doc = sec_get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik10}.json")
        cache_put(f"_sec_facts_{cik10}", facts_doc)
    facts = facts_doc.get("facts") or {}
    try:
        subs = cache_get(f"_sec_subs_{cik10}") or sec_get(f"https://data.sec.gov/submissions/CIK{cik10}.json")
        cache_put(f"_sec_subs_{cik10}", {k: subs.get(k) for k in ("name", "sic", "sicDescription", "addresses", "fiscalYearEnd")})
    except Exception:  # noqa: BLE001
        subs = {}
    tax = "us-gaap" if len(facts.get("us-gaap") or {}) >= len(facts.get("ifrs-full") or {}) else "ifrs-full"
    concept_map = GAAP if tax == "us-gaap" else IFRS
    currency = None
    for n in concept_map["revenue"] + concept_map["netIncome"]:
        c = (facts.get(tax) or {}).get(n)
        if c:
            currency = _unit_currency(c)
            break
    currency = currency or "USD"
    series = {k: _series(facts, tax, concept_map.get(k, []), _kind(k), currency) for k in FLOW_KEYS + INSTANT_KEYS if concept_map.get(k)}

    # fiscal-year periods from annual net income / revenue
    fy_ends = sorted({k[1] for name in ("netIncome", "revenue") for k, e in series.get(name, {}).items()
                      if k[0] and e.get("form") in ANNUAL_FORMS and 330 <= _days(k[0], k[1]) <= 400})
    if not fy_ends:
        raise RuntimeError("SEC 申报中没有年度财务数据")
    fy_ends = fy_ends[-6:]

    def flow_at(key, end, lo=330, hi=400, forms=None):
        best = None
        for (s, e), ent in series.get(key, {}).items():
            if s and e == end and lo <= _days(s, e) <= hi and (forms is None or ent.get("form") in forms):
                if best is None or (ent.get("filed") or "") > (best.get("filed") or ""):
                    best = ent
        return _num(best["val"]) if best else None

    def instant_at(key, end, tol=7):
        best, gap = None, None
        for (s, e), ent in series.get(key, {}).items():
            if s is None:
                g = abs(_days(e, end))
                if g <= tol and (gap is None or g < gap):
                    best, gap = ent, g
        return _num(best["val"]) if best else None

    def latest_instant(key):
        ents = [ent for (s, e), ent in series.get(key, {}).items() if s is None]
        return max(ents, key=lambda x: (x["end"], x.get("filed") or "")) if ents else None

    def balance(at=None):
        get = (lambda k: instant_at(k, at)) if at else (lambda k: _num((latest_instant(k) or {}).get("val")))
        b = {k: get(k) for k in ("totalAssets", "currentAssets", "currentLiabilities", "totalLiabilities", "equity", "minorityInterest", "retainedEarnings")}
        if b["totalLiabilities"] is None and get("_liabEq") is not None and b["equity"] is not None:
            b["totalLiabilities"] = get("_liabEq") - b["equity"] - (b["minorityInterest"] or 0)
        ltd_total = get("_ltdTotal")
        ltd_non, ltd_cur = get("_ltdNon"), get("_ltdCur")
        ltd = ltd_total if ltd_total is not None else _sum(ltd_non, ltd_cur)
        b["totalDebt"] = _sum(ltd, get("_cp"), get("_stb")) or 0.0
        b["longTermDebt"] = _first(ltd_non, ltd) or 0.0
        b["cash"] = _sum(get("_cash"), get("_sti")) or 0.0
        b["minorityInterest"] = b["minorityInterest"] or 0.0
        if b["currentAssets"] is not None and b["currentLiabilities"] is not None:
            b["workingCapital"] = b["currentAssets"] - b["currentLiabilities"]
        b["sharesOutstanding"] = get("_shares")
        return b

    annual = []
    for end in fy_ends:
        row = {"date": end}
        for k in FLOW_KEYS:
            row[k] = flow_at(k, end)
        row.update(balance(end))
        annual.append(row)
    for row in annual:
        _finish_flows(row)

    # TTM = last FY + current YTD - prior-year YTD (10-Q filers)
    last_fy = fy_ends[-1]
    ytd = None
    for (s, e), ent in series.get("netIncome", {}).items():
        if s and e > last_fy and ent.get("form") in ("10-Q", "10-Q/A") and 80 <= _days(s, e) <= 290:
            if ytd is None or e > ytd[1] or (e == ytd[1] and _days(s, e) > _days(*ytd)):
                ytd = (s, e)
    ttm = {k: annual[-1].get(k) for k in FLOW_KEYS}
    ttm["date"] = last_fy
    if ytd:
        dur = _days(*ytd)
        prev_end = (date.fromisoformat(ytd[1]).replace(year=date.fromisoformat(ytd[1]).year - 1)).isoformat()

        def ytd_val(key, end, d):
            for (s, e), ent in series.get(key, {}).items():
                if s and abs(_days(e, end)) <= 10 and abs(_days(s, e) - d) <= 15:
                    return _num(ent["val"])
            return None
        for k in FLOW_KEYS:
            if k in ("dilutedEps", "dps", "dilutedShares"):
                continue
            cur, prev, fy = ytd_val(k, ytd[1], dur), ytd_val(k, prev_end, dur), annual[-1].get(k)
            ttm[k] = (fy + cur - prev) if None not in (cur, prev, fy) else fy
        ttm["dilutedEps"] = None
        ttm["date"] = ytd[1]
    _finish_flows(ttm)
    latest_bal = balance(None)
    # share count: cover-page shares (summed over classes in the latest filing), else latest diluted weighted average
    dei = ((facts.get("dei") or {}).get("EntityCommonStockSharesOutstanding") or {}).get("units", {}).get("shares") or []
    shares = None
    if dei:
        last_accn = max(dei, key=lambda x: (x.get("filed") or "", x["end"]))["accn"]
        shares = sum(_num(x["val"]) or 0 for x in dei if x.get("accn") == last_accn) or None
    diluted = [ent for (s, e), ent in series.get("dilutedShares", {}).items() if s and 80 <= _days(s, e) <= 100]
    diluted_latest = _num(max(diluted, key=lambda x: x["end"])["val"]) if diluted else annual[-1].get("dilutedShares")
    if not shares or (diluted_latest and not 0.8 <= shares / diluted_latest <= 1.25):
        shares = _first(diluted_latest, latest_bal.get("sharesOutstanding"), shares)
    latest_bal["sharesOutstanding"] = shares
    sic = int(subs.get("sic") or 0) if str(subs.get("sic") or "").isdigit() else 0
    sector, industry = "", subs.get("sicDescription") or ""
    if sic == 6798:
        sector, industry = "Real Estate", "REIT"
    elif 6000 <= sic < 6300 or 6700 <= sic < 6800:
        sector, industry = "Financial Services", ("Banks" if 6020 <= sic < 6040 else "Capital Markets")
    elif 6300 <= sic < 6500:
        sector, industry = "Financial Services", "Insurance"
    addr = ((subs.get("addresses") or {}).get("business") or {})
    place = (addr.get("country") or addr.get("stateOrCountryDescription") or "").upper() if addr.get("isForeignLocation") else ""
    country = "United States" if not place else (
        "Taiwan" if "TAIWAN" in place else "Hong Kong" if "HONG KONG" in place else "China" if "CHINA" in place else
        "Japan" if "JAPAN" in place else "South Korea" if "KOREA" in place else place.title())
    quote_ = em_quote(symbol)
    # ADRs: SEC counts ordinary shares while the US price is per ADS (TSMC: 1 ADS = 5 shares). Eastmoney's share
    # count is in listed-unit terms, so rescale every per-share series to that unit when the two differ.
    em_shares = quote_.get("totalShares")
    if em_shares and shares and not 0.8 <= shares / em_shares <= 1.25:
        ratio = shares / em_shares
        for row in annual + [ttm]:
            for k in ("sharesOutstanding", "dilutedShares"):
                if isinstance(row.get(k), (int, float)):
                    row[k] = row[k] / ratio
            for k in ("dilutedEps", "dps"):
                if isinstance(row.get(k), (int, float)):
                    row[k] = row[k] * ratio
        shares = em_shares
        latest_bal["sharesOutstanding"] = shares
    elif em_shares and not shares:
        shares = latest_bal["sharesOutstanding"] = em_shares
    return assemble(
        symbol, provider=f"SEC EDGAR ({'US-GAAP' if tax == 'us-gaap' else 'IFRS'})", currency="USD", financial_currency=currency,
        price=quote_.get("price"), shares=shares, name=subs.get("name") or title, sector=sector, industry=industry, country=country,
        annual=annual, ttm=ttm, latest_balance=dict(latest_bal, date=(latest_instant("totalAssets") or {}).get("end")),
    )


def _finish_flows(row: dict) -> None:
    capex = row.get("capex")
    if capex is not None:
        row["capex"] = -abs(capex)
    for k in ("dividendsPaid", "buyback"):
        if row.get(k) is not None:
            row[k] = -abs(row[k])
    ocf = row.get("operatingCashFlow")
    row["freeCashFlow"] = (ocf - abs(capex)) if ocf is not None and capex is not None else row.get("freeCashFlow")
    op = row.get("operatingIncome")
    if op is None and row.get("pretaxIncome") is not None:
        op = row["pretaxIncome"] + abs(row.get("interestExpense") or 0)
    row["ebit"] = op
    row["ebitda"] = (op + row["da"]) if op is not None and row.get("da") is not None else None


# ------------------------------------------------------------------------------------------- assemble
def assemble(symbol, *, provider, currency, financial_currency, price, shares, name, sector, industry, country,
             annual, ttm, latest_balance, extra_stats=None, fx=None) -> dict:
    """Builds the /api/fundamentals payload and derives the multiples the valuation engine needs."""
    if fx is None:
        fx = 1.0
        if financial_currency != currency:
            from server import fetch_fx  # late import avoids a circular import at module load
            fx = fetch_fx(financial_currency, currency) or em_fx(financial_currency, currency)
    if not fx:
        raise RuntimeError(f"无法获取 {financial_currency}/{currency} 汇率")
    if price is None:
        from server import YAHOO
        try:
            chart = YAHOO.get_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?range=5d&interval=1d")
            closes = [c for c in chart["chart"]["result"][0]["indicators"]["quote"][0]["close"] if c]
            price = float(closes[-1]) if closes else None
        except Exception:  # noqa: BLE001
            price = None
    last = annual[-1] if annual else {}
    t = {k: (ttm.get(k) if ttm.get(k) is not None else last.get(k)) for k in set(ttm) | set(last)}
    bal = latest_balance or last
    mcap = price * shares if price and shares else None
    stats = {"sharesOutstanding": shares}
    if mcap:
        ni, eq, rev, ebitda = t.get("netIncome"), bal.get("equity"), t.get("revenue"), t.get("ebitda")
        net_debt = ((bal.get("totalDebt") or 0) - (bal.get("cash") or 0) + (bal.get("minorityInterest") or 0)) * fx
        ev = mcap + net_debt
        divs = abs(t.get("dividendsPaid") or 0)
        stats.update({
            "trailingPE": mcap / (ni * fx) if ni and ni > 0 else None,
            "priceToBook": mcap / (eq * fx) if eq and eq > 0 else None,
            "priceToSales": mcap / (rev * fx) if rev and rev > 0 else None,
            "enterpriseValue": ev, "evToEbitda": ev / (ebitda * fx) if ebitda and ebitda > 0 else None,
            "evToRevenue": ev / (rev * fx) if rev and rev > 0 else None,
            "trailingEps": ni / shares if ni and shares else None,
            "bookValuePerShare": eq / shares if eq and shares else None,
            "dividendRate": divs * fx / shares if divs and shares else 0.0,
            "dividendYield": divs * fx / mcap if divs else 0.0,
            "payoutRatio": divs / ni if divs and ni and ni > 0 else None,
        })
    for k, v in (extra_stats or {}).items():
        if v is not None:
            stats[k] = v
    revs = [p.get("revenue") for p in annual if p.get("revenue")]
    stmt_end = (ttm or {}).get("date") or last.get("date")
    stale = bool(stmt_end) and (date.today() - date.fromisoformat(stmt_end[:10])).days > 470
    return {
        "symbol": symbol, "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currency": currency, "financialCurrency": financial_currency, "fxToPrice": fx, "price": price, "marketCap": mcap,
        "profile": {"name": name, "sector": sector, "industry": industry, "country": country, "quoteType": "EQUITY"},
        "stats": stats,
        "financial": {"totalCash": bal.get("cash"), "totalDebt": bal.get("totalDebt"), "revenue": t.get("revenue"),
                      "freeCashflow": t.get("freeCashFlow"), "operatingCashflow": t.get("operatingCashFlow"), "ebitda": t.get("ebitda"),
                      "revenueGrowth": (revs[-1] / revs[-2] - 1) if len(revs) >= 2 and revs[-2] else None},
        "analyst": {},  # free sources carry no consensus estimates; growth comes from history and ROE x retention
        "annual": annual, "ttm": t, "latestBalance": bal,
        "sources": {"provider": provider, "timeseries": bool(annual), "quoteSummary": False, "statementsAsOf": stmt_end, "stale": stale},
    }


PROVIDERS = {"CN": [("eastmoney", fetch_cn)], "HK": [("eastmoney", fetch_hk)], "US": [("sec", fetch_sec)], "OTHER": []}


def free_fundamentals(symbol: str) -> tuple[dict | None, list[str]]:
    """Try the free providers for this market. Returns (payload or None, errors)."""
    errors: list[str] = []
    key = f"fund_{symbol.upper()}"
    cached = cache_get(key)
    if cached:
        return cached, errors
    for name, fn in PROVIDERS[market_of(symbol)]:
        try:
            out = fn(symbol)
            cache_put(key, out)
            return out, errors
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {str(exc)[:160]}")
    return None, errors
