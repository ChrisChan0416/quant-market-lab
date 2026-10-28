/*
 * QuantScope v2.0 — rendering for the valuation, fundamentals, quant-analytics and backtest panels.
 * Depends on QSAnalytics and on the formatting helpers defined in app.js (formatNumber, formatCompact, formatDate).
 */
(function (root) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x, d = 1) => (isNum(x) ? `${(x * 100).toFixed(d)}%` : '--');
  const spct = (x, d = 1) => (isNum(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%` : '--');
  const num = (x, d = 2) => (isNum(x) ? Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '--');
  const px = (x) => (isNum(x) ? num(x, Math.abs(x) >= 1000 ? 0 : 2) : '--');
  const big = (x) => { if (!isNum(x)) return '--'; const a = Math.abs(x); const s = x < 0 ? '-' : ''; if (a >= 1e12) return `${s}${(a / 1e12).toFixed(2)}T`; if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`; if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`; return `${s}${num(a, 0)}`; };
  const cls = (x, good = 0) => (!isNum(x) ? '' : x > good ? 'positive' : x < good ? 'negative' : '');
  const COLORS = { cyan: '#50e3c2', red: '#ff6e77', orange: '#ffb45e', violet: '#ae8cff', blue: '#5d8eff', muted: '#667588', grid: 'rgba(154,176,205,.12)' };
  const METHOD_LABELS = { dcf: '三阶段 DCF', ri: '剩余收益 RI', ddm: '股东回报折现', history: '历史估值中枢', peers: '同业倍数', analyst: '分析师目标价' };
  const kv = (label, value, klass = '', hint = '') => `<div class="kv"${hint ? ` title="${esc(hint)}"` : ''}><span>${label}</span><strong class="${klass}">${value}</strong></div>`;

  // ------------------------------------------------------------------ valuation
  function renderValuation(v, ctx) {
    const status = $('#valuationStatus'); const hero = $('#valuationHero');
    if (!v) {
      status.textContent = ctx.status || '不可用'; status.className = 'plan-tag';
      hero.innerHTML = `<div class="valuation-empty">${esc(ctx.message || '该标的不适用基本面估值（指数、期货、加密资产等），模型只使用量价与风险因子。')}</div>`;
      ['#footballField', '#valuationTable', '#dcfTable', '#sensitivityGrid', '#monteCarloChart', '#reverseDcf', '#waccBox'].forEach((id) => { const el = $(id); if (el) el.innerHTML = '<div class="mini-empty">--</div>'; });
      $('#valuationNote').textContent = ''; return;
    }
    const c = v.composite; const b = v.base; const ccy = b.currency || ''; const fccy = b.financialCurrency || ccy;
    const srcs = b.sources?.provider ? `${b.sources.provider}${b.sources.statementsAsOf ? ` · 截至 ${b.sources.statementsAsOf}` : ''}` : [b.sources?.timeseries ? '财报' : null, b.sources?.quoteSummary ? '一致预期' : null].filter(Boolean).join(' + ');
    status.textContent = b.demo ? 'DEMO 数据' : ctx.manual ? '手动基本面' : `${fccy}${fccy !== ccy ? ` → ${ccy}` : ''}${srcs ? ` · ${srcs}` : ''}`;
    status.className = `plan-tag ${b.demo ? 'warn' : ''}`;
    const upClass = c ? cls(c.upside) : '';
    const verdict = !c ? '模型不足' : c.upside > 0.25 ? '显著低估' : c.upside > 0.08 ? '小幅低估' : c.upside < -0.25 ? '显著高估' : c.upside < -0.08 ? '小幅高估' : '估值合理';
    hero.innerHTML = `
      <div class="vh-main"><span>综合公允价值</span><strong>${c ? px(c.fair) : '--'} <small>${esc(ccy)}</small></strong><em class="${upClass}">${c ? `${spct(c.upside)} vs 现价 ${px(b.price)}` : '没有可用模型'}</em></div>
      <div class="vh-cell"><span>估值判断</span><strong class="${upClass}">${verdict}</strong><small>区间 ${c ? `${px(c.low)} – ${px(c.high)}` : '--'}</small></div>
      <div class="vh-cell"><span>模型一致性</span><strong>${c ? pct(1 - Math.min(1, c.dispersion), 0) : '--'}</strong><small>离散度 ${c ? pct(c.dispersion, 0) : '--'} · 可靠度 ${c ? pct(c.reliability, 0) : '--'}</small></div>
      <div class="vh-cell"><span>Monte Carlo</span><strong>${v.monteCarlo ? pct(v.monteCarlo.probAbovePrice, 0) : '--'}</strong><small>DCF 价值高于现价的概率</small></div>
      <div class="vh-cell"><span>市场隐含增长</span><strong>${v.reverse && isNum(v.reverse.impliedG1) ? pct(v.reverse.impliedG1) : '--'}</strong><small>反向 DCF · 模型假设 ${pct(v.assumptions.g1)}</small></div>`;
    renderFootballField(v);
    renderValuationTable(v);
    renderWacc(v);
    renderDcfTable(v);
    renderSensitivity(v);
    renderMonteCarlo(v);
    const rev = v.reverse; const g = v.assumptions;
    $('#reverseDcf').innerHTML = !v.models.dcf.applicable ? `<div class="mini-empty">${esc(v.models.dcf.reason || 'DCF 不适用')}</div>`
      : rev && isNum(rev.impliedG1) ? `<p class="reverse-copy">要支撑现价 <b>${px(b.price)}</b>，未来 5 年税后经营利润需年均增长 <b class="${rev.impliedG1 > g.g1 ? 'negative' : 'positive'}">${pct(rev.impliedG1)}</b>（之后 5 年线性回落到 ${pct(g.gT)}）。对照：历史营收 CAGR ${pct(b.histRevCagr)}，分析师长期 EPS 增速 ${pct(b.analyst?.epsGrowthLongTerm)}，模型采用 ${pct(g.g1)}。${rev.increasing ? '' : '<br/>注意：当前 ROIC 不高于 WACC，增长并不创造价值。'}</p>`
        : `<p class="reverse-copy">${esc(rev?.note || '无法求解')}</p>`;
    const notes = [];
    if (b.sources?.stale) notes.push(`注意：最新可用财报截至 ${b.sources.statementsAsOf}，已超过 15 个月（数据源尚未收录更新的年报），估值可能滞后。`);
    if (b.demo) notes.push('演示数据：基本面为随机生成的占位数，仅用于展示界面，切勿据此判断。');
    if (b.fx !== 1) notes.push(`财报货币 ${fccy} 按即期汇率 ${num(b.fx, 4)} 折算为 ${ccy}；折现率使用 ${fccy} 无风险利率。`);
    if (v.models.dcf.applicable && v.models.dcf.tvShare > 0.75) notes.push(`DCF 终值占比 ${pct(v.models.dcf.tvShare, 0)}，结论高度依赖永续假设。`);
    if (b.isFinancial) notes.push('金融企业：不使用 FCFF DCF，以剩余收益模型和 P/B 为主。');
    if (v.models.ddm.applicable && !v.models.ddm.weightScale) notes.push('股东回报率偏低，派息/回购折现模型只作参考、不计入综合价值。');
    notes.push('综合价值 = 各适用模型按权重加权（单个模型先截尾到中位数的 1/3–3 倍）；分析师目标价只作参照，不计入。');
    $('#valuationNote').innerHTML = notes.map((n) => `<span>${esc(n)}</span>`).join('');
  }

  function renderFootballField(v) {
    const rows = []; const m = v.models; const price = v.base.price;
    const weights = Object.fromEntries((v.composite?.items || []).map((i) => [i.key, i.weight]));
    ['dcf', 'ri', 'ddm', 'history', 'peers'].forEach((k) => { if (m[k]?.applicable && isNum(m[k].value)) rows.push({ key: k, label: METHOD_LABELS[k], value: m[k].value, low: m[k].low, high: m[k].high, weight: weights[k] || 0 }); });
    if (v.analyst) rows.push({ key: 'analyst', label: `${METHOD_LABELS.analyst}${isNum(v.analyst.count) ? ` (${v.analyst.count})` : ''}`, value: v.analyst.value, low: v.analyst.low, high: v.analyst.high, weight: null });
    if (!rows.length) { $('#footballField').innerHTML = '<div class="mini-empty">没有可用的估值模型</div>'; return; }
    const vals = rows.flatMap((r) => [r.value, r.low, r.high]).concat([price, v.composite?.low, v.composite?.high]).filter(isNum);
    let lo = Math.min(...vals); let hi = Math.max(...vals); const pad = (hi - lo) * 0.06 || hi * 0.1; lo = Math.max(0, lo - pad); hi += pad;
    const x = (val) => `${((val - lo) / (hi - lo)) * 100}%`;
    const row = (r) => { const l = isNum(r.low) ? Math.min(r.low, r.value) : r.value; const h = isNum(r.high) ? Math.max(r.high, r.value) : r.value; return `<div class="ff-row ${r.weight === 0 ? 'muted' : ''}"><span class="ff-label">${esc(r.label)}<small>${r.weight === null ? '参照' : r.weight ? `权重 ${pct(r.weight, 0)}` : '不计入'}</small></span><span class="ff-track"><u class="ff-pline" style="left:${x(price)}"></u><i class="ff-bar ${r.key}" style="left:${x(l)};width:calc(${x(h)} - ${x(l)})"></i><b class="ff-dot" style="left:${x(r.value)}" title="${px(r.value)}"></b></span><span class="ff-value">${px(r.value)}</span></div>`; };
    const comp = v.composite ? `<div class="ff-row composite"><span class="ff-label">综合公允价值<small>加权</small></span><span class="ff-track"><u class="ff-pline" style="left:${x(price)}"><span>现价 ${px(price)}</span></u><i class="ff-bar composite" style="left:${x(v.composite.low)};width:calc(${x(v.composite.high)} - ${x(v.composite.low)})"></i><b class="ff-dot" style="left:${x(v.composite.fair)}"></b></span><span class="ff-value">${px(v.composite.fair)}</span></div>` : '';
    $('#footballField').innerHTML = `<div class="ff-wrap">${comp}${rows.map(row).join('')}</div><div class="ff-axis"><span>${px(lo)}</span><span>${px((lo + hi) / 2)}</span><span>${px(hi)}</span></div>`;
  }

  function renderValuationTable(v) {
    const m = v.models; const r = [];
    const line = (key, detail) => { const mod = m[key]; r.push(`<tr class="${mod.applicable ? '' : 'na'}"><td>${METHOD_LABELS[key]}</td><td class="num">${mod.applicable ? px(mod.value) : '—'}</td><td>${mod.applicable ? detail : esc(mod.reason || '不适用')}</td></tr>`); };
    const d = m.dcf; line('dcf', d.applicable ? `WACC ${pct(d.wacc, 2)} · 终值占比 ${pct(d.tvShare, 0)} · 现金转换率 ${pct(d.c0, 0)}→${pct(d.cT, 0)} · ROIC ${pct(d.roic0, 0)} / RONIC ${pct(d.ronic, 0)}${d.mode === 'fcf-growth' ? ' · FCF 增长模式' : ''}` : '');
    const ri = m.ri; line('ri', ri.applicable ? `Ke ${pct(ri.re, 2)} · ROE ${pct(ri.roe0)} → 长期 ${pct(ri.roeLR)} · 每股净资产 ${px(ri.bookPerShare)} · 合理 P/B ${num(ri.justifiedPB, 2)} · ω=0.62` : '');
    const dd = m.ddm; line('ddm', dd.applicable ? `${dd.includesBuybacks ? '股息+回购' : '股息'} ${px(dd.payoutPerShare)}/股 · 回报率 ${pct(dd.payoutRatio, 0)} · 首段增速 ${pct(dd.g1)}` : '');
    const h = m.history; line('history', h.applicable ? h.parts.map((p) => `${p.label} ${num(p.multiple, 1)}x（当前 ${num(p.current, 1)}x）`).join(' · ') : '');
    const p = m.peers; line('peers', p.applicable ? p.parts.map((q) => `${q.label} 同业中位 ${num(q.peerMedian, 1)}x vs ${num(q.own, 1)}x`).join(' · ') : '');
    $('#valuationTable').innerHTML = `<table class="data-table"><thead><tr><th>模型</th><th class="num">每股价值</th><th>关键参数</th></tr></thead><tbody>${r.join('')}</tbody></table>`;
  }

  function renderWacc(v) {
    const r = v.rates; const a = v.assumptions;
    $('#waccBox').innerHTML = `<div class="wacc-line"><span>股权成本 Ke = rf ${pct(a.rf, 2)} + β ${num(a.beta, 2)} × (ERP ${pct(a.erp, 2)} + CRP ${pct(a.crp, 2)})</span><strong>${pct(r.re, 2)}</strong></div>
      <div class="wacc-line"><span>税后债务成本 = ${pct(a.costOfDebt, 2)} × (1 − ${pct(a.taxRate, 0)})</span><strong>${pct(r.rdAfterTax, 2)}</strong></div>
      <div class="wacc-line total"><span>WACC = ${pct(r.wE, 0)} × Ke + ${pct(r.wD, 0)} × Kd(1−t)</span><strong>${pct(r.wacc, 2)}</strong></div>
      <div class="wacc-source">β 来源：${esc(a.betaSource)} · 增长依据：${(a.growthEvidence || []).map((e) => `${esc(e.label)} ${pct(e.v)}`).join('，') || '无，使用默认'}</div>`;
  }

  function renderDcfTable(v) {
    const d = v.models.dcf; if (!d.applicable) { $('#dcfTable').innerHTML = `<div class="mini-empty">${esc(d.reason)}</div>`; return; }
    const head = `<tr><th>年</th>${d.rows.map((r) => `<th>${r.t}</th>`).join('')}<th>终值</th></tr>`;
    const tr = (label, f) => `<tr><td>${label}</td>${d.rows.map((r) => `<td>${f(r)}</td>`).join('')}`;
    $('#dcfTable').innerHTML = `<div class="table-scroll"><table class="data-table compact"><thead>${head}</thead><tbody>
      ${tr('增速', (r) => pct(r.g, 1))}<td>${pct(v.assumptions.gT, 1)}</td></tr>
      ${tr('NOPAT', (r) => big(r.nopat))}<td></td></tr>
      ${tr('转换率', (r) => pct(r.conv, 0))}<td>${pct(d.cT, 0)}</td></tr>
      ${tr('FCFF', (r) => big(r.fcff))}<td></td></tr>
      ${tr('现值', (r) => big(r.pv))}<td>${big(d.pvTerminal)}</td></tr>
      </tbody></table></div><div class="dcf-bridge">${kv('显性期现值', big(d.pvExplicit))}${kv('终值现值', big(d.pvTerminal))}${kv('企业价值 EV', big(d.ev))}${kv('− 净负债/少数股东', big(d.ev - d.equity))}${kv('股权价值', big(d.equity))}${kv('隐含退出 EV/EBITDA', `${num(d.impliedExitEvEbitda, 1)}x`)}</div><div class="unit-note">金额单位：${esc(v.base.financialCurrency)}</div>`;
  }

  function renderSensitivity(v) {
    const s = v.sensitivity; if (!s) { $('#sensitivityGrid').innerHTML = '<div class="mini-empty">DCF 不适用</div>'; return; }
    const price = v.base.price;
    const cell = (val) => { if (!isNum(val)) return '<td class="na">—</td>'; const up = val / price - 1; const a = Math.min(1, Math.abs(up) / 0.5); const bg = up >= 0 ? `rgba(80,227,194,${0.08 + a * 0.32})` : `rgba(255,110,119,${0.08 + a * 0.32})`; return `<td style="background:${bg}" title="${spct(up)} vs 现价">${px(val)}</td>`; };
    $('#sensitivityGrid').innerHTML = `<table class="data-table heat"><thead><tr><th>g \\ WACC</th>${s.waccs.map((w) => `<th>${pct(w, 1)}</th>`).join('')}</tr></thead><tbody>${s.grid.map((row, i) => `<tr><th>${pct(s.gs[i], 1)}</th>${row.map(cell).join('')}</tr>`).join('')}</tbody></table><div class="unit-note">绿色 = 高于现价，红色 = 低于现价；中心格为基准假设。</div>`;
  }

  function renderMonteCarlo(v) {
    const mc = v.monteCarlo; if (!mc || !mc.hist) { $('#monteCarloChart').innerHTML = '<div class="mini-empty">DCF 不适用</div>'; return; }
    const h = mc.hist; const W = 320; const H = 120; const max = Math.max(...h.counts); const bw = W / h.counts.length; const price = v.base.price;
    const bars = h.counts.map((c, i) => { const x0 = h.lo + i * h.width; const above = x0 + h.width / 2 > price; const bh = (c / max) * (H - 18); return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - 14 - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${above ? COLORS.cyan : COLORS.red}" opacity=".7"/>`; }).join('');
    const xp = ((price - h.lo) / (h.hi - h.lo)) * W; const priceLine = xp >= 0 && xp <= W ? `<line x1="${xp}" x2="${xp}" y1="0" y2="${H - 14}" stroke="${COLORS.orange}" stroke-dasharray="3 3"/><text x="${Math.min(W - 40, xp + 3)}" y="10" fill="${COLORS.orange}" font-size="9">现价</text>` : '';
    $('#monteCarloChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="mini-svg">${bars}${priceLine}<text x="0" y="${H - 2}" fill="${COLORS.muted}" font-size="9">${px(h.lo)}</text><text x="${W}" y="${H - 2}" fill="${COLORS.muted}" font-size="9" text-anchor="end">${px(h.hi)}</text></svg>
      <div class="mc-stats">${kv('P10', px(mc.p10))}${kv('P50', px(mc.p50))}${kv('P90', px(mc.p90))}${kv('高于现价概率', pct(mc.probAbovePrice, 0), cls(mc.probAbovePrice - 0.5))}</div>
      <div class="unit-note">扰动：g₁ ±${pct(Math.max(0.03, Math.abs(v.assumptions.g1) * 0.35), 0)}、WACC ±1%、g ±0.5%、RONIC ±20%、NOPAT ±8%、现金转换 ±10%（1σ）。</div>`;
  }

  // ------------------------------------------------------- fundamentals & quality
  function renderFundamentals(v) {
    const body = $('#fundamentalsBody'); const qb = $('#qualityBody');
    if (!v) { body.innerHTML = '<div class="mini-empty">无基本面数据</div>'; qb.innerHTML = '<div class="mini-empty">无基本面数据</div>'; $('#fundamentalsTag').textContent = '--'; $('#qualityTag').textContent = '--'; return; }
    const b = v.base; const q = v.quality.metrics; const st = b.stats || {};
    $('#fundamentalsTag').textContent = [b.sector, b.industry].filter(Boolean).join(' · ') || (b.name || '');
    body.innerHTML = `
      <div class="kv-grid">
        ${kv('ROIC', pct(q.roic), cls(q.roicSpread), 'NOPAT / (净资产+有息负债+少数股东−现金)')}${kv('ROIC − WACC', spct(q.roicSpread), cls(q.roicSpread))}${kv('ROE', pct(q.roe), cls(q.roe - 0.1))}${kv('毛利率', pct(q.grossMargin))}
        ${kv('营业利润率', pct(q.operatingMargin))}${kv('净利率', pct(q.netMargin))}${kv('FCF / 净利润', pct(q.fcfConversion, 0), cls(q.fcfConversion - 0.8), '自由现金流对利润的覆盖，>80% 较健康')}${kv('应计比率', pct(q.accruals), cls(-q.accruals), '(净利润−经营现金流)/总资产，越低越好（Sloan 1996）')}
        ${kv('利息保障倍数', isNum(q.interestCoverage) ? `${num(q.interestCoverage, 1)}x` : '--', cls(q.interestCoverage - 3))}${kv('净负债 / EBITDA', isNum(q.netDebtToEbitda) ? `${num(q.netDebtToEbitda, 2)}x` : '--', cls(2.5 - q.netDebtToEbitda))}${kv('营收 CAGR', spct(q.revenueCagr), cls(q.revenueCagr))}${kv('EPS CAGR', spct(q.epsCagr), cls(q.epsCagr))}
        ${kv('P/E (TTM)', isNum(st.trailingPE) ? `${num(st.trailingPE, 1)}x` : '--')}${kv('P/E (预期)', isNum(st.forwardPE) ? `${num(st.forwardPE, 1)}x` : '--')}${kv('EV/EBITDA', isNum(st.evToEbitda) ? `${num(st.evToEbitda, 1)}x` : '--')}${kv('P/B', isNum(st.priceToBook) ? `${num(st.priceToBook, 2)}x` : '--')}
        ${kv('股息率', pct(st.dividendYield, 2))}${kv('股东回报率', pct(b.totalPayoutRatio, 0), '', '(股息+回购)/净利润，3 年平均')}${kv('PEG', isNum(st.pegRatio) ? num(st.pegRatio, 2) : '--')}${kv('经营利润率波动', pct(q.marginStability), '', '历年营业利润率标准差，越低越稳定')}
      </div>
      <div class="sub-title">年度营收与自由现金流</div>${historyBars(b)}`;
    const f = v.quality.piotroski; const z = v.quality.altman;
    $('#qualityTag').textContent = `质量因子 ${isNum(v.quality.factor) ? (v.quality.factor >= 0 ? '+' : '') + v.quality.factor.toFixed(2) : '--'}`;
    qb.innerHTML = `
      <div class="quality-head">
        <div class="score-ring ${f ? (f.scaled >= 7 ? 'good' : f.scaled >= 4 ? 'mid' : 'bad') : ''}"><strong>${f ? `${f.score}/${f.available}` : '--'}</strong><span>Piotroski F</span></div>
        <div class="score-ring ${z ? (z.zone === 'safe' ? 'good' : z.zone === 'grey' ? 'mid' : 'bad') : ''}"><strong>${z ? num(z.z, 2) : '--'}</strong><span>Altman Z″ ${z ? z.zoneLabel : (b.isFinancial ? '金融业不适用' : '数据不足')}</span></div>
      </div>
      <ul class="fscore-list">${f ? f.tests.map((t) => `<li class="${t.pass === null ? 'na' : t.pass ? 'pass' : 'fail'}"><i>${t.pass === null ? '–' : t.pass ? '✓' : '✗'}</i><span>${esc(t.name)}<small>${esc(t.group)}</small></span><em>${esc(t.detail || '')}</em></li>`).join('') : '<li class="na">需要至少两年年报</li>'}</ul>
      <div class="unit-note">F-score：Piotroski (2000) 九项财务改善检验，以最近两个财年比较（${esc(f?.period || '--')}）。Z″：Altman (1995) 非制造/新兴市场版本，&gt;2.6 安全、1.1–2.6 灰色、&lt;1.1 困境。</div>`;
  }
  function historyBars(b) {
    const rows = b.annual.filter((p) => isNum(p.revenue)).slice(-5); if (rows.length < 2) return '<div class="mini-empty">年报数据不足</div>';
    const max = Math.max(...rows.map((r) => Math.max(r.revenue, Math.abs(r.freeCashFlow || 0)))); const W = 640; const H = 120; const gw = W / rows.length; const bw = gw * 0.32;
    const bars = rows.map((r, i) => { const x = i * gw + gw * 0.16; const rh = (r.revenue / max) * (H - 26); const f = r.freeCashFlow || 0; const fh = (Math.abs(f) / max) * (H - 26); return `<rect x="${x}" y="${H - 16 - rh}" width="${bw}" height="${rh}" rx="2" fill="${COLORS.blue}" opacity=".75"/><rect x="${x + bw + 3}" y="${H - 16 - fh}" width="${bw}" height="${fh}" rx="2" fill="${f >= 0 ? COLORS.cyan : COLORS.red}" opacity=".8"/><text x="${x + bw}" y="${H - 3}" text-anchor="middle" fill="${COLORS.muted}" font-size="9">${r.date.slice(0, 4)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="mini-svg">${bars}</svg><div class="legend-row"><span><i style="background:${COLORS.blue}"></i>营收</span><span><i style="background:${COLORS.cyan}"></i>自由现金流</span><span>${esc(b.financialCurrency)} · 最新 ${big(rows.at(-1).revenue)} / ${big(rows.at(-1).freeCashFlow)}</span></div>`;
  }

  // ------------------------------------------------------------ quant analytics
  function renderQuant(an) {
    const r = an.riskStats; const c = an.capm;
    if (!r) { ['#quantWindows', '#quantRisk', '#capmBox', '#distChart', '#drawdownChart', '#monthlyHeatmap', '#priceCone'].forEach((id) => { $(id).innerHTML = '<div class="mini-empty">历史数据不足</div>'; }); $('#quantTag').textContent = '--'; return; }
    $('#quantTag').textContent = `${an.sampleYears ? an.sampleYears.toFixed(1) : '--'} 年日线 · 复权价`;
    $('#quantWindows').innerHTML = `<table class="data-table"><thead><tr><th>区间</th><th class="num">年化收益</th><th class="num">年化波动</th><th class="num">Sharpe</th><th class="num">Sortino</th><th class="num">最大回撤</th></tr></thead><tbody>${an.windows.map((w) => (w.available ? `<tr><td>${w.label}</td><td class="num ${cls(w.cagr)}">${spct(w.cagr)}</td><td class="num">${pct(w.vol)}</td><td class="num">${num(w.sharpe, 2)}</td><td class="num">${num(w.sortino, 2)}</td><td class="num negative">${pct(w.maxDrawdown)}</td></tr>` : `<tr class="na"><td>${w.label}</td><td colspan="5">历史不足</td></tr>`)).join('')}</tbody></table>`;
    const vr5 = an.vr5; const vr20 = an.vr20;
    $('#quantRisk').innerHTML = `<div class="kv-grid four">
      ${kv('VaR 95% · 1日（历史）', pct(r.var95, 2), 'negative', '历史模拟法：最差 5% 日收益分位数')}${kv('CVaR / ES 95%', pct(r.cvar95, 2), 'negative', '超过 VaR 时的平均损失')}${kv('VaR 95%（正态）', pct(r.paramVar95, 2))}${kv('VaR 95%（Cornish–Fisher）', pct(r.cfVar95, 2), '', '用偏度、峰度修正的 VaR')}
      ${kv('偏度', num(r.skew, 2), cls(r.skew))}${kv('超额峰度', num(r.kurtosis, 2), '', '>0 表示肥尾')}${kv('Jarque–Bera p 值', isNum(r.jbPValue) ? (r.jbPValue < 0.001 ? '<0.001' : num(r.jbPValue, 3)) : '--', '', 'p<0.05 拒绝正态分布')}${kv('上涨日占比', pct(r.hitRate, 1))}
      ${kv('EWMA 波动 (λ=0.94)', pct(r.ewmaVolAnnual), '', 'RiskMetrics 指数加权，对近期更敏感')}${kv('20 日波动分位', pct(r.volPercentile, 0), '', '当前 20 日波动在历史中的百分位')}${kv('当前回撤', pct(r.currentDrawdown), cls(r.currentDrawdown))}${kv('最长水下天数', `${r.drawdown.longestUnderwaterDays} 日`)}
      ${kv('一阶自相关', num(r.autocorr1, 3))}${kv('方差比 VR(5)', vr5 ? `${num(vr5.vr, 2)} (p ${num(vr5.p, 2)})` : '--', '', 'Lo–MacKinlay：>1 趋势、<1 均值回归')}${kv('方差比 VR(20)', vr20 ? `${num(vr20.vr, 2)} (p ${num(vr20.p, 2)})` : '--')}${kv('Calmar', num(r.calmar, 2))}
    </div>`;
    $('#capmBox').innerHTML = !c ? '<div class="mini-empty">基准数据不足，无法回归</div>' : `<div class="capm-head">相对 <b>${esc(an.benchmarkName)}</b> · 周收益 OLS · ${c.weeks} 周</div><div class="kv-grid four">
      ${kv('β（原始）', `${num(c.beta, 2)} ± ${num(c.betaSE, 2)}`)}${kv('β（Blume 调整）', num(c.betaBlume, 2), '', '0.67β + 0.33，向 1 收缩')}${kv('年化 α (Jensen)', spct(c.alphaAnnual), cls(c.alphaAnnual), `t=${num(c.alphaT, 2)}`)}${kv('α 显著性 p', num(c.alphaP, 3), c.alphaP < 0.05 ? 'positive' : '')}
      ${kv('R²', num(c.r2, 2))}${kv('相关系数', num(c.correlation, 2))}${kv('特质波动', pct(c.idioVol))}${kv('信息比率', num(c.informationRatio, 2), cls(c.informationRatio))}
      ${kv('跟踪误差', pct(c.trackingError))}${kv('上行捕获', pct(c.upCapture, 0))}${kv('下行捕获', pct(c.downCapture, 0), cls(1 - c.downCapture))}${kv('系统性风险占比', pct(c.r2, 0))}
    </div>`;
    $('#distChart').innerHTML = distributionSvg(r);
    $('#drawdownChart').innerHTML = drawdownSvg(an.ddTs, r.drawdown.series, r.drawdown);
    $('#monthlyHeatmap').innerHTML = monthlyHeat(an.monthly);
    $('#priceCone').innerHTML = an.cone.length ? `<table class="data-table"><thead><tr><th>期限</th><th class="num">5%</th><th class="num">16%</th><th class="num">中位</th><th class="num">84%</th><th class="num">95%</th></tr></thead><tbody>${an.cone.map((k) => `<tr><td>${k.label}</td><td class="num negative">${px(k.p05)}</td><td class="num">${px(k.p16)}</td><td class="num">${px(k.p50)}</td><td class="num">${px(k.p84)}</td><td class="num positive">${px(k.p95)}</td></tr>`).join('')}</tbody></table><div class="unit-note">对数正态、零漂移，σ 取 EWMA 波动 ${pct(r.ewmaVolAnnual)}；用于设定止损/目标的合理区间，不是方向预测。</div>` : '';
  }
  function distributionSvg(r) {
    const h = QSAnalytics.histogram(r.returns.slice(-504), 35); if (!h) return '<div class="mini-empty">--</div>'; const W = 360; const H = 120; const max = Math.max(...h.counts, ...h.normal); const bw = W / h.counts.length;
    const bars = h.counts.map((c, i) => { const bh = (c / max) * (H - 16); const mid = h.lo + (i + 0.5) * h.width; return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - 14 - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${mid < -r.var95 ? COLORS.red : COLORS.blue}" opacity=".65"/>`; }).join('');
    const curve = h.normal.map((c, i) => `${(i * bw + bw / 2).toFixed(1)},${(H - 14 - (c / max) * (H - 16)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="mini-svg">${bars}<polyline points="${curve}" fill="none" stroke="${COLORS.orange}" stroke-width="1.4"/><text x="0" y="${H - 2}" fill="${COLORS.muted}" font-size="9">${pct(h.lo, 1)}</text><text x="${W}" y="${H - 2}" fill="${COLORS.muted}" font-size="9" text-anchor="end">${pct(h.hi, 1)}</text></svg><div class="legend-row"><span><i style="background:${COLORS.blue}"></i>近 2 年日收益</span><span><i style="background:${COLORS.red}"></i>VaR 95% 尾部</span><span><i style="background:${COLORS.orange}"></i>同均值方差的正态分布</span></div>`;
  }
  function drawdownSvg(ts, series, dd) {
    if (!series?.length) return ''; const W = 360; const H = 110; const min = Math.min(...series, -0.01); const step = Math.max(1, Math.floor(series.length / 360));
    const pts = []; for (let i = 0; i < series.length; i += step) pts.push(`${((i / (series.length - 1)) * W).toFixed(1)},${((series[i] / min) * (H - 14)).toFixed(1)}`); pts.push(`${W},${((series.at(-1) / min) * (H - 14)).toFixed(1)}`);
    return `<svg viewBox="0 0 ${W} ${H}" class="mini-svg"><polygon points="0,0 ${pts.join(' ')} ${W},0" fill="rgba(255,110,119,.22)" stroke="${COLORS.red}" stroke-width="1"/><text x="${W}" y="${H - 2}" fill="${COLORS.muted}" font-size="9" text-anchor="end">最深 ${pct(min)}</text></svg><div class="legend-row"><span>最大回撤 ${pct(dd.maxDrawdown)}（${formatDate(dd.peakDate, true)} → ${formatDate(dd.troughDate, true)}）</span><span>${dd.recoveryDate ? `修复用时 ${dd.recoveryDays} 个交易日` : '尚未修复'}</span></div>`;
  }
  function monthlyHeat(m) {
    if (!m || !m.years.length) return ''; const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const cell = (v) => { if (!isNum(v)) return '<td class="na"></td>'; const a = Math.min(1, Math.abs(v) / 0.12); return `<td style="background:${v >= 0 ? `rgba(80,227,194,${0.06 + a * 0.5})` : `rgba(255,110,119,${0.06 + a * 0.5})`}">${(v * 100).toFixed(1)}</td>`; };
    return `<div class="table-scroll"><table class="data-table heat monthly"><thead><tr><th></th>${months.map((x) => `<th>${x}月</th>`).join('')}<th>全年</th></tr></thead><tbody>${m.years.map((y) => `<tr><th>${y}</th>${months.map((x) => cell(m.table[y][x])).join('')}${cell(m.yearly[y])}</tr>`).join('')}<tr class="avg-row"><th>均值</th>${months.map((x) => cell(m.monthAvg[x]?.mean)).join('')}<td></td></tr><tr class="avg-row"><th>胜率</th>${months.map((x) => `<td>${m.monthAvg[x] ? pct(m.monthAvg[x].hit, 0) : ''}</td>`).join('')}<td></td></tr></tbody></table></div><div class="unit-note">月度收益 %（复权）。样本只有几年，季节性统计意义有限。</div>`;
  }

  // -------------------------------------------------------------------- backtest
  function renderBacktest(an) {
    const bt = an.backtest; const body = $('#backtestBody');
    if (!bt || !bt.samples) { body.innerHTML = '<div class="mini-empty">历史数据不足（至少需要约 1 年日线）</div>'; $('#equityChart').innerHTML = ''; $('#backtestTag').textContent = '--'; return; }
    $('#backtestTag').textContent = `${formatDate(bt.start, true)} – ${formatDate(bt.end, true)} · ${bt.horizon} 日前瞻`;
    const row = (label, s, dir) => (s.n ? `<tr><td>${label}</td><td class="num">${s.n}</td><td class="num ${cls(s.mean)}">${spct(s.mean, 2)}</td><td class="num">${pct(s.hitRate, 0)}</td><td class="num">${num(s.t, 2)}</td><td class="num">${pct(s.posterior, 0)}</td></tr>` : `<tr class="na"><td>${label}</td><td colspan="5">样本内没有出现</td></tr>`);
    const S = bt.strategy; const B = bt.buyHold;
    body.innerHTML = `<table class="data-table"><thead><tr><th>历史信号（技术分）</th><th class="num">样本日</th><th class="num">${bt.horizon}日平均收益</th><th class="num">胜率</th><th class="num">t 值*</th><th class="num">收缩胜率</th></tr></thead><tbody>
      ${row(`做多 (≥ ${bt.thresholds.longThr})`, bt.buckets.long)}${row('观望', bt.buckets.neutral)}${row(`做空 (≤ ${bt.thresholds.shortThr})`, bt.buckets.short)}${row('全部（无条件）', bt.unconditional)}</tbody></table>
      <div class="kv-grid four bt-kv">${kv('信息系数 IC (Spearman)', num(bt.ic, 3), cls(bt.ic), '技术分与未来 20 日收益的秩相关')}${kv('IC t 值 / p', `${num(bt.icT, 2)} / ${num(bt.icP, 3)}`, bt.icP < 0.05 ? 'positive' : '')}${kv('策略年化 / 买入持有', `${spct(S.cagr)} / ${spct(B.cagr)}`, cls(S.cagr - B.cagr))}${kv('策略 Sharpe / 买入持有', `${num(S.sharpe, 2)} / ${num(B.sharpe, 2)}`, cls(S.sharpe - B.sharpe))}
      ${kv('策略最大回撤', pct(S.maxDrawdown), 'negative')}${kv('买入持有最大回撤', pct(B.maxDrawdown), 'negative')}${kv('持仓时间占比', pct(S.exposure, 0))}${kv('调仓次数', `${S.trades} 次`)}</div>`;
    $('#equityChart').innerHTML = equitySvg(bt);
    $('#backtestNote').textContent = `* t 值按 ${bt.horizon} 日重叠样本折算有效样本数（n/${bt.horizon}）；收缩胜率为 Beta(5,5) 先验下的后验均值，用作模型置信度。阈值事先固定、未做参数优化；只检验量价技术分（估值因子没有可回溯的时点数据）。策略为收盘信号、次日生效，${an.allowShort ? '多空' : '只做多/空仓'}，单边成本 10bp。样本内结果不代表未来。`;
  }
  function equitySvg(bt) {
    const s = bt.strategy.curve; const h = bt.buyHold.curve; const W = 760; const H = 150; const all = s.concat(h); const lo = Math.min(...all); const hi = Math.max(...all); const step = Math.max(1, Math.floor(s.length / 500));
    const line = (arr) => { const p = []; for (let i = 0; i < arr.length; i += step) p.push(`${((i / (arr.length - 1)) * W).toFixed(1)},${(H - 12 - ((arr[i] - lo) / (hi - lo || 1)) * (H - 22)).toFixed(1)}`); return p.join(' '); };
    const y1 = H - 12 - ((1 - lo) / (hi - lo || 1)) * (H - 22);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="wide-svg"><line x1="0" x2="${W}" y1="${y1}" y2="${y1}" stroke="${COLORS.grid}"/><polyline points="${line(h)}" fill="none" stroke="${COLORS.violet}" stroke-width="1.4" stroke-dasharray="4 3"/><polyline points="${line(s)}" fill="none" stroke="${COLORS.cyan}" stroke-width="1.8"/></svg><div class="legend-row"><span><i style="background:${COLORS.cyan}"></i>技术信号策略 ${spct(bt.strategy.total, 0)}</span><span><i style="background:${COLORS.violet}"></i>买入持有 ${spct(bt.buyHold.total, 0)}</span></div>`;
  }

  // ------------------------------------------------------------ assumption form
  const FORM_FIELDS = [['rf', '%'], ['erp', '%'], ['crp', '%'], ['beta', 'x'], ['g1', '%'], ['gT', '%'], ['terminalRoic', '%'], ['taxRate', '%'], ['costOfDebt', '%']];
  function fillAssumptionForm(a) {
    FORM_FIELDS.forEach(([k, unit]) => { const el = document.getElementById(`as_${k}`); if (!el) return; const v = a[k]; el.value = isNum(v) ? (unit === '%' ? (v * 100).toFixed(2) : Number(v).toFixed(2)) : ''; if (k === 'terminalRoic' && !isNum(v)) el.placeholder = '自动'; });
  }
  function readAssumptionForm() {
    const out = {}; FORM_FIELDS.forEach(([k, unit]) => { const el = document.getElementById(`as_${k}`); if (!el || el.value.trim() === '') return; const v = Number(el.value); if (Number.isFinite(v)) out[k] = unit === '%' ? v / 100 : v; });
    return out;
  }
  function readManualFundamentals(symbol, price, currency) {
    const val = (id) => { const el = document.getElementById(id); const v = el && el.value.trim() !== '' ? Number(el.value) : null; return Number.isFinite(v) ? v : null; };
    const yi = 1e8; const ni = val('mf_netIncome'); const ebit = val('mf_ebit'); const fcf = val('mf_fcf'); const nd = val('mf_netDebt'); const eq = val('mf_equity'); const sh = val('mf_shares'); const dps = val('mf_dps'); const g = val('mf_growth');
    if (!sh || (!ni && !ebit && !fcf)) return null;
    const shares = sh * yi; const annual = [{ date: new Date().toISOString().slice(0, 10), netIncome: ni ? ni * yi : null, ebit: ebit ? ebit * yi : null, operatingIncome: ebit ? ebit * yi : null, freeCashFlow: fcf ? fcf * yi : null, equity: eq ? eq * yi : null, totalDebt: nd && nd > 0 ? nd * yi : 0, cash: nd && nd < 0 ? -nd * yi : 0, sharesOutstanding: shares }];
    return { symbol, manual: true, currency, financialCurrency: currency, fxToPrice: 1, price, marketCap: price * shares, profile: { name: symbol }, stats: { dividendRate: dps || 0 }, financial: {}, analyst: { epsGrowthLongTerm: isNum(g) ? g / 100 : null }, annual, ttm: {}, latestBalance: annual[0], sources: { manual: true } };
  }

  root.QSPanels = { renderValuation, renderFundamentals, renderQuant, renderBacktest, fillAssumptionForm, readAssumptionForm, readManualFundamentals };
}(window));
