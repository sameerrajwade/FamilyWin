# FamilyWin — Play Store Publishing Package

Everything needed to actually list and launch FamilyWin on the Google Play
Store. This is **not** developer documentation — it's the marketing/legal/
asset checklist a publisher needs. Fill in the placeholders before submitting.

---

## 1. App Identity

| Field | Value |
|---|---|
| **App name** | FamilyWin |
| **Package name** | `com.familywin.app` |
| **Short tagline** (≤30 chars, shown under the name) | "Chores become a game" |
| **Category** | Parenting (alt: Lifestyle / Productivity) |
| **Content rating target** | Everyone / PEGI 3 (no objectionable content; collects family member names & optional photos — see Privacy section) |
| **Default language** | English (US) |
| **Pricing** | Free (suggested for launch; revisit in-app purchase / premium tiers later) |

### Alternate name/tagline options (for A/B testing or trademark conflicts)
- "FamilyWin — Chore Game for Families"
- "FamilyWin: Points, Streaks & Rewards"
- Tagline alt: "Turn chores into a family game" / "Make chores fun. Win the week."

---

## 2. Store Listing Copy

### Short description (≤80 characters — appears in search results)
> Turn chores into a family game — earn points, climb the leaderboard, win the week!

### Full description (≤4000 characters)

```
🏆 FamilyWin turns household chores into a game your whole family will
actually want to play.

Every family member completes daily and weekly tasks to earn points.
Whoever has the most points when the week ends (Sunday at midnight) wins —
with a live leaderboard, streak bonuses, and a rewards store kids can spend
their points in.

WHY FAMILIES LOVE IT
🏆 Live Leaderboard — see exactly where you rank, updated instantly
✅ Zero Nagging — tasks and deadlines run themselves; auto-fail handles the rest
🎁 Rewards Store — kids redeem points for rewards your family sets up
🔥 Streak Bonuses — stay consistent for 7/14/30 days for big bonus points
📊 6-Week History — real insight into patterns, not just one bad day
🧒 Child Mode — a big-button, mascot-guided experience for younger kids
🔔 Smart Notifications — gentle reminders and weekly result announcements

HOW IT WORKS
1. Create your family and invite everyone with a simple 6-character code
2. Set up tasks worth Easy / Medium / Hard points
3. Everyone completes tasks right from their phone — points update instantly
4. Every Sunday at midnight, the week resets, a winner is crowned, and a new
   week begins

BUILT ON TRUST
Weekly results and streak bonuses are calculated on secure servers — never
on a device — so results are always fair. Your family's data is walled off
from every other family; nothing is ever shared, sold, or compared.

Perfect for families of any size and any age — from toddlers (with a parent-
managed profile and Child Mode) to competitive teens who love a leaderboard.

Download FamilyWin today and turn "Did you do your chores?" into "Did you
see I'm in first place?"
```

### Promo text (≤170 chars — shown in some surfaces)
> Replace nagging with a game. FamilyWin turns chores into points, streaks,
> and rewards your family will actually look forward to.

---

## 3. Keywords / ASO (App Store Optimization) Notes

Primary keywords to weave naturally into title/description:
`chores`, `family app`, `kids chores`, `chore chart`, `chore tracker`,
`family organizer`, `rewards app for kids`, `gamify chores`, `parenting app`,
`responsibility app for kids`, `allowance tracker`, `leaderboard for kids`

Competitor apps to research for positioning/reviews before launch:
chore-chart and family-organizer apps in the Parenting category — note what
reviewers praise and complain about (commonly: nagging notifications, clunky
UI for kids, lack of real-time sync, unclear point systems).

---

## 4. Visual Assets Checklist

| Asset | Spec | Status |
|---|---|---|
| **App icon** | 512 × 512 px, 32-bit PNG with alpha | ☐ Needed |
| **Feature graphic** | 1024 × 500 px JPG/PNG, no alpha | ☐ Needed |
| **Phone screenshots** | Min 2, recommend 6–8 — 16:9 or 9:16, JPG/PNG, min 320px, max 3840px | ☐ Needed |
| **7" tablet screenshots** | Optional but recommended | ☐ Optional |
| **10" tablet screenshots** | Optional | ☐ Optional |
| **Promo video** | Optional — YouTube link, 30s–2min | ☐ Optional |

### Recommended screenshot shot list (in order — tells a story)
1. **Home tab** — task list with a celebration animation mid-completion
2. **Leaderboard** — live podium with all family members
3. **Rewards store** — browsing rewards / redemption approval
4. **Task creation** — showing the Easy/Medium/Hard point system
5. **History/trends** — the 6-week chart
6. **Child Mode** — big-button simplified UI with the mascot
7. **Family management** — member profiles with photos
8. **Weekly winner announcement** — the celebratory reset moment

> Tip: Add short captions/banners onto each screenshot ("See your rank
> instantly", "No more nagging — auto-fail handles it") — listings with
> captioned screenshots consistently convert better than bare screenshots.

---

## 5. Privacy & Legal Requirements

### Privacy Policy (REQUIRED — Play Console will not let you publish without one)
Must be hosted at a stable public URL and must disclose:
- What data is collected: account email, display names, ages (optional),
  profile photos (optional), task/points history, FCM push tokens
- That data is used only within the family group and never shared across
  families or sold to third parties
- That Firebase (Google) is the backend processor — link to
  [Firebase's privacy/security documentation](https://firebase.google.com/support/privacy)
- Data retention and deletion — how a user/family can request account deletion
- Children's privacy: **because this app may be used by children, review
  whether it falls under COPPA (US) / GDPR-K (EU) / Google Play Families
  Policy** — this likely requires:
  - A "Designed for Families" declaration (or explicit exclusion + age-gating)
  - No behavioral advertising directed at children
  - Parental consent flows for any data collection from children under 13

> **Action item:** Generate a draft policy at a free tool like
> [termly.io](https://termly.io) or [freeprivacypolicy.com](https://freeprivacypolicy.com),
> then have it reviewed — the Children's-data angle makes this one of the
> most important items in this entire checklist.

### Data Safety Form (Play Console)
Google requires a declarative form describing exactly what data is collected,
whether it's shared, and why. Based on the current data model, expect to
declare:
- **Personal info**: name, email address, photos (all optional/user-provided)
- **App activity**: in-app actions (task completions), app interactions
- **Collected but not shared with third parties**
- **Encrypted in transit** (Firebase uses TLS)
- **Users can request deletion** (must provide a path to do so — e.g. an
  in-app "delete my account" flow or a support email)

### Content Rating Questionnaire
Complete Play Console's IARC questionnaire. Expected answers for FamilyWin:
no violence, no user-generated content visible outside the family group, no
gambling, no purchases of real-world goods within the app (unless reward
redemption is reframed as such — it isn't; it's a closed points economy).
Expected result: **Everyone / PEGI 3**.

### Terms of Service (recommended, not strictly required for this category)
A simple ToS covering: acceptable use, account responsibility (parents are
responsible for their family's account), disclaimer of liability for how
families choose to configure rewards/penalties, and termination rights.

---

## 6. Permissions Justification

Play Console asks you to justify "sensitive" permissions. Prepare short
explanations for each used by the app:

| Permission | Why FamilyWin needs it |
|---|---|
| Camera / Photo Library | Optional — lets a member set a profile photo |
| Notifications (POST_NOTIFICATIONS) | Daily task reminders and weekly result announcements |
| Background execution (background fetch) | Runs the auto-fail check every ~15 minutes, even when the app is closed |
| Internet / Network state | Required for Firebase real-time sync |

---

## 7. Release Management

### Release tracks (recommended order)
1. **Internal testing** — your own family + a few trusted testers (small,
   fast iteration; instant rollout)
2. **Closed testing** — a slightly wider group; collect structured feedback
3. **Open testing** (optional) — public beta; builds early reviews/installs
4. **Production** — full public release

### Release notes template (for each version bump)
```
What's new in this version:
• [Feature/fix 1 — written for end users, not engineers]
• [Feature/fix 2]
• [Feature/fix 3]

Thanks for using FamilyWin — keep winning the week! 🏆
```

### Versioning
Use semantic versioning internally (`MAJOR.MINOR.PATCH`); Play Console also
requires an incrementing integer `versionCode` in `android/app/build.gradle`
for every single upload, even patch releases.

---

## 8. Pre-Launch Checklist

- [ ] Signed release AAB built and smoke-tested on a real device
- [ ] App icon, feature graphic, and ≥2 (ideally 6–8) screenshots uploaded
- [ ] Short description, full description, and promo text finalized
- [ ] Privacy Policy URL live and linked in the listing
- [ ] Data Safety form completed and matches actual data practices
- [ ] Content rating questionnaire completed
- [ ] Target audience & "Designed for Families" declaration completed
- [ ] Support email or website listed
- [ ] Internal testing track populated with real testers, feedback collected
- [ ] Crash-free smoke test across at least 2 different Android versions/devices
- [ ] Google Play Console developer account active ($25 one-time fee)

---

## 9. Post-Launch — Reviews & Reputation

There are no reviews yet (pre-launch). Plan for this:
- **Seed initial reviews honestly** — ask the first real testing families
  (internal/closed testing track) to leave honest feedback once public
- **In-app review prompts** — use Play's official
  [In-App Review API](https://developer.android.com/guide/playcore/in-app-review)
  at a positive moment (e.g., right after a member wins their first week) —
  never incentivize or gate reviews (against Play policy)
- **Respond to every review**, especially critical ones — listing pages
  show developer replies, and responsiveness measurably improves conversion
- **Track sentiment themes** — watch specifically for comments about
  notification frequency, photo upload reliability, and the undo/auto-fail
  flows, since those are the most "fiddly" parts of the experience

---

## 10. Support Channels

Define and publish, before launch:
- A support email address (e.g. `support@familywin.app` or a Gmail alias)
- A link to the GitHub repo (for transparency / power users / contributors)
- Optionally, a simple FAQ or help page (the `docs/onboarding.html` handbook
  in this repo can double as this — link it from the store listing's website field)

---

## 11. Press Kit / Launch Announcement (optional but recommended)

A simple one-page press kit makes it easy for anyone (a parenting blog, a
local news outlet, a YouTube reviewer) to cover the app:
- App name, one-line description, longer description (reuse §2)
- 3–5 high-resolution screenshots + the app icon (transparent PNG)
- Founder/developer quote — "why I built this"
- Key facts: platforms supported, price, launch date, link to download
- Contact email for press inquiries

> Suggested location if built: `docs/press-kit.html` alongside the other
> consumer-facing pages, or a `/press` folder with downloadable assets.
