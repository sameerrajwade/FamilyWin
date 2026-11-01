/**
 * lib/seasons.ts — 4-week seasons + season badges (Phase F1), PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * The week resets every Sunday; a SEASON is four family weeks in a row, so a
 * slow week doesn't end your chances and there's a bigger prize to chase.
 *
 *   • Seasons are fixed blocks counted from SEASON_EPOCH (aligned to the
 *     family's week-start day), so every device agrees without storing
 *     anything. Season 1 = the week of 26 Oct 2026 (the ledger was reset 31 Oct).
 *   • Standings = points EARNED in the season (reward spending excluded, like
 *     the weekly leaderboard), among the members who compete.
 *   • When a season ends it leaves BADGES, worked out from history:
 *       🥇 Season champion — top score (ties share it)
 *       🏅 All-4-weeks     — earned points in every week of the season
 * No Firebase/React here; unit-tested.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { parseDateKey } from '@/lib/surprisePacks';

export const SEASON_WEEKS = 4;
export const SEASON_EPOCH = '2026-10-26';

const DAY = 86_400_000;

function weekStartOf(d: Date, weekStartDay: number): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() - weekStartDay + 7) % 7));
  return s;
}

export interface SeasonInfo {
  number: number;      // 1-based; ≤ 0 before the epoch ("preseason")
  week: number;        // 1..4
  start: Date;         // local midnight, first day of the season
  end: Date;           // exclusive
  daysLeft: number;    // whole days left including today (≥ 1)
}

export function seasonFor(date: Date = new Date(), weekStartDay: number = 1): SeasonInfo {
  const epoch = weekStartOf(parseDateKey(SEASON_EPOCH), weekStartDay);
  const ws = weekStartOf(date, weekStartDay);
  const weeks = Math.round((ws.getTime() - epoch.getTime()) / (7 * DAY)); // round: DST-safe
  const idx = Math.floor(weeks / SEASON_WEEKS);
  const start = new Date(epoch);
  start.setDate(epoch.getDate() + idx * SEASON_WEEKS * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + SEASON_WEEKS * 7);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    number: idx + 1,
    week: weeks - idx * SEASON_WEEKS + 1,
    start,
    end,
    daysLeft: Math.max(1, Math.round((end.getTime() - today.getTime()) / DAY)),
  };
}

/** The season with a given number (for past-season badges). */
export function seasonByNumber(n: number, weekStartDay: number = 1): SeasonInfo {
  const epoch = weekStartOf(parseDateKey(SEASON_EPOCH), weekStartDay);
  const mid = new Date(epoch);
  mid.setDate(epoch.getDate() + (n - 1) * SEASON_WEEKS * 7 + 3);
  return seasonFor(mid, weekStartDay);
}

export interface LedgerTx { memberId: string; delta: number; source?: string; date: Date | null }

export interface SeasonRow { memberId: string; points: number; rank: number }

/** Season standings among `playerIds` (ranked, ties share a rank). */
export function seasonStandings(txns: LedgerTx[], playerIds: string[], season: Pick<SeasonInfo, 'start' | 'end'>): SeasonRow[] {
  const pts: Record<string, number> = {};
  for (const id of playerIds) pts[id] = 0;
  for (const t of txns) {
    if (pts[t.memberId] === undefined || t.source === 'redemption' || !t.date) continue;
    if (t.date >= season.start && t.date < season.end) pts[t.memberId] += t.delta || 0;
  }
  const rows = playerIds.map((memberId) => ({ memberId, points: pts[memberId], rank: 0 }))
    .sort((a, b) => b.points - a.points);
  let rank = 1;
  rows.forEach((r, i) => { if (i > 0 && r.points < rows[i - 1].points) rank = i + 1; r.rank = rank; });
  return rows;
}

export interface SeasonBadge {
  season: number;
  kind: 'champion' | 'allweeks';
  emoji: string;
  label: string;
}

/**
 * Badges from every FINISHED season (1 … current−1), per member. Only seasons
 * where someone earned points count — an empty season crowns nobody.
 */
export function seasonBadges(
  txns: LedgerTx[], playerIds: string[], now: Date = new Date(), weekStartDay: number = 1,
): Record<string, SeasonBadge[]> {
  const out: Record<string, SeasonBadge[]> = {};
  const add = (id: string, b: SeasonBadge) => { (out[id] ??= []).push(b); };
  const current = seasonFor(now, weekStartDay).number;
  for (let n = 1; n < current; n++) {
    const s = seasonByNumber(n, weekStartDay);
    const rows = seasonStandings(txns, playerIds, s);
    const top = rows[0];
    if (top && top.points > 0) {
      for (const r of rows) {
        if (r.rank === 1 && r.points > 0) add(r.memberId, { season: n, kind: 'champion', emoji: '🥇', label: `Season ${n} champion` });
      }
    }
    for (const id of playerIds) {
      let weeksPlayed = 0;
      for (let w = 0; w < SEASON_WEEKS; w++) {
        const ws = new Date(s.start); ws.setDate(s.start.getDate() + w * 7);
        const we = new Date(ws); we.setDate(ws.getDate() + 7);
        const earned = txns.some((t) => t.memberId === id && t.source !== 'redemption' && t.date && t.date >= ws && t.date < we && (t.delta || 0) > 0);
        if (earned) weeksPlayed++;
      }
      if (weeksPlayed === SEASON_WEEKS) add(id, { season: n, kind: 'allweeks', emoji: '🏅', label: `Played all 4 weeks · Season ${n}` });
    }
  }
  return out;
}
