import {
  currentRotationMemberId,
  effectiveAssignee,
  isDueToday,
  scheduledDaysLabel,
  type Rotation,
} from '@/lib/rotation';

// Helper: a local Date at midnight for a given Y-M-D (month 1-based here).
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

describe('currentRotationMemberId — weekly', () => {
  const rot: Rotation = { memberIds: ['a', 'b', 'c'], cadence: 'weekly' };

  it('same member all week (Mon-start), advances the next week', () => {
    // Week of Mon 2024-01-01 .. Sun 2024-01-07 → one member; next Monday advances.
    const mon = currentRotationMemberId(rot, d(2024, 1, 1), 1);
    const wed = currentRotationMemberId(rot, d(2024, 1, 3), 1);
    const sun = currentRotationMemberId(rot, d(2024, 1, 7), 1);
    expect(mon).toBe(wed);
    expect(wed).toBe(sun);
    const nextMon = currentRotationMemberId(rot, d(2024, 1, 8), 1);
    expect(nextMon).not.toBe(mon);
  });

  it('cycles back to the first member after the list length', () => {
    const w0 = currentRotationMemberId(rot, d(2024, 1, 1), 1);
    const w3 = currentRotationMemberId(rot, d(2024, 1, 22), 1); // 3 weeks later
    expect(w3).toBe(w0);
  });

  it('respects a Sunday week start (handover on Sunday, not Monday)', () => {
    const sat = currentRotationMemberId(rot, d(2024, 1, 6), 0); // Sat
    const sun = currentRotationMemberId(rot, d(2024, 1, 7), 0); // Sun = new week
    expect(sun).not.toBe(sat);
  });
});

describe('currentRotationMemberId — daily', () => {
  const rot: Rotation = { memberIds: ['x', 'y'], cadence: 'daily' };
  it('advances every day and cycles', () => {
    const day1 = currentRotationMemberId(rot, d(2024, 3, 10));
    const day2 = currentRotationMemberId(rot, d(2024, 3, 11));
    const day3 = currentRotationMemberId(rot, d(2024, 3, 12));
    expect(day1).not.toBe(day2);
    expect(day1).toBe(day3); // 2-person list cycles every 2 days
  });
});

describe('currentRotationMemberId — edge cases', () => {
  it('single-member rotation always returns that member', () => {
    const rot: Rotation = { memberIds: ['solo'], cadence: 'weekly' };
    expect(currentRotationMemberId(rot, d(2024, 1, 1))).toBe('solo');
    expect(currentRotationMemberId(rot, d(2025, 6, 15))).toBe('solo');
  });
  it('empty list returns null', () => {
    expect(currentRotationMemberId({ memberIds: [], cadence: 'weekly' })).toBeNull();
    expect(currentRotationMemberId(null)).toBeNull();
  });
});

describe('effectiveAssignee', () => {
  it('uses the rotation when present', () => {
    const task = { rotation: { memberIds: ['a', 'b'], cadence: 'daily' as const } };
    const got = effectiveAssignee(task, d(2024, 3, 10));
    expect(['a', 'b']).toContain(got);
  });
  it('falls back to a fixed string assignee', () => {
    expect(effectiveAssignee({ assignedTo: 'm1' })).toBe('m1');
  });
  it('falls back to the first of a legacy array assignee', () => {
    expect(effectiveAssignee({ assignedTo: ['m2', 'm3'] })).toBe('m2');
  });
  it('returns null for a whole-family task', () => {
    expect(effectiveAssignee({ assignedTo: null })).toBeNull();
    expect(effectiveAssignee({})).toBeNull();
  });
});

describe('isDueToday', () => {
  it('empty/undefined schedule = due every day', () => {
    expect(isDueToday(undefined, d(2024, 1, 1))).toBe(true);
    expect(isDueToday([], d(2024, 1, 3))).toBe(true);
  });
  it('due only on the listed weekdays', () => {
    // Mon 2024-01-01 (getDay=1), Thu 2024-01-04 (getDay=4)
    const monThu = [1, 4];
    expect(isDueToday(monThu, d(2024, 1, 1))).toBe(true);  // Mon
    expect(isDueToday(monThu, d(2024, 1, 2))).toBe(false); // Tue
    expect(isDueToday(monThu, d(2024, 1, 4))).toBe(true);  // Thu
  });
});

describe('scheduledDaysLabel', () => {
  it('formats common patterns', () => {
    expect(scheduledDaysLabel(undefined)).toBe('Every day');
    expect(scheduledDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(scheduledDaysLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(scheduledDaysLabel([0, 6])).toBe('Weekends');
    expect(scheduledDaysLabel([1, 4])).toBe('Mon, Thu');
  });
});
