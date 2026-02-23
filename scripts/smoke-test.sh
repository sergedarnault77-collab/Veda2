#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://veda2.vercel.app}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expected_status="$3" body_match="$4"
  shift 4

  local resp status body
  resp=$(curl -s -w "\n%{http_code}" "$@" "$url")
  status=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  if [ "$status" != "$expected_status" ]; then
    echo "FAIL  $name — expected HTTP $expected_status, got $status"
    echo "      body: ${body:0:200}"
    FAIL=$((FAIL + 1))
    return
  fi

  ct=$(curl -s -o /dev/null -w "%{content_type}" "$@" "$url")
  if [[ ! "$ct" =~ application/json ]]; then
    echo "FAIL  $name — content-type is '$ct', expected application/json"
    FAIL=$((FAIL + 1))
    return
  fi

  if [ -n "$body_match" ] && ! echo "$body" | grep -q "$body_match"; then
    echo "FAIL  $name — body missing '$body_match'"
    echo "      body: ${body:0:200}"
    FAIL=$((FAIL + 1))
    return
  fi

  echo "PASS  $name — HTTP $status"
  PASS=$((PASS + 1))
}

echo "=== Veda Smoke Tests ==="
echo "Target: $BASE_URL"
echo ""

check "health" \
  "$BASE_URL/api/health" \
  "200" '"ok":true'

check "analyze (smoke)" \
  "$BASE_URL/api/analyze" \
  "200" '"ok":true' \
  -H "content-type: application/json" \
  -d '{"source":"smoke","locale":"en","imageBase64":"TEST"}'

check "ask-scan (no question)" \
  "$BASE_URL/api/ask-scan" \
  "400" '"ok":false' \
  -X POST -H "content-type: application/json" \
  -d '{}'

check "schedule (empty)" \
  "$BASE_URL/api/schedule" \
  "200" '"ok":true' \
  -X POST -H "content-type: application/json" \
  -d '{"supplements":[],"medications":[]}'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
