#!/usr/bin/env bash
# Usage: ./check_endpoints.sh [base_url]   (default https://optimus.jmistry.com)
# Read-only by default. Pass WRITE=1 to also test POST/PATCH (creates a test transfer + telemetry reading).
# In production the write checks need the server's secrets:
#   WRITE=1 TELEMETRY_API_KEY=... ADMIN_TOKEN=... ./check_endpoints.sh
B=${1:-https://optimus.jmistry.com}
pass=0; fail=0
AUTH=(-H "X-API-Key: ${TELEMETRY_API_KEY:-}" -H "X-Admin-Token: ${ADMIN_TOKEN:-}")
check() { # method path [json-body]
  local m=$1 p=$2 body=$3 code
  if [ -n "$body" ]; then
    code=$(curl -s -o /tmp/ce_out -w '%{http_code}' -X "$m" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$body" --max-time 60 "$B$p")
  else
    code=$(curl -s -o /tmp/ce_out -w '%{http_code}' -X "$m" "${AUTH[@]}" --max-time 60 "$B$p")
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
check GET /api/demo/access
check GET /api/simulation/status
echo "Security headers:"
for h in content-security-policy strict-transport-security x-content-type-options x-frame-options referrer-policy; do
  for p in / /api/health; do
    if curl -s -I "$B$p" | grep -qi "^$h:"; then pass=$((pass+1)); printf '  OK   %-26s %s\n' "$h" "$p"
    else fail=$((fail+1)); printf '  FAIL %-26s %s (missing)\n' "$h" "$p"; fi
  done
done
if curl -s -I "$B/" | grep -qi '^x-powered-by:'; then fail=$((fail+1)); echo "  FAIL x-powered-by header present"; else pass=$((pass+1)); echo "  OK   no x-powered-by header"; fi
echo "Write protection:"
# Never probe an unprotected server: on a dev box with no ADMIN_TOKEN this
# would really wipe the database. Probe with a bogus token only when the
# server says protection is on.
MODE=$(curl -s "$B/api/demo/access" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("reset",""))' 2>/dev/null)
if [ "$MODE" = "token" ] || [ "$MODE" = "disabled" ]; then
  for p in /api/demo/regenerate /api/transfers/generate-recommendations; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Admin-Token: invalid-check-token' -d '{}' "$B$p")
    if [[ $code == 401 || $code == 403 ]]; then pass=$((pass+1)); printf '  OK   POST %-44s %s (rejected)\n' "$p" "$code"
    else fail=$((fail+1)); printf '  FAIL POST %-44s %s (expected 401/403)\n' "$p" "$code"; fi
  done
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-API-Key: invalid-check-key' -d '{"store_id":1,"sensor":"cooler_temp_c","value":3}' "$B/api/telemetry")
  if [[ $code == 401 || $code == 403 ]]; then pass=$((pass+1)); printf '  OK   POST %-44s %s (rejected)\n' /api/telemetry "$code"
  else fail=$((fail+1)); printf '  FAIL POST %-44s %s (expected 401/403)\n' /api/telemetry "$code"; fi
else
  echo "  SKIP server reports reset mode '${MODE:-unknown}' (development); nothing to probe"
fi
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
  # Start and immediately end a harmless sensor scenario (undone on end)
  check POST /api/simulation/scenarios "{\"kind\":\"cooler_failure\",\"store_id\":$STORE}"
  SID=$(python3 -c 'import json; print(json.load(open("/tmp/ce_out")).get("id",""))' 2>/dev/null)
  [ -n "$SID" ] && check POST "/api/simulation/scenarios/$SID/end"
fi
echo "Result: $pass passed, $fail failed"
[ $fail -eq 0 ]
