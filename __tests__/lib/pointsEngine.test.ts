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
  computeCrowns,
  computeInsights,
  getLevel,
  calculateStreak,
  dailyStreak,
  getCurrentWeekRange,
  getWeekLabel,
  isCurrentWeek,
  getCompletionRate,
  getRankEmoji,
  getPointsColor,
  formatPoints,
  missedTaskPenaltyAmount,
  toDateKey,
  graceWindowDays,
  MISSED_TASK_GRACE_DAYS,
} from '@/lib/pointsEngine';
import type { PointTransaction } from '@/types';

// ─── missed-task penalty helpers ──────────────────────────────────────────────
describe('missedTaskPenaltyAmount', () => {
  it('defaults to half the point value, rounded', () => {
    expect(missedTaskPenaltyAmount(10)).toBe(5);
    expect(missedTaskPenaltyAmount(50)).toBe(25);
    expect(missedTaskPenaltyAmount(25)).toBe(13); // 12.5 → 13
  });
  it('half mode is at least 1 for any positive task', () => {
    expect(missedTaskPenaltyAmount(1, 'half')).toBe(1);
  });
  it('full mode deducts the whole point value', () => {
    expect(missedTaskPenaltyAmount(10, 'full')).toBe(10);
    expect(missedTaskPenaltyAmount(25, 'full')).toBe(25);
  });
  it('off mode deducts nothing', () => {
    expect(missedTaskPenaltyAmount(50, 'off')).toBe(0);
  });
  it('is 0 for a zero or negative value task in any mode', () => {
    expect(missedTaskPenaltyAmount(0, 'half')).toBe(0);
    expect(missedTaskPenaltyAmount(-10, 'full')).toBe(0);
  });
});

describe('graceWindowDays / toDateKey', () => {
  it('returns the past N days most-recent first, excluding today', () => {
    const now = new Date(2026, 7, 15); // Sat Aug 15 2026
    expect(graceWindowDays(now, 2)).toEqual(['2026-08-14', '2026-08-13']);
  });
  it('defaults to the 2-day grace window', () => {
    const now = new Date(2026, 0, 1); // Jan 1 → crosses year boundary
    expect(MISSED_TASK_GRACE_DAYS).toBe(2);
    expect(graceWindowDays(now)).toEqual(['2025-12-31', '2025-12-30']);
  });
  it('toDateKey formats local Y-M-D zero-padded', () => {
    expect(toDateKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

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
describe('dailyStreak', () => {
  const NOW = new Date('2026-08-10T12:00:00'); // a Monday noon
  const dayBefore = (n: number) => { const d = new Date(NOW); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };

  it('returns 0 for no completions', () => {
    expect(dailyStreak([], NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    // today, yesterday, 2 days ago
    expect(dailyStreak([dayBefore(0), dayBefore(1), dayBefore(2)], NOW)).toBe(3);
  });

  it('stays lit when today has nothing yet but yesterday does (grace day)', () => {
    // yesterday + day before — streak of 2, still alive today
    expect(dailyStreak([dayBefore(1), dayBefore(2)], NOW)).toBe(2);
  });

  it('is broken when the most recent completion is older than yesterday', () => {
    expect(dailyStreak([dayBefore(2), dayBefore(3)], NOW)).toBe(0);
  });

  it('stops at the first gap', () => {
    // today, yesterday, then skip, then 3 days ago → streak is 2
    expect(dailyStreak([dayBefore(0), dayBefore(1), dayBefore(3), dayBefore(4)], NOW)).toBe(2);
  });

  it('dedupes multiple completions on the same day', () => {
    expect(dailyStreak([dayBefore(0), dayBefore(0), dayBefore(1)], NOW)).toBe(2);
  });
});

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

// ─── computeCrowns ────────────────────────────────────────────────────────────
describe('computeCrowns', () => {
  const members = [
    { id: 'dad', displayName: 'Dad Smith', avatarEmoji: '👨' },
    { id: 'mom', displayName: 'Mom Smith', avatarEmoji: '👩' },
    { id: 'alex', displayName: 'Alex Smith', avatarEmoji: '🧒' },
  ];
  const board = (totals: Record<string, number>) =>
    buildLeaderboard(totals, members as any, 'alex', {}, {});

  it('returns exactly three slots in fixed order', () => {
    const crowns = computeCrowns(board({ dad: 100, mom: 50, alex: 10 }));
    expect(crowns.map((c) => c.kind)).toEqual(['top', 'improved', 'goal']);
  });

  it('awards top scorer to the rank-1 member', () => {
    const crowns = computeCrowns(board({ dad: 100, mom: 50, alex: 10 }));
    expect(crowns[0].awardeeMemberId).toBe('dad');
    expect(crowns[0].detail).toBe('100 pts');
    expect(crowns[0].awardeeName).toBe('Dad');
  });

  it('does not award top scorer in a zero-point week', () => {
    const crowns = computeCrowns(board({ dad: 0, mom: 0, alex: 0 }));
    expect(crowns[0].awardeeMemberId).toBeNull();
    expect(crowns[0].detail).toBeNull();
  });

  it('awards most improved to the biggest positive delta vs last week', () => {
    const crowns = computeCrowns(
      board({ dad: 100, mom: 120, alex: 60 }),
      { dad: 90, mom: 40, alex: 55 }, // mom gained +80, the biggest
    );
    expect(crowns[1].awardeeMemberId).toBe('mom');
    expect(crowns[1].detail).toBe('+80 vs last wk');
  });

  it('gives no improved crown when there is no last-week data', () => {
    const crowns = computeCrowns(board({ dad: 100, mom: 50, alex: 10 }));
    expect(crowns[1].awardeeMemberId).toBeNull();
  });

  it('gives no improved crown when nobody improved', () => {
    const crowns = computeCrowns(
      board({ dad: 10, mom: 20, alex: 5 }),
      { dad: 100, mom: 100, alex: 100 },
    );
    expect(crowns[1].awardeeMemberId).toBeNull();
  });

  it('awards goal crusher to a member who reached their goal', () => {
    const crowns = computeCrowns(
      board({ dad: 100, mom: 50, alex: 160 }),
      {},
      { alex: 150 },
    );
    expect(crowns[2].awardeeMemberId).toBe('alex');
    expect(crowns[2].detail).toBe('160 / 150');
  });

  it('credits the widest goal margin and counts the rest', () => {
    const crowns = computeCrowns(
      board({ dad: 300, mom: 210, alex: 160 }),
      {},
      { dad: 100, mom: 200, alex: 150 }, // dad +200, alex +10, mom +10 — dad widest
    );
    expect(crowns[2].awardeeMemberId).toBe('dad');
    expect(crowns[2].detail).toContain('+2'); // two other achievers noted
  });

  it('gives no goal crown when no goals are set', () => {
    const crowns = computeCrowns(board({ dad: 100, mom: 50, alex: 10 }));
    expect(crowns[2].awardeeMemberId).toBeNull();
  });

  it('handles an empty family without throwing', () => {
    expect(() => computeCrowns([])).not.toThrow();
    const crowns = computeCrowns([]);
    expect(crowns.every((c) => c.awardeeMemberId === null)).toBe(true);
  });
});

// ─── computeInsights ──────────────────────────────────────────────────────────
describe('computeInsights', () => {
  const D = (weekday: number) => {
    // a date in the current week with the given getDay()
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + weekday);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  it('returns an up-trend card when this week beats last week', () => {
    const cards = computeInsights([], [{ week: 'Jun 1', points: 100 }, { week: 'Jun 8', points: 150 }]);
    const trend = cards.find((c) => c.key === 'trend')!;
    expect(trend.tone).toBe('good');
    expect(trend.title).toContain('Up 50%');
  });

  it('returns a down-trend card when this week is worse', () => {
    const cards = computeInsights([], [{ week: 'Jun 1', points: 200 }, { week: 'Jun 8', points: 150 }]);
    expect(cards.find((c) => c.key === 'trend')!.tone).toBe('bad');
  });

  it('marks a flat week as steady/neutral', () => {
    const cards = computeInsights([], [{ week: 'Jun 1', points: 100 }, { week: 'Jun 8', points: 100 }]);
    expect(cards.find((c) => c.key === 'trend')!.tone).toBe('neutral');
  });

  it('omits the trend card entirely for two empty weeks', () => {
    const cards = computeInsights([], [{ week: 'Jun 1', points: 0 }, { week: 'Jun 8', points: 0 }]);
    expect(cards.find((c) => c.key === 'trend')).toBeUndefined();
  });

  it('identifies the best day of week by points', () => {
    const txns = [
      { delta: 10, source: 'task', date: D(1) }, // Monday
      { delta: 50, source: 'task', date: D(6) }, // Saturday
      { delta: 20, source: 'task', date: D(6) }, // Saturday
    ];
    const cards = computeInsights(txns, []);
    const best = cards.find((c) => c.key === 'bestday')!;
    expect(best.title).toContain('Saturdays');
    expect(best.detail).toContain('70 pts');
  });

  it('surfaces a record week from the 6-week window', () => {
    const cards = computeInsights([], [
      { week: 'May 1', points: 80 }, { week: 'May 8', points: 300 }, { week: 'May 15', points: 120 },
    ]);
    const rec = cards.find((c) => c.key === 'record')!;
    expect(rec.title).toContain('300 pts');
  });

  it('flags the most-dodged task when a reason repeats', () => {
    const txns = [
      { delta: -10, source: 'task', reason: 'Missed: Make the bed', date: D(1) },
      { delta: -10, source: 'task', reason: 'Missed: Make the bed', date: D(2) },
      { delta: -25, source: 'task', reason: 'Auto-failed: Dishes', date: D(3) },
    ];
    const cards = computeInsights(txns, []);
    const dodged = cards.find((c) => c.key === 'dodged')!;
    expect(dodged.detail).toContain('Make the bed'); // prefix stripped
    expect(dodged.detail).toContain('2');
  });

  it('does not flag most-dodged for a single miss', () => {
    const txns = [{ delta: -10, source: 'task', reason: 'Missed: Make the bed', date: D(1) }];
    expect(computeInsights(txns, []).find((c) => c.key === 'dodged')).toBeUndefined();
  });

  it('does not count undo reversals as most-dodged', () => {
    // A completion followed by two undos must NOT read as "Undo: Workout ×2" —
    // undos are bookkeeping, not a behavioural dodge.
    const txns = [
      { delta: 10, source: 'task', reason: 'Completed: Workout', date: D(1) },
      { delta: -10, source: 'task', reason: 'Undo: Workout', date: D(1) },
      { delta: -10, source: 'task', reason: 'Undo: Workout', date: D(2) },
    ];
    expect(computeInsights(txns, []).find((c) => c.key === 'dodged')).toBeUndefined();
  });

  it('does not count undo reversals toward the best day or tasks-done', () => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    const txns = [
      { delta: 10, source: 'task', reason: 'Completed: A', date: D(1) },
      { delta: -10, source: 'task', reason: 'Undo: A', date: D(1) },
    ];
    const cards = computeInsights(txns, [], weekStart);
    // only one real completion counts; the reversal is excluded
    expect(cards.find((c) => c.key === 'tasks')!.title).toContain('1 task');
  });

  it('never reports a bogus "Down 0%" when last week was not positive', () => {
    // cur negative, prev zero → old code produced "Down 0% this week".
    const cards = computeInsights([], [{ week: 'Jun 1', points: 0 }, { week: 'Jun 8', points: -10 }]);
    const trend = cards.find((c) => c.key === 'trend')!;
    expect(trend.title).not.toMatch(/0%/);
    expect(trend.title).toBe('In the red this week');
    expect(trend.tone).toBe('bad');
  });

  it('does not surface a best-day card from a single day of activity', () => {
    const txns = [
      { delta: 10, source: 'task', date: D(3) },
      { delta: 25, source: 'task', date: D(3) },
      { delta: 50, source: 'task', date: D(3) },
    ];
    expect(computeInsights(txns, []).find((c) => c.key === 'bestday')).toBeUndefined();
  });

  it('counts tasks done this week when a weekStart is given', () => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    const txns = [
      { delta: 10, source: 'task', date: D(1) },
      { delta: 25, source: 'task', date: D(2) },
      { delta: 5, source: 'bonus', date: D(2) }, // not a task
    ];
    const cards = computeInsights(txns, [], weekStart);
    const t = cards.find((c) => c.key === 'tasks')!;
    expect(t.title).toContain('2 tasks');
  });

  it('returns an empty array for a member with no data', () => {
    expect(computeInsights([], [])).toEqual([]);
  });
});

// ─── getLevel ─────────────────────────────────────────────────────────────────
describe('getLevel', () => {
  it('starts everyone at level 1 Rookie', () => {
    const l = getLevel(0);
    expect(l.level).toBe(1);
    expect(l.title).toBe('Rookie');
  });

  it('treats negative or NaN points as level 1', () => {
    expect(getLevel(-50).level).toBe(1);
    expect(getLevel(NaN).level).toBe(1);
  });

  it('advances a level exactly at the floor', () => {
    expect(getLevel(150).title).toBe('Helper');
    expect(getLevel(149).title).toBe('Rookie');
  });

  it('reports remaining points to the next level', () => {
    const l = getLevel(100); // Rookie band is 0..150
    expect(l.next).toBe(50);
    expect(l.progress).toBeCloseTo(100 / 150, 5);
  });

  it('never decreases level as points grow (monotonic)', () => {
    let prev = 0;
    for (let p = 0; p <= 8000; p += 137) {
      const lvl = getLevel(p).level;
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it('caps at the top tier with full progress and no next', () => {
    const l = getLevel(999999);
    expect(l.title).toBe('Mythic');
    expect(l.next).toBeNull();
    expect(l.progress).toBe(1);
  });
});
