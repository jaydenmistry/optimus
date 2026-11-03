#!/usr/bin/env bash
# Usage: ./check_endpoints.sh [base_url]   (default https://optimus.jmistry.com)
# Read-only by default. Pass WRITE=1 to also test POST/PATCH (creates a test transfer + telemetry reading).
B=${1:-https://optimus.jmistry.com}
pass=0; fail=0
check() { # method path [json-body]
  local m=$1 p=$2 body=$3 code
  if [ -n "$body" ]; then
    code=$(curl -s -o /tmp/ce_out -w '%{http_code}' -X "$m" -H 'Content-Type: application/json' -d "$body" --max-time 60 "$B$p")
  else
    code=$(curl -s -o /tmp/ce_out -w '%{http_code}' -X "$m" --max-time 60 "$B$p")
  fi
  if [[ $code == 2* ]]; then pass=$((pass+1)); printf '  OK   %s %-50s %s\n' "$m" "$p" "$code"
  else fail=$((fail+1)); printf '  FAIL %s %-50s %s  %s\n' "$m" "$p" "$code" "$(head -c 150 /tmp/ce_out)"; fi
}
SKU=$(curl -s "$B/api/overview?limit=1" | python3 -c 'import json,sys; i=json.load(sys.stdin)["items"][0]; print(i["store_id"], i["sku_id"])' 2>/dev/null)
read STORE SKU_ID <<<"${SKU:-1 1}"
echo "Testing $B (sample store=$STORE sku=$SKU_ID)"
echo "Frontend pages:"
for p in / /transfers /peak-hours /admin "/sku/$STORE/$SKU_ID"; do check GET "$p"; done
echo "API docs:"
check GET /docs; check GET /openapi.json
echo "API (read):"
check GET /api/health
check GET /api/stores
check GET /api/overview
check GET "/api/overview?store_id=$STORE&risk_only=true&limit=10"
check GET /api/alerts
check GET "/api/sku/$STORE/$SKU_ID"
check GET "/api/sku/$STORE/$SKU_ID/hourly"
check GET /api/transfers/recommendations
check GET /api/transfers
check GET /api/demo/stats
check GET /api/demo/preview
check GET "/api/peak-hours/$STORE"
check GET "/api/prep-schedule/$STORE"
check GET "/api/telemetry/$STORE"
check GET "/api/telemetry/$STORE/latest"
echo "CORS:"
if curl -s -I -H "Origin: $B" "$B/api/health" | grep -qi "access-control-allow-origin: $B"; then pass=$((pass+1)); echo "  OK   allow-origin $B"; else fail=$((fail+1)); echo "  FAIL allow-origin header missing for $B"; fi
if [ "$WRITE" = 1 ]; then
  echo "API (write):"
  check POST /api/telemetry "{\"store_id\":$STORE,\"sensor\":\"cooler_temp\",\"value\":3.5,\"unit\":\"C\",\"metadata\":\"endpoint-check\"}"
  check POST /api/transfers/generate-recommendations
  OTHER=$(( STORE == 1 ? 2 : 1 ))
  check POST /api/transfers/draft "{\"from_store_id\":$OTHER,\"to_store_id\":$STORE,\"sku_id\":$SKU_ID,\"qty\":1}"
  TID=$(python3 -c 'import json; print(json.load(open("/tmp/ce_out")).get("id",""))' 2>/dev/null)
  [ -n "$TID" ] && check PATCH "/api/transfers/$TID" '{"status":"cancelled"}'
fi
echo "Result: $pass passed, $fail failed"
[ $fail -eq 0 ]
