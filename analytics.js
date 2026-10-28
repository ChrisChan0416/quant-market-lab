/*
 * QuantScope analytics engine (v2.0)
 * ------------------------------------------------------------
 * Pure functions, no DOM access. Loaded in the browser as a classic script
 * (exposes window.QSAnalytics) and in Node for tests (module.exports).
 *
 * Contents
 *  1. Statistics helpers
 *  2. Date alignment / resampling
 *  3. Risk–return metrics (CAGR, Sharpe, Sortino, VaR/CVaR, Cornish–Fisher, drawdowns ...)
 *  4. CAPM regression vs. local benchmark (weekly, date-aligned)
 *  5. Distribution, monthly heat-map, variance-ratio test, EWMA volatility, price cone
 *  6. Technical factor engine (continuous factors in [-1, 1])
 *  7. Walk-forward signal evaluation (hit rate, IC, strategy vs buy & hold)
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- 1. statistics
  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const nums = (arr) => arr.filter(isNum).map(Number);
  const sum = (arr) => nums(arr).reduce((a, b) => a + b, 0);
  const mean = (arr) => { const v = nums(arr); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  function variance(arr, sample = true) {
    const v = nums(arr); if (v.length < 2) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - (sample ? 1 : 0));
  }
  const std = (arr, sample = true) => { const s = variance(arr, sample); return s === null ? null : Math.sqrt(s); };
  function quantile(arr, q) {
    const v = nums(arr).sort((a, b) => a - b); if (!v.length) return null;
    const pos = (v.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }
  const median = (arr) => quantile(arr, 0.5);
  function skewness(arr) {
    const v = nums(arr); const n = v.length; if (n < 3) return null;
    const m = mean(v); const s = std(v, false); if (!s) return 0;
    const g = v.reduce((a, b) => a + ((b - m) / s) ** 3, 0) / n;
    return Math.sqrt(n * (n - 1)) / (n - 2) * g; // adjusted Fisher–Pearson
  }
  function excessKurtosis(arr) {
    const v = nums(arr); const n = v.length; if (n < 4) return null;
    const m = mean(v); const s = std(v, false); if (!s) return 0;
    const g = v.reduce((a, b) => a + ((b - m) / s) ** 4, 0) / n - 3;
    return ((n + 1) * g + 6) * (n - 1) / ((n - 2) * (n - 3));
  }
  function normalPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
  function normalCdf(x) { // Abramowitz–Stegun 26.2.17, |error| < 7.5e-8
    const z = Math.abs(x); const t = 1 / (1 + 0.2316419 * z);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const upper = normalPdf(z) * poly; // P(Z > |x|)
    return x >= 0 ? 1 - upper : upper;
  }
  function normalInv(p) { // Acklam's rational approximation
    if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const pl = 0.02425; let q; let r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // two-sided p-value of a t statistic, normal approximation (fine for n > 30)
  const pValue = (t) => (isNum(t) ? 2 * (1 - normalCdf(Math.abs(t))) : null);
  function rank(arr) {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = Array(arr.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  }
  function correlation(x, y) {
    const n = Math.min(x.length, y.length); if (n < 3) return null;
    const mx = mean(x.slice(0, n)); const my = mean(y.slice(0, n)); let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i += 1) { const dx = x[i] - mx; const dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const spearman = (x, y) => correlation(rank(x), rank(y));
  function seededRandom(seed) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function gaussianFactory(rand) { let spare = null; return () => { if (spare !== null) { const v = spare; spare = null; return v; } let u = 0; let v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); const mag = Math.sqrt(-2 * Math.log(u)); spare = mag * Math.sin(2 * Math.PI * v); return mag * Math.cos(2 * Math.PI * v); }; }

  // ------------------------------------------------------------ 2. alignment / series
  const dateKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
  function simpleReturns(prices) { const out = []; for (let i = 1; i < prices.length; i += 1) out.push(prices[i - 1] ? prices[i] / prices[i - 1] - 1 : 0); return out; }
  function logReturns(prices) { const out = []; for (let i = 1; i < prices.length; i += 1) out.push(prices[i - 1] > 0 && prices[i] > 0 ? Math.log(prices[i] / prices[i - 1]) : 0); return out; }
  /** Align two price series on common calendar dates. */
  function alignByDate(tsA, valsA, tsB, valsB) {
    const mapB = new Map(); tsB.forEach((t, i) => { if (isNum(valsB[i])) mapB.set(dateKey(t), Number(valsB[i])); });
    const ts = []; const a = []; const b = [];
    tsA.forEach((t, i) => { const k = dateKey(t); if (mapB.has(k) && isNum(valsA[i])) { ts.push(t); a.push(Number(valsA[i])); b.push(mapB.get(k)); } });
    return { ts, a, b };
  }
  /** Forward-fill series B onto the calendar of A (used for the market-regime factor). */
  function forwardFillOnto(tsA, tsB, valsB) {
    const out = Array(tsA.length).fill(null); let j = 0; let last = null;
    for (let i = 0; i < tsA.length; i += 1) { while (j < tsB.length && tsB[j] <= tsA[i] + 6 * 3600) { if (isNum(valsB[j])) last = Number(valsB[j]); j += 1; } out[i] = last; }
    return out;
  }
  /** Resample daily closes to weekly (last close of each ISO week). */
  function weekly(ts, vals) {
    const out = { ts: [], vals: [] }; let lastKey = null;
    ts.forEach((t, i) => { const d = new Date(t * 1000); const day = (d.getUTCDay() + 6) % 7; const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)); const key = monday.toISOString().slice(0, 10); if (key === lastKey) { out.ts[out.ts.length - 1] = t; out.vals[out.vals.length - 1] = vals[i]; } else { out.ts.push(t); out.vals.push(vals[i]); lastKey = key; } });
    return out;
  }
  function sma(values, period) { const out = Array(values.length).fill(null); let s = 0; for (let i = 0; i < values.length; i += 1) { s += values[i]; if (i >= period) s -= values[i - period]; if (i >= period - 1) out[i] = s / period; } return out; }
  function ema(values, period) {
    const out = Array(values.length).fill(null); const first = values.findIndex(isNum); if (first < 0 || values.length - first < period) return out;
    let e = mean(values.slice(first, first + period)); out[first + period - 1] = e; const k = 2 / (period + 1);
    for (let i = first + period; i < values.length; i += 1) { e = (values[i] - e) * k + e; out[i] = e; }
    return out;
  }
  function rsi(values, period = 14) {
    const out = Array(values.length).fill(null); if (values.length <= period) return out; let g = 0; let l = 0;
    for (let i = 1; i <= period; i += 1) { const d = values[i] - values[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
    let ag = g / period; let al = l / period; out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < values.length; i += 1) { const d = values[i] - values[i - 1]; ag = (ag * (period - 1) + Math.max(d, 0)) / period; al = (al * (period - 1) + Math.max(-d, 0)) / period; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    return out;
  }
  function atr(highs, lows, closes, period = 14) {
    const tr = closes.map((c, i) => (i === 0 ? highs[i] - lows[i] : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))));
    const out = Array(closes.length).fill(null); if (closes.length < period) return out; let a = mean(tr.slice(0, period)); out[period - 1] = a;
    for (let i = period; i < closes.length; i += 1) { a = (a * (period - 1) + tr[i]) / period; out[i] = a; }
    return out;
  }
  function rollingStd(returns, window) { // returns[i] is the return INTO bar i+1; output aligned to price index
    const out = Array(returns.length + 1).fill(null); let s = 0; let s2 = 0;
    for (let i = 0; i < returns.length; i += 1) { s += returns[i]; s2 += returns[i] ** 2; if (i >= window) { s -= returns[i - window]; s2 -= returns[i - window] ** 2; } if (i >= window - 1) { const m = s / window; out[i + 1] = Math.sqrt(Math.max(0, (s2 - window * m * m) / (window - 1))); } }
    return out;
  }
  function rollingMax(values, window) { const out = Array(values.length).fill(null); for (let i = 0; i < values.length; i += 1) { let m = -Infinity; for (let j = Math.max(0, i - window + 1); j <= i; j += 1) m = Math.max(m, values[j]); out[i] = m; } return out; }

  // ------------------------------------------------------- 3. risk–return metrics
  function drawdownStats(prices, ts) {
    let peak = prices[0]; let peakIdx = 0; let maxDd = 0; let ddStart = 0; let ddTrough = 0; let longest = 0; let curStart = 0;
    const series = prices.map((p, i) => {
      if (p >= peak) { if (i - curStart > longest && peak > 0) longest = i - curStart; peak = p; peakIdx = i; curStart = i; }
      const dd = peak ? p / peak - 1 : 0; if (dd < maxDd) { maxDd = dd; ddStart = peakIdx; ddTrough = i; }
      return dd;
    });
    const ongoing = prices.length - 1 - curStart; longest = Math.max(longest, ongoing);
    let recovery = null; for (let i = ddTrough; i < prices.length; i += 1) { if (prices[i] >= prices[ddStart]) { recovery = i; break; } }
    return { series, maxDrawdown: maxDd, current: series.at(-1), peakDate: ts ? ts[ddStart] : null, troughDate: ts ? ts[ddTrough] : null, recoveryDate: recovery !== null && ts ? ts[recovery] : null, recoveryDays: recovery !== null ? recovery - ddTrough : null, longestUnderwaterDays: longest };
  }
  function ewmaVol(returns, lambda = 0.94) { // RiskMetrics daily EWMA, seeded with the first 30-day variance
    if (returns.length < 30) return null; let v = variance(returns.slice(0, 30)) || 0;
    for (let i = 30; i < returns.length; i += 1) v = lambda * v + (1 - lambda) * returns[i] ** 2;
    return Math.sqrt(v);
  }
  /**
   * Full risk–return profile from adjusted closes. rf = annual risk-free (decimal).
   */
  function riskMetrics(ts, prices, rf = 0, periodsPerYear = 252) {
    if (!prices || prices.length < 30) return null;
    const r = simpleReturns(prices); const lr = logReturns(prices); const n = r.length;
    const years = ts && ts.length > 1 ? (ts.at(-1) - ts[0]) / (365.25 * 86400) : n / periodsPerYear;
    const totalReturn = prices.at(-1) / prices[0] - 1; const cagr = years > 0 ? (prices.at(-1) / prices[0]) ** (1 / years) - 1 : null;
    const sd = std(r); const vol = sd * Math.sqrt(periodsPerYear); const rfD = rf / periodsPerYear;
    const excess = r.map((x) => x - rfD); const meanEx = mean(excess);
    const sharpe = sd ? (meanEx / sd) * Math.sqrt(periodsPerYear) : null;
    const sharpeSE = isNum(sharpe) ? Math.sqrt((1 + 0.5 * (sharpe / Math.sqrt(periodsPerYear)) ** 2) / n) * Math.sqrt(periodsPerYear) : null; // Lo (2002), iid
    const downside = Math.sqrt(mean(r.map((x) => Math.min(0, x - rfD) ** 2)));
    const sortino = downside ? (meanEx / downside) * Math.sqrt(periodsPerYear) : null;
    const dd = drawdownStats(prices, ts); const calmar = dd.maxDrawdown ? cagr / Math.abs(dd.maxDrawdown) : null;
    const sk = skewness(r); const ku = excessKurtosis(r);
    const z = normalInv(0.05); const zcf = z + (z * z - 1) * sk / 6 + (z ** 3 - 3 * z) * ku / 24 - (2 * z ** 3 - 5 * z) * sk * sk / 36;
    const var95 = -quantile(r, 0.05); const tail = r.filter((x) => x <= -var95); const cvar95 = tail.length ? -mean(tail) : null;
    const mu = mean(r); const paramVar95 = -(mu + z * sd); const cfVar95 = -(mu + zcf * sd);
    const jb = n / 6 * (sk ** 2 + ku ** 2 / 4); const jbP = Math.exp(-jb / 2); // chi-square(2) survival
    const ew = ewmaVol(r); const vol20 = std(r.slice(-20)); const rolling = rollingStd(r, 20).filter(isNum);
    const volPercentile = rolling.length > 60 && isNum(vol20) ? rolling.filter((v) => v <= vol20).length / rolling.length : null;
    return {
      n, years, totalReturn, cagr, vol, sharpe, sharpeSE, sortino, calmar, downsideVol: downside * Math.sqrt(periodsPerYear),
      maxDrawdown: dd.maxDrawdown, currentDrawdown: dd.current, drawdown: dd, var95, cvar95, paramVar95, cfVar95,
      skew: sk, kurtosis: ku, jarqueBera: jb, jbPValue: jbP, hitRate: r.filter((x) => x > 0).length / n,
      best: Math.max(...r), worst: Math.min(...r), autocorr1: correlation(r.slice(1), r.slice(0, -1)),
      ewmaVolAnnual: isNum(ew) ? ew * Math.sqrt(periodsPerYear) : null, vol20Annual: isNum(vol20) ? vol20 * Math.sqrt(periodsPerYear) : null,
      volPercentile, logReturns: lr, returns: r,
    };
  }
  /** Metrics for trailing windows (1Y/3Y/5Y). */
  function windowTable(ts, prices, rf) {
    const now = ts.at(-1); const out = [];
    [['1Y', 1], ['3Y', 3], ['5Y', 5]].forEach(([label, yrs]) => {
      const start = ts.findIndex((t) => t >= now - yrs * 365.25 * 86400 + 5 * 86400);
      if (start < 0 || (now - ts[start]) < yrs * 365.25 * 86400 * 0.92) { out.push({ label, available: false }); return; }
      const m = riskMetrics(ts.slice(start), prices.slice(start), rf); out.push({ label, available: true, cagr: m.cagr, vol: m.vol, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown, sortino: m.sortino });
    });
    return out;
  }

  // ----------------------------------------------------------- 4. CAPM regression
  function ols(y, x) {
    const n = Math.min(y.length, x.length); if (n < 10) return null;
    const mx = mean(x); const my = mean(y); let sxy = 0; let sxx = 0; let syy = 0;
    for (let i = 0; i < n; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    if (!sxx) return null; const beta = sxy / sxx; const alpha = my - beta * mx;
    const resid = y.map((v, i) => v - alpha - beta * x[i]); const sse = resid.reduce((a, b) => a + b * b, 0); const s2 = sse / (n - 2);
    const seBeta = Math.sqrt(s2 / sxx); const seAlpha = Math.sqrt(s2 * (1 / n + mx * mx / sxx));
    return { n, alpha, beta, seAlpha, seBeta, tAlpha: alpha / seAlpha, tBeta: beta / seBeta, r2: syy ? 1 - sse / syy : null, residStd: Math.sqrt(s2), resid };
  }
  /**
   * CAPM on weekly returns over the last `years` (default 2y), aligned by calendar date.
   * Weekly sampling reduces asynchronous-close bias between markets.
   */
  function capm(stockTs, stockPx, benchTs, benchPx, rf = 0, years = 2) {
    if (!stockTs?.length || !benchTs?.length) return null;
    const aligned = alignByDate(stockTs, stockPx, benchTs, benchPx); if (aligned.ts.length < 60) return null;
    const cut = aligned.ts.at(-1) - years * 365.25 * 86400; const start = Math.max(0, aligned.ts.findIndex((t) => t >= cut));
    const ws = weekly(aligned.ts.slice(start), aligned.a.slice(start)); const wb = weekly(aligned.ts.slice(start), aligned.b.slice(start));
    const rs = simpleReturns(ws.vals); const rb = simpleReturns(wb.vals); const rfW = rf / 52;
    const ys = rs.map((v) => v - rfW); const xs = rb.map((v) => v - rfW); const fit = ols(ys, xs); if (!fit) return null;
    const up = rb.map((v, i) => [v, rs[i]]).filter(([b]) => b > 0); const dn = rb.map((v, i) => [v, rs[i]]).filter(([b]) => b < 0);
    const capture = (pairs) => { const sb = mean(pairs.map((p) => p[0])); const ss = mean(pairs.map((p) => p[1])); return sb ? ss / sb : null; };
    const active = rs.map((v, i) => v - rb[i]); const te = std(active) * Math.sqrt(52);
    return {
      weeks: fit.n, beta: fit.beta, betaBlume: 0.67 * fit.beta + 0.33, betaSE: fit.seBeta, betaT: fit.tBeta,
      alphaAnnual: fit.alpha * 52, alphaT: fit.tAlpha, alphaP: pValue(fit.tAlpha), r2: fit.r2, correlation: correlation(rs, rb),
      idioVol: fit.residStd * Math.sqrt(52), trackingError: te, informationRatio: te ? (mean(active) * 52) / te : null,
      upCapture: capture(up), downCapture: capture(dn), benchReturns: rb, stockReturns: rs,
    };
  }

  // ------------------------------------------- 5. distribution, seasonality, tests
  function histogram(values, bins = 31, clip = 0.995) {
    const v = nums(values); if (v.length < 20) return null;
    const lo = quantile(v, 1 - clip); const hi = quantile(v, clip); const width = (hi - lo) / bins || 1e-6;
    // observations outside the [1-clip, clip] quantile range are left out of the picture (not piled into the end bins)
    const counts = Array(bins).fill(0); v.forEach((x) => { if (x < lo || x > hi) return; counts[clamp(Math.floor((x - lo) / width), 0, bins - 1)] += 1; });
    const m = mean(v); const s = std(v);
    const normal = counts.map((_, i) => { const a = lo + i * width; return v.length * (normalCdf((a + width - m) / s) - normalCdf((a - m) / s)); });
    return { lo, hi, width, counts, normal, mean: m, sd: s };
  }
  function monthlyReturns(ts, prices) {
    const lastByMonth = new Map(); ts.forEach((t, i) => { const d = new Date(t * 1000); lastByMonth.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, prices[i]); });
    const keys = [...lastByMonth.keys()]; const table = {}; const firstMonthKey = keys[0];
    keys.forEach((k, i) => { if (i === 0) return; const [y, m] = k.split('-').map(Number); table[y] = table[y] || {}; table[y][m] = lastByMonth.get(k) / lastByMonth.get(keys[i - 1]) - 1; });
    const years = Object.keys(table).map(Number).sort();
    const yearly = {}; years.forEach((y) => { yearly[y] = Object.values(table[y]).reduce((acc, r) => acc * (1 + r), 1) - 1; });
    const monthAvg = {}; for (let m = 1; m <= 12; m += 1) { const vals = years.map((y) => table[y][m]).filter(isNum); monthAvg[m] = vals.length ? { mean: mean(vals), hit: vals.filter((x) => x > 0).length / vals.length, n: vals.length } : null; }
    return { table, years, yearly, monthAvg, firstMonthKey };
  }
  /** Lo–MacKinlay variance ratio (homoskedastic z). VR>1 trending, VR<1 mean-reverting. */
  function varianceRatio(logRets, q) {
    const n = logRets.length; if (n < q * 10) return null; const mu = mean(logRets);
    const var1 = logRets.reduce((a, r) => a + (r - mu) ** 2, 0) / (n - 1);
    let varq = 0; for (let i = q - 1; i < n; i += 1) { let s = 0; for (let j = i - q + 1; j <= i; j += 1) s += logRets[j]; varq += (s - q * mu) ** 2; }
    const m = q * (n - q + 1) * (1 - q / n); varq /= m; const vr = varq / var1;
    const z = (vr - 1) / Math.sqrt((2 * (2 * q - 1) * (q - 1)) / (3 * q * n));
    return { q, vr, z, p: pValue(z) };
  }
  /** Lognormal price cone using an annualised volatility, zero drift (martingale). */
  function priceCone(price, annualVol, horizons = [[21, '1M'], [63, '3M'], [126, '6M']]) {
    if (!isNum(price) || !isNum(annualVol)) return [];
    return horizons.map(([days, label]) => {
      const s = annualVol * Math.sqrt(days / 252); const mu = -0.5 * s * s; const at = (z) => price * Math.exp(mu + z * s);
      return { label, days, sigma: s, p05: at(-1.645), p16: at(-1), p50: at(0), p84: at(1), p95: at(1.645) };
    });
  }

  // ----------------------------------------------- 6. technical factor engine
  const TECH_WEIGHTS = { trend: 0.25, momentum: 0.15, volume: 0.05, market: 0.15, risk: 0.10 };
  function interp(points, x) { if (x <= points[0][0]) return points[0][1]; for (let i = 1; i < points.length; i += 1) { if (x <= points[i][0]) { const [x0, y0] = points[i - 1]; const [x1, y1] = points[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } } return points.at(-1)[1]; }
  const RSI_MAP = [[0, 0.3], [20, 0.3], [30, -0.6], [45, -0.25], [50, 0], [60, 0.5], [70, 0.8], [75, 0.8], [85, -0.2], [100, -0.6]];
  /**
   * Computes every technical indicator once and returns per-bar factor values in [-1, 1].
   * data: { closes, highs, lows, volumes, adj } (adj = adjusted closes)
   * benchAligned: benchmark closes forward-filled onto the same calendar (or null)
   * opts.volBaseline: "normal" annual vol for the asset class (equity 0.30)
   */
  function technicalFactors(data, benchAligned, opts = {}) {
    const px = data.adj || data.closes; const n = px.length; const factor = data.closes.map((c, i) => (c ? px[i] / c : 1));
    const hi = data.highs.map((h, i) => h * factor[i]); const lo = data.lows.map((l, i) => l * factor[i]);
    const ret = simpleReturns(px); const sd20 = rollingStd(ret, 20); const sd60 = rollingStd(ret, 60);
    const ma20 = sma(px, 20); const ma60 = sma(px, 60); const ma200 = sma(px, 200); const rsi14 = rsi(px);
    const e12 = ema(px, 12); const e26 = ema(px, 26); const macd = px.map((_, i) => (isNum(e12[i]) && isNum(e26[i]) ? e12[i] - e26[i] : null));
    const sig = ema(macd, 9); const hist = macd.map((m, i) => (isNum(m) && isNum(sig[i]) ? m - sig[i] : null));
    const atr14 = atr(hi, lo, px); const vol = data.volumes || []; const hasVolume = vol.filter((v) => v > 0).length > n * 0.8;
    const max252 = rollingMax(px, 252); const baseline = opts.volBaseline || 0.30;
    const f = { trend: Array(n).fill(null), momentum: Array(n).fill(null), volume: Array(n).fill(null), market: Array(n).fill(null), risk: Array(n).fill(null) };
    for (let i = 0; i < n; i += 1) {
      const sd = sd60[i] || sd20[i]; if (!isNum(sd) || sd <= 0) continue; const p = px[i];
      const parts = []; const w = [];
      if (isNum(ma20[i])) { parts.push(Math.tanh((p / ma20[i] - 1) / (sd * Math.sqrt(20)) / 1.5)); w.push(0.3); }
      if (isNum(ma20[i]) && isNum(ma60[i])) { parts.push(Math.tanh((ma20[i] / ma60[i] - 1) / (sd * Math.sqrt(30)))); w.push(0.25); }
      if (i >= 252) { const mom = px[i - 21] / px[i - 252] - 1; parts.push(Math.tanh(mom / (sd * Math.sqrt(252)))); w.push(0.3); } else if (i >= 126) { const mom = px[i - 21] / px[i - 126] - 1; parts.push(Math.tanh(mom / (sd * Math.sqrt(126)))); w.push(0.2); }
      if (isNum(ma200[i])) { parts.push(Math.tanh((p / ma200[i] - 1) / (sd * Math.sqrt(100)))); w.push(0.15); }
      if (parts.length) f.trend[i] = parts.reduce((a, v, k) => a + v * w[k], 0) / w.reduce((a, b) => a + b, 0);
      const mParts = []; const mw = [];
      if (isNum(hist[i])) { mParts.push(Math.tanh(hist[i] / (p * sd))); mw.push(0.6); }
      if (isNum(rsi14[i])) { mParts.push(interp(RSI_MAP, rsi14[i])); mw.push(0.4); }
      if (mParts.length) f.momentum[i] = mParts.reduce((a, v, k) => a + v * mw[k], 0) / mw.reduce((a, b) => a + b, 0);
      if (hasVolume && i >= 20) { const avg = mean(vol.slice(i - 20, i)); if (avg > 0 && vol[i] > 0) { const ratio = vol[i] / avg; const r = ret[i - 1] || 0; const sign = r > 0 ? 1 : r < 0 ? -1 : 0; f.volume[i] = ratio >= 1 ? Math.tanh(Math.log(ratio) * 1.5) * sign : Math.tanh(Math.log(ratio) * 1.5) * -sign * 0.3; } }
      if (benchAligned && i >= 63 && isNum(benchAligned[i]) && isNum(benchAligned[i - 21]) && isNum(benchAligned[i - 63])) { const b21 = benchAligned[i] / benchAligned[i - 21] - 1; const b63 = benchAligned[i] / benchAligned[i - 63] - 1; f.market[i] = 0.5 * Math.tanh(b21 / 0.04) + 0.5 * Math.tanh(b63 / 0.08); }
      const annVol = sd * Math.sqrt(252); const dd = isNum(max252[i]) ? 1 - p / max252[i] : 0;
      f.risk[i] = 0.5 * Math.tanh((baseline - annVol) / (baseline * 0.5)) + 0.5 * Math.tanh((0.20 - dd) / 0.10);
    }
    return { factors: f, indicators: { ma20, ma60, ma200, rsi: rsi14, macd, macdSignal: sig, macdHist: hist, atr: atr14, sd20, sd60, ret, hasVolume } };
  }
  /** Weighted composite in [-10, 10]; factors that are null are excluded and the weights renormalised. */
  function compositeScore(values, weights) {
    let s = 0; let w = 0; Object.entries(weights).forEach(([k, wt]) => { if (isNum(values[k])) { s += values[k] * wt; w += wt; } });
    return w ? (s / w) * 10 : null;
  }

  // ------------------------------------------------ 7. walk-forward evaluation
  /**
   * Evaluates the technical score historically. Thresholds are fixed a priori (not optimised),
   * the decision at the close of day t is applied to the return from t to t+1 (no look-ahead).
   */
  function backtestSignals(ts, px, factorSet, opts = {}) {
    const h = opts.horizon || 20; const longThr = opts.longThreshold ?? 2.5; const shortThr = opts.shortThreshold ?? -2.5;
    const allowShort = !!opts.allowShort; const cost = opts.costBps ?? 10; const n = px.length; const warm = Math.min(252, Math.max(130, Math.floor(n * 0.25)));
    const scores = Array(n).fill(null);
    for (let i = 0; i < n; i += 1) { const v = {}; Object.keys(TECH_WEIGHTS).forEach((k) => { v[k] = factorSet[k][i]; }); scores[i] = compositeScore(v, TECH_WEIGHTS); }
    const buckets = { long: [], short: [], neutral: [] }; const pairs = [];
    for (let i = warm; i < n - h; i += 1) { if (!isNum(scores[i])) continue; const fwd = px[i + h] / px[i] - 1; const b = scores[i] >= longThr ? 'long' : scores[i] <= shortThr ? 'short' : 'neutral'; buckets[b].push(fwd); pairs.push([scores[i], fwd]); }
    const all = pairs.map((p) => p[1]);
    const summarize = (arr, dir) => { if (!arr.length) return { n: 0 }; const m = mean(arr); const s = std(arr) || 0; const nEff = Math.max(1, arr.length / h); const hits = arr.filter((x) => (dir === 'short' ? x < 0 : x > 0)).length; const hitRate = hits / arr.length; return { n: arr.length, nEff, mean: m, median: median(arr), hitRate, t: s ? m / (s / Math.sqrt(nEff)) : null, posterior: (hitRate * nEff + 5) / (nEff + 10) }; };
    const ic = pairs.length > 30 ? spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null; const icN = pairs.length / h;
    const icT = isNum(ic) && icN > 3 ? ic * Math.sqrt((icN - 2) / Math.max(1e-9, 1 - ic * ic)) : null;
    // strategy equity curve
    const equity = [1]; const hold = [1]; let pos = 0; let trades = 0; let exposure = 0; const daily = [];
    for (let i = warm; i < n - 1; i += 1) {
      const s = scores[i]; const target = !isNum(s) ? pos : s >= longThr ? 1 : (s <= shortThr ? (allowShort ? -1 : 0) : (Math.abs(s) < 0.5 ? 0 : pos));
      const turnover = Math.abs(target - pos); if (turnover) trades += 1; pos = target; if (pos) exposure += 1;
      const r = px[i + 1] / px[i] - 1; const net = pos * r - turnover * cost / 10000; daily.push(net);
      equity.push(equity.at(-1) * (1 + net)); hold.push(hold.at(-1) * (1 + r));
    }
    const yrs = (ts[n - 1] - ts[warm]) / (365.25 * 86400);
    const perf = (curve, rets) => ({ cagr: yrs > 0 ? curve.at(-1) ** (1 / yrs) - 1 : null, vol: std(rets) * Math.sqrt(252), sharpe: std(rets) ? mean(rets) / std(rets) * Math.sqrt(252) : null, maxDrawdown: drawdownStats(curve).maxDrawdown, total: curve.at(-1) - 1 });
    const holdRets = simpleReturns(hold);
    return {
      horizon: h, start: ts[warm], end: ts[n - 1], samples: pairs.length, thresholds: { longThr, shortThr }, scores,
      buckets: { long: summarize(buckets.long, 'long'), short: summarize(buckets.short, 'short'), neutral: summarize(buckets.neutral, 'neutral') },
      unconditional: summarize(all, 'long'), ic, icT, icP: pValue(icT),
      strategy: { ...perf(equity, daily), trades, exposure: exposure / Math.max(1, daily.length), curve: equity }, buyHold: { ...perf(hold, holdRets), curve: hold },
      equityTs: ts.slice(warm),
    };
  }

  const api = {
    isNum, clamp, mean, std, variance, quantile, median, skewness, excessKurtosis, normalPdf, normalCdf, normalInv, pValue, correlation, spearman, rank,
    seededRandom, gaussianFactory, dateKey, simpleReturns, logReturns, alignByDate, forwardFillOnto, weekly, sma, ema, rsi, atr, rollingStd,
    drawdownStats, ewmaVol, riskMetrics, windowTable, ols, capm, histogram, monthlyReturns, varianceRatio, priceCone,
    TECH_WEIGHTS, technicalFactors, compositeScore, backtestSignals, interp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QSAnalytics = api;
}(typeof window !== 'undefined' ? window : globalThis));
