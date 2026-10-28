/*
 * QuantScope v2.3 — market-wide sentiment (fear & greed for US / HK / A-shares) and today's top-10 market news.
 * Data: /api/market-sentiment (market_sentiment.py) and /api/market-news (market_news.py).
 */
(function (root) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sgn = (x, d = 2) => (isNum(x) ? `${x >= 0 ? '+' : ''}${Number(x).toFixed(d)}` : '--');
  const pct = (x, d = 1, signed = true) => (isNum(x) ? `${signed && x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%` : '--');
  const safeLink = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
  const ZONES = [[25, '#ff6e77'], [45, '#ffb45e'], [55, '#8b97a8'], [75, '#7fd8c0'], [100, '#50e3c2']];
  const zoneColor = (s) => (isNum(s) ? ZONES.find(([b]) => s < b || b === 100)[1] : '#667588');
  const newsCls = (x) => (!isNum(x) ? 'muted' : x >= 0.15 ? 'positive' : x <= -0.15 ? 'negative' : 'neutral');
  const REGION_NEWS = { US: 'US', HK: 'HK', CN: 'CN' };
  const state = { sentiment: null, news: null, region: 'US' };

  function ago(ts) {
    const h = (Date.now() / 1000 - ts) / 3600;
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} 分钟前`; if (h < 24) return `${Math.round(h)} 小时前`; return `${Math.round(h / 24)} 天前`;
  }
  function fmtRaw(c) {
    if (!isNum(c.raw)) return '--';
    if (c.unit === 'pct') return pct(c.raw, 1);
    if (c.unit === 'share') return pct(c.raw, 0, false);
    return Number(c.raw).toFixed(2);
  }
  function fmtBig(x) { if (!isNum(x)) return '--'; return x >= 1e12 ? `${(x / 1e12).toFixed(2)} 万亿` : `${(x / 1e8).toFixed(0)} 亿`; }

  // ---------------------------------------------------------------- gauge
  function gauge(score, size = 150) {
    const W = size; const H = size * 0.58; const cx = W / 2; const cy = H - 6; const r = W / 2 - 10;
    const pt = (s, rad) => { const a = Math.PI * (1 - s / 100); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
    let lo = 0; const arcs = ZONES.map(([hi, color]) => { const [x1, y1] = pt(lo, r); const [x2, y2] = pt(hi, r); lo = hi; return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}" stroke="${color}" stroke-width="9" fill="none" opacity=".85"/>`; }).join('');
    const needle = isNum(score) ? (() => { const [x, y] = pt(score, r - 16); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#eef4fb" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="#eef4fb"/>`; })() : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="mood-gauge" role="img" aria-label="恐惧贪婪 ${isNum(score) ? score.toFixed(0) : '--'}">${arcs}${needle}</svg>`;
  }

  // ---------------------------------------------------------------- region cards
  function regionCard(r) {
    const n = state.news?.sentiment?.[REGION_NEWS[r.key]];
    const idx = r.index || {};
    const chg = (x) => (isNum(x) ? `<b class="${x >= 0 ? 'positive' : 'negative'}">${x >= 0 ? '+' : ''}${x.toFixed(1)}</b>` : '--');
    return `<button type="button" class="mood-card ${state.region === r.key ? 'active' : ''}" data-mood-region="${r.key}">
      <div class="mood-card-top"><strong>${esc(r.name)}</strong>${r.intraday ? '<em class="live-badge">盘中</em>' : ''}<span>${esc(idx.name)} ${isNum(idx.last) ? Number(idx.last).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'} <b class="${idx.chg1d >= 0 ? 'positive' : 'negative'}">${pct(idx.chg1d, 2)}</b></span></div>
      <div class="mood-card-body">${gauge(r.score)}<div class="mood-score"><strong style="color:${zoneColor(r.score)}">${isNum(r.score) ? r.score.toFixed(0) : '--'}</strong><span>${esc(r.label)}</span></div></div>
      <div class="mood-card-foot"><span>较 1 周 ${chg(r.change1w)}</span><span>较 1 月 ${chg(r.change1m)}</span><span>新闻情绪 <b class="${newsCls(n?.score)}">${isNum(n?.score) ? sgn(n.score) : '--'}</b></span></div>
    </button>`;
  }

  // ---------------------------------------------------------------- detail
  function componentRows(r) {
    if (!r.components?.length) return '<div class="mini-empty">没有可用分项</div>';
    return `<table class="data-table mood-table"><thead><tr><th>分项</th><th class="num">当前值</th><th>一年分位</th><th class="num">得分</th></tr></thead><tbody>${r.components.map((c) => `
      <tr><td><strong>${esc(c.name)}</strong><small>${esc(c.desc)}${c.date !== r.date ? ` · 截至 ${esc(c.date)}` : ''}</small></td>
      <td class="num">${fmtRaw(c)}</td>
      <td><div class="pct-bar"><i style="left:${c.percentile}%"></i></div><small>${c.percentile.toFixed(0)}%${c.direction < 0 ? ' · 反向' : ''}</small></td>
      <td class="num"><b style="color:${zoneColor(c.score)}">${c.score.toFixed(0)}</b><small>${esc(c.label)}</small></td></tr>`).join('')}</tbody></table>`;
  }
  function snapshot(r) {
    const s = r.snapshot || {}; if (!s.up && !isNum(s.limitUp)) return '';
    const total = (s.up || 0) + (s.down || 0) + (s.flat || 0);
    return `<div class="sub-title">今日盘面${s.intraday ? '（盘中）' : ''} · 不计入综合值</div><div class="mood-snap">
      ${s.up ? `<div class="breadth-bar"><i class="up" style="width:${(s.up / total) * 100}%"></i><i class="flat" style="width:${(s.flat / total) * 100}%"></i><i class="down" style="width:${(s.down / total) * 100}%"></i></div><div class="breadth-legend"><span class="positive">上涨 ${s.up}</span><span>平 ${s.flat}</span><span class="negative">下跌 ${s.down}</span></div>` : ''}
      <div class="kv-grid four">${isNum(s.limitUp) ? `<div class="kv"><span>涨停 / 跌停</span><strong><b class="positive">${s.limitUp}</b> / <b class="negative">${s.limitDown ?? '--'}</b></strong></div>` : ''}${isNum(s.upShare) ? `<div class="kv"><span>上涨家数占比</span><strong class="${s.upShare >= 0.5 ? 'positive' : 'negative'}">${(s.upShare * 100).toFixed(0)}%</strong></div>` : ''}${isNum(s.amount) ? `<div class="kv"><span>两市成交额${s.intraday ? '（盘中）' : ''}</span><strong>${fmtBig(s.amount)}</strong></div>` : ''}${isNum(s.amountVs20d) ? `<div class="kv"><span>较 20 日均额</span><strong>${(s.amountVs20d * 100).toFixed(0)}%</strong></div>` : ''}</div></div>`;
  }
  function historyChart(r) {
    const h = r.history || []; if (h.length < 5) return '<div class="mini-empty">历史不足</div>';
    const W = 640; const H = 170; const x = (i) => (i / (h.length - 1)) * W; const y = (v) => H - 14 - (v / 100) * (H - 22);
    const bands = [[0, 25, 'rgba(255,110,119,.08)'], [75, 100, 'rgba(80,227,194,.08)']].map(([a, b, c]) => `<rect x="0" y="${y(b)}" width="${W}" height="${y(a) - y(b)}" fill="${c}"/>`).join('');
    const grid = [25, 50, 75].map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(154,176,205,.12)" stroke-dasharray="3 4"/><text x="${W - 2}" y="${y(v) - 3}" text-anchor="end" fill="#536174" font-size="9">${v}</text>`).join('');
    const line = h.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
    const last = h.at(-1);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="wide-svg mood-history">${bands}${grid}<polyline points="${line}" fill="none" stroke="#ae8cff" stroke-width="1.6"/><circle cx="${x(h.length - 1)}" cy="${y(last.score)}" r="3.5" fill="${zoneColor(last.score)}"/></svg>
      <div class="legend-row"><span>${esc(h[0].date)}</span><span style="margin-left:auto">${esc(h[Math.floor(h.length / 2)].date)}</span><span style="margin-left:auto">${esc(last.date)}</span></div>`;
  }
  function forwardTable(r) {
    const f = r.forward || {}; if (!f.n) return '';
    return `<table class="data-table"><thead><tr><th>情绪区间</th><th class="num">样本日</th><th class="num">${f.horizon} 日后平均收益</th><th class="num">上涨概率</th></tr></thead><tbody>${f.buckets.map((b) => `<tr class="${b.n ? '' : 'na'}"><td><i class="zone-dot" style="background:${zoneColor(Number(b.range.split('–')[0]) + 1)}"></i>${esc(b.zone)} <small>${b.range}</small></td><td class="num">${b.n}</td><td class="num ${b.mean >= 0 ? 'positive' : 'negative'}">${pct(b.mean, 2)}</td><td class="num">${isNum(b.hit) ? `${(b.hit * 100).toFixed(0)}%` : '--'}</td></tr>`).join('')}
      <tr class="avg-row"><td>全部</td><td class="num">${f.n}</td><td class="num">${pct(f.unconditional, 2)}</td><td></td></tr></tbody></table>
      <p class="unit-note">${esc(r.index?.name)} 自 ${esc(f.start)} 起的样本；Rank IC ${sgn(f.ic, 3)}（t ${sgn(f.t, 2)}，按 ${f.horizon} 日重叠折算有效样本）。IC 为负说明“别人恐惧时贪婪”的逆向效应；样本只有一到三年，统计意义有限。</p>`;
  }
  function renderDetail() {
    const r = (state.sentiment?.regions || []).find((x) => x.key === state.region); const box = $('#moodDetail');
    if (!r) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="mood-detail-grid">
      <div><div class="sub-title">${esc(r.name)} · 分项拆解</div>${componentRows(r)}${snapshot(r)}</div>
      <div><div class="sub-title">综合值走势（近一年）</div>${historyChart(r)}<div class="sub-title">前向检验 · 不同情绪区间之后的指数表现</div>${forwardTable(r)}</div>
    </div>${(r.errors || []).length ? `<div class="valuation-note">${r.errors.map((e) => `<span>⚠ ${esc(e)}</span>`).join('')}</div>` : ''}`;
  }

  function renderSentiment(data) {
    state.sentiment = data; const cards = $('#moodCards'); const status = $('#moodStatus');
    if (!data || data.error || !data.regions?.length) {
      status.textContent = '不可用'; status.className = 'plan-tag warn';
      cards.innerHTML = `<div class="valuation-empty">市场情绪数据暂不可用：${esc(data?.detail || (data?.errors || []).join('；') || '请确认已用新版 server.py 重启 QuantScope')}</div>`;
      $('#moodDetail').innerHTML = ''; return;
    }
    if (!data.regions.some((r) => r.key === state.region)) state.region = data.regions[0].key;
    status.textContent = `更新于 ${new Date(data.asOf).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`; status.className = 'plan-tag';
    cards.innerHTML = data.regions.map(regionCard).join('');
    cards.querySelectorAll('[data-mood-region]').forEach((b) => b.addEventListener('click', () => { state.region = b.dataset.moodRegion; renderSentiment(state.sentiment); }));
    renderDetail();
    $('#moodNote').innerHTML = [data.method, '0–25 极度恐惧 · 25–45 恐惧 · 45–55 中性 · 55–75 贪婪 · 75–100 极度贪婪。情绪指标描述的是“市场有多乐观”，不是买卖信号；极端值常出现在拐点附近。', ...(data.errors || []).map((e) => `⚠ ${e}`)].map((t) => `<span>${esc(t)}</span>`).join('');
  }

  // ---------------------------------------------------------------- news
  function newsItem(t) {
    const link = safeLink(t.link); const title = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(t.title)}</a>` : esc(t.title);
    const outlets = (t.outlets || []).slice(0, 3).join(' / ') + ((t.coverage || 0) > 3 ? ` 等 ${t.coverage} 家` : '');
    const regions = (t.regions || []).map((r) => `<i class="region-chip">${esc({ US: '美股', CN: 'A股', HK: '港股', GLOBAL: '全球', EU: '欧洲', JP: '日本', OTHER: '其他' }[r] || r)}</i>`).join('');
    return `<li><span class="news-rank">${t.rank}</span><div class="news-body">
      <div class="news-head">${t.category ? `<i class="cat-chip">${esc(t.category)}</i>` : ''}<p>${title}</p><b class="senti-chip ${newsCls(t.sentiment)}">${isNum(t.sentiment) ? sgn(t.sentiment) : '--'}</b></div>
      ${t.summary ? `<em>${esc(t.summary)}</em>` : ''}${t.original && t.original !== t.title ? `<small class="news-orig">${esc(t.original)}</small>` : ''}
      <small class="news-meta">${regions}${esc(outlets)} · ${ago(t.published)}${t.assets ? ` · 影响：${esc(t.assets)}` : ''}${isNum(t.importance) ? ` · 重要性 ${Math.round(t.importance * 100)}` : ''}</small></div></li>`;
  }
  function renderNews(data) {
    state.news = data; const status = $('#newsStatus'); const list = $('#newsList'); const strip = $('#newsMood');
    if (!data || data.error) {
      status.textContent = '不可用'; status.className = 'plan-tag warn';
      list.innerHTML = `<div class="valuation-empty">新闻接口不可用：${esc(data?.detail || '请确认已用新版 server.py 重启 QuantScope')}</div>`; strip.innerHTML = ''; return;
    }
    const llm = data.llm || {};
    status.textContent = { ok: `${llm.model || 'LLM'} 精选`, partial: `${llm.model || 'LLM'} · 部分精选`, heuristic: '未配置 LLM · 按热度排序', llm_error: 'LLM 调用失败 · 按热度排序', no_news: '无新闻' }[data.status] || data.status;
    status.className = `plan-tag ${['heuristic', 'llm_error'].includes(data.status) ? 'warn' : ''}`;
    const s = data.sentiment || {}; const ov = data.overview || {};
    const chip = (label, v) => `<div class="news-mood-chip"><span>${label}</span><strong class="${newsCls(v?.score)}">${isNum(v?.score) ? sgn(v.score) : '--'}</strong><small>${v?.n ? `${v.n} 条 · <b class="positive">${v.positive}</b>/<b class="negative">${v.negative}</b>` : '无评分'}</small></div>`;
    strip.innerHTML = `${chip('综合', s.ALL)}${chip('美股', s.US)}${chip('A股', s.CN)}${chip('港股', s.HK)}${ov.summary ? `<p class="news-overview">${esc(ov.summary)}</p>` : ''}`;
    list.innerHTML = data.top?.length ? `<ol class="news-list">${data.top.map(newsItem).join('')}</ol>` : '<div class="mini-empty">过去 24 小时没有抓到新闻。</div>';
    const notes = [`过去 ${data.windowHours} 小时共抓取 ${data.collected} 条，去重后 ${data.candidates} 条候选；来源：${(data.feeds || []).map((f) => f.label).join('、')}。`,
      data.status === 'heuristic' ? '未配置 SoCLaaS：按来源排名、报道媒体数、时效和关键词排序，不给情绪分。配置方法见“新闻情绪”面板。' : '由 LLM 合并同一事件、挑选并翻译摘要；情绪分 = 对相关市场风险偏好的影响（−1 ~ +1），市场新闻情绪 = 按重要性加权的平均。LLM 可能出错，请点开原文核对。',
      ...(data.errors || []).map((e) => `⚠ ${e}`)];
    $('#newsNote').innerHTML = notes.map((n) => `<span>${esc(n)}</span>`).join('');
    if (state.sentiment && state.sentiment.regions?.length) renderSentiment(state.sentiment); // cards show the news score too
  }

  async function load(kind, refresh = false) {
    const isNews = kind === 'news';
    if (isNews) { $('#newsStatus').textContent = '读取中'; if (!state.news) $('#newsList').innerHTML = '<div class="valuation-empty">正在抓取过去 24 小时的新闻并调用 SoCLaaS 精选…首次约 20–60 秒。</div>'; } else { $('#moodStatus').textContent = '计算中'; }
    try {
      const r = await fetch(`/api/market-${isNews ? 'news' : 'sentiment'}${refresh ? '?refresh=1' : ''}`);
      const json = await r.json();
      (isNews ? renderNews : renderSentiment)(r.ok ? json : { error: true, detail: json.detail });
    } catch (e) { (isNews ? renderNews : renderSentiment)({ error: true, detail: String(e.message || e) }); }
  }
  function init() {
    $('#moodRefresh')?.addEventListener('click', () => load('sentiment', true));
    $('#newsRefresh')?.addEventListener('click', () => load('news', true));
    load('sentiment'); load('news');
    setInterval(() => load('sentiment'), 15 * 60 * 1000); // the server caches for 15 min
  }
  root.QSMarket = { init, renderSentiment, renderNews, gauge };
}(window));
