import {
  TWISTS, weekStartKeyOf, twistForWeek, rotationTwist, twistChipFor, teamTotals, comebackActive,
} from '@/lib/twists';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../firebase/functions/game');

describe('weekly twists (engagement 2026-11-01)', () => {
  it('app and server use the very same twist list (the server pays, the app shows)', () => {
    expect(TWISTS).toEqual(server.TWISTS);
    for (const k of ['2026-10-26', '2026-11-02', '2026-11-09', '2027-01-04']) {
      expect(twistForWeek(k, {})?.id).toBe(server.twistForWeek(k, {}).id);
    }
  });

  it('finds the family week start for Monday and Sunday weeks', () => {
    expect(weekStartKeyOf('2026-11-01', 1)).toBe('2026-10-26'); // Sunday → previous Monday
    expect(weekStartKeyOf('2026-11-02', 1)).toBe('2026-11-02');
    expect(weekStartKeyOf('2026-11-01', 0)).toBe('2026-11-01');
  });

  it('rotates through every twist, one per week, in order', () => {
    const monday = Date.UTC(2026, 10, 2);
    const ids = Array.from({ length: TWISTS.length }, (_, i) =>
      rotationTwist(new Date(monday + i * 7 * 86_400_000).toISOString().slice(0, 10)).id);
    expect(new Set(ids).size).toBe(TWISTS.length);
  });

  it('off switch and per-week skip', () => {
    expect(twistForWeek('2026-11-02', { twistsOff: true })).toBeNull();
    expect(twistForWeek('2026-11-02', { twistSkip: { '2026-11-02': true } })).toBeNull();
    expect(twistForWeek('2026-11-09', { twistSkip: { '2026-11-02': true } })).not.toBeNull();
  });

  it('chips only on the tasks the twist boosts', () => {
    const chores = TWISTS.find((t) => t.id === 'double-chores')!;
    expect(twistChipFor(chores, { category: 'chores' })).toBe('×2');
    expect(twistChipFor(chores, { category: 'homework' })).toBeNull();
    const weekend = TWISTS.find((t) => t.id === 'weekend-warriors')!;
    expect(twistChipFor(weekend, {}, '2026-11-07')).toBe('+50%'); // Saturday
    expect(twistChipFor(weekend, {}, '2026-11-04')).toBeNull();
  });

  it('team week adds up kids vs grown-ups', () => {
    const members = [{ id: 'mom', role: 'admin_parent' }, { id: 'v', role: 'child', isManaged: true }, { id: 'y', isManaged: true }];
    expect(teamTotals(members, { mom: 40, v: 30, y: 25 })).toEqual({ kids: 55, grownups: 40 });
  });

  it('comeback lasts exactly the new week, and only for last place', () => {
    const fam = { comeback: { memberIds: ['vayu'], since: '2026-11-02' } };
    expect(comebackActive(fam, 'vayu', '2026-11-02')).toBe(true);
    expect(comebackActive(fam, 'vayu', '2026-11-08')).toBe(true);
    expect(comebackActive(fam, 'vayu', '2026-11-09')).toBe(false);
    expect(comebackActive(fam, 'vian', '2026-11-03')).toBe(false);
    expect(comebackActive({ ...fam, comebackOff: true }, 'vayu', '2026-11-03')).toBe(false);
  });
});

describe('server bonus maths (firebase/functions/game.js)', () => {
  const T = (id: string) => server.TWISTS.find((t: any) => t.id === id);
  it('category twist doubles / adds half, only on that category', () => {
    expect(server.twistBonus(T('double-chores'), { award: 10, category: 'chores', dateKey: '2026-11-03' })).toBe(10);
    expect(server.twistBonus(T('homework-heroes'), { award: 25, category: 'homework', dateKey: '2026-11-03' })).toBe(13);
    expect(server.twistBonus(T('double-chores'), { award: 10, category: 'hygiene', dateKey: '2026-11-03' })).toBe(0);
  });
  it('early bird: +5 before 9am local only', () => {
    expect(server.twistBonus(T('early-bird'), { award: 10, dateKey: '2026-11-03', localHour: 7 })).toBe(5);
    expect(server.twistBonus(T('early-bird'), { award: 10, dateKey: '2026-11-03', localHour: 9 })).toBe(0);
  });
  it('weekend +50% on Sat/Sun; team week pays nothing extra', () => {
    expect(server.twistBonus(T('weekend-warriors'), { award: 10, dateKey: '2026-11-08' })).toBe(5);
    expect(server.twistBonus(T('weekend-warriors'), { award: 10, dateKey: '2026-11-05' })).toBe(0);
    expect(server.twistBonus(T('team-week'), { award: 50, dateKey: '2026-11-05' })).toBe(0);
  });
  it('comeback: last place only, never when everyone tied; +10% within 1..5', () => {
    expect(server.comebackIds([{ memberId: 'a', points: 90 }, { memberId: 'b', points: 20 }, { memberId: 'c', points: 20 }])).toEqual(['b', 'c']);
    expect(server.comebackIds([{ memberId: 'a', points: 0 }, { memberId: 'b', points: 0 }])).toEqual([]);
    expect(server.comebackIds([{ memberId: 'a', points: 10 }])).toEqual([]);
    expect(server.comebackBonus(10)).toBe(1);
    expect(server.comebackBonus(25)).toBe(3);
    expect(server.comebackBonus(100)).toBe(5);
  });
});
