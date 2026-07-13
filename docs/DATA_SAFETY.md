# Data Safety — Play Console form inputs (Lootboard)

> Source-of-truth for filling the Play Console **Data safety** section truthfully.
> App is enrolled in **Designed for Families** → answers must reflect COPPA/DFF posture.
> Last reviewed: 2026-07-12.

## Summary posture
- **Audience:** Designed for Families (mixed audience; parents are account holders, children are parent-managed profiles that never authenticate).
- **No ads, no ad SDKs.** No data sold or shared with third parties for advertising.
- **No data sold.** Data used only to provide the app.
- All data encrypted in transit (HTTPS/TLS to Firebase). Users can request deletion in-app (Settings → Delete account) and via the web deletion URL.

## Data collected & why

| Data type | Collected | Purpose | Linked to user? | Optional? |
|---|---|---|---|---|
| Email address | Yes (Auth) | Account creation / sign-in | Yes | Required |
| Name (parent display name) | Yes | Show in family/leaderboard | Yes | Required |
| Name + age (child profiles) | Yes | Age-appropriate profile, task assignment | Yes | Provided by parent |
| Photos (profile) | Yes (Storage) | Optional avatar for a member | Yes | Optional |
| App activity (tasks completed, points, redemptions) | Yes (Firestore) | Core app function | Yes | Required |
| Push token (FCM) | Yes | Reminders + weekly-win notifications | Yes | Optional (notif toggle) |
| Approximate timezone | Yes | Correct week boundaries / reminder time | Yes | Required |
| Crash logs / diagnostics | Yes (Crashlytics)* | Stability | No (pseudonymous) | — |

\* Crashlytics is on Google's DFF self-certified SDK list; configured without advertising identifiers.

## Data NOT collected
Location, contacts, SMS, call logs, browsing history, financial/payment info, precise location, microphone audio, advertising ID.

## Security practices to declare
- ✅ Encrypted in transit.
- ✅ Users can request data deletion (in-app + web URL).
- ✅ Committed to Play Families Policy.

## Children's data (COPPA / DFF specifics)
- Children do **not** create accounts or authenticate; a parent (account holder) creates and manages child profiles.
- Child data (name, age, optional photo) is entered and controllable by the parent.
- No behavioral advertising, no ad personalization, no third-party ad SDKs.
- Parent can edit or delete any child profile and its photo from Settings/Family.
