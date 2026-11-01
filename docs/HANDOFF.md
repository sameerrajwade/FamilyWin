# Lootboard (FamilyWin) — Session Handoff

> **New session? Start here.** Read this file, then `CLAUDE.md` (gotchas 9–16
> matter), then the latest entries in `docs/PROGRESS.md`. Say:
> *"Read docs/HANDOFF.md and continue with the next pending item."*
>
> Last updated: **2026-10-31** — Phase C committed; Phase D server batch built
> (committed, **NOT deployed** — see §2/§3).

---

## 1. State right now

| Thing | State |
|---|---|
| Branch | `main` (local only — **nothing pushed**) |
| Commits this session | `1a33f9d` redesign → `291345d` Phase C → Phase D (this session) |
| **Uncommitted** | none expected (Phase C + Phase D committed) |
| **Deploy** | Phase D **live in prod** (2026-10-31). Functions now on **Node 22**. Backlog: firebase-functions 5.1.1 → latest (breaking changes; CLI warns). |
| Tests | app: **26 suites / 403**; `tsc` 0 app-src errors. Emulator (use `npx firebase-tools@13.35.1`, CLI 15 needs JDK21): rules **39/39**, functions **49/49** |
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

### Phase D — one server deploy batch — **BUILT + committed, NOT deployed**
All code + emulator tests done this session. **Only step left: the user runs the
deploy**, then device-verifies.
| # | Task | State |
|---|---|---|
| D1 | **Rules**: non-parent completion must be a pending award OR a `wasAutoFailed` penalty (C3 backstop) | ✅ built; rules 39/39 |
| D2 | **Server points-lock**: `onCompletionCreated` stamps `lockedPoints` on a pending claim; award pays the locked value (server-stamped, not client) | ✅ built; functions 49/49 |
| D3 | **Sunday push** names every crown + respects `competitionMode` (`weeklyReset` + new `game.js`) | ✅ built; game 20/20 |
| D4 | **Overtaken push** — `onTransactionCreated` → `detectOvertakes` (user chose this ONE event; dropped approved/streak/parent-activity) | ✅ built |
| D-deploy | `firebase deploy --only firestore:rules,functions` — needed runtime bump Node 20→22 (20 decommissioned 2026-10-30) | ✅ **deployed 2026-10-31** |
| D-verify | device: kid self-grant blocked, edited pending claim pays locked value, overtaken push arrives | ⏳ after deploy |

### Phase E — engagement loops (client-only)
| # | Task | State |
|---|---|---|
| E1 | **Daily quest ring** on Today (`DailyQuestRing` / `ProgressRing`, `questProgress`) | ✅ built (iter 57) |
| E2 | **Save for a reward** — 📌 on Rewards, ring card, Today + Kid Mode row, once-per-device celebration (`member.savingForRewardId`) | ✅ built (iter 57) |
| E3 | **Level unlocks** — `<Avatar memberId>` frames, titles on Scores/Family, Game rules perks, profile ladder, level-up reveal; levels now from lifetime EARNED | ✅ built (iter 59) |
| E4 | **Bounties** — `BountyBoard` (Today + Kid Mode), `lib/bounties`, new `bounties` rules | ✅ built + rules deployed (iter 58) |
| E5 | **Sunday crowning ceremony** — auto-opens winner screen days 0–2 of a new week, once per device | ✅ built (iter 57) |

### Phase F — long-term + measurement
| # | Task | Size |
|---|---|---|
| F1 | 4-week **seasons** + season badges — `lib/seasons`, SeasonCard/Badges/EndCard | ✅ built (iter 60) |
| F2 | **Streak shield** — `lib/streakShield` + server `dailyStreakCheck` rewrite (deployed) | ✅ built (iter 60) |
| F3 | Report "Is the game working?" — parent days, % kid-claimed, approval wait, last-place kid active | ✅ built (iter 60) |

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
