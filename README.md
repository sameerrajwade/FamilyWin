# FamilyWin 🏆

**Turn household chores into a family game.** FamilyWin is a mobile app where
family members complete daily and weekly tasks to earn points. Whoever has the
most points when the week ends (Sunday midnight) wins — with a live
leaderboard, a rewards store kids can redeem points in, and parental tools for
logging good/bad behavior.

> Status: Feature-complete (Phases 1–4). Built with React Native + Expo,
> backed by Firebase. Ready for first device build and Play Store rollout.

---

## Contents

- [✨ What it does](#-what-it-does)
- [📱 Screenshots & Flow](#-screenshots--flow)
- [🧱 Tech Stack](#-tech-stack)
- [🏗️ Architecture at a Glance](#️-architecture-at-a-glance)
- [🔄 Core Data Flow](#-core-data-flow-example-completing-a-task)
- [🚀 Getting Started](#-getting-started)
- [📚 More Documentation](#-more-documentation)
- [🎨 Design System](#-design-system)
- [🔐 Roles & Permissions](#-roles--permissions)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ What it does

| For Kids | For Parents |
|---|---|
| 📋 See daily/weekly chores assigned to you | ➕ Create tasks with point values (Easy/Medium/Hard) |
| ✅ Mark tasks complete and watch points roll in | 👨‍👩‍👧 Manage family members, roles, and profiles |
| 🏆 Compete on a live leaderboard with siblings/parents | ⚠️ Log discipline events (bonuses & penalties) |
| 🎁 Redeem points for real rewards from the family store | ✅ Approve or reject reward redemption requests |
| 🔥 Build streaks for bonus points (7/14/30 days) | 📊 View 6-week history & trends per child |
| 🧒 "Child Mode" — big buttons, mascot, simplified UI | 🔔 Push notifications for reminders & weekly results |

Every Sunday at midnight, the week resets automatically: scores are ranked, a
winner is crowned, everyone gets notified, and a fresh week begins.

---

## 📱 Screenshots & Flow

```
Splash/Onboarding → Login/Register → Create or Join Family
        ↓
   ┌─────────────────────────────────────────────┐
   │  Home (Tasks)  │ Leaderboard │ Rewards       │
   │  History       │ Settings    │               │
   └─────────────────────────────────────────────┘
        ↓                  ↓              ↓
  Complete tasks    See live ranks   Redeem points
  Earn points       Podium + streaks  Parent approves
```

A full visual tour of every screen — Home, Leaderboard, Rewards, Family,
History, Settings, and more — lives in the **[Screen Gallery](./docs/screens.html)**
(part of the consumer-facing docs site in `/docs`).

---

## 🧱 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile app | React Native + Expo SDK 51 (TypeScript, strict) | Cross-platform, fast iteration |
| Navigation | Expo Router v3 (file-based routing) | Mirrors Next.js — intuitive screen structure |
| State | Zustand + AsyncStorage persistence | Lightweight, no boilerplate, persists across launches |
| Database | Firebase Cloud Firestore (NoSQL) | Real-time sync, scales with family-sized data |
| Auth | Firebase Auth (email/password + Google Sign-In) | Familiar sign-in, secure |
| Push notifications | Firebase Cloud Messaging (FCM) | Native push for reminders & weekly results |
| Animations | React Native Reanimated v3 | Smooth confetti, point bursts, transitions |
| Background jobs | expo-background-fetch + expo-task-manager | Auto-fail overdue tasks even when app is closed |
| Backend logic | Firebase Cloud Functions (Node 20) | Weekly resets, streak bonuses — server-authoritative |
| Build | Expo prebuild → Android Studio / Gradle | Native Android build pipeline |

---

## 🏗️ Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────┐
│                        Mobile App (RN/Expo)                   │
│                                                                │
│  app/             Screens (file-based routing via Expo Router)│
│  components/ui/   Reusable UI: buttons, cards, avatars,       │
│                   animations, child-mode widgets              │
│  store/           Zustand stores (auth, family, tasks, points)│
│  lib/             Data layer — firebase.ts is the ONE place   │
│                   all Firestore reads/writes happen           │
│  constants/       Design tokens (colors, spacing, fonts)      │
│  types/           Shared TypeScript definitions               │
└───────────────────────────┬───────────────────────────────────┘
                            │  (all data access)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                          Firebase                              │
│                                                                │
│  Firestore   /families/{id}/{members,tasks,completions,       │
│              transactions,rewards,redemptions,weeklyScores}   │
│  Auth        Email/password + Google Sign-In                  │
│  FCM         Push notifications                               │
│  Storage     Member profile photos                            │
│  Functions   weeklyReset (Mon 00:01 UTC), dailyStreakCheck    │
│  Rules       firestore.rules — family-scoped access control   │
└──────────────────────────────────────────────────────────────┘
```

**Everything is scoped under `/families/{familyId}`** — no cross-family data
ever mixes. Security rules enforce that a signed-in user can only read/write
data belonging to their own family (the Firestore equivalent of Postgres RLS).

---

## 🔄 Core Data Flow (example: completing a task)

1. User taps "Complete" on a task card in `app/app/tabs/index.tsx`
2. Screen calls `completeTask()` from `lib/firebase.ts`
3. `lib/firebase.ts` writes a `/completions` doc + a `/transactions` doc
   (atomic batch) — points are derived from `task.pointValue`
4. Firestore's real-time listener (`onSnapshot`) pushes the update to every
   family member's leaderboard instantly
5. `lib/pointsEngine.ts` recalculates ranks, streaks, and weekly totals
6. Animations (`components/ui/Animations.tsx`) celebrate the points gain
7. Same-day undo is available — `undoTaskCompletion()` reverses the batch

Weekly resets and streak bonuses are **never** computed on-device — they run
in Cloud Functions (`firebase/functions/index.js`) so the result is consistent
and tamper-proof for every family member.

---

## 🚀 Getting Started

See **[ONBOARDING.md](./ONBOARDING.md)** for the full step-by-step setup guide
(Firebase project creation, Android build, signing, and Play Store release).

Quick version, once Firebase is configured:

```bash
npm install
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug      # or open in Android Studio and press Run
```

---

## 📚 More Documentation

| Doc | What's in it |
|---|---|
| [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) | Formal PRD — personas, user stories, functional & non-functional requirements, success metrics |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Deep dive: data model, security rules, state management, business rules |
| [ONBOARDING.md](./ONBOARDING.md) | Step-by-step setup for developers — Firebase, build, signing, release |
| [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) | Firebase-specific console steps & required indexes |
| [CLAUDE.md](./CLAUDE.md) | AI-assistant project brief (architecture + conventions for Claude Code) |
| [STORE_LISTING.md](./STORE_LISTING.md) | Everything needed to publish on the Play Store — copy, assets, privacy, ASO, release checklist |
| [FAQ.md](./FAQ.md) | Consumer-facing frequently asked questions |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and notable fixes |
| [docs/](./docs/index.html) | HTML consumer site — marketing pages & interactive app handbook (open `docs/index.html` in a browser, or serve via GitHub Pages) |

---

## 🎨 Design System

Brand colors: **Purple `#6C63FF`** (primary) · **Pink `#FF6584`** (accent) ·
Gold/Silver/Bronze for leaderboard ranks. Font: **Nunito**. Three themes:
Light, Dark, and **Child Mode** (enlarged UI, mascot, simplified language).
See `constants/theme.ts` — this system is finalized; please don't change it
without a design discussion.

---

## 🔐 Roles & Permissions

| Role | Create tasks | Log discipline | Approve rewards | Notes |
|---|:---:|:---:|:---:|---|
| `admin_parent` | ✅ | ✅ | ✅ | Family creator (one per family) |
| `parent` | ✅ | ✅ | ✅ | Invited by admin_parent |
| `child` | ❌ | ❌ | ❌ | Completes tasks, redeems rewards |

Children without their own phone can be added as **managed profiles** —
a parent switches into their profile to log completions on their behalf.

---

## 🤝 Contributing

This is currently a single-family personal project being prepared for wider
release. Issues and PRs should reference the relevant Firestore collection or
screen path so reviewers can trace data flow quickly (see ARCHITECTURE.md).

## 📄 License

Proprietary — all rights reserved (update this section before public release).
