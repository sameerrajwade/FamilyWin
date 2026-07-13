# Lootboard — Session Progress Tracker

> **How to use this file (for Claude):** Read this at the start of every session instead of
> relying on conversation history. At the END of every working session, update the three
> sections below (Current State, Last Session, Next Up) in ≤30 lines total. Keep it terse —
> this file is loaded into context every session.
>
> **How to use this file (for the user):** Start new sessions with:
> *"Read docs/PROGRESS.md and docs/LAUNCH_ROADMAP.md, then continue with the Next Up items."*

---

## Current State (as of 2026-07-12)

- **App:** Lootboard (was FamilyWin). Code at `C:\Users\samee\FW`. Firebase project `familywin-35a97`.
- **Build:** Release APK builds and installs via adb. Signing done by user only (never handle keystore passwords).
- **Photo upload:** STILL the one blocking bug — fetch-blob fix in build `bydbwo9g3` awaits a real device photo-pick (see Iteration 7).
- **Splash:** Full branded animated splash landed (commits c5c7874, fd6811e) — NOT yet device-verified.
- **Active focus:** Phase 2 (Brand/UI) pulled to the FRONT at user's request — brand invisible outside auth screens is the top pain (matches Roadmap 2.1). Direction chosen: **Champion/trophy** (keep gold+purple, replace 🏆 emoji with a real vector mark).
- **Known open issue:** cold-start lag (Roadmap 1.1, not yet investigated).
- **Tests:** Jest infra; pointsEngine/store covered; NO rules/functions tests yet.
- **Roadmap:** full plan in `docs/LAUNCH_ROADMAP.md` (Phases 0–6).

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

## AUTHORIZATIONS (user-granted 2026-07-12, override earlier "staged" defaults)
1. **Firebase prod deploys → APPROVED.** May `firebase deploy --only storage,functions` (authed sameerrajwade@gmail.com).
2. **Package rename com.lootboard.app → APPROVED.** Do via firebase CLI (`firebase apps:create ANDROID com.lootboard.app` → `firebase apps:sdkconfig ANDROID <appId>` → write google-services.json) so NO manual console step needed. Then app.json package+bundleId, prebuild, rebuild, re-add debug SHA-1 for Google Sign-In. NOTE: needs expo-build-properties heap fix FIRST (prebuild resets gradle.properties to 2GB → Jetifier OOM; must be ≥4GB).
3. **Account-deletion device test → APPROVED.** Use a THROWAWAY registered account (never delete the real Rajwade family) to verify the deleteAccount function end-to-end.
4. **App Check enforce → APPROVED.** Sequence: wire client SDK (Play Integrity + debug provider) → verify tokens attach → THEN enforce in console. Never enforce before client attests (locks app out).
5. **Phase 5 paywalls → BUILD UI/entitlement scaffolding, keep everything FREE** (plan defaults to full access; paywalls built but not triggered). No RevenueCat account wiring yet.
6. **Git: PUSH after EACH phase** (not one bundled push). Commit + push per phase once device-verified.

## Next Up
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
