#!/bin/zsh
# 双击运行：测试 SoCLaaS 连接，并列出可用模型。结果同时写入 soclaas_check.log
cd "$(dirname "$0")"
{
  echo "=== $(date) ==="
  echo "--- python: $(python3 --version 2>&1)"
  set -a; source ./soclaas.env; set +a
  echo "--- GET /models"
  curl -sS -m 20 -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $SOCLAAS_API_KEY" "$SOCLAAS_BASE_URL/models"
  echo "--- news_sentiment.py --check"
  python3 news_sentiment.py --check
  echo "--- 新闻抓取测试 (AAPL)"
  python3 -c "import news_sentiment as ns; items,name,err=ns.fetch_news('AAPL'); print(name, len(items), err); [print(' ', i['feed'], i['source'], '|', i['title'][:70]) for i in items[:4]]"
  echo "--- 端到端：抓新闻 + x-test-1 打分 (AAPL, NVDA, 0700.HK)"
  python3 news_sentiment.py AAPL NVDA 0700.HK
  echo "--- 打分样例"
  python3 -c "
import sqlite3; con=sqlite3.connect('data/sentiment.sqlite')
for r in con.execute('select symbol, model, round(sentiment,2), round(relevance,2), event, reason, substr(title,1,60) from scores order by created desc limit 8'): print(' ', r)
"
  echo "=== done ==="
} 2>&1 | tee soclaas_check.log
echo
echo "检测完成，可以关闭这个窗口。"
