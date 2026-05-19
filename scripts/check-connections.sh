#!/usr/bin/env bash
# Verify production API + optional local Vite env keys (names only, no values printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${1:-https://vedais.ai}"
LOCAL_ENV="${ROOT}/.env.local"
MISSING_LOCAL=0

echo "=== Vedais connection check ==="
echo "Production: $BASE_URL"
echo ""

bash scripts/smoke-test.sh "$BASE_URL"

echo ""
echo "=== Local Vite env (.env.local) ==="
if [ ! -f "$LOCAL_ENV" ]; then
  echo "SKIP  No .env.local — copy .env.example and fill keys for local dev."
else
  required_local=(
    VITE_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY
  )
  optional_local=(
    VITE_PUBLIC_SITE_URL
    VITE_PUBLIC_SUPPORT_EMAIL
    VITE_SENTRY_DSN
    VITE_POSTHOG_KEY
    VITE_REVENUECAT_APPLE_KEY
    VITE_REVENUECAT_GOOGLE_KEY
  )
  for key in "${required_local[@]}"; do
    if grep -qE "^${key}=.+$" "$LOCAL_ENV" 2>/dev/null; then
      echo "PASS  $key is set"
    else
      echo "WARN  $key missing or empty in .env.local"
      MISSING_LOCAL=$((MISSING_LOCAL + 1))
    fi
  done
  for key in "${optional_local[@]}"; do
    if grep -qE "^${key}=.+$" "$LOCAL_ENV" 2>/dev/null; then
      echo "OK    $key is set"
    else
      echo "—     $key not set (optional)"
    fi
  done
fi

echo ""
if [ "$MISSING_LOCAL" -gt 0 ]; then
  echo "Local dev: fix .env.local before expecting auth/sync in npm run dev."
fi
echo "Native builds: set the same VITE_* keys when running npm run build:cap."
echo "Done."
