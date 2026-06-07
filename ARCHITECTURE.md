# FamilyWin — Architecture Deep Dive

This document is for engineers who need to understand *how* the app is built,
not just what it does. Pair it with `CLAUDE.md` (AI-assistant brief) and
`README.md` (product overview).

---

## 1. High-Level Shape

FamilyWin is a **thin client over Firestore**. There is intentionally very
little custom backend — Firebase provides auth, database, storage, push, and
serverless functions, and the mobile app is a real-time view over that data.

```
React Native (Expo Router screens)
        │
        ├── Zustand stores (in-memory + AsyncStorage cache)
        │
        └── lib/firebase.ts  ← the ONLY module that talks to Firestore/Auth/Storage
                │
                ▼
        Firebase (Firestore, Auth, Storage, FCM, Cloud Functions)
```

**Rule of thumb:** if a screen needs data, it calls a helper in
`lib/firebase.ts`. Screens never construct Firestore queries directly. This
keeps security-rule assumptions, error handling, and data shaping in one
place.

---

## 2. Firestore Data Model

Everything lives under a single root: `/families/{familyId}`. There are no
cross-family joins — every query is naturally scoped, which both simplifies
the code and is the basis of the security model (see §4).

```
/users/{uid}                       → { familyId, memberId }   (auth → family lookup)

/families/{familyId}
  name, inviteCode (6-char), weekStartDay

  /members/{memberId}
    userId, displayName, role (admin_parent | parent | child),
    avatarEmoji, photoURL?, age?, isManaged?

  /tasks/{taskId}
    title, category, difficulty, pointValue, recurrence,
    assignedTo, autoFailHour, isActive, createdBy

  /completions/{id}
    taskId, memberId, weekId (YYYY-WNN), completedAt, completedDate,
    wasAutoFailed, pointsAwarded
    — immutable once written EXCEPT same-day self-undo (delete) — see §6

  /transactions/{id}
    memberId, delta, reason, source (task|discipline|bonus|manual|redemption),
    referenceId?, createdAt
    — append-only audit log; this is the source of truth for all point totals

  /rewards/{rewardId}
    title, pointCost, isActive, createdBy

  /redemptions/{id}
    rewardId, memberId, status (pending|approved|rejected), redeemedAt

  /weeklyScores/{weekId}
    scores: [{ memberId, points, rank, winner }]
    — written ONLY by the weeklyReset Cloud Function, never the client

  /notificationConfigs/{memberId}
    enabled, dailyReminderTime, pushToken (FCM), timezone
```

### Why a transaction ledger instead of a running total?

Every point change — task completion, undo, discipline bonus/penalty, reward
redemption — is written as an immutable `transactions` row with a signed
`delta`. Current totals are *derived* by summing transactions for the active
week (`pointsEngine.ts` + `getWeekCompletions`/`Col.transactions` queries).

This gives you, for free:
- A full audit trail (`history.tsx` shows it directly)
- Trivial undo (write an equal-and-opposite transaction, or delete + reverse)
- No risk of drift between "the number on screen" and "what actually happened"

### Week IDs

Weeks are identified as `YYYY-WNN` (e.g. `2025-W21`). All completions and
score snapshots are scoped to a `weekId` so historical weeks remain queryable
and immutable after rollover. `lib/firebase.ts` exports `getCurrentWeekId()`
and `lib/pointsEngine.ts` exports `getCurrentWeekRange(weekStartDay)` to
compute the active week consistently across the app (family can configure
which day the week starts on).

---

## 3. State Management (Zustand)

Four stores in `store/index.ts`, each persisted to AsyncStorage so the app has
something to render instantly on cold start (before Firestore responds):

| Store | Holds | Notes |
|---|---|---|
| `useAuthStore` | Current Firebase user, `member` doc, `family` doc | Populated by the `onAuthStateChanged` listener in `app/_layout.tsx` |
| `useFamilyStore` | All family `members[]` | Refreshed on family-tab load and member mutations |
| `useTaskStore` | Active tasks for the current week | Drives the Home tab task list |
| `usePointsStore` | Weekly point totals per member | Feeds the leaderboard and point-burst animations |

Screens subscribe to these stores via hooks (`useAuthStore()`, etc.) and also
attach **Firestore `onSnapshot` listeners** for real-time updates (e.g. the
leaderboard re-fetches whenever the latest transaction changes — see
`leaderboard.tsx`). Zustand is the *cache*; Firestore is the *truth*.

---

## 4. Security Model (Firestore Rules)

`firebase/firestore.rules` is the Firestore equivalent of Postgres Row-Level
Security. Key helper functions:

- `isFamilyMember(familyId)` — is the signed-in user linked to this family via
  their `/users/{uid}` lookup doc?
- `isParent(familyId)` — does their `/members/{memberId}` doc have role
  `parent` or `admin_parent`?
- `isOwnerMember(familyId, memberId)` — does the member doc's `userId` match
  the signed-in user?

Representative rules:
- **Tasks**: only parents can create/update/delete; everyone in the family can
  read
- **Completions**: any family member can create their own; nobody can edit
  (immutable audit trail); a member can **delete their own** (same-day undo —
  the app enforces the "same day" constraint client-side, the rule enforces
  *ownership*); parents can also delete on behalf of managed children
- **Transactions**: append-only — create allowed, update/delete always denied
- **weeklyScores**: written only by Cloud Functions (client writes denied)

> ⚠️ **When you add a new collection or change access patterns, update
> `firestore.rules` AND deploy it** (`firebase deploy --only firestore:rules`).
> A common bug class in this codebase has been "the UI looks like it should
> work but Firestore silently rejects the write" — always check the rules
> first when something fails with no clear client-side error.

---

## 5. Cloud Functions (Server-Authoritative Logic)

Located in `firebase/functions/index.js`, deployed with
`firebase deploy --only functions`:

| Function | Trigger | Does |
|---|---|---|
| `weeklyReset` | Scheduled — every Monday 00:01 UTC | Tallies the past week's transactions per family, ranks members, writes a `weeklyScores/{weekId}` doc, sends FCM push to all members announcing the winner, and the new week begins |
| `dailyStreakCheck` | Scheduled — daily | Walks each member's completion history; awards streak bonus transactions at 7/14/30 consecutive days (+50/+100/+250 points) |

These run server-side specifically so that **no client can manipulate their
own ranking or streak bonuses** — the mobile app only ever *reads* the results.

---

## 6. Key Business Rules (and where they live)

| Rule | Value | Implementation |
|---|---|---|
| Point values | Easy = 10, Medium = 25, Hard = 50 | Set on task creation (`task/create.tsx`), stored as `pointValue` |
| Streak bonuses | 7d = +50, 14d = +100, 30d = +250 | `calculateStreakBonus()` in `pointsEngine.ts`, awarded by `dailyStreakCheck` |
| Auto-fail | Background task runs every 15 min; if `autoFailHour` has passed and no completion exists, deduct full point value | `lib/backgroundTasks.ts` + `expo-background-fetch` |
| Same-day undo | A member can undo their own completion, same calendar day only | `handleUndoTask()` in `app/app/tabs/index.tsx` compares `completedAt.toDate()` to `new Date()`; `undoTaskCompletion()` in `lib/firebase.ts` does the batched delete + reversing transaction; **also requires the Firestore rule to allow the delete** (see §4 — this was a real bug: the rule said `delete: if false` and silently blocked every undo regardless of correct client code) |
| Weekly reset | Every Monday 00:01 UTC | `weeklyReset` Cloud Function — see §5 |
| Reward redemption | Child requests → parent approves → points deducted on approval (not on request) | `requestRedemption()` / `approveRedemption()` in `lib/firebase.ts`; redemption transactions use `source: 'redemption'` and are explicitly excluded from leaderboard point totals so spending doesn't lower your rank |

---

## 7. Notable Implementation Details & Gotchas

These are things that look like bugs until you know the reason — recorded
here so the next person doesn't have to rediscover them.

- **`expo-image-picker@15.0.7` only supports the enum form**
  (`ImagePicker.MediaTypeOptions.Images`), not the newer array syntax
  (`mediaTypes: ['images']`). The array form silently breaks photo selection.

- **Android `Alert.alert` reliably renders at most 3 buttons.** A 4th option
  (e.g. Cancel/Camera/Library/Remove) gets dropped or misrouted. Chain
  multiple 2–3 button alerts instead.

- **Launching the image picker repeatedly can "stack" hidden launches.**
  If a tap doesn't appear to do anything, don't add a `setTimeout` — that
  makes it *worse* (each tap queues another launch that fires later, all at
  once). Instead, guard with an in-flight lock (a ref or module-level
  boolean) so repeat taps are simply ignored until the first launch resolves.
  See `pickerBusyRef` in `app/app/member/[id].tsx` and `pickerBusy` in
  `app/app/tabs/family.tsx`.

- **Firestore `Timestamp` vs. string-date comparisons.** Comparing derived
  `Date` objects (`timestamp.toDate()`) is more robust than comparing
  pre-formatted date strings for "is this the same calendar day" checks —
  string formats can subtly mismatch depending on when/where they were
  written.

- **The `<Avatar>` component already supports `photoURL` with emoji
  fallback** (`components/ui/index.tsx`) — always use it instead of rendering
  `member.avatarEmoji` as raw `<Text>`. Wherever a member is shown (rows,
  podiums, transaction history, profile switcher), photo > emoji.

- **`expo prebuild --clean` wipes `android/` entirely.** Never hand-edit
  files there expecting them to survive a clean prebuild.

---

## 8. Build & Release Pipeline

```
TypeScript source
   │  npx expo prebuild --platform android [--clean]
   ▼
android/  (native Gradle project — generated, don't hand-edit persistent files here)
   │  ./gradlew assembleDebug   (dev, uses default debug keystore)
   │  ./gradlew assembleRelease (prod, REQUIRES signing env vars — see ONBOARDING.md)
   ▼
APK / AAB  →  sideload for testing, or upload to Play Console for release
```

Gradle performance tuning lives in `android/gradle.properties`
(`org.gradle.parallel`, `caching`, `configureondemand`, increased JVM heap) —
this took incremental rebuilds from ~13–15 min down to ~1 min.

> **Release builds require `FAMILYWIN_KEYSTORE_PASSWORD` and
> `FAMILYWIN_KEY_PASSWORD`.** Never hardcode these in scripts or commit them —
> set them as shell environment variables for the build session only.
