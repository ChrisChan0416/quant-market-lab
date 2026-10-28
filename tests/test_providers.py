"""Offline tests for fundamentals_providers: canned responses copied from live Eastmoney / SEC payloads (2026-10-14)."""
import json, sys, tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fundamentals_providers as fp

fp.DISK_CACHE = Path(tempfile.mkdtemp())  # never read/write the real cache in tests
CALLS = []

def em_rows(report, flt):
    if report == "RPT_F10_FINANCE_MAINFINADATA":
        return [{"SECUCODE": "600519.SH", "SECURITY_NAME_ABBR": "贵州茅台", "ORG_TYPE": "通用", "REPORT_DATE": d + " 00:00:00", "REPORT_TYPE": t, "TOTAL_SHARE": 1250081601, "CURRENCY": "CNY"}
                for d, t in [("2026-06-30", "中报"), ("2025-12-31", "年报"), ("2025-06-30", "中报"), ("2024-12-31", "年报"), ("2023-12-31", "年报")]]
    if report.startswith("RPT_F10_FINANCE_G"):
        kind = report[len("RPT_F10_FINANCE_G"):]
        base = {"INCOME": {"TOTAL_OPERATE_INCOME": 172054171890.91, "OPERATE_INCOME": 168838102514.79, "OPERATE_COST": 14892277570.91, "OPERATE_PROFIT": 114808950164.24,
                           "FE_INTEREST_EXPENSE": 28734948.29, "TOTAL_PROFIT": 114755261605.08, "INCOME_TAX": 29444936771.41, "PARENT_NETPROFIT": 82320067101.68, "DILUTED_EPS": 65.66},
                "CASHFLOW": {"NETCASH_OPERATE": 61522204989.35, "CONSTRUCT_LONG_ASSET": 3127594916.41, "ASSIGN_DIVIDEND_PORFIT": 67241733345.45, "FA_IR_DEPR": 1893338311.91, "IA_AMORTIZE": 289613682.99, "LPE_AMORTIZE": 20637734.49, "USERIGHT_ASSET_AMORTIZE": 55797324.89},
                "BALANCE": {"TOTAL_ASSETS": 303834844021.44, "TOTAL_CURRENT_ASSETS": 252518662398.57, "TOTAL_CURRENT_LIAB": 49610476817.81, "TOTAL_LIABILITIES": 49875590112.37,
                            "MONETARYFUNDS": 51690610946.5, "LEND_FUND": 99096188059.75, "LEASE_LIAB": 189504942.77, "NONCURRENT_LIAB_1YEAR": 44206237.05, "TOTAL_PARENT_EQUITY": 244637811032.18,
                            "MINORITY_EQUITY": 9321442876.89, "UNASSIGN_RPOFIT": 191905148832.21, "SURPLUS_RESERVE": 50543176610.94}}[kind]
        rows = []
        for d, t, scale in [("2026-06-30", "中报", 0.55), ("2025-12-31", "年报", 1.0), ("2025-06-30", "中报", 0.52), ("2024-12-31", "年报", 0.97), ("2023-12-31", "年报", 0.85)]:
            r = {k: (v * scale if kind != "BALANCE" and k != "DILUTED_EPS" else v) for k, v in base.items()}
            r.update({"REPORT_DATE": d + " 00:00:00", "REPORT_TYPE": t, "CURRENCY": "CNY"}); rows.append(r)
        return rows
    if report == "RPT_CUSTOM_HKSK_APPFN_CASHFLOW_SUMMARY":
        return [{"REPORT_LIST": [{"REPORT_DATE": d + " 00:00:00", "REPORT_TYPE": t, "CURRENCY": "人民币"} for d, t in
                 [("2026-06-30", "中报"), ("2026-03-31", "一季报"), ("2025-12-31", "年报"), ("2025-06-30", "中报"), ("2024-12-31", "年报"), ("2023-12-31", "年报")]]}]
    if report == "RPT_HKF10_INFO_ORGPROFILE":
        return [{"ORG_EN_ABBR": "Tencent Holdings Ltd", "BELONG_INDUSTRY": "软件服务", "REG_PLACE": "开曼群岛"}]
    if report.startswith("RPT_HKF10_FN_"):
        items = {"RPT_HKF10_FN_INCOME_PC": {"营业额": 743689e6, "毛利": 422593e6, "经营溢利": 241562e6, "融资成本": 15130e6, "除税前溢利": 277249e6, "税项": 47448e6, "股东应占溢利": 224842e6, "每股基本盈利": 24.749, "每股摊薄盈利": 24.153},
                 "RPT_HKF10_FN_BALANCE_PC": {"总资产": 2038986e6, "流动资产合计": 595460e6, "流动负债合计": 412751e6, "总负债": 797921e6, "短期贷款": 42618e6, "长期贷款": 208369e6, "应付票据(非流动)": 126204e6,
                                             "现金及等价物": 141041e6, "短期存款": 236801e6, "中长期存款": 70302e6, "少数股东权益": 86913e6, "股东权益": 1154152e6, "保留溢利(累计亏损)": 1010436e6},
                 "RPT_HKF10_FN_CASHFLOW_PC": {"经营业务现金净额": 303052e6, "购建固定资产": 87482e6, "购建无形资产及其他资产": 25393e6, "加:折旧及摊销": 66028e6, "已付股息(融资)": 39907e6, "回购股份": 78181e6}}[report]
        dates = [x.strip("'") for x in flt.split("in (")[1].rstrip("))").split(",")]
        out = []
        for d in dates:
            sc = 0.5 if d.endswith("06-30") else {"2025": 1.0, "2024": 0.88, "2023": 0.8}.get(d[:4], 1)
            for name, v in items.items():
                out.append({"REPORT_DATE": d + " 00:00:00", "STD_ITEM_NAME": name, "AMOUNT": v if report.endswith("BALANCE_PC") else v * sc})
        return out
    raise AssertionError(report)

def sec_facts():
    def flow(vals):  # list of (start, end, val, form, filed)
        return {"units": {"USD": [{"start": s, "end": e, "val": v, "form": f, "fy": 0, "fp": "FY", "filed": fl, "accn": "x"} for s, e, v, f, fl in vals]}}
    def inst(vals):
        return {"units": {"USD": [{"end": e, "val": v, "form": f, "filed": fl, "accn": "x"} for e, v, f, fl in vals]}}
    fys = [("2022-09-25", "2023-09-30"), ("2023-10-01", "2024-09-28"), ("2024-09-29", "2025-09-27")]
    rev = flow([(s, e, v, "10-K", e[:4] + "-11-01") for (s, e), v in zip(fys, [383.3e9, 391.0e9, 416.2e9])] + [("2025-09-28", "2026-06-27", 364.357e9, "10-Q", "2026-07-31"), ("2024-09-29", "2025-06-28", 313.7e9, "10-Q", "2025-08-01")])
    ni = flow([(s, e, v, "10-K", e[:4] + "-11-01") for (s, e), v in zip(fys, [97.0e9, 93.7e9, 112.0e9])] + [("2025-09-28", "2026-06-27", 101.464e9, "10-Q", "2026-07-31"), ("2024-09-29", "2025-06-28", 84.5e9, "10-Q", "2025-08-01")])
    # older concept that stops early (union logic must still pick Revenues for recent years)
    old_rev = flow([("2021-09-26", "2022-09-24", 394.3e9, "10-K", "2022-10-28")])
    ebit = flow([(s, e, v, "10-K", "x") for (s, e), v in zip(fys, [114.3e9, 123.2e9, 133.1e9])] + [("2025-09-28", "2026-06-27", 115e9, "10-Q", "z"), ("2024-09-29", "2025-06-28", 99e9, "10-Q", "z")])
    ocf = flow([(s, e, v, "10-K", "x") for (s, e), v in zip(fys, [110.5e9, 118.3e9, 111.5e9])])
    capex = flow([(s, e, v, "10-K", "x") for (s, e), v in zip(fys, [11.0e9, 9.4e9, 12.7e9])])
    buy = flow([(s, e, v, "10-K", "x") for (s, e), v in zip(fys, [77.6e9, 94.9e9, 90.7e9])])
    div = flow([(s, e, v, "10-K", "x") for (s, e), v in zip(fys, [15.0e9, 15.2e9, 15.4e9])])
    assets = inst([(e, v, "10-K", "x") for (_, e), v in zip(fys, [352.6e9, 365.0e9, 359.2e9])] + [("2026-06-27", 370e9, "10-Q", "y")])
    eq = inst([(e, v, "10-K", "x") for (_, e), v in zip(fys, [62.1e9, 56.95e9, 73.7e9])] + [("2026-06-27", 80e9, "10-Q", "y")])
    debt = inst([(e, v, "10-K", "x") for (_, e), v in zip(fys, [105e9, 96e9, 90e9])] + [("2026-06-27", 85e9, "10-Q", "y")])
    cash = inst([(e, v, "10-K", "x") for (_, e), v in zip(fys, [30e9, 29e9, 35e9])] + [("2026-06-27", 33e9, "10-Q", "y")])
    sti = inst([("2026-06-27", 20e9, "10-Q", "y")])
    shares = {"units": {"shares": [{"start": "2026-03-29", "end": "2026-06-27", "val": 14.75e9, "form": "10-Q", "filed": "y", "accn": "q"}]}}
    eps = {"units": {"USD/shares": [{"start": s, "end": e, "val": v, "form": "10-K", "filed": "x", "accn": "x"} for (s, e), v in zip(fys, [6.13, 6.08, 7.46])]}}
    return {"cik": 320193, "entityName": "Apple Inc.", "facts": {
        "dei": {"EntityCommonStockSharesOutstanding": {"units": {"shares": [{"end": "2026-07-17", "val": 14.70e9, "accn": "q", "filed": "2026-07-31"}]}}},
        "us-gaap": {"Revenues": rev, "RevenueFromContractWithCustomerExcludingAssessedTax": old_rev, "NetIncomeLoss": ni, "OperatingIncomeLoss": ebit,
                    "NetCashProvidedByUsedInOperatingActivities": ocf, "PaymentsToAcquirePropertyPlantAndEquipment": capex, "PaymentsForRepurchaseOfCommonStock": buy,
                    "PaymentsOfDividends": div, "Assets": assets, "StockholdersEquity": eq, "LongTermDebt": debt, "CashAndCashEquivalentsAtCarryingValue": cash,
                    "MarketableSecuritiesCurrent": sti, "WeightedAverageNumberOfDilutedSharesOutstanding": shares, "EarningsPerShareDiluted": eps}}}

def fake_http_json(url, headers=None, timeout=15, retries=1):
    CALLS.append(url)
    if "push2.eastmoney.com" in url:
        secid = parse_qs(urlparse(url).query)["secid"][0]
        if secid == "133.USDCNH": return {"data": {"f43": 6.6925}}
        if secid == "119.USDHKD": return {"data": {"f43": 7.8481}}
        table = {"1.600519": (1286.0, 1250081601.0), "116.00700": (423.8, 9092620581.0), "105.AAPL": None, "106.AAPL": (341.27, 14594180000.0)}
        v = table.get(secid)
        return {"data": None} if v is None else {"data": {"f43": v[0], "f58": "x", "f84": v[1], "f116": v[0] * v[1], "f164": 19.74, "f167": 6.4}}
    if "datacenter.eastmoney.com" in url:
        q = parse_qs(urlparse(url).query)
        return {"result": {"data": em_rows(q["reportName"][0], q["filter"][0])}, "success": True}
    if url.endswith("company_tickers.json"):
        assert "QuantScope" in headers["User-Agent"]
        return {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}}
    if "companyfacts" in url: return sec_facts()
    if "submissions" in url: return {"name": "Apple Inc.", "sic": "3571", "sicDescription": "Electronic Computers", "addresses": {"business": {"stateOrCountry": "CA"}}}
    raise AssertionError(url)

fp.http_json = fake_http_json
import server  # noqa: E402
server.fetch_fx = lambda a, b: None  # simulate Yahoo FX unavailable -> Eastmoney cross must be used

assert fp.market_of("600519.SS") == "CN" and fp.market_of("0700.HK") == "HK" and fp.market_of("AAPL") == "US" and fp.market_of("BRK-B") == "US" and fp.market_of("D05.SI") == "OTHER"

cn = fp.fetch_cn("600519.SS")
a = cn["annual"][-1]
assert cn["financialCurrency"] == "CNY" and cn["fxToPrice"] == 1.0 and cn["price"] == 1286.0
assert abs(a["ebit"] - (114808950164.24 + 28734948.29)) < 1
assert abs(a["grossProfit"] - (168838102514.79 - 14892277570.91)) < 1
assert abs(a["cash"] - (51690610946.5 + 99096188059.75)) < 1
assert abs(cn["ttm"]["netIncome"] - 82320067101.68 * (1 + 0.55 - 0.52)) < 10, cn["ttm"]["netIncome"]
assert cn["stats"]["trailingPE"] == 19.74 and cn["stats"]["evToEbitda"] > 0  # Eastmoney TTM P/E is kept
print("CN ok  ", cn["sources"]["provider"], "P/E", round(cn["stats"]["trailingPE"], 2), "P/B", cn["stats"]["priceToBook"], "TTM NI", round(cn["ttm"]["netIncome"] / 1e9, 1), "B")

hk = fp.fetch_hk("0700.HK")
assert hk["financialCurrency"] == "CNY" and hk["currency"] == "HKD"
assert abs(hk["fxToPrice"] - 7.8481 / 6.6925) < 1e-9, hk["fxToPrice"]
assert abs(hk["stats"]["sharesOutstanding"] - 224842e6 / 24.749) < 1
assert abs(hk["latestBalance"]["cash"] - (141041e6 + 236801e6 + 70302e6)) < 1
assert hk["annual"][-1]["capex"] == -(87482e6 + 25393e6)
assert hk["profile"]["country"] == "China"
print("HK ok  ", hk["sources"]["provider"], "fx", round(hk["fxToPrice"], 4), "P/E", round(hk["stats"]["trailingPE"], 2), "shares", round(hk["stats"]["sharesOutstanding"] / 1e9, 3), "B")

us = fp.fetch_sec("AAPL")
last = us["annual"][-1]
assert [p["date"] for p in us["annual"]] == ["2022-09-24", "2023-09-30", "2024-09-28", "2025-09-27"], [p["date"] for p in us["annual"]]
assert last["revenue"] == 416.2e9 and last["capex"] == -12.7e9 and last["buyback"] == -90.7e9
assert abs(us["ttm"]["revenue"] - (416.2e9 + 364.357e9 - 313.7e9)) < 1
assert us["latestBalance"]["cash"] == 53e9 and us["latestBalance"]["totalDebt"] == 85e9
assert us["price"] == 341.27 and us["stats"]["sharesOutstanding"] == 14.70e9
print("US ok  ", us["sources"]["provider"], "TTM rev", us["ttm"]["revenue"] / 1e9, "P/E", round(us["stats"]["trailingPE"], 2), "EV/EBITDA", us["stats"]["evToEbitda"])

json.dump({"cn": cn, "hk": hk, "us": us}, open(Path(fp.DISK_CACHE) / "out.json", "w"))
print("OUT", Path(fp.DISK_CACHE) / "out.json")
print("all provider tests passed")
