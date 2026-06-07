# FamilyWin — Product Requirements Document (PRD)

## 1. Problem Statement

Household chores are a constant source of friction in families: kids forget,
parents nag, "fairness" arguments erupt ("I did more than him!"), and there's
no consistent reward for consistent effort. Sticker charts and whiteboards are
analog, easy to ignore, and don't scale to busy modern families with multiple
kids and devices.

**FamilyWin turns chores into a game families actually want to play** — with
real-time competition, visible progress, fair automated scoring, and rewards
kids can work toward.

## 2. Target Users / Personas

| Persona | Who they are | What they need |
|---|---|---|
| **The Organizing Parent** ("Admin Parent") | Sets up the family, defines chores & point values, wants visibility without nagging | Easy task creation, fair automated tracking, a way to course-correct (discipline log), approval control over rewards |
| **The Co-Parent** | Shares parenting duties, needs the same tools as the admin | Same permissions as admin_parent (minus family-creation), can log discipline & approve rewards |
| **The Competitive Kid** (8–14) | Motivated by winning, badges, streaks, leaderboards | Clear visibility of their rank, satisfying feedback (animations, points), a goal to redeem points for |
| **The Younger Child** (under 8, no phone) | Needs simplicity, can't manage their own account | "Managed profile" — parent switches into their view; **Child Mode** UI (big buttons, mascot, simple language) |

## 3. Core User Stories

**As an admin parent, I want to...**
- create a family and invite my partner and kids with a 6-character code
- define tasks with a difficulty (and therefore point value) and a recurrence
- set an "auto-fail" time so points are deducted if a chore isn't done by then
- log one-off bonuses or penalties (discipline events) outside of normal tasks
- approve or reject reward redemption requests before points are spent
- see a 6-week history and trend per child to have informed conversations

**As a child with a phone, I want to...**
- see exactly what I need to do today/this week and how many points each is worth
- mark a task done and watch my points go up (with a fun animation)
- undo an accidental "complete" the same day, before it's too late
- see how I rank against my siblings/parents on a live leaderboard
- build a streak and get bonus points for consistency
- spend my points on rewards from a family-curated store

**As a managed child (no phone), I want (via my parent)...**
- a simplified, encouraging interface with big visuals and a friendly mascot
- celebration moments when I complete things
- the same sense of progress and reward as my older siblings

**As any family member, I want...**
- to know, without asking, who's winning this week and how close it is
- push notifications so I don't forget to do my tasks or miss the weekly result
- my data to be visible only to my own family — never shared or mixed with others

## 4. Functional Requirements

### 4.1 Onboarding & Identity
- Email/password and Google Sign-In
- First user creates a family (becomes `admin_parent`, gets an invite code);
  subsequent users join via invite code
- Managed child profiles can be created by parents without requiring a
  separate device/account

### 4.2 Tasks & Completion
- Parents define tasks: title, category, difficulty (→ point value:
  Easy = 10 / Medium = 25 / Hard = 50), recurrence, optional auto-fail hour
- Members mark tasks complete; points are awarded immediately and reflected
  in real time across all family members' devices
- **Same-day undo**: a member can reverse their own completion (and the
  points it awarded) on the same calendar day, with a confirmation prompt
- **Auto-fail**: a background process checks every 15 minutes; tasks past
  their `autoFailHour` with no completion are marked failed and deduct points

### 4.3 Scoring, Streaks & Weekly Reset
- All point changes are recorded as an immutable, auditable transaction
  (task completion, undo, discipline event, streak bonus, reward redemption)
- Streak bonuses awarded automatically at 7 / 14 / 30 consecutive days
  (+50 / +100 / +250 points)
- Each week (configurable start day) resets automatically: final ranks are
  computed server-side, a winner is announced, everyone is notified, and a
  fresh week begins

### 4.4 Leaderboard & History
- Live, real-time leaderboard with podium for top 3, full ranked list,
  personal best tracking, and per-member streak/completion-rate display
- 6-week historical trend chart and full transaction log

### 4.5 Rewards Store
- Parents define rewards with a point cost
- Children request redemption; parent approves or rejects; points are
  deducted **only on approval** (not on request)
- Redemption transactions are excluded from leaderboard rank calculations
  (spending points shouldn't lower your rank)

### 4.6 Discipline Log
- Parents can log one-off bonus or penalty point adjustments with a reason,
  outside of the normal task system, for behavior that doesn't fit a chore

### 4.7 Profiles & Personalization
- Display name, age, avatar emoji, and/or uploaded profile photo
  (photo takes precedence over emoji wherever a member is shown)
- Three appearance modes: Light, Dark, and **Child Mode** (enlarged UI,
  mascot, simplified visuals — toggled per member)

### 4.8 Notifications
- Push notifications (FCM) for daily task reminders and weekly results
- Per-member notification preferences (enabled, reminder time, timezone)

## 5. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Real-time** | All score/leaderboard changes must propagate to every family member's device within seconds (Firestore real-time listeners) |
| **Data isolation** | A family's data must never be readable by another family — enforced at the database layer (security rules), not just the UI |
| **Fairness / tamper-resistance** | Weekly winner determination and streak bonuses are computed server-side (Cloud Functions); the client only displays results |
| **Offline resilience** | Zustand + AsyncStorage cache lets the app render the last-known state instantly on launch, before network sync completes |
| **Accessibility for young children** | Child Mode: larger touch targets, simplified copy, friendly mascot, celebratory animations |
| **Battery/background reliability** | Auto-fail checks run via background tasks; users are advised to whitelist the app from battery optimization on Android 12+ |

## 6. Success Metrics (suggested — adapt once live)

- **Activation**: % of created families that add 2+ members within 48 hours
- **Engagement**: average tasks completed per member per week;
  weekly-active-family rate
- **Retention**: % of families still active after 4 weeks / 12 weeks
  (one full "season" of weekly resets)
- **Reward loop health**: % of earned points redeemed (a healthy economy
  isn't all-earn-no-spend or all-spend-no-save)
- **Satisfaction**: in-app or store review sentiment, specifically around
  "reduced nagging" and "kids' motivation"

## 7. Out of Scope (for current version)

- Cross-family comparison or social features (by design — privacy first)
- In-app purchases / real-money rewards
- iOS build (Android-first; package `com.familywin.app`)
- Multi-language support (English only at launch; `constants/strings.ts` is
  structured to be i18n-ready for the future)

## 8. Open Questions / Future Considerations

- Should weekly winners get a persistent "trophy case" / history of wins?
- Should there be a way to split a large task across multiple members?
- Should streak bonuses be configurable per family (currently fixed values)?
- Is there demand for a web/companion dashboard for parents?
