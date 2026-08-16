/**
 * __tests__/lib/pointsEngine.edgecases.test.ts
 * Edge-case coverage the roadmap (4B) calls out: ties, zero/negative points,
 * orphaned members, plan/level boundaries, streak gaps. Complements the main
 * pointsEngine.test.ts happy-path suite.
 */
import {
  buildLeaderboard,
  computeCrowns,
  missedTaskPenaltyAmount,
  getLevel,
  dailyStreak,
  formatPoints,
} from '@/lib/pointsEngine';

const M = (id: string, name = id) => ({ id, displayName: name, avatarEmoji: '🙂' });

describe('buildLeaderboard — edge cases', () => {
  it('gives tied members the same rank, then skips (1,1,3)', () => {
    const board = buildLeaderboard(
      { a: 50, b: 50, c: 10 },
      [M('a'), M('b'), M('c')],
      'a',
      {},
      {},
    );
    const byId = Object.fromEntries(board.map((e) => [e.memberId, e.rank]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(1);
    expect(byId.c).toBe(3);
  });

  it('a zero-activity week ranks everyone #1 without crashing', () => {
    const board = buildLeaderboard({}, [M('a'), M('b')], 'a', {}, {});
    expect(board.every((e) => e.points === 0 && e.rank === 1)).toBe(true);
  });

  it('tolerates orphaned members (no taskStats/streaks) → zeros, no throw', () => {
    const board = buildLeaderboard({ a: 20 }, [M('a'), M('ghost')], 'a', {}, {});
    const ghost = board.find((e) => e.memberId === 'ghost')!;
    expect(ghost.points).toBe(0);
    expect(ghost.tasksCompleted).toBe(0);
    expect(ghost.streak).toBe(0);
  });

  it('ignores totals for member ids not in the members list', () => {
    const board = buildLeaderboard({ a: 10, deleted: 999 }, [M('a')], 'a', {}, {});
    expect(board).toHaveLength(1);
    expect(board[0].points).toBe(10);
  });

  it('sorts negative points below zero and positive above', () => {
    const board = buildLeaderboard({ a: -30, b: 0, c: 15 }, [M('a'), M('b'), M('c')], 'b', {}, {});
    expect(board.map((e) => e.memberId)).toEqual(['c', 'b', 'a']);
  });

  it('returns [] for an empty family', () => {
    expect(buildLeaderboard({}, [], '', {}, {})).toEqual([]);
  });
});

describe('computeCrowns — edge cases', () => {
  const board = buildLeaderboard({ a: 100, b: 40 }, [M('a', 'Alex'), M('b', 'Bailey')], 'a', {}, {});

  it('awards the top crown to the highest scorer', () => {
    const crowns = computeCrowns(board, {}, {});
    const top = crowns.find((c) => c.kind === 'top')!;
    expect(top.awardeeMemberId).toBe('a');
  });

  it('leaves "most improved" unawarded when there is no last-week data', () => {
    const crowns = computeCrowns(board, {}, {});
    const improved = crowns.find((c) => c.kind === 'improved')!;
    expect(improved.awardeeMemberId).toBeNull();
  });

  it('leaves "goal crusher" unawarded when no goals are set', () => {
    const crowns = computeCrowns(board, {}, {});
    const goal = crowns.find((c) => c.kind === 'goal')!;
    expect(goal.awardeeMemberId).toBeNull();
  });

  it('always returns the three slots in fixed order', () => {
    const crowns = computeCrowns(board, {}, {});
    expect(crowns.map((c) => c.kind)).toEqual(['top', 'improved', 'goal']);
  });
});

describe('missedTaskPenaltyAmount — boundaries', () => {
  it('off mode never deducts', () => {
    expect(missedTaskPenaltyAmount(50, 'off')).toBe(0);
  });
  it('full mode deducts the whole value', () => {
    expect(missedTaskPenaltyAmount(50, 'full')).toBe(50);
  });
  it('half mode rounds and floors at 1 for tiny tasks', () => {
    expect(missedTaskPenaltyAmount(10, 'half')).toBe(5);
    expect(missedTaskPenaltyAmount(1, 'half')).toBe(1); // max(1, round(0.5))
    expect(missedTaskPenaltyAmount(3, 'half')).toBe(2); // round(1.5) = 2
  });
  it('non-positive point values deduct nothing', () => {
    expect(missedTaskPenaltyAmount(0, 'full')).toBe(0);
    expect(missedTaskPenaltyAmount(-10, 'half')).toBe(0);
  });
});

describe('getLevel — boundaries', () => {
  it('floors negatives / zero at level 1', () => {
    expect(getLevel(-100).level).toBe(1);
    expect(getLevel(0).level).toBe(1);
  });
  it('is monotonic non-decreasing as points grow', () => {
    let prev = 0;
    for (let p = 0; p <= 100_000; p += 137) {
      const lvl = getLevel(p).level;
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
  it('caps at the top tier with no next level', () => {
    const top = getLevel(10_000_000);
    expect(top.pointsToNext == null || top.pointsToNext === 0).toBe(true);
  });
});

describe('dailyStreak — grace + gaps', () => {
  const day = (offset: number) => {
    const d = new Date('2026-03-15T12:00:00');
    d.setDate(d.getDate() - offset);
    return d;
  };
  const now = new Date('2026-03-15T12:00:00');

  it('is 0 with no completions', () => {
    expect(dailyStreak([], now)).toBe(0);
  });
  it('counts consecutive days ending today', () => {
    expect(dailyStreak([day(0), day(1), day(2)], now)).toBe(3);
  });
  it('allows a yesterday anchor (today not yet done)', () => {
    expect(dailyStreak([day(1), day(2)], now)).toBe(2);
  });
  it('breaks on a gap', () => {
    expect(dailyStreak([day(0), day(1), day(3)], now)).toBe(2);
  });
  it('ignores duplicate completions on the same day', () => {
    expect(dailyStreak([day(0), day(0), day(1)], now)).toBe(2);
  });
});

describe('formatPoints — signs', () => {
  it('keeps zero and negatives readable', () => {
    expect(formatPoints(0)).toBe('0');
    expect(String(formatPoints(-5))).toContain('5');
  });
});
