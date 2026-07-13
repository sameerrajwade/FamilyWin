# Lootboard — Launch Roadmap v2 (Re-sequenced: UI first)

> **Supersedes `LAUNCH_ROADMAP.md`** for sequencing. The original stays as the detailed
> reference for Phases 2–7 content; this file is the authoritative **order of work** after the
> user's decision (2026-07-11) to pull **Brand + UI to the very front**, then everything else.
>
> **Execution rules (unchanged, non-negotiable):**
> 1. Never change `constants/theme.ts` / `lib/theme.tsx` brand colours without explicit approval — extend, don't replace.
> 2. Never handle keystore passwords — all signing is the user's.
> 3. No real family names/photos in marketing — Dad / Mom / Alex / Jamie placeholders.
> 4. After each phase: `npx tsc --noEmit` clean, `npm test` green, **verify on device**, then build only when asked.
> 5. Develop → test on device → show results → then deliver. Never build-and-hope.

**Root:** `C:\Users\samee\FW` · **App:** Lootboard · **Package:** `com.familywin.app` · **Firebase:** `familywin-35a97`

---

## 0. Ground truth captured this session (read before building)

- **Real palette (runtime, `lib/theme.tsx`):** primary **`#2D7AFF` blue**, accent **`#FF6B2C` orange**, **`#FFD700` gold**, dark bg `#0A0E1A` navy. Child mode flips primary→orange. **The purple in the mock artifacts was wrong** (stale brief). → **Decision needed: DEC-1** below.
- **Deps NOT installed:** `react-native-svg` (needed for the trophy mark), `expo-image-manipulator` (needed for the photo-upload fix + compression). Installing both requires **one native rebuild**.
- **Photo upload** (`lib/firebase.ts::uploadMemberPhoto`) uses `fetch(uri)→blob→ref.put(blob)` — the classic Android-broken pattern. Fix = `putFile()` on a manipulator-normalised `file://` path. **Must-have** per user.
- **Sofra source is not on this machine** (only `Sofra-v1.0.apk` + demo video). Can't copy code; the photo fix is implemented from RN-Firebase best practice instead.
- **No device currently connected** (`adb devices` empty) → on-device verify + install is **blocked until the phone is plugged in with USB debugging**.

### Open decisions (must resolve before Phase 0 code)
- **DEC-1 — Palette:** keep existing **Blue + Orange + Gold** (recommended: zero re-theme, respects rule 1, blue+gold is a strong champion pairing) **vs** switch to Purple+Gold (full re-theme of every screen — high rework). *Default if silent: keep Blue + Gold.*
- **DEC-2 — First-run theme:** default to **Light** (recommended for broad/older-gen appeal), dark opt-in.

---

## PHASE 0 — Brand & UI Foundation  ·  Priority P0  ·  ~1–2 sessions
*Goal: brand on every screen + the design system that later screens are built on. Do this first so signature screens aren't rebuilt later.*

| ID | Task | Priority | Depends on | Files |
|----|------|----------|-----------|-------|
| 0.1 | Install `react-native-svg` + `expo-image-manipulator`; prebuild + rebuild once | P0 | device | `package.json`, android |
| 0.2 | `Brand.tsx` — SVG trophy mark + wordmark lockup, themed (gold mark, blue/ink wordmark), sizes sm/md/lg | P0 | 0.1, DEC-1 | `components/ui/Brand.tsx` |
| 0.3 | Home header: brand lockup, **remove ⚠️**, add **"＋ New task"** pill, streak + "N days left to win" line | P0 | 0.2 | `app/app/tabs/index.tsx` |
| 0.4 | **Discipline relocation** (feature kept): `⚖️ Adjust points` on member profile + tap member row on Leaderboard → action sheet (🎁 Give bonus / ⚠️ Deduct points). Reuse existing `discipline/log` logic | P0 | 0.2 | `app/app/member/[id].tsx`, `app/app/tabs/leaderboard.tsx`, `app/app/discipline/log.tsx` |
| 0.5 | Brand lockup into Leaderboard / Rewards / History headers + splash→home continuity | P0 | 0.2 | 4× tab screens, `app/auth/splash.tsx` |
| 0.6 | Motion system: standard durations (150/250/400) + spring; press-scale on all touchables; list entrance stagger; shimmer loaders (no blank/spinner-only) | P1 | — | `components/ui/Animations.tsx`, screens |
| 0.7 | Default first-run theme = Light (DEC-2); keep dark/child opt-in | P1 | DEC-2 | `lib/theme.tsx` |
| 0.8 | **Photo-upload fix (must-have):** manipulator-normalise picked image (resize ≤512, jpeg) → `putFile()`; verify camera + gallery + Google Photos picker on device | P0 | 0.1, device | `lib/firebase.ts`, `app/app/member/[id].tsx`, `add-child.tsx` |

**Exit gate:** brand visible on all 5 tabs + splash; ⚠️ gone from Home, discipline reachable in 2 taps; photo upload verified working on device across 3 pickers; `tsc` clean; smoke test on device.

---

## PHASE 1 — Signature Screens (the "x-factor")  ·  Priority P1  ·  ~2 sessions
*Built on the Phase 0 system so no re-skinning later.*

| ID | Task | Priority | Depends on | Files |
|----|------|----------|-----------|-------|
| 1.1 | **Leaderboard upgrade:** trophy on #1, live week countdown, **three-crowns** row (👑 top scorer · 📈 most improved · 🎯 beat-your-goal) | P1 | 0.5, 1.6 | `leaderboard.tsx`, `lib/pointsEngine.ts` |
| 1.2 | **Rewards upgrade:** per-reward icon, **"progress-to-afford"** bar ("10 pts to go"), vault/balance card | P1 | 0.5 | `rewards.tsx` |
| 1.3 | **Insights** (rework `history.tsx`): plain-language insight cards (best day, most-dodged task, trend ▲, streak record, win-rate), nicer trend chart | P1 | 0.5 | `history.tsx`, `lib/pointsEngine.ts` |
| 1.4 | **Winner Board (NEW screen):** Monday takeover — confetti, trophy, final podium, stat tiles, **shareable winner card** (growth loop) + "new week" CTA | P1 | 0.2, weeklyScores | new `app/app/winner.tsx`, `firebase/functions` |
| 1.5 | **Celebration quality:** physics confetti + haptics on task-complete and weekly-win | P1 | 0.6 | `Animations.tsx`, `index.tsx`, `winner.tsx` |
| 1.6 | pointsEngine: add most-improved + per-child weekly-goal crown logic (also serves 4.2) | P1 | — | `lib/pointsEngine.ts`, tests |

**Exit gate:** all four signature screens on device; share-card exports an image; confetti+haptics fire; unit tests for new pointsEngine logic green.

---

## PHASE 2 — Store Ship-Blockers  ·  Priority P0-for-launch  ·  ~1 session
*(was Phase 0 in v1 — content unchanged, see `LAUNCH_ROADMAP.md §Phase 0`)*
Package-name decision · Data Safety doc · Privacy policy (COPPA) · target-audience/children policy · remove unused permissions · lock Firestore+Storage rules **+ rules unit tests** · Crashlytics + root ErrorBoundary · versionCode scheme · in-app account deletion.

## PHASE 3 — Stability, Performance, Security  ·  Priority P1  ·  ~2–3 sessions
*(was Phase 1 in v1)*
Cold-start < 2.5s · `onSnapshot` listener audit · FlatList virtualization · `React.memo`/`useCallback` · **image compression (folds into 0.8)** · Hermes + R8 · repo log cleanup · **server-side point integrity (Cloud Function)** · invite-code hardening · **App Check (Play Integrity)** · Firestore cost guardrails.

## PHASE 4 — Product Gaps & Edge Cases  ·  Priority P1/P2  ·  ~1–2 sessions
*(was Phase 4 in v1)*
Retention loop (lifetime XP/levels + monthly seasons) · **losing-child fix** (mostly delivered by 1.1 three-crowns; finish per-child goals) · **task verification** (parent-approval flag per task) · offline UX (optimistic complete, no double auto-fail) · family lifecycle (leave/promote/transfer/delete) · **empty-first-week template packs** (biggest activation lever) · the 16 edge cases (timezone auto-fail authority, clock tampering, ties, orphaned members, emoji-tofu, etc.).

## PHASE 5 — Monetization (Lootboard Plus)  ·  Priority P2  ·  ~1–2 sessions
*(was Phase 3 in v1)* RevenueCat freemium; entitlement on family doc, server-validated; contextual paywalls; never paywall the core loop or child profiles.

## PHASE 6 — Best-in-class Testing  ·  gate before rollout
*(unchanged)* unit (pointsEngine) · **Firestore rules tests** (highest-value gap) · Cloud Functions tests · integration (RNTL) · E2E (Maestro on release APK) · non-functional (perf budget, crash-free >99.5%, a11y/TalkBack, device matrix, monkey, secret scan).

## PHASE 7 — Naming & Marketing  ·  Priority P2
*(was Phase 5 in v1)* ASO, screenshots-as-story, the auto-generated Weekly Winner share card (built in 1.4), parenting channels, staged rollout 10→50→100%.

---

## Sequencing rationale (why this order avoids rework)
1. **Design tokens + motion (Phase 0) before signature screens (Phase 1)** — screens inherit the final system; no re-skin.
2. **Photo fix early (0.8)** — must-have, unblocks profile/avatars used by Leaderboard/Winner/Insights.
3. **pointsEngine crown/goal logic (1.6) before Leaderboard/Insights** — shared computation, done once.
4. **Winner share card (1.4) doubles as the marketing growth asset (Phase 7)** — build once.
5. **Server-side point integrity (Phase 3) before Monetization (Phase 5)** — don't sell Plus on a spoofable economy.
6. **Template packs (Phase 4) before marketing push (Phase 7)** — activation before acquisition.
7. **Testing gate (Phase 6) before any production rollout.**

## Current status
- Phase 0: **not started** (blocked on DEC-1 palette + device connection).
- Everything else: pending Phase 0/1.

*Created 2026-07-11. Companion: `docs/PROGRESS.md` (session state), `docs/LAUNCH_ROADMAP.md` (detailed content for Phases 2–7).*
