/**
 * Weekly/monthly "is it done this period?" — regression for the 2026-11-01 bug:
 * a weekly task completed on SATURDAY showed as pending again on SUNDAY,
 * because the stored weekId uses Sunday-start weeks while the family's week
 * runs Monday→Sunday.
 */
import { familyPeriod, findCompletionForPeriod, weekIdOf } from '@/lib/completionMatch';

const at = (s: string) => new Date(`${s}T12:00:00`);

describe('familyPeriod', () => {
  it('a Monday-start week spans two stored (Sunday-start) week ids', () => {
    const p = familyPeriod(at('2026-11-01'), 1); // Sunday, last day of the family week
    expect(p.weekStartKey).toBe('2026-10-26');
    expect(p.weekEndKey).toBe('2026-11-01');
    expect(weekIdOf(at('2026-10-31'))).not.toBe(weekIdOf(at('2026-11-01'))); // the root cause
    expect(p.weekIds).toEqual([weekIdOf(at('2026-10-26')), weekIdOf(at('2026-11-01'))]);
  });
  it('a Sunday-start family week is a single stored id', () => {
    const p = familyPeriod(at('2026-11-04'), 0);
    expect(p.weekStartKey).toBe('2026-11-01');
    expect(p.weekIds).toHaveLength(1);
  });
});

describe('weekly tasks use the FAMILY week', () => {
  const sunday = familyPeriod(at('2026-11-01'), 1);
  const doneSaturday = { taskId: 'hair', memberId: 'me', completedDate: '2026-10-31', weekId: weekIdOf(at('2026-10-31')) };

  it('done Saturday → still done on Sunday (same Monday-start week)', () => {
    expect(findCompletionForPeriod([doneSaturday], 'hair', 'me', 'weekly', sunday)).toBe(doneSaturday);
  });
  it('done last week → pending again on Monday', () => {
    const monday = familyPeriod(at('2026-11-02'), 1);
    expect(findCompletionForPeriod([doneSaturday], 'hair', 'me', 'weekly', monday)).toBeNull();
  });
  it('falls back to the completion timestamp when there is no completedDate', () => {
    const c = { taskId: 'hair', memberId: 'me', completedAt: { toDate: () => at('2026-10-27') } };
    expect(findCompletionForPeriod([c], 'hair', 'me', 'weekly', sunday)).toBe(c);
  });
  it('a rejected claim never counts', () => {
    expect(findCompletionForPeriod([{ ...doneSaturday, status: 'rejected' }], 'hair', 'me', 'weekly', sunday)).toBeNull();
  });
});

describe('monthly tasks', () => {
  it('done earlier in the month → still done later that month', () => {
    const p = familyPeriod(at('2026-11-20'), 1);
    const c = { taskId: 'gutters', memberId: 'me', monthId: '2026-11', completedDate: '2026-11-03' };
    expect(findCompletionForPeriod([c], 'gutters', 'me', 'monthly', p)).toBe(c);
  });
});
