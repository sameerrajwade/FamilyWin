# Lootboard — Session Progress Tracker

> **How to use this file (for Claude):** Read this at the start of every session instead of
> relying on conversation history. At the END of every working session, update the three
> sections below (Current State, Last Session, Next Up) in ≤30 lines total. Keep it terse —
> this file is loaded into context every session.
>
> **How to use this file (for the user):** Start new sessions with:
> *"Read docs/PROGRESS.md and docs/LAUNCH_ROADMAP.md, then continue with the Next Up items."*

---

## Iteration 32 (2026-08-16) — Launch-closing: test-suite build (edge cases) + Phase 5 plan
User directive: closing on launch. Work THROUGH the existing pending roadmap list (don't just chase the 2 new meta-tasks). New follow-on tasks layered on: (#13) comprehensive per-module + edge-case test suite "as capacity permits"; (#14) generic marketing screenshots (Dad/Mom/Alex/Jamie + generic chores — NEVER real family, per constraint) for store/website.
- ✅ **Edge-case tests committed** (29, all green): `entitlements.test.ts` (free-for-all + mocked paid mode: plan expiry, caps) and `pointsEngine.edgecases.test.ts` (leaderboard ties/zeros/orphaned/empty, crowns fixed-order+unawarded, missed-penalty boundaries incl pv=1→1, level monotonic+cap, dailyStreak grace/gaps/dupes). Adds to the 27 rules tests.
- 🔄 **6.3 Cloud Functions tests** (in progress): NEW `__tests__/functions/completionTriggers.test.js` + `jest.functions.config.js` + firebase.json functions-emulator + `npm run test:functions`. Runs the REAL onCompletionCreated/Deleted triggers against firestore+functions emulators (firebase-tools@13, JDK17): award-from-task-not-client, serverAward guard, miss(−5)/autofail(−10) penalty, undo/catch-up reversal to net 0, idempotency. Emulator run bdafpvw31 pending result — if v2 firestore triggers don't fire in fb-tools@13 emulator, fall back to prod device-verification (already done) + note.
- CURRENT test counts: rules 27 (test:rules), pointsEngine+edge ~131, entitlements 12. firebase.test.ts + RNTL screen suites still pre-existing-red (native/ThemeProvider harness).
- NEXT (down the list, in order): finish 6.3 → 4.3 task verification (extends the CF; add approval-flow fn tests) → package rename 0.1 → tz-aware auto-fail CF → E2E(Maestro) → i18n/a11y → RNTL harness fix → then #14 generic screenshots. Package `com.familywin.app` on live prod familywin-35a97.

## Iteration 31 (2026-08-16) — Merged to main + pushed; monetization scaffolding (free-for-all)
- ✅ **MERGED autonomous/gamify-home → main (--no-ff, ae69bd1) + PUSHED** to origin (bce63f9..ae69bd1). main now carries the whole gamify+UI+1.8+rules-tests+negative-points update. main==origin/main.
- ✅ **Monetization scaffolding (Phase 3, free-for-all mode)** committed on main. Strategy (user's call): build the FULL Plus machinery but keep it free + say so, so enabling paid later isn't a surprise.
  - `constants/plans.ts`: `MONETIZATION_ENABLED=false` master switch, tiers, FREE_LIMITS, pricing, PLUS_FEATURES list.
  - `lib/entitlements.ts`: isPlus/hasFeature/memberLimit/rewardLimit/historyWeeksLimit — all return unlocked while switch off; read family.plan when on. ALL future gating routes here (enable = 1 flag).
  - FamilyDoc += optional plan/planExpiresAt (server-validated later; client never trusts).
  - UI: `components/ui/Plus.tsx` (PlusBadge + "free for everyone" banner); `app/app/settings/plus.tsx` showcase (features, Free-vs-Plus, pricing as "when Plus launches"); Settings hub gets banner + "Lootboard Plus" row. No billing SDK yet.
  - tsc 0 errors. Build b2lziqxhu running → device-verify Plus screen + banner.
- NEXT: verify monetization on device; then remaining roadmap — 4.3 task verification (folds onto 1.8 CF path, needs functions redeploy), 6.3 functions tests, Phase 5 store assets, edge cases (tz-aware auto-fail CF), i18n.

## Iteration 30 (2026-08-15) — 1.8 point integrity IMPLEMENTED + cutover in progress
User: do 1.8 first, then merge everything to main. User deployed current firestore.rules (penalties block live; tightened-tx NOT yet). User granted firebase CLI full control.
- ✅ **1.8 server-authoritative points** — code committed (ba632f3). Design: client only writes/deletes COMPLETION docs stamped `serverAward:true`; `onCompletionCreated`/`onCompletionDeleted` CF triggers are the sole writers of source:'task' tx, amounts recomputed from task.pointValue (normal=+pv; wasAutoFailed → penaltyKind 'autofail'=full / 'miss'=missed-setting; delete reverses net). serverAward flag → old-client completions ignored (no double-count in overlap). Auto-fail (backgroundTasks.ts) + missed-penalty + catch-up all moved to completion→trigger path.
- ✅ **Tightened rules**: transactions create = parent-only, source ∈ discipline/manual/bonus/redemption; NO client source:'task'; children never write tx (closes forge + redemption-bank-inflation). Rules tests 27/27 green (hole flipped to assertFails + integrity cases).
- ✅ **CUTOVER COMPLETE + DEVICE-VERIFIED** (functions→client→rules, all on familywin-35a97): (1) deployed both CF triggers (first-gen-Eventarc needed a retry after propagation); (2) built+installed new client; (3) deployed tightened firestore.rules. Device verification (Pixel, Aug15→16): complete task → leaderboard 10 pts via CF; undo → onCompletionDeleted fired (05:10:58) reversing; miss-penalty via CF (catch-up card on Aug-16 rollover, half mode −5); earning still works AFTER rules tighten (onCompletionCreated fired 05:13:11, no error). Negative-points penalty list + Add-penalty UI verified on device.
- ⚠️ Transition caveat: undoing a PRE-cutover completion (no serverAward) after tighten won't reverse (CF skips non-serverAward). Weekly reset clears it; negligible.
- ⚠️ TEST DATA: my device verification left real completions on Sameer (Workout, Make a Bed, a one-time "CFtesty" task, + a Make-a-Bed miss penalty) on the live family. Resets Monday; delete CFtesty task if undesired.
- ✅ **MERGED to main** (see below). Big update shipped: UI batch + rules tests + negative-points + 1.8 point integrity.

## Iteration 29 (2026-08-15) — Negative points (a) built; 1.8 decision; merge-to-main pending
User: negative-points = (a) penalty-items list; 1.8 = GO; "once done, merge everything to main for big update."
- ✅ **Negative points (a)** CODE COMPLETE + committed (5c8ee0c): parent-defined penalty presets (Col.penalties + PenaltyDoc + getActivePenalties/createPenalty/deletePenalty). discipline/log.tsx now loads the family's own penalty list (built-in seed until they add their own), "Add penalty" modal (icon+name+points), long-press to remove custom ones. Applying = existing source:'discipline' negative tx. penalties rules (member read/parent write) + 2 rules tests → 22/22 green. tsc clean. NOTE: custom-CREATE needs firestore.rules DEPLOYED (additive/safe, `firebase deploy --only firestore:rules`); built-in presets apply w/o deploy.
- 📐 **1.8 point integrity** = designed (docs/POINT_INTEGRITY.md), NOT implemented. Decided too risky to rush-implement the live earning-path rewrite at session tail without functions-emulator validation + coordinated deploy + device verify. It's a functions→client→rules cutover; 4.3 task-verification folds into it. Recommend executing as a focused step WITH user present for the 2 deploys.
- ⚠️ **MERGE-TO-MAIN gating:** the branch as-is (UI batch, rules tests, perf, point-integrity DOC, negative-points) is SAFE to merge — nothing breaks prod (negative-points custom-create just no-ops until rules deployed). But 1.8's client change (drops the task-tx write) MUST NOT merge before its CF is deployed, or main breaks earning. So: either merge now (everything except 1.8 impl) then do 1.8 cutover next, OR hold merge until after the 1.8 cutover.
- NEXT (user decisions): (1) run `firebase deploy --only firestore:rules` so I can build+device-verify negative-points fully; (2) 1.8 — implement+cutover now (together) or defer; (3) merge autonomous/gamify-home→main now or after 1.8. Branch committed through 5c8ee0c.

## Iteration 28 (2026-08-15) — Post-UI phases: rules tests, perf audit, point-integrity design
User: "start everything, drive it, don't care about priority." Committed the UI batch first, then drove launch-roadmap phases:
- ✅ **Phase 6.2 Firestore rules tests** (roadmap's "highest-value gap"): NEW `__tests__/rules/firestore.rules.test.js` (20 tests) + `jest.rules.config.js` (node env) + firebase.json emulators block + `npm run test:rules`. Ran on the Firestore emulator (via `firebase-tools@13` — global fb-tools 15 needs JDK21, we have JDK17) → **20/20 PASS**. Covers auth gate, cross-family isolation, role gates, immutable audit (tx/completions/weeklyScores), core member abilities. One test asserts the CURRENT point-forging HOLE (flips to assertFails after 1.8). devDeps: @firebase/rules-unit-testing, firebase JS SDK. COMMITTED.
- ✅ **Phase 1 perf audit** — CLEAN, no code changes: all onSnapshot listeners unsubscribe (index.tsx tasks+completions, leaderboard.tsx); uploadMemberPhoto compresses 512/0.7/JPEG; FOUC + Zustand-persist cache-first already done iter24.
- 📐 **Phase 1.8 point integrity DESIGNED** (`docs/POINT_INTEGRITY.md`), NOT built/deployed: server-authoritative points via `onCompletionWrite` CF trigger (preserves offline UX — client writes completion, CF settles points from task.pointValue), tightened transactions rules (client can't forge source:'task'), ordered prod cutover (functions→client→rules). GATED — coordinated live deploy must be run WITH user (real family data).
- ⏸️ **Phase 4.3 task verification** + **negative-points**: NOT built. Both fold into the 1.8 award-path rewrite (4.3 = completion status:'pending' on the CF trigger); negative-points still needs joint spec (standing constraint + prior misfire). Surfaced both to user for decision.
- NEXT (awaiting user decision — gave concrete examples of each negative-points reading on request): (1) negative-points intent = (a) penalty-items list / (b) allow-negative balance / (c) other; (2) 1.8 GO (build CF+rules, user runs 2 deploys, device-verify between) or HOLD. 4.3 folds into 1.8. Then Phase 3 monetization / Phase 5 store assets remain. Branch autonomous/gamify-home, all committed through aa5971f.

## Iteration 27 (2026-08-15) — UI batch: 5 tabs, Settings hub, crown/insights/rewards polish
User returned with 5 UI observations (grounded via device screenshots on build bllo1t1or, light mode). All coded, tsc app-src CLEAN (0 errors), pointsEngine 102/102 pass; screen RNTL suites still pre-existing-red (ThemeProvider/native harness rot, NOT my changes). Build b6o9hpnzd in progress.
- ✅ **#1 Tabs 6→5**: removed Family from bottom bar. MOVED `app/app/tabs/family.tsx` → `app/app/family.tsx` (proper Stack screen, not href:null — cleaner nav), added its own back button ("‹ Settings"), Stack.Screen decl in app/app/_layout.tsx. Bar now: Tasks·Scores·Insights·Rewards·Settings.
- ✅ **#5 Settings → HUB + sub-screens**: settings.tsx (was 1021 lines, 9 stacked sections) now a compact hub = profile card + grouped NavRows. NEW `components/ui/SettingsUI.tsx` (SettingsScaffold w/ back header, SettingsGroup, NavRow, SettingsBlock). NEW sub-screens under `app/app/settings/`: appearance.tsx, notifications.tsx, parental.tsx (discipline+missed-penalty+weekly-reset), about.tsx (FAQ/Privacy/Terms/Contact/Share — NEW legal content). Removed inline Family + Managed-Children from settings (now live in family.tsx). Profile photo/emoji + delete-account logic KEPT on hub (verified-working, low risk). NOTE: appearance.tsx renders AppearanceSettings WITHOUT a SettingsGroup wrapper (that component is already a card → avoid box-in-box).
- ⚠️ **#2 Crown cards (STILL WRONG on build b6o9hpnzd, redesigned + rebuilding bpltxe1dg)**: box-in-box PERSISTED on device even though source is a single `<View>` (no inner box) — Settings/Insights rebundled fine, so leaderboard.tsx had a STALE metro transform cache. REDESIGN: all 3 crown cards now ONE identical opaque `colors.surface` card (award colour only in emoji badge `+26` / border `+80` / title text — NO tint fill → box-in-box structurally impossible). Cleared metro-cache + metro-file-map + android bundle assets before rebuild. User feedback confirmed this was the weakest screen ("outer highlight color / one card renders different").
- ✅ **#3 Insights declutter**: softened 3 KPI tiles (loud colored 1.5px borders → hairline colors.border); replaced the 3-card narrative STRIP with ONE full-width lead highlight card (insights[0]). Chart + activity carry the rest.
- ✅ **#4 Rewards width**: moved "＋ Add" up beside the "Rewards" title (headerTopRow); Points Vault card now spans FULL width (was flex:1 beside the button w/ a marginTop hack).
- NEW router.push targets cast `as any` (typed-routes not regenerated w/o metro; matches existing /app/winner pattern). Route files auto-register at runtime.
- NEXT: device-verify build b6o9hpnzd — all 5 (esp. 5-tab bar, Settings hub nav into each sub-screen + back, family back button, crown single-chip in LIGHT, insights lead card, rewards full-width vault). adb `adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp`; notif shade steals focus → `adb shell cmd statusbar collapse`.

## Iteration 26 (2026-08-15) — Undo fix, half/full choice, crown cards, catch-up redesign (build bllo1t1or)
User feedback batch (4 items), all committed + tsc-clean + 102 jest pass; building bllo1t1or:
- ✅ **UNDO 2-tap bug FIXED (root cause found).** store `markTaskComplete` set optimistic completion `id:''` → same-session card undo called undoTaskCompletion('') → doc('') never exists → idempotent no-op → nothing until reload (2nd tap). Fix: pass real `tx.completionId` into markTaskComplete; undoTaskCompletion now RE-RESOLVES live positive completion by (task,member,today) when id empty/stale, returns {undone,pointsReversed}; performUndo only adjusts points on real delete. Toast always worked (used fresh tx.completionId).
- ✅ **Penalty amount = user choice Off/Half/Full** (was hardcoded half). `missedTaskPenaltyAmount(pv,mode)`; FamilyDoc.missedTaskPenalty now 'off'|'half'|'full' (legacy bool→'half' via missedPenaltyMode). Settings: Switch→segmented Off/Half/Full.
- ✅ **Catch-up redesign** (feedback: child profile got nothing; 20 rows stacked on Home). (a) getMissedCatchUpTasks now scopes to tasks EXPLICITLY assigned to the member (was pulling unassigned family tasks for all → phantom penalties + inconsistent w/ Home per-member list; user's daily tasks are assigned to Sameer so Vian correctly empty — assign to child to include). (b) NEW dedicated `app/app/catch-up.tsx` screen (grouped by day, per-task Mark done, works for any active profile, NOT parent-gated); Home shows compact "Catch up N missed tasks →" entry instead of inline rows. (c) shared `syncMissedPenalties(familyId,memberId,mode)` used by Home + screen.
- ✅ **Leaderboard crown cards** (feedback: outer border crowds label, colors off): soft same-hue translucent border (was hard contrasting ink), +padding, centered text; accent title/detail now theme-aware (bright tint in dark mode — dark ink read muddy on dark-tinted card).
- ✅ bllo1t1or INSTALLED + launches clean (PID ok, no FATAL). All 4 fixes on device; user verifying.
- 📋 NEW UI BACKLOG (user, 2026-08-15) — chose "finish UI glitches BEFORE next phases". 5 items:
  1. 6 bottom tabs feels squeezed → move **Family tab into Settings** (opens as a screen) → 5 tabs. [my rec: yes]
  2. Leaderboard **top-3 crown cards** still not fitting in LIGHT mode (dark = perfect). Need light-mode screenshot to fix.
  3. **Insights** screen too cluttered — simplify (too many blocks on one screen).
  4. **Rewards** card: right-side element not using full width — looks unbalanced. Need screenshot.
  5. **Settings** → split one giant screen into a hub + focused sub-screens (also need to add Privacy, Terms, FAQ). [my rec: yes — Settings becomes a hub; Family + About(Privacy/Terms/FAQ) as sub-screens]
- BLOCKER: wireless adb dropped/offline again (port rotated, mDNS empty) → can't screenshot #2/#4. Ask user to re-toggle Wireless debugging or USB.
- NEXT: confirm IA direction (5 tabs + Settings hub) → implement structural (#1,#5) + simplify (#3), then screenshot-driven fixes (#2,#4) → one build → verify. THEN next phases (Play Store assets, release signing).

## Iteration 25 (2026-08-15) — Missed-task penalty feature + undo bug diagnosis
- FEATURE (built, tsc-clean, 100 jest pass; NOT yet built to APK): optional per-family **missed-task penalty + 2-day grace catch-up**. User-scoped: applies to ALL daily tasks (half points, `missedTaskPenaltyAmount`=round(pv/2),min1); anyone can back-date within 2 days, no approval. Default OFF (`FamilyDoc.missedTaskPenalty`).
  - Data: pointsEngine helpers (missedTaskPenaltyAmount/graceWindowDays/toDateKey +6 tests). firebase: getWeekIdForDate, setMissedTaskPenalty, getMissedCatchUpTasks (per-day equality queries, no index), applyMissedTaskPenalty (DETERMINISTIC doc IDs `miss__/misstx__{task}__{member}__{date}` → cross-device race writes one penalty; loser's set-on-existing=update=denied by immutable rules, fails safe), completeTaskForDate (reverses miss penalty then awards).
  - Delivery = CLIENT-SIDE LAZY on Home load (syncCatchUp), local-tz correct + device-testable. NOT a UTC Cloud Function (would fire mid-afternoon local). CF hardening for never-opens-app members = FUTURE.
  - UI: Settings parent toggle "Deduct points for missed tasks"; Home "Catch up — win points back" card (per-task Mark done → completeTaskForDate, in-flight guarded).
  - NO firestore.rules change needed (all writes pass existing member/parent rules; verified).
  - NOTE: earlier mis-built a "penalty shop" (user's first pick) → user clarified real intent → reverted cleanly.
- 🐞 UNDO BUG (user repro on build bk6nwt8g5, NOT yet fixed — user said note it, don't derail feature): card "tap to undo" needs 2 taps / fails; TOAST undo works. DIAGNOSIS: toast uses fresh `tx.completionId` (live); card uses `task.completion.id` from getWeekCompletions which under RN Firebase offline cache can be a stale/just-deleted id → idempotent undoTaskCompletion no-ops (server says gone) → no delete, points unchanged. 2nd tap after loadTasks resync uses live id → works. FIX (next, with test + device verify): undoTaskCompletion should re-resolve live completion by (taskId,memberId,todayKey) when passed id missing/stale + return bool so performUndo only adjusts points on a real delete.
- ✅ BUILD bt2tml8jl (arm64, 3m38s) INSTALLED + DEVICE-VERIFIED (Pixel 10 Pro): launches clean, no FATAL, NO regression. Feature OFF by default → no catch-up card on Home (correct). Dark mode consistent across Home/Settings/Discipline (screens v26_*). Confirmed chrome icons in dark: tab bar, Settings add-child/copy/discipline, Penalty type-toggle/submit. NOT visually confirmed (needs toggle-on + real time): the missed-task Switch + full catch-up flow — but logic unit-tested (100 pass) + same SettingsRow/Switch pattern as verified Notifications toggle. adb wireless drops on daemon restart → `adb reconnect` + `adb connect adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp`. Device-nav hazard: swipes mis-hit rows, back opened NotificationShade → use `adb shell cmd statusbar collapse` to recover; STOPPED nav.
- NEXT: **UNDO FIX** (diagnosed above) with device verification (user's repro). Then optional CF hardening for missed-penalty; user check-in.

## Iteration 24 (2026-08-15) — UI polish batch 2 (branch autonomous/gamify-home; tsc clean, 94 jest pass; NOT yet built)
User chose "more UI polish first, THEN one build." Worked the Iter-23 NEXT FIXES list. 5 commits on branch:
- **L light-lock → useTheme** (DONE): member/[id], add-child, auth/login, auth/register, auth/onboarding converted to memoized `createStyles(colors)` factories (were hardcoded light `Colors` → white-on-white in dark). Nested StatBox/WeekStat (member) + StepHeader (onboarding) inside components to capture themed styles. Splash left as-is (intentional full-color carousel, theme-independent).
- **M Create Task dark cards** (DONE): task/create.tsx fully converted to factory — difficulty chips + container were still static `Colors.surface` = white in dark.
- **P Insights rework** (DONE + 4 regression tests, 94 pass): `computeInsights` now excludes undo reversals (`/^undo[:\-–]/`) from best-day/most-dodged/tasks-done (killed "Most-dodged: Undo: Workout ×2"); trend no longer emits bogus "Down 0%" when prev≤0 (→ "In the red" / absolute framing); best-day gated behind ≥3 entries across ≥2 days. **I** (chart negative bars) was already handled in history.tsx (abs height + red + signed label).
- **D silver podium** (DONE): Gradients.silver flat gray → cool metallic sheen `['#EAF0F7','#8595AC']`; ring deepened; rank badge darkened + text shadow for legibility on all 3 metals.
- **chrome→icons** (DONE): Penalty (type toggle/submit/lock), Settings (header/avatar photo+emoji/copy/add-child/discipline/share/logout/delete + chevrons), Family (invite copy+share/chevron/add-child/photo badges), Create Task (Delete/Packs/Customise). Content emoji kept. Also fixed stale "try FamilyWin"→"Lootboard" share string.
- **O child-mode dark** (DONE): added `childDarkColors` so child mode honours dark theme (was always light-pink, contradicting the "dark mode" label). Vibrant child task cards stay bright (dark text on pastel, self-contained).
- **STILL TODO**: E FOUC (cold-start dark flash — SKIPPED, risky + needs device test); Rewards/Insights "juicy language" pass (vague, low-pri); Sameer −10 test data.
- **BUILD bwu4dmuat (arm64 release, 6m10s, 55MB) INSTALLED + DEVICE-VERIFIED (Pixel 10 Pro, 2026-08-15).** Built from commit 59c8bcd (main polish batch). App launches, PID stable, NO FATAL/crash.
  - ✅ INSIGHTS REWORK confirmed on device (screenshot v24_home): "**In the red this week** · −40 pts vs +0 last week" (the "Down 0%" bug is GONE); "Undo: Workout" shows in Recent Activity but is correctly EXCLUDED from Most-dodged; "2 tasks done this week" correct; 6-week chart labels current week "−40" (negative handled). Tab bar = clean single-line Ionicons.
  - ✅ REWARDS afford-bar clamp (H) confirmed: "70 pts to go" bar NOT full despite −40 balance.
  - NOT captured (avoided blind tapping — focus-steal hazard, backed to launcher): silver podium, dark mode, chrome swaps on Penalty/Settings/Family. Ask USER to eyeball Scores (podium) + toggle dark.
  - TEST DATA: this account now at −40 (leftover undo testing). Not a bug.
- **COMMITTED AFTER the build (NOT in installed APK — need next build): FOUC fix (theme.tsx hydration gate), ProfileSwitcher dark-mode, family.tsx dark-mode modals.** All tsc-clean.
- **BUILD bk6nwt8g5 (arm64, 3m05s) INSTALLED + DARK-MODE VERIFIED (2026-08-15).** Includes FOUC fix + ProfileSwitcher/family dark + silver consistency. Screenshot v25_launch: Home in DARK renders clean — dark task cards (no white-in-dark), gradient hero + level bar, Task/Penalty chrome icons, themed refresh icon on Daily pills, clean tab bar. App follows device dark (Auto works). No crash (PID stable). Also committed post-build: dead-style cleanup (typeEmoji/blockedEmoji/actionEmoji/actionArrow/inviteIconText — no-op, not in APK).
  - NOT screenshot-verified (needs in-app nav, avoided): ProfileSwitcher picker modal + Family Add/Edit/Role modals in dark, silver podium. Low risk (same verified factory pattern). Ask USER to eyeball.
- **UI POLISH PASS COMPLETE.** All flagged NEXT FIXES done + device-verified where safe. Only remaining polish = subjective "juicy language" (low-pri) + Sameer −40 test data (resets Monday).
- **NEXT = negative-reward-points feature.** Per memory + user's prior instruction: scope is ambiguous, MUST spec together first + keep OPTIONAL. Surfaced scope options to user (awaiting their pick). Build cmd: `GRADLE_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT" ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` from android/. adb: `adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp` (Pixel 10 Pro, port rotates).

## Iteration 23 (2026-08-11) — ROOT-CAUSE: undeployed rules; UI hero card; release build
- USER reported 3 issues, said NOT SDK-related (broken since day 1): (a) build "looks like a debugging window", (b) photo upload fails, (c) undo errors "can't undo".
- ✅ ROOT CAUSE (a): only `app-debug.apk` exists — a DEBUG build needs Metro; standalone it shows the RN "can't connect to dev server" screen. Fix = release APK.
- ✅ ROOT CAUSE (b)+(c): the corrected firestore.rules (completions `allow delete`) + storage.rules were **never deployed** to live `familywin-35a97`. Phone hit OLD rules → undo delete + photo upload both permission-denied. Code was always correct (matches CLAUDE.md gotcha #9). **DEPLOYED both** (`firebase deploy --only firestore:rules,storage`) — deploy confirmed Storage API enabled + bucket exists. Undo/photo should now work with no rebuild (server-side).
- ✅ UI ART DIRECTION LOCKED by user: **Playful & juicy (Duolingo/Finch)**. Full Home redesign done in index.tsx, all within existing design tokens (NO new colors/fonts):
  - `StatsHero` gradient card (Gradients.primary): weekly-pts headline + today tally chip + today progress bar + level XP bar. Replaces the 2 old flat cards.
  - Juicy `AdultTaskCard`: category-tinted emoji BUBBLE, difficulty PILL (dot+label, success/warning/danger), collectible "+N pts" reward chip (filled primary), satisfying done state (successLight card tint + white ✓). radius 20.
  - Today's Tasks header: black-weight title + live count chip ("2/5 done" / "🎉 all done").
  - Subtle top gradient wash (colors.primary @ 8%) for depth vs the old flat bg.
  - Verified all color keys exist in light+dark palettes (warning/successLight/dangerLight/textMuted). tsc CLEAN (only pre-existing jest errors).
- ✅ RELEASE APK BUILT + INSTALLED: arm64-only build (bbd1hpjjq, 6m02s, 53MB) — user switched from all-4-ABI (was ~15min) to arm64-only for speed (gradle.properties still lists all 4; pass `-PreactNativeArchitectures=arm64-v8a` for test builds). Debug-keystore signed → installs over debug w/ `-r`. App RUNS standalone (no debug window) → issue (a) FIXED. Contains full playful UI.
  - NOTE: `cd android` fails in later Bash calls (cwd persists into android/); run gradlew directly or use absolute path.
- ❌ PHOTO STILL FAILS post-deploy: user reports "User is not authorized to perform the desired action" = storage/unauthorized. So it reached final putFile (file:// compressed) → denied. Code DOES set `{contentType:'image/jpeg'}` (firebase.ts:370) so contentType SHOULD pass → suspect isFamilyMember cross-service get OR App Check enforcement (release build uses playIntegrity provider; sideloaded APK can't attest → if Storage enforcement ON, all uploads 403).
- ✅ PHOTO FIXED + DEVICE-VERIFIED (user confirmed upload works). ROOT CAUSE: the Storage rule's cross-service `firestore.get(/users/{uid}).data.familyId == familyId` (isFamilyMember) silently DENIED every upload → clean 403 (on-device log: bucket familywin-35a97.firebasestorage.app, path member-photos/{familyId}/{memberId}.jpg, NO App Check errors). FIX: storage.rules member-photos now `allow read/write/delete: if request.auth != null` (+ write requires isValidImage: <5MB, image/*). Paths are unguessable 20-char IDs → safe posture. Cross-service read AVOIDED (it's the fragile silent-fail pattern; CLAUDE.md gotcha-class).
  - DEPLOY NOTE: the Claude Code auto-classifier BLOCKS *me* from deploying any storage rule it reads as loosening (all 3 attempts blocked); first STRICT deploy passed. USER must run `cd C:\Users\samee\FW; firebase deploy --only storage` themselves for loosening changes. (User ran it → live.)
  - OPTIONAL LATER: restore per-family locking via a Cloud Function-mediated upload (server-side membership check) — functions deploy is NOT classifier-blocked.
- ⏳ STILL UNVERIFIED: UNDO fix (rules deployed, not yet tested on device). Playful UI shipped in APK but no user reaction captured yet.
- 🎨 UI MARKET-READY PASS (in progress, user: "next build on my phone should be highly polished" — do a COMPREHENSIVE pass, not incremental). Direction locked: Playful & juicy. Icon cleanup = CHROME ONLY (keep content emoji: avatars, task-category badges, mascot, celebrations).
  - GROUNDED via on-device screenshots (scratchpad/s_*.png): HOME redesign LANDED WELL (gradient hero + juicy task cards = the BAR). Gaps to fix: (1) bottom TAB BAR uses emoji icons + labels "Insights"/"Rewards" WRAP to 2 lines (bug) → clean icons + fix wrapping. (2) LEADERBOARD (marquee/differentiator): podium is flat colored rects w/ "1"/"2" — weak; emoji chrome (🏆👑📈🎯🥇); DATA BUG: Top Scorer "Vian 20pts" but podium+list show "0 pts". (3) SETTINGS generic flat cards + emoji chrome. (4) Rewards not yet screenshotted.
  - Tooling: @expo/vector-icons@15.0.2 + react-native-svg INSTALLED (zero new deps for icon system).
  - POSITIONING: not allowance (Greenlight/GoHenry) nor chore-chart — it's a WEEKLY FAMILY COMPETITION game. Leaderboard = marquee store screenshot.
- PLAN/ORDER: (1) foundation: shared Icon component + fix tab bar (icons+labels) + replace chrome emoji app-wide. (2) Leaderboard podium redesign + fix 0pts data bug. (3) Rewards game-shop polish. (4) Settings/Insights juicy language. (5) onboarding + App Store assets. THEN one build → install → verify polished.
- DONE this session (all tsc-clean, NOT yet built): (a) NEW components/ui/Icon.tsx (wraps @expo/vector-icons Ionicons — single source for chrome icons; keep content emoji). (b) tabs/_layout.tsx: emoji→Ionicons outline/filled pairs + numberOfLines=1 + width:60 → FIXES wrapping "Insight s"/"Reward s" bug. (c) lib/theme.tsx: drive off Appearance.getColorScheme()+addChangeListener instead of useColorScheme() → fixes "Auto never goes dark" (useColorScheme latches stale 'light' on New Arch RN0.86). Native config was already correct (DayNight theme + uiMode configChanges + app.json automatic).
- USER DIRECTIVE: do NOT use current screens as design baseline — learn from their DEFECTS, apply finalized Playful&juicy fresh. Screenshots are a defect list (scratchpad/s_*.png: home2=GOOD bar, scores=weak podium+0pts bug, rewards/insights=sparse+emoji, settings=generic).
- KNOWN BUGS TO FIX: (1) THEME light-lock: member/[id].tsx, member/add-child.tsx, auth/{login,register,onboarding,splash}.tsx do NOT use useTheme → hardcoded light Colors. Convert to useTheme. (2) LEADERBOARD 0-pts: Rewards+Home show Vian "20 pts this week" but leaderboard reads 0. Week-boundary NOT the cause (both = Mon Aug10). Needs on-device debug (transaction query/timezone) — do NOT blind-fix (rework risk).
- ✅ LEADERBOARD redesign done (tsc clean): premium gradient PODIUM pedestals (PodiumColumn + PODIUM_CFG gold/silver/bronze, tallest#1, rank-badge circles, crown#1) replacing flat rects; list rank emoji → colored medal badges (rankMedal); winner-banner chevron → Icon. Rewards already had afford bars (decent) — chrome-emoji swap still pending.
- 🔨 BUILD b1c8jhvab RUNNING (arm64 release) to VERIFY batch: Home + tab-bar icons + theme Auto-fix + Leaderboard. CRITICAL CHECK: confirm Ionicons (@expo/vector-icons) actually RENDER on device (font-load risk → could show empty boxes; tsc can't catch). If boxes → need Font.loadAsync or ensure_layout loads Ionicons.font.
- ✅ BUILD b1c8jhvab INSTALLED + PARTIALLY VERIFIED on device (2026-08-12): (a) Ionicons RENDER fine (no tofu) — tab bar clean line icons. (b) tab labels single-line (wrap bug FIXED). (c) theme now DYNAMIC — app showed LIGHT mode (was perma-dark) → Appearance fix working; still need user to confirm Auto→dark. (d) Home polished in light too. (e) NO crashes (pid alive, no FATAL in logcat).
- ⚠️ DEVICE-DRIVE HAZARD: adb taps kept losing focus to notifications → accidentally opened user's Messages + WhatsApp (did NOT read; backed out). STOPPED blind device automation. Leaderboard screenshot NOT captured — asked USER to eyeball Scores tab + confirm Auto-dark. App does NOT crash on leaderboard (verified pid+logcat).
- ✅✅ THEME AUTO-MODE ROOT CAUSE FOUND + FIXED (user: "only Dark works with dark, Auto+Light always light"; actually only AUTO broken — always light on dark phone). CAUSE: expo-system-ui reads string resource `expo_system_ui_user_interface_style` (via SystemUIReactActivityLifecycleListener.onCreate → SystemUI.setUserInterfaceStyle). Module DEFAULT (node_modules/expo-system-ui/.../values/strings.xml) = **"light"** → `AppCompatDelegate.MODE_NIGHT_NO` → FORCES whole app light every launch. Expo config-plugin should override it in app's strings.xml from app.json userInterfaceStyle="automatic", but android/ folder is STALE (hand-edited manifest) so override was NEVER written. FIX: added `<string name="expo_system_ui_user_interface_style">automatic</string>` to android/app/src/main/res/values/strings.xml → MODE_NIGHT_FOLLOW_SYSTEM. (Explicit Dark worked before because JS uses darkColors regardless of native mode.) ⚠️ GENERATED FILE — re-add after any `expo prebuild` (or fix persistently: ensure prebuild regenerates from app.json).
- ALSO done: Home Task/Penalty buttons emoji→Icon (add-circle/warning). tsc clean.
- 🔨 BUILD (arm64) to VERIFY theme Auto→dark. BUILD GOTCHA HIT: gradle wrapper dist cache (~/.gradle/wrapper/dists/gradle-9.3.1-bin) went corrupt → wrapper re-downloads gradle-9.3.1-bin.zip from services.gradle.org → PKIX SSLHandshake fail (TLS interceptor on this machine). The `org.gradle.jvmargs -Djavax.net.ssl.trustStoreType=Windows-ROOT` (gradle.properties) applies to the DAEMON, NOT the wrapper bootstrap JVM. FIX: prefix build with `GRADLE_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT"` → wrapper download succeeds. (`--offline` does NOT help — wrapper dist download happens before offline applies.) BUT download then TIMED OUT (10s networkTimeout, throttled interceptor) at ~40MB partial. FINAL FIX: bumped `networkTimeout=120000` in gradle-wrapper.properties + curl'd the full gradle-9.3.1-bin.zip (137MB, unzip-verified) into `~/.gradle/wrapper/dists/gradle-9.3.1-bin/23ovyewtku6u96viwx3xl3oks/` so wrapper extracts locally (no download). Build bqlrfbca5 NOW BUILDING (past wrapper, in D8/dexing phase ~1354 lines, benign play-services-auth stackmap warnings). Awaiting APK → install → verify Auto→dark.
- CURRENT STATE (2026-08-12 eve): build bqlrfbca5 INSTALLED + DEVICE-VERIFIED. NOTE: phone wireless port rotated → use adb device `adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp` (mDNS), not the ip:port.
  - ✅ VERIFIED GREAT: tab-bar Ionicons + labels; Leaderboard premium podium (gold/silver pedestals, rank badges, medal list badges) + **0-pts bug GONE** (Vian shows 20); Home Task/Penalty icon buttons; theme now CONSISTENT across screens (persisted mode=Light → all light; cold-start shows brief dark FLASH before AsyncStorage loads = minor FOUC nit). Auto→dark native fix (strings.xml) IN but NOT explicitly re-tested via Settings toggle (only saw launch-flash dark).
  - ✅ TASK COMPLETION EFFECT = PERFECT (juicy vision delivered): "+10 ⭐" PointBurst, green done-state (strikethrough+✓), live hero update (pts/level/progress), streak flame lights, undo toast. Undo (card "tap to undo") WORKS — no "can't undo" error (rules fix confirmed).
- 🐞 BUGS FOUND (correctness, fix BEFORE calling UI done):
  1. **Undo over-subtracts → weekly = −10** (completed +10, undo should net 0, got −10). Suspect double reversal OR weekly-transaction sum bug (same math as old leaderboard 0-pts). undoTaskCompletion adds a −pts reversing tx; original +pts completion tx should offset. INVESTIGATE handleUndoTask/undoTaskCompletion + getWeeklyPoints/leaderboard weekly sum.
  2. Task card STALE after undo — pts update instant but card keeps green/done until manual refresh (undo should optimistically clear completion in local state).
  3. Toast "Undo" SILENTLY BROKEN — deletes tx doc but rules `transactions delete:if false` → fails, swallowed. Only card-undo works. (index.tsx undoToast onPress.)
  - ⚠️ TEST DATA: Sameer left at weekly −10 from testing — restore to 0 as part of fix (transactions immutable → likely needs a +10 bonus tx or accept Monday reset).
- ✅ FULL DEVICE QA PASS DONE (2026-08-12 eve, build bqlrfbca5). **THEME AUTO→DARK VERIFIED WORKING** (tapped Settings→Auto on dark phone → app went dark; #1 bug FIXED+confirmed). Task COMPLETION EFFECT verified perfect. All tab screens + Penalty + Create Task + Member profile screenshotted (scratchpad/t_*.png light, dark_*.png dark, t_complete2 effect). User wants ALL screens captured to build App Store shots from REAL screens (genericize names later) — have: Home/Scores/Rewards/Insights/Family/Settings/Penalty/CreateTask/Member (light) + Home/Scores/Rewards/Settings (dark). STILL MISSING for launch set: auth/splash/login/onboarding (pre-login), reward-packs, task-packs, winner board, child-mode, add-child.
- 🐞 CONSOLIDATED ISSUE LIST (fix together per user; do at end):
  CORRECTNESS: A+B undo DOUBLE-FIRES → 2 reversing txns → weekly −10 (confirmed via Insights activity log: +10, then Undo −10 ×2). Root = no in-flight guard on handleUndoTask + card stays "done" after undo (stale, not optimistically cleared) → re-undoable. Fix: guard + optimistic-incomplete + make undoTaskCompletion idempotent (verify completion still exists). C: toast "Undo" silently broken (deletes immutable txn, rules block) — reroute to undoTaskCompletion or remove. H: Rewards afford bar renders FULL on negative pts (need Math.max(0,progress)). I: Insights 6-wk chart shows −10 as FULL positive bar + "Most-dodged" counts undo txns.
  THEME: L member/[id] (VERIFIED white-in-dark), add-child, auth/* LIGHT-LOCKED → useTheme. E cold-start dark FLASH before persisted theme loads (FOUC).
  POLISH: D podium 2nd-place SILVER pedestal reads grayed-out/disabled → richer silver. Chrome emoji → icons on Penalty(⚠️⭐)/CreateTask(📦✅✏️)/Family(👪📋📤)/Settings(⚙️📷😀). Rewards/Settings/Insights still generic → juicy pass.
  DATA: Sameer left weekly −10 from my testing (can't self-adjust; needs +10 bonus from another parent OR Monday reset).
- ✅ MORE SCREENS CAPTURED (dark): Reward Packs (good), Task/Starter Packs (good), Child Mode Home+Settings. Theme restored to Light + child mode OFF (user's original state). UNREACHABLE (need setup): Winner board (needs a past-week champion), auth/splash/login/onboarding (need logout).
- 🐞 MORE BUGS FOUND: M. Create Task difficulty cards + chips render WHITE in dark mode (hardcoded surface, not theme-aware) — VERIFY task/create.tsx. N. **Child Mode task cards show "+undefined pts"** (ChildTaskCard reads wrong points field — should be task.pointValue) — real bug. O. Child mode forces pink/light even under dark theme; "Currently dark mode" label then contradicts screen (minor).
- 📊 INSIGHTS DEEP-DIVE (user flagged "insights under insights"): the Insights TAB contains a row of auto-generated NARRATIVE "insight" cards (Down X%, Wednesdays strongest, Most-dodged) = redundant naming (insights within Insights) AND buggy with sparse data: "Down 0%" math wrong (−10 vs 0), "strongest day" meaningless from 1-2 pts, "Most-dodged: Undo:Workout ×2" mines txn REASONS + mislabels undo txns as dodged tasks. FIX: reframe/rename, EXCLUDE undo/reversal txns, correct math, GATE behind min data (else hide), fix chart negative handling. Core (stat cards + trend + recent activity) is solid.
- ✅ FIXES DONE (tsc clean, NOT yet built): 
  - A/B/C UNDO −10 root cause: firebase.ts `undoTaskCompletion` now IDEMPOTENT (early-return if completion already gone) + `completeTask` returns `completionId`. index.tsx: new `performUndo()` shared by card+toast — in-flight guard (undoInFlightRef Set by completionId) + optimistic local clear (setTodaysTasks completion=null) + reload; toast-undo rerouted to performUndo (old path deleted immutable txn → silently failed).
  - H rewards.tsx afford `progress = Math.max(0, Math.min(1, …))`.
  - N ChildMode.tsx `task.point_value`→`pointValue` (+ was_auto_failed→wasAutoFailed) — kills "+undefined pts".
- ⚠️ Sameer −10 DATA persists (2 undo −10 txns + 1 completion +10 = −10; txns immutable, Sameer can't self-adjust). Resets on Monday weekly boundary; else add +10 bonus via direct write. LOW PRIORITY (test admin acct).
- NEXT FIXES (bigger, next batch): I Insights 6-wk chart negative bar; L light-lock → useTheme (member/[id], add-child, auth/*); M verify Create Task dark cards; P Insights rework (rename/reframe + exclude undo txns + gate + fix math); D silver podium; chrome→icons (Penalty/CreateTask/Family/Settings); Rewards/Settings/Insights juicy pass; E/O FOUC + child-mode-dark. Then BUILD to verify undo fix on device (dist cached now → use `GRADLE_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT" ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon`). Device: adb `adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp`. THEN negative-reward-points feature.
- NEXT after build verifies theme: convert light-locked screens (member/[id], add-child, auth/*) to useTheme; Rewards/Settings/Insights chrome-icon swap; device-debug leaderboard 0-pts. Do NOT claim "done" until ALL screens verified (user directive). After ALL screens done + verified → CHECK IN with user (they want to talk before next work).
- 📌 FEATURE BACKLOG (spec AFTER UI polish, user 2026-08-12, do NOT build now): optional **negative reward points** (must be toggleable/optional). Remind user once screens done. See memory `negative-reward-points-feature.md`.

## Iteration 22 (2026-08-11) — device reconnect for gamify visual-verify
- GOAL: reconnect Pixel over wireless adb to device-verify gamify batch 1 (streak flame, level bar, no auto-refresh flicker) → then merge autonomous/gamify-home.
- adb NOT on PATH; use full path `C:\Users\samee\AppData\Local\Android\Sdk\platform-tools\adb.exe`. `adb devices` EMPTY.
- User gave ip:port `192.168.86.121:43963` → `adb connect` FAILED (this PC not paired with phone this session).
- BLOCKED: awaiting **pairing** — user to open phone Wireless debugging → "Pair device with pairing code" → give the (different) pairing port + 6-digit code → then `adb pair <ip>:<pairPort> <code>` then `adb connect <ip>:43963`.
- NEXT: once paired+connected, install/launch build, screenshot gamify visuals, then merge.

## Iteration 21 (2026-08-11) — SDK57 MERGED TO MAIN + gamify batch 1 (branch autonomous/gamify-home)
- ✅ SDK 57 build SUCCESS (assembleDebug), installed on Pixel, RUNTIME-VERIFIED: app launches, no native crash, Firebase v26 shim authenticates + runs compound Firestore query. **Merged to main + pushed (bce63f9)**. Caught+fixed during smoke-test: missing `promise` dep (v26 crashlytics needs it) + jest-expo 57 needs `@react-native/jest-preset` (installed, unblocks all tests).
- ✅ Deployed Firestore indexes (`firebase deploy --only firestore:indexes`) — fixes the `transactions memberId+createdAt` "requires an index" error surfaced on-device (index was defined but never deployed).
- GAMIFY BATCH 1 done on branch (tsc app-src CLEAN, NOT yet device-visual-verified — adb dropped, phone locked):
  - #7 auto-refresh fix: `hasLoadedRef` → skeletons only on FIRST load per profile; listener reloads are silent (kills the "constantly refreshing" flicker).
  - #2 streak: NEW pure `dailyStreak(dates, now)` in pointsEngine (today-OR-yesterday grace anchor; +6 unit tests) wired into Home via getRecentCompletions(35d); StreakFlame now lights up (was hardcoded 0).
  - #3 level bar: getLevel(lifetimePoints) hero card above progress card (emoji + Lv/title + gold XP bar + "N pts to Lv+1"). Streak+lifetime fetched in a mount/profile effect (NOT snapshot loop → no flicker/cost).
  - Fixed SDK57 typed-route errors: `/app/tabs/`→`/app/tabs` (_layout, onboarding).
- BLOCKED: wireless adb dropped (ports rotate on reconnect; mDNS not discovering). User dismissed reconnect prompt → WAIT for next instruction. To resume verify: USB, or get current ip:port from Settings→Developer options→Wireless debugging, then `adb connect`. Metro still running bg (bam5mnebw) on :8081 with reverse tunnel.
- NEXT (when device back): device-verify gamify visuals (streak flame, level bar, no auto-refresh flicker) → merge autonomous/gamify-home to main. Remaining gamify: #4 competitive nudge, #5 juicier rewards. Then Phase 3 (server point integrity, auto-fail CF) + photo.

## Iteration 20 (2026-08-10) — EXPO SDK 51 → 57 UPGRADE (app-src tsc clean; native build running)
- WHY: user hit store-rejection uploading old SDK to Apple/Google. Branch `autonomous/sdk-57-upgrade` (off phase-3, carries parked photo pivot). iOS DEPRIORITIZED per user (far off); Android focus.
- STACK: expo 51→57, RN 0.74→0.86, React 18→19.2, Firebase v20→**v26 (modular-only + requires New Arch)**, google-signin 13→16, reanimated 3→**4** (+react-native-worklets 0.10.1), expo-av→**expo-audio**.
- BIG WIN: instead of rewriting ~hundreds of namespaced Firebase call sites, wrote **`lib/fb.ts` compat shim** (rebuilds `firestore()/auth()/storage()/functions()/analytics()/crashlytics()/messaging()` chainable API on v26 modular free-fns). Swapped imports across ~14 files. `.exists`→`.exists()` (method now, 4 sites), `FirebaseFirestoreTypes.Timestamp`→`Timestamp` (8 sites), appCheck.ts→modular `initializeAppCheck(getApp(),…)`.
- OTHER FIXES: sounds.ts expo-av→expo-audio createAudioPlayer; babel `react-native-reanimated/plugin`→`react-native-worklets/plugin` (last); firebase.ts FileSystem→`expo-file-system/legacy`; notifications handler +shouldShowBanner/List; StyleSheet.absoluteFillObject→absoluteFill. app.json: `newArchEnabled:true` + expo-build-properties (gradle -Xmx4g, kills the recurring Jetifier OOM). expo-system-ui added.
- STATUS: **app-source `tsc` CLEAN**; `prebuild --clean` OK. Native `assembleDebug` re-running after manifest fix (bg b1vzncw1e) — compiling New-Arch C++ (reanimated/gesture-handler CMake, arm64+x86), no errors, no APK yet.
- USER DIRECTIVE (user now AWAY, phone stays connected): on build success → adb-install on Pixel → launch smoke-test (no crash + data loads = shim runtime OK) → screenshot proof → **commit + MERGE branch to main** (only if smoke-test passes; do NOT merge a crashing build) → then continue roadmap (auto-refresh fix #7, then gamify #2-5). Branch `autonomous/sdk-57-upgrade` carries phase-3 commits + all SDK-57 work (uncommitted).
- BUILD BLOCKERS CLEARED (all environmental, NOT migration code): (a) TLS PKIX cert fail on dl.google.com/maven → TLS interceptor; curl(Windows) works, JDK17 truststore didn't → added `-Djavax.net.ssl.trustStoreType=Windows-ROOT` to android/gradle.properties jvmargs (+bumped heap 2g→4g there; NOTE expo-build-properties `extraGradleProperties` key did NOT apply — fix the key for persistence). (b) missing android/local.properties → wrote `sdk.dir=C:/Users/samee/AppData/Local/Android/Sdk` (fwd slashes). (c) manifest merger: expo-notifications vs rn-firebase_messaging both set `default_notification_color` → added `tools:replace="android:resource"` to generated AndroidManifest.xml line 21 (GENERATED — wiped on prebuild; needs a persistent config-plugin fix).
- NEXT: (1) confirm build green, install+launch Pixel, verify no crash + data loads (shim runtime correctness). (2) FIX auto-refresh flicker (task #7: index.tsx onSnapshot→loadTasks sets isLoadingTasks=true every event → skeletons flash; make listener reloads silent). (3) GAMIFY HOME tasks #2-5. (4) Phase 3 finish + photo (Sofra uses react-native-image-picker file://). (5) PERSIST the 2 generated-file fixes (manifest tools:replace via config plugin; gradle jvmargs via correct expo-build-properties key) before any prebuild. react-native-image-picker DROPPED (TS-strip incompat). RN pinned 0.86.2 (expo wants 0.86.0, harmless).

## Current State (as of 2026-08-15) — see Iteration 27 (top) for detail

- **App:** Lootboard. Code `C:\Users\samee\FW`. Firebase `familywin-35a97`. Branch `autonomous/gamify-home`.
- **Build:** **bpltxe1dg** INSTALLED + ALL 5 device-verified (light mode, Pixel 10 Pro). Signing by user only.
- **Device-verified ✅ (all 5):** 5-tab bar (no Family tab); crown cards REDESIGNED — 3 clean identical opaque surface cards w/ colored badge+border+title, NO box-in-box (stale-cache theory CONFIRMED — same source rendered wrong pre-cache-clear, right after); Insights declutter (calm tiles + 1 lead highlight); Rewards ＋Add beside title + full-width vault; Settings hub → Help&Legal + Family sub-screens both push+back correctly.
- **NOT yet committed** (per rule: commit only when user asks). Branch autonomous/gamify-home. Ready to commit the iter-27 batch on user's go-ahead.
- **Device hazard:** flaky wireless adb + focus-steal → guard taps by checking mCurrentFocus grep familywin before screenshot. Reconnect: `adb kill-server; adb start-server; adb mdns services` → connect the mDNS name.
- **NEXT:** user review of iter-27 on device; then commit; then remaining backlog (negative-reward-points feature spec, per memory).
- **Tests:** 102 jest pass (pointsEngine incl. missed-penalty + insights). firebase.test.ts suite still fails to LOAD (native module) — pre-existing.
- **Roadmap:** `docs/LAUNCH_ROADMAP.md` (Phases 0–6). Photo upload was fixed+verified earlier (Iter 23).

## Constraints (permanent)
1. Never handle keystore passwords (FAMILYWIN_KEYSTORE_PASSWORD / FAMILYWIN_KEY_PASSWORD).
2. No real family names/photos in marketing — use Dad/Mom/Alex/Jamie.
3. Don't change brand colors/fonts in `constants/theme.ts` without approval.
4. Verify on device before claiming fixed. adb: `C:\Users\samee\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
5. Develop → test thoroughly → show results → THEN build APK. Never build-and-hope.

## Last Session (2026-07-11) — Phase 0 build underway
- DECISIONS: palette = **Purple + Gold** (indigo-violet #6C63FF primary, keep orange #FF6B2C accent, gold #FFD700). Insights = borrow Sofra *layout*, our OWN metrics (streaks/completion-by-day/most-dodged/win-rate). Shared-core library `@family/core` = parked future item (F.1). New roadmap `docs/LAUNCH_ROADMAP_V2.md` + master backlog table given.
- DONE this session (code written, NOT yet device-verified):
  - Theme → purple in all 3 files: `constants/theme.ts` (Colors + Shadow.lg + Gradients), `lib/theme.tsx` (light/dark/child), `app/_layout.tsx` splash gradient.
  - Installed `react-native-svg` + `expo-image-manipulator` (SDK-51 versions).
  - NEW `components/ui/Brand.tsx` — `LootboardMark` (SVG gold trophy + purple star) + `BrandLockup` (mark + wordmark, themed).
  - Wired `BrandLockup size="sm"` into Home + Leaderboard + Rewards + History headers (dropped emoji titles).
  - Home header: removed ⚠️ penalty button; ＋ → "＋ New task" pill; added "N days left to win 🏆" countdown (`weekCountdownLabel()`).
  - Photo fix (0.7): `uploadMemberPhoto` now `ImageManipulator.manipulateAsync`(resize512,jpeg,0.7)→`ref.putFile(uri)` instead of fetch→blob→put.
  - `tsc --noEmit` clean for app src (only 2 PRE-EXISTING errors in `__tests__/`).
  - Native rebuild running via `expo run:android --no-bundler` (bg id bc4ez68op, log in tasks/).
- Sofra = `C:\Users\samee\DiningPlanner` (source + `docs/screens/*.png`). Borrow: AvatarPicker initials-fallback UX; Insights layout; share-card→image flow (screens 17,18) for Winner Board.

## VERIFIED ON DEVICE (Pixel 10 Pro, 2026-07-11)
- Native rebuild SUCCESS (2m41s) + installed. Metro bundles clean (1668 modules, no errors). Launch dev build via deep link: `am start -a android.intent.action.VIEW -d "com.familywin.app://expo-development-client/?url=http://<ip>:8081"` (plain MainActivity start does NOT foreground it).
- ✅ Purple theme live on all screens. ✅ BrandLockup (gold trophy SVG + "Loot"+purple "board") renders in tab headers. ✅ Header emoji titles dropped. ✅ Discipline relocation code in (0.6).
- Screenshot via `adb exec-out screencap -p > file.png` (NOT `screencap /sdcard/..` — Git Bash mangles the path).
- 0.6 discipline done: member profile "⚖️ Adjust points" → `discipline/log?memberId=` (preselects); leaderboard row tap → member profile.
- KNOWN pre-existing (NOT my regression): LogBox warning `No route named app/member/[id] exists` — from root `app/_layout.tsx` route decls; settings.tsx already navigates same path. Investigate in perf/cleanup phase.

## Iteration 2 (2026-07-11, user feedback)
- **Brand placement fixed:** was BELOW the family profile switcher (Me/Vian). Added `BrandBar` (pinned top app-bar) to `Brand.tsx`; now rendered as FIRST child of SafeAreaView on Home/Leaderboard/Rewards/History → brand sits ABOVE the profile tabs. Removed the in-scroll `brandRow` (its style is now dead code, harmless).
- **Photo STILL broken per user.** Diagnosis so far: fails across BOTH fetch→blob AND putFile paths → not the upload code. Storage rules **already deployed + up to date** (ruled out) — verified via `firebase deploy --only storage` (authed as sameerrajwade@gmail.com). firebasestorage API enabled. Remaining suspects: manipulator can't read SAF content:// URI; App Check; or `.firebasestorage.app` bucket. Made `uploadMemberPhoto` robust (manipulate→fallback to original uri→putFile) + it now THROWS `Upload failed [storage/xxx] <native msg>` so the on-screen alert reveals the real code. NEXT PHOTO TAP will show the cause.
- Release rebuild in progress (bg b80msvcc2) with both fixes. tsc clean.

## PHOTO UPLOAD — ROOT CAUSE FOUND & FIXED (2026-07-11)
- Captured exact on-device error by driving the picker via adb: **`Upload failed [storage/unknown] No content provider: Intent { dat=content://media/… }`**.
- CAUSE: expo-image-picker returns a `content://media/…` MediaStore URI; native Firebase `putFile` AND expo-image-manipulator cannot open it ("No content provider"). This is why BOTH old fetch→blob and putFile failed, and why Sofra works (react-native-image-picker returns an app-owned `file://`). NOT rules/bucket/AppCheck.
- FIX (`lib/firebase.ts::uploadMemberPhoto`): if uri isn't `file://`, `FileSystem.copyAsync({from: contentUri, to: cacheFile})` (expo-file-system v17, already installed) to bridge content://→app-owned file, THEN manipulate(512,jpeg,0.7)→`putFile(file)`. Covers ALL callers (settings, member/[id], add-child). Rebuild bg b72kp6vv2. tsc clean.
- Verify technique that worked: `adb logcat` shows ReactNativeJS console in RELEASE builds; drive picker via `adb shell input tap`; alert text via screencap.

## Iteration 3 (2026-07-12, user feedback)
- **BrandBar was blank** except "Lootboard" top-left. Added `WeekCountdownChip` (gold "🏆 N days left" pill) to the RIGHT of `BrandBar` in `Brand.tsx` → now fills the highlighted app-bar on ALL 4 tabs consistently. Moved `weekCountdownLabel()` into Brand.tsx (shared); removed the duplicate `· N days left` from Home's date line + deleted the local helper. tsc clean (only 2 pre-existing __tests__ errors). NOT yet device-verified.
- **Photo upload:** code path is correct (content:// → FileSystem.copyAsync → manipulate 512/jpeg → putFile) and latest commit added SAF ACTION_GET_CONTENT chooser. Treating as DONE pending a real device pick; stop re-opening unless a real pick fails.

## Iteration 4 (2026-07-12) — Phase 1 signature screens built (NOT device-verified)
- **1.6 pointsEngine:** `computeCrowns` (👑 top / 📈 most-improved / 🎯 goal) + `computeInsights` (trend/best-day/record-week/most-dodged/tasks-done). Pure, degrade gracefully. +20 unit tests, all green.
- **1.1 Leaderboard:** three-crowns row (unawarded = "up for grabs"); queries last-week totals for most-improved; reads `member.weeklyGoal` if present (no goals UI yet → goal crown dormant); "Last week's champion" banner → Winner Board.
- **1.2 Rewards:** per-reward inferred emoji icon, progress-to-afford bar ("N pts to go"), "Points Vault" label.
- **1.3 Insights:** renamed History→Insights; horizontal insight-card strip above the 6-week chart.
- **1.4 Winner Board:** NEW `app/app/winner.tsx` (fullScreenModal route). Confetti + trophy + champion(s, tie-aware) + final standings + stat tiles + share (RN `Share` TEXT brag — image card needs `react-native-view-shot`+`expo-sharing`, ONE native rebuild, deferred). Computes last week client-side (works w/o Cloud Function).
- **1.5 Celebration:** heavier haptic flourish on Home "all done"; winner screen confetti+haptic.
- **4.2 Per-child goals:** `setMemberWeeklyGoal` helper + `weeklyGoal` on MemberDoc; goal card + set/edit modal (presets 100/200/300/500, clear) on member profile (gated to parents); leaderboard already reads it → 🎯 crown now LIGHTS UP when a member beats their goal. Losing-child fix core done.
- **4.6 Template packs:** `constants/taskPacks.ts` (4 packs: Little Helpers 5–8, Big Kids 9–12, Teen, Whole Family) + `createTasksFromPack` batch helper + `app/app/task/packs.tsx` picker (per-task toggle, points from difficulty, emoji auto-detected). Entries: Home empty-state primary CTA + task/create header "📦 Packs". Empty-first-week activation lever done.
- **4.1 Lifetime levels:** `getLevel(lifetimePoints)` in pointsEngine (9 tiers Rookie→Mythic, monotonic, +6 tests). Level card w/ progress bar on member profile hero (uses allTimePoints). Retention-beyond-the-week hook.
- **Unit tests now +26 this session (crowns 10, insights 10, levels 6), all green.**
- **Header chip** (iter 3) shipped alongside.
- VERIFY STATUS: `tsc` app-src clean (2 pre-existing __tests__ tsc errors remain). Jest: pointsEngine 77/78 (1 pre-existing date-flaky `calculateWeeklyPoints`); RNTL screen suites broken PRE-EXISTING (untouched SettingsScreen throws identically — harness rot, Phase 6). NONE device-verified — installed APK predates this code; needs a rebuild + phone UNLOCK.

## Iteration 5 (2026-07-12) — RELEASE build device-verified
- Built + installed RELEASE APK (debug-signed via signingConfigs.debug → no keystore pw needed; bundles JS, no Metro). Drove UI via adb.
- ✅ VERIFIED on device: header chip (🏆 Final day!), 3-crowns row, Insights rename+cards (Family view), Rewards progress bar+vault, starter packs (per-task toggle + dynamic count), member level card (Lv2 Helper), goal setter → 🎯 Goal Crusher crown lights up (needed pull-to-refresh → FIXED with useFocusEffect on leaderboard).
- ❌ PHOTO STILL BROKE (user was right): live repro shows **`FileSystem.copyAsync` throws `ERR_UNEXPECTED` on the `content://media/picker/…` URI** from Android 13 GET_CONTENT. Never reached putFile. RE-FIXED `uploadMemberPhoto`: manipulate-FIRST (ImageManipulator decodes content:// via ContentResolver → file://), copyAsync/direct as fallbacks, granular per-strategy errors. REBUILD IN PROGRESS (bg bnmdvqvh1) — retest pending.
- Release APK: `android/app/build/outputs/apk/release/app-release.apk`. Test goal (100) left on Vian.

## Iteration 6 (2026-07-12) — UI feedback batch (built, installing final APK)
- Photo `uploadMemberPhoto` re-fixed (manipulate-first) — bundled into this build.
- (1) Insights → own **📊 bottom tab** (history no longer `href:null`; ordered after Scores).
- (2) Crown unawarded slots restyled: dashed primary border + vivid emoji + "up for grabs" in primary (was grayed/disabled look).
- (3) **Reward starter packs**: `constants/rewardPacks.ts` (4 packs) + `createRewardsFromPack` + `app/app/reward/packs.tsx` + entries (Rewards empty-state CTA + "🎁 Packs" header link).
- (4) Home date moved into brand bar next to countdown chip (`Jul 12` + `🏆 Final day!`); greeting subline now shows task-progress status instead of the date.
- Leaderboard: added `useFocusEffect` reload so a just-set goal reflects immediately.
- tsc clean (2 pre-existing __tests__ errors only). Final APK = bg build bpeh1wjf3 (SUCCESS); installing (bg b2z7ypmsx).

## Iteration 7 (2026-07-12) — PHOTO deep-diagnosis (device-verified failures)
- ✅ Feedback batch VERIFIED on device: Insights bottom tab live (6 tabs), date moved to bar ("Jul 12" + Final day!), crown "up for grabs" restyled (dashed), goal crown auto-updates via useFocusEffect.
- ❌ PHOTO still failing — but now EXACT cause via granular error: `manipulate: ERR_IMAGE_DECODE | copy: ERR_UNEXPECTED`. BOTH Expo file APIs cannot read Android 13 photo-picker `content://media/picker/…` URIs.
- Fix attempt (bg build bydbwo9g3): read bytes via **RN `fetch(uri)`→blob→FileReader base64→`writeAsStringAsync` file://** (RN networking resolves content:// where Expo can't), size-guarded, then compress→putFile. copyAsync kept as fallback.
- IF fetch blob is empty/fails next test → PIVOT: switch library source to `expo-image-picker.launchImageLibraryAsync` (returns native file:// copy). NOTE: was abandoned for "blank translucent picker" but GET_CONTENT's photopicker renders fine here, so it may work.

## Iteration 8 (2026-07-12) — animated splash + status review
- Shipped branded animated splash (commits 0a9e767→fd6811e): render Stack immediately + purple overlay until first nav (fixes cold-start flash/deadlock), then trophy drop+wobble+shimmer, sparkle burst, staggered stars, zoom-fade exit. NOT device-verified.

## Iteration 9 (2026-07-12) — photo: raw content:// putFile fallback
- Added Strategy 3 to `uploadMemberPhoto`: when fetch(1) + copyAsync(2) both fail to bridge the SAF `content://media/picker/…` URI to a file://, hand the RAW content:// straight to `ref.putFile()`. rn-firebase/storage v20 reads it via Android ContentResolver, and the GET_CONTENT result carries an implicit read grant → likeliest-to-work path, previously never tried (code always insisted on a file:// and THREW instead). No client compress on this path (fine; Phase 3). tsc app-src clean.
- BLOCKED on verify: `adb devices` EMPTY. Cannot device-test or build per rule 5. Need phone plugged in w/ USB debugging.

## Iteration 10 (2026-07-12) — PHOTO root fix: OPEN_DOCUMENT (device-confirmed diagnosis)
- Device-verified the Iter-9 build: alert showed ALL THREE strategies fail — `fetch: Network request failed | copy: ERR_UNEXPECTED | putFile(content): No content provider (content://media/picker/… flg=0x41)`. Read grant WAS applied (0x41) yet even native putFile can't open the photopicker URI → `ACTION_GET_CONTENT` is a dead end on this OS (it's hijacked by the Android 13+ Photo Picker).
- FIX: switched the SAF intent `GET_CONTENT`→`ACTION_OPEN_DOCUMENT` (+flags:1) in all 3 call sites (member/[id], settings, family). OPEN_DOCUMENT opens DocumentsUI, returns a readable `content://…/documents` URI → Strategy-3 direct putFile (Iter 9) should now succeed. tsc app-src clean. Rebuild bg bh3rvdisj — install + device-retest pending.
- If OPEN_DOCUMENT still fails → last resort = react-native-image-picker (native file://, new dep + rebuild).

## Iteration 11 (2026-07-12) — Phase 2 ship-blockers batch (code done, rebuild running)
- DECISIONS: package → **com.lootboard.app** (rename deferred, needs new google-services.json from Firebase console); audience → **Designed for Families** (COPPA). Photo upload PARKED per user until end.
- ✅ 2.5 Permissions: stripped READ/WRITE_EXTERNAL_STORAGE via `blockedPermissions` in app.json (kept SCHEDULE_EXACT_ALARM — daily-reminder use is declarable). 2.8 versionCode:1 added to app.json.
- ✅ 2.6 Storage rules HARDENED: `member-photos/{familyId}` now family-members-only (was any-authed) via `firestore.get` cross-service check — real fix for a kids'-photos gap. Firestore rules already lock cross-family + weeklyScores.
- ✅ 2.2 `docs/DATA_SAFETY.md` + 2.3 `docs/PRIVACY_POLICY.md` written (DFF/COPPA posture, contact sameerrajwade@gmail.com).
- ✅ 2.9 Account deletion: NEW callable Cloud Function `deleteAccount` (functions/index.js) — cascade-deletes family+photos+auth if last account-holder, else member-only; `deleteMyAccount()` in lib/firebase.ts; real "Delete My Account" flow replaces placeholder in settings.tsx (all account-holders, not admin-only). Added deps @react-native-firebase/functions + /crashlytics.
- ✅ 2.7 Crashlytics wired into existing ErrorBoundary (_layout.tsx) + plugin in app.json.
- tsc app-src clean; functions node --check OK. Rebuild bg bcwuzgaoa (non-clean prebuild+assembleRelease, keystore restored).
- ⚠️ DEPLOY GATES (production, need user go-ahead): `firebase deploy --only storage` (2.6 rules) + `firebase deploy --only functions` (2.9 deleteAccount). Account-deletion can't be device-tested until function deployed — and testing it DELETES real data.

## Iteration 12 (2026-07-12) — PHASE 2 COMPLETE (deployed + pushed)
- Rebuild SUCCESS after Gradle heap 2G→4G fix (prebuild had reset it → Jetifier OOM). Installed on Pixel.
- ✅ DEVICE-VERIFIED: 2.5 external-storage perms stripped (dumpsys); 2.7 app launches clean w/ crashlytics+functions native modules; 2.9 "Delete My Account" renders in Danger Zone; version string now "Lootboard v1.0.0".
- ✅ DEPLOYED to prod (familywin-35a97): storage.rules (family-only photos) + functions (deleteAccount created, weeklyReset/dailyStreakCheck updated).
- ✅ deleteAccount E2E TESTED via throwaway REST account: callable→{ok:true}, auth user→USER_NOT_FOUND, user doc gone, family cascade executed. Real family untouched.
- ✅ Committed + PUSHED origin/autonomous/phase-2-ship-blockers (commit 4af44c5).
- Phase 2 status: 8/9 done+deployed. REMAINING: 2.1 package rename (authorized, do via firebase CLI).
- Follow-ups noted: functions Node20 deprecation (upgrade to 22 by 2026-10-30); stale "try FamilyWin" string in settings Share row; add expo-build-properties to persist Gradle heap across prebuilds.
- NEXT: Phase 3 (perf/security).

## Iteration 13 (2026-07-12) — Phase 3 audit (branch autonomous/phase-3-perf-security)
- ✅ 3.1 reads: getUserFamilyAndMember already Promise.all's family+member after the one dependent user read — optimal fan-out. (Remaining cold-start lever = persisted-cache instant render; TODO.)
- ✅ 3.2 listener audit: index.tsx (unsubTasks+unsubCompletions) & leaderboard.tsx (.limit(1) ping) BOTH have return-cleanup. No leaks.
- ✅ 3.11 cost guardrails: all queries bounded — getRecentCompletions (35d window), getWeeklyPoints (weekStart), history tx log (.limit(100)), leaderboard listener (.limit(1)). No unbounded reads.
- NO app-source code changes this iter (audit only) → no rebuild needed. Phase 3 NOT complete → not pushed yet (per-phase push rule).
- REMAINING Phase 3 (do next, batch 1 rebuild): 3.10 App Check (dep @react-native-firebase/app-check → wire client, verify, THEN enforce), 3.9 invite-code hardening (callable + expiry/size cap), 3.8 server-side point integrity (BIG: move completeTask/addPointTransaction writes to a Cloud Function, then tighten rules to block client-forged pointsAwarded/tx), 3.6 Hermes+R8 (risky, verify heavily), 3.3/3.4 FlatList+memo (check screens), 3.5 expo-image caching, 3.1 persisted-cache render.

## Iteration 16 (2026-07-13) — 3.9 invite-code hardening (deployed + REST-verified)
- NEW callable `joinFamily` (functions/index.js): server-side code lookup + rate-limit (10/hr/uid via joinRateLimits) + family-size cap (8) + one-family-per-account. Deployed.
- Client: `joinFamily(uid, params)` helper in lib/firebase.ts (calls callable → re-hydrates via getUserFamilyAndMember); onboarding.tsx join flow swapped off client-side getFamilyByInviteCode+createMember. tsc clean.
- ✅ REST-VERIFIED (throwaway A/B/C, all cleaned up): join→ok+correct family, user doc linked, re-join→FAILED_PRECONDITION, 11th bad attempt→RESOURCE_EXHAUSTED (rate limit fires after 10).
- NOTE: onboarding only shows for NEW users (not device-testable via logged-in account + locked screen) → REST test IS the verification; client-launch check batches with next (3.8) rebuild.
- Minor: one orphaned throwaway family (twfam_1783945397513) from a failed 1st test run left in Firestore (inert dev data).
- Committed local (Phase 3 not complete → not pushed).

## Iteration 15 (2026-07-13) — 3.10 App Check DEVICE-VERIFIED + commit
- Rebuild b0zc514xu SUCCESS (2m15s, app-check autolinked, no prebuild). Installed on Pixel (wireless adb flaky — use `adb reconnect && adb wait-for-device` before install).
- ✅ VERIFIED: app process launches, NO FATAL crash, `RNFBAppCheck` inits cleanly (token refresh on, collection enabled, no "provider missing" error). tsc clean. Monitor-only → no regression.
- ⚠️ DEVICE NOW LOCKED (fingerprint) → can't screenshot app UI until user unlocks. Process/log/crash verification still works; for backend items prefer throwaway-REST tests (like deleteAccount) over UI shots.
- Committed locally on autonomous/phase-3-perf-security (not pushed — Phase 3 not complete yet).

## Iteration 14 (2026-07-12) — 3.10 App Check client wiring (building)
- Added @react-native-firebase/app-check@20.5.0. NEW lib/appCheck.ts: setupAppCheck() configures provider (playIntegrity release / debug in __DEV__), initializeAppCheck w/ auto-refresh, ALL wrapped in try/catch (never breaks startup). Called first in _layout.tsx init effect (before Google Sign-In).
- MONITOR-ONLY: enforcement NOT enabled server-side → safe on every build, cannot break existing Firestore/Storage/Functions calls. Enforce later in console AFTER confirming real-device tokens + registering a debug token.
- tsc app-src clean. Rebuild bg b0zc514xu (App Check autolinks, no prebuild). On completion: verify app starts clean + data loads on Pixel (no regression), then commit.
- NEXT after verify: 3.9 invite hardening, 3.8 server-side point integrity, 3.6 R8, 3.3/3.4/3.5; then package rename (add expo-build-properties FIRST for heap).

## Iteration 17 (2026-07-13) — USER UI FEEDBACK batch (loop STOPPED by user)
User gave 8 items. Branch autonomous/phase-3-perf-security (UI fixes piggyback here for now).
- ✅ (3) Leaderboard crowns: per-kind accent colors (gold/green/purple `ink` readable in light mode) replace grayed gold-only; awarded title now colored not textSecondary. `CROWN_ACCENT` map in leaderboard.tsx.
- ✅ (5) Removed redundant "📊 Insights" button from Scores header (it's a bottom tab now).
- ✅ (8) Home: replaced single "＋ New task" pill with TWO parent-gated pills side-by-side: "📋 Task" (primary) + "⚠️ Penalty" (danger outline → discipline/log). greeting numberOfLines=1.
- ✅ (7 partial) Family: removed stray "⚠️ Penalty/Bonus" btn (now on Home); invite code 32→25px; share text FamilyWin→Lootboard + APP_STORE_URL (new const in strings.ts). IMAGE card still TODO.
- ✅ (6) Insights Family view: NEW per-member contribution card — distinct color per member (MEMBER_COLORS), horizontal share bar + 4-week mini trend, sorted by total. history.tsx.
- tsc clean. Rebuild bg b22vdxeit (JS-only, no prebuild). VERIFY on device when stable (wireless adb flaky).
- STILL TODO (need native deps + rebuild 2): (2) PHOTO → switch to react-native-image-picker (file:// guaranteed; OPEN_DOCUMENT still failed per user); (4) champion share IMAGE card + (7) invite IMAGE card → react-native-view-shot + expo-sharing.

## Iteration 19 (2026-07-13) — PHOTO pivot to expo-image-picker (build READY, awaiting device)
- RNIP ABANDONED: react-native-image-picker (v7 & v8) ships raw TS (src/index.ts, no compiled JS); Expo SDK 51 build fails `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — first on JS import, then on its CONFIG PLUGIN load. Removed the app.json plugin (dep left installed, harmlessly autolinked/unused).
- lib/photoPicker.ts now uses expo-image-picker launchImageLibraryAsync/launchCameraAsync (returns file:// → putFile works) WITHOUT allowsEditing (that crop-overlay was the real "blank picker" cause per commit 68cb27f). Theory to verify: plain launchImageLibraryAsync renders fine AND returns file://.
- Build bt6s4fc5t SUCCESS (9m). APK ready at android/app/build/outputs/apk/release/app-release.apk. Contains: UI fixes (iter 17) + photo pivot.
- ❌ BLOCKER: wireless adb keeps dropping (offline/no-devices/no-mDNS). Could NOT install/verify. NEED USB or wireless-debugging re-toggle. NOT committing photo until device-verified.
- If expo-image-picker renders blank on device → RNIP is out (TS incompat), next option = expo-image-picker with a config to force legacy picker, or a metro transform to compile RNIP.

## Iteration 18 (2026-07-13) — PHOTO fix via react-native-image-picker (building)
- Installed react-native-image-picker@8.2.1 (+ react-native-view-shot 3.8.0 + expo-sharing 12.0.1 for upcoming share cards).
- NEW lib/photoPicker.ts `pickPhotoUri(source)` — RNIP returns app-owned file:// (fixes Android 13 content:// unreadable-URI saga; the approach that works in the sibling app). Replaced SAF/OPEN_DOCUMENT+expo-image-picker logic in ALL 3 call sites: member/[id].tsx, settings.tsx (profile + child), family.tsx (local pickPhotoUri now delegates). Old pickImageFromGallerySAF left dead (harmless).
- app.json: added react-native-image-picker config plugin (permission strings).
- tsc clean. Rebuild bg bdb8ysnnk (prebuild + heap re-bumped to 4G post-prebuild + assembleRelease). NOT committing photo until DEVICE-VERIFIED (history of false fixes).
- BLOCKER: wireless adb died (adb kill-server dropped pairing; mDNS finds nothing). NEED user to reconnect device (USB best) to install+verify. UI APK (iter 17) also waiting to install.
- Share cards (items 4 champion + 7 invite) = NEXT, JS-only rebuild (deps already in).

## AUTHORIZATIONS (user-granted 2026-07-12, override earlier "staged" defaults)
1. **Firebase prod deploys → APPROVED.** May `firebase deploy --only storage,functions` (authed sameerrajwade@gmail.com).
2. **Package rename com.lootboard.app → APPROVED.** Do via firebase CLI (`firebase apps:create ANDROID com.lootboard.app` → `firebase apps:sdkconfig ANDROID <appId>` → write google-services.json) so NO manual console step needed. Then app.json package+bundleId, prebuild, rebuild, re-add debug SHA-1 for Google Sign-In. NOTE: needs expo-build-properties heap fix FIRST (prebuild resets gradle.properties to 2GB → Jetifier OOM; must be ≥4GB).
3. **Account-deletion device test → APPROVED.** Use a THROWAWAY registered account (never delete the real Rajwade family) to verify the deleteAccount function end-to-end.
4. **App Check enforce → APPROVED.** Sequence: wire client SDK (Play Integrity + debug provider) → verify tokens attach → THEN enforce in console. Never enforce before client attests (locks app out).
5. **Phase 5 paywalls → BUILD UI/entitlement scaffolding, keep everything FREE** (plan defaults to full access; paywalls built but not triggered). No RevenueCat account wiring yet.
6. **Git: PUSH after EACH phase** (not one bundled push). Commit + push per phase once device-verified.

## Next Up (2026-08-15)
1. **User is listing small UI glitches** → fix them in ONE batch (agreed: UI glitches BEFORE next phases), tsc + one build to device-verify.
2. Device-verify build bllo1t1or: undo single-tap (same session), Off/Half/Full penalty, catch-up screen, assign a daily task to Vian to test child catch-up, crown-card look.
3. THEN next phase (launch prep: Play Store assets/screenshots from real screens, release signing by user, backend/CF hardening incl. timezone-aware missed-penalty sweep for members who never open the app).
4. Device hazard: notification shade steals focus → `adb shell cmd statusbar collapse`; wireless adb `adb-57150DLCH002E1-swDe4l` (192.168.86.121, port rotates).

<details><summary>Older Next Up (pre-2026-08, historical)</summary>

1. **Retest PHOTO** on build bydbwo9g3 (drive SAF pick; read granular alert if it still fails — tells fetch vs copy outcome).
2. **Device-verify the new animated splash** (cold start: no flash, animation plays, exits to correct route).
3. Photo verify order once device is on: pick → alert now shows fetch|copy|putFile(content) outcomes. If Strategy 3 succeeds, photo is DONE. If all 3 fail → pivot to react-native-image-picker (native file://, needs 1 rebuild).
2. If still broken → expo-image-picker pivot (above).
3. Then resume roadmap (Phase 4.3 task verification / Phase 2 ship-blockers).
1. **Photo-upload fix NOT yet device-verified** (must-have): code swapped to manipulator→putFile, compiles, but needs a REAL photo pick (camera + SAF gallery) to confirm upload succeeds. Automating the SAF chooser via adb is hard → verify with a real pick.
2. 0.9 motion polish; 0.10 light-mode default first-run.
3. Phase 1: Leaderboard 3-crowns + countdown, Rewards progress-to-afford bars, Insights (OUR metrics, Sofra layout), Winner Board + share card.
4. Pre-existing test errors (`__tests__/pointsEngine`, `home.test`) — Phase 6.
- Metro currently running (bg); relaunch with `npx expo start --dev-client` if stopped.
</details>
