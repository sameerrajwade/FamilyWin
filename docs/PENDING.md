# Chore League — what's pending (as of 2026-11-02)

The one list of everything still open, grouped by who acts. Details for each review
point are in `docs/EXPERT_REVIEWS_2026-11-02.md`.

## Needs you (owner)
| # | Item | Why / notes |
|---|---|---|
| 1 | **Recruit 20 closed-test families** | Play needs ≥12 testers opted in for 14 days in a row before Production unlocks. The website's "Join the early test" button already emails you sign-ups. |
| 2 | **Firebase console → Project settings → Public-facing name = "Chore League"** | ✅ done by you; the test email showed "Chore League". |
| 3 | **Package id decision** (`com.familywin.app` vs `com.choreleague.app`) | Permanent after the first Play upload. Not needed for emails. |
| 4 | **Signing** (keystore, upload key) | You do all signing (G13). |
| 5 | **Legal review** of privacy + terms; set a data-retention period | 2025 COPPA amendments require a written retention policy. Site pages carry a "Template" note until then. |
| 6 | **Families target-audience declaration** in Play Console | Answer to match "kids under 13 via parent-managed profiles". |
| 7 | **Website go-live**: DNS `CNAME choreleague → sameerrajwade.github.io` on savvylabs.dev, then set `customDomainLive: true` | Steps in the site repo README. Today it previews at https://sameerrajwade.github.io/asavvylabs-site/ |
| 8 | **Website automatic deploys**: `gh auth refresh -s workflow`, then move `ci/pages.yml` → `.github/workflows/` | Your gh login lacks the "workflow" permission; until then `node scripts/deploy.mjs` deploys. |
| 9 | **Screenshots + demo video** for the site and store | 1080×2340 phone screenshots with generic names (Ava, Leo, Mom, Dad). Slots and names listed in the site README. |
| 10 | **Support email on the domain** (e.g. support@savvylabs.dev) | Then update `site.config.json` and `constants/strings.ts`. |
| 11 | **Sofra site fixes** | `docs/SOFRA_SITE_REVIEW_2026-11-02.md`. Enforce HTTPS today: it's served over plain http. |

## Claude can build next (no decision needed)
- Store assets (G12): feature graphic, screenshot frames from your captures, store listing copy.
- Notification digest instead of dropping pushes over the daily cap (today extra pushes are skipped).
- Results push title names the winner ("🏆 Ava won the week!") instead of the family name.
- `firebase-functions` 5 → latest (breaking changes; full emulator run after).
- VOICE.md (brand voice guide: grown-ups in kid copy, parent in settings, US spelling).
- iOS (G15) once Android is settled.

## Done in this session (highlights)
Email verification before family setup · weekly twist push at each family's week start ·
one approvals inbox (claims + rewards) with "Send back" notes · kid hears back ·
4 push/day cap · no "took the lead" for kids under 10 · twist bonus excluded from cash ·
✨ instead of 🎲 · one promo card on Today · Kid Mode spend sheet + stickers · Create Task
basics-first · push taps open the right screen · streak on daily pill · copy cleanup
(family code, Family organizer, Not this time, sets) · tagline on share cards ·
website template live · Sofra review.
