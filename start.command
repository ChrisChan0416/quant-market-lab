#!/bin/zsh
set -e

cd "$(dirname "$0")"
PORT=5173
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done
export QUANTSCOPE_PORT="$PORT"
python3 server.py &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
URL="http://127.0.0.1:${PORT}/?v=$(date +%s)"
if ! open "$URL"; then
  echo "浏览器未能自动打开，请手动访问 $URL"
fi
wait "$SERVER_PID"
