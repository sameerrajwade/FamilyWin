import {
  isKid, competitors, coaches, familyGoalProgress, suggestFamilyGoal,
  buildParentReport, choreMinutes, formatMinutes, makeGateQuestion, type GameMember, type ReportTx,
} from '@/lib/familyGame';

const dad: GameMember = { id: 'dad', displayName: 'Sameer R', role: 'admin_parent' };
const mom: GameMember = { id: 'mom', displayName: 'Asmita', role: 'parent' };
const vian: GameMember = { id: 'vian', displayName: 'Vian', role: 'child', isManaged: true };
const vayu: GameMember = { id: 'vayu', displayName: 'Vayu', role: 'child', isManaged: true };

describe('who competes', () => {
  it('kids are players, parents are coaches', () => {
    expect(isKid(vian)).toBe(true);
    expect(isKid(dad)).toBe(false);
    expect(isKid({ role: 'parent', isManaged: true })).toBe(true);
    expect(competitors([dad, vian, mom, vayu]).map((m) => m.id)).toEqual(['vian', 'vayu']);
    expect(coaches([dad, vian, mom, vayu]).map((m) => m.id)).toEqual(['dad', 'mom']);
  });

  it('a kid-less family still gets a leaderboard of everyone', () => {
    expect(competitors([dad, mom]).map((m) => m.id)).toEqual(['dad', 'mom']);
    expect(coaches([dad, mom])).toEqual([]);
  });
});

describe('family co-op goal', () => {
  it('sums everyone (incl. coaches), ignoring negatives', () => {
    const p = familyGoalProgress({ dad: 50, vian: 200, vayu: -30 }, 500);
    expect(p).toEqual({ total: 250, target: 500, progress: 0.5, remaining: 250, reached: false });
  });

  it('caps progress at 1 when reached', () => {
    const p = familyGoalProgress({ vian: 600 }, 500);
    expect(p.reached).toBe(true);
    expect(p.progress).toBe(1);
    expect(p.remaining).toBe(0);
  });

  it('never divides by zero', () => {
    expect(familyGoalProgress({}, 0).progress).toBe(0);
  });

  it('suggests a reachable stretch target', () => {
    expect(suggestFamilyGoal(0)).toBe(300);
    expect(suggestFamilyGoal(400)).toBe(450);  // 460 → nearest 50
    expect(suggestFamilyGoal(20)).toBe(100);   // floor
  });
});

describe('parent report', () => {
  const d = (day: number) => new Date(2026, 9, 26 + day, 12);
  const thisWeek: ReportTx[] = [
    { memberId: 'vian', delta: 10, source: 'task', date: d(0) },
    { memberId: 'vian', delta: 50, source: 'task', date: d(0) },
    { memberId: 'vian', delta: -20, source: 'redemption', date: d(1) },
    { memberId: 'vayu', delta: 25, source: 'task', date: d(2) },
    { memberId: 'dad', delta: 10, source: 'task', date: d(3) },
    { memberId: 'vayu', delta: -5, source: 'discipline', date: d(3) },
  ];
  const lastWeek: ReportTx[] = [
    { memberId: 'vian', delta: 100, source: 'task', date: null },
    { memberId: 'vayu', delta: 5, source: 'task', date: null },
  ];
  const r = buildParentReport(thisWeek, lastWeek, [dad, vian, mom, vayu]);

  it('counts chores (positive task points only) across the family', () => {
    expect(r.chores).toBe(4);
    expect(r.lastWeekChores).toBe(2);
  });

  it('estimates minutes saved from point values', () => {
    expect(r.minutesSaved).toBe(10 + 35 + 20 + 10);
  });

  it('counts distinct active days', () => {
    expect(r.activeDays).toBe(3);
  });

  it('ranks kids only, with earned points excluding reward spends', () => {
    expect(r.kids.map((k) => [k.memberId, k.points])).toEqual([['vian', 60], ['vayu', 20]]);
    expect(r.kids[0].changePct).toBe(-40);
    expect(r.kids[1].changePct).toBe(300);
  });

  it('finds the most improved kid and who needs a cheer', () => {
    expect(r.mostImproved?.memberId).toBe('vayu');
    expect(r.needsCheer?.memberId).toBe('vayu'); // 20 < 60 * 0.5
  });

  it('does not flag anyone when kids are close', () => {
    const close = buildParentReport(
      [{ memberId: 'vian', delta: 30, source: 'task', date: d(0) }, { memberId: 'vayu', delta: 25, source: 'task', date: d(0) }],
      [], [vian, vayu],
    );
    expect(close.needsCheer).toBeNull();
    expect(close.mostImproved?.memberId).toBe('vian');
  });
});

describe('helpers', () => {
  it('chore minutes by difficulty points', () => {
    expect([choreMinutes(10), choreMinutes(25), choreMinutes(50)]).toEqual([10, 20, 35]);
  });

  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(155)).toBe('2h 35m');
  });

  it('gate question is a 6–9 times-table', () => {
    const q = makeGateQuestion(() => 0.99);
    expect(q).toEqual({ a: 9, b: 9, answer: 81 });
    const q2 = makeGateQuestion(() => 0);
    expect(q2.answer).toBe(36);
  });
});
