# Veda — App Store & Google Play release

Use this after you have developer accounts. Nothing here replaces legal review; adjust copy if your data practices differ.

## Commands

| Command | Purpose |
|--------|---------|
| `npm run check:connections` | Smoke-test production API + check `.env.local` keys |
| `npm run release:prepare` | `build:cap` + `cap sync` for iOS and Android |
| `npm run cap:open:ios` | Open Xcode |
| `npm run cap:open:android` | Open Android Studio |

Always run `release:prepare` before archiving so `public/` / `assets/` match the web bundle.

## Environment (Vite — inlined at build time)

Set in the env file you use for **production native builds** (and Vercel for web):

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_REVENUECAT_APPLE_KEY` | For iOS IAP | RevenueCat public SDK key |
| `VITE_REVENUECAT_GOOGLE_KEY` | For Android IAP | RevenueCat public SDK key |
| `VITE_PUBLIC_SITE_URL` | Recommended | Production origin for store URLs, e.g. `https://app.example.com` (no trailing slash). Enables “public link” lines on Privacy & Terms. |
| `VITE_PUBLIC_SUPPORT_EMAIL` | Optional | Shown on the native plan screen (e.g. `support@veda.health`). |

Other existing `VITE_*` secrets (Supabase, API, Sentry, PostHog, etc.) must be present in the same build you ship.

## Apple App Store Connect

1. **App record** — Bundle ID `com.veda.health` (must match Xcode).
2. **Privacy Policy URL** — Use your deployed app URL + `#privacy`, or a dedicated page matching in-app policy.
3. **Terms / EULA** — URL + `#terms` or dedicated page.
4. **App Privacy (nutrition labels)** — Draft answers using the sections below; paste into Connect.
5. **Subscriptions** — Create subscription group + products; match product IDs in RevenueCat and in-app configuration.
6. **Export compliance** — `ITSAppUsesNonExemptEncryption` is `false` in `Info.plist` (standard HTTPS only). Change if you ship custom crypto.
7. **Review notes** (template):

```
Test account (if required): [email] / [password] or "Sign in with Apple test user: …"

Flows to review:
- Register or log in → complete optional profile → choose plan.
- Free plan: add a supplement, open Home.
- Paid plan: subscribe (Sandbox), confirm AI features unlock; use "Restore purchases" on plan screen.
- Scan: Home → scan flow → capture or choose photo (camera permission on device).
- Privacy / Terms: Plan screen links and in-app #privacy / #terms.

Notes:
- Health content is informational only (see Terms).
- [Any backend/feature flags reviewers should know]
```

## Google Play Console

1. **App** — Package name must match `applicationId` in Android Gradle (aligned with Capacitor `appId`).
2. **Data safety form** — Use the draft below; reconcile with your real PostHog/Sentry/Supabase usage.
3. **Privacy policy URL** — Same as Apple.
4. **Subscriptions** — Base plans linked to Play billing; mirror in RevenueCat.

### Data safety (draft — verify before submit)

Declare based on actual SDK behavior:

- **Account data** (name, email, country, city): collected, tied to account, required for account, encrypted in transit; used for app function, optional analytics if applicable.
- **Health / fitness** (supplements, medications, scans): collected if user enters or scans; tied to account when logged in; used for app function; describe encryption and deletion (see Privacy Policy).
- **Photos** (label scan): processed for analysis; state whether retained (Veda policy: not stored on servers after processing — confirm implementation).
- **Purchase history**: via Google Play / RevenueCat; used for entitlements.
- **Crash / diagnostics** (if Sentry): error logs, device info; not sold.
- **Analytics** (if PostHog): product interaction as configured in `analytics.ts`.

## RevenueCat

- Create iOS and Android apps; attach App Store Connect / Play products when IDs exist.
- Entitlement identifiers must match what `purchases.ts` expects for “active subscription” checks.

## In-app requirements (already in project)

- **Restore purchases** on plan screen (native).
- **Manage subscription** opens Apple / Google subscription management (in-app browser via `@capacitor/browser`).
- **Privacy & Terms** on plan screen + in-app routes `#privacy` / `#terms`.
- **Register / Log in** screens include consent copy with links to Privacy and Terms (before submit).
- **iOS** — Camera / photo usage strings in `Info.plist` for label scanning.
- **Android** — `CAMERA` permission in `AndroidManifest.xml` (optional hardware).

## Versioning

- Bump `version` in `package.json` before store releases; run `release:prepare` and confirm Xcode / Android Studio show the expected marketing version and build number.
