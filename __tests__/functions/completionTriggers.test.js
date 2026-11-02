/**
 * __tests__/functions/completionTriggers.test.js
 * Integration tests for the Phase 1.8 point-integrity Cloud Function triggers
 * (onCompletionCreated / onCompletionDeleted) against the functions + firestore
 * emulators. Proves the server-authoritative award/penalty/reversal logic and
 * the serverAward guard + idempotency — the highest-risk code from 1.8.
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js"
 */
const path = require('path');
// Reuse the admin SDK bundled with the functions (avoids a root install).
const admin = require(path.join(__dirname, '../../firebase/functions/node_modules/firebase-admin'));

admin.initializeApp({ projectId: 'demo-lootboard' });
const db = admin.firestore();

const FAM = 'famT';
const famRef = db.collection('families').doc(FAM);
const txCol = () => famRef.collection('transactions');
const compCol = () => famRef.collection('completions');

/** Poll until predicate(true) or timeout — CF triggers settle asynchronously. */
async function eventually(fn, { timeout = 25000, interval = 400 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}

async function txForCompletion(completionId) {
  const snap = await txCol().where('referenceId', '==', completionId).get();
  return snap.docs.map((d) => d.data());
}
const sum = (txs) => txs.reduce((s, t) => s + (t.delta || 0), 0);

beforeAll(async () => {
  await famRef.set({ name: 'Test Family', missedTaskPenalty: 'half', twistsOff: true }); // twists pinned off: amounts here must not depend on the week
  await famRef.collection('tasks').doc('t1').set({ title: 'Dishes', pointValue: 10 });
});

describe('onCompletionCreated — awards', () => {
  it('awards +pointValue for a serverAward completion (from the task, not the client)', async () => {
    // Client-set pointsAwarded is deliberately wrong — the CF must use the task.
    await compCol().doc('c_award').set({ taskId: 't1', memberId: 'm1', wasAutoFailed: false, serverAward: true, pointsAwarded: 9999 });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_award');
      return t.length ? t : null;
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(10);
    expect(txs[0].source).toBe('task');
  });

  it('IGNORES a completion without serverAward (legacy/self-awarded)', async () => {
    await compCol().doc('c_legacy').set({ taskId: 't1', memberId: 'm1', wasAutoFailed: false, pointsAwarded: 10 });
    // give the trigger time; expect NO tx ever written
    await new Promise((r) => setTimeout(r, 4000));
    expect(await txForCompletion('c_legacy')).toHaveLength(0);
  });

  it('deducts the half penalty for a wasAutoFailed miss completion', async () => {
    await compCol().doc('c_miss').set({ taskId: 't1', memberId: 'm1', wasAutoFailed: true, serverAward: true, penaltyKind: 'miss' });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_miss');
      return t.length ? t : null;
    });
    expect(txs[0].delta).toBe(-5); // half of 10
  });

  it('deducts the FULL value for an autofail completion', async () => {
    await compCol().doc('c_autofail').set({ taskId: 't1', memberId: 'm1', wasAutoFailed: true, serverAward: true, penaltyKind: 'autofail' });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_autofail');
      return t.length ? t : null;
    });
    expect(txs[0].delta).toBe(-10);
  });

  it('is idempotent — never writes a second tx for the same completion', async () => {
    // touch the same completion again (update) — must not add another award tx
    await compCol().doc('c_award').set({ taskId: 't1', memberId: 'm1', wasAutoFailed: false, serverAward: true, note: 'touched' }, { merge: true });
    await new Promise((r) => setTimeout(r, 3000));
    expect(await txForCompletion('c_award')).toHaveLength(1);
  });
});

describe('onCompletionCreated — transaction date attribution (feedback #2)', () => {
  it('stamps a NORMAL same-day completion tx at ~now', async () => {
    const t0 = Date.now();
    await compCol().doc('c_today').set({
      taskId: 't1', memberId: 'mDate', wasAutoFailed: false, serverAward: true,
      completedDate: '2026-08-25', // present, but NOT completedLate → uses now
    });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_today');
      return t.length ? t : null;
    });
    const created = txs[0].createdAt.toDate().getTime();
    // within a generous window of test start (definitely "now", not back in Aug)
    expect(Math.abs(created - t0)).toBeLessThan(120000);
  });

  it('back-dates a LATE catch-up completion tx to its own day (not this week)', async () => {
    await compCol().doc('c_late').set({
      taskId: 't1', memberId: 'mDate', wasAutoFailed: false, serverAward: true,
      completedLate: true, completedDate: '2026-08-10',
    });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_late');
      return t.length ? t : null;
    });
    expect(txs[0].delta).toBe(10);
    // createdAt must fall on 2026-08-10 (noon UTC), NOT the day the test runs.
    expect(txs[0].createdAt.toDate().toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('back-dates a MISS penalty tx to the missed day', async () => {
    await compCol().doc('c_missdate').set({
      taskId: 't1', memberId: 'mDate', wasAutoFailed: true, serverAward: true,
      penaltyKind: 'miss', completedDate: '2026-08-11',
    });
    const txs = await eventually(async () => {
      const t = await txForCompletion('c_missdate');
      return t.length ? t : null;
    });
    expect(txs[0].delta).toBe(-5);
    expect(txs[0].createdAt.toDate().toISOString().slice(0, 10)).toBe('2026-08-11');
  });
});

describe('onCompletionDeleted — reversal', () => {
  it('reverses the award to net zero when the completion is deleted (undo)', async () => {
    await compCol().doc('c_undo').set({ taskId: 't1', memberId: 'm2', wasAutoFailed: false, serverAward: true });
    await eventually(async () => (await txForCompletion('c_undo')).length === 1 || null);
    await compCol().doc('c_undo').delete();
    const balanced = await eventually(async () => {
      const t = await txForCompletion('c_undo');
      return sum(t) === 0 && t.length === 2 ? t : null;
    });
    expect(sum(balanced)).toBe(0);
  });

  it('restores points when a miss completion is deleted (catch-up)', async () => {
    await compCol().doc('c_miss2').set({ taskId: 't1', memberId: 'm3', wasAutoFailed: true, serverAward: true, penaltyKind: 'miss' });
    await eventually(async () => (await txForCompletion('c_miss2')).length === 1 || null);
    await compCol().doc('c_miss2').delete();
    const balanced = await eventually(async () => {
      const t = await txForCompletion('c_miss2');
      return sum(t) === 0 ? t : null;
    });
    expect(sum(balanced)).toBe(0); // -5 penalty + +5 restore
  });
});
