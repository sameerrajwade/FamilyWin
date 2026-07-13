# Lootboard — Launch Roadmap & Improvement Plan

> **Audience:** This document is written to be handed directly to Claude (Opus or any model)
> as a work order. Each item has a priority, a phase, acceptance criteria, and file pointers.
> Execute phases in order. Do not skip the QA gate at the end of each phase.
>
> **Ground rules for the executing model (non-negotiable):**
> 1. Never change `constants/theme.ts` brand colors without explicit user approval — extend, don't replace.
> 2. Never handle keystore passwords (`FAMILYWIN_KEYSTORE_PASSWORD` / `FAMILYWIN_KEY_PASSWORD`) — all signing is done by the user.
> 3. Never use real family member names/photos in marketing material — use Dad / Mom / Alex / Jamie placeholders.
> 4. After every phase: `npx tsc --noEmit` clean, `npm test` green, build a release APK only when the user asks.
> 5. Test on-device behavior before declaring anything fixed (adb at `C:\Users\samee\AppData\Local\Android\Sdk\platform-tools\adb.exe`).

**Project root:** `C:\Users\samee\FW` · **App name:** Lootboard · **Package:** `com.familywin.app` · **Firebase:** `familywin-35a97`

---

## Phase 0 — Ship Blockers (before any Play Store upload)

Priority: **P0 — mandatory.** Nothing else matters until these are done.

| # | Item | Detail | Files |
|---|------|--------|-------|
| 0.1 | **Package name decision** | App is branded "Lootboard" but package is `com.familywin.app`. Package name is **permanent** on Play Store — decide now (`com.lootboard.app` recommended). Changing it requires a new Firebase Android app registration + new `google-services.json` + new SHA-1s. | `app.json`, Firebase Console |
| 0.2 | **Data Safety form inputs** | Play Console requires declaring: email collection (Auth), photos (Storage), analytics (Firebase Analytics), FCM tokens. Document exactly what is collected and why so the form can be filled truthfully. | write `docs/DATA_SAFETY.md` |
| 0.3 | **Privacy policy** | Mandatory URL. Must cover children's data (this app stores child names, ages, photos — this triggers **Families/COPPA scrutiny**, see 0.4). | host via termly.io or GitHub Pages |
| 0.4 | **Target audience & children policy** | Because children are users, Google may require the **Designed for Families** program OR you declare target audience 13+ with parents managing child profiles (children don't have their own Google accounts in-app — child *profiles* are parent-managed). **Recommended:** declare adults/parents as the audience; child profiles are data subjects, not account holders. This avoids Families program restrictions (which ban most ad SDKs and complicate IAP). Verify child members never authenticate with their own email — if they do, this analysis changes. | check `app/auth/*`, `lib/firebase.ts` `createMember` |
| 0.5 | **Remove unused permissions** | `READ/WRITE_EXTERNAL_STORAGE` are legacy (photo picker doesn't need them on API 33+) and `SCHEDULE_EXACT_ALARM` triggers a Play policy declaration. Strip any permission not demonstrably used; each extra permission slows review and hurts trust. | `app.json` android.permissions |
| 0.6 | **Lock Firestore + Storage rules** | Verify Storage rules restrict `member-photos/{familyId}/**` to that family's members only; verify no collection is world-readable. Add a rules unit test file (Firebase emulator, `@firebase/rules-unit-testing`). | `firebase/firestore.rules`, `firebase/storage.rules` |
| 0.7 | **Crash reporting** | Add `@react-native-firebase/crashlytics`. You cannot run a "big win" launch blind. Wire an ErrorBoundary at root that logs to Crashlytics and shows a friendly recovery screen. | `app/_layout.tsx`, new `components/ErrorBoundary.tsx` |
| 0.8 | **App versioning discipline** | Set `versionCode` auto-increment scheme and `version` in `app.json`. Every uploaded AAB needs a higher versionCode. | `app.json` |
| 0.9 | **Account deletion flow** | Play policy requires in-app account deletion + a web deletion request URL if the app has accounts. Add "Delete my account" in Settings that deletes auth user + user doc + member doc (and orphaned family if last admin). | `app/app/tabs/settings.tsx`, `lib/firebase.ts` |

**Phase 0 exit gate:** all 9 items done, `tsc` clean, rules tests pass, release AAB builds.

---

## Phase 1 — Stability, Performance, Security (make it *feel* enterprise)

Priority: **P1.** Do before any visual polish — polish on a slow app is lipstick.

### 1A. Performance
| # | Item | Detail | Files |
|---|------|--------|-------|
| 1.1 | **Cold-start lag (known issue)** | Profile startup: likely causes are Firestore offline persistence init, font loading blocking splash, and auth listener → `getUserFamilyAndMember` doing serial reads. Fix: keep splash visible until fonts + auth resolve (`expo-splash-screen` `preventAutoHideAsync`), parallelize the user/family/member reads (`Promise.all`), and cache last-known family/member in Zustand-persisted store so the home screen renders instantly from cache while Firestore revalidates. | `app/_layout.tsx`, `lib/firebase.ts`, `store/index.ts` |
| 1.2 | **Listener audit** | Every `onSnapshot` must be unsubscribed on unmount/family-switch. Grep all `onSnapshot` usages; wrap in hooks with cleanup. Duplicate listeners = battery drain + read costs. | `lib/firebase.ts`, all tab screens |
| 1.3 | **List virtualization** | Home task list, history transaction log, leaderboard: ensure `FlatList` (not `.map` in ScrollView), with `keyExtractor`, `getItemLayout` where rows are fixed-height. | `app/app/tabs/*.tsx` |
| 1.4 | **Memoize heavy renders** | `React.memo` on task cards / leaderboard rows; `useCallback` for handlers passed to lists. Reanimated animations must not re-mount on every snapshot tick. | `components/ui/*` |
| 1.5 | **Image handling** | Compress photos before upload (resize to ≤512px via `expo-image-manipulator`) — current uploads send full-resolution camera images (slow + Storage cost). Cache avatars (`expo-image` with caching, replacing `Image`). | `lib/firebase.ts` `uploadMemberPhoto`, `app/app/member/[id].tsx` |
| 1.6 | **Hermes + Proguard/R8** | Confirm Hermes enabled; enable R8 shrinking for release (smaller APK, faster start). Check `android/gradle.properties` after prebuild. | android config |
| 1.7 | **Log cleanup** | Repo root has 15+ `build-*.log`, `picker-live*.log`, `google-services_old.json`, `build_backup/`. Delete or move out of repo; add proper `.gitignore`. `google-services_old.json` may contain a stale API key — remove it. | repo root |

### 1B. Security & data integrity
| # | Item | Detail |
|---|------|--------|
| 1.8 | **Server-side point integrity** | Currently the client writes completions/transactions directly — a technical child could grant themselves points with a modified client. Move point awards to a Cloud Function (`onCompletionCreated` computes `pointsAwarded` from the task doc, rejects duplicates for the same task+member+day) and tighten rules so clients cannot write `pointsAwarded` or arbitrary `transactions` with `source: 'task'`. This is the single biggest integrity hole. |
| 1.9 | **Invite code hardening** | 6-char codes are guessable at scale. Add: rate limiting (Cloud Function callable for join), code expiry/regeneration, and cap family size. |
| 1.10 | **App Check** | Enable Firebase App Check (Play Integrity) so only your signed app can hit Firestore/Storage. Cheap and eliminates whole classes of abuse. |
| 1.11 | **Firestore cost guardrails** | Set budget alert on Firebase project. Audit for unbounded queries (e.g., full transaction history) — add `.limit()` + pagination. |

**Phase 1 exit gate:** cold start < 2.5s on the test device, zero listener leaks (verify via Firestore usage console during a 5-min session), point-award path server-authoritative, App Check enforced.

---

## Phase 2 — Brand, UI, and "all regions, all generations" appeal

Priority: **P1/P2.** The user's own diagnosis is correct: the brand is invisible outside the profile screen and transitions are default-quality.

### 2A. Brand system
| # | Item | Detail |
|---|------|--------|
| 2.1 | **Brand presence** | Add a compact wordmark/logo lockup in the home header ("Lootboard" + treasure-chest glyph), branded splash → home transition (logo morphs into header), and branded empty states (mascot + copy). Brand should appear on: splash, home header, empty states, weekly-winner celebration, share cards. |
| 2.2 | **Design tokens, not ad-hoc styles** | Audit screens for hardcoded colors/spacing that bypass `constants/theme.ts`. Everything routes through tokens so dark/child modes are consistent. Add semantic tokens (`surface-elevated`, `text-secondary`, `border-subtle`) rather than raw hex reuse. |
| 2.3 | **Motion language** | Define 3 durations (150/250/400ms) + one spring config, used everywhere. Add: shared-element-feel tab transitions (fade+slide 250ms), press-scale on all touchables (0.97 spring), list item entrance stagger (40ms), skeleton shimmer while Firestore loads (never blank screens, never spinner-only). Reanimated v3 is already in the stack — this is wiring, not new deps. |
| 2.4 | **Iconography** | Replace mixed emoji/vector usage with one icon set (Phosphor or Lucide via react-native-svg) at 2 weights (regular for idle, fill for active tab). Keep emoji only where they're content (avatars, task emoji) not chrome. |
| 2.5 | **Celebration quality** | The weekly win + task completion moments are the product's emotional core. Upgrade confetti to physics-based bursts, add haptics (`expo-haptics` already installed) on completion/win, and a full-screen weekly winner takeover on Monday first-open. |

### 2B. All-generations / all-regions
| # | Item | Detail |
|---|------|--------|
| 2.6 | **i18n foundation** | `constants/strings.ts` is already centralized — wire it to `i18n-js` + `expo-localization`, extract remaining hardcoded strings, ship English first but with the pipeline ready. Priority locales for family apps: Spanish, Hindi, Portuguese, German, French, Arabic (RTL — verify layouts flip). |
| 2.7 | **Age-appropriate density** | You already have Child Mode. Add the other end: a "Simple" toggle for grandparents — larger fonts, higher contrast, fewer animations. Respect system font scaling (`allowFontScaling`, test at 1.5×) and `prefers-reduced-motion`. |
| 2.8 | **Cultural neutrality audit** | Week start day is already configurable (good — many regions start Monday or Saturday). Verify: date formats via `date-fns` locale, no US-centric copy ("chores" reads fine; avoid idioms in strings.ts), reward examples in onboarding are culture-neutral (screen time, treat, outing — not "$5"). Points, not currency, as the universal unit is already right. |
| 2.9 | **Accessibility pass** | `accessibilityLabel` on all touchables, 44×44 minimum hit targets, contrast check on `#6C63FF`-on-white text (fails WCAG AA at small sizes — use it for fills, not small text), TalkBack walkthrough of the complete-task flow. |

**Phase 2 exit gate:** motion spec applied to all 5 tabs, brand visible on 5 surfaces, TalkBack can complete a task end-to-end, screens verified at 1.5× font scale.

---

## Phase 3 — Monetization (paywall design)

Priority: **P2 — after retention basics, before scale marketing.**

**Model recommendation: freemium subscription ("Lootboard Plus"), family-level, via Google Play Billing (`react-native-iap` or RevenueCat — RevenueCat recommended: receipt validation, cross-platform later, free tier generous).** No ads — ads in a family/kids-adjacent app poison trust and complicate policy (see 0.4).

### Free tier (must stay genuinely useful — the free product is the marketing)
- 1 family, up to 4 members
- Unlimited tasks, completions, leaderboard, weekly winner
- 3 active rewards
- 2 weeks of history

### Lootboard Plus (~$3.99/mo or $24.99/yr, one sub covers the whole family)
| Feature | Why it converts |
|---|---|
| Unlimited members (5+) | Bigger families are the highest-engagement users — natural upgrade moment at "add 5th member" |
| Full history + trends/insights ("Alex completes 40% more on school days") | Parents pay for insight into their kids |
| Custom rewards unlimited + reward images | Personalization |
| Streak insurance (1 freeze/week) | Loss-aversion, proven by Duolingo |
| Multiple parents' co-admin + approval routing | Two-parent households |
| Custom point values, penalty rules, weekly goals per child | Power-parent controls |
| Premium themes + app icons, exclusive avatars/mascots | Kids nag parents for these — gentle, ethical pester-power |
| Photo proof on task completion (child attaches photo, parent verifies) | Trust feature, high perceived value |

### Paywall placement (where, exactly)
1. **Add-5th-member moment** — contextual sheet, not a wall.
2. **History tab beyond 2 weeks** — blurred preview of the locked chart ("see 6-week trends").
3. **4th reward creation.**
4. **Post-weekly-win celebration** — one soft upsell card after the confetti ("Keep the streak safe with Plus"), max once/week.
5. **Settings → "Lootboard Plus" row** — always discoverable, never nagging.
- **Never** paywall: completing tasks, seeing the leaderboard, core loop. **Never** show a paywall to a child-mode profile — route "ask a parent" instead (policy + ethics).
- Launch pricing: 7-day free trial, annual pre-selected, regional pricing enabled in Play Console.

**Implementation notes for the executing model:** entitlement flag lives on the family doc (`plan: 'free' | 'plus'`, `planExpiresAt`), validated server-side by a RevenueCat webhook → Cloud Function; client rules never trust a client-written plan field.

---

## Phase 4 — Product gaps & edge cases

### 4A. Missing things (strategic)
| # | Gap | Why it matters |
|---|-----|----------------|
| 4.1 | **Retention loop beyond the week** | The week resets Sunday — but what accumulates? Add lifetime XP/levels per member and family "seasons" (monthly themes) so long-term progress exists. Weekly-only competition goes stale in ~6 weeks. |
| 4.2 | **The losing-child problem** | If the same child wins every week, siblings disengage (this kills family apps). Add handicapping options: personal-best mode, "most improved" award, per-child weekly goals where beating *your own goal* also earns a crown. This is the single most important product-design fix. |
| 4.3 | **Task verification** | Nothing stops a child tapping "done" without doing it. Parent-approval-required flag per task (like reward redemptions) — arguably core, not premium. |
| 4.4 | **Offline behavior** | Firestore offline persistence gives you caching, but define UX: completing a task offline must show optimistically and sync; auto-fail must not double-fire after reconnect. |
| 4.5 | **Family lifecycle** | No flows for: member leaves, child grows up (role promotion), family deletion, admin transfer, duplicate join. Each needs a defined path or support tickets will eat you. |
| 4.6 | **Empty first week** | New family with no tasks = dead app. Ship task template packs at onboarding ("Ages 5–8 starter pack", "Teen pack", "Whole family pack") — biggest activation lever available. |

### 4B. Edge cases to explicitly handle & test
1. **Timezones:** Family members in different timezones — whose midnight is auto-fail? Store family timezone on the family doc; all week boundaries and autoFailHour computed against it, not device time. Weekly reset Cloud Function currently runs Monday 00:01 **UTC** — that's Sunday afternoon in the Americas. Must be per-family-timezone (run hourly, reset families whose local time just passed the boundary).
2. **DST transitions:** week boundary during DST shift → a 167- or 169-hour week; ensure weekId computation and streaks don't skip/double.
3. **Clock tampering:** child sets device clock back to complete before autoFail — server timestamps (`FieldValue.serverTimestamp()`) must be authoritative everywhere, never `new Date()` written from client.
4. **Concurrent completion:** two devices complete the same task simultaneously → transaction/idempotency key (`taskId_memberId_date`) as the completion doc ID.
5. **Tie at week end:** two members with equal points — define the rule (shared win recommended; test the podium renders it).
6. **Zero-activity week:** nobody scores → weekly reset must not crash ranking an empty/all-zero array; "no winner this week" state.
7. **Points going negative:** discipline deductions below zero — decide floor-at-zero or allow negative; render both.
8. **Member deleted mid-week:** completions/transactions referencing a deleted memberId — leaderboard and history must not crash on orphaned refs.
9. **Auto-fail during app kill / battery-optimized device:** background fetch may not run for days — the *Cloud Function* must be the authoritative auto-failer; the on-device task is only a fast path. (Currently device-only = silently broken on most Android 12+ phones.)
10. **Week-boundary race:** completing a task at 23:59:58 Sunday — which week gets the points? Server timestamp decides; test it.
11. **Invite code collision** after many families (6 chars = fine for now, but generate-check-retry loop must exist).
12. **Emoji avatars on old Android:** newer emoji render as tofu (☒) on Android 8–10 devices — ship a fixed avatar set or bundle a fallback.
13. **Very long names / RTL names / emoji-only names:** truncation + layout tests.
14. **Multi-device same account:** parent on phone + tablet — listener consistency, no duplicate notifications (dedupe FCM by memberId not token; clean stale tokens on `messaging/registration-token-not-registered`).
15. **Storage photo orphaning:** member deleted → photo remains in Storage forever; add cleanup in the delete path.
16. **Firestore rules recursion cost:** `isParent()` does 2 document `get()`s per rule evaluation → 2 extra billed reads per operation and latency; consider custom auth claims (`familyId`, `role` as claims set by Cloud Function) — faster rules, cheaper, and simpler.

---

## Phase 5 — Naming & Marketing

### Name assessment
"**Lootboard**" — memorable, ownable, gamer-energy. Risks: "loot" has loot-box/gambling connotations (matters for a *family/kids* app and for Play Store reviewers scanning keywords); means nothing about chores/family; hard to localize. Alternatives if reconsidering (check trademark + domain + Play search collision before committing):

| Name | Angle |
|---|---|
| **Choreboard** | descriptive + board metaphor, SEO-friendly |
| **FamScore** | family + points, global-pronounceable |
| **Taskle** | playful, short |
| **HomeLeague** | competition framing, all ages |
| **Winsday** | the weekly-win moment as the brand |

**Recommendation:** keep Lootboard if attached to it, but position the *tagline* to do the explaining: **"Lootboard — chores in, champions out"** or **"The family game where chores score points."** Tagline appears in Play short description (80 chars, keyword-loaded: *chore chart, family tasks, kids rewards, chore app*).

### Marketing plan (zero → early traction)
1. **ASO first:** title "Lootboard: Family Chore Game", short + full description written around search terms (*chore chart for kids, family chore app, reward chart, screen time rewards*), 8 screenshots as a story (problem → leaderboard → celebration → parent controls), 30-sec video of the win moment.
2. **The shareable artifact:** auto-generated "Weekly Winner" card (family name, crown, podium — placeholder avatars) with a share button → this is the organic loop. Build it; it's the growth feature.
3. **Channels ranked for this product:** (a) parenting subreddits + Facebook groups (authentic founder posts, not ads), (b) short-form video — the confetti win moment + "my kids fight to do dishes now" hook is natively TikTok/Reels material, (c) parenting micro-influencers (5–50k, gifted Plus), (d) Product Hunt for a spike, (e) school/PTA newsletters (untapped, cheap).
4. **Launch sequencing:** Internal testing (family) → closed track (20 testers, 14 days — required by Play for new personal dev accounts) → open testing → production with staged rollout 10%→50%→100% watching Crashlytics vitals.
5. **Positioning against incumbents** (OurHome, S'moresUp, BusyKid): they are chore *management*; Lootboard is a chore *game*. Lead every asset with competition + celebration, not checklists.

---

## Phase 6 — Best-in-class testing (pre-rollout gate)

Layered pyramid; all suites must pass before any production rollout.

### 6.1 Unit (Jest — infra exists, thresholds in package.json)
- `pointsEngine`: week ID math (year boundary, W01/W53, DST), streak calc (gap days, timezone), leaderboard ranking (ties, zeros, orphaned members), difficulty→points map.
- Raise global coverage threshold to 60% branches as code stabilizes.

### 6.2 Firestore rules tests (`@firebase/rules-unit-testing` + emulator) — **currently missing, highest-value gap**
- Cross-family read denied; child cannot create tasks/log discipline/approve redemptions; client cannot write `weeklyScores`; client cannot forge `transactions` with arbitrary delta; unauthenticated denied everywhere.

### 6.3 Cloud Functions tests (emulator)
- weeklyReset: normal week, tie, empty family, all-zero week, per-timezone boundary.
- streak bonus: 7/14/30-day awards fire once and only once (idempotency).
- auto-fail: fires after hour, not before; no double-deduction on retry.

### 6.4 Integration (React Native Testing Library)
- Auth flows: register → onboarding → create family; join via invite code (valid/invalid/expired); Google Sign-In cancel path.
- Core loop: complete task → optimistic UI → points reflect → leaderboard reorders.
- Redemption: request → parent approval → deduction; rejection → no deduction.

### 6.5 E2E on device (Maestro — recommended over Detox for Expo; YAML flows, runs on the release APK)
- Golden path: install → register → create family → add member → create task → complete → see confetti → check leaderboard → redeem reward → approve.
- Offline: airplane mode → complete task → reconnect → verify sync, no dupes.
- Kill/restore: complete task → force-stop → reopen → state correct.
- Both dark mode and child mode variants of golden path.

### 6.6 Non-functional
- **Performance budget:** cold start < 2.5s mid-range device (e.g., Pixel 6a class), tab switch < 300ms, task-complete-to-confetti < 150ms.
- **Crash-free target:** > 99.5% sessions before 100% rollout (Crashlytics + Android Vitals).
- **Accessibility:** TalkBack golden path; 1.5× font scale on all 5 tabs; contrast audit.
- **Devices matrix:** minimum — one Android 10, one Android 13+, one small screen (5"), one tablet-ish; test emoji rendering (edge case 12).
- **Monkey test:** `adb shell monkey -p <package> 50000` with zero crashes.
- **Security checks:** APK decompile scan for secrets (google-services.json API keys are OK by design, but no keystore data, no test creds), App Check enforced, rules tests green.

### 6.7 Release checklist (every release)
`tsc --noEmit` clean → `eslint` clean → unit + rules + functions tests green → Maestro golden path on release APK → versionCode bumped → CHANGELOG.md entry → staged rollout.

---

## Priority summary (what to hand Opus, in order)

1. **Phase 0** (ship blockers) — 1 session
2. **Phase 1** (perf + integrity: items 1.1, 1.8, 1.5, edge cases 1, 3, 9 are the big five) — 2–3 sessions
3. **Phase 6.2 + 6.3** (rules & functions tests) — alongside Phase 1
4. **Phase 4.2, 4.3, 4.6** (losing-child fix, verification, template packs) — 1–2 sessions
5. **Phase 2** (brand + motion) — 1–2 sessions
6. **Phase 3** (paywall) — 1–2 sessions
7. **Phase 5** (store listing + marketing assets) — 1 session
8. **Phase 6 full pass** → staged rollout

---

*Created 2026-07-08. Companion file: `docs/PROGRESS.md` (session-to-session state — update it at the end of every working session).*
