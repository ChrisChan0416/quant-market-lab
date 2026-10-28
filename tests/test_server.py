"""Checks the Yahoo -> normalised fundamentals mapping with canned responses (no network)."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

def ts_entry(date, value, ccy="CNY"):
    return {"asOfDate": date, "periodType": "12M", "currencyCode": ccy, "reportedValue": {"raw": value, "fmt": "x"}}

def fake_get_json(url, needs_crumb=False, timeout=12):
    if "quoteSummary" in url:
        assert needs_crumb
        return {"quoteSummary": {"result": [{
            "price": {"currency": "HKD", "regularMarketPrice": {"raw": 640.0}, "marketCap": {"raw": 5.856e12}, "longName": "Tencent Holdings Limited"},
            "summaryDetail": {"trailingPE": 25.1, "forwardPE": 21.0, "dividendRate": 4.5, "dividendYield": 0.007, "beta": 0.7},
            "defaultKeyStatistics": {"priceToBook": 4.8, "enterpriseToEbitda": 18.2, "enterpriseValue": 5.8e12, "sharesOutstanding": 9.15e9},
            "financialData": {"financialCurrency": "CNY", "targetMeanPrice": 720.0, "numberOfAnalystOpinions": 50, "totalDebt": 3.8e11},
            "assetProfile": {"sector": "Communication Services", "industry": "Internet Content & Information", "country": "China"},
            "earningsTrend": {"trend": [{"period": "+1y", "growth": {"raw": 0.12}, "revenueEstimate": {"growth": {"raw": 0.1}}}, {"period": "+5y", "growth": {"raw": 0.11}}]},
        }], "error": None}}
    if "fundamentals-timeseries" in url:
        types = url.split("&type=")[1].split("&")[0].split(",")
        result = []
        for t in types:
            if t == "annualTotalRevenue":
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}, "timestamp": [1, 2], t: [ts_entry("2023-12-31", 609e9), ts_entry("2024-12-31", 660e9)]})
            elif t == "annualOperatingRevenue":  # must NOT override TotalRevenue
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}, t: [ts_entry("2024-12-31", 1.0)]})
            elif t == "annualFreeCashFlow":
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}, t: [None, ts_entry("2024-12-31", 181.7e9)]})
            elif t == "trailingNetIncome":
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}, t: [ts_entry("2025-06-30", 215e9)]})
            elif t == "quarterlyTotalDebt":
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}, t: [ts_entry("2025-03-31", 370e9), ts_entry("2025-06-30", 380e9)]})
            else:
                result.append({"meta": {"symbol": ["0700.HK"], "type": [t]}})
        return {"timeseries": {"result": result, "error": None}}
    if "/v8/finance/chart/CNYHKD%3DX" in url:
        return {"chart": {"result": [{"indicators": {"quote": [{"close": [1.09, None, 1.093]}]}}]}}
    raise AssertionError("unexpected url " + url)

server.YAHOO.get_json = fake_get_json
out = server.build_fundamentals_yahoo("0700.HK")  # Yahoo path only; free providers are tested in test_providers.py
assert out["currency"] == "HKD" and out["financialCurrency"] == "CNY", out["currency"]
assert abs(out["fxToPrice"] - 1.093) < 1e-9
assert out["annual"][-1]["revenue"] == 660e9, out["annual"][-1]
assert out["annual"][-1]["freeCashFlow"] == 181.7e9
assert out["ttm"]["netIncome"] == 215e9
assert out["latestBalance"]["totalDebt"] == 380e9
assert out["stats"]["trailingPE"] == 25.1 and out["stats"]["evToEbitda"] == 18.2
assert out["analyst"]["epsGrowthLongTerm"] == 0.11 and out["analyst"]["revenueGrowthNextYear"] == 0.1
assert out["profile"]["country"] == "China"
assert out["sources"]["quoteSummary"] and out["sources"]["timeseries"]
print(json.dumps({k: out[k] for k in ("currency", "financialCurrency", "fxToPrice", "price", "marketCap")}))
print("annual periods:", [p["date"] for p in out["annual"]])
print("server normalisation tests passed")
