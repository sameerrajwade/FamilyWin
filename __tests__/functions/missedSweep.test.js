/**
 * __tests__/functions/missedSweep.test.js
 * Tests the timezone-aware missed-task sweep (firebase/functions/sweep.js):
 *   • pure helpers (local date key, grace window, weekId) — timezone correctness
 *   • runMissedTaskSweep against the firestore emulator — writes the right miss
 *     completions, respects assignment/off-mode/already-done, is idempotent, and
 *     (end-to-end) the onCompletionCreated trigger then deducts the penalty.
 *
 *   firebase emulators:exec --project demo-lootboard --only firestore,functions \
 *     "npx jest --config jest.functions.config.js"
 */
const path = require('path');
const admin = require(path.join(__dirname, '../../firebase/functions/node_modules/firebase-admin'));
const sweep = require(path.join(__dirname, '../../firebase/functions/sweep'));

admin.initializeApp({ projectId: 'demo-lootboard' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

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

// A fixed clock: 2026-08-16T03:00:00Z.
// UTC local day  = 2026-08-16 → grace days [2026-08-15, 2026-08-14]
// LA  local day  = 2026-08-15 (UTC-7 PDT, 20:00) → grace days [2026-08-14, 2026-08-13]
const NOW = new Date('2026-08-16T03:00:00Z');

describe('sweep helpers — timezone correctness', () => {
  it('localDateKey resolves the calendar day per timezone', () => {
    expect(sweep.localDateKey(NOW, 'UTC')).toBe('2026-08-16');
    expect(sweep.localDateKey(NOW, 'America/Los_Angeles')).toBe('2026-08-15');
    expect(sweep.localDateKey(NOW, 'Asia/Kolkata')).toBe('2026-08-16');
  });

  it('localDateKey falls back to UTC for an unknown timezone', () => {
    expect(sweep.localDateKey(NOW, 'Not/AZone')).toBe('2026-08-16');
  });

  it('graceDaysBefore returns the two days before, most-recent first', () => {
    expect(sweep.graceDaysBefore('2026-08-16')).toEqual(['2026-08-15', '2026-08-14']);
    // across a month boundary
    expect(sweep.graceDaysBefore('2026-03-01')).toEqual(['2026-02-28', '2026-02-27']);
  });

  it('weekIdForKey matches the app week format', () => {
    expect(sweep.weekIdForKey('2026-08-15')).toMatch(/^2026-W\d{2}$/);
  });

  it('localParts returns the local calendar day AND hour per timezone', () => {
    // NOW = 03:00 UTC
    expect(sweep.localParts(NOW, 'UTC')).toEqual({ dateKey: '2026-08-16', hour: 3 });
    // UTC-7 (PDT) → previous day, 20:00
    expect(sweep.localParts(NOW, 'America/Los_Angeles')).toEqual({ dateKey: '2026-08-15', hour: 20 });
    // UTC+5:30 → same day, 08:00
    expect(sweep.localParts(NOW, 'Asia/Kolkata')).toEqual({ dateKey: '2026-08-16', hour: 8 });
  });

  it('resolveDeadlineHour clamps + defaults to 9 PM', () => {
    expect(sweep.resolveDeadlineHour({ missedTaskDeadlineHour: 20 })).toBe(20);
    expect(sweep.resolveDeadlineHour({ missedTaskDeadlineHour: 0 })).toBe(0);
    expect(sweep.resolveDeadlineHour({})).toBe(21);          // default
    expect(sweep.resolveDeadlineHour({ missedTaskDeadlineHour: 99 })).toBe(21); // out of range → default
    expect(sweep.resolveDeadlineHour(null)).toBe(21);
  });

  it('isDailyAssignedTo only matches active daily tasks assigned to the member', () => {
    expect(sweep.isDailyAssignedTo({ recurrence: 'daily', assignedTo: 'm1' }, 'm1')).toBe(true);
    expect(sweep.isDailyAssignedTo({ recurrence: 'daily', assignedTo: ['m1', 'm2'] }, 'm2')).toBe(true);
    expect(sweep.isDailyAssignedTo({ recurrence: 'daily', assignedTo: 'm1' }, 'm2')).toBe(false);
    expect(sweep.isDailyAssignedTo({ recurrence: 'weekly', assignedTo: 'm1' }, 'm1')).toBe(false);
    expect(sweep.isDailyAssignedTo({ recurrence: 'daily', assignedTo: 'm1', isActive: false }, 'm1')).toBe(false);
    expect(sweep.isDailyAssignedTo({ recurrence: 'daily' }, 'm1')).toBe(false); // unassigned
  });
});

describe('runMissedTaskSweep — against the emulator', () => {
  const FAM = 'sweepFam';
  const famRef = db.collection('families').doc(FAM);
  const compCol = () => famRef.collection('completions');
  const txCol = () => famRef.collection('transactions');
  // task created well before the window so it's eligible on every grace day
  const CREATED = Timestamp.fromDate(new Date('2026-08-01T00:00:00Z'));

  beforeAll(async () => {
    await famRef.set({ name: 'Sweep Family', missedTaskPenalty: 'half', twistsOff: true });
    // m1: UTC, has a daily task assigned → should be penalized for 08-15 & 08-14
    await famRef.collection('members').doc('m1').set({ displayName: 'Alex' });
    await famRef.collection('members').doc('m2').set({ displayName: 'Jamie' });
    await famRef.collection('notificationConfigs').doc('m1').set({ timezone: 'UTC' });
    await famRef.collection('notificationConfigs').doc('m2').set({ timezone: 'America/Los_Angeles' });
    // daily task assigned to m1 (pv 20 → half penalty 10)
    await famRef.collection('tasks').doc('daily1').set({
      title: 'Make bed', pointValue: 20, recurrence: 'daily', isActive: true, assignedTo: 'm1', createdAt: CREATED,
    });
    // a daily task NOT assigned to anyone → never swept
    await famRef.collection('tasks').doc('dailyUnassigned').set({
      title: 'Family chore', pointValue: 30, recurrence: 'daily', isActive: true, createdAt: CREATED,
    });
    // a weekly task assigned to m1 → never swept (not daily)
    await famRef.collection('tasks').doc('weekly1').set({
      title: 'Mow lawn', pointValue: 50, recurrence: 'weekly', isActive: true, assignedTo: 'm1', createdAt: CREATED,
    });
    // m1 already completed the daily task on 08-15 → that day must be skipped
    await compCol().doc('done_0815').set({
      taskId: 'daily1', memberId: 'm1', completedDate: '2026-08-15',
      wasAutoFailed: false, pointsAwarded: 20, serverAward: true,
    });
  });

  it('writes miss completions only for the eligible (member, task, day) pairs', async () => {
    const res = await sweep.runMissedTaskSweep(db, NOW);
    expect(res.penaltiesWritten).toBeGreaterThan(0);

    // m1 (UTC): 08-15 already done → skip; 08-14 → penalty written.
    const missed0814 = await compCol().doc('miss__daily1__m1__2026-08-14').get();
    expect(missed0814.exists).toBe(true);
    expect(missed0814.data()).toMatchObject({
      penaltyKind: 'miss', wasAutoFailed: true, serverAward: true, completedDate: '2026-08-14', sweptBy: 'cf',
    });

    // 08-15 was completed → no miss doc for it.
    const missed0815 = await compCol().doc('miss__daily1__m1__2026-08-15').get();
    expect(missed0815.exists).toBe(false);

    // unassigned + weekly tasks are never swept.
    const unassigned = await compCol().doc('miss__dailyUnassigned__m1__2026-08-14').get();
    expect(unassigned.exists).toBe(false);
    const weekly = await compCol().doc('miss__weekly1__m1__2026-08-14').get();
    expect(weekly.exists).toBe(false);

    // m2 has no daily task assigned → no completions at all.
    const m2 = await compCol().where('memberId', '==', 'm2').get();
    expect(m2.empty).toBe(true);
  });

  it('the onCompletionCreated trigger deducts the half penalty for a swept miss', async () => {
    const txs = await eventually(async () => {
      const t = await txCol().where('referenceId', '==', 'miss__daily1__m1__2026-08-14').get();
      return t.empty ? null : t.docs.map((d) => d.data());
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].delta).toBe(-10); // half of 20
    expect(txs[0].source).toBe('task');
  });

  it('is idempotent — a second sweep writes no new miss docs', async () => {
    const before = (await compCol().get()).size;
    const res = await sweep.runMissedTaskSweep(db, NOW);
    expect(res.penaltiesWritten).toBe(0);
    const after = (await compCol().get()).size;
    expect(after).toBe(before);
  });
});

describe('runMissedTaskSweep — deadline + timezone fallback', () => {
  const FAM = 'sweepDeadline';
  const famRef = db.collection('families').doc(FAM);
  const compCol = () => famRef.collection('completions');
  const CREATED = Timestamp.fromDate(new Date('2026-08-01T00:00:00Z'));

  beforeAll(async () => {
    // Deadline 9 PM (default). m1 has a UTC config; m3 has NO config → must fall
    // back to the family's known timezone (UTC), not skip and not crash.
    await famRef.set({ name: 'Deadline Family', missedTaskPenalty: 'full', twistsOff: true });
    await famRef.collection('members').doc('m1').set({ displayName: 'Alex' });
    await famRef.collection('members').doc('m3').set({ displayName: 'Robin' });
    await famRef.collection('notificationConfigs').doc('m1').set({ timezone: 'UTC' });
    // NOTE: no notificationConfigs doc for m3 (mirrors a managed child with none).
    await famRef.collection('tasks').doc('d1').set({
      title: 'Read', pointValue: 10, recurrence: 'daily', isActive: true, assignedTo: 'm1', createdAt: CREATED,
    });
    await famRef.collection('tasks').doc('d3').set({
      title: 'Tidy', pointValue: 10, recurrence: 'daily', isActive: true, assignedTo: 'm3', createdAt: CREATED,
    });
  });

  it('does NOT penalize today before the deadline hour, but DOES after it', async () => {
    // 10 AM UTC — before the 9 PM deadline → today (08-20) must be untouched.
    await sweep.runMissedTaskSweep(db, new Date('2026-08-20T10:00:00Z'));
    expect((await compCol().doc('miss__d1__m1__2026-08-20').get()).exists).toBe(false);

    // 10 PM UTC — deadline passed → today (08-20) now penalized.
    await sweep.runMissedTaskSweep(db, new Date('2026-08-20T22:00:00Z'));
    expect((await compCol().doc('miss__d1__m1__2026-08-20').get()).exists).toBe(true);
  });

  it('penalizes a member with no timezone config via the family fallback', async () => {
    // m3 has no config; the family has m1@UTC → fallback UTC. At 10 PM UTC the
    // 08-20 deadline has passed, so m3 is penalized too (proves no skip/crash).
    await sweep.runMissedTaskSweep(db, new Date('2026-08-20T22:00:00Z'));
    expect((await compCol().doc('miss__d3__m3__2026-08-20').get()).exists).toBe(true);
  });
});

describe('runMissedTaskSweep — off mode', () => {
  const FAM = 'sweepOff';
  const famRef = db.collection('families').doc(FAM);
  const CREATED = Timestamp.fromDate(new Date('2026-08-01T00:00:00Z'));

  beforeAll(async () => {
    await famRef.set({ name: 'Off Family', missedTaskPenalty: 'off', twistsOff: true });
    await famRef.collection('members').doc('m1').set({ displayName: 'Alex' });
    await famRef.collection('notificationConfigs').doc('m1').set({ timezone: 'UTC' });
    await famRef.collection('tasks').doc('daily1').set({
      title: 'Make bed', pointValue: 20, recurrence: 'daily', isActive: true, assignedTo: 'm1', createdAt: CREATED,
    });
  });

  it('never penalizes when the family has the feature off', async () => {
    await sweep.runMissedTaskSweep(db, NOW);
    const comps = await famRef.collection('completions').get();
    expect(comps.empty).toBe(true);
  });
});
