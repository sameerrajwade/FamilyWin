/**
 * Phase F pure rules: streak shields (F2), seasons + badges (F1), game-health
 * metrics for the Parent Report (F3).
 */
import { streakWithShields, SHIELD_CAP } from '@/lib/streakShield';
import { seasonFor, seasonByNumber, seasonStandings, seasonBadges, type LedgerTx } from '@/lib/seasons';
import { buildGameHealth, formatWait } from '@/lib/familyGame';
import { dateKeyOf } from '@/lib/surprisePacks';

const at = (s: string) => new Date(`${s}T12:00:00`);
/** Date keys for `n` days ending `end` (inclusive), skipping the given offsets back. */
function run(end: string, n: number, skip: number[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const d = at(end); d.setDate(d.getDate() - i);
    out.push(dateKeyOf(d));
  }
  return out;
}

describe('streakWithShields (F2)', () => {
  const now = at('2026-11-20'); // a Friday

  it('plain consecutive days, today counts', () => {
    expect(streakWithShields(run('2026-11-20', 4), now).streak).toBe(4);
  });
  it("today not done yet doesn't break the streak", () => {
    expect(streakWithShields(run('2026-11-19', 4), now).streak).toBe(4);
  });
  it('a missed day with no shield resets the streak', () => {
    expect(streakWithShields(run('2026-11-20', 3), now).streak).toBe(3);
    // active 11/20, 11/19, gap 11/18, then lots before — no shield earned → 2
    const days = [...run('2026-11-20', 2), ...run('2026-11-17', 2)];
    expect(streakWithShields(days, now).streak).toBe(2);
  });
  it('a full week (≥5 active days) earns a shield that covers one missed day', () => {
    // Every day for 3 weeks except Wed 11/18 → the earlier weeks earned shields.
    const days = run('2026-11-20', 21, [2]); // offset 2 = 11/18
    const r = streakWithShields(days, now);
    expect(r.shieldedDays).toEqual(['2026-11-18']);
    expect(r.streak).toBe(20); // 21 days minus the shielded one, still unbroken
  });
  it('holds at most SHIELD_CAP shields', () => {
    const r = streakWithShields(run('2026-11-20', 42), now);
    expect(r.shields).toBe(SHIELD_CAP);
  });
  it('with ONE shield, two misses in a row: the shield covers the first, the second resets', () => {
    // Only the week of Mon 11/9 is a full week → exactly one shield, earned 11/16.
    const days = [...run('2026-11-17', 9), '2026-11-20']; // 11/9..11/17 active, miss 11/18 + 11/19
    const r = streakWithShields(days, now);
    expect(r.shieldedDays).toEqual(['2026-11-18']);
    expect(r.streak).toBe(1); // reset on 11/19, then 11/20 starts again
    expect(r.shields).toBe(0);
  });
});

describe('seasons (F1)', () => {
  it('season 1 starts the week of 26 Oct 2026 and lasts 4 weeks', () => {
    const s = seasonFor(at('2026-11-01'), 1);
    expect(s.number).toBe(1);
    expect(s.week).toBe(1);
    expect(dateKeyOf(s.start)).toBe('2026-10-26');
    expect(dateKeyOf(s.end)).toBe('2026-11-23');
  });
  it('rolls to season 2 after four weeks, week counter resets', () => {
    expect(seasonFor(at('2026-11-22'), 1)).toMatchObject({ number: 1, week: 4 });
    expect(seasonFor(at('2026-11-23'), 1)).toMatchObject({ number: 2, week: 1 });
  });
  it('follows a Sunday-start family', () => {
    expect(dateKeyOf(seasonFor(at('2026-11-01'), 0).start)).toBe('2026-10-25');
  });
  it('seasonByNumber finds the right block', () => {
    expect(dateKeyOf(seasonByNumber(2, 1).start)).toBe('2026-11-23');
  });

  const tx = (memberId: string, delta: number, day: string, source = 'task'): LedgerTx => ({ memberId, delta, source, date: at(day) });

  it('standings sum earned points in the season, spending excluded', () => {
    const s = seasonByNumber(1);
    const rows = seasonStandings([
      tx('vian', 100, '2026-10-28'), tx('vian', -60, '2026-10-29', 'redemption'),
      tx('vayu', 80, '2026-11-10'), tx('vayu', 500, '2026-11-24'), // last one is season 2
    ], ['vian', 'vayu'], s);
    expect(rows).toEqual([{ memberId: 'vian', points: 100, rank: 1 }, { memberId: 'vayu', points: 80, rank: 2 }]);
  });

  it('awards badges only for finished seasons', () => {
    const txns = [
      tx('vian', 50, '2026-10-27'), tx('vian', 50, '2026-11-03'), tx('vian', 50, '2026-11-10'), tx('vian', 50, '2026-11-17'),
      tx('vayu', 300, '2026-11-05'),
    ];
    expect(seasonBadges(txns, ['vian', 'vayu'], at('2026-11-20'))).toEqual({}); // season 1 still running
    const b = seasonBadges(txns, ['vian', 'vayu'], at('2026-11-25'));
    expect(b.vayu.map((x) => x.kind)).toEqual(['champion']);
    expect(b.vian.map((x) => x.kind)).toEqual(['allweeks']);
  });
});

describe('buildGameHealth (F3)', () => {
  const members = [
    { id: 'dad', displayName: 'Sameer', role: 'admin_parent' },
    { id: 'vian', displayName: 'Vian', role: 'child', isManaged: true },
    { id: 'vayu', displayName: 'Vayu', role: 'child', isManaged: true },
  ];
  const now = at('2026-11-05');
  const d = (s: string, h = 12) => new Date(`${s}T${String(h).padStart(2, '0')}:00:00`);

  it('counts parent days, kid-claimed share, median approval time', () => {
    const h = buildGameHealth({
      members, now,
      completions: [
        { memberId: 'vian', completedAt: d('2026-11-02', 9), approvedAt: d('2026-11-02', 10), approvedBy: 'dad', status: 'approved' },  // 60 min
        { memberId: 'vian', completedAt: d('2026-11-03', 9), approvedAt: d('2026-11-03', 12), approvedBy: 'dad', status: 'approved' },  // 180 min
        { memberId: 'vayu', completedAt: d('2026-11-03', 18) },                                                                           // parent ticked it
        { memberId: 'vayu', completedAt: d('2026-11-04', 18), status: 'pending' },
        { memberId: 'dad', completedAt: d('2026-11-04', 7) },
      ],
      seasonRows: [{ memberId: 'vian', points: 200, rank: 1 }, { memberId: 'vayu', points: 30, rank: 2 }],
      lastActiveByMember: { vayu: d('2026-11-04') },
    });
    expect(h.parentActiveDays).toBe(3); // 11/2, 11/3 approvals + 11/4 own task
    expect(h.kidClaimedPct).toBe(75);   // 3 of 4 kid chores were claimed by the kid
    expect(h.medianApprovalMins).toBe(120);
    expect(h.lastPlace).toEqual({ memberId: 'vayu', name: 'Vayu', daysSinceActive: 1, stillActive: true });
  });

  it('flags a last-place kid who has gone quiet', () => {
    const h = buildGameHealth({
      members, now, completions: [],
      seasonRows: [{ memberId: 'vian', points: 200, rank: 1 }, { memberId: 'vayu', points: 0, rank: 2 }],
      lastActiveByMember: { vayu: d('2026-10-29') },
    });
    expect(h.lastPlace?.stillActive).toBe(false);
    expect(h.kidClaimedPct).toBeNull();
    expect(h.medianApprovalMins).toBeNull();
  });

  it('no last place with a single kid', () => {
    const h = buildGameHealth({ members: members.slice(0, 2), now, completions: [], seasonRows: [{ memberId: 'vian', points: 5, rank: 1 }], lastActiveByMember: {} });
    expect(h.lastPlace).toBeNull();
  });

  it('formats waits', () => {
    expect(formatWait(12)).toBe('12 min');
    expect(formatWait(180)).toBe('3 h');
    expect(formatWait(3000)).toBe('2 days');
  });
});
