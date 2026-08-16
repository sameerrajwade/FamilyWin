# Point Integrity Migration (Phase 1.8) — design & cutover runbook

> **Status:** designed, NOT deployed. This is a coordinated prod migration that
> touches the core write path and offline UX, so it must be executed *with* the
> user against the live project (`familywin-35a97`) in the exact order below.
> Do not deploy the tightened rules before the Cloud Functions are live and the
> client is shipped, or task completion breaks for everyone.

## The hole (today)

Points are written entirely client-side. `completeTask()` (lib/firebase.ts) does
a batch write of a `completion` **and** a `transaction { delta, source:'task' }`.
`firestore.rules` allows any family member to create transactions:

```
match /transactions/{id} { allow create: if isFamilyMember(familyId); }
```

So a technical child (modified client / direct SDK call with their own auth) can
write `{ memberId: self, delta: 9999, source:'task' }` and top the leaderboard.
The rules test `__tests__/rules/firestore.rules.test.js` documents this as
**"CURRENT HOLE"** (currently `assertSucceeds`).

## Target model (server-authoritative points)

Clients may still create/read the **completion** doc (needed for offline + fast
UI), but they may **not** write point-bearing `transactions`. All `source:'task'`
points come from a Cloud Function that reads the authoritative `pointValue` off
the task doc.

### 1. Cloud Functions (additive — safe to deploy first)

Add to `firebase/functions/index.js`:

- `onCompletionWrite` — Firestore trigger on
  `families/{familyId}/completions/{completionId}`:
  - **onCreate**, if `!wasAutoFailed` and no existing `source:'task'` transaction
    with `referenceId == completionId`: read the task, compute
    `delta = task.pointValue` (server truth — ignore any client `pointsAwarded`),
    write the transaction with `serverTimestamp()`. Idempotency key: the
    completion id as `referenceId` (reject duplicates).
  - **onDelete** (undo): if a `source:'task'` transaction references this
    completion and no reversal exists, write the reversing `-delta` transaction.
  - This preserves the current offline UX: the client writes the completion
    optimistically (works offline); the CF settles points on reconnect.
- Keep `completeTaskForDate` (missed-task catch-up) on the same trigger — it
  writes a completion, so the trigger handles its points too.

> Alternative considered: callable `completeTask`/`undoTask`. Rejected because it
> loses offline optimistic completion (callable needs connectivity). The trigger
> keeps completions offline-capable and only the *points* settle server-side.

### 2. Client changes (ship AFTER functions are live)

- `completeTask()` / `completeTaskForDate()`: write **only** the completion (drop
  the transaction from the batch). Read the resulting points for the toast from
  the task's `pointValue` locally; the leaderboard/insights already recompute
  from transactions once the CF writes them (listeners refresh).
- `undoTaskCompletion()`: delete only the completion; the CF writes the reversal.
  The existing idempotent live-completion re-resolve stays.
- Everything else (discipline, manual, bonus, redemption) is unchanged — those
  transactions stay client-written by **parents**.

### 3. Tightened rules (deploy LAST, together with the client)

Replace the transactions block in `firebase/firestore.rules`:

```
match /transactions/{transactionId} {
  allow read: if isFamilyMember(familyId);
  // Clients may NOT write task-sourced points — the Cloud Function does (admin
  // SDK bypasses rules). Parents may still log discipline/manual/bonus and the
  // redemption spend. No client may forge source:'task'.
  allow create: if isFamilyMember(familyId)
    && request.resource.data.source in ['discipline', 'manual', 'bonus', 'redemption']
    && (request.resource.data.source == 'redemption' || isParent(familyId));
  allow update, delete: if false;
}
```

- Completions: additionally reject a client-set positive `pointsAwarded` being
  trusted — the CF recomputes from the task, so no rule change is strictly
  required, but we may pin `pointsAwarded` to the task value in a later pass.
- Update `__tests__/rules/firestore.rules.test.js`: flip the **CURRENT HOLE**
  test to `assertFails`, and add: parent can still create a `discipline`
  transaction; child cannot create any `source:'task'` transaction; child can
  still create a `redemption` transaction (reward request). Re-run
  `npm run test:rules` (green) before deploying.

## Cutover runbook (ordered — do not reorder)

1. Implement CF trigger + client changes + tightened rules + updated rules tests.
2. `npm run test:rules` green; `tsc` clean; jest green.
3. **Deploy functions only:** `firebase deploy --only functions` (additive; old
   client still works — it double-writes, but the CF de-dupes on `referenceId`,
   so guard the CF to skip when a client task-transaction already exists during
   the overlap window).
4. Build + install the new client; device-verify complete/undo/catch-up award
   the right points and the leaderboard updates.
5. **Deploy rules:** `firebase deploy --only firestore:rules`. From here old
   clients can no longer forge points; the shipped client relies on the CF.
6. Watch Crashlytics + a real completion end-to-end. Roll back rules first if
   anything regresses (rules revert is instant; functions can stay).

## How the other features fold in

- **Task verification (Phase 4.3):** add `requiresApproval?: boolean` to
  `TaskDoc`. In the target model the completion carries `status:'pending'` and
  the CF withholds the transaction until a parent flips it to `approved`
  (mirrors redemptions). Cleanest to build **on top of** this trigger rather
  than the current client-award path — build 4.3 during/after this migration.
- **Negative reward points:** whatever shape we agree, the deduction becomes a
  `source:'manual'|'discipline'` transaction created by a parent (already
  allowed by the tightened rules) or a CF — no extra rules surface needed.

## Deploy gates (user runs these)

`firebase deploy --only functions` and `firebase deploy --only firestore:rules`
hit live prod (`familywin-35a97`) with real family data. Per project rules these
are user-run. The rules-loosening classifier may block me from deploying storage
rules, but firestore-rules *tightening* + functions deploys are typically fine
for the user to run directly.
