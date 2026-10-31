# Lootboard Privacy Policy

_Last updated: 2026-08-26_

> **For the owner:** host this at a public URL (GitHub Pages or termly.io) and paste
> that URL into Play Console → Store listing → Privacy Policy, and into the app's
> About screen if you switch it to a link. Replace `[EFFECTIVE DATE]` and confirm
> the support email before publishing. Keep in sync with `docs/DATA_SAFETY.md`.

Lootboard ("we", "us") is a family chore-tracking app. This policy explains what
we collect, why, and your choices. Contact: **sameerrajwade@gmail.com**.

## Who uses Lootboard
Lootboard is set up and operated by an adult account holder (a parent or
guardian). Children usually participate as **parent-managed profiles** that do not
have their own login. Where an older child joins with their own account via an
invite code, they join with a limited "child" role. Lootboard is intended for ages
13 and up; younger children should be added by a parent as managed profiles.

## Information we collect
- **Account info:** email address (via Firebase Authentication — email/password or
  Google Sign-In) for account holders.
- **Profile info:** display name, optional age, and an optional profile photo for
  each family member (entered by the account holder).
- **Family & gameplay data:** tasks, completions, points, rewards, redemptions, and
  penalties — the data that makes the app work.
- **Notification token & timezone:** if you enable notifications, a Firebase Cloud
  Messaging token and your device's timezone (e.g. `America/Chicago`) so reminders
  and daily deadlines are timed correctly. This is not precise location.
- **Identifiers:** internal account/family/member IDs used to keep each family's
  data separate.
- **Usage & diagnostics:** we use Google Firebase Analytics and Crashlytics to
  understand how the app is used and to detect crashes (screen views, feature
  events, crash reports, and device/OS diagnostics). This is used only to operate
  and improve Lootboard — never for advertising.

We do **not** collect precise location, contacts, browsing history, or financial
information, and we do **not** use advertising SDKs or sell/share your data.
<!-- OWNER: if AAID collection is left enabled (Firebase default), add a line
     disclosing the Android Advertising ID here; recommended is to disable it —
     see docs/DATA_SAFETY.md "Advertising ID — DECISION NEEDED". -->

## How we use information
Only to provide the app: authenticate you, sync your family's tasks and points,
send the notifications you opt into, and keep each family's data private to that
family. We do not sell or share your data with third parties for their own
purposes.

## How data is stored and protected
Data is stored in Google Firebase (Cloud Firestore, Firebase Storage, Firebase
Authentication). It is encrypted in transit (HTTPS/TLS) and at rest, and access is
restricted by security rules so only members of your family can read your family's
data. Google acts as our infrastructure provider (data processor).

## Children's privacy
Information about a child (first name, optional age, optional photo, and gameplay
activity) is provided and controlled by the parent/guardian account holder. We do
not knowingly collect personal information directly from children under 13, show
them ads, or use their data for profiling. A parent can view, edit, or delete a
child's profile at any time in the app, and deleting the account removes the
associated data (see below).

## Your choices and rights
- **Access/edit:** manage member profiles in the app (Family and Settings screens).
- **Notifications:** turn off anytime in Settings; we then stop using your push token.
- **Delete your data:** use **Settings → Delete account** in the app. This deletes
  your account and, if you are the family's last account holder, the entire family
  (all profiles, tasks, points, and photos). You may also email
  **sameerrajwade@gmail.com** to request deletion.

## Data retention
We keep your data while your account exists. When you delete your account, the
associated data is removed as described above. Backups are purged on our provider's
routine cycle.

## Changes to this policy
We may update this policy; we'll change the "Last updated" date and, for material
changes, notify you in the app.

## Contact
Questions or requests: **sameerrajwade@gmail.com**.
