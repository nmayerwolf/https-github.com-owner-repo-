#!/bin/bash
set -euo pipefail

BASE=${1:-http://localhost:3001}

echo "=== Horsai Market Data Smoke Test ==="
echo "Target: $BASE"
echo ""

echo "1) Health"
curl -s "$BASE/api/health" | jq .
echo ""

echo "2) Market data health"
curl -s "$BASE/api/health/market-data" | jq .
echo ""

echo "3) Quote AAPL"
curl -s "$BASE/api/market/quote?symbol=AAPL" | jq .
echo ""

echo "4) Quote EUR_USD"
curl -s "$BASE/api/market/quote?symbol=EUR_USD" | jq .
echo ""

echo "5) Quote BTCUSDT"
curl -s "$BASE/api/market/quote?symbol=BTCUSDT" | jq .
echo ""

echo "6) Search apple"
curl -s "$BASE/api/market/search?q=apple" | jq '.items[:5]'
echo ""

echo "7) Snapshot"
curl -s "$BASE/api/market/snapshot?symbols=AAPL,BTCUSDT,EUR_USD" | jq '.items[] | {symbol, price: .quote.c, dp: .quote.dp, unavailable: .marketMeta.unavailable}'
echo ""

echo "=== Done ==="
