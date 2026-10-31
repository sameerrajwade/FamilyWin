# Lootboard — Phase 0 (Ship Blockers) — TRUE status

> Reconciles `docs/LAUNCH_ROADMAP.md` Phase 0 with what's actually in the code as
> of 2026-08-26. The roadmap was written before several items were built. Use THIS
> as the launch checklist.

## ✅ Already DONE (verified in code)
- **0.6 Locked Firestore + Storage rules + rules tests** — `firebase/firestore.rules`,
  `firebase/storage.rules`, `__tests__/rules/firestore.rules.test.js` (35 tests).
- **0.7 Crash reporting + ErrorBoundary** — `_layout.tsx` has an ErrorBoundary that
  calls `crashlytics().recordError`; Crashlytics is a real native module (`lib/fb.ts`).
- **0.9 Account deletion** — in-app Settings → Delete account → `deleteAccount`
  callable (`firebase/functions/index.js`) cascades member/family/photos/auth.
- **1.10 App Check (Play Integrity)** — wired in `lib/appCheck.ts` (monitor-only;
  enforcement is a console toggle — see below).
- **Analytics** — Firebase Analytics wired (`lib/analytics.ts`).

## ✅ Done THIS session (docs written; owner action to publish)
- **0.2 Data Safety** — `docs/DATA_SAFETY.md` (now includes Analytics + Crashlytics).
- **0.3 Privacy Policy** — `docs/PRIVACY_POLICY.md` (host it; paste URL into Play +
  optionally the About screen).
- **0.4 Target audience / COPPA** — `docs/TARGET_AUDIENCE_COPPA.md` (has an OPEN
  DECISION about invite-code self-join).

## ⬜ REMAINING (need owner decision, a prebuild, or console access)

### 0.1 Package name — OWNER DECISION (permanent)
App is "Lootboard" but package is `com.familywin.app`. Renaming to
`com.lootboard.app` is permanent on Play and requires a NEW Firebase Android app +
new `google-services.json` + new SHA-1s + Google Sign-In reconfig. Decide before
first upload. If keeping `com.familywin.app`, no action — just commit to it.

### 0.5 Unused permissions — needs a prebuild + re-verify (do WITH device testing)
Built manifest currently declares extras that hurt Play review/trust. Remove via
`tools:node="remove"` in `android/app/src/main/AndroidManifest.xml` (add
`xmlns:tools` if missing) AND drop from `app.json` so a future prebuild matches:
```xml
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove"/>
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove"/>
<uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>
```
- `SYSTEM_ALERT_WINDOW`: safe to remove (RN dev overlay only).
- `READ/WRITE_EXTERNAL_STORAGE`: legacy; photo picker on API 33+ doesn't need them.
- `SCHEDULE_EXACT_ALARM`: removing avoids a Play policy declaration; **verify daily
  reminders still fire** (they use inexact alarms — should be fine).
- `RECORD_AUDIO`: auto-added by the audio lib; we only PLAY sounds. **After removing,
  verify sound effects still play** (task-complete/reward sounds).
Deferred from the 2026-08-26 autonomous session precisely because it needs a
rebuild + on-device re-verification of notifications/photo/sound — do it in a
session where those can be checked.

### 0.8 versionCode scheme — trivial, do at first upload
Currently `versionCode 1` / `versionName "1.0.0"` in BOTH `android/app/build.gradle`
and `app.json` (in sync). Scheme: bump `versionCode` by 1 for **every** AAB upload;
bump `versionName` for user-facing releases (1.0.0 → 1.0.1 …). Keep the two files in
sync (or wire `build.gradle` to read from `app.json`). No change needed until the
first upload.

### App Check enforcement (1.10 follow-up) — console, AFTER real-device tokens
Turn on enforcement in Firebase console (App Check → each service) ONLY after
confirming real devices produce valid Play Integrity tokens + a debug token is
registered for debug builds — otherwise the app locks itself out.

### Advertising ID decision (from Data Safety)
Firebase Analytics collects the Android Advertising ID by default. Recommend
disabling it (+ ad-personalization signals) before launch so the Data Safety form
can say "no advertising ID" — see `docs/DATA_SAFETY.md`. Needs a manifest change
(so, same rebuild as 0.5).
