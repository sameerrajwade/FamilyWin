import { rankLeague, seasonChampions, type LeagueRow } from '@/lib/leagues';

const row = (familyId: string, season: number, points: number, players: number, extra: Partial<LeagueRow> = {}): LeagueRow => ({
  familyId, familyName: familyId, season, points, players, avgPoints: Math.round(points / players), ...extra,
});

describe('rankLeague (G7)', () => {
  it('ranks by average per player, so a smaller family can beat a bigger one', () => {
    const r = rankLeague([row('big', 1, 300, 4), row('small', 1, 200, 2)], 1);
    expect(r.map((x) => [x.familyId, x.rank])).toEqual([['small', 1], ['big', 2]]);
  });
  it('a row from an older season counts as 0 this season', () => {
    const r = rankLeague([row('stale', 1, 900, 2), row('fresh', 2, 40, 2)], 2);
    expect(r[0].familyId).toBe('fresh');
    expect(r[1]).toMatchObject({ familyId: 'stale', avgPoints: 0, points: 0, current: false });
  });
  it('ties share a rank', () => {
    const r = rankLeague([row('a', 1, 100, 2), row('b', 1, 50, 1), row('c', 1, 10, 1)], 1);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
});

describe('seasonChampions (G7)', () => {
  it('finds last season\'s winner from live rows or their lastSeason', () => {
    const rows = [
      row('rolled', 2, 10, 2, { lastSeason: { season: 1, points: 400, players: 2, avgPoints: 200 } }),
      row('quiet', 1, 300, 2), // never scored in season 2 → its live row IS season 1
    ];
    expect(seasonChampions(rows, 1)).toEqual([{ familyId: 'rolled', familyName: 'rolled', avgPoints: 200 }]);
  });
  it('ties share the title; a season nobody scored in has no champion', () => {
    expect(seasonChampions([row('a', 1, 100, 1), row('b', 1, 100, 1)], 1).map((c) => c.familyId)).toEqual(['a', 'b']);
    expect(seasonChampions([row('a', 1, 0, 2)], 1)).toEqual([]);
  });
});
