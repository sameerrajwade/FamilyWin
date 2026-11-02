/**
 * lib/completionMatch.ts
 * Recurrence-aware "is this task done for the current period?" — shared by Home
 * and Kid Mode so the two can never disagree about a task's state.
 *
 * KEY: filter() not find(). A daily task completed yesterday AND today has TWO
 * completions in the week; we must check whether ANY falls in today's window.
 * A REJECTED completion doesn't count — the task returns to "to do".
 */

interface MatchableCompletion {
  taskId: string;
  memberId: string;
  status?: string;
  completedDate?: string;
  weekId?: string;
  monthId?: string;
  completedAt?: any; // Firestore Timestamp
}

export interface Period {
  todayStr: string; // YYYY-MM-DD
  weekId: string;   // YYYY-WNN
  monthId: string;  // YYYY-MM
  /**
   * The FAMILY week (from its weekStartDay), as inclusive YYYY-MM-DD keys.
   * When present, a weekly task counts as done if it was completed on any day
   * of this range. Needed because the stored `weekId` uses SUNDAY-start weeks,
   * so for a Monday-start family a task done on Saturday looked "not done" on
   * Sunday (bug found 2026-11-01).
   */
  weekStartKey?: string;
  weekEndKey?: string;
}

/**
 * The stored completion week id ("YYYY-WNN"). NOTE: Sunday-start numbering —
 * it does NOT follow the family's weekStartDay; use familyPeriod() for "this
 * week". lib/firebase getWeekIdForDate delegates here.
 */
export function weekIdOf(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Today's period for matching, built on the FAMILY week, plus the stored week
 * ids that overlap it (a family week can span two Sunday-start ids) so callers
 * can load every completion in the family week.
 */
export function familyPeriod(now: Date = new Date(), weekStartDay: number = 1): Period & { weekIds: string[] } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() - weekStartDay + 7) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const weekIds = Array.from(new Set([weekIdOf(start), weekIdOf(end)]));
  return {
    todayStr: keyOf(today),
    weekId: weekIdOf(today),
    monthId: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
    weekStartKey: keyOf(start),
    weekEndKey: keyOf(end),
    weekIds,
  };
}

/** A Firestore Timestamp's local calendar day as YYYY-MM-DD (null if absent). */
export function dayKey(ts: any): string | null {
  const d = ts?.toDate?.();
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(ts: any): string | null {
  const d = ts?.toDate?.();
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function findCompletionForPeriod<C extends MatchableCompletion>(
  completions: C[],
  taskId: string,
  memberId: string,
  recurrence: string,
  period: Period,
): C | null {
  const all = completions.filter((c) => c.taskId === taskId && c.memberId === memberId && c.status !== 'rejected');
  if (all.length === 0) return null;
  if (recurrence === 'daily') {
    return all.find((c) => (c.completedDate ? c.completedDate === period.todayStr : dayKey(c.completedAt) === period.todayStr)) ?? null;
  }
  if (recurrence === 'weekly') {
    if (period.weekStartKey && period.weekEndKey) {
      const { weekStartKey: s, weekEndKey: e } = period;
      return all.find((c) => {
        const k = c.completedDate ?? dayKey(c.completedAt);
        return !!k && k >= s && k <= e;
      }) ?? null;
    }
    return all.find((c) => c.weekId === period.weekId) ?? null;
  }
  if (recurrence === 'monthly') {
    return all.find((c) => (c.monthId ? c.monthId === period.monthId : monthKey(c.completedAt) === period.monthId)) ?? null;
  }
  // 'once' or custom — any completion at all = done
  return all[0];
}
