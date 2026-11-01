import {
  isKid, competitors, coaches, familyGoalProgress, suggestFamilyGoal,
  buildParentReport, choreMinutes, formatMinutes, makeGateQuestion, weeklyTrend, shouldShowCrowning, savingProgress, type GameMember, type ReportTx,
} from '@/lib/familyGame';

const dad: GameMember = { id: 'dad', displayName: 'Sameer R', role: 'admin_parent' };
const mom: GameMember = { id: 'mom', displayName: 'Asmita', role: 'parent' };
const vian: GameMember = { id: 'vian', displayName: 'Vian', role: 'child', isManaged: true };
const vayu: GameMember = { id: 'vayu', displayName: 'Vayu', role: 'child', isManaged: true };

describe('who competes', () => {
  it('identifies kids', () => {
    expect(isKid(vian)).toBe(true);
    expect(isKid(dad)).toBe(false);
    expect(isKid({ role: 'parent', isManaged: true })).toBe(true);
  });

  it('defaults to everyone competing (no coaches)', () => {
    expect(competitors([dad, vian, mom, vayu]).map((m) => m.id)).toEqual(['dad', 'vian', 'mom', 'vayu']);
    expect(coaches([dad, vian, mom, vayu])).toEqual([]);
    expect(competitors([dad, vian], undefined).length).toBe(2); // absent setting = everyone
  });

  it("'kids' mode: kids rank, parents coach", () => {
    expect(competitors([dad, vian, mom, vayu], 'kids').map((m) => m.id)).toEqual(['vian', 'vayu']);
    expect(coaches([dad, vian, mom, vayu], 'kids').map((m) => m.id)).toEqual(['dad', 'mom']);
  });

  it("'kids' mode with no kids still ranks everyone", () => {
    expect(competitors([dad, mom], 'kids').map((m) => m.id)).toEqual(['dad', 'mom']);
    expect(coaches([dad, mom], 'kids')).toEqual([]);
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

describe('weeklyTrend', () => {
  const now = new Date(2026, 10, 4, 12); // Wed 4 Nov 2026
  const at = (m: number, d: number) => new Date(2026, m, d, 10);
  const txns = [
    { delta: 30, source: 'task', date: at(10, 2) },        // this week (Mon 2 Nov)
    { delta: -20, source: 'redemption', date: at(10, 3) }, // spending: excluded
    { delta: 50, source: 'task', date: at(9, 27) },        // last week
    { delta: -5, source: 'discipline', date: at(9, 28) },  // penalties count
    { delta: 99, source: 'task', date: at(8, 1) },         // too old
    { delta: 10, source: 'task', date: null },
  ];
  it('returns 6 Monday-start weeks, oldest first, earned only', () => {
    const bars = weeklyTrend(txns, 1, 6, now);
    expect(bars).toHaveLength(6);
    expect(bars[5].start.getDate()).toBe(2);   // this week starts Mon 2 Nov
    expect(bars[5].points).toBe(30);
    expect(bars[4].points).toBe(45);
    expect(bars.slice(0, 4).every((b) => b.points === 0)).toBe(true);
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


describe('shouldShowCrowning (E5 Sunday ceremony)', () => {
  const base = { seenWeekKey: '2026-10-19', thisWeekKey: '2026-10-26', daysIntoWeek: 0, lastWeekHadChampion: true };
  it('opens on the first launch of a new week when last week had a champion', () => {
    expect(shouldShowCrowning(base)).toBe(true);
    expect(shouldShowCrowning({ ...base, seenWeekKey: null })).toBe(true);
  });
  it('opens only once per week on this device', () => {
    expect(shouldShowCrowning({ ...base, seenWeekKey: '2026-10-26' })).toBe(false);
  });
  it('stays closed after the first 3 days of the week', () => {
    expect(shouldShowCrowning({ ...base, daysIntoWeek: 2 })).toBe(true);
    expect(shouldShowCrowning({ ...base, daysIntoWeek: 3 })).toBe(false);
  });
  it('stays closed when nobody earned points last week', () => {
    expect(shouldShowCrowning({ ...base, lastWeekHadChampion: false })).toBe(false);
  });
});


describe('savingProgress (E2 save for a reward)', () => {
  it('reports progress, remaining and affordability', () => {
    expect(savingProgress(70, 100)).toEqual({ progress: 0.7, pct: 70, remaining: 30, affordable: false });
    expect(savingProgress(120, 100)).toEqual({ progress: 1, pct: 100, remaining: 0, affordable: true });
  });
  it('never reads 100% before it is affordable', () => {
    expect(savingProgress(199, 200).pct).toBe(99);
  });
  it('treats a negative balance as no progress', () => {
    expect(savingProgress(-40, 100)).toEqual({ progress: 0, pct: 0, remaining: 100, affordable: false });
  });
  it('a free reward is always affordable', () => {
    expect(savingProgress(0, 0).affordable).toBe(true);
  });
});
