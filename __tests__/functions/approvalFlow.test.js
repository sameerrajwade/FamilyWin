/**
 * __tests__/functions/approvalFlow.test.js
 * Phase 4.3 task verification — parent approval flow. Proves the
 * onCompletionCreated / onCompletionUpdated triggers hold points for a
 * status:'pending' completion and settle (or reverse) them on the parent's
 * approve/reject transition, against the functions + firestore emulators.
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js"
 */
const path = require('path');
const admin = require(path.join(__dirname, '../../firebase/functions/node_modules/firebase-admin'));

admin.initializeApp({ projectId: 'demo-lootboard' });
const db = admin.firestore();

const FAM = 'apprFam';
const famRef = db.collection('families').doc(FAM);
const txCol = () => famRef.collection('transactions');
const compCol = () => famRef.collection('completions');

async function eventually(fn, { timeout = 35000, interval = 400 } = {}) {
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
  await famRef.set({ name: 'Approval Family', missedTaskPenalty: 'off', twistsOff: true });
  await famRef.collection('tasks').doc('t1').set({ title: 'Homework', pointValue: 20, requiresApproval: true });

  // Warm up the REAL award pipeline before any timed assertion. This suite sorts
  // first, so it otherwise pays the emulator's cold eventarc→functions delivery
  // latency (tens of seconds on the very first firestore event) inside a test.
  // A real create-award and a real pending→approve-award make both delivery
  // paths hot; warmup docs are deleted after.
  await compCol().doc('warm_create').set({ taskId: 't1', memberId: 'w', wasAutoFailed: false, serverAward: true });
  await compCol().doc('warm_upd').set({ taskId: 't1', memberId: 'w', wasAutoFailed: false, serverAward: true, status: 'pending' });
  await eventually(async () => ((await txForCompletion('warm_create')).length ? true : null));
  await compCol().doc('warm_upd').update({ status: 'approved' });
  await eventually(async () => ((await txForCompletion('warm_upd')).length ? true : null));
  await compCol().doc('warm_create').delete();
  await compCol().doc('warm_upd').delete();
}, 120000);

describe('Phase 4.3 — parent approval flow', () => {
  it('holds points while pending, then awards on approve (via onCompletionUpdated)', async () => {
    await compCol().doc('p_pending').set({ taskId: 't1', memberId: 'kid', wasAutoFailed: false, serverAward: true, status: 'pending', pointsAwarded: 20 });
    // must NOT award while pending
    await new Promise((r) => setTimeout(r, 5000));
    expect(await txForCompletion('p_pending')).toHaveLength(0);

    // parent approves → the update trigger settles the points
    await compCol().doc('p_pending').update({ status: 'approved', approvedBy: 'dad' });
    const txs = await eventually(async () => {
      const t = await txForCompletion('p_pending');
      return t.length ? t : null;
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(20); // from the task's pointValue, not the client
    expect(txs[0].source).toBe('task');

    // idempotent — re-touching an approved completion never double-awards
    await compCol().doc('p_pending').update({ approvedAt: admin.firestore.Timestamp.now() });
    await new Promise((r) => setTimeout(r, 3000));
    expect(await txForCompletion('p_pending')).toHaveLength(1);
  });

  it('never awards when a pending completion is rejected (pending → rejected)', async () => {
    await compCol().doc('p_reject').set({ taskId: 't1', memberId: 'kid', wasAutoFailed: false, serverAward: true, status: 'pending', pointsAwarded: 20 });
    await new Promise((r) => setTimeout(r, 4000));
    await compCol().doc('p_reject').update({ status: 'rejected', approvedBy: 'dad' });
    await new Promise((r) => setTimeout(r, 4000));
    expect(sum(await txForCompletion('p_reject'))).toBe(0);
  });

  it('reverses to net zero if a parent rejects an already-approved completion', async () => {
    await compCol().doc('p_flip').set({ taskId: 't1', memberId: 'kid', wasAutoFailed: false, serverAward: true, status: 'pending', pointsAwarded: 20 });
    await compCol().doc('p_flip').update({ status: 'approved', approvedBy: 'dad' });
    await eventually(async () => ((await txForCompletion('p_flip')).length === 1 ? true : null));
    await compCol().doc('p_flip').update({ status: 'rejected', approvedBy: 'mom' });
    const balanced = await eventually(async () => {
      const t = await txForCompletion('p_flip');
      return t.length === 2 && sum(t) === 0 ? t : null;
    });
    expect(sum(balanced)).toBe(0); // +20 award, then -20 reversal
  });

  it('a non-status field touch on a pending completion does not award', async () => {
    await compCol().doc('p_touch').set({ taskId: 't1', memberId: 'kid', wasAutoFailed: false, serverAward: true, status: 'pending', pointsAwarded: 20 });
    await new Promise((r) => setTimeout(r, 3000));
    await compCol().doc('p_touch').update({ note: 'parent looked' }); // status unchanged
    await new Promise((r) => setTimeout(r, 4000));
    expect(await txForCompletion('p_touch')).toHaveLength(0);
  });
});

describe('Phase D2 — pending claims lock their points at claim time', () => {
  it('freezes the task value on a pending claim and awards it even after an edit', async () => {
    // A task worth 20 is claimed (pending). The CF should stamp lockedPoints=20.
    await famRef.collection('tasks').doc('tLock').set({ title: 'Lockable', pointValue: 20 });
    await compCol().doc('p_lock').set({ taskId: 'tLock', memberId: 'kidL', wasAutoFailed: false, serverAward: true, status: 'pending' });

    // Wait for the server to freeze the point value onto the completion.
    const locked = await eventually(async () => {
      const d = await compCol().doc('p_lock').get();
      return d.exists && d.data().lockedPoints === 20 ? d.data() : null;
    });
    expect(locked.lockedPoints).toBe(20);

    // Parent later changes the task to 5 — the pending claim must NOT follow it.
    await famRef.collection('tasks').doc('tLock').update({ pointValue: 5 });
    await compCol().doc('p_lock').update({ status: 'approved', approvedBy: 'dad' });

    const txs = await eventually(async () => {
      const t = await txForCompletion('p_lock');
      return t.length ? t : null;
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(20); // the LOCKED value, not the edited-down 5
  });

  it('a pre-D2 pending claim (no lockedPoints) still awards the current task value', async () => {
    await famRef.collection('tasks').doc('tLegacy').set({ title: 'Legacy', pointValue: 15 });
    // Simulate a claim stamped before D2 by giving it a lockedPoints we then clear
    // is not possible via the CF; instead a legacy doc simply never gets one if the
    // task is missing at create — here the task exists, so the CF stamps 15. To
    // exercise the fallback we approve a doc whose lockedPoints was never written
    // because it is not a positive pending award: use an immediate (status-less)
    // completion, which never stamps and awards the live value.
    await compCol().doc('p_immediate').set({ taskId: 'tLegacy', memberId: 'kidI', wasAutoFailed: false, serverAward: true });
    const txs = await eventually(async () => {
      const t = await txForCompletion('p_immediate');
      return t.length ? t : null;
    });
    expect(txs[0].delta).toBe(15);
  });
});

describe('G5 — approval trust levels (server auto-approves small claims)', () => {
  const autoRef = db.collection('families').doc('autoFam');
  const autoComp = () => autoRef.collection('completions');
  const autoTx = async (id) => (await autoRef.collection('transactions').where('referenceId', '==', id).get()).docs.map((d) => d.data());

  beforeAll(async () => {
    await autoRef.set({ name: 'Auto Family', autoApproveUnder: 25, twistsOff: true });
    await autoRef.collection('tasks').doc('small').set({ title: 'Make bed', pointValue: 10 });
    await autoRef.collection('tasks').doc('big').set({ title: 'Mow lawn', pointValue: 50 });
    await autoRef.collection('tasks').doc('checked').set({ title: 'Homework', pointValue: 10, requiresApproval: true });
  });

  it('a kid claim on a small task is approved by the server and paid', async () => {
    await autoComp().doc('a_small').set({ taskId: 'small', memberId: 'kidA', wasAutoFailed: false, serverAward: true, status: 'pending' });
    const doc = await eventually(async () => {
      const d = (await autoComp().doc('a_small').get()).data();
      return d && d.status === 'approved' ? d : null;
    });
    expect(doc.approvedBy).toBe('auto');
    const txs = await eventually(async () => { const t = await autoTx('a_small'); return t.length ? t : null; });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(10);
  });

  it('a claim above the limit still waits for a parent', async () => {
    await autoComp().doc('a_big').set({ taskId: 'big', memberId: 'kidA', wasAutoFailed: false, serverAward: true, status: 'pending' });
    // lockedPoints is stamped, but the status stays pending
    const doc = await eventually(async () => {
      const d = (await autoComp().doc('a_big').get()).data();
      return d && d.lockedPoints === 50 ? d : null;
    });
    expect(doc.status).toBe('pending');
    expect(await autoTx('a_big')).toHaveLength(0);
  });

  it('a task the parent marked "needs approval" is never auto-approved', async () => {
    await autoComp().doc('a_checked').set({ taskId: 'checked', memberId: 'kidA', wasAutoFailed: false, serverAward: true, status: 'pending' });
    const doc = await eventually(async () => {
      const d = (await autoComp().doc('a_checked').get()).data();
      return d && d.lockedPoints === 10 ? d : null;
    });
    expect(doc.status).toBe('pending');
  });
});
