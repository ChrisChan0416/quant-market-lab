/*
 * QuantScope valuation engine (v2.0)
 * ------------------------------------------------------------
 * Pure functions. Browser: window.QSValuation. Node: module.exports.
 *
 * All intrinsic models run in the company's FINANCIAL (reporting) currency with
 * that currency's risk-free rate, and the per-share result is converted to the
 * trading currency at the spot rate at the very end. This keeps discount rates
 * and cash flows in the same currency (e.g. Tencent: CNY cash flows, HKD quote).
 *
 * Models
 *  - Three-stage FCFF DCF using the value-driver identity FCFF = NOPAT × (1 − g / ROIC)
 *    (Koller, Goedhart & Wessels, "Valuation"), mid-year discounting
 *  - Reverse DCF: stage-1 growth implied by today's price
 *  - WACC × terminal-growth sensitivity grid, Monte Carlo DCF
 *  - Residual income (Edwards–Bell–Ohlson) with fading ROE and Ohlson persistence ω = 0.62
 *  - Two-stage dividend discount model
 *  - Relative valuation vs. the stock's own history and vs. peers (ratio method, currency-neutral)
 *  - Quality: Piotroski F-score, Altman Z''-score, ROIC − WACC spread, accruals, coverage
 */
(function (root) {
  'use strict';
  const A = (typeof module !== 'undefined' && module.exports) ? require('./analytics.js') : root.QSAnalytics;
  const { isNum, clamp, mean, median, std } = A;

  // Defaults, editable in the UI. Yields: 10Y government bonds around 26 Aug 2026 (Bloomberg via Kiwoom
  // research note; HK from Trading Economics 7 Aug 2026). ERP: Damodaran implied US ERP, Jan 2026 (4.23%).
  // USD is overwritten live by ^TNX when available.
  const CURRENCY_DEFAULTS = {
    USD: { rf: 0.0473, tax: 0.21 }, HKD: { rf: 0.0357, tax: 0.165 }, CNY: { rf: 0.0169, tax: 0.25 },
    SGD: { rf: 0.0232, tax: 0.17 }, JPY: { rf: 0.0287, tax: 0.30 }, KRW: { rf: 0.0435, tax: 0.24 },
    EUR: { rf: 0.028, tax: 0.25 }, GBP: { rf: 0.047, tax: 0.25 }, TWD: { rf: 0.017, tax: 0.20 },
  };
  // Approximate country risk premiums (Damodaran-style, rating based). Editable.
  const COUNTRY_CRP = { 'United States': 0, Singapore: 0, 'Hong Kong': 0.006, China: 0.010, Japan: 0.008, 'South Korea': 0.006, Taiwan: 0.006, Netherlands: 0, Germany: 0, 'United Kingdom': 0.005, Switzerland: 0, Ireland: 0.006, Canada: 0 };
  const MATURE_ERP = 0.0423;
  const OHLSON_OMEGA = 0.62;

  const pick = (...values) => values.find(isNum);
  const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : undefined);
  const seriesOf = (annual, key) => annual.map((p) => p[key]).filter(isNum);

  // ------------------------------------------------------------ input preparation
  function prepare(F, ctx = {}) {
    const annual = (F.annual || []).filter((p) => p && p.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const ttm = F.ttm || {}; const bal = F.latestBalance || {}; const fin = F.financial || {}; const st = F.stats || {};
    const lastA = last(annual) || {}; const prevA = annual.length > 1 ? annual[annual.length - 2] : {};
    const fx = isNum(F.fxToPrice) && F.fxToPrice > 0 ? F.fxToPrice : 1;
    const price = pick(ctx.price, F.price); const marketCap = pick(F.marketCap);
    const shares = pick(marketCap && price ? marketCap / price : null, st.sharesOutstanding, bal.sharesOutstanding, lastA.sharesOutstanding);
    const sector = F.profile?.sector || ''; const industry = F.profile?.industry || '';
    const isFinancial = /financial/i.test(sector) || /bank|insurance|capital markets|credit services|asset management/i.test(industry);
    const isREIT = /reit/i.test(industry) || /real estate/i.test(sector) && /reit|trust/i.test(F.profile?.name || '');
    const revenue = pick(ttm.revenue, lastA.revenue, fin.revenue);
    const ebit = pick(ttm.ebit, ttm.operatingIncome, lastA.ebit, lastA.operatingIncome);
    const netIncome = pick(ttm.netIncome, lastA.netIncome);
    const ocf = pick(ttm.operatingCashFlow, lastA.operatingCashFlow, fin.operatingCashflow);
    const capex = Math.abs(pick(ttm.capex, lastA.capex, 0));
    const fcf = pick(ttm.freeCashFlow, isNum(ocf) ? ocf - capex : null, lastA.freeCashFlow, fin.freeCashflow);
    const interest = Math.abs(pick(ttm.interestExpense, lastA.interestExpense, 0));
    const da = Math.abs(pick(ttm.da, lastA.da, 0));
    const ebitda = pick(ttm.ebitda, lastA.ebitda, fin.ebitda, isNum(ebit) ? ebit + da : null);
    const debt = pick(bal.totalDebt, lastA.totalDebt, fin.totalDebt, 0);
    const cash = pick(bal.cash, lastA.cash, fin.totalCash, 0);
    const minority = pick(bal.minorityInterest, lastA.minorityInterest, 0);
    const equityBV = pick(bal.equity, lastA.equity);
    const totalAssets = pick(bal.totalAssets, lastA.totalAssets);
    const taxRates = annual.map((p) => (isNum(p.taxProvision) && isNum(p.pretaxIncome) && p.pretaxIncome > 0 ? p.taxProvision / p.pretaxIncome : (isNum(p.taxRate) ? p.taxRate : null))).filter(isNum);
    const ccyDefaults = CURRENCY_DEFAULTS[(F.financialCurrency || F.currency || 'USD').toUpperCase()] || CURRENCY_DEFAULTS.USD;
    const taxRate = clamp(taxRates.length ? median(taxRates) : ccyDefaults.tax, 0.05, 0.35);
    const avgEquity = isNum(prevA.equity) && isNum(equityBV) ? (prevA.equity + equityBV) / 2 : equityBV;
    const roe = isNum(netIncome) && isNum(avgEquity) && avgEquity > 0 ? netIncome / avgEquity : pick(fin.returnOnEquity);
    let investedCapital = isNum(equityBV) ? equityBV + debt + minority - cash : null;
    if (!isNum(investedCapital) || investedCapital <= 0) investedCapital = pick(bal.investedCapital, lastA.investedCapital);
    const nopat = isNum(ebit) ? ebit * (1 - taxRate) : null;
    const roic = isNum(nopat) && isNum(investedCapital) && investedCapital > 0 ? nopat / investedCapital : null;
    // dividends per share in financial currency
    const dpsTrading = pick(st.dividendRate); const dividendsPaid = Math.abs(pick(ttm.dividendsPaid, lastA.dividendsPaid, 0));
    const dps = isNum(dpsTrading) && dpsTrading > 0 ? dpsTrading / fx : (isNum(shares) && shares > 0 && dividendsPaid > 0 ? dividendsPaid / shares : pick(lastA.dps, 0));
    const payout = isNum(netIncome) && netIncome > 0 ? clamp((dividendsPaid || (dps * (shares || 0))) / netIncome, 0, 1.5) : pick(st.payoutRatio, 0);
    // total shareholder payout (dividends + buybacks), averaged over up to 3 fiscal years
    const payoutRows = annual.slice(-3).map((p) => { const sh = pick(p.sharesOutstanding, p.dilutedShares, shares); const dv = Math.abs(pick(p.dividendsPaid, 0)); const bb = Math.abs(pick(p.buyback, 0)); return { perShare: sh ? (dv + bb) / sh : null, ratio: isNum(p.netIncome) && p.netIncome > 0 ? (dv + bb) / p.netIncome : null, bb }; });
    const hasBuybackData = payoutRows.some((r) => r.bb > 0);
    const totalPayoutPerShare = hasBuybackData ? mean(payoutRows.map((r) => r.perShare)) : dps;
    const totalPayoutRatio = hasBuybackData ? clamp(mean(payoutRows.map((r) => r.ratio)) ?? payout, 0, 2) : payout;
    // observed cash conversion: FCFF / NOPAT, median of recent years (anchors the explicit forecast)
    const convRows = [...annual.slice(-3), ...(isNum(ttm.freeCashFlow) && isNum(ttm.ebit) ? [ttm] : [])].map((p) => { const e = pick(p.ebit, p.operatingIncome); const fc = pick(p.freeCashFlow, isNum(p.operatingCashFlow) && isNum(p.capex) ? p.operatingCashFlow - Math.abs(p.capex) : null); return isNum(e) && e > 0 && isNum(fc) ? (fc + Math.abs(pick(p.interestExpense, 0)) * (1 - taxRate)) / (e * (1 - taxRate)) : null; }).filter(isNum);
    const cashConversion = convRows.length ? clamp(median(convRows), 0.2, 1.2) : null;
    // growth evidence
    const revs = seriesOf(annual, 'revenue'); const histRevCagr = revs.length >= 3 && revs[0] > 0 && last(revs) > 0 ? (last(revs) / revs[0]) ** (1 / (revs.length - 1)) - 1 : null;
    const eps = seriesOf(annual, 'dilutedEps'); const histEpsCagr = eps.length >= 3 && eps[0] > 0 && last(eps) > 0 ? (last(eps) / eps[0]) ** (1 / (eps.length - 1)) - 1 : null;
    const sustainableG = isNum(roe) ? clamp(clamp(roe, -0.2, 0.35) * (1 - clamp(totalPayoutRatio || 0, 0, 1)), -0.1, 0.2) : null;
    const fcfMargins = annual.map((p) => (isNum(p.freeCashFlow) && isNum(p.revenue) && p.revenue > 0 ? p.freeCashFlow / p.revenue : null)).filter(isNum).slice(-4);
    return {
      symbol: F.symbol, name: F.profile?.name, sector, industry, country: F.profile?.country, isFinancial, isREIT,
      currency: F.currency, financialCurrency: F.financialCurrency || F.currency, fx, price, priceFin: isNum(price) ? price / fx : null, marketCap, marketCapFin: isNum(marketCap) ? marketCap / fx : null, shares,
      revenue, ebit, ebitda, netIncome, ocf, capex, fcf, interest, da, debt, cash, minority, equityBV, totalAssets, taxRate, roe, roic, nopat, investedCapital,
      dps, payout, totalPayoutPerShare, totalPayoutRatio, hasBuybackData, cashConversion, histRevCagr, histEpsCagr, sustainableG, fcfMarginMedian: fcfMargins.length ? median(fcfMargins) : null,
      analyst: F.analyst || {}, stats: st, annual, sources: F.sources || {}, demo: !!F.demo,
    };
  }

  // ----------------------------------------------------------------- assumptions
  function defaultAssumptions(base, ctx = {}) {
    const ccy = (base.financialCurrency || 'USD').toUpperCase(); const d = CURRENCY_DEFAULTS[ccy] || CURRENCY_DEFAULTS.USD;
    const rf = isNum(ctx.liveRf?.[ccy]) ? ctx.liveRf[ccy] : d.rf;
    const crp = COUNTRY_CRP[base.country] ?? (ccy === 'CNY' ? 0.010 : ccy === 'USD' || ccy === 'SGD' ? 0 : 0.005);
    const rawBeta = pick(ctx.regressionBeta, base.stats?.beta, 1); const beta = clamp(isNum(ctx.regressionBeta) ? 0.67 * ctx.regressionBeta + 0.33 : rawBeta, 0.3, 2.5);
    const gT = clamp(rf - 0.0025, 0.01, 0.03);
    // stage-1 growth: blend of analyst long-term EPS growth, historical revenue CAGR, sustainable growth
    const ev = []; const add = (v, w, label) => { if (isNum(v)) ev.push({ v: clamp(v, -0.15, 0.40), w, label }); };
    add(base.analyst?.epsGrowthLongTerm, 0.40, '分析师长期 EPS 增速'); add(base.histRevCagr, 0.35, '历史营收 CAGR'); add(base.sustainableG, 0.25, '可持续增长 ROE×(1−派息率)');
    if (!ev.length) add(base.analyst?.revenueGrowthNextYear, 1, '分析师下一年营收增速');
    const rawG = ev.length ? ev.reduce((a, e) => a + e.v * e.w, 0) / ev.reduce((a, e) => a + e.w, 0) : gT + 0.02;
    const g1 = clamp(gT + 0.8 * (rawG - gT), -0.05, 0.25); // 20% shrink toward terminal growth (growth mean-reversion)
    const costOfDebtRaw = base.debt > 0 && base.interest > 0 ? base.interest / base.debt : rf + 0.015;
    return {
      rf, erp: MATURE_ERP, crp, beta, betaSource: isNum(ctx.regressionBeta) ? '回归 β (Blume 调整)' : isNum(base.stats?.beta) ? 'Yahoo β' : '默认 β=1',
      g1, gT, growthEvidence: ev, terminalRoic: null, taxRate: base.taxRate, costOfDebt: clamp(costOfDebtRaw, rf + 0.005, rf + 0.06),
    };
  }
  function discountRates(base, a) {
    const re = a.rf + a.beta * (a.erp + a.crp);
    const E = base.marketCapFin; const D = Math.max(0, base.debt || 0);
    const wE = isNum(E) && E > 0 ? E / (E + D) : 0.8;
    const rd = a.costOfDebt * (1 - a.taxRate);
    const wacc = isNum(a.waccOverride) ? a.waccOverride : wE * re + (1 - wE) * rd;
    return { re, rdAfterTax: rd, wE, wD: 1 - wE, wacc: Math.max(wacc, a.rf + 0.01) };
  }

  // -------------------------------------------------------------------- DCF
  /**
   * Three-stage FCFF DCF (mid-year convention).
   *  Stage 1 (yr 1–5): NOPAT grows at g1; FCFF = NOPAT × c0, where c0 is the firm's OBSERVED cash conversion
   *                    (FCFF / NOPAT, median of recent years) — anchors the forecast on real cash generation.
   *  Stage 2 (yr 6–10): growth fades linearly to gT; conversion converges to the steady state cT.
   *  Terminal: value-driver identity FCFF = NOPAT × (1 − gT / RONIC), RONIC = return on new invested capital.
   */
  function dcf(base, a) {
    if (base.isFinancial) return { applicable: false, reason: '金融企业的负债属经营性质，FCFF 不适用，改用剩余收益模型' };
    const rates = discountRates(base, a); const wacc = rates.wacc; const gT = a.gT;
    if (!(wacc - gT > 0.01)) return { applicable: false, reason: 'WACC 与永续增长率过近' };
    const nopat0 = isNum(base.nopat) ? base.nopat * (a.nopatMultiplier || 1) : null;
    const roic0 = isNum(base.roic) ? clamp(base.roic, Math.max(0.03, wacc * 0.5), 1.5) : null;
    let ronic = isNum(a.terminalRoic) ? a.terminalRoic : (isNum(roic0) ? Math.max(wacc, (roic0 + wacc) / 2) : wacc);
    ronic = Math.max(gT + 0.005, ronic * (a.roicMultiplier || 1));
    const cT = clamp(1 - gT / ronic, 0.2, 1);
    let mode = 'conversion'; let start = nopat0; let c0 = null;
    if (isNum(nopat0) && nopat0 > 0) {
      const observed = isNum(a.cashConversion) ? a.cashConversion : base.cashConversion;
      c0 = clamp((isNum(observed) ? observed : (isNum(roic0) ? 1 - a.g1 / roic0 : cT)) * (a.conversionMultiplier || 1), 0.2, 1.2);
    } else {
      const fcf0 = isNum(base.fcfMarginMedian) && isNum(base.revenue) ? base.fcfMarginMedian * base.revenue : base.fcf;
      if (!isNum(fcf0) || fcf0 <= 0) return { applicable: false, reason: isNum(nopat0) && nopat0 <= 0 ? '经营利润为负，DCF 不可靠' : '缺少 EBIT / 自由现金流' };
      mode = 'fcf-growth'; start = (fcf0 + (base.interest || 0) * (1 - a.taxRate)) * (a.nopatMultiplier || 1);
    }
    const rows = []; let level = start; let pvSum = 0;
    for (let t = 1; t <= 10; t += 1) {
      const g = t <= 5 ? a.g1 : a.g1 + (gT - a.g1) * (t - 5) / 5; level *= 1 + g;
      const conv = mode === 'conversion' ? (t <= 5 ? c0 : c0 + (cT - c0) * (t - 5) / 5) : 1;
      const fcff = level * conv; const df = 1 / (1 + wacc) ** (t - 0.5); pvSum += fcff * df;
      rows.push({ t, g, nopat: level, conv, fcff, pv: fcff * df });
    }
    const terminalFlow = level * (1 + gT) * (mode === 'conversion' ? cT : 1);
    const tv = terminalFlow / (wacc - gT); const pvTv = tv / (1 + wacc) ** 9.5;
    const ev = pvSum + pvTv; const equity = ev - (base.debt || 0) + (base.cash || 0) - (base.minority || 0);
    const perShareFin = base.shares ? equity / base.shares : null;
    const growthFactor = rows.reduce((acc, r) => acc * (1 + r.g), 1);
    return {
      applicable: isNum(perShareFin) && perShareFin > 0, reason: !isNum(perShareFin) ? '缺少股本数据' : perShareFin <= 0 ? '企业价值低于净负债' : null, mode,
      value: isNum(perShareFin) && perShareFin > 0 ? perShareFin * base.fx : null,
      ev, equity, pvExplicit: pvSum, pvTerminal: pvTv, tvShare: ev ? pvTv / ev : null, wacc, re: rates.re, roic0, ronic, c0, cT, rows,
      impliedExitEvEbitda: isNum(base.ebitda) && base.ebitda > 0 ? tv / (base.ebitda * growthFactor) : null,
      firstYearFcff: rows[0].fcff, actualFcf: base.fcf, rates,
    };
  }
  function reverseDcf(base, a) {
    if (!isNum(base.price)) return null; const f = (g) => dcf(base, { ...a, g1: g }).value;
    let lo = -0.3; let hi = 0.6; const vlo = f(lo); const vhi = f(hi);
    if (!isNum(vlo) || !isNum(vhi)) return null;
    if ((vlo - base.price) * (vhi - base.price) > 0) return { impliedG1: null, note: vhi < base.price ? '即使 60% 的年增长也无法支撑现价' : '现价低于 −30% 增长情形下的价值', increasing: vhi > vlo };
    for (let i = 0; i < 70; i += 1) { const mid = (lo + hi) / 2; const vm = f(mid); if ((vm - base.price) * (vlo - base.price) > 0) lo = mid; else hi = mid; }
    return { impliedG1: (lo + hi) / 2, increasing: vhi > vlo };
  }
  function sensitivity(base, a) {
    const center = dcf(base, a); if (!center.applicable) return null;
    const waccs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => center.wacc + d); const gs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => a.gT + d);
    return { waccs, gs, grid: gs.map((g) => waccs.map((w) => (w - g > 0.008 ? dcf(base, { ...a, gT: g, waccOverride: w }).value : null))) };
  }
  function monteCarlo(base, a, sims = 2000, seed = 7) {
    const center = dcf(base, a); if (!center.applicable) return null;
    const rand = A.seededRandom(seed + Math.round((base.price || 1) * 100)); const gauss = A.gaussianFactory(rand); const values = [];
    const gSd = Math.max(0.03, Math.abs(a.g1) * 0.35);
    for (let i = 0; i < sims; i += 1) {
      const w = Math.max(a.rf + 0.01, center.wacc + gauss() * 0.01); const gT = Math.min(a.gT + gauss() * 0.005, w - 0.015);
      const v = dcf(base, { ...a, waccOverride: w, gT, g1: clamp(a.g1 + gauss() * gSd, -0.2, 0.5), roicMultiplier: Math.exp(gauss() * 0.2), nopatMultiplier: Math.exp(gauss() * 0.08), conversionMultiplier: Math.exp(gauss() * 0.1) }).value;
      if (isNum(v)) values.push(v);
    }
    if (values.length < sims * 0.5) return null;
    const q = (p) => A.quantile(values, p);
    return { sims: values.length, p05: q(0.05), p10: q(0.10), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), mean: mean(values), probAbovePrice: isNum(base.price) ? values.filter((v) => v > base.price).length / values.length : null, hist: A.histogram(values, 28, 0.98) };
  }

  // ---------------------------------------------------------- residual income
  function residualIncome(base, a) {
    const bv0 = base.equityBV; if (!isNum(bv0) || bv0 <= 0 || !base.shares) return { applicable: false, reason: '账面净资产为负或缺失' };
    if (!isNum(base.roe)) return { applicable: false, reason: '缺少 ROE' };
    const { re } = discountRates(base, a); const roe0 = clamp(base.roe, -0.3, 0.6);
    const roeLR = isNum(a.roeLongRun) ? a.roeLongRun : (roe0 + re) / 2; const b = base.netIncome > 0 ? 1 - clamp(base.payout || 0, 0, 1) : 1;
    let bv = bv0; let pv = 0; const rows = [];
    for (let t = 1; t <= 10; t += 1) { const roe = roe0 + (roeLR - roe0) * t / 10; const ri = (roe - re) * bv; const d = ri / (1 + re) ** t; pv += d; rows.push({ t, roe, bv, ri, pv: d }); bv *= 1 + roe * b; }
    const ri11 = (roeLR - re) * bv; const tv = ri11 / (1 + re - OHLSON_OMEGA) / (1 + re) ** 10;
    const equity = bv0 + pv + tv; const value = (equity / base.shares) * base.fx;
    const justifiedPB = re - a.gT > 0.005 ? (roe0 - a.gT) / (re - a.gT) : null;
    const pb = base.priceFin && bv0 ? base.priceFin / (bv0 / base.shares) : null; const weightScale = isNum(pb) && pb > 8 ? 0.3 : isNum(pb) && pb > 4 ? 0.7 : 1;
    return { applicable: isNum(value) && value > 0, reason: value > 0 ? null : '剩余收益为负导致价值 ≤ 0', value: value > 0 ? value : null, weightScale, re, roe0, roeLR, rows, pvRI: pv, pvTerminal: tv, bookPerShare: (bv0 / base.shares) * base.fx, justifiedPB };
  }

  // ------------------------------------------------------------------- DDM
  /**
   * Shareholder-payout discount model. Uses dividends + buybacks per share (3-year average) when buyback data
   * exist, otherwise the dividend. Firms that return little cash get a zero weight (shown as reference only).
   */
  function ddm(base, a) {
    const d0 = isNum(base.totalPayoutPerShare) && base.totalPayoutPerShare > 0 ? base.totalPayoutPerShare : base.dps;
    if (!isNum(d0) || d0 <= 0) return { applicable: false, reason: '不派息也不回购' };
    const { re } = discountRates(base, a); if (!(re - a.gT > 0.01)) return { applicable: false, reason: '股权成本与永续增长过近' };
    const g1 = clamp(Math.min(a.g1, pick(base.sustainableG, a.g1) + 0.02), -0.05, 0.15); let d = d0; let pv = 0;
    for (let t = 1; t <= 10; t += 1) { const g = t <= 5 ? g1 : g1 + (a.gT - g1) * (t - 5) / 5; d *= 1 + g; pv += d / (1 + re) ** t; }
    const tv = d * (1 + a.gT) / (re - a.gT) / (1 + re) ** 10; const value = (pv + tv) * base.fx;
    const ratio = isNum(base.totalPayoutRatio) ? base.totalPayoutRatio : base.payout;
    return { applicable: true, value, re, g1, payoutPerShare: d0 * base.fx, includesBuybacks: !!base.hasBuybackData, payoutRatio: ratio, weightScale: ratio >= 0.5 ? 1 : ratio >= 0.25 ? 0.6 : 0 };
  }

  // -------------------------------------------------------------- multiples
  /** Own-history multiples at fiscal year ends, currency-neutral ratio method. */
  function historicalMultiples(base, priceHistory) {
    if (!priceHistory?.ts?.length || !isNum(base.price)) return { applicable: false, reason: '缺少价格历史' };
    const priceAt = (dateStr) => { const t = Date.parse(`${dateStr}T23:59:59Z`) / 1000; let p = null; for (let i = 0; i < priceHistory.ts.length && priceHistory.ts[i] <= t; i += 1) p = priceHistory.closes[i]; return p; };
    const pe = []; const pb = [];
    base.annual.forEach((p) => {
      const px = priceAt(p.date); if (!isNum(px)) return; const pxFin = px / base.fx; const shares = pick(p.sharesOutstanding, p.dilutedShares, base.shares);
      const epsA = pick(p.dilutedEps, isNum(p.netIncome) && shares ? p.netIncome / shares : null);
      if (isNum(epsA) && epsA > 0) pe.push({ date: p.date, v: pxFin / epsA });
      if (isNum(p.equity) && p.equity > 0 && shares) pb.push({ date: p.date, v: pxFin / (p.equity / shares) });
    });
    const curEps = isNum(base.netIncome) && base.shares ? base.netIncome / base.shares : null; const curBvps = isNum(base.equityBV) && base.shares ? base.equityBV / base.shares : null;
    const curPE = isNum(curEps) && curEps > 0 ? base.priceFin / curEps : null; const curPB = isNum(curBvps) && curBvps > 0 ? base.priceFin / curBvps : null;
    const parts = []; let low = Infinity; let high = -Infinity;
    if (pe.length >= 3 && isNum(curPE)) { const m = median(pe.map((x) => x.v)); const v = base.price * m / curPE; parts.push({ label: '历史 P/E 中位数', multiple: m, current: curPE, value: v, w: base.isFinancial ? 0.4 : 0.6 }); pe.forEach((x) => { low = Math.min(low, base.price * x.v / curPE); high = Math.max(high, base.price * x.v / curPE); }); }
    if (pb.length >= 3 && isNum(curPB)) { const m = median(pb.map((x) => x.v)); const v = base.price * m / curPB; parts.push({ label: '历史 P/B 中位数', multiple: m, current: curPB, value: v, w: base.isFinancial ? 0.6 : 0.4 }); pb.forEach((x) => { low = Math.min(low, base.price * x.v / curPB); high = Math.max(high, base.price * x.v / curPB); }); }
    if (!parts.length) return { applicable: false, reason: '财报历史不足 3 年或盈利为负' };
    const value = parts.reduce((a2, p) => a2 + p.value * p.w, 0) / parts.reduce((a2, p) => a2 + p.w, 0);
    return { applicable: true, value, low, high, parts, pe, pb, curPE, curPB };
  }
  /** Peer multiples. peers: array of fundamentals objects (server format). */
  function peerMultiples(base, peers) {
    if (!peers?.length || !isNum(base.price)) return { applicable: false, reason: '无同业样本' };
    const own = base.stats || {}; const ev = own.enterpriseValue; const mcap = base.marketCap;
    const metric = (key) => peers.map((p) => p.stats?.[key]).filter((v) => isNum(v) && v > 0 && v < 200);
    const defs = base.isFinancial ? [['priceToBook', 'P/B', 0.5], ['trailingPE', 'P/E (TTM)', 0.3], ['forwardPE', 'P/E (预期)', 0.2]]
      : [['forwardPE', 'P/E (预期)', 0.3], ['trailingPE', 'P/E (TTM)', 0.15], ['evToEbitda', 'EV/EBITDA', 0.35], ['priceToSales', 'P/S', 0.1], ['priceToBook', 'P/B', 0.1]];
    const parts = [];
    defs.forEach(([key, label, w]) => {
      const sample = metric(key); const mine = own[key]; if (sample.length < 2 || !isNum(mine) || mine <= 0 || mine > 300) return;
      const m = median(sample); let v;
      if (key === 'evToEbitda') { if (!isNum(ev) || !isNum(mcap)) return; const netDebt = ev - mcap; v = (ev * m / mine - netDebt) / (mcap / base.price); } else v = base.price * m / mine;
      if (isNum(v) && v > 0) parts.push({ label, key, peerMedian: m, own: mine, n: sample.length, value: v, w, low: base.price * Math.min(...sample) / mine, high: base.price * Math.max(...sample) / mine });
    });
    if (!parts.length) return { applicable: false, reason: '同业倍数不足' };
    const value = parts.reduce((a2, p) => a2 + p.value * p.w, 0) / parts.reduce((a2, p) => a2 + p.w, 0);
    return { applicable: true, value, low: Math.min(...parts.map((p) => p.value)), high: Math.max(...parts.map((p) => p.value)), parts, peerCount: peers.length };
  }

  // ---------------------------------------------------------------- quality
  function piotroski(annual) {
    if (annual.length < 2) return null; const c = annual[annual.length - 1]; const p = annual[annual.length - 2]; const pp = annual.length > 2 ? annual[annual.length - 3] : null;
    const div = (x, y) => (isNum(x) && isNum(y) && y !== 0 ? x / y : null);
    const roaC = div(c.netIncome, p.totalAssets || c.totalAssets); const roaP = div(p.netIncome, pp?.totalAssets || p.totalAssets);
    const levC = div(c.longTermDebt ?? 0, c.totalAssets); const levP = div(p.longTermDebt ?? 0, p.totalAssets);
    const crC = div(c.currentAssets, c.currentLiabilities); const crP = div(p.currentAssets, p.currentLiabilities);
    const gmC = div(c.grossProfit, c.revenue); const gmP = div(p.grossProfit, p.revenue);
    const atC = div(c.revenue, p.totalAssets || c.totalAssets); const atP = div(p.revenue, pp?.totalAssets || p.totalAssets);
    const sharesC = pick(c.sharesOutstanding, c.dilutedShares); const sharesP = pick(p.sharesOutstanding, p.dilutedShares);
    const test = (name, group, ok, detail) => ({ name, group, pass: ok === null ? null : !!ok, detail });
    const tests = [
      test('ROA > 0', '盈利', isNum(roaC) ? roaC > 0 : null, isNum(roaC) ? `${(roaC * 100).toFixed(1)}%` : '缺数据'),
      test('经营现金流 > 0', '盈利', isNum(c.operatingCashFlow) ? c.operatingCashFlow > 0 : null, ''),
      test('ROA 同比改善', '盈利', isNum(roaC) && isNum(roaP) ? roaC > roaP : null, isNum(roaP) ? `${(roaP * 100).toFixed(1)}% → ${(roaC * 100).toFixed(1)}%` : '缺数据'),
      test('现金流 > 净利润（低应计）', '盈利', isNum(c.operatingCashFlow) && isNum(c.netIncome) ? c.operatingCashFlow > c.netIncome : null, ''),
      test('长期负债率下降', '杠杆/流动性', isNum(levC) && isNum(levP) ? levC <= levP : null, isNum(levC) && isNum(levP) ? `${(levP * 100).toFixed(1)}% → ${(levC * 100).toFixed(1)}%` : '缺数据'),
      test('流动比率上升', '杠杆/流动性', isNum(crC) && isNum(crP) ? crC > crP : null, isNum(crC) && isNum(crP) ? `${crP.toFixed(2)} → ${crC.toFixed(2)}` : '缺数据'),
      test('未增发股本', '杠杆/流动性', isNum(sharesC) && isNum(sharesP) ? sharesC <= sharesP * 1.005 : null, isNum(sharesC) && isNum(sharesP) ? `${((sharesC / sharesP - 1) * 100).toFixed(1)}%` : '缺数据'),
      test('毛利率上升', '经营效率', isNum(gmC) && isNum(gmP) ? gmC > gmP : null, isNum(gmC) && isNum(gmP) ? `${(gmP * 100).toFixed(1)}% → ${(gmC * 100).toFixed(1)}%` : '缺数据'),
      test('资产周转率上升', '经营效率', isNum(atC) && isNum(atP) ? atC > atP : null, isNum(atC) && isNum(atP) ? `${atP.toFixed(2)} → ${atC.toFixed(2)}` : '缺数据'),
    ];
    const available = tests.filter((t) => t.pass !== null); const score = available.filter((t) => t.pass).length;
    return { score, available: available.length, tests, scaled: available.length ? score / available.length * 9 : null, period: c.date };
  }
  function altmanZ(base) {
    if (base.isFinancial) return null; const a = last(base.annual) || {};
    const ta = a.totalAssets; const tl = a.totalLiabilities; if (!isNum(ta) || ta <= 0 || !isNum(tl) || tl <= 0) return null;
    const wc = pick(a.workingCapital, isNum(a.currentAssets) && isNum(a.currentLiabilities) ? a.currentAssets - a.currentLiabilities : null);
    const re = a.retainedEarnings; const ebit = pick(a.ebit, a.operatingIncome); const bve = a.equity;
    if (![wc, re, ebit, bve].every(isNum)) return null;
    const x1 = wc / ta; const x2 = re / ta; const x3 = ebit / ta; const x4 = bve / tl; const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    return { z, x1, x2, x3, x4, zone: z > 2.6 ? 'safe' : z > 1.1 ? 'grey' : 'distress', zoneLabel: z > 2.6 ? '安全区' : z > 1.1 ? '灰色区' : '困境区' };
  }
  function qualityMetrics(base, wacc) {
    const an = base.annual; const lastA = last(an) || {};
    const opMargins = an.map((p) => (isNum(p.operatingIncome ?? p.ebit) && p.revenue > 0 ? (p.operatingIncome ?? p.ebit) / p.revenue : null)).filter(isNum);
    const grossMargin = isNum(lastA.grossProfit) && lastA.revenue > 0 ? lastA.grossProfit / lastA.revenue : base.stats?.grossMargins;
    return {
      roic: base.roic, roe: base.roe, roicSpread: isNum(base.roic) && isNum(wacc) ? base.roic - wacc : null, grossMargin,
      operatingMargin: isNum(base.ebit) && base.revenue > 0 ? base.ebit / base.revenue : null, netMargin: isNum(base.netIncome) && base.revenue > 0 ? base.netIncome / base.revenue : null,
      fcfConversion: isNum(base.fcf) && base.netIncome > 0 ? base.fcf / base.netIncome : null, accruals: isNum(base.netIncome) && isNum(base.ocf) && base.totalAssets > 0 ? (base.netIncome - base.ocf) / base.totalAssets : null,
      interestCoverage: base.interest > 0 && isNum(base.ebit) ? base.ebit / base.interest : null, netDebtToEbitda: base.ebitda > 0 ? ((base.debt || 0) - (base.cash || 0)) / base.ebitda : null,
      marginStability: opMargins.length >= 3 ? std(opMargins) : null, revenueCagr: base.histRevCagr, epsCagr: base.histEpsCagr,
      debtToEquity: base.equityBV > 0 ? (base.debt || 0) / base.equityBV : null,
    };
  }
  function qualityFactor(f, z, q) {
    const parts = []; const w = [];
    if (f && f.available >= 5) { parts.push((f.scaled - 4.5) / 4.5); w.push(0.4); }
    if (isNum(q.roicSpread)) { parts.push(Math.tanh(q.roicSpread / 0.08)); w.push(0.3); } else if (isNum(q.roe)) { parts.push(Math.tanh((q.roe - 0.10) / 0.08)); w.push(0.3); }
    if (z) { parts.push(z.zone === 'safe' ? 0.6 : z.zone === 'grey' ? 0 : -1); w.push(0.2); }
    if (isNum(q.accruals)) { parts.push(Math.tanh(-q.accruals / 0.05) * 0.6); w.push(0.1); }
    return parts.length ? parts.reduce((a2, v, i) => a2 + v * w[i], 0) / w.reduce((a2, b) => a2 + b, 0) : null;
  }

  // -------------------------------------------------------------- composite
  function weightsFor(base) {
    if (base.isREIT) return { dcf: 0.15, ri: 0.10, ddm: 0.45, history: 0.15, peers: 0.15 };
    if (base.isFinancial) return { dcf: 0, ri: 0.45, ddm: 0.20, history: 0.15, peers: 0.20 };
    return { dcf: 0.40, ri: 0.15, ddm: 0.10, history: 0.15, peers: 0.20 };
  }
  function composite(base, models) {
    const w = weightsFor(base); const items = [];
    Object.entries(w).forEach(([k, wt]) => { const m = models[k]; if (m && m.applicable && isNum(m.value) && m.value > 0 && wt * (m.weightScale ?? 1) > 0) items.push({ key: k, value: m.value, w: wt * (m.weightScale ?? 1), low: m.low, high: m.high }); });
    if (!items.length) return null;
    const med = median(items.map((i) => i.value)); items.forEach((i) => { i.used = clamp(i.value, med / 3, med * 3); });
    const W = items.reduce((a2, i) => a2 + i.w, 0); const fair = items.reduce((a2, i) => a2 + i.used * i.w, 0) / W;
    const disp = Math.sqrt(items.reduce((a2, i) => a2 + i.w * (i.used - fair) ** 2, 0) / W) / fair;
    const low = items.reduce((a2, i) => a2 + (isNum(i.low) ? Math.min(i.low, i.used) : i.used * 0.85) * i.w, 0) / W;
    const high = items.reduce((a2, i) => a2 + (isNum(i.high) ? Math.max(i.high, i.used) : i.used * 1.15) * i.w, 0) / W;
    const upside = isNum(base.price) ? fair / base.price - 1 : null;
    const reliability = clamp(1 - disp, 0.35, 1) * clamp(items.length / 3, 0.5, 1);
    return { fair, low, high, upside, dispersion: disp, reliability, items: items.map((i) => ({ ...i, weight: i.w / W })), factor: isNum(upside) ? Math.tanh(upside / 0.30) * reliability : null };
  }

  /**
   * Full valuation run.
   * ctx: { price, priceHistory:{ts,closes}, regressionBeta, liveRf:{USD:..}, peers:[F...], overrides:{...} }
   */
  function runValuation(F, ctx = {}) {
    const base = prepare(F, ctx); const defaults = defaultAssumptions(base, ctx);
    const a = { ...defaults, ...Object.fromEntries(Object.entries(ctx.overrides || {}).filter(([, v]) => isNum(v))) };
    const rates = discountRates(base, a);
    const models = { dcf: dcf(base, a), ri: residualIncome(base, a), ddm: ddm(base, a), history: historicalMultiples(base, ctx.priceHistory), peers: peerMultiples(base, ctx.peers) };
    const mc = models.dcf.applicable ? monteCarlo(base, a) : null;
    if (mc && models.dcf.applicable) { models.dcf.low = mc.p10; models.dcf.high = mc.p90; }
    if (models.ri.applicable) { const lo = residualIncome(base, { ...a, roeLongRun: Math.min(models.ri.roeLR, models.ri.re) }).value; const hi = residualIncome(base, { ...a, roeLongRun: models.ri.roe0 }).value; models.ri.low = Math.min(lo ?? models.ri.value, hi ?? models.ri.value); models.ri.high = Math.max(lo ?? models.ri.value, hi ?? models.ri.value); }
    if (models.ddm.applicable) { models.ddm.low = ddm(base, { ...a, gT: a.gT - 0.005, g1: a.g1 - 0.02 }).value; models.ddm.high = ddm(base, { ...a, gT: a.gT + 0.005, g1: a.g1 + 0.02 }).value; }
    const comp = composite(base, models);
    const fScore = piotroski(base.annual); const z = altmanZ(base); const q = qualityMetrics(base, rates.wacc);
    const analyst = isNum(base.analyst?.targetMean) ? { value: base.analyst.targetMean, low: base.analyst.targetLow, high: base.analyst.targetHigh, count: base.analyst.count, recommendation: base.analyst.recommendationKey } : null;
    return {
      base, assumptions: a, defaults, rates, models, monteCarlo: mc, reverse: models.dcf.applicable ? reverseDcf(base, a) : null, sensitivity: models.dcf.applicable ? sensitivity(base, a) : null,
      composite: comp, analyst, quality: { piotroski: fScore, altman: z, metrics: q, factor: qualityFactor(fScore, z, q) }, weights: weightsFor(base),
    };
  }

  /** Deterministic placeholder fundamentals for DEMO mode only. */
  function mockFundamentals(symbol, price, currency = 'USD') {
    const rand = A.seededRandom([...symbol].reduce((s, c) => s + c.charCodeAt(0), 0) * 31); const shares = 1e9 * (1 + rand() * 4);
    const margin = 0.12 + rand() * 0.15; const targetPE = 18 + rand() * 10; const revenue = (price * shares) / (targetPE * 0.78 * margin); const annual = [];
    for (let i = 4; i >= 0; i -= 1) { const scale = (1.08) ** -i; const rev = revenue * scale; const ebit = rev * (margin - i * 0.004); annual.push({ date: `${2025 - i}-12-31`, revenue: rev, grossProfit: rev * 0.45, ebit, operatingIncome: ebit, ebitda: ebit * 1.25, netIncome: ebit * 0.78, pretaxIncome: ebit * 0.97, taxProvision: ebit * 0.19, interestExpense: rev * 0.004, dilutedEps: ebit * 0.78 / shares, operatingCashFlow: ebit * 1.05, capex: -rev * 0.04, freeCashFlow: ebit * 1.05 - rev * 0.04, dividendsPaid: -ebit * 0.2, totalAssets: rev * 1.3, currentAssets: rev * 0.5, currentLiabilities: rev * 0.32, totalLiabilities: rev * 0.7, totalDebt: rev * 0.25, longTermDebt: rev * 0.2, cash: rev * 0.18, equity: rev * 0.6, retainedEarnings: rev * 0.35, sharesOutstanding: shares * (1 + i * 0.005), dilutedShares: shares }); }
    const lastA = annual.at(-1);
    return { symbol, demo: true, currency, financialCurrency: currency, fxToPrice: 1, price, marketCap: price * shares, profile: { name: `${symbol} (演示)`, sector: 'Technology', industry: 'Demo', country: 'United States' }, stats: { trailingPE: price / lastA.dilutedEps, forwardPE: price / lastA.dilutedEps / 1.08, priceToBook: price * shares / lastA.equity, priceToSales: price * shares / lastA.revenue, evToEbitda: (price * shares + lastA.totalDebt - lastA.cash) / lastA.ebitda, enterpriseValue: price * shares + lastA.totalDebt - lastA.cash, beta: 1.1, dividendRate: lastA.netIncome * 0.25 / shares, payoutRatio: 0.25 }, financial: {}, analyst: { epsGrowthLongTerm: 0.09, targetMean: price * 1.08, targetLow: price * 0.8, targetHigh: price * 1.35, count: 18, recommendationKey: 'buy' }, annual, ttm: {}, latestBalance: lastA, sources: { demo: true } };
  }

  const api = { CURRENCY_DEFAULTS, COUNTRY_CRP, MATURE_ERP, OHLSON_OMEGA, prepare, defaultAssumptions, discountRates, dcf, reverseDcf, sensitivity, monteCarlo, residualIncome, ddm, historicalMultiples, peerMultiples, piotroski, altmanZ, qualityMetrics, qualityFactor, composite, weightsFor, runValuation, mockFundamentals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QSValuation = api;
}(typeof window !== 'undefined' ? window : globalThis));
