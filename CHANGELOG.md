# Changelog

All notable changes to FamilyWin are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed
- **Same-day task undo** now works — root cause was a Firestore security
  rule (`allow delete: if false` on `/completions`) silently blocking the
  delete regardless of correct client-side logic. Rule updated to allow a
  member to delete their own completion (or a parent to delete on behalf of
  a managed child), and deployed to production.
- **Photo picker "stacking"** — repeated taps on the photo picker no longer
  queue up multiple delayed launches that all surface later, stacked on top
  of each other. Replaced a `setTimeout`-based approach (which was the actual
  cause) with an in-flight lock that ignores repeat taps until the first
  picker launch resolves.
- **Member photos now display in the Rewards tab** (profile switcher and
  pending-redemption rows) — these were rendering the raw emoji and missing
  uploaded photos; now use the shared `<Avatar>` component with photo→emoji
  fallback, consistent with every other screen.

### Added
- **Edit Profile** for family members — tap any member row in the Family tab
  to open a modal for changing display name, age, avatar emoji, and/or
  uploading/removing a profile photo.
- **Photo picker in "Add Child"** — new managed child profiles can now have a
  photo set at creation time, alongside the existing emoji-avatar picker.

## [Phase 4] — Firebase Migration & UI Finalization
- Migrated backend from an earlier Supabase-based design to Firebase
  (Firestore, Auth, Storage, Cloud Messaging, Cloud Functions)
- Finalized the design system (colors, typography, spacing) — see
  `constants/theme.ts`
- Completed Light / Dark / Child Mode theming

## [Phase 1–3] — Core Feature Build-Out
- Task creation, completion, and points engine
- Live leaderboard with real-time Firestore listeners
- Rewards store with parent-approval redemption flow
- Discipline event logging
- 6-week history & transaction log
- Push notifications (FCM) and local scheduled reminders
- Background auto-fail task (`expo-background-fetch`)
- Weekly reset and streak-bonus Cloud Functions
