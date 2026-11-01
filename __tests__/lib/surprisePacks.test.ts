import {
  rollPack, DAILY_PACK, WEEKLY_PACK, dailyPackId, weeklyPackId, revokedId,
  weekDateKeys, tasksDueFor, isDayComplete, isPerfectWeek, parseDateKey,
  questProgress, questLabel,
} from '@/lib/surprisePacks';

describe('rollPack', () => {
  it('stays inside the daily range (5–20), inclusive', () => {
    expect(rollPack('daily', () => 0)).toBe(DAILY_PACK.min);
    expect(rollPack('daily', () => 0.9999)).toBe(DAILY_PACK.max);
    for (let i = 0; i < 200; i++) {
      const v = rollPack('daily');
      expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThanOrEqual(20);
    }
  });
  it('stays inside the weekly range (15–50), inclusive', () => {
    expect(rollPack('weekly', () => 0)).toBe(WEEKLY_PACK.min);
    expect(rollPack('weekly', () => 0.9999)).toBe(WEEKLY_PACK.max);
  });
});

describe('pack ids', () => {
  it('are deterministic per person + day/week (so a pack can only be granted once)', () => {
    expect(dailyPackId('vian', '2026-11-02')).toBe('surprise_day_vian_2026-11-02');
    expect(weeklyPackId('vian', '2026-11-02')).toBe('surprise_week_vian_2026-11-02');
    expect(revokedId('surprise_day_vian_2026-11-02')).toBe('surprise_day_vian_2026-11-02_revoked');
  });
});

describe('weekDateKeys', () => {
  it('returns the 7 days of a Monday-start week', () => {
    expect(weekDateKeys(parseDateKey('2026-10-31'), 1)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
  });
  it('handles a Sunday-start week and the DST weekend', () => {
    expect(weekDateKeys(parseDateKey('2026-11-01'), 0)[0]).toBe('2026-11-01');
    expect(weekDateKeys(parseDateKey('2026-11-01'), 0)).toHaveLength(7);
  });
});

const day = parseDateKey('2026-11-02'); // a Monday
const period = { todayStr: '2026-11-02', weekId: '2026-W45', monthId: '2026-11' };
const tasks = [
  { id: 't1', recurrence: 'daily', assignedTo: 'vian' },
  { id: 't2', recurrence: 'daily', assignedTo: null },            // whole family
  { id: 't3', recurrence: 'daily', assignedTo: 'vayu' },
  { id: 't4', recurrence: 'daily', assignedTo: 'vian', scheduledDays: [3] }, // Wed only
];

describe('tasksDueFor', () => {
  it('own + whole-family tasks for an account holder, scheduled days respected', () => {
    expect(tasksDueFor(tasks, { id: 'vian' }, day).map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('managed kids only get tasks assigned to them', () => {
    expect(tasksDueFor(tasks, { id: 'vian', isManaged: true }, day).map((t) => t.id)).toEqual(['t1']);
  });
});

describe('isDayComplete', () => {
  const due = [tasks[0]];
  const done = (extra: object = {}) => [{ taskId: 't1', memberId: 'vian', completedDate: '2026-11-02', ...extra }];
  it('true when every due task is settled', () => {
    expect(isDayComplete(due, done(), 'vian', period)).toBe(true);
    expect(isDayComplete(due, done({ status: 'approved' }), 'vian', period)).toBe(true);
  });
  it('false while a claim is still pending, rejected, or auto-failed', () => {
    expect(isDayComplete(due, done({ status: 'pending' }), 'vian', period)).toBe(false);
    expect(isDayComplete(due, done({ status: 'rejected' }), 'vian', period)).toBe(false);
    expect(isDayComplete(due, done({ wasAutoFailed: true }), 'vian', period)).toBe(false);
  });
  it("false when something's missing, or when there were no tasks at all", () => {
    expect(isDayComplete([tasks[0], tasks[1]], done(), 'vian', period)).toBe(false);
    expect(isDayComplete([], [], 'vian', period)).toBe(false);
  });
  it('a pending or undone WEEKLY task does not block the daily pack', () => {
    const weekly = { id: 'w1', recurrence: 'weekly', assignedTo: 'vian' };
    expect(isDayComplete([tasks[0], weekly], done(), 'vian', period)).toBe(true);
    expect(isDayComplete([tasks[0], weekly], [...done(), { taskId: 'w1', memberId: 'vian', weekId: '2026-W45', status: 'pending' }], 'vian', period)).toBe(true);
  });
  it('a day with only weekly/monthly tasks earns no daily pack', () => {
    const weekly = { id: 'w1', recurrence: 'weekly', assignedTo: 'vian' };
    expect(isDayComplete([weekly], [{ taskId: 'w1', memberId: 'vian', weekId: '2026-W45' }], 'vian', period)).toBe(false);
  });
  it("another member's completion doesn't count", () => {
    expect(isDayComplete(due, [{ taskId: 't1', memberId: 'vayu', completedDate: '2026-11-02' }], 'vian', period)).toBe(false);
  });
});

describe('isPerfectWeek', () => {
  const keys = weekDateKeys(day, 1);
  it('needs a daily pack on all 7 days', () => {
    expect(isPerfectWeek(new Set(keys), keys)).toBe(true);
    expect(isPerfectWeek(new Set(keys.slice(0, 6)), keys)).toBe(false);
  });
});


describe('questProgress / questLabel (E1 daily quest ring)', () => {
  const T = (completion: any, recurrence = 'daily') => ({ recurrence, completion });
  it('counts approved vs pending, ignores missed and rejected', () => {
    const p = questProgress([
      T({}), T({ status: 'approved' }), T({ status: 'pending' }),
      T({ wasAutoFailed: true }), T({ status: 'rejected' }), T(null),
    ]);
    expect(p).toEqual({ total: 6, approved: 2, pending: 1, complete: false });
  });
  it('is complete only when every task is approved', () => {
    expect(questProgress([T({}), T({ status: 'approved' })]).complete).toBe(true);
    expect(questProgress([T({}), T({ status: 'pending' })]).complete).toBe(false);
    expect(questProgress([]).complete).toBe(false);
  });
  it('ignores weekly and monthly tasks (user rule: only dailies earn the pack)', () => {
    const p = questProgress([T({}), T({}), T(null, 'weekly'), T({ status: 'pending' }, 'monthly')]);
    expect(p).toEqual({ total: 2, approved: 2, pending: 0, complete: true });
    expect(questProgress([T(null, 'weekly')]).total).toBe(0);
  });
  it('labels each state', () => {
    expect(questLabel(questProgress([]))).toMatch(/make today count/);
    expect(questLabel(questProgress([T({}), T(null)]))).toBe('1 of 2 daily done today · finish them for a surprise pack');
    expect(questLabel(questProgress([T({}), T({ status: 'pending' })]))).toMatch(/1 waiting for an OK/);
    expect(questLabel(questProgress([T({}), T({})]))).toMatch(/surprise pack earned/);
  });
});
