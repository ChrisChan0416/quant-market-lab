const V = require('../valuation.js'); const A = require('../analytics.js'); const { AAPL, TCEHY, JPM } = require('./fixtures.js');
const assert = require('assert');
function show(name, F, ctx={}) {
  const r = V.runValuation(F, { price: F.price, ...ctx });
  const m = r.models; const f = (x)=> x==null? 'n/a' : (typeof x==='number'? x.toFixed(3): x);
  console.log(`\n== ${name}  price ${F.price} ${F.currency}`);
  console.log(' assumptions', Object.fromEntries(['rf','erp','crp','beta','g1','gT','taxRate','costOfDebt'].map(k=>[k,f(r.assumptions[k])])));
  console.log(' rates re',f(r.rates.re),'wacc',f(r.rates.wacc),'wE',f(r.rates.wE));
  console.log(' base roic',f(r.base.roic),'roe',f(r.base.roe),'payout',f(r.base.payout),'shares',(r.base.shares/1e9).toFixed(2)+'B', 'fx', r.base.fx, 'dps', f(r.base.dps));
  for (const k of ['dcf','ri','ddm','history','peers']) console.log(` ${k.padEnd(8)}`, m[k].applicable? `value ${f(m[k].value)} low ${f(m[k].low)} high ${f(m[k].high)}` : `N/A: ${m[k].reason}`);
  if (m.dcf.applicable) console.log('  dcf mode',m.dcf.mode,'tvShare',f(m.dcf.tvShare),'roic0',f(m.dcf.roic0),'ronic',f(m.dcf.ronic),'c0',f(m.dcf.c0),'cT',f(m.dcf.cT),'fcff1',(m.dcf.firstYearFcff/1e9).toFixed(1),'actualFcf',(m.dcf.actualFcf/1e9).toFixed(1),'exit EV/EBITDA',f(m.dcf.impliedExitEvEbitda));
  console.log(' reverse', r.reverse && f(r.reverse.impliedG1), r.reverse?.note||'');
  console.log(' MC', r.monteCarlo && {p10:f(r.monteCarlo.p10),p50:f(r.monteCarlo.p50),p90:f(r.monteCarlo.p90),prob:f(r.monteCarlo.probAbovePrice)});
  console.log(' composite', r.composite && {fair:f(r.composite.fair),low:f(r.composite.low),high:f(r.composite.high),up:f(r.composite.upside),disp:f(r.composite.dispersion),factor:f(r.composite.factor)});
  console.log(' piotroski', r.quality.piotroski && `${r.quality.piotroski.score}/${r.quality.piotroski.available}`, 'altman', r.quality.altman && f(r.quality.altman.z)+r.quality.altman.zoneLabel, 'qfactor', f(r.quality.factor));
  if (r.sensitivity) console.log(' sens row0', r.sensitivity.grid[2].map(f).join(' '));
  return r;
}
const r1 = show('AAPL', AAPL, { liveRf:{USD:0.0473}, regressionBeta: 1.15, priceHistory: { ts: [Date.parse('2021-01-01')/1000, Date.parse('2022-09-29')/1000, Date.parse('2023-09-29')/1000, Date.parse('2024-09-27')/1000, Date.parse('2025-09-29')/1000], closes:[130,142,171,227,254] } });
// independent check of DCF arithmetic (conversion-anchored three-stage model)
{ const b=r1.base,a=r1.assumptions,d=r1.models.dcf,w=d.wacc; let lvl=b.nopat, pv=0;
  for(let t=1;t<=10;t++){const g=t<=5?a.g1:a.g1+(a.gT-a.g1)*(t-5)/5; lvl*=1+g; const c=t<=5?d.c0:d.c0+(d.cT-d.c0)*(t-5)/5; pv+=lvl*c/Math.pow(1+w,t-0.5);}
  const tv=lvl*(1+a.gT)*(1-a.gT/d.ronic)/(w-a.gT)/Math.pow(1+w,9.5); const eq=pv+tv-b.debt+b.cash-b.minority;
  assert(Math.abs(eq/b.shares - d.value) < 1e-6, 'dcf mismatch'); console.log('  ✓ DCF hand-check', (eq/b.shares).toFixed(3)); }
// reverse DCF consistency: plugging implied g gives the price
if (r1.reverse?.impliedG1!=null){ const v=V.dcf(r1.base,{...r1.assumptions,g1:r1.reverse.impliedG1}).value; assert(Math.abs(v-255)<0.01); console.log('  ✓ reverse DCF reprices to', v.toFixed(3)); }
// Gordon sanity: DDM with g1=gT equals D1/(r-g)
{ const b={...r1.base, dps:1, totalPayoutPerShare:1, fx:1, sustainableG:0.03}; const a={...r1.assumptions, g1:0.03, gT:0.03}; const re=V.discountRates(b,a).re; const v=V.ddm(b,a).value; assert(Math.abs(v - 1.03/(re-0.03))<1e-9, 'gordon '+v); console.log('  ✓ DDM collapses to Gordon', v.toFixed(4)); }
// RI with ROE == re and constant gives value == book
{ const b={...r1.base}; const a={...r1.assumptions}; const re=V.discountRates(b,a).re; const v=V.residualIncome({...b, roe:re},{...a, roeLongRun:re}).value; assert(Math.abs(v - b.equityBV/b.shares) < 1e-6); console.log('  ✓ RI = book when ROE = cost of equity'); }
const r2 = show('Tencent (CNY→HKD)', TCEHY, { regressionBeta: 0.8, peers:[{stats:{forwardPE:18, trailingPE:22, evToEbitda:15, priceToSales:5, priceToBook:3.5}},{stats:{forwardPE:24, trailingPE:28, evToEbitda:20, priceToSales:8, priceToBook:5}},{stats:{forwardPE:15, trailingPE:17, evToEbitda:11, priceToSales:3, priceToBook:2.5}}] });
const r3 = show('JPM (bank)', JPM, { regressionBeta: 1.05 });
const mock = V.mockFundamentals('DEMO', 100); show('mock', mock, {});
