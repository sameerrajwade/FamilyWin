# Lootboard — Gamification & Branding Roadmap

> Tracked, sequenced backlog for the branding / gamification / performance push
> agreed 2026-08-30. Work top-to-bottom; check items off as they land. Keep
> `docs/PROGRESS.md` "Next Up" pointing at the current phase. Nothing here is
> built yet unless its box is checked.

## Locked decisions
- **#2 branding = Lootboard brand system** (wordmark/logo/splash/empty-states/brand kit). NOT family white-label.
- **Brand identity = treasure-chest mark + "Loot"(purple)/"board"(orange) wordmark + tagline "Chores, points, wins."**
- **Icon FAMILY (dynamic marks):** build all 6 marks (chest, coin+star, shield, podium, medal, trophy) as one reusable SVG icon set. Master brand mark = chest. Share cards pick a CONTEXTUAL icon: Win→podium, Streak→medal, Recap→coin, Level-up→shield, Reward→coin, Invite→chest. Same palette/style ties them together.
- **Task edit** = visible pencil/⋯ button → action sheet (Edit · Reassign · Delete). Remove "✎ hold to edit" text; keep long-press as a shortcut.
- **Recurrence pills** = live-stat: daily → 🔥 streak flame (color climbs with streak), weekly → `Day X/7` progress. Gradient/shimmer flourish is a later polish pass.
- **Allowance** = VIRTUAL pocket-money tracking only (points→currency, savings goals, parent marks "paid"). No real payment rails / regulation.
- **iOS**: no Apple listing yet → share cards template the iOS link; fill in when it exists. `APP_STORE_URL` currently Play-only ([constants/strings.ts](../constants/strings.ts)).

---

## Phase 1 — Brand system (foundation)
- [x] Brand tokens: `Brand` palette (gold ramp, purple, orange, tagline) in `components/ui/BrandIcons.tsx`. (Reusable pill/chip styles land in Phase 3.)
- [x] **Icon family** (`components/ui/BrandIcons.tsx`): 6 react-native-svg marks — chest, coin+star, shield, podium, medal, trophy — `BrandIcon`/`BRAND_ICONS` registry, size-prop driven. Reused by brand + share cards.
- [x] `<Wordmark>` / `<BrandLogo>` / `<AppIconTile>` (chest mark + two-tone wordmark + optional tagline, light/dark).
- [x] Branded splash — first slide renders the chest mark ([app/auth/splash.tsx](../app/auth/splash.tsx)).
- [x] Branded empty states — `EmptyState` gained a `brandIcon` prop; Home "no tasks" uses the chest. (rewards.tsx has a LOCAL EmptyState — fold in when touched.)
- [x] Launcher app-icon + native splash regenerated to the chest (iter46) — all mipmap webp (launcher/round/foreground ×5) + splashscreen_logo.png (×5) + assets/*.png via `sharp` (scratchpad/gen_icons.js). Replaced res files directly (no prebuild — android/ is committed).
- [ ] Wire `<Wordmark>` into a header or two (e.g. Settings) — optional polish.

## Phase 2 — Share cards (uses Phase 1 brand kit)
Pipeline: styled React view → `react-native-view-shot` capture → `expo-sharing` (both already installed).
- [x] Reusable `ShareCardModal` + `ShareCardData` (`components/ui/ShareCard.tsx`): purple-gradient card, contextual `BrandIcon`, eyebrow/title/subtitle + stat tiles, wordmark + store footer. captureRef→PNG→Sharing, text-share fallback. Store links in `constants/strings.ts` (`IOS_STORE_URL` templated empty, `STORE_TAGLINE`).
- [x] 🏆 Win of the Week card (icon: podium) — [app/app/winner.tsx](../app/app/winner.tsx).
- [x] 👨‍👩‍👧 Invite card (icon: chest) — [app/app/family.tsx](../app/app/family.tsx) (replaced text share).
- [x] 🔥 Streak card (icon: medal) — tap streak badge on member profile.
- [x] 📈 Weekly recap card (icon: coin) — "Share ↗" on member profile header.
- [x] ⭐ Level-up card (icon: shield) — tap level card on member profile.
- [x] 🎁 Reward-redeemed card (icon: coin) — offered after a parent approves a redemption (rewards.tsx).

## Phase 3 — Task-card UX overhaul
- [x] Removed "✎ hold to edit"; parent-only ✏️ button top-right of `AdultTaskCard` → action sheet ([app/app/tabs/index.tsx](../app/app/tabs/index.tsx)).
- [x] Action sheet: Edit · Delete (long-press still opens Edit as a shortcut). Delete wired via `deleteTask` + confirm. (Reassign folded into Edit — the edit screen owns the assignee picker; standalone quick-reassign deferred.)
- [x] Live-stat pills: daily → 🔥 warning-tinted chip (shows streak number when provided); weekly → primary-tinted `Day X/7` (computed from `family.weekStartDay`); monthly/once → colored chips (grey killed).
- [ ] Wire per-task/member daily-task STREAK number into the daily pill (currently shows "Daily" until provided) — pairs with Phase 4 cached data.

## Phase 4 — Firestore read-minimization (cache-first)
- [x] Members: ONE family-wide `onSnapshot` listener in `app/app/tabs/_layout.tsx` → Zustand `setMembers`; removed per-focus `getFamilyMembers` refetches (Home + Rewards), leaderboard prefers store (fetch only if cold), history already guarded on empty. Kills a full members read on every tab visit.
- [x] Offline persistence — already ON by default (RN Firebase v26, per `lib/fb.ts`); cold loads hit disk first.
- [x] Streak number — already shown in the Home header `StreakFlame`; kept the daily pill as "🔥 Daily" (user likes it) rather than duplicating the number on every card.
- [ ] (Optional, deferred) Snapshot `docChanges()` diffs instead of full `loadTasks()`/`loadLeaderboard()` reloads — current listeners already only refire on real changes; revisit only if profiling shows it matters.

## Phase 5 — Feature wave (in user's priority order; skip multi-household)
- [x] **1. Chore scheduling & rotation** — `lib/rotation.ts` (pure `currentRotationMemberId`/`effectiveAssignee`/`isDueToday`, 13 tests); `TaskDoc.rotation{memberIds,cadence}` + `scheduledDays[]`; create UI (rotate toggle + Each week/day + weekday chips); Home filters by `effectiveAssignee` (rotation owner) + `isDueToday` (schedule); "🔄 Your turn" card badge; edit-serialization carries both. ⚠️ FOLLOW-UP: server `sweep.js` + client `syncMissedPenalties` still use raw `assignedTo` → a ROTATING/SCHEDULED task could penalize the wrong member / on off-days IF penalties are ON (OFF by default, and sweep is deploy-gated) — wire `effectiveAssignee`/`isDueToday` there before enabling penalties broadly.
- [x] **2. Photo-proof of completion** — `TaskDoc.requiresPhoto` (implies approval) + `CompletionDoc.proofPhotoURL`; `uploadCompletionProof` reuses the writable `member-photos/{familyId}/proof_*` path (NO storage-rules deploy); create.tsx "📸 Require photo proof" toggle; Home `doCompleteTask` captures (camera/gallery via `pickPhotoUri`) → uploads → completes as pending WITH the photo (create-time, so rules allow it — no post-create update); approvals.tsx shows the proof thumbnail + tap-to-zoom lightbox. Cancel-picker aborts cleanly.
- [x] **3. Allowance / savings (virtual)** — FamilyDoc `allowanceEnabled`/`allowancePointsPerUnit`/`allowanceCurrency`; `pointsToCash`/`formatCash`/`pointsForOneUnit` (pointsEngine, tested); parental "Allowance" settings (toggle + rate chips 50/100/200/500 = 1 + currency $/£/€/₹); Rewards vault shows "≈ $X" cash value + "💸 Cash out" (child requests). Cash-out = a redemption of `kind:'payout'` (reuses redemptions collection+rules → NO deploy); parent approves in the pending list → deducts via source:'redemption' (excluded from leaderboard). Model: points=money at rate; flow: child requests → parent pays. (Savings-goal bars = later add; not built.)
- [ ] **4. Home-screen widget** — today's tasks / standings.
- [x] **5. Quiet hours** — notifConfig `quietStart`/`quietEnd` (member-local HH:MM, overnight-aware); pure `isInQuietHours` (notifications.ts, 3 tests); `ensureDailyReminder` gains a `quiet` arg and SUPPRESSES the reminder when its time is inside the window (tabs/_layout passes cfg's quiet on launch); notifications settings gains a "Quiet hours" toggle + Start/End chip rows. (Per-task nudges = later; the daily reminder is the only local schedule today.)
- [ ] **7. Web / tablet dashboard** — shared "family fridge" screen.
- [ ] **8. Extras** — sound/voice feedback, bounty/negotiable chores, shared shopping/todo lists, charity/giving goals.

---
## APK build checkpoints (NOT every phase)
Build/install an APK at these milestones only — each bundles enough to device-test as a unit:
- [ ] **APK 1 — after Phases 1–3** (brand system + share cards + task-card UX): the whole visual/branding overhaul in one build.
- [ ] **APK 2 — after Phase 4** (read-minimization): verify speed + no data regressions on device.
- [ ] **APK 3 — mid feature-wave** (after features 1–3: scheduling, photo-proof, virtual allowance).
- [ ] **APK 4 — end feature-wave** (features 4,5,7,8).

*Each phase: develop → test (tsc + jest) → then continue; device-verify happens at the APK checkpoints. Deploys (rules/functions) stay gated for when the user is present.*
