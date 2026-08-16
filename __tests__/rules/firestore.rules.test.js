/**
 * __tests__/rules/firestore.rules.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore security-rules tests (Phase 6.2 — the roadmap's "highest-value gap").
 *
 * Runs against the Firestore emulator. Do NOT run with the app's jest-expo
 * preset — this is a pure-node suite. Use the dedicated config + emulator:
 *
 *   firebase emulators:exec --only firestore \
 *     "npx jest --config jest.rules.config.js"
 *
 * These tests document the security guarantees the app depends on and will catch
 * regressions when the rules are tightened for server-side point integrity
 * (Phase 1.8). Cases tagged "CURRENT HOLE" assert today's (forgeable) behavior
 * and flip to assertFails once 1.8 lands.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-lootboard';
let testEnv;

// Auth contexts
const UID_ADMIN_A = 'uidAdminA';
const UID_CHILD_A = 'uidChildA';
const UID_ADMIN_B = 'uidAdminB';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firebase/firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed lookup docs + members with rules disabled (admin write).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/uidAdminA'), { familyId: 'famA', memberId: 'mAdminA' });
    await setDoc(doc(db, 'users/uidChildA'), { familyId: 'famA', memberId: 'mChildA' });
    await setDoc(doc(db, 'users/uidAdminB'), { familyId: 'famB', memberId: 'mAdminB' });
    await setDoc(doc(db, 'families/famA'), { name: 'Family A' });
    await setDoc(doc(db, 'families/famB'), { name: 'Family B' });
    await setDoc(doc(db, 'families/famA/members/mAdminA'), { userId: 'uidAdminA', role: 'admin_parent', displayName: 'Admin A' });
    await setDoc(doc(db, 'families/famA/members/mChildA'), { userId: 'uidChildA', role: 'child', displayName: 'Child A' });
    await setDoc(doc(db, 'families/famB/members/mAdminB'), { userId: 'uidAdminB', role: 'admin_parent', displayName: 'Admin B' });
    await setDoc(doc(db, 'families/famA/tasks/t1'), { title: 'Dishes', pointValue: 10, createdBy: 'mAdminA' });
    await setDoc(doc(db, 'families/famA/transactions/tx1'), { memberId: 'mChildA', delta: 10, source: 'task' });
    await setDoc(doc(db, 'families/famA/completions/c1'), { memberId: 'mChildA', taskId: 't1', pointsAwarded: 10 });
    await setDoc(doc(db, 'families/famA/redemptions/r1'), { memberId: 'mChildA', status: 'pending', rewardId: 'rw1' });
  });
});

const adminA = () => testEnv.authenticatedContext(UID_ADMIN_A).firestore();
const childA = () => testEnv.authenticatedContext(UID_CHILD_A).firestore();
const adminB = () => testEnv.authenticatedContext(UID_ADMIN_B).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

describe('Authentication gate', () => {
  test('unauthenticated cannot read a family doc', async () => {
    await assertFails(getDoc(doc(anon(), 'families/famA')));
  });
  test('unauthenticated cannot read members', async () => {
    await assertFails(getDoc(doc(anon(), 'families/famA/members/mAdminA')));
  });
  test('unauthenticated cannot write a transaction', async () => {
    await assertFails(setDoc(doc(anon(), 'families/famA/transactions/hack'), { delta: 999 }));
  });
});

describe('Cross-family isolation', () => {
  test('a family member can read their own family', async () => {
    await assertSucceeds(getDoc(doc(adminA(), 'families/famA')));
  });
  test('family B admin cannot read family A doc', async () => {
    await assertFails(getDoc(doc(adminB(), 'families/famA')));
  });
  test('family B admin cannot read family A members', async () => {
    await assertFails(getDoc(doc(adminB(), 'families/famA/members/mChildA')));
  });
  test('family B admin cannot read family A transactions', async () => {
    await assertFails(getDoc(doc(adminB(), 'families/famA/transactions/tx1')));
  });
  test('family B admin cannot create a task in family A', async () => {
    await assertFails(setDoc(doc(adminB(), 'families/famA/tasks/evil'), { title: 'x', pointValue: 10 }));
  });
});

describe('Role-based permissions', () => {
  test('parent can create a task', async () => {
    await assertSucceeds(setDoc(doc(adminA(), 'families/famA/tasks/t2'), { title: 'Trash', pointValue: 10, createdBy: 'mAdminA' }));
  });
  test('child cannot create a task', async () => {
    await assertFails(setDoc(doc(childA(), 'families/famA/tasks/t3'), { title: 'x', pointValue: 10 }));
  });
  test('child cannot update another member (no ownership, not parent)', async () => {
    await assertFails(updateDoc(doc(childA(), 'families/famA/members/mAdminA'), { role: 'child' }));
  });
  test('child cannot approve a redemption', async () => {
    await assertFails(updateDoc(doc(childA(), 'families/famA/redemptions/r1'), { status: 'approved' }));
  });
  test('parent can approve a redemption', async () => {
    await assertSucceeds(updateDoc(doc(adminA(), 'families/famA/redemptions/r1'), { status: 'approved' }));
  });
  test('parent can create a penalty preset', async () => {
    await assertSucceeds(setDoc(doc(adminA(), 'families/famA/penalties/p1'), { title: 'Messy room', points: 15, isActive: true }));
  });
  test('child cannot create a penalty preset', async () => {
    await assertFails(setDoc(doc(childA(), 'families/famA/penalties/p2'), { title: 'x', points: 10, isActive: true }));
  });
});

describe('Immutable audit data', () => {
  test('nobody can write weeklyScores (Cloud Function only)', async () => {
    await assertFails(setDoc(doc(adminA(), 'families/famA/weeklyScores/2026-W33'), { scores: [] }));
  });
  test('transactions cannot be updated', async () => {
    await assertFails(updateDoc(doc(adminA(), 'families/famA/transactions/tx1'), { delta: 9999 }));
  });
  test('transactions cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(adminA(), 'families/famA/transactions/tx1')));
  });
  test('completions cannot be updated', async () => {
    await assertFails(updateDoc(doc(adminA(), 'families/famA/completions/c1'), { pointsAwarded: 9999 }));
  });
});

describe('Core member abilities (current behavior)', () => {
  test('a member can create a completion for themselves', async () => {
    await assertSucceeds(setDoc(doc(childA(), 'families/famA/completions/c2'), { memberId: 'mChildA', taskId: 't1', pointsAwarded: 10 }));
  });
  test('a member can undo (delete) their own completion', async () => {
    await assertSucceeds(deleteDoc(doc(childA(), 'families/famA/completions/c1')));
  });
  // CURRENT HOLE (Phase 1.8 target): any member can forge an arbitrary points
  // transaction. This asserts today's behavior; flip to assertFails once point
  // awards are server-authoritative and client transaction writes are locked down.
  test('CURRENT HOLE: a member can forge a points transaction', async () => {
    await assertSucceeds(addDoc(collection(childA(), 'families/famA/transactions'), { memberId: 'mChildA', delta: 9999, source: 'task' }));
  });
});
