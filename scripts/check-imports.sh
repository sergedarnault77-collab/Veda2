#!/usr/bin/env bash
set -euo pipefail

HEAVY_PATTERNS=(
  'from "@supabase/supabase-js"'
  'from "@neondatabase/serverless"'
  'from "openai"'
  "from 'openai'"
  'from "pg"'
  "from 'pg'"
)

EDGE_PATTERNS=(
  '(req: Request)'
  'NextRequest'
  'NextResponse'
)

FAIL=0

for pattern in "${HEAVY_PATTERNS[@]}"; do
  matches=$(grep -rn "$pattern" api/ --include="*.ts" \
    | grep -v "node_modules" \
    | grep -v "await import(" \
    | grep -v "import type " \
    | grep -v "^[^:]*:[^:]*:.*//.*$pattern" \
    | grep "^[^:]*:[0-9]*:import " || true)

  if [ -n "$matches" ]; then
    echo "ERROR: Top-level heavy SDK import found:"
    echo "$matches"
    echo ""
    FAIL=$((FAIL + 1))
  fi
done

for pattern in "${EDGE_PATTERNS[@]}"; do
  matches=$(grep -rn "$pattern" api/ --include="*.ts" \
    | grep -v "node_modules" \
    | grep -v "api/lib/" \
    | grep -v "api/_lib/" \
    | grep -v "import type" || true)

  if [ -n "$matches" ]; then
    echo "WARNING: Edge-style pattern '$pattern' found in handler files:"
    echo "$matches"
    echo ""
  fi
done

if [ "$FAIL" -gt 0 ]; then
  echo "FAILED: $FAIL top-level heavy SDK import(s) detected."
  echo "Use lazy import: const { X } = await import(\"...\") inside the handler."
  exit 1
fi

echo "PASS: No top-level heavy SDK imports found."
