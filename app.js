const BENCHMARKS = [
  { symbol: 'HSTECH.HK', name: '恒生科技', short: 'HSTECH', color: '#50e3c2' },
  { symbol: '^HSI', name: '恒生指数', short: 'HSI', color: '#5d8eff' },
  { symbol: '^IXIC', name: '纳斯达克', short: 'IXIC', color: '#ae8cff' },
  { symbol: '^GSPC', name: 'S&P 500', short: 'GSPC', color: '#ffb45e' },
];

const CHINA_INDICES = [
  { symbol: '000001.SS', name: '上证综指', short: 'SSEC', color: '#ff6e77', market: 'CN' },
  { symbol: '000300.SS', name: '沪深300', short: 'CSI 300', color: '#ff9f68', market: 'CN' },
  { symbol: '000016.SS', name: '上证50', short: 'SSE 50', color: '#ffbd67', market: 'CN' },
  { symbol: '000905.SS', name: '中证500', short: 'CSI 500', color: '#f5d06f', market: 'CN' },
  { symbol: '000852.SS', name: '中证1000', short: 'CSI 1000', color: '#50e3c2', market: 'CN' },
  { symbol: '399001.SZ', name: '深证成指', short: 'SZSE', color: '#5d8eff', market: 'CN' },
  { symbol: '399006.SZ', name: '创业板指', short: 'ChiNext', color: '#ae8cff', market: 'CN' },
  { symbol: '000688.SS', name: '科创50', short: 'STAR 50', color: '#ff7d9a', market: 'CN' },
];

const MARKET_REGIONS = [
  {
    key: 'HK', name: '港股', english: 'HONG KONG', currency: 'HKD', index: { symbol: '^HSI', name: '恒生指数' },
    stocks: [
      { symbol: '0700.HK', name: '腾讯控股', short: 'Tencent' }, { symbol: '9988.HK', name: '阿里巴巴', short: 'Alibaba' },
      { symbol: '3690.HK', name: '美团', short: 'Meituan' }, { symbol: '1810.HK', name: '小米集团', short: 'Xiaomi' },
      { symbol: '9618.HK', name: '京东集团', short: 'JD.com' }, { symbol: '1024.HK', name: '快手', short: 'Kuaishou' },
      { symbol: '0005.HK', name: '汇丰控股', short: 'HSBC' }, { symbol: '0388.HK', name: '香港交易所', short: 'HKEX' },
    ],
    sectors: [
      { name: '科技平台', symbols: ['0700.HK', '1810.HK', '1024.HK'] },
      { name: '电商与消费', symbols: ['9988.HK', '3690.HK', '9618.HK'] },
      { name: '金融与交易所', symbols: ['0005.HK', '0388.HK'] },
    ],
  },
  {
    key: 'SG', name: '新加坡', english: 'SINGAPORE', currency: 'SGD', index: { symbol: '^STI', name: '海峡时报指数' },
    stocks: [
      { symbol: 'D05.SI', name: '星展集团', short: 'DBS' }, { symbol: 'O39.SI', name: '华侨银行', short: 'OCBC' },
      { symbol: 'U11.SI', name: '大华银行', short: 'UOB' }, { symbol: 'Z74.SI', name: '新加坡电信', short: 'Singtel' },
      { symbol: 'C6L.SI', name: '新加坡航空', short: 'SIA' }, { symbol: 'C38U.SI', name: '凯德综合商业信托', short: 'CICT' },
      { symbol: 'A17U.SI', name: '腾飞房产信托', short: 'Ascendas REIT' }, { symbol: 'ME8U.SI', name: '丰树工业信托', short: 'MIT' },
    ],
    sectors: [
      { name: '银行', symbols: ['D05.SI', 'O39.SI', 'U11.SI'] },
      { name: 'REITs', symbols: ['C38U.SI', 'A17U.SI', 'ME8U.SI'] },
      { name: '电信与交通', symbols: ['Z74.SI', 'C6L.SI'] },
    ],
  },
  {
    key: 'US', name: '美股', english: 'UNITED STATES', currency: 'USD', index: { symbol: '^GSPC', name: 'S&P 500' },
    stocks: [
      { symbol: 'NVDA', name: '英伟达', short: 'NVIDIA' }, { symbol: 'MSFT', name: '微软', short: 'Microsoft' },
      { symbol: 'AAPL', name: '苹果', short: 'Apple' }, { symbol: 'AMZN', name: '亚马逊', short: 'Amazon' },
      { symbol: 'META', name: 'Meta Platforms', short: 'Meta' }, { symbol: 'TSLA', name: '特斯拉', short: 'Tesla' },
      { symbol: 'AVGO', name: '博通', short: 'Broadcom' }, { symbol: 'AMD', name: '超威半导体', short: 'AMD' },
      { symbol: 'JPM', name: '摩根大通', short: 'JPMorgan' }, { symbol: 'LLY', name: '礼来', short: 'Eli Lilly' },
    ],
    sectors: [
      { name: 'AI与半导体', symbols: ['NVDA', 'AVGO', 'AMD'] },
      { name: '大型科技', symbols: ['MSFT', 'AAPL', 'AMZN', 'META'] },
      { name: '金融与医药', symbols: ['JPM', 'LLY'] },
    ],
  },
  {
    key: 'JP', name: '日股', english: 'JAPAN', currency: 'JPY', index: { symbol: '^N225', name: '日经225' },
    stocks: [
      { symbol: '7203.T', name: '丰田汽车', short: 'Toyota' }, { symbol: '6758.T', name: '索尼集团', short: 'Sony' },
      { symbol: '9984.T', name: '软银集团', short: 'SoftBank' }, { symbol: '8306.T', name: '三菱日联金融', short: 'MUFG' },
      { symbol: '8035.T', name: '东京电子', short: 'Tokyo Electron' }, { symbol: '6501.T', name: '日立', short: 'Hitachi' },
      { symbol: '7974.T', name: '任天堂', short: 'Nintendo' }, { symbol: '6857.T', name: '爱德万测试', short: 'Advantest' },
    ],
    sectors: [
      { name: '汽车与制造', symbols: ['7203.T', '6501.T'] },
      { name: '半导体设备', symbols: ['8035.T', '6857.T'] },
      { name: '科技与金融', symbols: ['6758.T', '9984.T', '8306.T', '7974.T'] },
    ],
  },
  {
    key: 'KR', name: '韩股', english: 'SOUTH KOREA', currency: 'KRW', index: { symbol: '^KS11', name: 'KOSPI' },
    stocks: [
      { symbol: '005930.KS', name: '三星电子', short: 'Samsung' }, { symbol: '000660.KS', name: 'SK海力士', short: 'SK Hynix' },
      { symbol: '005380.KS', name: '现代汽车', short: 'Hyundai' }, { symbol: '000270.KS', name: '起亚', short: 'Kia' },
      { symbol: '035420.KS', name: 'NAVER', short: 'NAVER' }, { symbol: '035720.KS', name: 'Kakao', short: 'Kakao' },
      { symbol: '068270.KS', name: 'Celltrion', short: 'Celltrion' }, { symbol: '207940.KS', name: '三星生物制剂', short: 'Samsung Biologics' },
    ],
    sectors: [
      { name: '存储与半导体', symbols: ['005930.KS', '000660.KS'] },
      { name: '汽车', symbols: ['005380.KS', '000270.KS'] },
      { name: '互联网与医药', symbols: ['035420.KS', '035720.KS', '068270.KS', '207940.KS'] },
    ],
  },
  {
    key: 'CN', name: 'A股', english: 'CHINA A-SHARES', currency: 'CNY', index: { symbol: '000001.SS', name: '上证综指' },
    stocks: [
      { symbol: '600519.SS', name: '贵州茅台', short: 'Kweichow Moutai' }, { symbol: '601318.SS', name: '中国平安', short: 'Ping An' },
      { symbol: '600036.SS', name: '招商银行', short: 'CMB' }, { symbol: '300750.SZ', name: '宁德时代', short: 'CATL' },
      { symbol: '002594.SZ', name: '比亚迪', short: 'BYD' }, { symbol: '688981.SS', name: '中芯国际', short: 'SMIC' },
      { symbol: '000858.SZ', name: '五粮液', short: 'Wuliangye' }, { symbol: '600900.SS', name: '长江电力', short: 'Yangtze Power' },
      { symbol: '601398.SS', name: '工商银行', short: 'ICBC' }, { symbol: '600030.SS', name: '中信证券', short: 'CITIC Securities' },
      { symbol: '600028.SS', name: '中国石化', short: 'Sinopec' }, { symbol: '601088.SS', name: '中国神华', short: 'China Shenhua' },
    ],
    sectors: [
      { name: '消费与白酒', symbols: ['600519.SS', '000858.SZ'] },
      { name: '银行与券商', symbols: ['601318.SS', '600036.SS', '601398.SS', '600030.SS'] },
      { name: '新能源与科技', symbols: ['300750.SZ', '002594.SZ', '688981.SS'] },
      { name: '能源与红利', symbols: ['600900.SS', '600028.SS', '601088.SS'] },
    ],
  },
];

const BOARD_INSTRUMENTS = Object.fromEntries(MARKET_REGIONS.flatMap((region) => region.stocks.map((stock) => [stock.symbol, { ...stock, currency: region.currency }])));
const ALL_BENCHMARKS = [...BENCHMARKS, ...CHINA_INDICES, ...MARKET_REGIONS.filter((region) => !['HK', 'US', 'CN'].includes(region.key)).map((region) => ({ symbol: region.index.symbol, name: region.index.name, short: region.key, color: '#9ab0cd', market: region.key }))];

const GLOBAL_ASSETS = [
  { symbol: 'BTC-USD', name: '比特币', short: 'BTC', color: '#ffbd67', kind: 'crypto', unit: 'USD', icon: '₿' },
  { symbol: 'CL=F', name: 'WTI 原油期货', short: 'CL=F', color: '#8eb5ff', kind: 'future', unit: 'USD/bbl', icon: '◒', contractMultiplier: 1000 },
  { symbol: 'BZ=F', name: '布伦特原油期货', short: 'BZ=F', color: '#7fa8f4', kind: 'future', unit: 'USD/bbl', icon: '◒', contractMultiplier: 1000 },
  { symbol: 'XAUUSD=X', name: '伦敦金（LBMA AM）', short: 'XAU', color: '#ffe097', kind: 'spot', unit: 'USD/oz', icon: 'Au' },
  { symbol: 'GC=F', name: '纽约金期货', short: 'GC=F', color: '#ffcb65', kind: 'future', unit: 'USD/oz', icon: 'Au', contractMultiplier: 100 },
  { symbol: '^VIX', name: 'VIX 恐慌指数', short: 'VIX', color: '#ff7d9a', kind: 'index', unit: '点', icon: 'V' },
];

const state = {
  symbol: 'AAPL',
  range: '1y',
  loading: false,
  benchmarkPayloads: {},
  globalAssetPayloads: {},
  marketBoardPayloads: {},
  quoteCache: {},
  watchlist: [],
  positions: [],
  positionQuotePromises: {},
  current: null,
  currentAnalysis: null,
  currentRequestId: 0,
  core: null,
  longBenchmarks: {},
  fundamentals: null,
  fundamentalsCache: {},
  peerFundamentals: [],
  valuation: null,
  valuationMsg: null,
  liveRf: {},
  assumptionOverrides: {},
  peerOverrides: {},
  manualFundamentals: null,
  formSymbol: null,
};

const STORAGE_KEYS = { watchlist: 'quantScope.watchlist.v1', positions: 'quantScope.positions.v1' };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

function formatNumber(value, digits = 2) {
  if (!isFiniteNumber(value)) return '--';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPct(value, digits = 2) {
  if (!isFiniteNumber(value)) return '--';
  return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(digits)}%`;
}

function formatCompact(value) {
  if (!isFiniteNumber(value)) return '--';
  const n = Math.abs(Number(value));
  if (n >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return formatNumber(value, 0);
}

function formatDate(timestamp, includeYear = false) {
  if (!timestamp) return '--';
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}) }).format(date);
}

function formatTime() {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function symbolLabel(symbol) {
  const match = BENCHMARKS.find((item) => item.symbol === symbol);
  if (match) return { name: match.name, short: match.short, currency: symbol === 'HSTECH.HK' || symbol === '^HSI' ? 'HKD' : 'USD' };
  const chinaIndex = CHINA_INDICES.find((item) => item.symbol === symbol);
  if (chinaIndex) return { name: chinaIndex.name, short: chinaIndex.short, currency: 'CNY' };
  const boardInstrument = BOARD_INSTRUMENTS[symbol.toUpperCase()];
  if (boardInstrument) return { name: boardInstrument.name, short: boardInstrument.short, currency: boardInstrument.currency };
  const asset = GLOBAL_ASSETS.find((item) => item.symbol === symbol);
  if (asset) return { name: asset.name, short: asset.short, currency: asset.unit.split('/')[0] === 'USD' ? 'USD' : asset.unit };
  const upper = symbol.toUpperCase();
  const known = { AAPL: ['Apple Inc.', 'USD'], TSLA: ['Tesla Inc.', 'USD'], NVDA: ['NVIDIA Corp.', 'USD'], '0700.HK': ['Tencent Holdings', 'HKD'], '9988.HK': ['Alibaba Group', 'HKD'] };
  if (known[upper]) return { name: known[upper][0], short: upper, currency: known[upper][1] };
  return { name: `${upper} · 自定义标的`, short: upper, currency: upper.endsWith('.HK') ? 'HKD' : upper.endsWith('.SI') ? 'SGD' : upper.endsWith('.SS') || upper.endsWith('.SZ') ? 'CNY' : upper.endsWith('.T') ? 'JPY' : upper.endsWith('.KS') ? 'KRW' : 'USD' };
}

function assetSpec(symbol) {
  return GLOBAL_ASSETS.find((item) => item.symbol === symbol) || { kind: 'equity', unit: symbolLabel(symbol).currency, contractMultiplier: 1 };
}

function estimateNotional(symbol, price, volume) {
  const multiplier = assetSpec(symbol).contractMultiplier || 1;
  return price * volume * multiplier;
}

function singaporeDateLabel() {
  return new Intl.DateTimeFormat('zh-SG', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date());
}

function normalizeSymbol(value) {
  const upper = value.trim().toUpperCase();
  if (/^\d{6}$/.test(upper)) {
    if (upper.startsWith('6') || upper.startsWith('68') || upper.startsWith('5')) return `${upper}.SS`;
    if (upper.startsWith('4') || upper.startsWith('8')) return `${upper}.BJ`;
    return `${upper}.SZ`;
  }
  return upper;
}

function isChinaSymbol(symbol) {
  return symbol.endsWith('.SS') || symbol.endsWith('.SZ') || symbol.endsWith('.BJ') || CHINA_INDICES.some((item) => item.symbol === symbol);
}

function benchmarkUniverseForSymbol(symbol) {
  if (isChinaSymbol(symbol)) return CHINA_INDICES;
  if (symbol.endsWith('.HK')) return [...BENCHMARKS.slice(0, 2), ...CHINA_INDICES.slice(0, 3)];
  if (symbol.endsWith('.SI')) return [ALL_BENCHMARKS.find((item) => item.symbol === '^STI'), ...BENCHMARKS.slice(1)].filter(Boolean);
  if (symbol.endsWith('.T')) return [ALL_BENCHMARKS.find((item) => item.symbol === '^N225'), ...BENCHMARKS.slice(2)].filter(Boolean);
  if (symbol.endsWith('.KS')) return [ALL_BENCHMARKS.find((item) => item.symbol === '^KS11'), ...BENCHMARKS.slice(2)].filter(Boolean);
  return BENCHMARKS;
}

function loadUserData() {
  try {
    const savedWatchlist = JSON.parse(localStorage.getItem(STORAGE_KEYS.watchlist) || 'null');
    const savedPositions = JSON.parse(localStorage.getItem(STORAGE_KEYS.positions) || 'null');
    state.watchlist = Array.isArray(savedWatchlist) && savedWatchlist.length ? savedWatchlist : ['AAPL', '0700.HK', '9988.HK', 'TSLA'];
    state.positions = Array.isArray(savedPositions) ? savedPositions : [];
  } catch (error) {
    state.watchlist = ['AAPL', '0700.HK', '9988.HK', 'TSLA']; state.positions = [];
  }
}

function persistUserData() {
  try {
    localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
    localStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(state.positions));
  } catch (error) {
    showToast('浏览器未允许保存本地自选/仓位');
  }
}

function average(values) {
  const valid = values.filter(isFiniteNumber).map(Number);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function smaSeries(values, period) {
  return values.map((_, index) => index < period - 1 ? null : average(values.slice(index - period + 1, index + 1)));
}

function emaSeries(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  let ema = average(values.slice(0, period));
  result[period - 1] = ema;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    ema = (values[index] - ema) * multiplier + ema;
    result[index] = ema;
  }
  return result;
}

function standardDeviation(values) {
  const mean = average(values);
  if (!isFiniteNumber(mean)) return null;
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)) || 0);
}

function calculateRsi(values, period = 14) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }
  let averageGain = gains / period; let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(delta, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-delta, 0)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - (100 / (1 + averageGain / averageLoss));
  }
  return result;
}

function calculateAtr(highs, lows, closes, period = 14) {
  const tr = closes.map((close, index) => {
    if (index === 0) return highs[index] - lows[index];
    return Math.max(highs[index] - lows[index], Math.abs(highs[index] - closes[index - 1]), Math.abs(lows[index] - closes[index - 1]));
  });
  const result = Array(closes.length).fill(null);
  if (closes.length < period) return result;
  let atr = average(tr.slice(0, period)); result[period - 1] = atr;
  for (let index = period; index < closes.length; index += 1) {
    atr = ((atr * (period - 1)) + tr[index]) / period;
    result[index] = atr;
  }
  return result;
}

function dailyReturns(closes) {
  return closes.slice(1).map((close, index) => closes[index] ? close / closes[index] - 1 : 0);
}

function changeFrom(closes, days) {
  if (!closes.length) return null;
  const base = closes[Math.max(0, closes.length - 1 - days)];
  return base ? (closes[closes.length - 1] / base - 1) * 100 : null;
}

// ---------------------------------------------------------------- model v2.0
const MODEL_WEIGHTS = { trend: 0.25, momentum: 0.15, volume: 0.05, market: 0.15, risk: 0.10, valuation: 0.20, quality: 0.10 };
const FACTOR_META = {
  trend: { title: '趋势结构', icon: '↗' }, momentum: { title: '动量状态', icon: '◒' }, volume: { title: '成交确认', icon: '▥' },
  market: { title: '市场环境', icon: '◎' }, risk: { title: '风险状态', icon: '△' }, valuation: { title: '估值安全边际', icon: '¥' }, quality: { title: '财务质量', icon: '✦' },
};
const DISPLAY_BARS = { '1mo': 22, '3mo': 64, '6mo': 127, '1y': 253, '5y': Infinity };
const BENCHMARK_NAMES = { '^GSPC': 'S&P 500', '^HSI': '恒生指数', '000300.SS': '沪深300', '^STI': '海峡时报指数', '^N225': '日经225', '^KS11': 'KOSPI' };

function primaryBenchmark(symbol) {
  if (isChinaSymbol(symbol)) return '000300.SS';
  if (symbol.endsWith('.HK')) return '^HSI';
  if (symbol.endsWith('.SI')) return '^STI';
  if (symbol.endsWith('.T')) return '^N225';
  if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) return '^KS11';
  return '^GSPC';
}

function isEquitySymbol(symbol) {
  if (!symbol || symbol.startsWith('^') || symbol.includes('=') || /-USD$/.test(symbol)) return false;
  if (ALL_BENCHMARKS.some((item) => item.symbol === symbol) || GLOBAL_ASSETS.some((item) => item.symbol === symbol)) return false;
  return true;
}

function rfFor(currency) {
  const ccy = (currency || 'USD').toUpperCase();
  if (isFiniteNumber(state.liveRf[ccy])) return state.liveRf[ccy];
  return (QSValuation.CURRENCY_DEFAULTS[ccy] || QSValuation.CURRENCY_DEFAULTS.USD).rf;
}

// Valuation peer groups (same business model, so multiples are comparable). Editable in the UI per symbol.
const PEER_GROUPS = [
  ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'], ['MSFT', 'ORCL', 'GOOGL', 'CRM', 'ADBE'], ['GOOGL', 'META', 'MSFT', 'AMZN'],
  ['NVDA', 'AMD', 'AVGO', 'QCOM', 'MRVL'], ['TSM', 'NVDA', 'AVGO', 'ASML'], ['AMZN', 'WMT', 'COST', 'BABA'], ['TSLA', 'GM', 'F', 'TM', 'BYDDY'],
  ['JPM', 'BAC', 'C', 'WFC', 'GS', 'MS'], ['LLY', 'NVO', 'MRK', 'ABBV', 'PFE'],
  ['0700.HK', '9988.HK', '3690.HK', '9618.HK', '1024.HK', '9999.HK'], ['9988.HK', '9618.HK', 'PDD', '3690.HK'], ['1810.HK', '0992.HK', '2382.HK'],
  ['0005.HK', '2888.HK', '0011.HK', '2388.HK'], ['0388.HK', '0005.HK', '1299.HK'], ['0939.HK', '1398.HK', '3988.HK', '1288.HK'],
  ['D05.SI', 'O39.SI', 'U11.SI'], ['C38U.SI', 'A17U.SI', 'ME8U.SI', 'N2IU.SI', 'M44U.SI'], ['Z74.SI', 'C6L.SI', 'S63.SI'],
  ['7203.T', '7267.T', '7201.T', '7269.T'], ['8035.T', '6857.T', '6146.T', '6920.T'], ['6758.T', '7974.T', '6501.T'], ['8306.T', '8316.T', '8411.T'],
  ['005930.KS', '000660.KS'], ['005380.KS', '000270.KS'], ['035420.KS', '035720.KS'], ['068270.KS', '207940.KS'],
  ['600519.SS', '000858.SZ', '000568.SZ', '600809.SS', '002304.SZ'], ['600036.SS', '601398.SS', '601939.SS', '601288.SS', '601166.SS', '000001.SZ'],
  ['601318.SS', '601628.SS', '601601.SS'], ['600030.SS', '601211.SS', '600837.SS'], ['300750.SZ', '002594.SZ', '300014.SZ', '002460.SZ'],
  ['688981.SS', '688256.SS', '603501.SS'], ['600900.SS', '600025.SS', '601985.SS'], ['600028.SS', '601857.SS', '601088.SS'],
];
function defaultPeers(symbol) {
  const set = new Set();
  PEER_GROUPS.forEach((group) => { if (group.includes(symbol)) group.forEach((s) => s !== symbol && set.add(s)); });
  return [...set].slice(0, 6);
}

/** Everything that depends only on prices: technical factors, risk statistics, CAPM, backtest. */
function computeCore(payload, benchPayload) {
  const Q = QSAnalytics; const spec = assetSpec(payload.symbol); const adj = payload.adj || payload.closes;
  const benchSym = primaryBenchmark(payload.symbol); const selfBench = benchSym === payload.symbol;
  const benchUsable = benchPayload && !!benchPayload.demo === !!payload.demo;
  const benchSeries = selfBench ? adj : benchUsable ? Q.forwardFillOnto(payload.timestamps, benchPayload.timestamps, benchPayload.adj || benchPayload.closes) : null;
  const volBaseline = spec.kind === 'crypto' ? 0.6 : spec.kind === 'future' ? 0.35 : payload.symbol.startsWith('^') || spec.kind === 'index' ? 0.2 : 0.3;
  const tech = Q.technicalFactors({ closes: payload.closes, highs: payload.highs, lows: payload.lows, volumes: payload.volumes, adj }, benchSeries, { volBaseline });
  const ccy = (payload.meta.currency || symbolLabel(payload.symbol).currency || 'USD').toUpperCase();
  const rf = rfFor(ccy);
  const riskStats = Q.riskMetrics(payload.timestamps, adj, rf);
  const capm = !selfBench && benchUsable ? Q.capm(payload.timestamps, adj, benchPayload.timestamps, benchPayload.adj || benchPayload.closes, rf) : null;
  const threshold = spec.kind === 'future' || spec.kind === 'crypto' ? 3 : 2.5;
  const allowShort = spec.kind !== 'equity';
  const backtest = adj.length > 300 ? Q.backtestSignals(payload.timestamps, adj, tech.factors, { longThreshold: threshold, shortThreshold: -threshold, allowShort }) : null;
  return {
    tech, riskStats, capm, backtest, rf, ccy, threshold, allowShort, benchSym, selfBench, benchSeries,
    benchmarkName: BENCHMARK_NAMES[benchSym] || benchSym, windows: Q.windowTable(payload.timestamps, adj, rf), monthly: Q.monthlyReturns(payload.timestamps, adj),
    vr5: riskStats ? Q.varianceRatio(riskStats.logReturns, 5) : null, vr20: riskStats ? Q.varianceRatio(riskStats.logReturns, 20) : null,
    cone: Q.priceCone(payload.closes.at(-1), riskStats?.ewmaVolAnnual), ddTs: payload.timestamps, sampleYears: riskStats?.years,
  };
}

function factorDetail(key, ctx) {
  const { a, core, valuation, lastIdx } = ctx; const Q = QSAnalytics;
  switch (key) {
    case 'trend': { const adj = ctx.adj; const mom = lastIdx >= 252 ? adj[lastIdx - 21] / adj[lastIdx - 252] - 1 : null; return `${isFiniteNumber(a.ma20) ? (a.current > a.ma20 ? '站上' : '跌破') : '—'} MA20 · MA20 ${isFiniteNumber(a.ma60) ? (a.ma20 > a.ma60 ? '高于' : '低于') : '—'} MA60 · 12-1 动量 ${formatPct(isFiniteNumber(mom) ? mom * 100 : null, 1)}`; }
    case 'momentum': return `RSI ${formatNumber(a.rsi, 1)} · MACD 柱 ${!isFiniteNumber(a.macdHist) ? '数据不足' : a.macdHist >= 0 ? '为正' : '为负'}`;
    case 'volume': return core.tech.indicators.hasVolume ? `成交量为前 20 日均量的 ${formatNumber(a.volumeRatio, 2)} 倍` : '该品种没有可靠成交量，因子不计入';
    case 'market': { const b = core.benchSeries; if (!b || lastIdx < 63) return '等待基准数据'; return `${core.benchmarkName} 1M ${formatPct((b[lastIdx] / b[lastIdx - 21] - 1) * 100, 1)} / 3M ${formatPct((b[lastIdx] / b[lastIdx - 63] - 1) * 100, 1)} · ${a.marketRegime}`; }
    case 'risk': return `60 日年化波动 ${formatNumber(a.volatility60, 1)}% · 距 52 周高点 ${formatNumber(a.offHigh * 100, 1)}% · 波动分位 ${isFiniteNumber(core.riskStats?.volPercentile) ? Math.round(core.riskStats.volPercentile * 100) + '%' : '--'}`;
    case 'valuation': if (!valuation?.composite) return isEquitySymbol(state.symbol) ? (state.valuationMsg || '基本面数据不足') : '非股票标的，不做基本面估值'; return `公允价值 ${formatNumber(valuation.composite.fair, 2)} · 偏离 ${formatPct(valuation.composite.upside * 100, 1)} · 可靠度 ${Math.round(valuation.composite.reliability * 100)}%`;
    case 'quality': { if (!valuation) return '非股票标的或无财报'; const f = valuation.quality.piotroski; const q = valuation.quality.metrics; return `F-score ${f ? `${f.score}/${f.available}` : '--'} · ROIC−WACC ${isFiniteNumber(q.roicSpread) ? formatPct(q.roicSpread * 100, 1) : '--'}${valuation.quality.altman ? ` · Z″ ${valuation.quality.altman.zoneLabel}` : ''}`; }
    default: return Q ? '' : '';
  }
}

/** Combines technical, valuation and quality factors into the final verdict. */
function composeAnalysis(payload, core, valuation) {
  const spec = assetSpec(payload.symbol); const closes = payload.closes; const n = closes.length; const i = n - 1; const ind = core.tech.indicators; const adj = payload.adj || closes;
  const current = closes.at(-1); const previous = closes.at(-2) || current;
  const ma20 = smaSeries(closes, 20).at(-1); const ma60 = smaSeries(closes, 60).at(-1);
  const rsi = ind.rsi.at(-1); const macd = ind.macd.at(-1); const macdSignal = ind.macdSignal.at(-1); const macdHist = ind.macdHist.at(-1);
  const atr = ind.atr.at(-1) || current * 0.02;
  const prevVolumes = payload.volumes.slice(-21, -1).filter((v) => v > 0); const volumeRatio = prevVolumes.length ? payload.volumes.at(-1) / average(prevVolumes) : null;
  const rets = QSAnalytics.simpleReturns(adj); const volatility = (QSAnalytics.std(rets.slice(-252)) || 0) * Math.sqrt(252) * 100; const volatility60 = (ind.sd60.at(-1) || 0) * Math.sqrt(252) * 100;
  const oneDay = (current / previous - 1) * 100; const oneMonth = changeFrom(adj, 21); const threeMonth = changeFrom(adj, 63); const sixMonth = changeFrom(adj, 126);
  const bbWindow = closes.slice(-20); const bbMiddle = average(bbWindow); const bbStd = standardDeviation(bbWindow) || 0; const bbUpper = bbMiddle + bbStd * 2; const bbLower = bbMiddle - bbStd * 2; const bollingerPosition = bbUpper !== bbLower ? (current - bbLower) / (bbUpper - bbLower) : 0.5;
  const high252 = Math.max(...adj.slice(-252)); const offHigh = 1 - adj.at(-1) / high252;
  const values = {}; Object.keys(core.tech.factors).forEach((k) => { values[k] = core.tech.factors[k][i]; });
  const techValues = { ...values };
  values.valuation = valuation?.composite?.factor ?? null; values.quality = valuation?.quality?.factor ?? null;
  const rawScore = QSAnalytics.compositeScore(values, MODEL_WEIGHTS) ?? 0; const score = Math.round(clamp(rawScore, -10, 10) * 10) / 10;
  const techScore = QSAnalytics.compositeScore(techValues, QSAnalytics.TECH_WEIGHTS) ?? 0;
  const marketRegime = !isFiniteNumber(values.market) ? '混合环境' : values.market > 0.25 ? '风险偏好' : values.market < -0.25 ? '风险收缩' : '混合环境';
  const threshold = core.threshold;
  const longBlocked = marketRegime === '风险收缩' && score < 5; const shortBlocked = marketRegime === '风险偏好' && score > -5;
  const enoughHistory = n >= 120; // fewer than ~6 months of bars: indicators are unreliable, no directional call
  const signal = !enoughHistory ? 'neutral' : score >= threshold && !longBlocked ? 'long' : score <= -threshold && !shortBlocked ? 'short' : 'neutral';
  const signalText = !enoughHistory ? '观望（历史不足）' : signal === 'long' ? '建议做多' : signal === 'short' ? (spec.kind === 'equity' ? '偏空 / 回避' : '建议做空') : '观望';
  // empirical confidence: posterior hit rate of the same technical bucket in the walk-forward test
  const bucket = techScore >= threshold ? 'long' : techScore <= -threshold ? 'short' : 'neutral'; const bt = core.backtest?.buckets?.[bucket];
  const confidence = bt && bt.n ? bt.posterior : null;
  const confidenceText = confidence === null ? '样本不足' : `${Math.round(confidence * 100)}%${bucket === 'neutral' ? ' 上涨' : ''}`;
  const totalW = Object.entries(MODEL_WEIGHTS).reduce((acc, [k, w]) => acc + (isFiniteNumber(values[k]) ? w : 0), 0) || 1;
  const a = { current, ma20, ma60, rsi, macdHist, volumeRatio, volatility60, offHigh, marketRegime };
  const factors = Object.entries(MODEL_WEIGHTS).map(([key, w]) => {
    const v = values[key]; const applicable = isFiniteNumber(v);
    return { key, ...FACTOR_META[key], value: applicable ? v : null, weight: w, applicable, points: applicable ? Math.round((v * w / totalW) * 10 * 100) / 100 : 0, detail: factorDetail(key, { a, core, valuation, lastIdx: i, adj }) };
  });
  const oneYear = core.windows.find((w) => w.label === '1Y');
  const maxDrawdown = (oneYear?.available ? oneYear.maxDrawdown : core.riskStats?.maxDrawdown ?? 0) * 100;
  const riskScore = clamp((volatility / 60) * 55 + offHigh * 80 + (core.riskStats?.volPercentile ?? 0.5) * 20 + (spec.kind === 'future' || spec.kind === 'option' ? 10 : 0), 5, 96);
  const stopDistance = Math.max(atr * 1.6, current * 0.025); const targetDistance = stopDistance * 2;
  const plan = signal === 'short' ? { entry: current, stop: current + stopDistance, target: current - targetDistance } : { entry: current, stop: current - stopDistance, target: current + targetDistance };
  const optionOverlay = signal === 'long' ? '定义风险看涨价差' : signal === 'short' ? '定义风险看跌价差' : '不做方向性期权';
  return {
    current, previous, oneDay, oneMonth, threeMonth, sixMonth, ma20, ma60, rsi, macd, macdSignal, macdHist, atr, volumeRatio, volatility, bollingerPosition, bbUpper, bbLower,
    score, techScore, factors, signal, signalText, confidence, confidenceText, riskScore, marketRegime, optionOverlay, plan, maxDrawdown, beta: core.capm?.beta ?? null,
    dataQuality: clamp(n / 500, 0.35, 1), valuation, core, upside: valuation?.composite?.upside ?? null,
  };
}

function runValuationAndCompose() {
  const payload = state.current; const core = state.core; if (!payload || !core) return;
  const symbol = payload.symbol; let valuation = null; state.valuationMsg = null;
  if (isEquitySymbol(symbol)) {
    const price = payload.closes.at(-1); const ccy = core.ccy;
    let F = state.manualFundamentals?.symbol === symbol ? state.manualFundamentals : state.fundamentals;
    if (payload.demo) F = QSValuation.mockFundamentals(symbol, price, ccy);
    if (F && !F.error && !F.pending) {
      try {
        valuation = QSValuation.runValuation(F, { price, priceHistory: { ts: payload.timestamps, closes: payload.closes }, regressionBeta: core.capm?.beta, liveRf: state.liveRf, peers: state.peerFundamentals, overrides: state.assumptionOverrides[symbol] || {} });
      } catch (error) { console.error(error); state.valuationMsg = `估值计算出错：${error.message}`; }
    } else if (F?.error) state.valuationMsg = `基本面数据暂不可用（${F.error}）。美股走 SEC EDGAR、A 股和港股走东方财富，其他市场只能用 Yahoo；可稍后刷新，或在“手动录入基本面”中填写。`;
    else state.valuationMsg = '正在读取财报（美股 SEC EDGAR · A 股/港股 东方财富）…';
  }
  state.valuation = valuation;
  state.currentAnalysis = composeAnalysis(payload, core, valuation);
}

async function fetchFundamentals(symbol) {
  const cached = state.fundamentalsCache[symbol]; if (cached && !cached.error && Date.now() - cached.fetchedAt < 6 * 3600 * 1000) return cached;
  try {
    const response = await fetch(`/api/fundamentals?symbol=${encodeURIComponent(symbol)}`); const json = await response.json();
    if (!response.ok || json.error) throw new Error(json.detail || json.error || `HTTP ${response.status}`);
    json.fetchedAt = Date.now(); state.fundamentalsCache[symbol] = json; return json;
  } catch (error) { return { error: String(error.message || error).slice(0, 260), symbol }; }
}

async function ensureLiveRf() {
  if (isFiniteNumber(state.liveRf.USD)) return;
  const tnx = await fetchPayload('^TNX', '1mo', { silent: true });
  if (tnx && !tnx.demo) { let y = tnx.closes.at(-1); if (y > 20) y /= 10; if (y > 0.2 && y < 15) state.liveRf.USD = y / 100; }
}

async function loadPeers(symbol, requestId) {
  const override = state.peerOverrides[symbol]; const peers = (override ? override.split(/[\s,，]+/).map(normalizeSymbol).filter(Boolean) : defaultPeers(symbol)).filter((s) => s !== symbol).slice(0, 8);
  const input = $('#as_peers'); if (input && document.activeElement !== input) input.value = peers.join(', ');
  if (!peers.length || state.current?.demo) { state.peerFundamentals = []; return; }
  const results = await Promise.all(peers.map((s) => fetchFundamentals(s)));
  if (requestId !== state.currentRequestId) return;
  state.peerFundamentals = results.filter((r) => r && !r.error && r.stats);
  runValuationAndCompose(); renderCurrent(); renderDailyAdvice();
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function normalCdf(value) {
  return QSAnalytics.normalCdf(value); // v2.0: fixes the v1.1 approximation, which returned N(0) = 0.75
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const expiry = new Date(`${dateText}T23:59:59+08:00`);
  return (expiry.getTime() - Date.now()) / 86400000;
}

function calculateOptionModel() {
  const spot = Number($('#optionSpot').value); const strike = Number($('#optionStrike').value); const days = daysUntil($('#optionExpiry').value); const sigma = Number($('#optionIv').value) / 100; const rate = Number($('#optionRate').value) / 100; const type = $('#optionType').value; const side = $('#optionSide').value; const multiplier = Number($('#optionMultiplier').value); const contracts = Number($('#optionContracts').value); const premiumRaw = $('#optionPremium').value.trim(); const premiumInput = premiumRaw === '' ? null : Number(premiumRaw);
  if (![spot, strike, days, sigma, rate, multiplier, contracts].every(Number.isFinite) || spot <= 0 || strike <= 0 || days <= 0 || sigma <= 0 || multiplier <= 0 || contracts <= 0) { $('#optionModelStatus').textContent = '输入不完整'; $('#optionBias').textContent = '--'; $('#optionNote').textContent = '请填写现价、行权价、到期日、隐含波动率、乘数和合约数量；到期日必须晚于今天。'; $('#optionNote').className = 'option-note warning'; return; }
  const T = days / 365; const sqrtT = Math.sqrt(T); const d1 = (Math.log(spot / strike) + (rate + .5 * sigma * sigma) * T) / (sigma * sqrtT); const d2 = d1 - sigma * sqrtT; const discount = Math.exp(-rate * T); const isCall = type === 'call'; const basePrice = isCall ? spot * normalCdf(d1) - strike * discount * normalCdf(d2) : strike * discount * normalCdf(-d2) - spot * normalCdf(-d1); const baseDelta = isCall ? normalCdf(d1) : normalCdf(d1) - 1; const baseGamma = normalPdf(d1) / (spot * sigma * sqrtT); const baseVega = spot * normalPdf(d1) * sqrtT / 100; const baseThetaYear = isCall ? -(spot * normalPdf(d1) * sigma) / (2 * sqrtT) - rate * strike * discount * normalCdf(d2) : -(spot * normalPdf(d1) * sigma) / (2 * sqrtT) + rate * strike * discount * normalCdf(-d2); const positionSign = side === 'long' ? 1 : -1; const quantity = multiplier * contracts; const premium = Number.isFinite(premiumInput) && premiumInput >= 0 ? premiumInput : basePrice; const payoff = (underlying) => isCall ? Math.max(underlying - strike, 0) : Math.max(strike - underlying, 0); const pnlAt = (underlying) => positionSign * (payoff(underlying) - premium) * quantity; const lowScenario = pnlAt(spot * .95); const highScenario = pnlAt(spot * 1.05); const breakeven = isCall ? strike + premium : strike - premium; const maxLoss = side === 'long' ? premium * quantity : isCall ? null : Math.max(strike - premium, 0) * quantity;
  $('#optionModelStatus').textContent = `${side === 'long' ? '买入' : '卖出'} ${isCall ? 'Call' : 'Put'} · ${Math.round(days)} 天`; $('#optionBias').textContent = state.currentAnalysis?.optionOverlay || (isCall ? '看涨结构' : '看跌结构'); $('#optionTheo').textContent = formatNumber(basePrice, 2); $('#optionDelta').textContent = formatNumber(baseDelta * positionSign, 3); $('#optionGamma').textContent = formatNumber(baseGamma * positionSign, 4); $('#optionVega').textContent = formatNumber(baseVega * positionSign, 3); $('#optionTheta').textContent = formatNumber((baseThetaYear / 365) * positionSign, 3); $('#optionBreakeven').textContent = formatNumber(breakeven, 2); $('#optionMaxLoss').textContent = maxLoss === null ? '理论无限' : formatCompact(maxLoss); $('#optionScenario').textContent = `${formatCompact(lowScenario)} / ${formatCompact(highScenario)}`; $('#optionNote').textContent = `理论权利金 ${formatNumber(basePrice, 2)}；实际权利金 ${Number.isFinite(premiumInput) && premiumInput >= 0 ? formatNumber(premiumInput, 2) : '未输入，采用理论值'}。±5% 情景为到期收益简化估算，未计手续费、滑点、分红、提前行权和波动率变化。`; $('#optionNote').className = 'option-note';
}

function syncOptionInputs() {
  if (!state.current || !state.currentAnalysis) return;
  const input = $('#optionUnderlying'); const changed = input.dataset.syncedSymbol !== state.symbol;
  if (changed) { input.value = state.symbol; $('#optionSpot').value = state.currentAnalysis.current.toFixed(state.currentAnalysis.current > 1000 ? 0 : 2); $('#optionStrike').value = state.currentAnalysis.current.toFixed(state.currentAnalysis.current > 1000 ? 0 : 2); $('#optionIv').value = clamp(state.currentAnalysis.volatility || 30, 10, 120).toFixed(1); input.dataset.syncedSymbol = state.symbol; }
  if (!$('#optionExpiry').value || changed) { const expiry = new Date(Date.now() + 30 * 86400000); $('#optionExpiry').value = expiry.toISOString().slice(0, 10); }
}

function parsePayload(raw, symbol) {
  if (!raw || !raw.chart || !raw.chart.result?.[0]) throw new Error('没有可用行情');
  const result = raw.chart.result[0]; const timestamps = result.timestamp || []; const quote = result.indicators?.quote?.[0] || {}; const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];
  const rows = timestamps.map((timestamp, index) => ({ timestamp, close: quote.close?.[index], high: quote.high?.[index], low: quote.low?.[index], volume: quote.volume?.[index], adj: adjclose[index] })).filter((row) => isFiniteNumber(row.close) && row.close > 0);
  if (rows.length < 10) throw new Error('行情数据长度不足');
  // adjusted close (splits + dividends) drives every return-based statistic; raw close is used for display
  return { symbol, meta: result.meta || {}, timestamps: rows.map((row) => row.timestamp), closes: rows.map((row) => Number(row.close)), adj: rows.map((row) => (isFiniteNumber(row.adj) && row.adj > 0 ? Number(row.adj) : Number(row.close))), highs: rows.map((row) => Number(row.high || row.close)), lows: rows.map((row) => Number(row.low || row.close)), volumes: rows.map((row) => Number(row.volume || 0)) };
}

function seededRandom(seed) {
  let value = seed % 2147483647; if (value <= 0) value += 2147483646;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function mockPayload(symbol, range = '1y') {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rand = seededRandom(seed); const count = range === '1mo' ? 24 : range === '3mo' ? 66 : range === '6mo' ? 132 : range === '5y' ? 1260 : 252;
  const base = symbol.endsWith('.HK') || symbol.startsWith('^HS') ? (symbol === '^HSI' ? 18500 : 4200) : symbol === '^IXIC' ? 17500 : symbol === '^GSPC' ? 5400 : symbol === 'TSLA' ? 240 : symbol === 'NVDA' ? 125 : 210;
  let price = base; const timestamps = []; const closes = []; const highs = []; const lows = []; const volumes = [];
  for (let index = 0; index < count; index += 1) { const drift = (rand() - .44) * base * .018; price = Math.max(base * .45, price + drift); const wave = Math.sin(index / 15) * base * .008; const close = price + wave; const spread = close * (.008 + rand() * .012); timestamps.push(Math.floor(Date.now() / 1000) - (count - index) * 86400); closes.push(close); highs.push(close + spread * rand()); lows.push(close - spread * rand()); volumes.push((base > 1000 ? 900000000 : 40000000) * (.55 + rand() * 1.1)); }
  return { symbol, meta: { shortName: symbolLabel(symbol).name, currency: symbolLabel(symbol).currency }, timestamps, closes, adj: closes.slice(), highs, lows, volumes, demo: true };
}

async function fetchPayload(symbol, range, options = {}) {
  try {
    const endpoint = symbol === 'XAUUSD=X' ? `/api/lbma?range=${range}` : `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('行情接口暂不可用');
    const json = await response.json(); return parsePayload(json, symbol);
  } catch (error) {
    if (!options.silent) showToast(`${symbol} 暂未取得实时数据，已切换演示数据`);
    return mockPayload(symbol, range);
  }
}

function drawLineChart(container, timestamps, closes, ma20, ma60) {
  if (!closes?.length) { container.innerHTML = '<div class="empty-chart">暂无走势图数据</div>'; return; }
  const width = 800; const height = 245; const padX = 3; const padY = 8; const min = Math.min(...closes, ...ma20.filter(isFiniteNumber), ...ma60.filter(isFiniteNumber)); const max = Math.max(...closes, ...ma20.filter(isFiniteNumber), ...ma60.filter(isFiniteNumber)); const span = max - min || 1;
  const point = (value, index) => `${padX + (index / Math.max(1, closes.length - 1)) * (width - padX * 2)},${height - padY - ((value - min) / span) * (height - padY * 2)}`;
  const line = closes.map((value, index) => point(value, index)).join(' '); const ma20Line = ma20.map((value, index) => isFiniteNumber(value) ? point(value, index) : '').filter(Boolean).join(' '); const ma60Line = ma60.map((value, index) => isFiniteNumber(value) ? point(value, index) : '').filter(Boolean).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  const grid = [0.12, .37, .62, .87].map((ratio) => `<line x1="0" y1="${height * ratio}" x2="${width}" y2="${height * ratio}" stroke="rgba(154,176,205,.10)" stroke-width="1"/>`).join('');
  const dots = [0, Math.floor(closes.length * .33), Math.floor(closes.length * .66), closes.length - 1].map((index) => `<circle cx="${padX + (index / Math.max(1, closes.length - 1)) * (width - padX * 2)}" cy="${height - padY - ((closes[index] - min) / span) * (height - padY * 2)}" r="2.5" fill="#50e3c2" stroke="#0d131c" stroke-width="2"/>`).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#50e3c2" stop-opacity=".25"/><stop offset="1" stop-color="#50e3c2" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#areaGradient)"/><polyline points="${ma60Line}" fill="none" stroke="#ae8cff" stroke-opacity=".65" stroke-width="1.4" stroke-dasharray="4 4"/><polyline points="${ma20Line}" fill="none" stroke="#ffb45e" stroke-opacity=".82" stroke-width="1.4"/><polyline points="${line}" fill="none" stroke="#50e3c2" stroke-width="2"/>${dots}</svg>`;
  const labels = [0, Math.floor(timestamps.length * .33), Math.floor(timestamps.length * .66), timestamps.length - 1].map((index) => `<span>${formatDate(timestamps[index])}</span>`).join(''); $('#chartXLabels').innerHTML = labels;
  $('#chartYLabels').innerHTML = [max, max - span / 3, max - span * 2 / 3, min].map((value) => `<span>${formatNumber(value, value > 1000 ? 0 : 2)}</span>`).join('');
}

function drawVolumeChart(container, volumes, closes) {
  if (!volumes?.length) { container.innerHTML = ''; return; }
  const width = 800; const height = 49; const max = Math.max(...volumes) || 1; const barWidth = Math.max(2, width / volumes.length * .68); const gap = width / volumes.length;
  const bars = volumes.map((volume, index) => { const h = Math.max(2, volume / max * height); const x = index * gap + (gap - barWidth) / 2; const color = index && closes[index] >= closes[index - 1] ? '#50e3c2' : '#ff6e77'; return `<rect x="${x.toFixed(2)}" y="${(height - h).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="1.5" fill="${color}"/>`; }).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" stroke="rgba(154,176,205,.14)"/>${bars}</svg>`;
}

function renderCurrent() {
  const payload = state.current; const analysis = state.currentAnalysis; if (!payload || !analysis) return;
  const meta = symbolLabel(state.symbol); const price = analysis.current; const changeClass = analysis.oneDay >= 0 ? 'positive' : 'negative'; const digits = price > 1000 ? 0 : 2;
  $('#instrumentName').textContent = payload.meta.shortName || meta.name; $('#instrumentTicker').textContent = meta.short; $('#currentPrice').textContent = formatNumber(price, digits); $('#priceCurrency').textContent = (payload.meta.currency || meta.currency || 'USD').toUpperCase(); $('#priceChange').textContent = `${formatPct(analysis.oneDay)} 今日`; $('#priceChange').className = `price-change ${changeClass}`; $('#priceNote').textContent = `${payload.demo ? '演示数据 · ' : ''}最近交易日 ${formatDate(payload.timestamps.at(-1), true)} · 分析样本 ${payload.closes.length} 根日线`;
  $('#signalStatus').textContent = payload.demo ? 'DEMO MODE' : 'LIVE SIGNAL'; $('#verdictText').textContent = analysis.signalText; $('#verdictBadge').className = `verdict-badge ${analysis.signal}`; $('#verdictBadge .verdict-icon').textContent = analysis.signal === 'long' ? '↗' : analysis.signal === 'short' ? '↘' : '•'; $('#signalScore').textContent = `${analysis.score > 0 ? '+' : ''}${analysis.score.toFixed(1)} / 10`; $('#scoreFill').style.width = `${clamp(50 + analysis.score * 5, 6, 94)}%`;
  $('#confidenceValue').textContent = analysis.confidenceText;
  $('#holdingPeriod').textContent = isFiniteNumber(analysis.upside) ? `${formatPct(analysis.upside * 100, 1)}` : (isEquitySymbol(state.symbol) ? '计算中/无数据' : '不适用');
  $('#holdingPeriod').className = isFiniteNumber(analysis.upside) ? (analysis.upside >= 0 ? 'positive' : 'negative') : '';
  $('#regimeValue').textContent = analysis.marketRegime;
  $('#metricPrice').textContent = formatNumber(price, digits); $('#metricPriceSub').textContent = `${formatPct(analysis.oneDay)} 当日`; $('#metricTrend').textContent = formatPct((price / analysis.ma20 - 1) * 100, 1); $('#metricTrendSub').textContent = `相对 MA20 · 1M ${formatPct(analysis.oneMonth, 1)}`; $('#metricRsi').textContent = formatNumber(analysis.rsi, 1); $('#metricRsiSub').textContent = analysis.rsi >= 70 ? '偏热区域' : analysis.rsi <= 30 ? '超卖区域' : '中性区间'; $('#metricVolume').textContent = isFiniteNumber(analysis.volumeRatio) ? `${formatNumber(analysis.volumeRatio, 2)}x` : '--'; $('#metricVolumeSub').textContent = analysis.volumeRatio >= 1.25 ? '放量确认' : 'vs 前20日均量'; $('#metricVolatility').textContent = `${formatNumber(analysis.volatility, 1)}%`; $('#metricVolatilitySub').textContent = isFiniteNumber(analysis.core.riskStats?.ewmaVolAnnual) ? `EWMA ${formatNumber(analysis.core.riskStats.ewmaVolAnnual * 100, 1)}%` : '252日年化'; $('#metricMacd').textContent = formatNumber(analysis.macdHist, price > 1000 ? 1 : 2); $('#metricMacdSub').textContent = analysis.macdHist >= 0 ? '多头动量' : '空头动量';
  // chart: indicators are computed on the full 5-year history, then the selected window is displayed
  const bars = DISPLAY_BARS[state.range] || 253; const start = Math.max(0, payload.closes.length - bars);
  const ma20Full = smaSeries(payload.closes, 20); const ma60Full = smaSeries(payload.closes, 60);
  const spec = assetSpec(state.symbol); const notionalLabel = spec.kind === 'future' ? '名义额' : '估算额'; $('#chartTitle').textContent = `${meta.short} · 日线 · ${({ '1mo': '1 个月', '3mo': '3 个月', '6mo': '6 个月', '1y': '1 年', '5y': '5 年' })[state.range] || ''}`; $('#ma20Value').textContent = formatNumber(analysis.ma20, digits); $('#ma60Value').textContent = formatNumber(analysis.ma60, digits); $('#bollingerValue').textContent = analysis.bollingerPosition >= 0.8 ? '上轨附近' : analysis.bollingerPosition <= 0.2 ? '下轨附近' : '通道中部'; $('#volumeLatest').textContent = `${formatCompact(payload.volumes.at(-1))} · ${notionalLabel} ${formatCompact(estimateNotional(state.symbol, price, payload.volumes.at(-1)))} · ${formatDate(payload.timestamps.at(-1))}`;
  drawLineChart($('#priceChart'), payload.timestamps.slice(start), payload.closes.slice(start), ma20Full.slice(start), ma60Full.slice(start)); drawVolumeChart($('#volumeChart'), payload.volumes.slice(start), payload.closes.slice(start));
  $('#scoreBreakdown').textContent = `${analysis.score > 0 ? '+' : ''}${analysis.score.toFixed(1)} / 10`;
  $('#factorList').innerHTML = analysis.factors.map((factor) => {
    const klass = !factor.applicable ? 'neutral' : factor.value > 0.1 ? 'positive' : factor.value < -0.1 ? 'negative' : 'neutral';
    const color = klass === 'positive' ? '#50e3c2' : klass === 'negative' ? '#ff6e77' : '#ffb45e';
    const width = factor.applicable ? clamp(50 + factor.value * 45, 4, 96) : 50;
    return `<div class="factor-row ${factor.applicable ? '' : 'factor-na'}"><div class="factor-icon ${klass}" style="background:${klass === 'positive' ? 'rgba(80,227,194,.10)' : klass === 'negative' ? 'rgba(255,110,119,.10)' : 'rgba(255,180,94,.10)'}">${factor.icon}</div><div class="factor-copy"><strong>${factor.title}<em>${Math.round(factor.weight * 100)}%</em></strong><small title="${factor.detail}">${factor.detail}</small><div class="factor-trend"><span style="width:${width}%;background:${color}"></span></div></div><div class="factor-score ${klass}">${factor.applicable ? `${factor.points > 0 ? '+' : ''}${factor.points.toFixed(2)}` : 'N/A'}</div></div>`;
  }).join('');
  const plan = analysis.plan; $('#planEntry').textContent = formatNumber(plan.entry, digits); $('#planStop').textContent = formatNumber(plan.stop, digits); $('#planTarget').textContent = formatNumber(plan.target, digits); $('#planRatio').textContent = '1 : 2.0'; $('#planDirection').textContent = analysis.signal === 'short' ? '空头情景' : analysis.signal === 'long' ? '多头情景' : '方向未确认'; $('#planStopSub').textContent = `ATR × 1.6 · ${formatNumber(analysis.atr, digits)}`;
  const fair = analysis.valuation?.composite?.fair;
  $('#planNote').textContent = analysis.signal === 'neutral' ? `当前综合分未达阈值 ±${analysis.core.threshold}，建议等待趋势、动量与估值同向后再评估。以上价位仅作情景推演。` : `${analysis.signal === 'long' ? '若做多' : '若做空'}，以 ATR 风险带计算止损与 2R 目标${isFiniteNumber(fair) ? `；综合公允价值 ${formatNumber(fair, digits)} 可作为中期参照` : ''}。价格为示意，不构成投资建议。`;
  $('#riskLevel').textContent = analysis.riskScore >= 70 ? 'HIGH' : analysis.riskScore >= 45 ? 'MEDIUM' : 'LOW'; $('#riskFill').style.width = `${analysis.riskScore}%`;
  const rs = analysis.core.riskStats;
  $('#riskItems').innerHTML = `<span>波动率 ${formatNumber(analysis.volatility, 1)}%</span><span>1Y 回撤 ${formatNumber(Math.abs(analysis.maxDrawdown), 1)}%</span><span>VaR95 ${rs ? formatNumber(rs.var95 * 100, 2) : '--'}%</span><span>β ${isFiniteNumber(analysis.beta) ? formatNumber(analysis.beta, 2) : '--'}</span>`;
  state.quoteCache[state.symbol] = payload; syncOptionInputs(); calculateOptionModel(); renderPositions(); $('#dataMode').textContent = payload.demo ? 'DEMO' : 'LIVE'; $('#updatedAt').textContent = `更新于 ${formatTime()}`;
  renderAnalysisPanels();
}

function renderAnalysisPanels() {
  const analysis = state.currentAnalysis; if (!analysis) return; const v = state.valuation;
  const equity = isEquitySymbol(state.symbol);
  QSPanels.renderValuation(v, { status: equity ? (state.valuationMsg ? '数据不可用' : '计算中') : '不适用', message: equity ? state.valuationMsg : null, manual: state.manualFundamentals?.symbol === state.symbol });
  QSPanels.renderFundamentals(v);
  QSPanels.renderQuant({ ...analysis.core });
  QSPanels.renderBacktest({ ...analysis.core });
  $('#valuationPanel').classList.toggle('is-disabled', !equity);
  if (v && state.formSymbol !== state.symbol) { QSPanels.fillAssumptionForm(v.assumptions); state.formSymbol = state.symbol; }
  if (!v && state.formSymbol !== state.symbol) { document.querySelectorAll('#assumptionForm input[id^="as_"]').forEach((el) => { if (el.id !== 'as_peers') el.value = ''; }); }
}

function valuationAdviceSuffix(analysis) {
  const c = analysis.valuation?.composite; if (!c) return '';
  if (analysis.signal === 'long' && c.upside < -0.2) return ` 注意：估值模型显示高于公允价值 ${Math.abs(c.upside * 100).toFixed(0)}%，属于“趋势强但贵”，仓位与止损都应更保守。`;
  if (analysis.signal !== 'long' && c.upside > 0.25) return ` 估值模型显示有 ${Math.round(c.upside * 100)}% 的折价，但价格趋势尚未确认，可放入观察池等待右侧信号。`;
  return ` 估值偏离 ${c.upside >= 0 ? '+' : ''}${(c.upside * 100).toFixed(0)}%（模型可靠度 ${Math.round(c.reliability * 100)}%）。`;
}

async function loadSentiment(symbol, requestId, refresh = false) {
  // v2.4: indices, futures, FX and crypto are scored too (server picks asset-specific queries and prompt)
  QSSentiment.renderLoading(symbol);
  const meta = state.current?.symbol === symbol ? state.current.meta || {} : {};
  const preset = isEquitySymbol(symbol) ? null : [...ALL_BENCHMARKS, ...GLOBAL_ASSETS].find((item) => item.symbol === symbol);
  const name = preset?.name || meta.longName || meta.shortName || '';
  try {
    const response = await fetch(`/api/sentiment?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}${refresh ? '&refresh=1' : ''}`);
    const json = await response.json(); if (requestId !== state.currentRequestId) return;
    state.sentiment = json; QSSentiment.render(json, { payload: state.current });
  } catch (error) {
    if (requestId === state.currentRequestId) QSSentiment.render({ error: true }, { message: '新闻情绪接口不可用：请确认已用新版 server.py 重启 QuantScope。' });
  }
}

async function loadApp() {
  state.currentRequestId += 1; const requestId = state.currentRequestId; const symbol = state.symbol;
  state.loading = true; $('#refreshButton').classList.add('loading'); $('#signalStatus').textContent = 'CALCULATING';
  const benchSym = primaryBenchmark(symbol);
  const currentPromise = fetchPayload(symbol, '5y');
  const cachedBench = state.longBenchmarks[benchSym];
  const benchPromise = benchSym === symbol ? Promise.resolve(null) : cachedBench && !cachedBench.demo ? Promise.resolve(cachedBench) : fetchPayload(benchSym, '5y', { silent: true });
  if (isEquitySymbol(symbol) && (!state.fundamentals || state.fundamentals.symbol !== symbol)) { state.fundamentals = { pending: true, symbol }; state.peerFundamentals = []; }
  const fundamentalsPromise = isEquitySymbol(symbol) ? fetchFundamentals(symbol) : Promise.resolve(null);
  const rfPromise = ensureLiveRf().catch(() => null);
  const benchmarkPromises = ALL_BENCHMARKS.filter((item) => !state.benchmarkPayloads[item.symbol] || state.benchmarkPayloads[item.symbol].demo).map(async (item) => [item.symbol, await fetchPayload(item.symbol, '6mo', { silent: true })]);
  const globalAssetPromises = GLOBAL_ASSETS.filter((item) => !state.globalAssetPayloads[item.symbol] || state.globalAssetPayloads[item.symbol].demo).map(async (item) => [item.symbol, await fetchPayload(item.symbol, '6mo', { silent: true })]);
  const [current, bench, , benchmarks, globalAssets] = await Promise.all([currentPromise, benchPromise, rfPromise, Promise.all(benchmarkPromises), Promise.all(globalAssetPromises)]);
  if (requestId !== state.currentRequestId) return;
  benchmarks.forEach(([s, payload]) => { state.benchmarkPayloads[s] = payload; state.quoteCache[s] = payload; });
  globalAssets.forEach(([s, payload]) => { state.globalAssetPayloads[s] = payload; state.quoteCache[s] = payload; });
  if (bench) state.longBenchmarks[benchSym] = bench;
  state.quoteCache[symbol] = current; state.current = current;
  state.core = computeCore(current, bench);
  runValuationAndCompose();
  renderBenchmarks(); renderChinaIndices(); renderGlobalAssets(); renderCurrent(); renderDailyAdvice();
  state.loading = false; $('#refreshButton').classList.remove('loading');
  loadSentiment(symbol, requestId);
  // fundamentals and peers arrive later; the verdict is recomputed when they do
  const fundamentals = await fundamentalsPromise; if (requestId !== state.currentRequestId) return;
  if (fundamentals) { state.fundamentals = fundamentals; runValuationAndCompose(); renderCurrent(); renderDailyAdvice(); if (!fundamentals.error) loadPeers(symbol, requestId); }
}

function bindValuationControls() {
  $('#assumptionForm').addEventListener('submit', (event) => {
    event.preventDefault(); const overrides = QSPanels.readAssumptionForm(); state.assumptionOverrides[state.symbol] = overrides;
    const peerText = $('#as_peers').value.trim(); const peerChanged = peerText !== (state.peerOverrides[state.symbol] || defaultPeers(state.symbol).join(', '));
    if (peerChanged) state.peerOverrides[state.symbol] = peerText;
    runValuationAndCompose(); renderCurrent(); renderDailyAdvice(); if (state.valuation) QSPanels.fillAssumptionForm(state.valuation.assumptions);
    if (peerChanged) loadPeers(state.symbol, state.currentRequestId);
    showToast('已按新假设重新估值');
  });
  $('#resetAssumptions').addEventListener('click', () => { delete state.assumptionOverrides[state.symbol]; delete state.peerOverrides[state.symbol]; runValuationAndCompose(); renderCurrent(); renderDailyAdvice(); if (state.valuation) QSPanels.fillAssumptionForm(state.valuation.assumptions); loadPeers(state.symbol, state.currentRequestId); showToast('已恢复默认假设'); });
  $('#applyManual').addEventListener('click', () => {
    const F = QSPanels.readManualFundamentals(state.symbol, state.current?.closes?.at(-1), state.core?.ccy || 'USD');
    if (!F) { showToast('至少需要填写总股本，以及净利润 / EBIT / 自由现金流中的一项'); return; }
    state.manualFundamentals = F; runValuationAndCompose(); renderCurrent(); renderDailyAdvice(); if (state.valuation) QSPanels.fillAssumptionForm(state.valuation.assumptions); showToast('已使用手动基本面估值');
  });
  $('#clearManual').addEventListener('click', () => { state.manualFundamentals = null; $$('#manualBox input').forEach((el) => { el.value = ''; }); runValuationAndCompose(); renderCurrent(); renderDailyAdvice(); });
}

function renderGlobalAssets() {
  const grid = $('#globalAssetGrid'); if (!grid) return;
  grid.innerHTML = GLOBAL_ASSETS.map((asset) => {
    const payload = state.globalAssetPayloads[asset.symbol];
    if (!payload) return `<div class="asset-skeleton"></div>`;
    const price = payload.closes.at(-1); const change = changeFrom(payload.closes, 1); const iconClass = asset.kind === 'future' ? 'oil' : asset.kind === 'crypto' ? 'bitcoin' : 'gold';
    return `<button class="global-asset-card ${state.symbol === asset.symbol ? 'active' : ''}" data-global-symbol="${asset.symbol}"><div class="global-asset-card-top"><span class="asset-card-icon ${iconClass}" style="color:${asset.color}">${asset.icon}</span><span>${asset.short}</span></div><span class="asset-card-name">${asset.name}</span><div class="asset-card-price"><strong>${formatNumber(price, price > 1000 ? 0 : 2)}</strong><small>${asset.unit}</small></div><span class="asset-card-change ${change >= 0 ? 'positive' : 'negative'}">${formatPct(change)} ${payload.demo ? '· DEMO' : ''}</span></button>`;
  }).join('');
  $$('[data-global-symbol]').forEach((button) => button.addEventListener('click', () => setSymbol(button.dataset.globalSymbol)));
}

function currencyForSymbol(symbol) {
  if (symbol.endsWith('.HK')) return 'HKD';
  if (symbol.endsWith('.SI')) return 'SGD';
  return 'USD';
}

function renderWatchlist() {
  const list = $('#watchlist'); const chips = $('#watchChipList'); if (!list || !chips) return;
  list.innerHTML = state.watchlist.map((symbol) => { const label = symbolLabel(symbol); const badge = symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 1) || '•'; const badgeClass = symbol.endsWith('.HK') ? 'hk' : symbol.endsWith('.SI') ? 'sg' : symbol === 'BTC-USD' ? 'red' : ''; return `<button class="watch-item ${state.symbol === symbol ? 'active' : ''}" data-symbol="${symbol}"><span class="ticker-badge ${badgeClass}">${badge}</span><span>${label.name.replace(' · 自定义标的', '')}</span><small>${label.short}</small></button>`; }).join('');
  chips.innerHTML = state.watchlist.map((symbol) => { const label = symbolLabel(symbol); return `<div class="watch-chip ${state.symbol === symbol ? 'active' : ''}"><button class="watch-chip-main" data-watch-symbol="${symbol}">${label.short}</button><button class="watch-chip-remove" data-remove-watch="${symbol}" title="移除自选">×</button></div>`; }).join('');
  $$('[data-watch-symbol]').forEach((button) => button.addEventListener('click', () => setSymbol(button.dataset.watchSymbol)));
  $$('[data-remove-watch]').forEach((button) => button.addEventListener('click', () => removeWatch(button.dataset.removeWatch)));
}

function addWatch(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!/^[A-Z0-9.^=_:-]{1,20}$/.test(normalized)) { showToast('请输入合法代码，例如 AAPL、0700.HK 或 DBS.SI'); return; }
  if (!state.watchlist.includes(normalized)) state.watchlist.unshift(normalized);
  persistUserData(); renderWatchlist(); $('#watchSymbolInput').value = ''; showToast(`${normalized} 已加入自选`);
}

function removeWatch(symbol) {
  state.watchlist = state.watchlist.filter((item) => item !== symbol);
  if (!state.watchlist.length) state.watchlist = ['AAPL'];
  persistUserData(); renderWatchlist();
}

function positionMultiplier(position) {
  if (isFiniteNumber(position.multiplier) && Number(position.multiplier) > 0) return Number(position.multiplier);
  if (position.kind === 'option') return 100;
  return assetSpec(position.symbol).contractMultiplier || 1;
}

function positionMark(position) {
  if (isFiniteNumber(position.mark) && Number(position.mark) > 0) return Number(position.mark);
  return state.quoteCache[position.symbol]?.closes?.at(-1) || null;
}

function hydratePositionQuote(position) {
  if (isFiniteNumber(position.mark) || state.quoteCache[position.symbol] || state.positionQuotePromises[position.symbol]) return;
  state.positionQuotePromises[position.symbol] = fetchPayload(position.symbol, '3mo').then((payload) => { state.quoteCache[position.symbol] = payload; renderPositions(); }).finally(() => { delete state.positionQuotePromises[position.symbol]; });
}

function renderPositions() {
  const list = $('#positionList'); if (!list) return;
  if (!state.positions.length) { list.innerHTML = '<div class="empty-position">还没有仓位。先加入自选，或记录第一笔仓位。</div>'; $('#portfolioValue').textContent = '--'; $('#portfolioPnl').textContent = '--'; $('#portfolioCount').textContent = '0'; return; }
  let valuedCount = 0; let totalValue = 0; let totalPnl = 0; const currencies = new Set();
  list.innerHTML = state.positions.map((position) => {
    const mark = positionMark(position); const quantity = Number(position.quantity); const averageCost = Number(position.average); const multiplier = positionMultiplier(position); const pnl = isFiniteNumber(mark) ? (position.side === 'long' ? Number(mark) - averageCost : averageCost - Number(mark)) * quantity * multiplier : null; const notional = isFiniteNumber(mark) ? Math.abs(Number(mark) * quantity * multiplier) : null; const currency = currencyForSymbol(position.symbol); currencies.add(currency); if (isFiniteNumber(notional)) { valuedCount += 1; totalValue += notional; totalPnl += pnl; } if (!isFiniteNumber(position.mark)) hydratePositionQuote(position); const label = symbolLabel(position.symbol); const pnlClass = pnl === null ? '' : pnl >= 0 ? 'positive' : 'negative'; return `<div class="position-row"><div class="position-symbol"><strong>${label.short}</strong><small>${position.side === 'long' ? '多' : '空'} · ${position.kind === 'future' ? '期货' : position.kind === 'option' ? '期权' : position.kind === 'crypto' ? '加密' : '股票'}</small></div><div class="position-cell"><span>数量</span><strong>${formatNumber(quantity, 2)}</strong></div><div class="position-cell"><span>成本</span><strong>${formatNumber(averageCost, 2)}</strong></div><div class="position-cell"><span>浮盈亏</span><strong class="${pnlClass}">${pnl === null ? '--' : `${pnl >= 0 ? '+' : ''}${formatCompact(pnl)}`}</strong></div><button class="position-delete" data-delete-position="${position.id}" title="删除仓位">×</button></div>`;
  }).join('');
  $('#portfolioValue').textContent = currencies.size === 1 && valuedCount ? `${formatCompact(totalValue)} ${[...currencies][0]}` : `${valuedCount}/${state.positions.length} 已标价`;
  $('#portfolioPnl').textContent = currencies.size === 1 && valuedCount ? `${totalPnl >= 0 ? '+' : ''}${formatCompact(totalPnl)} ${[...currencies][0]}` : '按币种查看'; $('#portfolioPnl').className = currencies.size === 1 && valuedCount ? (totalPnl >= 0 ? 'positive' : 'negative') : ''; $('#portfolioCount').textContent = String(state.positions.length);
  $$('[data-delete-position]').forEach((button) => button.addEventListener('click', () => { state.positions = state.positions.filter((position) => String(position.id) !== String(button.dataset.deletePosition)); persistUserData(); renderPositions(); }));
}

function addPositionFromForm(event) {
  event.preventDefault(); const symbol = normalizeSymbol($('#positionSymbol').value); const quantity = Number($('#positionQuantity').value); const averageCost = Number($('#positionAverage').value); const markRaw = $('#positionMark').value.trim(); const mark = markRaw === '' ? null : Number(markRaw); const kind = $('#positionKind').value;
  if (!/^[A-Z0-9.^=_:-]{1,20}$/.test(symbol) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCost) || averageCost <= 0 || (mark !== null && (!Number.isFinite(mark) || mark <= 0))) { showToast('请填写合法的代码、数量、成本和标记价'); return; }
  state.positions.unshift({ id: Date.now(), symbol, side: $('#positionSide').value, kind, quantity, average: averageCost, mark, multiplier: kind === 'option' ? 100 : assetSpec(symbol).contractMultiplier || 1 }); persistUserData(); renderPositions(); $('#positionForm').reset(); showToast(`${symbol} 仓位已保存`);
}

function renderDailyAdvice() {
  const payload = state.current; const analysis = state.currentAnalysis; if (!payload || !analysis) return;
  const meta = symbolLabel(state.symbol); const spec = assetSpec(state.symbol); const actionNoun = spec.kind === 'equity' ? '买入' : '做多'; const hot = isFiniteNumber(analysis.rsi) && (analysis.rsi >= 70 || analysis.bollingerPosition >= .92);
  let actionClass = 'neutral'; let action = '等待建议'; let title = '今天先不追价'; let summary = `${meta.short} 的当前信号没有形成足够一致的方向，新增仓位先保持克制。`; let trigger = '收盘站上 MA20，且 MACD 柱体转正'; let execution = '设提醒，等待收盘确认后再评估'; let position = '0% 新增仓位';
  if (payload.demo) { action = 'DEMO ONLY'; title = '当前只适合查看模型'; summary = '行情接口暂不可用，系统已切换演示数据；不要根据这次结果下单。'; trigger = '实时数据恢复，重新刷新页面'; execution = '不下单，只查看指标'; position = '0%'; }
  else if (analysis.signal === 'long' && !hot) { actionClass = 'long'; action = actionNoun === '买入' ? '候选买入' : '候选做多'; title = `${meta.short} 可列入今日候选`; summary = `趋势、动量与市场环境同向，但仍建议用限价单分批执行，不把模型分数当成追价理由。`; trigger = `价格维持 MA20 上方，RSI ${formatNumber(analysis.rsi, 1)} 不进入过热区`; execution = '分 2–3 笔限价；开盘跳涨不追'; position = '单笔风险 ≤ 总资产 0.5–1%'; }
  else if (analysis.signal === 'long' && hot) { action = '等待回踩'; title = `${meta.short} 有多头信号，但不宜追高`; summary = `信号偏多，不过 RSI/布林位置偏热，今天更适合等回踩而不是直接买入。`; trigger = '回落至 MA20 附近并出现止跌；RSI 回到 70 以下'; execution = '只挂回踩限价单，未触发则空仓'; position = '0–0.5% 风险预算'; }
  else if (analysis.signal === 'short') { actionClass = 'short'; action = spec.kind === 'equity' ? '不建议买入' : '不建议做多'; title = `${meta.short} 今日先回避多头`; summary = `趋势与动量偏弱，模型没有给出适合新增多头仓位的条件；如要对冲，只使用已获批的融券、期货或期权权限。`; trigger = '反弹无法站回 MA20，且 MACD 继续走弱'; execution = '不追空；仅在交易权限与止损已确认时执行'; position = '0% 新增多头'; }
  if (!payload.demo) summary += valuationAdviceSuffix(analysis);
  $('#dailyDate').textContent = `新加坡时间 ${singaporeDateLabel()}`; $('#dailyTitle').textContent = title; $('#dailySummary').textContent = summary; $('#dailyActionChip').textContent = action; $('#dailyActionChip').className = `daily-action-chip ${actionClass}`; $('#dailyTrigger').textContent = trigger; $('#dailyExecution').textContent = execution; $('#dailyPosition').textContent = position; $('#dailyNote').textContent = `${payload.demo ? '演示模式。' : '按最近交易日收盘数据计算。'} 这是规则模型的研究输出，不构成针对你的个人投资建议；期货与期权请额外核对合约乘数、保证金、到期日与强平规则。`;
}

function renderBenchmarks() {
  const list = $('#marketPulseList'); list.innerHTML = BENCHMARKS.map((item) => { const payload = state.benchmarkPayloads[item.symbol]; if (!payload) return `<div class="market-row"><span class="market-dot" style="background:${item.color}"></span><span class="market-row-name">${item.name}<small>${item.short}</small></span><span class="market-row-price">--</span><span class="market-row-change">--</span></div>`; const change = changeFrom(payload.closes, 1); return `<div class="market-row"><span class="market-dot" style="background:${item.color}"></span><span class="market-row-name">${item.name}<small>${item.short}</small></span><span class="market-row-price">${formatNumber(payload.closes.at(-1), payload.closes.at(-1) > 1000 ? 0 : 2)}</span><span class="market-row-change ${change >= 0 ? 'positive' : 'negative'}">${formatPct(change, 2)}</span></div>`; }).join(''); $('#pulseDate').textContent = state.benchmarkPayloads['^GSPC'] ? formatDate(state.benchmarkPayloads['^GSPC'].timestamps.at(-1)) : '--'; BENCHMARKS.forEach((item) => { const payload = state.benchmarkPayloads[item.symbol]; const target = document.querySelector(`[data-nav-change="${item.symbol}"]`); if (!target) return; const change = payload ? changeFrom(payload.closes, 1) : null; target.textContent = formatPct(change, 1); target.className = `market-nav-change ${change >= 0 ? 'positive' : 'negative'}`; }); }

function renderChinaIndices() {
  const grid = $('#chinaIndexGrid'); if (!grid) return;
  grid.innerHTML = CHINA_INDICES.map((item) => {
    const payload = state.benchmarkPayloads[item.symbol];
    const price = payload?.closes?.at(-1); const change = payload ? changeFrom(payload.closes, 1) : null;
    return `<button class="china-index-card ${state.symbol === item.symbol ? 'active' : ''}" data-index-symbol="${item.symbol}"><span class="china-index-dot" style="background:${item.color}"></span><span class="china-index-copy"><strong>${item.name}</strong><small>${item.short} · ${item.symbol}</small></span><span class="china-index-quote"><strong>${formatNumber(price, price > 1000 ? 0 : 2)}</strong><small class="${change >= 0 ? 'positive' : 'negative'}">${formatPct(change, 2)}${payload?.demo ? ' · DEMO' : ''}</small></span></button>`;
  }).join('');
  $$('[data-index-symbol]').forEach((button) => button.addEventListener('click', () => setSymbol(button.dataset.indexSymbol)));
}

function boardPayload(symbol) {
  return state.marketBoardPayloads[symbol] || state.quoteCache[symbol] || state.benchmarkPayloads[symbol] || null;
}

function renderMarketBoard() {
  const grid = $('#marketBoardGrid'); if (!grid) return;
  grid.innerHTML = MARKET_REGIONS.map((region) => {
    const indexPayload = boardPayload(region.index.symbol); const indexChange = indexPayload ? changeFrom(indexPayload.closes, 1) : null;
    const indexPrice = indexPayload?.closes?.at(-1);
    const hot = region.stocks.map((stock) => { const payload = boardPayload(stock.symbol); return { ...stock, payload, change: payload ? changeFrom(payload.closes, 1) : null, price: payload?.closes?.at(-1) }; }).sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0)).slice(0, 4);
    const sectors = region.sectors.map((sector) => { const changes = sector.symbols.map((symbol) => { const payload = boardPayload(symbol); return payload ? changeFrom(payload.closes, 1) : null; }).filter(isFiniteNumber); return { ...sector, change: average(changes), count: changes.length }; }).sort((a, b) => (b.change || 0) - (a.change || 0));
    const hotRows = hot.map((stock) => `<button class="board-stock-row" data-board-symbol="${stock.symbol}"><span class="board-stock-name"><strong>${stock.name}</strong><small>${stock.symbol}</small></span><span class="board-stock-price">${formatNumber(stock.price, stock.price > 1000 ? 0 : 2)}</span><span class="board-stock-change ${stock.change >= 0 ? 'positive' : 'negative'}">${formatPct(stock.change, 2)}${stock.payload?.demo ? ' · DEMO' : ''}</span></button>`).join('');
    const sectorRows = sectors.map((sector) => `<div class="board-sector-row"><span>${sector.name}<small>${sector.count}/${sector.symbols.length} 有效</small></span><strong class="${sector.change >= 0 ? 'positive' : 'negative'}">${formatPct(sector.change, 2)}</strong></div>`).join('');
    return `<article class="board-region-card"><div class="board-region-head"><div><strong>${region.name}</strong><small>${region.english}</small></div><span class="board-index"><small>${region.index.name}</small><strong>${formatNumber(indexPrice, indexPrice > 1000 ? 0 : 2)} <em class="${indexChange >= 0 ? 'positive' : 'negative'}">${formatPct(indexChange, 2)}</em></strong></span></div><div class="board-subhead">热门股 · 代表性高流动性观察池</div><div class="board-stock-list">${hotRows || '<div class="board-empty">暂无有效行情</div>'}</div><div class="board-subhead">分类板块 · 等权日涨跌代理</div><div class="board-sector-list">${sectorRows}</div></article>`;
  }).join('');
  $$('[data-board-symbol]').forEach((button) => button.addEventListener('click', () => setSymbol(button.dataset.boardSymbol)));
  const timestamps = Object.values(state.marketBoardPayloads).filter((payload) => !payload?.demo).map((payload) => payload?.timestamps?.at(-1)).filter(Boolean).sort((a, b) => b - a);
  $('#marketBoardDate').textContent = timestamps.length ? `最近交易日 ${formatDate(timestamps[0], true)}` : '等待更新';
}

async function loadMarketBoard() {
  const symbols = [...new Set(MARKET_REGIONS.flatMap((region) => [region.index.symbol, ...region.stocks.map((stock) => stock.symbol)]))];
  const entries = await Promise.all(symbols.map(async (symbol) => [symbol, await fetchPayload(symbol, '3mo', { silent: true })]));
  entries.forEach(([symbol, payload]) => { state.marketBoardPayloads[symbol] = payload; state.quoteCache[symbol] = payload; if (ALL_BENCHMARKS.some((item) => item.symbol === symbol)) state.benchmarkPayloads[symbol] = payload; });
  renderBenchmarks(); renderChinaIndices(); renderMarketBoard();
}


function setSymbol(symbol) { const normalized = normalizeSymbol(symbol); if (!normalized) return; if (!/^[A-Z0-9.^=_:-]{1,20}$/.test(normalized)) { showToast('请输入合法代码，例如 AAPL、600519 或 0700.HK'); return; } state.symbol = normalized; $('#symbolInput').value = normalized; $$('.market-nav-item, .asset-nav-item, .watch-item, .global-asset-card, [data-index-symbol]').forEach((item) => item.classList.toggle('active', item.dataset.symbol === normalized || item.dataset.globalSymbol === normalized || item.dataset.indexSymbol === normalized)); renderWatchlist(); loadApp(); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 4200); }

loadUserData(); renderWatchlist(); renderPositions();
$('#searchForm').addEventListener('submit', (event) => { event.preventDefault(); setSymbol($('#symbolInput').value); });
$('#addWatchButton').addEventListener('click', () => addWatch($('#watchSymbolInput').value));
$('#watchSymbolInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addWatch(event.target.value); } });
$('#positionForm').addEventListener('submit', addPositionFromForm);
$('#optionForm').addEventListener('submit', (event) => { event.preventDefault(); calculateOptionModel(); });
$('#sentimentRefresh').addEventListener('click', () => loadSentiment(state.symbol, state.currentRequestId, true));
// v2.5: one-click long screenshot of this symbol's daily analysis (snapshot.js)
$('#snapshotButton').addEventListener('click', (event) => {
  const equity = isEquitySymbol(state.symbol);
  QSSnapshot.capture({
    symbol: state.symbol, equity, toast: showToast, button: event.currentTarget,
    isBusy: () => [
      state.loading && '行情与模型',
      equity && state.fundamentals?.pending && '财报与估值',
      $('#sentimentStatus')?.textContent === '读取中' && '新闻情绪',
    ].filter(Boolean),
  });
});
$$('[data-symbol]').forEach((button) => button.addEventListener('click', () => setSymbol(button.dataset.symbol)));
$$('[data-range]').forEach((button) => button.addEventListener('click', () => { state.range = button.dataset.range; $$('[data-range]').forEach((item) => item.classList.toggle('active', item === button)); if (state.current) renderCurrent(); else loadApp(); }));
bindValuationControls();
$('#refreshButton').addEventListener('click', () => loadApp());
loadMarketBoard();
if (window.QSMarket) QSMarket.init();
loadApp();
