/**
 * lib/surprisePacks.ts — PURE rules for surprise packs (Phase C8)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Daily pack  — every DAILY task due for a person on a day is done AND
 *                 approved (weekly/monthly tasks never block it)
 *                 → random 5–20 bonus points.
 *   Weekly pack — they earned the daily pack on all 7 days of the family week
 *                 → random 15–50 bonus points.
 * A floor (5 / 15) keeps a "surprise" from ever feeling like a letdown.
 * Each pack has a FIXED transaction id per person+day (or +week), so it can be
 * awarded at most once (transactions are immutable in the security rules).
 * Firestore side lives in lib/surprise.ts; this file has no Firebase/React.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { findCompletionForPeriod, type Period } from '@/lib/completionMatch';
import { effectiveAssignee, isDueToday } from '@/lib/rotation';

export const DAILY_PACK = { min: 5, max: 20 } as const;
export const WEEKLY_PACK = { min: 15, max: 50 } as const;

/** Random integer in [min, max] (inclusive). */
export function rollPack(kind: 'daily' | 'weekly', rand: () => number = Math.random): number {
  const { min, max } = kind === 'daily' ? DAILY_PACK : WEEKLY_PACK;
  return min + Math.floor(rand() * (max - min + 1));
}

export const dailyPackId = (memberId: string, dateKey: string) => `surprise_day_${memberId}_${dateKey}`;
export const weeklyPackId = (memberId: string, weekStartKey: string) => `surprise_week_${memberId}_${weekStartKey}`;
export const revokedId = (packId: string) => `${packId}_revoked`;

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // noon: safe from DST edges
}

/** The 7 date keys of the family week containing `day`. */
export function weekDateKeys(day: Date, weekStartDay: number = 1): string[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  start.setDate(start.getDate() - ((start.getDay() - weekStartDay + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return dateKeyOf(d);
  });
}

interface PackTask {
  id: string;
  recurrence: string;
  assignedTo?: string | string[] | null;
  rotation?: any;
  scheduledDays?: number[] | null;
}
interface PackCompletion {
  taskId: string; memberId: string; status?: string; wasAutoFailed?: boolean;
  completedDate?: string; weekId?: string; monthId?: string; completedAt?: any;
}

/**
 * Tasks due for a member on `day` — the same set Home shows for them:
 * their own (incl. their rotation turn) plus whole-family tasks for account
 * holders (managed kids only ever see tasks assigned to them).
 */
export function tasksDueFor<T extends PackTask>(
  tasks: T[], member: { id: string; isManaged?: boolean }, day: Date, weekStartDay: number = 1,
): T[] {
  return tasks.filter((t) => {
    if (!isDueToday(t.scheduledDays, day)) return false;
    const owner = effectiveAssignee(t as any, day, weekStartDay);
    return owner == null ? !member.isManaged : owner === member.id;
  });
}

/**
 * Only DAILY tasks decide the daily pack (user rule, 2026-10-31): a weekly or
 * monthly task still open must not block today's bonus. Day-specific tasks
 * (e.g. Mon/Thu only) are daily tasks with scheduledDays, so they count on the
 * days they're due.
 */
export const isDailyTask = (t: { recurrence?: string }) => t.recurrence === 'daily';

/**
 * Did this member finish EVERY daily task due on `day`? Each needs a completion
 * in its period that is approved/settled — not pending, rejected or auto-failed.
 * A day with no daily tasks never counts (nothing was "finished").
 */
export function isDayComplete(dueTasks: PackTask[], completions: PackCompletion[], memberId: string, period: Period): boolean {
  const daily = dueTasks.filter(isDailyTask);
  if (daily.length === 0) return false;
  return daily.every((t) => {
    const c = findCompletionForPeriod(completions, t.id, memberId, t.recurrence, period);
    return !!c && !c.wasAutoFailed && c.status !== 'pending';
  });
}

/**
 * Daily quest ring (Phase E1): progress toward today's surprise pack, from the
 * tasks Home shows. Counts the same way isDayComplete does — DAILY tasks only;
 * `approved` = done and settled (not pending, not missed); `pending` = claimed,
 * waiting for a parent OK. `complete` means the pack is earned (or about to land).
 */
export interface QuestProgress { total: number; approved: number; pending: number; complete: boolean }

export function questProgress(
  tasks: { recurrence?: string; completion?: { wasAutoFailed?: boolean; status?: string } | null }[],
): QuestProgress {
  const daily = tasks.filter(isDailyTask);
  let approved = 0, pending = 0;
  for (const t of daily) {
    const c = t.completion;
    if (!c || c.wasAutoFailed || c.status === 'rejected') continue;
    if (c.status === 'pending') pending++; else approved++;
  }
  const total = daily.length;
  return { total, approved, pending, complete: total > 0 && approved === total };
}

/** One line under the greeting that tells the player what the ring means. */
export function questLabel(p: QuestProgress): string {
  if (p.total === 0) return "Let's make today count 💪";
  if (p.complete) return 'Daily tasks done — surprise pack earned! 🎁';
  if (p.approved + p.pending === p.total) {
    return `Daily tasks done — ${p.pending} waiting for an OK, then your pack 🎁`;
  }
  return `${p.approved + p.pending} of ${p.total} daily done today · finish them for a surprise pack`;
}

/** Perfect week = a daily pack on every one of the week's 7 days. */
export function isPerfectWeek(dailyPackDays: Set<string>, weekKeys: string[]): boolean {
  return weekKeys.length === 7 && weekKeys.every((k) => dailyPackDays.has(k));
}
