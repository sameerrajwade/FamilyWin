import type { Task, TaskCompletion, PointTransaction, DisciplineEvent } from '@/types';

// ─── POINT CALCULATIONS ───────────────────────────────────────────────────────

export function calculateTaskPoints(task: Task): number {
  return task.point_value;
}

export function calculateAutoFailPenalty(task: Task): number {
  // Auto-fail loses the full point value
  return -task.point_value;
}

// ─── MISSED-TASK PENALTY (optional per-family feature) ───────────────────────
// How many days back a missed task can still be "caught up" (marked done),
// which restores its points and reverses the penalty.
export const MISSED_TASK_GRACE_DAYS = 2;

// Per-family choice for how much a missed daily task costs. 'off' = feature
// disabled; 'half' = half the points; 'full' = the whole point value.
export type MissedPenaltyMode = 'off' | 'half' | 'full';

/**
 * The penalty (a POSITIVE magnitude) deducted when a daily task is missed, for
 * the given mode: 'half' = half the point value (rounded, min 1); 'full' = the
 * whole value; 'off' or a zero/negative-value task = 0.
 */
export function missedTaskPenaltyAmount(pointValue: number, mode: MissedPenaltyMode = 'half'): number {
  if (mode === 'off' || !pointValue || pointValue <= 0) return 0;
  if (mode === 'full') return pointValue;
  return Math.max(1, Math.round(pointValue / 2));
}

/**
 * Local YYYY-MM-DD for a date (matches CompletionDoc.completedDate). Kept here
 * (pure) so both the grace-window UI and its tests agree on day bucketing.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The catch-up-able past days (most-recent first), excluding today, within the
 * grace window. e.g. on Wed with a 2-day window → [Tue, Mon].
 */
export function graceWindowDays(now: Date = new Date(), graceDays: number = MISSED_TASK_GRACE_DAYS): string[] {
  const days: string[] = [];
  for (let i = 1; i <= graceDays; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(toDateKey(d));
  }
  return days;
}

export function calculateStreakBonus(streakDays: number): number {
  if (streakDays === 7) return 50; // Perfect week bonus
  if (streakDays === 14) return 100; // Two week bonus
  if (streakDays === 30) return 250; // Month bonus
  return 0;
}

// ─── TOTALS ──────────────────────────────────────────────────────────────────

export function calculateTotalPoints(transactions: PointTransaction[]): number {
  return transactions.reduce((sum, tx) => sum + tx.delta, 0);
}

export function calculateWeeklyPoints(
  transactions: PointTransaction[],
  weekStart: Date,
  weekEnd: Date,
): number {
  const filtered = transactions.filter((tx) => {
    const date = new Date(tx.created_at);
    return date >= weekStart && date <= weekEnd;
  });
  return calculateTotalPoints(filtered);
}

// ─── MEMBER POINTS SUMMARY (single source of truth) ───────────────────────────
//
// Every screen used to answer "how many points?" on its own, with subtly
// different rules (redemptions in/out, week-start day, row caps). That drift is
// what made the SAME child read 421 on Home, 154 on Leaderboard and 172 on
// Rewards. This one pure function is now the ONLY place those rules live:
//
//   • spendable      — all-time balance: everything earned MINUS reward spends
//                      and penalties. This is the real, cashable number. It is
//                      what "Points to spend" shows on Home + Rewards.
//   • earnedThisWeek — points won since the week started, EXCLUDING reward
//                      spends (spending must never drop your weekly rank). This
//                      is the leaderboard/"Earned this week" number.
//
// Callers pass a member's transactions already mapped to {delta, source, date}
// so the function stays Firestore-agnostic and unit-testable.

export interface PointsTxn { delta: number; source: string; date: Date | null; }

export interface MemberPointsSummary {
  spendable: number;       // all-time earned − spent (the "bank")
  earnedThisWeek: number;  // this week, reward spends excluded
}

export function summarizeMemberPoints(txns: PointsTxn[], weekStart: Date): MemberPointsSummary {
  let spendable = 0;
  let earnedThisWeek = 0;
  for (const t of txns) {
    const delta = t.delta || 0;
    spendable += delta;
    if (t.source !== 'redemption' && t.date && t.date >= weekStart) {
      earnedThisWeek += delta;
    }
  }
  return { spendable, earnedThisWeek };
}

// ─── PENALTY PAUSE (vacation / sick hold) ─────────────────────────────────────
//
// Families who turn missed-task penalties ON can PAUSE them for a stretch —
// vacation, illness, a known-busy week — so missed chores don't quietly rack up
// negative points. A pause can be set on the whole family or a single member;
// either one being active means that member is paused. Pure + Firestore-agnostic
// (callers resolve their Timestamps to Dates first) so it's unit-testable.

export function isPenaltyPaused(
  familyPausedUntil: Date | null | undefined,
  memberPausedUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const active = (d: Date | null | undefined) => !!d && d.getTime() > now.getTime();
  return active(familyPausedUntil) || active(memberPausedUntil);
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  memberId: string;
  displayName: string;
  avatarEmoji: string;
  photoURL?: string;
  points: number;
  rank: number;
  isCurrentUser: boolean;
  tasksCompleted: number;
  tasksTotal: number;
  streak: number;
}

export function buildLeaderboard(
  weeklyTotals: Record<string, number>,
  members: { id: string; displayName?: string; display_name?: string; avatarEmoji?: string; avatar_emoji?: string; photoURL?: string }[],
  currentMemberId: string,
  taskStats: Record<string, { completed: number; total: number }>,
  streaks: Record<string, number>,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = members.map((member) => ({
    memberId: member.id,
    displayName: member.displayName ?? member.display_name ?? 'Unknown',
    avatarEmoji: member.avatarEmoji ?? member.avatar_emoji ?? '👤',
    photoURL: member.photoURL,
    points: weeklyTotals[member.id] ?? 0,
    rank: 0,
    isCurrentUser: member.id === currentMemberId,
    tasksCompleted: taskStats[member.id]?.completed ?? 0,
    tasksTotal: taskStats[member.id]?.total ?? 0,
    streak: streaks[member.id] ?? 0,
  }));

  // Sort by points descending
  entries.sort((a, b) => b.points - a.points);

  // Assign ranks (handle ties)
  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].points < entries[i - 1].points) {
      currentRank = i + 1;
    }
    entries[i].rank = currentRank;
  }

  return entries;
}

// ─── CROWNS (three-crowns row) ─────────────────────────────────────────────────
//
// The leaderboard rewards more than raw points so a single strong sibling doesn't
// demoralise the rest of the family (the "losing-child problem", Roadmap 4.2):
//   👑 Top Scorer   — most points this week
//   📈 Most Improved — biggest gain vs last week
//   🎯 Goal Crusher  — reached their own weekly points goal
// computeCrowns is PURE and degrades gracefully: no last-week data → no improved
// crown; no goals set → no goal crown. Slots are always returned in a fixed order
// so the UI can render a consistent 3-card row (unawarded slots render as "—").

export type CrownKind = 'top' | 'improved' | 'goal';

export interface CrownSlot {
  kind: CrownKind;
  emoji: string;
  title: string;
  awardeeMemberId: string | null;   // null = not awarded yet this week
  awardeeName: string | null;
  awardeeEmoji?: string;
  awardeePhotoURL?: string;
  detail: string | null;            // e.g. "320 pts", "+140 vs last wk", "180 / 150"
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Someone';
}

/**
 * Build the fixed three-crown row from an already-ranked leaderboard.
 * @param entries        output of buildLeaderboard (ranked, points filled)
 * @param lastWeekTotals memberId → last week's earned points (omit/empty = no improved crown)
 * @param goals          memberId → personal weekly points goal (omit/0 = no goal crown for that member)
 */
export function computeCrowns(
  entries: LeaderboardEntry[],
  lastWeekTotals: Record<string, number> = {},
  goals: Record<string, number> = {},
): CrownSlot[] {
  const byId = new Map(entries.map((e) => [e.memberId, e]));

  // 👑 Top Scorer — rank 1 with a positive score (nobody wins a 0-point week).
  const leader = entries.find((e) => e.rank === 1 && e.points > 0) ?? null;

  // 📈 Most Improved — largest positive delta vs last week. Needs last-week data.
  let improved: { e: LeaderboardEntry; delta: number } | null = null;
  if (Object.keys(lastWeekTotals).length > 0) {
    for (const e of entries) {
      const delta = e.points - (lastWeekTotals[e.memberId] ?? 0);
      if (delta > 0 && (!improved || delta > improved.delta)) improved = { e, delta };
    }
  }

  // 🎯 Goal Crusher — reached their own goal. If several did, credit the one who
  // beat it by the widest margin; note the others with a "+N" suffix.
  const achievers = entries
    .filter((e) => (goals[e.memberId] ?? 0) > 0 && e.points >= goals[e.memberId])
    .sort((a, b) => (b.points - goals[b.memberId]) - (a.points - goals[a.memberId]));
  const goalWinner = achievers[0] ?? null;

  return [
    {
      kind: 'top', emoji: '👑', title: 'Top Scorer',
      awardeeMemberId: leader?.memberId ?? null,
      awardeeName: leader ? firstName(leader.displayName) : null,
      awardeeEmoji: leader?.avatarEmoji, awardeePhotoURL: leader?.photoURL,
      detail: leader ? `${leader.points} pts` : null,
    },
    {
      kind: 'improved', emoji: '📈', title: 'Most Improved',
      awardeeMemberId: improved?.e.memberId ?? null,
      awardeeName: improved ? firstName(improved.e.displayName) : null,
      awardeeEmoji: improved?.e.avatarEmoji, awardeePhotoURL: improved?.e.photoURL,
      detail: improved ? `+${improved.delta} vs last wk` : null,
    },
    {
      kind: 'goal', emoji: '🎯', title: 'Goal Crusher',
      awardeeMemberId: goalWinner?.memberId ?? null,
      awardeeName: goalWinner ? firstName(goalWinner.displayName) : null,
      awardeeEmoji: goalWinner?.avatarEmoji, awardeePhotoURL: goalWinner?.photoURL,
      detail: goalWinner ? `${goalWinner.points} / ${goals[goalWinner.memberId]}${achievers.length > 1 ? `  +${achievers.length - 1}` : ''}` : null,
    },
  ];
}

// ─── LIFETIME LEVELS (retention beyond the week) ───────────────────────────────
//
// The week resets every Sunday, but lifetime points never do — they drive a
// level/title that only ever climbs, giving long-term players something that
// persists (Roadmap 4.1). Pure and monotonic: more points never lowers a level.

export interface LevelInfo {
  level: number;          // 1-based
  title: string;          // e.g. "Champion"
  emoji: string;
  floor: number;          // lifetime points at which this level begins
  next: number | null;    // points needed to reach the next level (null at max)
  intoLevel: number;      // points earned inside the current level
  span: number;           // size of the current level band (0 at max)
  progress: number;       // 0..1 toward the next level (1 at max)
}

// Cumulative floors + titles. Bands widen so higher levels feel earned.
export const LEVEL_TIERS: readonly { floor: number; title: string; emoji: string }[] = [
  { floor: 0,     title: 'Rookie',    emoji: '🌱' },
  { floor: 150,   title: 'Helper',    emoji: '🧹' },
  { floor: 400,   title: 'Achiever',  emoji: '⭐' },
  { floor: 800,   title: 'Star',      emoji: '🌟' },
  { floor: 1400,  title: 'Pro',       emoji: '🔥' },
  { floor: 2200,  title: 'Champion',  emoji: '🏆' },
  { floor: 3300,  title: 'Hero',      emoji: '🦸' },
  { floor: 4800,  title: 'Legend',    emoji: '👑' },
  { floor: 7000,  title: 'Mythic',    emoji: '💎' },
];

// ─── Virtual allowance (Phase 5 #3) ────────────────────────────────────────────

/** Cash value of `points` at `pointsPerUnit` points per one currency unit. */
/** Default allowance rate: 300 points = 1 currency unit (user choice, 2026-10-31). */
export const DEFAULT_ALLOWANCE_RATE = 300;

export function pointsToCash(points: number, pointsPerUnit: number): number {
  if (!pointsPerUnit || pointsPerUnit <= 0) return 0;
  return Math.max(0, points) / pointsPerUnit;
}

/** Format a cash value like "$3.50" (2 decimals, given symbol). */
export function formatCash(amount: number, currency: string = '$'): string {
  return `${currency}${(amount || 0).toFixed(2)}`;
}

/** Whole points needed to be worth at least `pointsPerUnit` (one payable unit). */
export function pointsForOneUnit(pointsPerUnit: number): number {
  return Math.max(1, Math.round(pointsPerUnit || 0));
}

/**
 * What a level is computed from: every point a member has EARNED, ever —
 * tasks, bonuses, packs, bounties, minus penalties — but NOT reward spending.
 * (Levels used to read the spendable balance, so redeeming a reward lowered
 * your level; with E3 unlocks that would also take a frame away.)
 */
export function lifetimeEarned(txns: { delta: number; source?: string }[]): number {
  let total = 0;
  for (const t of txns) if (t.source !== 'redemption') total += t.delta || 0;
  return Math.max(0, total);
}

export function getLevel(lifetimePoints: number): LevelInfo {
  const pts = Math.max(0, Math.floor(lifetimePoints || 0));
  let idx = 0;
  for (let i = 0; i < LEVEL_TIERS.length; i++) {
    if (pts >= LEVEL_TIERS[i].floor) idx = i; else break;
  }
  const tier = LEVEL_TIERS[idx];
  const nextTier = LEVEL_TIERS[idx + 1] ?? null;
  const next = nextTier ? nextTier.floor - pts : null;
  const span = nextTier ? nextTier.floor - tier.floor : 0;
  const intoLevel = pts - tier.floor;
  const progress = nextTier ? Math.min(1, intoLevel / span) : 1;
  return { level: idx + 1, title: tier.title, emoji: tier.emoji, floor: tier.floor, next, intoLevel, span, progress };
}

// ─── INSIGHTS (plain-language cards) ───────────────────────────────────────────
//
// Turns a member's raw transaction log + the 6-week trend into human-readable
// "insight" cards (best day, record week, trend, most-dodged, tasks done). Pure
// and defensive: returns only the cards it has enough data to state truthfully,
// so a brand-new member simply sees fewer cards rather than empty/《NaN》ones.

export interface InsightCard {
  key: string;
  emoji: string;
  title: string;
  detail: string;
  tone: 'good' | 'bad' | 'neutral';
}

export interface InsightTxn { delta: number; source: string; reason?: string; date: Date; }

const WEEKDAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

// Strip the boilerplate prefix auto-fail/discipline reasons carry, e.g.
// "Missed: Make the bed" or "Auto-failed: Dishes" → "Make the bed" / "Dishes".
function cleanReason(reason: string): string {
  return reason.replace(/^(missed(?: \(deadline\))?|auto-?failed|failed|penalty|deducted)\s*[:\-–]\s*/i, '').trim() || reason;
}

// A reversal (task "Undo") is bookkeeping — it cancels an earlier completion and
// nets to zero. It is NOT a behavioural signal, so it must be excluded from the
// per-transaction analyses (best-day, most-dodged) or it shows up as e.g.
// "Most-dodged: Undo: Workout ×2", which is nonsense. (The weekly point SUMS in
// `weeklyData` legitimately include it — undo correctly zeroes out the points.)
function isReversal(t: InsightTxn): boolean {
  return /^undo\s*[:\-–]/i.test(t.reason ?? '');
}

export function computeInsights(
  txns: InsightTxn[],
  weeklyData: { week: string; points: number }[],
  weekStart?: Date,
): InsightCard[] {
  const cards: InsightCard[] = [];
  const positives = txns.filter((t) => t.delta > 0 && !isReversal(t));

  // 📈 Trend — this week vs last, from the trailing two chart columns.
  if (weeklyData.length >= 2) {
    const cur = weeklyData[weeklyData.length - 1].points;
    const prev = weeklyData[weeklyData.length - 2].points;
    if (!(cur === 0 && prev === 0)) {
      const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
      const detail = `${fmt(cur)} pts vs ${fmt(prev)} last week`;
      if (cur === prev) {
        cards.push({ key: 'trend', emoji: '➡️', title: 'Holding steady', detail: `${fmt(cur)} pts, same as last week`, tone: 'neutral' });
      } else if (cur < 0) {
        // In the red — a "Down X%" framing is meaningless once you go negative.
        cards.push({ key: 'trend', emoji: '📉', title: 'In the red this week', detail, tone: 'bad' });
      } else if (cur > prev) {
        // A percentage only means something when last week was positive.
        const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
        cards.push({ key: 'trend', emoji: '📈', title: pct != null ? `Up ${pct}% this week` : `Up to ${cur} pts`, detail, tone: 'good' });
      } else {
        const pct = prev > 0 ? Math.round(((prev - cur) / prev) * 100) : null;
        cards.push({ key: 'trend', emoji: '📉', title: pct != null ? `Down ${pct}% this week` : `Down to ${cur} pts`, detail, tone: 'bad' });
      }
    }
  }

  // 🗓️ Best day of week — where the most points get earned. Gated: needs enough
  // data across at least two days, or "your strongest day" from a single entry
  // is meaningless.
  if (positives.length >= 3) {
    const byDay = new Array(7).fill(0);
    for (const t of positives) byDay[t.date.getDay()] += t.delta;
    const activeDays = byDay.filter((v) => v > 0).length;
    const best = byDay.indexOf(Math.max(...byDay));
    if (activeDays >= 2 && byDay[best] > 0) {
      cards.push({ key: 'bestday', emoji: '💪', title: `${WEEKDAY_PLURAL[best]} are your strongest`, detail: `${byDay[best]} pts earned on ${WEEKDAY_PLURAL[best].toLowerCase()}`, tone: 'good' });
    }
  }

  // 🏅 Record week — best of the 6-week window.
  if (weeklyData.length > 0) {
    const record = weeklyData.reduce((m, d) => (d.points > m.points ? d : m), weeklyData[0]);
    if (record.points > 0) {
      cards.push({ key: 'record', emoji: '🏅', title: `Record week: ${record.points} pts`, detail: `Best of the last ${weeklyData.length} weeks (${record.week})`, tone: 'good' });
    }
  }

  // 🙈 Most-dodged — the reason behind the most point losses. Excludes undo
  // reversals (bookkeeping) and redemptions (a deliberate spend, not a dodge).
  const negs = txns.filter((t) => t.delta < 0 && t.reason && t.source !== 'redemption' && !isReversal(t));
  if (negs.length > 0) {
    const counts: Record<string, number> = {};
    for (const t of negs) counts[t.reason!] = (counts[t.reason!] ?? 0) + 1;
    const [reason, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) {
      cards.push({ key: 'dodged', emoji: '🙈', title: 'Most-dodged', detail: `"${cleanReason(reason)}" slipped ${count}×`, tone: 'bad' });
    }
  }

  // ✅ Tasks logged this week — momentum counter.
  if (weekStart) {
    const done = txns.filter((t) => t.source === 'task' && t.delta > 0 && !isReversal(t) && t.date >= weekStart).length;
    if (done > 0) {
      cards.push({ key: 'tasks', emoji: '✅', title: `${done} task${done > 1 ? 's' : ''} done this week`, detail: 'Keep the streak alive!', tone: 'good' });
    }
  }

  return cards;
}

// ─── STREAKS ─────────────────────────────────────────────────────────────────

export function calculateStreak(completions: TaskCompletion[]): number {
  if (completions.length === 0) return 0;

  const completedDates = completions
    .filter((c) => !c.was_auto_failed && c.completed_at)
    .map((c) => new Date(c.completed_at!).toDateString())
    .filter((value, index, self) => self.indexOf(value) === index) // unique dates
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (completedDates.length === 0) return 0;

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < completedDates.length; i++) {
    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - i);

    if (completedDates[i] === expectedDate.toDateString()) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Consecutive-day streak from a list of completion Dates.
 *
 * Unlike calculateStreak (which breaks unless *today* already has a completion),
 * this keeps the streak lit through the current day: the streak is "alive" if
 * the most recent completion was today OR yesterday, and counts back from there.
 * This matches how streaks feel to users — you don't lose your 6-day streak the
 * instant the clock rolls to a new day; you lose it only after a full day passes
 * with nothing done.
 *
 * Pure + Firestore-agnostic: callers pass the completedAt Dates of their
 * non-auto-failed completions. Returns 0 for an empty/broken streak.
 */
export function dailyStreak(completedDates: Date[], now: Date = new Date()): number {
  if (!completedDates || completedDates.length === 0) return 0;

  // Unique calendar days, most-recent first.
  const days = completedDates
    .filter(Boolean)
    .map((d) => d.toDateString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (days.length === 0) return 0;

  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  // Anchor: the streak only counts if the latest day is today or yesterday.
  let anchor: Date;
  if (days[0] === today.toDateString()) anchor = today;
  else if (days[0] === yesterday.toDateString()) anchor = yesterday;
  else return 0; // most recent completion is >1 day old → streak broken

  let streak = 0;
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(anchor);
    expected.setDate(anchor.getDate() - i);
    if (days[i] === expected.toDateString()) streak++;
    else break;
  }
  return streak;
}

// ─── WEEK HELPERS ─────────────────────────────────────────────────────────────

/**
 * @param weekStartDay 0=Sunday … 6=Saturday. Default 1 (Monday).
 *   Pass family.weekStartDay so families who reset on different days get correct ranges.
 */
export function getCurrentWeekRange(weekStartDay = 1): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const daysFromStart = (dayOfWeek - weekStartDay + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - daysFromStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);

  const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${startStr} - ${endStr}`;
}

export function isCurrentWeek(date: Date): boolean {
  const { start, end } = getCurrentWeekRange();
  return date >= start && date <= end;
}

// ─── TASK COMPLETION RATE ─────────────────────────────────────────────────────

export function getCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function getRankEmoji(rank: number): string {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return `#${rank}`;
  }
}

export function getPointsColor(delta: number): string {
  if (delta > 0) return '#43D98F';
  if (delta < 0) return '#FF5C5C';
  return '#6B7280';
}

export function formatPoints(points: number): string {
  if (points >= 1000) return `${(points / 1000).toFixed(1)}k`;
  return points.toString();
}
