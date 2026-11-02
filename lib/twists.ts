/**
 * lib/twists.ts — weekly twists + comeback boost (engagement, user-approved
 * 2026-11-01), PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every family week gets one twist, rotating in a fixed order so everyone sees
 * the same one ("Double chores", "Early bird"…). The SERVER pays the bonus
 * (firebase/functions/game.js — same list, checked by a test); the app only
 * shows it: the banner on Today/Scores, the ×2 chip on matching tasks, and the
 * 🚀 on whoever has the comeback boost.
 * Parents: Game rules → Weekly twists / Comeback boost (both on by default),
 * and "Skip this week's twist" from the banner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TwistKind = 'category' | 'early' | 'weekend' | 'team';

export interface Twist {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  kind: TwistKind;
  category?: string;
  multiplier?: number;
  beforeHour?: number;
  bonus?: number;
}

export const TWISTS: Twist[] = [
  { id: 'double-chores', emoji: '🧹', title: 'Double chores', blurb: 'Chores pay double this week.', kind: 'category', category: 'chores', multiplier: 2 },
  { id: 'early-bird', emoji: '🌅', title: 'Early bird', blurb: 'Tasks done before 9am earn +5 points.', kind: 'early', beforeHour: 9, bonus: 5 },
  { id: 'homework-heroes', emoji: '📚', title: 'Homework heroes', blurb: 'Homework pays +50% this week.', kind: 'category', category: 'homework', multiplier: 1.5 },
  { id: 'team-week', emoji: '🤝', title: 'Team week', blurb: 'Kids vs grown-ups: team totals on Scores.', kind: 'team' },
  { id: 'weekend-warriors', emoji: '🏖️', title: 'Weekend warriors', blurb: 'Saturday and Sunday tasks pay +50%.', kind: 'weekend', multiplier: 1.5 },
  { id: 'healthy-habits', emoji: '🪥', title: 'Healthy habits', blurb: 'Hygiene tasks pay double this week.', kind: 'category', category: 'hygiene', multiplier: 2 },
  { id: 'kindness-week', emoji: '💛', title: 'Kindness week', blurb: 'Behaviour tasks pay double this week.', kind: 'category', category: 'behavior', multiplier: 2 },
];

const DAY_MS = 86_400_000;
const keyToUTC = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The family-week start (YYYY-MM-DD) containing local date `dateKey`. */
export function weekStartKeyOf(dateKey: string, weekStartDay = 1): string {
  const ms = keyToUTC(dateKey);
  const back = (new Date(ms).getUTCDay() - weekStartDay + 7) % 7;
  return utcToKey(ms - back * DAY_MS);
}

export interface TwistFamily { twistsOff?: boolean; twistSkip?: Record<string, boolean> | null }

/** The twist for a family week, ignoring on/off (used for "next week" previews). */
export function rotationTwist(weekStartKey: string): Twist {
  const n = Math.floor(keyToUTC(weekStartKey) / (7 * DAY_MS));
  return TWISTS[((n % TWISTS.length) + TWISTS.length) % TWISTS.length];
}

/** This week's twist, or null when twists are off / this week was skipped. */
export function twistForWeek(weekStartKey: string, family?: TwistFamily | null): Twist | null {
  if (!weekStartKey || family?.twistsOff === true) return null;
  if (family?.twistSkip?.[weekStartKey]) return null;
  return rotationTwist(weekStartKey);
}

/** Short chip for a task the twist boosts ("×2", "+50%"), or null. */
export function twistChipFor(twist: Twist | null, task: { category?: string }, dateKey?: string): string | null {
  if (!twist) return null;
  if (twist.kind === 'category' && task.category === twist.category) return twist.multiplier === 2 ? '×2' : '+50%';
  if (twist.kind === 'weekend' && dateKey) {
    const dow = new Date(keyToUTC(dateKey)).getUTCDay();
    if (dow === 0 || dow === 6) return '+50%';
  }
  return null;
}

/** Team-week totals: kids vs grown-ups (managed/child = kid). */
export function teamTotals(
  members: { id: string; role?: string; isManaged?: boolean }[], totals: Record<string, number>,
): { kids: number; grownups: number } {
  let kids = 0; let grownups = 0;
  for (const m of members) {
    const p = totals[m.id] ?? 0;
    if (m.isManaged || m.role === 'child') kids += p; else grownups += p;
  }
  return { kids, grownups };
}

export interface ComebackState { memberIds?: string[]; since?: string }

/** Does this member have the comeback boost on local day `dateKey`? */
export function comebackActive(
  family: { comeback?: ComebackState | null; comebackOff?: boolean } | null | undefined, memberId: string, dateKey: string,
): boolean {
  const cb = family?.comeback;
  if (!cb || family?.comebackOff === true || !Array.isArray(cb.memberIds) || !cb.since) return false;
  if (!cb.memberIds.includes(memberId)) return false;
  const d = keyToUTC(dateKey) - keyToUTC(cb.since);
  return d >= 0 && d < 7 * DAY_MS;
}

/**
 * Plain-language "how it works" for each twist — shown in the once-a-week
 * pop-up and when the banner is tapped (user: "no explanation at all").
 */
export const TWIST_HOW: Record<string, { how: string; example: string }> = {
  'double-chores': {
    how: 'Every task in the Chores category pays twice its points this week. Look for the 🎲 ×2 tag on Today.',
    example: 'Example: “Load the dishwasher” is worth 10 → you get 20.',
  },
  'early-bird': {
    how: 'Finish a task before 9 in the morning and you get 5 extra points on top of its normal points.',
    example: 'Example: make your bed at 7:30am → 10 + 5 = 15 points.',
  },
  'homework-heroes': {
    how: 'Every Homework task pays 50% more this week. Look for the 🎲 +50% tag on Today.',
    example: 'Example: “Reading 20 min” is worth 25 → you get 38.',
  },
  'team-week': {
    how: 'This week the family splits into two teams: kids vs grown-ups. Every point you earn also counts for your team. Points work as normal, nothing extra. Scores shows which team is ahead, and the leading team wins bragging rights on Sunday.',
    example: 'Example: Ava 40 + Leo 25 = Kids 65 · Mom 30 + Dad 20 = Grown-ups 50 → kids lead.',
  },
  'weekend-warriors': {
    how: 'Tasks done on Saturday or Sunday pay 50% more this week. Weekdays work as normal.',
    example: 'Example: a 10-point task on Saturday → 15 points.',
  },
  'healthy-habits': {
    how: 'Every Hygiene task (teeth, shower, hair…) pays twice its points this week. Look for the 🎲 ×2 tag on Today.',
    example: 'Example: “Brush teeth” is worth 10 → you get 20.',
  },
  'kindness-week': {
    how: 'Every Behaviour task (helping, being kind, good manners) pays twice its points this week. Look for the 🎲 ×2 tag on Today.',
    example: 'Example: “Help set the table” is worth 10 → you get 20.',
  },
};
