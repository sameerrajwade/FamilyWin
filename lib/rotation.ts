/**
 * lib/rotation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Chore rotation + scheduling — pure, deterministic helpers (Phase 5 #1).
 *
 * A ROTATING task cycles its assignee through an ordered list of members: e.g.
 * "Trash" → Alex this week, Sam next week, Kai the week after, then back to Alex.
 * The current assignee is DERIVED from the date (no writes needed to advance),
 * so it is always consistent across every device and the server sweep.
 *
 * A SCHEDULED task is only due on specific weekdays (e.g. Mon/Thu), instead of
 * every day. `scheduledDays` uses JS `Date.getDay()` numbering (0=Sun..6=Sat).
 *
 * All helpers are timezone-naive on purpose: they read the local calendar-date
 * parts, matching how the rest of the app computes "today" and week boundaries.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type RotationCadence = 'daily' | 'weekly';

export interface Rotation {
  /** Ordered member ids the chore rotates through. */
  memberIds: string[];
  /** How often the turn advances. */
  cadence: RotationCadence;
}

// A fixed Monday (2020-01-06) at UTC midnight — the counting origin. Only the
// *difference* in periods matters, so the exact origin is arbitrary but stable.
const EPOCH_UTC = Date.UTC(2020, 0, 6);
const DAY_MS = 86_400_000;

/** Whole days between `now`'s local calendar date and the epoch (tz-naive). */
function dayIndex(now: Date): number {
  const localMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((localMidnight - EPOCH_UTC) / DAY_MS);
}

/**
 * The member whose turn it is right now for a rotation, or null if the list is
 * empty. `weekStartDay` (0=Sun..6=Sat) aligns weekly rotations to the family's
 * configured week so the handover happens on the reset day.
 */
export function currentRotationMemberId(
  rot: Rotation | undefined | null,
  now: Date = new Date(),
  weekStartDay: number = 1,
): string | null {
  const ids = (rot?.memberIds ?? []).filter(Boolean);
  if (ids.length === 0) return null;

  const dIdx = dayIndex(now);
  let period: number;
  if (rot!.cadence === 'weekly') {
    const daysSinceWeekStart = ((now.getDay() - weekStartDay) % 7 + 7) % 7;
    period = Math.floor((dIdx - daysSinceWeekStart) / 7);
  } else {
    period = dIdx;
  }
  const idx = ((period % ids.length) + ids.length) % ids.length;
  return ids[idx];
}

/**
 * Resolve the effective assignee of a task: the rotation's current member when
 * the task rotates, otherwise its fixed `assignedTo` (string, or the first of a
 * legacy array), or null for a whole-family task.
 */
export function effectiveAssignee(
  task: { assignedTo?: string | string[] | null; rotation?: Rotation | null },
  now: Date = new Date(),
  weekStartDay: number = 1,
): string | null {
  if (task.rotation && task.rotation.memberIds?.length) {
    return currentRotationMemberId(task.rotation, now, weekStartDay);
  }
  if (Array.isArray(task.assignedTo)) return task.assignedTo[0] ?? null;
  return task.assignedTo ?? null;
}

/**
 * Is a scheduled task due on `now`'s weekday? An empty/absent `scheduledDays`
 * means "every day" (unchanged behaviour for non-scheduled tasks).
 */
export function isDueToday(
  scheduledDays: number[] | undefined | null,
  now: Date = new Date(),
): boolean {
  if (!scheduledDays || scheduledDays.length === 0) return true;
  return scheduledDays.includes(now.getDay());
}

/** Short human label for a set of scheduled weekdays, e.g. "Mon, Thu". */
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function scheduledDaysLabel(scheduledDays: number[] | undefined | null): string {
  if (!scheduledDays || scheduledDays.length === 0) return 'Every day';
  if (scheduledDays.length === 7) return 'Every day';
  const sorted = [...scheduledDays].sort((a, b) => a - b);
  // Mon–Fri shorthand.
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return 'Weekdays';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Weekends';
  return sorted.map((d) => DAY_ABBR[d]).join(', ');
}
