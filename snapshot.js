/*
 * QuantScope v2.5 — one-click long screenshot of the current symbol's daily quant analysis.
 *
 * No external library and no network: every analysis panel is cloned into an off-screen report
 * column (same width as the page, so the layout matches what you see), then each block is drawn
 * through an SVG <foreignObject> that carries the page's own stylesheet (media queries resolved
 * against the live window), stitched onto one canvas at 2x and saved as PNG.
 */
(function (root) {
  'use strict';

  const GAP = 14;                      // px between blocks in the long image
  const MAX_SIDE = 32000;              // browser canvas limits (Chrome / Safari)
  const MAX_AREA = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 16e6 : 1.2e8;
  const WAIT_MS = 20000;               // wait at most this long for data still loading
  // panels that make up "today's analysis of this symbol", in page order
  const BLOCKS = [
    { sel: '.signal-panel', label: '模型结论' },
    { sel: '#metricGrid', label: '核心指标' },
    { sel: '.content-grid', label: '价格结构与模型拆解' },
    { sel: '#valuationPanel', label: '估值中心', equityOnly: true },
    { sel: '.analysis-grid', label: '基本面与财务质量', equityOnly: true },
    { sel: '#sentimentPanel', label: '新闻情绪' },
    { sel: '.quant-panel', label: '量化统计' },
    { sel: '.backtest-panel', label: '信号回测' },
    { sel: '.bottom-grid', label: '交易计划与风险' },
    { sel: '.daily-panel', label: '每日行动建议' },
  ];
  // interactive bits that make no sense in a picture
  const REMOVE = ['#sentimentRefresh', '.assumption-actions', '#manualBox', '#snapshotButton'];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (sel) => (document.querySelector(sel)?.textContent || '').trim();
  let busy = false;

  // ----------------------------------------------------------------------------- styles
  /** The page's CSS, with @media / @supports blocks resolved against the live window
   *  (inside the SVG image the "viewport" would be the image itself), animations off. */
  function collectCss() {
    const out = [];
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) { if (matchMedia(rule.media.mediaText).matches) walk(rule.cssRules); }
        else if (root.CSSSupportsRule && rule instanceof CSSSupportsRule) { if (CSS.supports(rule.conditionText)) walk(rule.cssRules); }
        else if (rule instanceof CSSImportRule) { try { walk(rule.styleSheet.cssRules); } catch (e) { /* cross-origin */ } }
        else out.push(rule.cssText);
      }
    };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (e) { /* cross-origin sheet */ } }
    out.push('*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }');
    return out.join('\n').replace(/]]>/g, ']] >');
  }

  function baseStyle() {
    const cs = getComputedStyle(document.body);
    return ['font-size', 'line-height', 'letter-spacing', 'color', 'font-family', 'font-weight']
      .map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
  }

  // ----------------------------------------------------------------------------- report column
  function copyFormState(src, dst) {
    const a = src.querySelectorAll('input, select, textarea'); const b = dst.querySelectorAll('input, select, textarea');
    a.forEach((el, i) => {
      const c = b[i]; if (!c) return;
      if (el.tagName === 'SELECT') [...c.options].forEach((o, j) => o.toggleAttribute('selected', j === el.selectedIndex));
      else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
      else if (el.type === 'checkbox' || el.type === 'radio') c.toggleAttribute('checked', el.checked);
      else c.setAttribute('value', el.value);
    });
  }

  function sgtNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return { label: `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`, file: `${parts.year}${parts.month}${parts.day}-${hour}${parts.minute}` };
  }

  function headerHtml(symbol, now, included) {
    const name = text('#instrumentName');
    return `<div class="qs-snap-head panel">
      <div class="qs-snap-brand"><b>QUANTSCOPE</b><span>当日量化分析报告 / DAILY QUANT REPORT</span><em>${esc(symbol)}${name && name !== symbol ? ` · ${esc(name)}` : ''}</em></div>
      <div class="qs-snap-meta"><span>生成时间 ${esc(now.label)}（新加坡时间）</span><span>${esc(text('#priceNote'))}</span><span>数据 ${esc(text('#dataMode') || '--')} · ${esc(text('#updatedAt'))}</span></div>
      <div class="qs-snap-toc">${included.map((label, i) => `<span>${String(i + 1).padStart(2, '0')} ${esc(label)}</span>`).join('')}</div>
    </div>`;
  }

  /** "截全": anything that scrolls inside a panel is shown in full — vertical scrollers grow,
   *  horizontal ones (wide tables) are zoomed down to fit the column instead of being cut off. */
  function unclip(report) {
    report.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        el.style.maxHeight = 'none'; el.style.height = 'auto'; el.style.overflowY = 'visible';
      }
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
        const ratio = el.clientWidth / el.scrollWidth;
        el.style.overflowX = 'hidden';
        [...el.children].forEach((child) => { child.style.zoom = ratio.toFixed(4); });
      }
    });
  }

  function footerHtml() {
    return '<div class="qs-snap-foot"><span>QUANTSCOPE / PERSONAL MARKET LAB</span><span>数据仅供研究 · 非投资建议 · 指标为规则模型推断，新闻情绪由 LLM 打分</span></div>';
  }

  function buildReport(symbol, equity, now) {
    const main = document.querySelector('.main-content');
    const cs = getComputedStyle(main);
    const width = Math.floor(main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const report = document.createElement('div');
    report.className = 'qs-report'; report.setAttribute('aria-hidden', 'true'); report.style.width = `${width}px`;
    const included = [];
    BLOCKS.forEach((block) => {
      const src = document.querySelector(block.sel);
      if (!src || (block.equityOnly && !equity) || getComputedStyle(src).display === 'none') return;
      const clone = src.cloneNode(true);
      copyFormState(src, clone);
      clone.querySelectorAll('details.senti-more').forEach((d) => d.setAttribute('open', ''));  // the full headline list
      REMOVE.forEach((sel) => clone.querySelectorAll(sel).forEach((el) => el.remove()));
      clone.style.margin = '0';
      report.appendChild(clone); included.push(block.label);
    });
    report.insertAdjacentHTML('afterbegin', headerHtml(symbol, now, included));
    report.insertAdjacentHTML('beforeend', footerHtml());
    main.appendChild(report);
    unclip(report);
    return { report, width, included };
  }

  // ----------------------------------------------------------------------------- rasterising
  function loadImage(svg) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('浏览器无法渲染截图（SVG foreignObject）'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }

  async function blockImage(node, width, height, css, base) {
    const clone = node.cloneNode(true);
    clone.style.margin = '0';
    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="${esc(base)};width:${width}px;margin:0;padding:0">`
      + `<style><![CDATA[${css}]]></style>${html}</div></foreignObject></svg>`;
    const img = await loadImage(svg);
    await sleep(16); // Safari sometimes paints foreignObject one tick after onload
    return img;
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => {
      try { canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 编码失败（图片过大）'))), 'image/png'); }
      catch (error) { reject(error); }
    });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function waitUntilReady(isBusy, toast) {
    const start = Date.now();
    let pending = isBusy ? isBusy() : [];
    while (pending.length && Date.now() - start < WAIT_MS) {
      toast(`等待数据加载完成：${pending.join('、')}…`);
      await sleep(500);
      pending = isBusy();
    }
    return pending;
  }

  // ----------------------------------------------------------------------------- entry point
  async function capture({ symbol, equity = true, isBusy = null, toast = () => {}, button = null } = {}) {
    if (busy) return null;
    busy = true; button?.classList.add('busy'); button?.setAttribute('aria-busy', 'true');
    let report = null;
    try {
      const stillLoading = await waitUntilReady(isBusy, toast);
      const now = sgtNow();
      const built = buildReport(symbol, equity, now); report = built.report;
      await frame();
      const blocks = [...report.children];
      const heights = blocks.map((el) => Math.ceil(el.getBoundingClientRect().height));
      const W = built.width;
      const H = heights.reduce((s, h) => s + h, 0) + GAP * (blocks.length + 1);
      const fullW = W + GAP * 2;
      const scale = Math.max(0.5, Math.min(2, MAX_SIDE / H, MAX_SIDE / fullW, Math.sqrt(MAX_AREA / (fullW * H))));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(fullW * scale); canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080c12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const css = collectCss(); const base = baseStyle();
      let y = GAP;
      for (let i = 0; i < blocks.length; i += 1) {
        toast(`正在生成长图 ${i + 1}/${blocks.length}…`);
        const img = await blockImage(blocks[i], W, heights[i], css, base);
        ctx.drawImage(img, GAP * scale, y * scale, W * scale, heights[i] * scale);
        y += heights[i] + GAP;
      }
      const blob = await toBlob(canvas);
      const name = `QuantScope_${symbol.replace(/[^\w.-]+/g, '_')}_${now.file}.png`;
      download(blob, name);
      const mb = (blob.size / 1048576).toFixed(1);
      toast(`已保存长图 ${name}（${canvas.width}×${canvas.height}，${mb} MB）${stillLoading.length ? `；注意：${stillLoading.join('、')} 仍未加载完` : ''}`);
      return { name, width: canvas.width, height: canvas.height, bytes: blob.size, blocks: built.included };
    } catch (error) {
      console.error(error);
      const insecure = error && (error.name === 'SecurityError' || /insecure|tainted/i.test(error.message));
      toast(insecure ? '当前浏览器禁止导出这类截图，请改用 Chrome / Edge 打开 QuantScope 再试。' : `截图失败：${error.message || error}`);
      return null;
    } finally {
      report?.remove();
      busy = false; button?.classList.remove('busy'); button?.removeAttribute('aria-busy');
    }
  }

  root.QSSnapshot = { capture, collectCss, BLOCKS };
}(window));
