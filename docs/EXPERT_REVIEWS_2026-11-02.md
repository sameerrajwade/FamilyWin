# Expert re-reviews — 2026-11-02 (after icon A, twists, kudos, verification)

Three read-only sub-agent reviews on the updated app. The market review used web research; its URLs are kept below. The first round is in `EXPERT_REVIEWS_2026-11-01.md`.

**Claude checked these claims in code before writing this file:**
- ✅ `streak` is not passed to `AdultTaskCard` (`app/app/tabs/index.tsx`), so the daily pill always says "Daily".
- ✅ Server pushes (kid claims, weekly twist, results, overtaken) are not routed when tapped. Only Expo's local-notification listener exists; RN Firebase `onNotificationOpenedApp` / `getInitialNotification` are wrapped in `lib/fb.ts` but never called.
- ✅ The allowance rate is fixed at 300 pts = 1 unit (`lib/pointsEngine.ts:304`). That is why the twist "inflation" risk is real.

## Scorecards (1–10)
| Area | Score | Δ vs first round |
|---|---|---|
| **Market** — fit | 7.5 | +0.5 |
| Market — differentiation | 8 | +1 |
| Market — engagement / retention design | 8 | +1.5 |
| Market — viral / growth loops | 5 | +0.5 |
| Market — launch readiness | 4.5 | +0.5 |
| **Brand** — visual identity | 8 | +2 |
| Brand — icon / store presence | 7.5 | +2.5 |
| Brand — voice & tone | 6.5 | +1 |
| Brand — share-card power | 8 | +2 |
| Brand — naming / legal | 5.5 | +0.5 |
| **UX** — first-run clarity | 6 | −0.5 |
| UX — Today noise / hierarchy | 5 | +0.5 |
| UX — core-loop speed | 6.5 | +1.5 |
| UX — accessibility | 7 | +1.5 |
| UX — kid-friendliness | 6.5 | +0.5 |
| UX — parent efficiency | 6 | +1 |

## Combined points (Claude's synthesis, ranked)
| # | Point | From | Effort | Needs user? |
|---|---|---|---|---|
| 1 | **Server pushes open the right screen** (claims → Approvals, twist → Today, results → Scores): call `onNotificationOpenedApp` + `getInitialNotification` | UX | S | no |
| 2 | **Streak number on the daily pill**: pass `streak` to `AdultTaskCard` | UX | S | no |
| 3 | **Badge dead end**: reward requests in the Approvals inbox (one list), and make the Today card, Family row and badge counts agree | UX | M | no |
| 4 | **Sticker bar is an overlay** (it pushes the list down about 80 px for 9 s), with no Alert on top of it | UX | S | no |
| 5 | **Twist waits** until the family has 2+ players and the welcome tour is done | UX | S | no |
| 6 | **One promo slot on Today** (Kudos > Invite > Discover > Twist line); hide an empty parent BountyBoard | UX + market | S–M | no |
| 7 | **Copy leftovers:** "Rejected" → "Not this time"; history reason "Auto-failed:" → "Missed (deadline):" (deploy); "Admin Parent" → "Family organizer"; one name for the code ("family code"); "packs" → "sets"; README → Chore League; delete the dead strings in constants/strings.ts | brand | S | no |
| 8 | **Overtaken push:** "{name} just took the lead 👀", at most 1/day, and parent opt-in for kids under 10 | brand + market | S | **yes** — age gate wording |
| 9 | **Twist bonus vs pocket money:** twist/comeback bonus points inflate the cash value. Options: exclude bonus txs from allowance, or cap the twist bonus per week | market | S–M | **yes** — pick one |
| 10 | **🎲 symbol** can hint at gambling to Families reviewers → ✨ or 🔄 | brand | S | **yes** — taste |
| 11 | **Notification cap:** at most ~4/day per person, the rest folded into a digest | market | M | **yes** |
| 12 | **Share cards → growth:** family/league invite code + deep link on cards; "challenge another family" at season end | market | M | **yes** — deep link needs the package/scheme decision |
| 13 | **COPPA 2025 rule (in force 2026-04-22):** written data-retention policy (e.g. inactive families deleted after 12 months) + security program; settle the Families target-audience declaration | market | M | **yes** |
| 14 | **Kid Mode:** stickers + twist chip visible; "points to spend" opens a Spend sheet | UX | M | no |
| 15 | **"Send back" with a reason** on claims (+ kid push on approve/send back) | UX + market | S–M | no |
| 16 | **Rewards loop:** toasts instead of 2 alerts; pending requests above the grid | UX | S | no |
| 17 | **Create Task:** Title / Difficulty / Assign + "More options ▾", sticky Create | UX | M | no |
| 18 | **Splash wordmark + tagline lockup**; tagline on share cards instead of "The family chore game" | brand | S | no |
| 19 | **Closed test:** recruit 20 families now (12 testers × 14 days gate) | market | — | **user** (owner said he'll do it) |
| 20 | **Package id** before the first upload; USPTO check; support email on own domain | brand + market | — | **yes** |

Already fixed from these reviews (`551a7f3`): the twist example used Vian/Vayu's real names (now Ava/Leo), and the comeback copy said "last place" (now "a fresh start").

---

## Market (condensed)
- Market fit holds: free, no ads, Android-first, parents compete. Homey is $4.99/mo ([listing](https://apps.apple.com/us/app/id1033286805)) and Joon is paid ([listing](https://apps.apple.com/app/apple-store/id1482225056)). No rival ships twists + comeback + family leagues + points-free praise together ([2026 roundup](https://heynori.com/article/family-operations-system/best-family-chore-apps)).
- New risks:
  - **Points inflation into cash** (twists +50–100% per category, at 300 pts = 1 unit).
  - **Gaming:** kids chase the twist category and leave other tasks for the weekend.
  - **Comeback in 2-kid families:** it flips between the two kids each week, or always marks the youngest (consider requiring >0 points, or "most improved" framing).
  - **Sibling heat:** passed-you push + team week + podium.
  - **Notification fatigue:** about 8 push types.
- Kudos (praise, no points) is the right counterweight to overjustification ([Greene et al. 1976](https://eclass.uowm.gr/modules/document/file.php/NURED262/%CE%A0%CE%A1%CE%A9%CE%A4%CE%9F%CE%A4%CE%A5%CE%A0%CE%91%20%CE%91%CE%A1%CE%98%CE%A1%CE%91/Greene%20et%20al%20overjustification%201976.pdf)).
- COPPA amendments ([Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/coppa-rule-amendment-compliance-deadline-approaches), [Alston](https://www.alston.com/en/insights/publications/2025/01/ftc-finalizes-amendments-coppa-rule)): our policy says data is kept "while your account exists", which is not enough. Play Families: [policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en). AD_ID is already removed.

## Brand (condensed)
- **Wins:** the glossy chest now drives icon, splash, header and cards; gold "League" is consistent; the icon is full-bleed with a correct safe zone and a monochrome layer; share cards carry the wordmark, context, top 3 and a CTA.
- **Open:**
  - The splash has no wordmark.
  - Copy leftovers (point 7).
  - "family code" vs "invite code".
  - "packs" vs bonus chests.
  - VOICE.md (grown-ups in kid copy, parent in settings; pick US spelling — "Behavior").
  - Results push title should name the winner, not the family.
  - 🎲.

## UX (condensed)
- **Today stack:**
  - Parent alone: 8 modules plus 2 modals on day 1 (the welcome tour **and** the twist pop-up).
  - Active family: about 10 on a normal day, up to 13.
  - Kid Mode: 5–7, calm.
- **Tap counts:**

  | Loop | Taps |
  |---|---|
  | Kid Mode claim | scroll + 2 |
  | Approve one claim | 2 |
  | Approve all | 3 |
  | Add task | 3 + scroll |
  | Redeem | 4, impossible in Kid Mode |
  | Approve reward | 4 + scroll |

- **Regressions:**
  - The sticker bar shifts the list.
  - The badge, Today card and Family row show different counts.
  - Twist intro and hide are stored per device, not per person.
  - The verification gate has no "Open email app" button.
  - Scores still puts the champion banner, twist and crowns above the podium.
