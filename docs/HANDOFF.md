# Lootboard (FamilyWin) — Session Handoff

> **New session? Start here.** Read this file, then `CLAUDE.md` (gotchas 9–16
> matter), then the top entries of `docs/PROGRESS.md`. Say:
> *"Read docs/HANDOFF.md and continue with G10."*
>
> Last updated: **2026-11-01** — Phases A–F and G1–G9 done and committed. The
> user's pre-G9 list is done too (weekly-task reset, Scores 0s, packs "for whom",
> quest line, 3D icon + wording polish, share-card redesign, invite nudge,
> feedback/rating). **Next:** the 3 expert reviews (market / brand / UX), then G10–G15.

---

## 1. State right now

| Thing | State |
|---|---|
| Branch | `main`, local only — **nothing pushed** (ask before pushing) |
| Working tree | clean. Commits after G8: `2e3196c` weekly tasks + Scores 0s · `c96a55c` polish (quest line, packs for whom, 3D icons, alert wording) · `5132be6` share cards · `4290dd8` G9 nudges/review |
| App on phone | G1–G8 build (**Chore League**) **installed 2026-11-01 18:14**, launches clean; Scores screenshot ✓ (wordmark fits, Season 1 card, "Challenge another family"). Wireless adb dropped mid-install once — `adb reconnect offline` fixed it |
| Prod Firebase | `familywin-35a97`. Rules + **12 functions** deployed on **Node 22** (Node 20 was decommissioned 2026-10-30). Last deploy: G7 rules + `createLeague`/`joinLeague`/`leaveLeague` + `onTransactionCreated` |
| Tests | app **34 suites / 479**; `tsc` 0 app-source errors; emulator: rules **54/54**, functions **70/70** |
| Phone | Pixel 10 Pro over wireless adb. If it drops off: user re-enables *Wireless debugging*; meanwhile copy the APK to `OneDrive\Desktop\Lootboard.apk` |
| Family data | Rajwade family (Sameer, Asmita, Vian, Vayu). Ledger wiped 2026-10-31. Season 1 = Oct 26 → Nov 22 |
| Pricing | **None.** Lootboard Plus was removed entirely (G1) |

### First thing to do in a new session
1. Run the 3 expert reviews the user asked for (market analyst + engagement; brand in & out; UX + customer sentiment) and bring the findings back for decisions.
2. G10 package rename / permissions (+ the `lootboard` scheme/slug).
3. Ask the user to try the league on device (Family → Family league → Start; needs a 2nd family/test account to see a real race).
4. After 01:00 UTC each night: `firebase functions:log --only dailyStreakCheck --project familywin-35a97` → confirm the F2 rewrite ran clean (it never paid bonuses before).
5. **Never tap the phone UI while the user may be holding it** — screenshots only.

---

## 2. DONE (all committed)

| Phase | What shipped (one line each) |
|---|---|
| A | Fluent 3D emoji everywhere (`<EmojiIcon>`), smarter task-emoji detector, one avatar set, reminders fixed (SDK 57 typed triggers), shared `ScreenHeader` |
| B | Kid Mode (claims → parent "Approve all"), weekly Parent Report, crowns (Top / Most improved / Goal crusher), family co-op goal |
| Redesign | Tabs Today · Scores · Rewards · Family · Settings; "edit anything"; who competes (everyone / kids only); dark-mode text tokens |
| C `291345d` | Kids' own-phone claims wait for OK, surprise packs (now bonus chests), "still open" loss reframing, allowance 300 = $1, profile 6-week trend |
| D `07feb4f` | Rules: kid completions must be pending or a penalty; server points-lock on pending claims; Sunday push names every crown; "someone passed you" push |
| E `3e4a419`, `904a70d`, `a2a10ab` | Daily quest ring, crowning screen auto-opens Mon–Wed, save-for-a-reward ring, **bounties** (new `bounties` rules), **level unlocks** (avatar frames, titles, parent perks, level-up reveal; levels from lifetime EARNED) |
| fix `f2381ae` | Daily bonus chest counts **daily tasks only** (weekly/monthly never block it) |
| F `077d5e4` | 4-week **seasons** + badges, **streak shield**, report "Is the game working?"; `dailyStreakCheck` rewritten (member timezone, shields) |
| G1 `37215f1` | Lootboard Plus removed everywhere |
| G2 `05c666a` | Positive onboarding copy (penalties described as optional) |
| G3 `1cc4e19` | Surprise packs → **bonus chests** (chest mark, +5–20 / 15–50 shown up front) |
| G4 `0fa6e7c` | Every reminder type can be switched off (default on); server pushes honour it |
| G5 `8a177ef` | Approval trust levels: `family.autoApproveUnder` (Off/10/25/50); **server** auto-approves (`approvedBy:'auto'`); parent phone catches up bonus chests on launch |
| G6 `452172f` | Starter kit by kids' ages (per-kid **assigned** tasks + 2 shared + 4 rewards, untick / add your own) + "Discover more" (Skip for now → card on Today from week 2) |
| G7 `0d4c544` | **Family vs family leagues** — see §3 "G7 as built" |

---

## 3. PENDING — Phase G (ONE launch checklist; work top to bottom)

| # | Task | Size | State |
|---|---|---|---|
| G1–G7 | see §2 | — | ✅ |
| G8 | **Name** ✅ `4ca0aa9` — **renamed to Chore League** (user: "stick with league for app name, domain later"). Research: "Chore League" looks available — no Play Store app (exact search empty), no App Store/web hits, **no USPTO filing** (official tmsearch, verified by a CHORE WARS control search). Nearest marks: CHORE (Levy Inc., live, payroll services 35/42), CHORE WARS / CHORE BOY (cleaning products) — none in kids' apps/games. ⚠️ **choreleague.com is registered** (IONOS, created 2026-01-10, no site served). Free: **choreleague.app**, thechoreleague.com, choreleagueapp.com. Recommend: user buys choreleague.app (+ a .com variant), considers an intent-to-use trademark filing (classes 9/41/42) with a lawyer's clearance, then we rename app name / wordmark / copy / notifications / share text / store listing (package rename is G10). Keep the chest mark | S–M | before G12 |
| G9 | ✅ `4290dd8` **Review prompt + gentle asks** (`lib/nudges` pure + `lib/nudgeStore` per-device). "Enjoying Chore League?" only after a perfect day (parent's own phone) or a won week, from the 4th open, 30+ days apart, max 3; Love it → Play in-app review (`expo-store-review`, store URL fallback), Not really → feedback email; Settings → Support: Send feedback / Rate. **Invite nudge** on Today for a parent alone (no kid → "Add your first player"; one grown-up → "Share family code" opens the invite card); not in the first hour, Not now = 1 week, 3 max, ✕ = never; never shown together with Discover | M | |
| G10 | Package rename, strip unused permissions, versionCode scheme (`docs/PHASE0_CHECKLIST.md`) | M | |
| G11 | Privacy policy URL, Data Safety form, **COPPA / Designed-for-Families** (invite-code self-join), advertising-ID decision (`docs/DATA_SAFETY.md`, `docs/TARGET_AUDIENCE_COPPA.md`) — **review together with the user** | M | |
| G12 | Store assets: icon 512, feature graphic, screenshots in this order: weekly showdown + crowns, Kid Mode, saving up, Parent Report; Play internal testing track | M | |
| G13 | Release signing — **user does all signing** (never handle keystore passwords) | — | |
| G14 | **Closed test with 10–20 outside families**; watch the report's health metrics (approval wait, kid-claimed %, last-place still playing) | — | before public launch |
| G15 | **iOS** via Expo/EAS once Android is settled ($99/yr Apple account; EAS cloud build, no Mac; user signs) | — | after G14 |

### G7 — family vs family: as built (`0d4c544`, deployed)
User chose the recommendations: **score = average points per competing player** (raw total shown too), **max 6 families**, other families see **family name + score only** (no kids' names/tasks).
- **Server** `firebase/functions/league.js` (pure-ish, takes `db`, emulator-tested): `createLeague` / `joinLeague` (code, rate-limited via `joinRateLimits/league_<uid>`, transactional cap 6) / `leaveLeague` (last family out deletes the league) — wrapped as **parent-only callables** in index.js (`requireParentFamily`). `onTransactionCreated` calls `league.writeStandings` on EVERY points change (before the overtaken logic; failures logged, never block it).
- **Data:** `leagues/{id}` {name, inviteCode, createdByFamily, familyIds[]}; `leagues/{id}/standings/{familyId}` {familyName, emoji 🏠, season, points, players, avgPoints, lastSeason}; `families/{id}.leagueIds` (CF-written).
- **Seasons:** UTC 4-week blocks from Mon 2026-10-26 (same numbering as `lib/seasons`). A row from an older season counts as 0 until that family scores again; on rollover the finished season moves to `lastSeason` → `seasonChampions` crowns last season's winner (shown in week 1).
- **Rules:** league + standings readable only by members of a family in `familyIds`; **no client writes**.
- **App:** `app/app/league.tsx` (start / join by code / table / share code / leave; kids see "ask a parent"), `components/ui/League.tsx` (`useFamilyLeague`, `LeagueTable`, `LeagueCard` on Scores — or "Challenge another family" for parents), "Family league" row on the Family tab, `lib/leagues.ts` (`rankLeague`, `seasonChampions`, callables, `watchLeague`).
- **Not done (later):** season-end league push notification; app uses only the family's first league (`leagueIds[0]`) — one league per family is the expected case.

---

## 4. Quick fixes / backlog (small, do anytime)
- ✅ Done 2026-11-01: packs "for whom" (each kid / one kid / everyone); weekly + monthly tasks now matched over the FAMILY week/month (`familyPeriod` + `getPeriodCompletions`) — stored weekIds are Sunday-start, family weeks Monday-start.
- Share cards: all 8 moments (win, standings, streak, recap, level, reward, perfect day, invite) share one `ShareCardBody`; **not yet eyeballed on the phone** — open one and screenshot.
- `firebase-functions` 5.1.1 → latest (CLI warns; breaking changes — separate task, run the emulator suites after).
- Level/season data reads the whole family ledger on the client (`lib/memberLevels`); fine for a household — move totals to a CF-maintained doc if ledgers get large.
- `ChildMode.tsx` card backgrounds are hard-coded light pastels (not theme tokens).
- Deferred: home-screen widget, web dashboard.
- **Device checks not yet done by the user:** family league (start/join/table — needs a 2nd family or test account), bounties end-to-end, savings ring, perks editor + level-up reveal, report "Is the game working?", streak 🛡 chip (after a 5-day week), Notifications switches, Game rules → Approvals, fresh-family onboarding (needs a test account).

---

## 5. How to work on this project (commands that work here)
- **App tests:** `npx jest --testPathIgnorePatterns="functions|rules|emulator"`
- **Type check (app sources only):** `npx tsc --noEmit -p . 2>&1 | grep -E "^(app|lib|components|store|constants|types)/"` — `jest.setup.ts` / `scripts/` errors are pre-existing noise.
- **Emulator suites** (machine has JDK 17; CLI 15 needs JDK 21, so pin CLI 13):
  `npx -y firebase-tools@13.35.1 emulators:exec --project demo-lootboard --only firestore "npx jest --config jest.rules.config.js"`
  `npx -y firebase-tools@13.35.1 emulators:exec --project demo-lootboard --only firestore,functions "npx jest --config jest.functions.config.js"` (a first-run cold-start flake can happen — re-run once)
- **Deploy (pre-authorized by the user, after tests pass):** run as a **bare command** from the repo root — `firebase deploy --only firestore:rules --project familywin-35a97` / `--only functions[:name]`. Wrapping it in `cd … &&` or pipes trips the auto-mode classifier (an `autoMode.allow` entry lives in `.claude/settings.local.json`).
- **Build:** `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (~1–2.5 min incremental).
- **Install:** adb is `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`; serial `adb-57150DLCH002E1-swDe4l._adb-tls-connect._tcp` (if missing: `adb mdns services`, wait, retry). `adb -s <serial> install -r -d android/app/build/outputs/apk/release/app-release.apk`, then launch + `logcat -d | grep FATAL`.
- **Editing gotchas found this session:**
  - Many source files are **CRLF** — multi-line scripted replacements silently don't match. Use the Edit tool, or normalise `\r\n` in the script and restore on write.
  - Bash heredocs / `sed` eat escapes (`\d`, `\'`, backticks in double-quoted bash run as commands). Prefer the Edit tool for anything with quotes, regexes or template strings, and grep the result.
  - `lib/fb.ts` wraps Firestore: DocRef now has `onSnapshot`; `snapshot.exists()` is a **method** (v26).
  - Kids can't write approved completions (rules) — anything that auto-awards must run on the server or a parent's device.
  - Managed kids only see tasks **assigned to them**; `assignedTo: null` tasks are for account holders.

---

## 6. Decisions already made (don't re-ask)
- **Positioning:** "the family league where parents play too". Target: parents of 2+ kids aged 6–12. Pitch: "Stop nagging. Start a family league."
- **Android first**; iOS once the product is settled (G15).
- **No pricing at all** (Plus removed).
- **Name: Chore League** (renamed 2026-11-01, G8). Chest mark stays. **Domain later** (choreleague.com is taken; .app and .com variants free). Internal ids (`lootboard` scheme/slug, package) change with G10.
- Icons: Fluent 3D. Dark mode: lighter **text** tokens only; fills keep brand purple. Never change brand colours/fonts.
- **Reminders:** all on by default; each type can be switched off (morning plan, evening check-in, weekly report, someone passed you, Sunday results). Quiet hours move reminders, never cancel.
- **Approvals:** every kid claim goes through approval, but families can auto-approve small tasks (Off/10/25/50; starter families get 10). "Needs approval"/"photo proof" tasks always wait for a parent.
- Kid Mode on a parent's phone; kids on their own phones claim → pending.
- Who competes: **everyone by default**, "Kids only" optional. Multiple crowns.
- **Bonus chests** (was "surprise packs"): daily +5–20 when every **daily** task is done and approved; perfect week +15–50. Range shown before opening.
- Event pushes: only "someone passed you" (user chose).
- Seasons: 4 weeks from 2026-10-26. Streak shield: 1 per 5-active-day week, hold 2.
- Allowance default 300 = $1, custom allowed; spendable points carry over.
- Easy setup: starter kit by age + add your own; advanced features "Skip for now" → back from week 2.
- Commit locally on `main` per finished item; **never push without asking**. User does **all** signing.
