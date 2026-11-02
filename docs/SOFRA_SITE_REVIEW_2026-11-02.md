# Sofra website review (sofra.savvylabs.dev) — 2026-11-02

Read-only review of `sameerrajwade/sofra-site`. Most of these points are already
fixed in the Chore League site template (`sameerrajwade/asavvylabs-site`), which
can serve as the model for the Sofra fixes.

## What's good
- Strong SEO basics: canonical URLs, Open Graph/Twitter tags, `MobileApplication` + `FAQPage` JSON-LD, sitemap, robots.txt.
- Light and dark mode with a no-flash theme script; theme colour tokens.
- Clear structure: hero → demo video → pillars → feature grid → share wall → screens → how-it-works → FAQ → trust → CTA.
- Legal and trust pages exist: privacy, terms, security.

## Issues, most important first
| # | Issue | Why it matters | Fix |
|---|---|---|---|
| 1 | **HTTPS is not enforced**: Pages reports `https_enforced: false` and the URL is `http://sofra.savvylabs.dev` | Browsers flag "Not secure", Play may reject an http privacy-policy URL, and traffic can be tampered with | Settings → Pages → tick **Enforce HTTPS** (once the certificate shows as issued). Two-minute fix. |
| 2 | **Header, footer and nav are copy-pasted into every page**; updates go through one-off Python scripts (`tools/update-site-121.py`) | Pages drift apart; every release needs a new script; easy to miss a page | Shared partials + one build script (as in `asavvylabs-site/scripts/build.mjs`) |
| 3 | **FAQ is written twice**: once in HTML and again in the JSON-LD | The two copies drift (Google may treat mismatches as spam) | Generate both from one `faq.json` |
| 4 | **4.5 MB autoplay video on the home page** | Slow first load on phones and mobile data; hurts Core Web Vitals and SEO | `preload="none"` + poster + tap to play, or a compressed ≤ 2 MB WebM/MP4 |
| 5 | **Third-party Google Fonts** | An extra privacy-relevant request (GDPR) on every page, plus a slower first paint | Self-host the font files |
| 6 | **No Content Security Policy, no `security.txt`** | A "Security" page without the basics looks thin to reviewers and researchers | CSP `<meta>` + `/.well-known/security.txt` |
| 7 | **Screenshots without width/height, PNG only** | Layout shift while images load; heavy files | Add `width`/`height` and `loading="lazy"`; consider WebP |
| 8 | **Support is a Gmail address** (`sofra.support@gmail.com`) | Looks less established; email can't be tied to the domain | `support@savvylabs.dev` (Google Workspace / Zoho / Cloudflare Email Routing) |
| 9 | **No account-deletion page** | Google Play requires a web URL where users can request account deletion | A `support.html#delete` section like Chore League's |
| 10 | **No 404 page, no skip link, nav uses `class="active"` without `aria-current`** | Accessibility and polish | Add a `404.html`, a skip link and `aria-current="page"` |
| 11 | **No company identity**: footer says "© 2026 Sofra" | Stores and parents look for who's behind the app | "© 2026 SavvyLabs. Sofra is a SavvyLabs product." + link |
| 12 | **No build checks**: a broken link or image ships silently | Quality regressions go unnoticed | Fail the build on broken links or missing assets (Chore League template does this) |
| 13 | **Sitemap has no `lastmod`** | Search engines re-crawl less smartly | Generate the sitemap with `lastmod` |
| 14 | **Testimonials commented out** | Social proof is the strongest trust signal for family apps | Add 2–3 real quotes with permission |

## Suggested order
1. Enforce HTTPS (today).
2. Account-deletion section + support email on the domain.
3. Move to the shared-partials build (copy `scripts/build.mjs` and adapt), which fixes 2, 3, 10, 12 and 13 in one go.
4. Video and image performance (4, 7) and self-hosted fonts (5).
5. CSP + `security.txt` (6), company footer (11), testimonials (14).
