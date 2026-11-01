/**
 * lib/streakShield.ts — streaks with a streak shield (Phase F2), PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * A streak counts consecutive days with at least one completed task. A SHIELD
 * saves it once: a single missed day is covered instead of resetting to 0.
 *
 *   • Earn: one shield for every family week with ≥ 5 active days.
 *   • Hold: at most 2 at a time.
 *   • Use:  automatic — the first missed day of a live streak spends one.
 *   • Today never breaks a streak (the day isn't over yet).
 *
 * Everything is DERIVED from the activity history (nothing stored), so every
 * device — and the dailyStreakCheck Cloud Function, which runs the same rules
 * from firebase/functions/game.js — agrees on the number.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { dateKeyOf } from '@/lib/surprisePacks';

export const SHIELD_MIN_ACTIVE_DAYS = 5;
export const SHIELD_CAP = 2;
/** Days of history looked at (6 weeks): long enough to earn and use shields. */
export const STREAK_WINDOW_DAYS = 42;

export interface ShieldedStreak {
  streak: number;
  /** Shields available right now. */
  shields: number;
  /** Date keys (YYYY-MM-DD) a shield covered, oldest first. */
  shieldedDays: string[];
}

export function streakWithShields(
  activeDays: Iterable<string>,
  now: Date = new Date(),
  weekStartDay: number = 1,
  windowDays: number = STREAK_WINDOW_DAYS,
): ShieldedStreak {
  const active = new Set(activeDays);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const todayKey = dateKeyOf(today);
  const day = new Date(today);
  day.setDate(day.getDate() - (windowDays - 1));

  let streak = 0, shields = 0, weekActive = 0;
  const shieldedDays: string[] = [];
  let first = true;

  for (let i = 0; i < windowDays; i++) {
    const key = dateKeyOf(day);
    // A new family week starts: the week just finished may have earned a shield.
    if (!first && day.getDay() === weekStartDay) {
      if (weekActive >= SHIELD_MIN_ACTIVE_DAYS) shields = Math.min(SHIELD_CAP, shields + 1);
      weekActive = 0;
    }
    first = false;

    if (active.has(key)) {
      streak++;
      weekActive++;
    } else if (key === todayKey) {
      // Today isn't over — the streak is still alive.
    } else if (streak > 0 && shields > 0) {
      shields--;
      shieldedDays.push(key);
    } else {
      streak = 0;
    }
    day.setDate(day.getDate() + 1);
  }
  return { streak, shields, shieldedDays };
}

/** Local date keys of the days a member completed something (for streakWithShields). */
export function activeDayKeys(dates: (Date | null | undefined)[]): string[] {
  return dates.filter((d): d is Date => !!d).map(dateKeyOf);
}
