# Expert reviews — 2026-11-01 (after the pre-G9 list + G9)

Three read-only reviews run by sub-agents: market analyst, brand, and UX/customer sentiment. They used real web searches, with URLs below. Many chore-app "reviews" online come from aggregators or affiliate blogs, so treat sentiment findings as directional.

**Checked by Claude before writing this file:**
- ✅ `lib/analytics.ts:16` sends `display_name` to Analytics.
- ✅ Light `success` is `#00E676` (`lib/theme.tsx:45`), so white text on it fails contrast.
- ⚠️ The UX review said there is "no auto-approve". **That is wrong:** G5 added `family.autoApproveUnder`. What's true is that it's off unless the family set up with the starter kit, and it is per-family, not per-task.
- Device check (19:30): weekly tasks done on Saturday now show ✓ on Sunday. The quest line still truncates ("All done · bonus chest earne…"), because the Task and Penalty pills squeeze it.

## Cross-review consensus (my synthesis, ranked)
| # | Item | Source | Effort |
|---|---|---|---|
| 1 | **Privacy for G11:** stop sending `display_name`/task titles to Analytics; settle the Families target-audience declaration; rename and fix the privacy policy and data-safety docs (they still say Lootboard/FamilyWin); fix About contradictions (`about.tsx:25` "children do not sign in" vs own-phone kids; `:35` "no cash" vs allowance payouts) | market + brand | S |
| 2 | **Closed test is the critical path:** new Play accounts need ≥12 testers opted in for 14 straight days. Recruit about 20 families now | market | — |
| 3 | **Push parents when a kid claims or requests a reward** (debounced: "Vayu claimed 2 tasks · +35 waiting"); push the kid on approve/reject | UX + market | M (CF) |
| 4 | **One approvals inbox** (task claims and reward requests together); badge on the Family tab; live listener + pull-to-refresh on `approvals.tsx` | UX | M |
| 5 | **Contrast:** label text on green/amber buttons and pills → `colors.text` (fills unchanged); active tab label → `textAccent`. Light `textMuted` `#9CA3AF` is about 2.5:1, but changing it is a colour change and **needs your OK** | UX | S |
| 6 | **Calmer Today header:** move the red **Penalty** pill into the long-press sheet; sort to-do before done; move "Hand phone to…" up near the profile strip | UX | S |
| 7 | **Scores order:** podium first, then Season/League/Goal | UX | S |
| 8 | **A rejected claim says why** ("Sent back: missed the floor" + Try again), reusing the reward reason modal | UX | S–M |
| 9 | **Share card → growth loop:** add the family/league invite code + deep link; at season end, prompt "start Season 2 against another family" | market | S–M |
| 10 | **Brand hygiene:** one tagline (pick "Your family's weekly showdown." or "Chores, points, wins."); one "League" colour (app orange vs card gold); rename starter "packs" → "starter sets" so they don't clash with bonus chests; voice guide `docs/VOICE.md` | brand | S |
| 11 | **Icon/splash:** square full-bleed 512 icon (corners are baked in now); keep the foreground inside the 66/108 safe zone (sparkle gets clipped); add a monochrome layer; put the wordmark on the splash | brand | S–M |
| 12 | **Against novelty fade:** a weekly/season "twist" (double-points category, parents vs kids); a comeback mechanic for last place; parent "thanks!" kudos/stickers on small dailies; teen (no-mascot) look | market | M |
| 13 | **Gentler kid-facing pushes:** "X just passed you" and streak-loss pushes become parent-opt-in for under-10s | market + brand | S |
| 14 | **Shorter Create Task:** Title/Difficulty/Assign plus "More options ▾"; sticky Create button | UX | M |
| 15 | **Kid Mode can spend points** (a "Spend points" sheet); drop the "Request sent" and "Reward approved" alerts in favour of toasts | UX | M |
| 16 | **Decide the package id before the first upload** (`com.familywin.app` is permanent once published): keep it, or switch to `com.choreleague.app` (new Firebase app + SHA-1s) — G10. Also the store name "Chore League: Family Chores", a support email on our own domain, and a USPTO check in classes 9/42 | brand | — |

---

## 1. Market analyst (condensed)
**Pitch:** "The free family game where parents play too — everyone starts at zero on Monday, whoever does the most wins Sunday."
**Persona:** Android parents with 2+ kids aged 6–12 who tried a paper chart or a kids-only app and watched it fade.

| App | Model | Evidence | Our gap |
|---|---|---|---|
| Joon | $12.99/mo | fades after 4–8 weeks; parent app needs an iPhone ([NeuroLaunch](https://neurolaunch.com/joon-app-review/)) | free, Android, parents compete |
| Homey | $4.99/mo | 2.8★ Play; free tier caps at 3 members ([CSM](https://www.commonsensemedia.org/app-reviews/homey-chores-and-allowance)) | unlimited, reliable |
| S'moresUp | ~$7.99/mo | 3.2★ Play ([apppricinglab](https://apppricinglab.com/app/google_play/com.rotation5.smoresup)) | same |
| Chorsee | free + ads | 4.57★, 675K installs, "no gamification by design" ([AppGoblin](https://appgoblin.info/apps/1611068600)) | closest free rival; we add the game and no ads |
| Greenlight/BusyKid | $4–6+/mo | bank first, chores secondary ([Finder](https://www.finder.com/kids-banking/busykid-vs-greenlight)) | not a money app |
| OurHome | dead | discontinued ([AlternativeTo](https://alternativeto.net/software/ourhome/about/)) | its users need a new home |

**90-day go-to-market at about $0:**
- **Closed test (days 0–20):** the 12-tester / 14-day rule applies ([Google](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)), and losing one tester can restart the clock ([DEV](https://dev.to/theionproject/the-12-tester-rule-that-quietly-adds-two-weeks-to-your-first-google-play-launch-4bp3)). Recruit through your own network, the school PTA and local Facebook parent groups.
- **Reddit:** r/Parenting bans promotion; use r/ParentingTech instead.
- **ASO keywords:** chore chart, chores for kids, family chore app, reward chart, allowance tracker, chore tracker, kids rewards. Put "free · no ads · no subscription" in the short description.
- **After launch:** 30-second "Sunday crowning" clips with micro-creators. Apply to Teacher Approved once Families-compliant ([Google](https://android-developers.googleblog.com/2022/11/helping-kids-and-families-find-high-quality-apps-for-kids.html?m=0)).

**Engagement, ranked:**
1. Fast parent approval (an evening batch push; default auto-approve)
2. A weekly or season "twist"
3. A comeback mechanic for last place / "most improved"
4. Kudos instead of points for small dailies (overjustification risk: [summary](https://atticusli.com/replication-crisis/overjustification-effect/))
5. Time-to-first-completion the same day
6. A teen look
7. A home-screen widget
8. An open-league pool to matchmake families

**Watch metrics:** family-level D1/D7/D30; W4/W8 retention (W8 ≥ 40%); median approval wait (< 4h); share of active families with 2+ players; whether the last-place player still plays next week; opted-in tester count.

## 2. Brand (condensed)
- **Consistent:** the in-app name, a single chest mark, and the icon/splash palette.
- **Breaks the brand:**
  - README, `docs/index.html`, `benefits.html` say FamilyWin; `PRIVACY_POLICY.md` and `DATA_SAFETY.md` say Lootboard (**must fix before submission**)
  - two taglines
  - the "League" colour drifts
  - "packs" vs "bonus chest"
  - the About contradictions
  - icon problems: baked corners, sparkle outside the safe zone, chest off-centre, lid reads as a lunchbox at small sizes
  - no wordmark on the splash
  - the flat-vector chest next to 3D emoji
- **Voice:** a coach in the stands (cheer effort, never shame); use first names; game words for kids, plain words for parents; short and specific.
  - Avoid: discipline, auto-fail, rejected, failed, "lose points", loot, "Admin Parent".
  - **Rewrites:**

    | Before | After |
    |---|---|
    | "…or you'll lose points!" | "Quick check-in: tick off what's done and bank today's points." |
    | "Log Discipline Event" | "Add a penalty or bonus" |
    | "Rejected" | "Not this time" |
    | "Auto-failed" | "Missed" |
    | "Let's Start! 🚀" | "Start our league 🏆" |
    | "…just passed you!" | "…just took the lead 👀" |
- **Brand moments:** one signature chest-open ritual reused for win, level-up and season end, with one sound; a chest with a face as the mascot for empty states and Kid Mode ([Duolingo voice/tone](https://design.duolingo.com/writing/voice)); name-first, guilt-free pushes; store screenshots built from the share-card themes.
- **Legal:** keep bonus chests unpurchasable and keep showing the range (Play's loot-box odds rules concern *sold* items — re-check the current Families policy). "Chore League" is descriptive and the space is crowded (Chore Champ, Chore Legends), so do a USPTO check and consider registering the chest logo.

## 3. UX + customer sentiment (condensed)
**Top 10 changes:**
1. Push on claim
2. One inbox
3. Contrast on green
4. Contrast on amber
5. A rejected claim explains itself
6. Today header overload / the Penalty pill
7. Sort Today to-do first
8. Podium above the fold
9. Create Task progressive disclosure + sticky Create
10. Tab-bar accessibility labels, badge, `textAccent` and Kid Mode entry placement

**Tap counts (now → proposed):**
| Loop | Now | Proposed |
|---|---|---|
| Kid Mode claim | 3 + scroll | 2 |
| Parent approves | 3, with no prompt to start | push → 2 (undo bar instead of a confirm alert) |
| Add a task | 4 + scroll | 3 |
| Kid redeems | 4, and impossible inside Kid Mode | 3, plus a Spend sheet |
| Parent approves a reward | 4 + scroll | 2 via the inbox |

**Sentiment risks:**
| Competitor complaint | Chore League today | Fix |
|---|---|---|
| Too many features, "shaky" | Today stacks up to about 11 modules | at most 1 promo card per session |
| Sync breaks | approvals screen doesn't update live | add a listener |
| Novelty fade | well covered (streaks, seasons, bounties) | keep rotating bounties |
| Subscriptions | absent | advertise "free" |
| Approval burden | auto-approve exists but is off by default, and there is no push | push + per-task "trusted" toggle |

**Quick wins:**
- Stale "Settings" copy → "Family tab" (`kid-mode.tsx:198`, `leaderboard.tsx:227`, `ProfileSwitcher.tsx:130`)
- RefreshControl on approvals
- Sort to-do first
- Toasts instead of reward alerts
- Tab badge and labels
