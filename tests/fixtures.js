// Hand-built fundamentals fixtures in the same shape /api/fundamentals returns.
// Numbers are rounded, illustrative values for testing the math only.
function yrs(rows){return rows.map(r=>({...r}));}
const AAPL = { symbol:'AAPL', currency:'USD', financialCurrency:'USD', fxToPrice:1, price:255, marketCap:255*14.8e9,
  profile:{name:'Apple Inc.', sector:'Technology', industry:'Consumer Electronics', country:'United States'},
  stats:{trailingPE:34, forwardPE:30, priceToBook:51, priceToSales:9.1, evToEbitda:26, enterpriseValue:255*14.8e9+44e9, beta:1.1, dividendRate:1.04, payoutRatio:0.14},
  financial:{}, analyst:{epsGrowthLongTerm:0.10, targetMean:270, targetLow:200, targetHigh:320, count:40, recommendationKey:'buy'},
  annual: yrs([
   {date:'2022-09-30',revenue:394.3e9,grossProfit:170.8e9,ebit:119.4e9,operatingIncome:119.4e9,ebitda:130.5e9,netIncome:99.8e9,pretaxIncome:119.1e9,taxProvision:19.3e9,interestExpense:2.9e9,dilutedEps:6.11,operatingCashFlow:122.2e9,capex:-10.7e9,freeCashFlow:111.4e9,dividendsPaid:-14.8e9,buyback:-89.4e9,totalAssets:352.8e9,currentAssets:135.4e9,currentLiabilities:153.98e9,totalLiabilities:302.1e9,totalDebt:132.5e9,longTermDebt:98.96e9,cash:48.3e9,equity:50.7e9,retainedEarnings:-3.1e9,sharesOutstanding:15.94e9},
   {date:'2023-09-30',revenue:383.3e9,grossProfit:169.1e9,ebit:114.3e9,operatingIncome:114.3e9,ebitda:125.8e9,netIncome:97.0e9,pretaxIncome:113.7e9,taxProvision:16.7e9,interestExpense:3.9e9,dilutedEps:6.13,operatingCashFlow:110.5e9,capex:-11.0e9,freeCashFlow:99.6e9,dividendsPaid:-15.0e9,buyback:-77.6e9,totalAssets:352.6e9,currentAssets:143.6e9,currentLiabilities:145.3e9,totalLiabilities:290.4e9,totalDebt:123.9e9,longTermDebt:95.3e9,cash:61.6e9,equity:62.1e9,retainedEarnings:-0.2e9,sharesOutstanding:15.55e9},
   {date:'2024-09-30',revenue:391.0e9,grossProfit:180.7e9,ebit:123.2e9,operatingIncome:123.2e9,ebitda:134.7e9,netIncome:93.7e9,pretaxIncome:123.5e9,taxProvision:29.7e9,interestExpense:0,dilutedEps:6.08,operatingCashFlow:118.3e9,capex:-9.4e9,freeCashFlow:108.8e9,dividendsPaid:-15.2e9,buyback:-94.9e9,totalAssets:365.0e9,currentAssets:152.99e9,currentLiabilities:176.4e9,totalLiabilities:308.0e9,totalDebt:106.6e9,longTermDebt:85.75e9,cash:65.2e9,equity:56.95e9,retainedEarnings:-19.15e9,sharesOutstanding:15.12e9},
   {date:'2025-09-30',revenue:416.2e9,grossProfit:195.2e9,ebit:133.1e9,operatingIncome:133.1e9,ebitda:144.7e9,netIncome:112.0e9,pretaxIncome:132.7e9,taxProvision:20.7e9,interestExpense:0,dilutedEps:7.46,operatingCashFlow:111.5e9,capex:-12.7e9,freeCashFlow:98.8e9,dividendsPaid:-15.4e9,buyback:-90.7e9,totalAssets:359.2e9,currentAssets:147.96e9,currentLiabilities:165.6e9,totalLiabilities:285.5e9,totalDebt:98.7e9,longTermDebt:78.3e9,cash:54.7e9,equity:73.7e9,retainedEarnings:-14.3e9,sharesOutstanding:14.78e9},
  ]), ttm:{}, latestBalance:{}, sources:{}};
AAPL.latestBalance = AAPL.annual.at(-1);

// Tencent-like: CNY financials, HKD quote
const TCEHY = { symbol:'0700.HK', currency:'HKD', financialCurrency:'CNY', fxToPrice:1.093, price:640, marketCap:640*9.15e9,
  profile:{name:'Tencent Holdings', sector:'Communication Services', industry:'Internet Content & Information', country:'China'},
  stats:{trailingPE:25, forwardPE:21, priceToBook:4.8, priceToSales:7.6, evToEbitda:18, enterpriseValue:640*9.15e9*1.0, beta:0.7, dividendRate:4.5, payoutRatio:0.2},
  financial:{}, analyst:{epsGrowthNextYear:0.12, targetMean:720, targetLow:560, targetHigh:850, count:50},
  annual: yrs([
   {date:'2022-12-31',revenue:554.6e9,grossProfit:238.7e9,ebit:150e9,operatingIncome:150e9,netIncome:188.2e9,pretaxIncome:210e9,taxProvision:21.5e9,interestExpense:9.4e9,dilutedEps:19.6,operatingCashFlow:146.1e9,capex:-50e9,freeCashFlow:96e9,dividendsPaid:-12.9e9,totalAssets:1578e9,currentAssets:470e9,currentLiabilities:446e9,totalLiabilities:656e9,totalDebt:357e9,longTermDebt:300e9,cash:330e9,equity:721e9,retainedEarnings:600e9,sharesOutstanding:9.56e9},
   {date:'2023-12-31',revenue:609.0e9,grossProfit:293.1e9,ebit:191e9,operatingIncome:191e9,netIncome:115.2e9,pretaxIncome:161e9,taxProvision:43.3e9,interestExpense:12.3e9,dilutedEps:11.9,operatingCashFlow:221.9e9,capex:-24e9,freeCashFlow:168e9,dividendsPaid:-23.5e9,totalAssets:1577e9,currentAssets:480e9,currentLiabilities:470e9,totalLiabilities:668e9,totalDebt:360e9,longTermDebt:290e9,cash:400e9,equity:808e9,retainedEarnings:660e9,sharesOutstanding:9.47e9},
   {date:'2024-12-31',revenue:660.3e9,grossProfit:349.2e9,ebit:208e9,operatingIncome:208e9,netIncome:194.1e9,pretaxIncome:241e9,taxProvision:45e9,interestExpense:12e9,dilutedEps:20.0,operatingCashFlow:258.5e9,capex:-76.8e9,freeCashFlow:181.7e9,dividendsPaid:-30e9,buyback:-112e9,totalAssets:1781e9,currentAssets:540e9,currentLiabilities:520e9,totalLiabilities:730e9,totalDebt:370e9,longTermDebt:300e9,cash:450e9,equity:974e9,retainedEarnings:780e9,sharesOutstanding:9.2e9},
  ]), ttm:{revenue:720e9, ebit:240e9, netIncome:215e9, operatingCashFlow:280e9, capex:-90e9, freeCashFlow:190e9, interestExpense:12e9}, latestBalance:{totalDebt:380e9, cash:470e9, equity:1050e9, minorityInterest:80e9, totalAssets:1850e9}, sources:{}};

// Bank: JPM-like
const JPM = { symbol:'JPM', currency:'USD', financialCurrency:'USD', fxToPrice:1, price:300, marketCap:300*2.75e9,
  profile:{name:'JPMorgan Chase', sector:'Financial Services', industry:'Banks - Diversified', country:'United States'},
  stats:{trailingPE:15, forwardPE:14.5, priceToBook:2.4, priceToSales:4.5, beta:1.05, dividendRate:5.6, payoutRatio:0.28, enterpriseValue:null},
  financial:{}, analyst:{epsGrowthLongTerm:0.05, targetMean:320, targetLow:260, targetHigh:360, count:24},
  annual: yrs([
   {date:'2022-12-31',revenue:128.7e9,netIncome:37.7e9,pretaxIncome:46.2e9,taxProvision:8.5e9,dilutedEps:12.09,operatingCashFlow:107e9,totalAssets:3666e9,totalLiabilities:3373e9,totalDebt:695e9,longTermDebt:296e9,cash:567e9,equity:292e9,retainedEarnings:296e9,sharesOutstanding:2.93e9,dividendsPaid:-13.6e9},
   {date:'2023-12-31',revenue:154.9e9,netIncome:49.6e9,pretaxIncome:61.6e9,taxProvision:12.1e9,dilutedEps:16.23,operatingCashFlow:13e9,totalAssets:3875e9,totalLiabilities:3547e9,totalDebt:700e9,longTermDebt:391e9,cash:624e9,equity:328e9,retainedEarnings:332e9,sharesOutstanding:2.88e9,dividendsPaid:-13.5e9},
   {date:'2024-12-31',revenue:169.4e9,netIncome:58.5e9,pretaxIncome:72.0e9,taxProvision:13.4e9,dilutedEps:19.75,operatingCashFlow:-42e9,totalAssets:4003e9,totalLiabilities:3658e9,totalDebt:720e9,longTermDebt:410e9,cash:469e9,equity:345e9,retainedEarnings:376e9,sharesOutstanding:2.80e9,dividendsPaid:-14.8e9,buyback:-18e9},
  ]), ttm:{netIncome:57e9, revenue:175e9}, latestBalance:{equity:360e9, totalDebt:740e9, cash:500e9}, sources:{}};
module.exports = { AAPL, TCEHY, JPM };
