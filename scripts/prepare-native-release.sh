#!/usr/bin/env bash
# Refresh dist/ with Capacitor-relative asset paths and copy into native projects.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build:cap
npx cap sync ios
npx cap sync android

echo ""
echo "Native projects updated. Next (after store access):"
echo "  iOS:     npm run cap:open:ios   → Archive in Xcode, upload to App Store Connect"
echo "  Android: npm run cap:open:android → Build signed AAB in Android Studio"
echo "See docs/store-release.md for listings, privacy labels, and review notes."
