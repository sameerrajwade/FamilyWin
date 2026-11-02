/**
 * __tests__/functions/engagement.test.js
 * Weekly twist + comeback bonuses (user-approved 2026-11-01) against the
 * functions + firestore emulators: the award and its bonus land together, both
 * reference the completion, and an undo nets everything back to zero.
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js engagement"
 */
const path = require('path');
const admin = require(path.join(__dirname, '../../firebase/functions/node_modules/firebase-admin'));
const game = require(path.join(__dirname, '../../firebase/functions/game'));

if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-lootboard' });
const db = admin.firestore();

const FAM = 'famEngage';
const famRef = db.collection('families').doc(FAM);
const txCol = () => famRef.collection('transactions');
const compCol = () => famRef.collection('completions');

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
const txFor = async (id) => (await txCol().where('referenceId', '==', id).get()).docs.map((d) => d.data());
const sum = (txs) => txs.reduce((s, t) => s + (t.delta || 0), 0);

/** A Tuesday in a week whose twist is `id` (Monday weeks). */
function tuesdayOfTwistWeek(id) {
  let ms = Date.UTC(2026, 10, 2); // a Monday
  for (let i = 0; i < 20; i++, ms += 7 * 86_400_000) {
    const key = new Date(ms).toISOString().slice(0, 10);
    if (game.twistForWeek(key, {}).id === id) return new Date(ms + 86_400_000).toISOString().slice(0, 10);
  }
  throw new Error('no week for ' + id);
}

beforeAll(async () => {
  await famRef.set({ name: 'Engage Family', weekStartDay: 1 });
  await famRef.collection('tasks').doc('dishes').set({ title: 'Dishes', pointValue: 10, category: 'chores' });
  await famRef.collection('tasks').doc('read').set({ title: 'Reading', pointValue: 25, category: 'homework' });
});

describe('weekly twist bonus', () => {
  it('Double chores: a chores task pays its award + an equal twist bonus, together', async () => {
    const day = tuesdayOfTwistWeek('double-chores');
    await compCol().doc('e_chores').set({ taskId: 'dishes', memberId: 'kid', wasAutoFailed: false, serverAward: true, completedDate: day });
    const txs = await eventually(async () => { const t = await txFor('e_chores'); return t.length >= 2 ? t : null; });
    expect(txs.map((t) => t.delta).sort((a, b) => a - b)).toEqual([10, 10]);
    expect(txs.find((t) => t.source === 'bonus').reason).toBe('🧹 Double chores: Dishes');
  });

  it('…but a homework task that week gets no twist bonus', async () => {
    const day = tuesdayOfTwistWeek('double-chores');
    await compCol().doc('e_hw').set({ taskId: 'read', memberId: 'kid', wasAutoFailed: false, serverAward: true, completedDate: day });
    const txs = await eventually(async () => { const t = await txFor('e_hw'); return t.length ? t : null; });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await txFor('e_hw')).map((t) => t.delta)).toEqual([25]);
  });

  it('undo reverses the award AND the bonus (nets to zero)', async () => {
    await compCol().doc('e_chores').delete();
    const txs = await eventually(async () => { const t = await txFor('e_chores'); return t.length >= 3 && sum(t) === 0 ? t : null; });
    expect(sum(txs)).toBe(0);
  });

  it('twists switched off → plain award only', async () => {
    await famRef.set({ twistsOff: true }, { merge: true });
    const day = tuesdayOfTwistWeek('double-chores');
    await compCol().doc('e_off').set({ taskId: 'dishes', memberId: 'kid', wasAutoFailed: false, serverAward: true, completedDate: day });
    await eventually(async () => { const t = await txFor('e_off'); return t.length ? t : null; });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await txFor('e_off')).map((t) => t.delta)).toEqual([10]);
    await famRef.set({ twistsOff: false }, { merge: true });
  });
});

describe('comeback boost', () => {
  it('last place gets +10% (min 1) on each task during the new week', async () => {
    const day = tuesdayOfTwistWeek('team-week'); // team week pays no twist bonus → isolates the boost
    const monday = new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);
    await famRef.set({ comeback: { memberIds: ['underdog'], since: monday } }, { merge: true });
    await compCol().doc('e_cb').set({ taskId: 'read', memberId: 'underdog', wasAutoFailed: false, serverAward: true, completedDate: day });
    const txs = await eventually(async () => { const t = await txFor('e_cb'); return t.length >= 2 ? t : null; });
    expect(txs.map((t) => t.delta).sort((a, b) => a - b)).toEqual([3, 25]);
    expect(txs.find((t) => t.source === 'bonus').reason).toBe('🚀 Comeback boost: Reading');
  });

  it('not for anyone else', async () => {
    const day = tuesdayOfTwistWeek('team-week');
    await compCol().doc('e_cb2').set({ taskId: 'read', memberId: 'leader', wasAutoFailed: false, serverAward: true, completedDate: day });
    await eventually(async () => { const t = await txFor('e_cb2'); return t.length ? t : null; });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await txFor('e_cb2')).map((t) => t.delta)).toEqual([25]);
  });
});
