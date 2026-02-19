# Pre-Store Smoke Checklist (5 minutes)

Quick manual checklist before uploading to TestFlight (iOS) or generating an AAB (Android).

## 1. Build & sync (≈2 min)

```bash
# iOS
npm run cap:sync:ios
npm run cap:open:ios        # opens Xcode

# Android
npm run cap:sync:android
npm run cap:open:android    # opens Android Studio
```

## 2. Smoke on device/simulator (≈3 min)

Run the app on a physical device or simulator and verify:

- [ ] **App launches** — splash screen appears, then the home screen loads (no white/blank screen)
- [ ] **Navigation** — tap all four tabs (Scan, Dashboard, Supps, Meds); each loads without crash
- [ ] **Scan flow** — tap "Scan label", grant camera permission when prompted, capture a photo; app does not crash (recognition requires network)
- [ ] **Ask a question** — tap "Have a question?", type a question, tap send; loading spinner appears (answer requires network)
- [ ] **No unwanted permission prompts** — camera permission is only asked when the user initiates a scan, never on launch or tab switch
- [ ] **Light & dark mode** — toggle theme via Account menu; both themes render correctly
- [ ] **Offline resilience** — enable airplane mode; app should still load the home screen (from cache/bundle) and show graceful errors for network features

## 3. Version & metadata

- [ ] `capacitor.config.ts` → `appId` matches your store listing (`com.veda.health`)
- [ ] Xcode: bump **Version** and **Build** numbers under General → Identity
- [ ] Android Studio: bump `versionCode` and `versionName` in `android/app/build.gradle`

## 4. Submit

- **iOS**: Xcode → Product → Archive → Distribute App → App Store Connect
- **Android**: Android Studio → Build → Generate Signed Bundle (AAB) → upload to Google Play Console
