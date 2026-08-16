# Lootboard — Maestro E2E flows

End-to-end UI smoke tests for the Android app, driven by [Maestro](https://maestro.mobile.dev).
These complement the unit/integration suites (jest) and the Cloud Functions +
rules integration tests (firebase emulator) — this layer exercises the real app
on a device/emulator against the live backend.

## Prerequisites

1. Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. A running device/emulator with a **release** Lootboard APK installed
   (`appId: com.familywin.app`).
   > After the package rename to `com.lootboard.app`, update `appId` in
   > `config.yaml` and every flow header.
3. A **throwaway** family test account (never the real Rajwade family — see
   PROGRESS constraint #2). Export its credentials:
   ```bash
   export MAESTRO_EMAIL="test@example.com"
   export MAESTRO_PASSWORD="…"
   ```

## Running

```bash
# whole suite, in order
maestro test .maestro/flows

# a single flow
maestro test .maestro/flows/01-login.yaml
```

Flows 02–05 assume a logged-in session (they don't `clearState`); run `01-login`
first, or start from an already-signed-in app.

## Flows

| File | What it checks |
|------|----------------|
| `01-login.yaml` | Email/password sign-in lands inside the app |
| `02-tab-navigation.yaml` | All 5 tabs (Tasks/Scores/Insights/Rewards/Settings) open |
| `03-complete-task.yaml` | One-tap task completion from Home |
| `04-create-task.yaml` | A parent creates a task |
| `05-redeem-reward.yaml` | Rewards store renders; redeem when affordable |
| `subflows/skip-onboarding.yaml` | Gets a cold launch past the splash to login |

## Known limitations / follow-ups

- **Selectors are text-based.** The app has no `testID`s yet, so flows match by
  visible text (brittle if copy changes) and are data-dependent (e.g.
  `03-complete-task` matches a task by title). Follow-up: add `testID`s to key
  elements (`task-card`, `reward-card`, tab buttons, primary CTAs) and switch the
  flows to id selectors for stability. *(Requires a source change + rebuild — do
  it alongside the next build, not while one is running.)*
- **Not yet run on a device** — these were authored from the current UI copy;
  expect minor selector tweaks on the first real run.
- **4.3 task-verification flow** (parent approves a pending completion) is not
  included yet because the approval **UI** is still pending (backend is done +
  emulator-tested). Add `06-approve-completion.yaml` once that screen ships.
