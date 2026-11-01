/**
 * lib/leagues.ts — family vs family leagues, app side (Phase G7)
 * ─────────────────────────────────────────────────────────────────────────────
 * A league is up to 6 families racing over the same 4-week seasons. The server
 * (firebase/functions/league.js) owns all writes: starting, joining, leaving,
 * and each family's score row — so a family can never set its own score, and
 * other families only see its NAME and SCORE.
 *
 * The score is the AVERAGE points earned per competing player this season, so
 * family size doesn't decide the winner (the raw total is shown too).
 *
 * Here: thin callable wrappers, a live watcher, and pure ranking helpers
 * (unit-tested).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { firestore, functions } from '@/lib/fb';

export const LEAGUE_MAX_FAMILIES = 6;

export interface LeagueRow {
  familyId: string;
  familyName: string;
  emoji?: string;
  season: number;
  points: number;
  players: number;
  avgPoints: number;
  lastSeason?: { season: number; points: number; players: number; avgPoints: number } | null;
}

export interface League {
  id: string;
  name: string;
  inviteCode: string;
  familyIds: string[];
  rows: LeagueRow[];
}

export interface RankedRow extends LeagueRow { rank: number; current: boolean }

/**
 * This season's table. A row last refreshed in an older season hasn't scored
 * yet this season, so it counts as 0 (it updates on the family's next points).
 * Ranked by average per player; ties share a rank.
 */
export function rankLeague(rows: LeagueRow[], season: number): RankedRow[] {
  const ranked = rows.map((r) => (r.season === season
    ? { ...r, current: true, rank: 0 }
    : { ...r, points: 0, avgPoints: 0, current: false, rank: 0 }))
    .sort((a, b) => b.avgPoints - a.avgPoints || b.points - a.points || a.familyName.localeCompare(b.familyName));
  let rank = 1;
  ranked.forEach((r, i) => {
    if (i > 0 && r.avgPoints < ranked[i - 1].avgPoints) rank = i + 1;
    r.rank = rank;
  });
  return ranked;
}

/** Each family's result for a past season (from its live row or `lastSeason`). */
function resultFor(r: LeagueRow, season: number) {
  if (r.season === season) return { avgPoints: r.avgPoints, points: r.points };
  if (r.lastSeason?.season === season) return { avgPoints: r.lastSeason.avgPoints, points: r.lastSeason.points };
  return null;
}

/** Winner(s) of a finished season — ties share it; nobody scored = none. */
export function seasonChampions(rows: LeagueRow[], season: number): { familyId: string; familyName: string; avgPoints: number }[] {
  const results = rows
    .map((r) => ({ r, res: resultFor(r, season) }))
    .filter((x): x is { r: LeagueRow; res: { avgPoints: number; points: number } } => !!x.res && x.res.avgPoints > 0);
  if (!results.length) return [];
  const best = Math.max(...results.map((x) => x.res.avgPoints));
  return results.filter((x) => x.res.avgPoints === best).map((x) => ({ familyId: x.r.familyId, familyName: x.r.familyName, avgPoints: best }));
}

/** Live league: the league doc + its score rows, merged. */
export function watchLeague(leagueId: string, onChange: (l: League | null) => void): () => void {
  let doc: any = null;
  let rows: LeagueRow[] = [];
  let gotDoc = false;
  const emit = () => {
    if (!gotDoc) return;
    onChange(doc ? { id: leagueId, name: doc.name, inviteCode: doc.inviteCode, familyIds: doc.familyIds ?? [], rows } : null);
  };
  const leagueRef = firestore().collection('leagues').doc(leagueId);
  const unsubDoc = leagueRef.onSnapshot(
    (s) => { doc = s.exists() ? s.data() : null; gotDoc = true; emit(); },
    () => { doc = null; gotDoc = true; emit(); },
  );
  const unsubRows = leagueRef.collection('standings').onSnapshot(
    (snap) => {
      rows = snap.docs.map((d: any) => ({ familyId: d.id, ...(d.data() as any) }));
      emit();
    },
    () => { rows = []; emit(); },
  );
  return () => { unsubDoc(); unsubRows(); };
}

export async function createLeague(name: string): Promise<{ leagueId: string; inviteCode: string }> {
  const res: any = await functions().httpsCallable('createLeague')({ name });
  return res.data;
}

export async function joinLeague(inviteCode: string): Promise<{ leagueId: string; joined: boolean }> {
  const res: any = await functions().httpsCallable('joinLeague')({ inviteCode });
  return res.data;
}

export async function leaveLeague(leagueId: string): Promise<void> {
  await functions().httpsCallable('leaveLeague')({ leagueId });
}
