/**
 * __tests__/lib/pointsEngine.test.ts
 * Unit tests for all points engine functions — pure logic, no mocks needed.
 * Target: 100% coverage of lib/pointsEngine.ts
 */

import {
  calculateTaskPoints,
  calculateAutoFailPenalty,
  calculateStreakBonus,
  calculateTotalPoints,
  calculateWeeklyPoints,
  buildLeaderboard,
  calculateStreak,
  getCurrentWeekRange,
  getWeekLabel,
  isCurrentWeek,
  getCompletionRate,
  getRankEmoji,
  getPointsColor,
  formatPoints,
} from '@/lib/pointsEngine';
import type { PointTransaction } from '@/types';

// ─── calculateTaskPoints ──────────────────────────────────────────────────────
describe('calculateTaskPoints', () => {
  it('returns the task point_value', () => {
    expect(calculateTaskPoints({ point_value: 25 } as any)).toBe(25);
  });
  it('returns 0 for zero-point task', () => {
    expect(calculateTaskPoints({ point_value: 0 } as any)).toBe(0);
  });
  it('returns correct value for hard task (50pts)', () => {
    expect(calculateTaskPoints({ point_value: 50 } as any)).toBe(50);
  });
});

// ─── calculateAutoFailPenalty ─────────────────────────────────────────────────
describe('calculateAutoFailPenalty', () => {
  it('returns negative of point_value', () => {
    expect(calculateAutoFailPenalty({ point_value: 25 } as any)).toBe(-25);
  });
  it('negates easy task', () => {
    expect(calculateAutoFailPenalty({ point_value: 10 } as any)).toBe(-10);
  });
  it('negates hard task', () => {
    expect(calculateAutoFailPenalty({ point_value: 50 } as any)).toBe(-50);
  });
});

// ─── calculateStreakBonus ─────────────────────────────────────────────────────
describe('calculateStreakBonus', () => {
  it('returns 0 for no streak', () => {
    expect(calculateStreakBonus(0)).toBe(0);
  });
  it('returns 0 for 6-day streak (not milestone)', () => {
    expect(calculateStreakBonus(6)).toBe(0);
  });
  it('returns 50 for 7-day streak', () => {
    expect(calculateStreakBonus(7)).toBe(50);
  });
  it('returns 100 for 14-day streak', () => {
    expect(calculateStreakBonus(14)).toBe(100);
  });
  it('returns 250 for 30-day streak', () => {
    expect(calculateStreakBonus(30)).toBe(250);
  });
  it('returns 0 for non-milestone days (8, 15, 31)', () => {
    expect(calculateStreakBonus(8)).toBe(0);
    expect(calculateStreakBonus(15)).toBe(0);
    expect(calculateStreakBonus(31)).toBe(0);
  });
});

// ─── calculateTotalPoints ─────────────────────────────────────────────────────
describe('calculateTotalPoints', () => {
  const makeTx = (delta: number): PointTransaction =>
    ({ id: '1', familyId: 'f1', memberId: 'm1', delta, reason: '', source: 'task', createdAt: { toDate: () => new Date(), seconds: 0 } as any });

  it('returns 0 for empty array', () => {
    expect(calculateTotalPoints([])).toBe(0);
  });
  it('sums positive deltas', () => {
    expect(calculateTotalPoints([makeTx(10), makeTx(25), makeTx(50)])).toBe(85);
  });
  it('handles negative deltas (penalties)', () => {
    expect(calculateTotalPoints([makeTx(50), makeTx(-25)])).toBe(25);
  });
  it('handles all negative', () => {
    expect(calculateTotalPoints([makeTx(-10), makeTx(-15)])).toBe(-25);
  });
  it('handles single transaction', () => {
    expect(calculateTotalPoints([makeTx(100)])).toBe(100);
  });
});

// ─── calculateWeeklyPoints ────────────────────────────────────────────────────
describe('calculateWeeklyPoints', () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const makeTx = (delta: number, daysAgo: number): PointTransaction => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    // PointTransaction from @/types uses created_at as string
    return { id: '1', family_id: 'f1', member_id: 'm1', delta, reason: '', source: 'task', created_at: date.toISOString() } as any;
  };

  it('counts only this-week transactions', () => {
    const txs = [makeTx(25, 0), makeTx(10, 1), makeTx(50, 30)]; // 30 days ago excluded
    expect(calculateWeeklyPoints(txs, weekStart, weekEnd)).toBe(35);
  });

  it('returns 0 for empty array', () => {
    expect(calculateWeeklyPoints([], weekStart, weekEnd)).toBe(0);
  });

  it('returns 0 when all transactions are outside week', () => {
    expect(calculateWeeklyPoints([makeTx(100, 30)], weekStart, weekEnd)).toBe(0);
  });
});

// ─── buildLeaderboard ─────────────────────────────────────────────────────────
describe('buildLeaderboard', () => {
  const members = [
    { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁' },
    { id: 'm2', displayName: 'Mom', avatarEmoji: '🐸' },
    { id: 'm3', displayName: 'Tommy', avatarEmoji: '🦊' },
  ];

  it('sorts members by points descending', () => {
    const totals = { m1: 100, m2: 200, m3: 50 };
    const board = buildLeaderboard(totals, members, 'm1', {}, {});
    expect(board[0].displayName).toBe('Mom');
    expect(board[1].displayName).toBe('Dad');
    expect(board[2].displayName).toBe('Tommy');
  });

  it('assigns correct ranks', () => {
    const totals = { m1: 100, m2: 200, m3: 50 };
    const board = buildLeaderboard(totals, members, 'm1', {}, {});
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
    expect(board[2].rank).toBe(3);
  });

  it('handles tied scores with same rank', () => {
    const totals = { m1: 100, m2: 100, m3: 50 };
    const board = buildLeaderboard(totals, members, 'm1', {}, {});
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(1); // tied
    expect(board[2].rank).toBe(3); // skips rank 2
  });

  it('marks current user correctly', () => {
    const board = buildLeaderboard({ m1: 100, m2: 200, m3: 50 }, members, 'm1', {}, {});
    const dad = board.find((e) => e.memberId === 'm1')!;
    expect(dad.isCurrentUser).toBe(true);
    const mom = board.find((e) => e.memberId === 'm2')!;
    expect(mom.isCurrentUser).toBe(false);
  });

  it('uses 0 points for members with no transactions', () => {
    const board = buildLeaderboard({}, members, 'm1', {}, {});
    board.forEach((e) => expect(e.points).toBe(0));
  });

  it('populates tasksCompleted and tasksTotal from taskStats', () => {
    const taskStats = { m1: { completed: 3, total: 5 } };
    const board = buildLeaderboard({}, members, 'm1', taskStats, {});
    const dad = board.find((e) => e.memberId === 'm1')!;
    expect(dad.tasksCompleted).toBe(3);
    expect(dad.tasksTotal).toBe(5);
  });

  it('supports both camelCase and snake_case member fields', () => {
    const snakeCaseMembers = [{ id: 'm1', display_name: 'Dad', avatar_emoji: '🦁' }];
    const board = buildLeaderboard({}, snakeCaseMembers as any, 'm1', {}, {});
    expect(board[0].displayName).toBe('Dad');
    expect(board[0].avatarEmoji).toBe('🦁');
  });

  it('returns empty array for no members', () => {
    expect(buildLeaderboard({}, [], 'm1', {}, {})).toHaveLength(0);
  });
});

// ─── calculateStreak ─────────────────────────────────────────────────────────
describe('calculateStreak', () => {
  // calculateStreak takes TaskCompletion (snake_case fields from @/types)
  const makeCompletion = (daysAgo: number, was_auto_failed = false) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return { was_auto_failed, completed_at: d.toISOString(), task_id: 't1', member_id: 'm1', week_id: '2024-W01', points_awarded: 10, id: 'c1' };
  };

  it('returns 0 for empty completions', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('counts today as streak day 1', () => {
    expect(calculateStreak([makeCompletion(0)] as any)).toBe(1);
  });

  it('counts consecutive days', () => {
    const completions = [makeCompletion(0), makeCompletion(1), makeCompletion(2)];
    expect(calculateStreak(completions as any)).toBe(3);
  });

  it('breaks streak on gap day', () => {
    const completions = [makeCompletion(0), makeCompletion(2)]; // gap on day 1
    expect(calculateStreak(completions as any)).toBe(1);
  });

  it('ignores auto-failed completions', () => {
    // day 1 is auto-failed so only today counts
    const completions = [makeCompletion(0), makeCompletion(1, true), makeCompletion(2)];
    expect(calculateStreak(completions as any)).toBe(1);
  });

  it('deduplicates multiple completions on same day', () => {
    const completions = [makeCompletion(0), makeCompletion(0), makeCompletion(1)];
    expect(calculateStreak(completions as any)).toBe(2);
  });
});

// ─── getCurrentWeekRange ──────────────────────────────────────────────────────
describe('getCurrentWeekRange', () => {
  it('returns start on Monday and end 6 days later', () => {
    const { start, end } = getCurrentWeekRange();
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDate() - start.getDate()).toBe(6);
  });

  it('start is at midnight', () => {
    const { start } = getCurrentWeekRange();
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('end is at 23:59:59', () => {
    const { end } = getCurrentWeekRange();
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});

// ─── getWeekLabel ─────────────────────────────────────────────────────────────
describe('getWeekLabel', () => {
  it('returns a formatted date range string', () => {
    const monday = new Date('2024-01-08'); // a Monday
    const label = getWeekLabel(monday);
    expect(label).toContain('Jan');
    expect(label).toContain('-');
  });

  it('includes start and end dates', () => {
    // Use local time constructor to avoid UTC timezone parsing issues
    const monday = new Date(2024, 0, 8); // Jan 8 in local time
    const label = getWeekLabel(monday);
    expect(label).toMatch(/Jan 8/);
    expect(label).toMatch(/Jan 14/);
  });
});

// ─── isCurrentWeek ────────────────────────────────────────────────────────────
describe('isCurrentWeek', () => {
  it('returns true for today', () => {
    expect(isCurrentWeek(new Date())).toBe(true);
  });

  it('returns false for a date 30 days ago', () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    expect(isCurrentWeek(old)).toBe(false);
  });

  it('returns false for a date 30 days in future', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    expect(isCurrentWeek(future)).toBe(false);
  });
});

// ─── getCompletionRate ────────────────────────────────────────────────────────
describe('getCompletionRate', () => {
  it('returns 0 for 0 total', () => {
    expect(getCompletionRate(0, 0)).toBe(0);
  });
  it('returns 100 for all completed', () => {
    expect(getCompletionRate(5, 5)).toBe(100);
  });
  it('returns 50 for half completed', () => {
    expect(getCompletionRate(3, 6)).toBe(50);
  });
  it('rounds to nearest integer', () => {
    expect(getCompletionRate(1, 3)).toBe(33);
  });
  it('returns 0 for 0 completed out of many', () => {
    expect(getCompletionRate(0, 10)).toBe(0);
  });
});

// ─── getRankEmoji ─────────────────────────────────────────────────────────────
describe('getRankEmoji', () => {
  it('returns gold medal for rank 1', () => {
    expect(getRankEmoji(1)).toBe('🥇');
  });
  it('returns silver medal for rank 2', () => {
    expect(getRankEmoji(2)).toBe('🥈');
  });
  it('returns bronze medal for rank 3', () => {
    expect(getRankEmoji(3)).toBe('🥉');
  });
  it('returns #N format for rank 4+', () => {
    expect(getRankEmoji(4)).toBe('#4');
    expect(getRankEmoji(10)).toBe('#10');
  });
});

// ─── getPointsColor ───────────────────────────────────────────────────────────
describe('getPointsColor', () => {
  it('returns green for positive delta', () => {
    expect(getPointsColor(10)).toBe('#43D98F');
    expect(getPointsColor(1)).toBe('#43D98F');
  });
  it('returns red for negative delta', () => {
    expect(getPointsColor(-10)).toBe('#FF5C5C');
  });
  it('returns grey for zero delta', () => {
    expect(getPointsColor(0)).toBe('#6B7280');
  });
});

// ─── formatPoints ─────────────────────────────────────────────────────────────
describe('formatPoints', () => {
  it('returns plain number for under 1000', () => {
    expect(formatPoints(999)).toBe('999');
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(500)).toBe('500');
  });
  it('formats 1000 as 1.0k', () => {
    expect(formatPoints(1000)).toBe('1.0k');
  });
  it('formats 2500 as 2.5k', () => {
    expect(formatPoints(2500)).toBe('2.5k');
  });
  it('formats 10000 as 10.0k', () => {
    expect(formatPoints(10000)).toBe('10.0k');
  });
});
