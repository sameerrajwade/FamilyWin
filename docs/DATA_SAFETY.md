# Chore League — Play Console Data Safety (source of truth)

> Fill the Play Console **Data safety** form from this document. Keep it in sync
> whenever data collection changes. Package: `com.familywin.app` · Firebase:
> `familywin-35a97`. Last reviewed: 2026-08-26.

## Summary answers (Play form)
- **Does your app collect or share any of the required user data types?** Yes (collect). **Share:** No — data is not shared with third parties for their own use; Firebase (Google) processes it as our infrastructure provider.
- **Is all collected data encrypted in transit?** Yes (HTTPS/TLS to Firebase).
- **Do you provide a way for users to request that their data be deleted?** Yes — in-app **Settings → Delete account** (callable `deleteAccount` cascades member/family/photos/auth) + a web deletion-request URL (see Privacy Policy).

## Data collected

| Data type | Collected | Purpose | Optional? | Notes |
|---|---|---|---|---|
| **Email address** | Yes | Account management, Auth | Required | Firebase Auth (email/password or Google Sign-In). Account holders only — child *profiles* are managed, they do not sign in. |
| **Name** | Yes | App functionality | Required | Member display name (parent- or self-entered). May be a child's first name. |
| **Age** | Yes (optional field) | App functionality (age-appropriate UI / child mode) | Optional | Parent-entered on a child profile; free-form, not verified. |
| **Photos** | Yes (optional) | App functionality (profile avatar) | Optional | Uploaded to Firebase Storage `member-photos/{familyId}/`. User-initiated only. |
| **User IDs** | Yes | App functionality | Required | Firebase UID, familyId, memberId — to scope a family's data. |
| **Push tokens (FCM)** | Yes | App functionality (weekly-result + reminder notifications) | Optional (tied to notification opt-in) | Stored in `notificationConfigs`. |
| **Approximate device timezone** | Yes | App functionality (correct day boundaries / deadlines) | Required for scheduled logic | IANA timezone string (e.g. `America/Chicago`); not precise location. |
| **App activity (task completions, points)** | Yes | App functionality (core gameplay) | Required | The product's own gameplay data. |
| **App interactions / Analytics** | Yes | Analytics | — | **Firebase Analytics IS integrated** (`lib/analytics.ts`): screen views, `task_completed`/`reward_redeemed`/etc. events with numbers only (no names/titles), user + family ID. Declare under "App activity › App interactions". No advertising ID (see below). |
| **Crash logs & diagnostics** | Yes | Analytics / App functionality | — | Crashlytics is **not** in the build (removed — its Gradle plugin crashed startup). Nothing to declare unless it is re-added. |

## Advertising ID — OFF (done 2026-11-01)
AAID collection and all ad signals are disabled: `firebase.json` → `react-native`
(`google_analytics_adid_collection_enabled`, `…allow_ad_storage`, `…ad_user_data`,
`…ad_personalization_signals` = false) and the `com.google.android.gms.permission.AD_ID`
permission is removed (app.json `blockedPermissions` + AndroidManifest `tools:node="remove"`).
So answer **"no advertising ID"**. Analytics events carry only opaque ids (uid, family id)
and numbers — no names, task or reward titles (`lib/analytics.ts`).
Note: Crashlytics was removed from the build (Gradle plugin crash); errors are logged locally only.

## NOT collected
- Precise or coarse **location**, contacts, calendar, SMS, call logs, browsing history.
- **Financial info** — points are an in-app number, not currency; no payment data (monetization is OFF; when enabled it routes through Google Play Billing, which handles payment data itself).
- **No advertising SDKs / no data sold or shared** with third parties for their own use. Firebase Analytics/Crashlytics (Google) process data as our infrastructure provider.

## Children's data (see docs/TARGET_AUDIENCE_COPPA.md)
Child *profiles* store first name, optional age, optional photo, and gameplay
activity — all entered/managed by a parent account holder. Children do not create
accounts or authenticate. This shapes the target-audience declaration and the
privacy policy's children section.

## Security
- In transit: TLS (Firebase SDK/HTTPS).
- At rest: Firestore/Storage server-side encryption (Google-managed).
- Access control: `firebase/firestore.rules` + `firebase/storage.rules` scope every
  read/write to the caller's own family; audit collections (transactions,
  completions, weeklyScores) are immutable to clients / Cloud-Function-only.
