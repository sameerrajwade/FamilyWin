# Lootboard — Target Audience & Children's Policy (Play + COPPA)

> Decides the Play Console **App content → Target audience and content** answers
> and the Privacy Policy's children section. Last reviewed: 2026-08-26.
> **Contains one OPEN DECISION for the owner — see ⚠️ below.**

## Recommendation
Declare the **target audience as 13+ (parents/guardians and teens)**, with young
children participating only as **parent-managed profiles** (data subjects, not
account holders). This keeps Lootboard out of the strict **Designed for Families**
program (which bans most ad SDKs and complicates IAP) while being truthful.

Rationale: the product is a household chore tracker operated by a parent. The core
account holder is an adult who sets up the family, tasks, rewards, and approvals.

## How accounts actually work (verified in code)
Two ways a "child" exists in a family:
1. **Managed profile (primary, recommended path)** — `createManagedMember`
   (`lib/firebase.ts`): `userId: ''`, `role: 'child'`, `isManaged: true`. No
   Firebase Auth account, no email, no sign-in. The parent completes tasks for
   them via the profile switcher. **This child never authenticates.**
2. **Self-join via invite code** — `joinFamily` Cloud Function
   (`firebase/functions/index.js`): the joiner is authenticated (their own
   Firebase UID/email) and is created **server-authoritatively as `role:'child'`**.
   So a self-joining member *does* have their own account/email.

## ⚠️ OPEN DECISION for the owner
Because path (2) lets a person with their own account join as a child, an
**under-13 could self-join if they have an account**. Google/our Auth already
gate account creation by age (Google accounts require 13+, or a Family Link
*supervised* account), so this is mostly enforced upstream — but for a clean COPPA
posture, choose one:
- **(A) Recommended:** keep self-join, and in the join UI state it's for ages 13+
  (younger kids should be added as managed profiles by a parent). Low effort;
  matches the 13+ audience declaration.
- **(B) Strictest:** disable self-join entirely; all children are parent-created
  managed profiles. Highest assurance no under-13 authenticates, at the cost of
  the invite-code convenience for teens.

Until decided, the audience declaration below assumes **(A)**.

## Play "Target audience" answers (assuming A)
- **Target age groups:** 13–17 and 18+ (do **not** check under-13, since under-13s
  are parent-managed data, not audience members with accounts).
- **Appeals to children?** The app has playful/child-friendly UI (Child Mode,
  mascot). Answer honestly: it *may* attract younger users, but they participate
  via a parent. Expect Google to ask follow-ups — be ready to explain the
  managed-profile model. If Google insists it appeals to children, you may be
  routed into Designed for Families; the managed-profile architecture + no ads +
  no data sharing is the argument against that.
- **Designed for Families program:** not enrolling (no ads, no child accounts as
  the primary model).

## COPPA / children's data (for the Privacy Policy)
- Data about children (first name, optional age, optional photo, gameplay) is
  **provided and controlled by the parent/guardian account holder**.
- No behavioral advertising, no data sharing/sale, no third-party analytics on
  child data.
- Parents can view, edit, and delete a child profile in-app (Family screen +
  Delete account), satisfying access/deletion rights.

## Follow-ups if this analysis changes
If self-join is kept AND you later add per-child login for under-13s, or add ad
SDKs/analytics, re-evaluate — that would likely trigger Designed for Families /
COPPA verifiable-parental-consent requirements. Keep `docs/DATA_SAFETY.md` in sync.
