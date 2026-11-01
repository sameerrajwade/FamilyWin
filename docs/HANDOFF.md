# Lootboard (FamilyWin) — Session Handoff

> **New session? Start here.** Read this file, then `CLAUDE.md` (gotchas 9–16
> matter), then the latest entries in `docs/PROGRESS.md`. Say:
> *"Read docs/HANDOFF.md and continue with the next pending item."*
>
> Last updated: **2026-10-31**, end of the long UX/engagement session.

---

## 1. State right now

| Thing | State |
|---|---|
| Branch | `main` (local only — **nothing pushed**) |
| Commits this session | `40393aa` checkpoint (Phase 1–5, UX A+B) → `1a33f9d` redesign |
| **Uncommitted** | **All of Phase C** (see §2) — tests green, build was running |
| Tests | `npx jest --testPathIgnorePatterns="functions\|rules\|emulator"` → **26 suites / 403 passing**; `npx tsc --noEmit -p .` → 0 errors in app sources |
| Last APK | Phase C arm64 build **installed on the Pixel 2026-10-31, launches clean (no crash)**; screens not yet eyeballed by the user |
| Phone | Pixel 10 Pro, wireless adb (paired). If offline → user re-enables *Wireless debugging* |
| Firebase | Project `familywin-35a97`; 8 functions deployed (temp admin endpoint deleted) |
| Family data | Ledger wiped to 0 on 2026-10-31; family goal "Ice cream trip 500" set by user |

### First thing to do in the new session
1. Phase C is **already installed and launch-checked**. Ask the user how it looks (surprise pack reveal, amber "still open" tasks, profile 6-week trend, allowance 300 + custom).
2. If they're happy → **commit Phase C** (message in §5). If a rebuild is needed:
   `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`, then
   `adb mdns services` → `adb connect <ip:port>` → `adb -s <ip:port> install -r -d android/app/build/outputs/apk/release/app-release.apk` (two serials may show — always `-s`).
3. **Don't tap the UI if the user is holding the phone.**
4. Then start **Phase D** (§3).
5. Ask the user to switch allowance from 500 → **300** in Family → Game rules (their saved value is still 500).

---

## 2. DONE (this session)

### Phase A — fixes (committed)
- Microsoft **Fluent 3D emoji** for every task/avatar/reward icon (`assets/emoji3d/`, `lib/emojiAssets.ts`, `<EmojiIcon>`); generator in `scripts/emoji3d/` (README).
- Smarter task emoji detector (`lib/taskEmoji.ts`, `resolveTaskEmoji`), meditation→🧘 etc.
- One avatar set / `AvatarPicker` / `<Avatar>` container for parents and kids.
- **Always-on reminders**: morning plan (parents) + evening check-in (all) + weekly Parent Report notification. Root cause fixed: SDK 57 needs typed triggers.
- Shared `ScreenHeader` (back / close) across screens.

### Phase B — Bets 1–3 (committed)
- **Kid Mode** (`app/app/kid-mode.tsx`): kid claims → pending → parent **Approve all**; grown-up math gate to exit.
- **Weekly Parent Report** (`app/app/report.tsx`).
- **Crowns** (Top / Most improved / Goal crusher) on Scores + Sunday winner screen; **family co-op goal** (`FamilyGoal.tsx`).

### Redesign (committed `1a33f9d`)
- Tabs: **Today · Scores · Rewards · Family · Settings** (Insights → hidden "Points history").
- Today: no hero banner; profile strip with points/level chip; thin goal bar; catch-up + Kid Mode tiles below tasks.
- Family tab: approvals, report, Kid Mode, members, **Set up the game**, **Game rules**.
- **Who competes**: everyone (default) or kids only (`FamilyDoc.competitionMode`).
- **Edit anything** (`app/app/manage/[kind].tsx`): tasks, rewards, penalties **and bonuses**; long-press shortcuts.
- Reward requests **lock their price**; warning when editing task points with claims waiting.
- **Dark mode contrast**: `textAccent`/`textDanger` tokens (recorded as an approved exception in CLAUDE.md).

### Phase C — trust + clean-up (**UNCOMMITTED**, tests green)
- **C1** ✅ Deleted the live `adminReversePenalties` endpoint (prod) + removed its token from code (never in git).
- **C3** ✅ Kids on their **own phones** → every completion (incl. catch-up/recover) waits for a parent OK.
- **C8** ✅ **Surprise packs** (user request): daily **5–20** when every due task is done+approved; weekly **15–50** for a 7/7 week. Parent-device award, fixed-id transactions (`lib/surprise.ts`, `lib/surprisePacks.ts`), tap-to-open reveal (`components/ui/SurprisePack.tsx`). Not revoked on undo (by design, told user). Added `runTransaction` to the `lib/fb.ts` wrapper.
- **C2** ✅ Loss reframing: missed task = amber "↻ still open" (no red ✗/strike); Scores "N done this week"; copy updated.
- **C7** ✅ Allowance default **300 pts = $1** + custom rate field. Wallet keeps carrying over (user choice).
- **C4** ✅ Profile "Last 6 weeks" trend; **fixed bug**: profile all-time/level used only the last 30 transactions.
- **C5** ✅ Tests for Family tab + Manage screen. **C6** ✅ CLAUDE.md refreshed.

---

## 3. PENDING — in agreed order (C → D → E → F, G when ready)

Size: **S** < 1h · **M** few hours · **L** a day+. "Deploy" = `firebase deploy`, user runs/approves.

### Phase C — remaining
| # | Task | Notes |
|---|---|---|
| C-final | Install, device-verify, **commit Phase C** | See §1 |

### Phase D — one server deploy batch
| # | Task | Size | Needs |
|---|---|---|---|
| D1 | **Rules**: kids' (non-parent) completions must be `status:'pending'` (closes the app-only enforcement of C3) | S | rules deploy + rules emulator test |
| D2 | **Server claim-points lock**: stamp task points on the pending completion at creation; award that on approval (replaces the edit warning) | M | functions deploy |
| D3 | **Sunday push** names every crown + respects `competitionMode` (CF `weeklyReset`) | S | functions deploy |
| D4 | **Event pushes** (FCM): *overtaken*, *your claim/reward approved*, *streak ends tonight*; maybe *N pts from your reward*, *Vian claimed 3 tasks* (to parents) | L | **user to confirm list** (recommended first three); deploy |
| D5 | Run functions + rules tests in the emulator before deploying (not run all session) | M | emulator |

### Phase E — engagement loops
| # | Task | Size |
|---|---|---|
| E1 | **Daily quest ring** on Today (progress toward the daily surprise pack) | M |
| E2 | **Save for a reward**: kid pins a reward → progress ring "Xbox time 70%" + celebration when affordable | M |
| E3 | **Level unlocks**: avatar frames/titles shown in `<Avatar>` + parent-defined real-world perks per level | L |
| E4 | **Bounties**: parent posts "first to wash the car +100" | M |
| E5 | **Sunday crowning ceremony**: auto-open winner screen on first launch after the weekly reset | S |

### Phase F — long-term + measurement
| # | Task | Size |
|---|---|---|
| F1 | 4-week **seasons** + season badges | L |
| F2 | **Streak shield** (earn one save/week) | M |
| F3 | Metrics in the Parent Report: parent active days, % kid-claimed, approval time, last-place kid still active in week 3 (`lib/analytics.ts` exists) | M |

### Phase G — Play Store launch
| # | Task | Notes |
|---|---|---|
| G1 | **Store review prompt** (user request): after the 3rd–5th app open, right after a happy moment (all done / reward approved); native in-app review sheet (`expo-store-review`, not yet installed → native rebuild) with fallback to the store URL; **max 3 asks, never after rated** (store policies forbid nagging). iOS URL is blank (Play-only) | M |
| G2 | Package rename, strip unused permissions, versionCode scheme (`docs/PHASE0_CHECKLIST.md`) | M |
| G3 | Privacy policy URL, Data Safety form, **COPPA decision** (invite-code self-join), advertising-ID decision (`docs/DATA_SAFETY.md`, `docs/TARGET_AUDIENCE_COPPA.md`) | M |
| G4 | Store assets (icon 512, feature graphic, screenshots), internal testing track | M |
| G5 | Release signing — **user does all signing** (never handle keystore passwords) | — |

### Known small issues / backlog
- Monthly tasks completed in an earlier week of the month may show as not done (Home loads only this week's completions) — also affects surprise-pack "day complete".
- `ChildMode.tsx` card backgrounds are hard-coded light pastels (fine in dark mode, but not theme tokens).
- Deferred from August: home-screen **widget**, **web dashboard**.

---

## 4. Decisions already made (don't re-ask)
- Icons: Fluent 3D. Reminders: always on (morning parents + evening all), only times adjustable; quiet hours move, never cancel.
- Kid Mode on parent's phone; every kid claim needs a parent OK (Kid Mode **and** own phones).
- Who competes: **everyone by default**, "Kids only" optional. Multiple Sunday crowns.
- Family goal: thin bar on Today. Family tab = people + game; Settings = you + app (Settings tab stays).
- Dark mode: lighter **text** tokens only; fills keep brand purple.
- Surprise packs: daily 5–20, weekly 15–50 (floors are mine — user may change).
- Allowance default 300 = $1, custom allowed. Spendable points carry over weekly.
- Commit locally on `main` only when the user approves; never push without asking.

## 5. Phase C commit message (when verified)
```
feat: Phase C — kid approvals everywhere, surprise packs, loss reframing

- Kids' own-phone completions (incl. catch-up/recover) wait for a parent OK
- Surprise packs: daily 5–20 / perfect-week 15–50, parent-device award,
  fixed-id transactions (adds runTransaction to the lib/fb wrapper),
  tap-to-open reveal on Today and in Kid Mode
- Missed tasks read as "still open" (amber), Scores shows "N done this week"
- Allowance default 300 pts = $1 + custom rate
- Profile: 6-week trend; fix all-time/level computed from only 30 tx
- Tests for Family tab + Manage; CLAUDE.md refresh; emoji generator in scripts/
- Prod: deleted the temporary adminReversePenalties endpoint
```
