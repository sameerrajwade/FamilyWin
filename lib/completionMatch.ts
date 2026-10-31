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
  if (recurrence === 'weekly') return all.find((c) => c.weekId === period.weekId) ?? null;
  if (recurrence === 'monthly') {
    return all.find((c) => (c.monthId ? c.monthId === period.monthId : monthKey(c.completedAt) === period.monthId)) ?? null;
  }
  // 'once' or custom — any completion at all = done
  return all[0];
}
