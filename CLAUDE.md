# FamilyWin — Claude Code Project Brief

> This file is read automatically by Claude Code every session.
> It gives you full context on the project so you never need to re-explain.

---

## What This App Is

**FamilyWin** is a family chore gamification Android app. Family members complete
daily/weekly tasks to earn points. The person with the most points at Sunday
midnight wins the week. There is a live leaderboard, a rewards store, discipline
event logging, and push notifications.

**Status:** Codebase complete (Phases 1–4). Ready for Firebase setup and Android
Studio build. Has NOT been run yet — no Firebase project exists yet.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native + Expo SDK 51, TypeScript strict |
| Navigation | Expo Router v3 (file-based) |
| State management | Zustand with AsyncStorage persistence |
| Database | Firebase Cloud Firestore (NoSQL) |
| Auth | Firebase Auth — email/password + Google Sign-In |
| Push notifications | Firebase Cloud Messaging (FCM) direct |
| Animations | React Native Reanimated v3 |
| Background tasks | expo-background-fetch + expo-task-manager |
| Build tool | Expo prebuild → Android Studio / Gradle |
| Backend functions | Firebase Cloud Functions (Node.js 20) |

---

## Project Structure

```
FamilyWin/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout — Firebase auth listener
│   ├── auth/
│   │   ├── splash.tsx            # Onboarding slides (first launch)
│   │   ├── login.tsx             # Email + Google Sign-In
│   │   ├── register.tsx          # Sign up + Google Sign-In
│   │   └── onboarding.tsx        # Create/join family flow
│   └── app/
│       ├── _layout.tsx
│       ├── tabs/
│       │   ├── _layout.tsx       # Bottom tab bar (5 tabs)
│       │   ├── index.tsx         # Home — task list with animations
│       │   ├── leaderboard.tsx   # Live leaderboard + podium
│       │   ├── rewards.tsx       # Rewards store + approval flow
│       │   ├── history.tsx       # 6-week chart + transaction log
│       │   └── settings.tsx      # Profile, notifications, theme
│       ├── task/create.tsx       # Create task modal
│       ├── discipline/log.tsx    # Discipline events (parent only)
│       └── member/[id].tsx       # Individual member profile
│
├── lib/
│   ├── firebase.ts               # ALL Firestore + Auth helpers (main data layer)
│   ├── googleAuth.ts             # Google Sign-In via @react-native-google-signin
│   ├── notifications.ts          # FCM + local scheduled notifications
│   ├── backgroundTasks.ts        # Auto-fail background task (every 15min)
│   ├── pointsEngine.ts           # Points calc, leaderboard build, streak logic
│   └── theme.tsx                 # ThemeProvider — dark/light/child mode
│
├── store/index.ts                # Zustand stores: auth, family, tasks, points
├── constants/
│   ├── theme.ts                  # Colors, spacing, fonts, shadows
│   └── strings.ts                # All UI text (i18n-ready)
├── types/index.ts                # TypeScript definitions for all entities
├── components/ui/
│   ├── Animations.tsx            # Confetti, PointBurst, SlideIn, ShimmerBox
│   ├── ChildMode.tsx             # Mascot, big task cards, CelebrationOverlay
│   ├── AppearanceSettings.tsx    # Dark/light/child mode toggles
│   └── index.tsx                 # Button, Card, Badge, Avatar, EmptyState
│
├── firebase/
│   ├── firestore.rules           # Security rules (equivalent of Supabase RLS)
│   └── functions/
│       ├── index.js              # Weekly reset + streak bonus Cloud Functions
│       └── package.json
│
├── google-services.json          # ← MISSING: download from Firebase Console
├── app.json                      # Expo config — package: com.familywin.app
├── package.json                  # All dependencies
├── FIREBASE_SETUP.md             # Step-by-step Firebase setup guide
└── CLAUDE.md                     # ← This file
```

---

## Firestore Data Model

NoSQL structure — no SQL, no JOINs. Everything is subcollections under `/families/{familyId}`.

```
/users/{uid}
  familyId: string
  memberId: string

/families/{familyId}
  name, inviteCode (6-char), weekStartDay

  /members/{memberId}
    userId, displayName, role (admin_parent|parent|child), avatarEmoji, age

  /tasks/{taskId}
    title, category, difficulty, pointValue, recurrence, assignedTo,
    autoFailHour, isActive, createdBy

  /completions/{id}
    taskId, memberId, weekId (YYYY-WNN), completedAt, wasAutoFailed, pointsAwarded

  /transactions/{id}
    memberId, delta, reason, source (task|discipline|bonus|manual), createdAt

  /rewards/{rewardId}
    title, pointCost, isActive, createdBy

  /redemptions/{id}
    rewardId, memberId, status (pending|approved|rejected), redeemedAt

  /weeklyScores/{weekId}
    scores: [{memberId, points, rank, winner}]   ← written by Cloud Function only

  /notificationConfigs/{memberId}
    enabled, dailyReminderTime, pushToken (FCM), timezone
```

---

## Key Business Rules

- **Week ID format:** `YYYY-WNN` (e.g. `2025-W21`) — used to scope all completions
- **Auto-fail:** Background task runs every 15min. If task has `autoFailHour` and it's past that hour and member hasn't completed → deduct points automatically
- **Points:** Easy=10, Medium=25, Hard=50. Penalties/bonuses logged as transactions.
- **Streaks:** 7d=+50pts, 14d=+100pts, 30d=+250pts (awarded by `dailyStreakCheck` Cloud Function)
- **Weekly reset:** Cloud Function `weeklyReset` runs every Monday 00:01 UTC → ranks members → sends FCM push to all members → new week begins
- **Reward redemptions:** Child requests → parent approves → points deducted on approval
- **RLS equivalent:** Firestore security rules in `firebase/firestore.rules` — members can only see their own family's data

---

## What Still Needs Doing (in priority order)

### 1. Firebase Setup (BLOCKING — do this first)
- [ ] Create Firebase project at console.firebase.google.com
- [ ] Add Android app (package: `com.familywin.app`)
- [ ] Enable Email/Password auth
- [ ] Enable Google Sign-In → copy Web Client ID → paste into `lib/googleAuth.ts` line 20
- [ ] Create Firestore database (Production mode)
- [ ] Download `google-services.json` → place in project root AND `android/app/`
- [ ] Deploy security rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Create Firestore indexes (see FIREBASE_SETUP.md for the list)

### 2. Android Build
- [ ] `npm install`
- [ ] `npx expo prebuild --platform android --clean`
- [ ] Open `android/` folder in Android Studio
- [ ] Let Gradle sync complete
- [ ] Connect Android phone → enable USB debugging → press Run ▶

### 3. Release Build
- [ ] Generate keystore: `keytool -genkey -v -keystore familywin-release.keystore ...`
- [ ] Add signing config to `android/app/build.gradle`
- [ ] Build → Generate Signed Bundle/APK → Android App Bundle → release

### 4. Play Store
- [ ] Google Play Console account ($25)
- [ ] App icon (512×512), feature graphic (1024×500), 2+ screenshots
- [ ] Privacy policy URL (termly.io is free)
- [ ] Upload AAB → Internal testing → Production

---

## Critical Files to Know

### lib/firebase.ts
The entire data layer. All Firestore reads/writes go through this.
Key exports: `Col` (collection paths), `createFamily`, `getFamilyByInviteCode`,
`createMember`, `getUserFamilyAndMember`, `getActiveTasks`, `getWeekCompletions`,
`completeTask`, `addPointTransaction`, `getActiveRewards`.

### lib/googleAuth.ts — LINE 20
```typescript
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID...apps.googleusercontent.com';
```
**Must be changed** before Google Sign-In works.

### store/index.ts
Four Zustand stores: `useAuthStore`, `useFamilyStore`, `useTaskStore`, `usePointsStore`.
All screens import from here.

### app/_layout.tsx
Root layout. Contains the Firebase `onAuthStateChanged` listener.
On sign-in → calls `getUserFamilyAndMember(uid)`:
- If user has a family → go to `/app/tabs/`
- If new user → go to `/auth/onboarding`
On sign-out → check `AsyncStorage('onboarding_done')` → splash or login

---

## Development Commands

```bash
# Install dependencies (run once)
npm install

# Generate Android native project
npx expo prebuild --platform android

# Clean regenerate (after config changes)
npx expo prebuild --platform android --clean

# Deploy Firebase rules only
firebase deploy --only firestore:rules

# Deploy Cloud Functions only
firebase deploy --only functions

# Deploy everything Firebase
firebase deploy --only firestore:rules,functions

# Build debug APK (from android/ folder)
cd android && ./gradlew assembleDebug

# Build release APK (after signing config set up)
cd android && ./gradlew assembleRelease

# Get SHA-1 fingerprint (for Firebase Console)
cd android && ./gradlew signingReport

# TypeScript type check
npx tsc --noEmit

# Check for lint errors
npx eslint . --ext .ts,.tsx
```

---

## Dependencies Reference

### Key packages (don't reinstall — already in package.json)
- `@react-native-firebase/app` + `/auth` + `/firestore` + `/messaging` — Firebase native SDK
- `@react-native-google-signin/google-signin` — Google Sign-In
- `expo-router` — File-based navigation
- `expo-notifications` — Local scheduled notifications
- `expo-background-fetch` + `expo-task-manager` — Auto-fail background task
- `react-native-reanimated` — Animations (confetti, slide-ins, spring press)
- `zustand` — State management
- `@react-native-async-storage/async-storage` — Persistence

### Removed from original (no longer needed)
- ~~`@supabase/supabase-js`~~ — replaced by Firebase
- ~~`@supabase/realtime-js`~~ — replaced by Firestore onSnapshot

---

## Design System (constants/theme.ts)

```typescript
Colors.primary     = '#6C63FF'  // Purple — main brand
Colors.accent      = '#FF6584'  // Pink — secondary
Colors.success     = '#43D98F'  // Green
Colors.warning     = '#FFB347'  // Amber
Colors.danger      = '#FF5C5C'  // Red
Colors.background  = '#F8F9FF'  // Off-white
Colors.surface     = '#FFFFFF'  // Card background
Colors.text        = '#1A1A2E'  // Near-black
Colors.gold        = '#FFD700'  // Leaderboard 1st
Colors.silver      = '#C0C0C0'  // Leaderboard 2nd
Colors.bronze      = '#CD7F32'  // Leaderboard 3rd
```

Font: **Nunito** (Regular/SemiBold/Bold/ExtraBold/Black) — loaded in `_layout.tsx`

**Never change UI colours or fonts** — the design system is finalised.

---

## Theme System (lib/theme.tsx)

Three modes switchable from Settings:
- **Light** — default, `#F8F9FF` background
- **Dark** — `#0F0F1A` background, all surfaces adjusted
- **Child Mode** — `#FFF5FF` background, pink primary, mascot ⭐, enlarged text/cards

Access via `useTheme()` hook in any screen.

---

## Roles & Permissions

| Role | Can create tasks | Can log discipline | Can approve rewards | Notes |
|---|---|---|---|---|
| `admin_parent` | ✅ | ✅ | ✅ | Family creator, only one |
| `parent` | ✅ | ✅ | ✅ | Added by admin_parent |
| `child` | ❌ | ❌ | ❌ | Can complete tasks + redeem |

---

## Known Issues / Things to Watch

1. **Background task on Android** — `expo-background-fetch` is less reliable on Android 12+ with battery optimisation. Advise users to whitelist FamilyWin from battery optimisation in phone settings.
2. **Firestore indexes** — First run may show index errors in logs. Follow the link Firebase provides in the error to auto-create the index.
3. **Google Sign-In** — Requires SHA-1 fingerprint registered in Firebase Console for each build variant (debug + release have different fingerprints).
4. **First Gradle sync** — Takes 10–20 minutes and downloads ~1GB. Completely normal.
5. **expo prebuild --clean** — Wipes the android/ folder entirely. Don't store custom files there — they'll be lost on next prebuild.

---

## How to Ask Claude Code for Help

Good prompts that work well for this project:

```
"Run npm install and expo prebuild, fix any errors you find"

"Check why the leaderboard isn't updating in real time — look at
 leaderboard.tsx and the Firestore onSnapshot subscription"

"Add a feature where parents can set a weekly points goal for each child"

"The auto-fail background task isn't running on some Android devices —
 diagnose the issue in lib/backgroundTasks.ts"

"Build a release APK and sign it with the keystore at android/app/familywin-release.keystore"

"Run the TypeScript compiler and fix all type errors"

"Create Firestore indexes for all the queries in lib/firebase.ts"
```

---

*Last updated: Phase 4 complete — Firebase migration done, UI finalised, ready for first build.*
