/**
 * __tests__/functions/game.test.js
 * Pure unit tests for firebase/functions/game.js (the server's crown / ranking /
 * overtake logic). No emulator, no Firebase — runs under jest.functions.config.js
 * on its own:  npx jest --config jest.functions.config.js game
 */
const path = require('path');
const {
  isKid, competitors, buildRanked, computeCrowns, crownsSummary, detectOvertakes,
} = require(path.join(__dirname, '../../firebase/functions/game'));

const M = (id, extra = {}) => ({ id, displayName: id, avatarEmoji: '🙂', ...extra });

describe('competitors (competitionMode)', () => {
  const members = [M('dad', { role: 'parent' }), M('kid1', { role: 'child' }), M('kid2', { isManaged: true })];
  test("'everyone' ranks everyone", () => {
    expect(competitors(members, 'everyone').map((m) => m.id)).toEqual(['dad', 'kid1', 'kid2']);
  });
  test("'kids' ranks only kids", () => {
    expect(competitors(members, 'kids').map((m) => m.id)).toEqual(['kid1', 'kid2']);
  });
  test("'kids' with no kids falls back to everyone", () => {
    const parentsOnly = [M('dad', { role: 'parent' }), M('mom', { role: 'admin_parent' })];
    expect(competitors(parentsOnly, 'kids').map((m) => m.id)).toEqual(['dad', 'mom']);
  });
  test('default mode is everyone', () => {
    expect(competitors(members).map((m) => m.id)).toEqual(['dad', 'kid1', 'kid2']);
  });
  test('isKid covers managed + child role', () => {
    expect(isKid({ role: 'child' })).toBe(true);
    expect(isKid({ isManaged: true })).toBe(true);
    expect(isKid({ role: 'parent' })).toBe(false);
  });
});

describe('buildRanked', () => {
  test('ranks by points desc, ties share a rank', () => {
    const r = buildRanked({ a: 100, b: 100, c: 40 }, [M('a'), M('b'), M('c')]);
    expect(r.map((e) => [e.memberId, e.rank])).toEqual([['a', 1], ['b', 1], ['c', 3]]);
  });
  test('missing total defaults to 0', () => {
    const r = buildRanked({ a: 10 }, [M('a'), M('b')]);
    expect(r.find((e) => e.memberId === 'b').points).toBe(0);
  });
});

describe('computeCrowns', () => {
  const entries = buildRanked({ a: 320, b: 180, c: 50 }, [M('a'), M('b'), M('c')]);

  test('Top Scorer = rank 1 with positive points', () => {
    const [top] = computeCrowns(entries);
    expect(top.kind).toBe('top');
    expect(top.awardeeMemberId).toBe('a');
    expect(top.detail).toBe('320 pts');
  });
  test('no Top Scorer in a 0-point week', () => {
    const zeros = buildRanked({ a: 0, b: 0 }, [M('a'), M('b')]);
    expect(computeCrowns(zeros)[0].awardeeMemberId).toBeNull();
  });
  test('Most Improved = biggest positive gain vs baseline', () => {
    const crowns = computeCrowns(entries, { a: 300, b: 40, c: 60 });
    const improved = crowns.find((c) => c.kind === 'improved');
    expect(improved.awardeeMemberId).toBe('b'); // +140 beats a's +20; c went down
    expect(improved.detail).toBe('+140 vs last wk');
  });
  test('no Most Improved without baseline data', () => {
    expect(computeCrowns(entries).find((c) => c.kind === 'improved').awardeeMemberId).toBeNull();
  });
  test('Goal Crusher = reached own goal, widest margin wins', () => {
    const crowns = computeCrowns(entries, {}, { a: 300, b: 200, c: 40 });
    const goal = crowns.find((c) => c.kind === 'goal');
    expect(goal.awardeeMemberId).toBe('a'); // a beat 300 by 20; b missed 200; c beat 40 by 10 → a widest
    expect(goal.detail).toBe('320 / 300');
  });
});

describe('crownsSummary', () => {
  test('names every awarded crown', () => {
    const entries = buildRanked({ a: 320, b: 180 }, [M('a'), M('b')]);
    const crowns = computeCrowns(entries, { a: 300, b: 40 }, { a: 300 });
    expect(crownsSummary(crowns)).toBe('👑 a (320 pts) · 📈 b (+140 vs last wk) · 🎯 a (320 / 300)');
  });
  test('null when nothing awarded', () => {
    const zeros = buildRanked({ a: 0 }, [M('a')]);
    expect(crownsSummary(computeCrowns(zeros))).toBeNull();
  });
});

describe('detectOvertakes', () => {
  const ids = ['a', 'b', 'c'];
  test('actor passes someone they were just behind', () => {
    // a had 90, gains 20 → 110; b has 100. a passes b.
    expect(detectOvertakes('a', { a: 110, b: 100, c: 40 }, 20, ids)).toEqual(['b']);
  });
  test('passes multiple people in one jump', () => {
    // a had 30, gains 90 → 120; b=100, c=50 both passed.
    expect(detectOvertakes('a', { a: 120, b: 100, c: 50 }, 90, ids).sort()).toEqual(['b', 'c']);
  });
  test('no overtake when still behind', () => {
    expect(detectOvertakes('a', { a: 60, b: 100 }, 10, ['a', 'b'])).toEqual([]);
  });
  test('no overtake for a non-positive delta', () => {
    expect(detectOvertakes('a', { a: 50, b: 40 }, -10, ['a', 'b'])).toEqual([]);
  });
  test('a non-competing actor overtakes nobody', () => {
    expect(detectOvertakes('dad', { dad: 200, a: 100 }, 50, ['a'])).toEqual([]);
  });
  test('passing to a tie does not count as an overtake', () => {
    // a reaches exactly b's score — b is not strictly below, so not "passed".
    expect(detectOvertakes('a', { a: 100, b: 100 }, 20, ['a', 'b'])).toEqual([]);
  });
});

describe('streakWithShields — server port (F2), same scenarios as the app', () => {
  const { streakWithShields, reachedMilestones } = require(path.join(__dirname, '../../firebase/functions/game'));
  const keys = (end, n, skip = []) => {
    const out = [];
    const [y, m, d] = end.split('-').map(Number);
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
    }
    return out;
  };
  const today = '2026-11-20';

  test('consecutive days; today not done yet does not break it', () => {
    expect(streakWithShields(keys(today, 4), today).streak).toBe(4);
    expect(streakWithShields(keys('2026-11-19', 4), today).streak).toBe(4);
  });
  test('a full week earns a shield that covers one missed day', () => {
    const r = streakWithShields(keys(today, 21, [2]), today);
    expect(r.shieldedDays).toEqual(['2026-11-18']);
    expect(r.streak).toBe(20);
  });
  test('one shield, two misses in a row: covers the first, resets on the second', () => {
    const r = streakWithShields([...keys('2026-11-17', 9), '2026-11-20'], today);
    expect(r.shieldedDays).toEqual(['2026-11-18']);
    expect(r.streak).toBe(1);
  });
  test('holds at most 2 shields', () => {
    expect(streakWithShields(keys(today, 42), today).shields).toBe(2);
  });
  test('milestones reached so far (paid once each by the caller)', () => {
    const B = { 7: 50, 14: 100, 30: 250 };
    expect(reachedMilestones(6, B)).toEqual([]);
    expect(reachedMilestones(8, B)).toEqual([7]);
    expect(reachedMilestones(15, B)).toEqual([7, 14]);
  });
});
