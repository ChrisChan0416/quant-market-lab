/*
 * QuantScope v2.1 — news-sentiment panel (LLM-scored headlines via /api/sentiment).
 * v2.4 — also indices, futures, FX and crypto; the panel shows the asset class and what a positive score means.
 * The factor is shown on its own and is NOT part of the composite score: news cannot be
 * replayed for the 5-year backtest, so it first has to earn its place with a forward test.
 */
(function (root) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sgn = (x, d = 2) => (isNum(x) ? `${x >= 0 ? '+' : ''}${Number(x).toFixed(d)}` : '--');
  const cls = (x, band = 0.12) => (!isNum(x) ? '' : x >= band ? 'positive' : x <= -band ? 'negative' : '');
  const kv = (label, value, klass = '', hint = '') => `<div class="kv"${hint ? ` title="${esc(hint)}"` : ''}><span>${label}</span><strong class="${klass}">${value}</strong></div>`;
  const MIN_IC_DAYS = 20;
  const HORIZON = 5;

  function ago(ts) {
    const h = (Date.now() / 1000 - ts) / 3600;
    if (h < 1) return '刚刚'; if (h < 24) return `${Math.round(h)} 小时前`; return `${Math.round(h / 24)} 天前`;
  }
  function safeLink(url) { return /^https?:\/\//i.test(url || '') ? url : null; }

  // Spearman rank correlation
  function rank(values) {
    const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(values.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  }
  function pearson(a, b) {
    const n = a.length; const ma = a.reduce((s, x) => s + x, 0) / n; const mb = b.reduce((s, x) => s + x, 0) / n;
    let sab = 0; let saa = 0; let sbb = 0; for (let i = 0; i < n; i += 1) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
  }

  // Pair each recorded daily score with the next-HORIZON-day return from the first close on/after that date.
  function forwardTest(history, payload, horizon = HORIZON) {
    const out = { recorded: history?.length || 0, n: 0, horizon };
    if (!history?.length || !payload?.timestamps?.length) return out;
    const dates = payload.timestamps.map((t) => new Date(t * 1000).toISOString().slice(0, 10)); const px = payload.adj || payload.closes;
    const pairs = [];
    history.forEach((h) => { if (!isNum(h.score)) return; const i = dates.findIndex((d) => d >= h.date); if (i < 0 || i + horizon >= px.length) return; pairs.push([h.score, px[i + horizon] / px[i] - 1]); });
    out.n = pairs.length; out.pending = out.recorded - pairs.length;
    if (pairs.length < 3) return out;
    const s = pairs.map((p) => p[0]); const r = pairs.map((p) => p[1]);
    out.ic = pearson(rank(s), rank(r));
    if (isNum(out.ic) && Math.abs(out.ic) < 1) out.t = out.ic * Math.sqrt((pairs.length - 2) / (1 - out.ic ** 2));
    const directional = pairs.filter((p) => Math.abs(p[0]) >= 0.12);
    out.directional = directional.length;
    if (directional.length) out.hitRate = directional.filter((p) => Math.sign(p[0]) === Math.sign(p[1])).length / directional.length;
    return out;
  }

  function sparkline(history) {
    const pts = (history || []).filter((h) => isNum(h.score)); if (pts.length < 2) return '';
    const W = 300; const H = 70; const x = (i) => (i / (pts.length - 1)) * W; const y = (v) => H / 2 - v * (H / 2 - 4);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="2" fill="${p.score >= 0 ? '#50e3c2' : '#ff6e77'}"><title>${esc(p.date)} ${sgn(p.score)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="wide-svg sentiment-spark"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="rgba(154,176,205,.18)" stroke-dasharray="3 3"/><polyline points="${line}" fill="none" stroke="#ae8cff" stroke-width="1.4"/>${dots}</svg><div class="legend-row"><span>${esc(pts[0].date)}</span><span style="margin-left:auto">${esc(pts.at(-1).date)}</span></div>`;
  }

  function gauge(score) {
    const left = isNum(score) ? ((Number(score) + 1) / 2) * 100 : 50;
    return `<div class="senti-gauge"><div class="senti-track"><span class="senti-mid"></span><i style="left:${left.toFixed(1)}%"></i></div><div class="senti-ends"><span>-1 偏空</span><span>0</span><span>+1 偏多</span></div></div>`;
  }

  function itemRow(item) {
    const scored = isNum(item.sentiment); const link = safeLink(item.link);
    const title = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>` : esc(item.title);
    const chip = scored ? `<b class="senti-chip ${cls(item.sentiment, 0.15)}">${sgn(item.sentiment)}</b>` : '<b class="senti-chip muted">--</b>';
    const meta = [esc(item.source), ago(item.published), scored ? esc(item.eventLabel || item.event) : '未打分', scored ? `相关 ${Math.round(item.relevance * 100)}%` : null].filter(Boolean).join(' · ');
    return `<li class="${scored && item.relevance < 0.5 ? 'low-rel' : ''}">${chip}<div><p>${title}</p><small>${meta}</small>${scored && item.reason ? `<em>${esc(item.reason)}</em>` : ''}</div></li>`;
  }

  function renderList(items) {
    if (!items?.length) return '<div class="mini-empty">最近 14 天没有抓到相关新闻。</div>';
    const sorted = [...items].sort((a, b) => (b.weight ?? -1) * Math.abs(b.sentiment ?? 0) - (a.weight ?? -1) * Math.abs(a.sentiment ?? 0) || b.published - a.published);
    const head = sorted.slice(0, 10).map(itemRow).join(''); const rest = sorted.slice(10);
    return `<ul class="senti-list">${head}</ul>${rest.length ? `<details class="senti-more"><summary>其余 ${rest.length} 条</summary><ul class="senti-list">${rest.map(itemRow).join('')}</ul></details>` : ''}`;
  }

  function renderEvents(events) {
    if (!events?.length) return '<div class="mini-empty">没有相关度 ≥ 50% 的新闻。</div>';
    const max = Math.max(...events.map((e) => e.count));
    return `<div class="senti-events">${events.map((e) => `<div><span>${esc(e.label)}</span><div class="senti-bar"><i class="${e.avg >= 0 ? 'pos' : 'neg'}" style="width:${(e.count / max) * 100}%"></i></div><strong class="${cls(e.avg, 0.15)}">${e.count} 条 · ${sgn(e.avg)}</strong></div>`).join('')}</div>`;
  }

  function renderForward(test) {
    const progress = `已记录 ${test.recorded} 天，其中 ${test.n} 天已有 ${test.horizon} 日后收益`;
    if (test.n < MIN_IC_DAYS) {
      const pct = Math.min(100, (test.n / MIN_IC_DAYS) * 100);
      return `<div class="senti-ic-wait"><div class="senti-progress"><i style="width:${pct}%"></i></div><p>${progress}。满 ${MIN_IC_DAYS} 天后显示 Rank IC。每天打开这个标的会自动记录一次；也可以用命令行批量记录（见 README）。</p></div>`;
    }
    const verdict = !isNum(test.t) ? '样本不足' : Math.abs(test.t) >= 2 ? (test.ic > 0 ? '正向有效（|t| ≥ 2）' : '反向显著，需排查') : '尚未显著';
    return `<div class="kv-grid senti-ic">${kv(`Rank IC · ${test.horizon} 日`, sgn(test.ic, 3), cls(test.ic, 0.03))}${kv('t 值', sgn(test.t, 2), isNum(test.t) && Math.abs(test.t) >= 2 ? 'positive' : '')}${kv('方向命中率', isNum(test.hitRate) ? `${Math.round(test.hitRate * 100)}%` : '--', '', `|分数| ≥ 0.12 的 ${test.directional} 天`)}${kv('结论', verdict)}</div><p class="senti-foot">${progress}。单个标的的时间序列 IC 噪声很大，最好在多个标的上合并检验。</p>`;
  }

  function renderSetup(data) {
    return `<div class="senti-setup"><strong>还没连上 SoCLaaS，下面是未打分的新闻。</strong><p>在项目文件夹新建 <code>soclaas.env</code>（可复制 <code>soclaas.env.example</code>），填入：</p><pre>SOCLAAS_API_KEY=你的 key
SOCLAAS_BASE_URL=SoCLaaS 文档里的地址（通常以 /v1 结尾）
SOCLAAS_MODEL=x-test-1</pre><p>保存后重启 QuantScope。${data?.llmError ? `<br>最近一次错误：${esc(data.llmError)}` : ''}</p></div>`;
  }

  function setStatus(text, warn = false) { const el = $('#sentimentStatus'); el.textContent = text; el.className = `plan-tag ${warn ? 'warn' : ''}`; }

  function renderLoading(symbol) {
    setStatus('读取中'); $('#sentimentHero').innerHTML = `<div class="valuation-empty">正在抓取 ${esc(symbol)} 最近 14 天的新闻并调用 SoCLaaS 打分…首次可能需要 10–40 秒，之后命中缓存会很快。</div>`;
    $('#sentimentList').innerHTML = ''; $('#sentimentEvents').innerHTML = ''; $('#sentimentIc').innerHTML = ''; $('#sentimentSpark').innerHTML = '';
  }

  function render(data, ctx = {}) {
    const panel = $('#sentimentPanel'); panel.classList.toggle('is-disabled', !data);
    if (!data || data.error) {
      setStatus(data?.error ? '接口错误' : '不适用', Boolean(data?.error));
      $('#sentimentHero').innerHTML = `<div class="valuation-empty">${esc(ctx.message || data?.detail || '不可用')}</div>`;
      ['#sentimentList', '#sentimentEvents', '#sentimentIc', '#sentimentSpark'].forEach((id) => { $(id).innerHTML = ''; }); $('#sentimentNote').textContent = '';
      return;
    }
    const llm = data.llm || {};
    if (data.status === 'not_configured') setStatus('未配置 LLM', true);
    else if (data.status === 'llm_error') setStatus('LLM 调用失败', true);
    else if (data.status === 'no_news') setStatus('无新闻');
    else setStatus(`${llm.model || 'LLM'}${data.status === 'partial' ? ' · 部分打分' : ''}`);

    const score = data.score; const asset = data.asset || {};
    const assetLine = asset.class && asset.class !== 'equity'
      ? `<div class="senti-asset"><b class="cat-chip">${esc(asset.label)}</b><span>${esc(data.name || data.symbol)}</span><em>${esc(asset.direction || '')}</em></div>` : '';
    const hero = assetLine + (data.status === 'not_configured' || (data.status === 'llm_error' && !data.n)
      ? renderSetup(data)
      : `<div class="senti-hero-main"><span>新闻情绪因子</span><strong class="${cls(score)}">${sgn(score)}</strong><em class="${cls(score)}">${esc(data.label || '--')}</em>${gauge(score)}</div>
         <div class="kv-grid senti-kv">${kv('加权均值（未收缩）', sgn(data.raw), cls(data.raw), '相关度 × 时间衰减加权的平均情绪')}${kv('证据强度', isNum(data.evidence) ? Number(data.evidence).toFixed(2) : '--', '', '权重和；≈1 相当于 1 条当天、完全相关的新闻')}${kv('相关新闻', `${data.relevant ?? 0} / ${data.items?.length ?? 0}`)}${kv('正面 / 负面', `<b class="positive">${data.positive ?? 0}</b> / <b class="negative">${data.negative ?? 0}</b>`)}${kv('本次新打分', `${data.stats?.scored ?? 0} 条`, '', `缓存命中 ${data.stats?.cached ?? 0} 条 · LLM 调用 ${data.stats?.llmCalls ?? 0} 次`)}${kv('半衰期', `${data.halfLifeDays ?? 3} 天`)}</div>`);
    $('#sentimentHero').innerHTML = hero;
    $('#sentimentList').innerHTML = renderList(data.items);
    $('#sentimentEvents').innerHTML = renderEvents(data.events);
    $('#sentimentSpark').innerHTML = sparkline(data.history) || '<div class="mini-empty">至少记录 2 天后显示走势。</div>';
    $('#sentimentIc').innerHTML = renderForward(forwardTest(data.history, ctx.payload));
    const notes = ['情绪因子 = Σ(相关度 × 时间衰减 × 情绪) ÷ (Σ权重 + 1)：新闻少时自动向 0 收缩。'];
    if (asset.class && asset.class !== 'equity') notes.push(`${asset.label}按“${asset.direction}”打分；新闻检索词：${(asset.queries || []).join(' ｜ ')}。`);
    notes.push('不计入上方综合分：新闻无法回放 5 年做回测，先单独记录、做前向检验，IC 稳定为正后再考虑纳入。', 'LLM 打分会出错，重要新闻请点开原文核对。');
    (data.errors || []).forEach((e) => notes.push(`⚠ ${e}`));
    $('#sentimentNote').innerHTML = notes.map((n) => `<span>${esc(n)}</span>`).join('');
  }

  root.QSSentiment = { render, renderLoading, forwardTest };
}(window));
