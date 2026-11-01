/**
 * lib/familyGame.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure rules for the family-level game (Phase B, "Bets 1–3"):
 *   • Who competes  — kids are the players; parents are COACHES (they don't rank
 *                     on the leaderboard, but their points still count toward
 *                     the family co-op goal).
 *   • Co-op goal    — one weekly target the whole family earns together.
 *   • Parent Report — the weekly "here's what the app did for you" payoff.
 * No Firebase, no React — everything here is unit-tested.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GameMember {
  id: string;
  displayName: string;
  role?: string;
  isManaged?: boolean;
  avatarEmoji?: string;
  photoURL?: string;
}

/** Kids are players: a managed profile or anyone with the child role. */
export function isKid(m: Pick<GameMember, 'role' | 'isManaged'>): boolean {
  return !!m.isManaged || m.role === 'child';
}

/**
 * Who competes (family setting, parent-chosen — default 'everyone'):
 *   'everyone' — parents and kids all rank, appear on the podium, win crowns.
 *                Healthy family competition; a one-kid family has rivals.
 *   'kids'     — only kids rank; parents are COACHES (their points still count
 *                toward the family co-op goal).
 */
export type CompetitionMode = 'everyone' | 'kids';

/**
 * The members who RANK on the leaderboard. In 'kids' mode a family with no
 * kids yet (two parents trying it out) still gets a leaderboard: everyone.
 */
export function competitors<T extends Pick<GameMember, 'role' | 'isManaged'>>(
  members: T[], mode: CompetitionMode | null | undefined = 'everyone',
): T[] {
  if (mode !== 'kids') return members;
  const kids = members.filter(isKid);
  return kids.length > 0 ? kids : members;
}

/** Members who coach instead of competing (only ever non-empty in 'kids' mode). */
export function coaches<T extends Pick<GameMember, 'role' | 'isManaged'>>(
  members: T[], mode: CompetitionMode | null | undefined = 'everyone',
): T[] {
  const ranked = new Set(competitors(members, mode));
  return members.filter((m) => !ranked.has(m));
}

// ─── Family co-op goal ───────────────────────────────────────────────────────

export interface FamilyGoal {
  /** Points the whole family earns together this week. */
  target: number;
  /** What everyone gets when it's hit, e.g. "Pizza night". */
  reward: string;
}

export interface FamilyGoalProgress {
  total: number;
  target: number;
  progress: number;   // 0..1
  remaining: number;
  reached: boolean;
}

/** Everyone's earned-this-week points (kids AND coaches) toward the shared goal. */
export function familyGoalProgress(weeklyTotals: Record<string, number>, target: number): FamilyGoalProgress {
  const total = Object.values(weeklyTotals).reduce((s, v) => s + Math.max(0, v || 0), 0);
  const t = Math.max(1, Math.round(target || 0));
  return {
    total,
    target: t,
    progress: Math.min(1, total / t),
    remaining: Math.max(0, t - total),
    reached: total >= t,
  };
}

/**
 * A target that's a stretch but reachable: last week's family total +15%,
 * rounded to a friendly 50. New families (no history) start at 300.
 */
export function suggestFamilyGoal(lastWeekFamilyTotal: number): number {
  if (!lastWeekFamilyTotal || lastWeekFamilyTotal <= 0) return 300;
  return Math.max(100, Math.round((lastWeekFamilyTotal * 1.15) / 50) * 50);
}

// ─── Parent Report ───────────────────────────────────────────────────────────

export interface ReportTx {
  memberId: string;
  delta: number;
  source?: string;
  date: Date | null;
}

export interface KidWeek {
  memberId: string;
  name: string;
  avatarEmoji?: string;
  photoURL?: string;
  chores: number;
  points: number;
  lastWeekPoints: number;
  /** % change vs last week; null when there's no last-week baseline. */
  changePct: number | null;
}

export interface ParentReport {
  chores: number;
  lastWeekChores: number;
  minutesSaved: number;
  activeDays: number;          // days this week with ≥1 chore done (0..7)
  familyPoints: number;
  kids: KidWeek[];             // sorted by points desc
  mostImproved: KidWeek | null;
  needsCheer: KidWeek | null;  // the kid who may need encouragement
}

/**
 * Rough minutes a chore takes, from its point value (easy 10 → ~10 min,
 * medium 25 → ~20 min, hard 50 → ~35 min). It's an honest ESTIMATE and the UI
 * labels it as one — the point is to make the parent's payoff visible.
 */
export function choreMinutes(pointValue: number): number {
  if (pointValue <= 10) return 10;
  if (pointValue <= 25) return 20;
  return 35;
}

function isChore(t: ReportTx): boolean {
  return t.source === 'task' && t.delta > 0;
}

/** Earned points excluding reward spending (matches the leaderboard). */
function earned(t: ReportTx): number {
  return t.source === 'redemption' ? 0 : t.delta;
}

export function buildParentReport(
  thisWeek: ReportTx[],
  lastWeek: ReportTx[],
  members: GameMember[],
): ParentReport {
  // The report is about the KIDS (the parent's payoff), whatever the
  // competition mode — falls back to everyone in a kid-less family.
  const players = competitors(members, 'kids');
  const pointsBy = (txs: ReportTx[], id: string) => txs.filter((t) => t.memberId === id).reduce((s, t) => s + earned(t), 0);
  const choresBy = (txs: ReportTx[], id: string) => txs.filter((t) => t.memberId === id && isChore(t)).length;

  const kids: KidWeek[] = players.map((m) => {
    const points = pointsBy(thisWeek, m.id);
    const lastWeekPoints = pointsBy(lastWeek, m.id);
    return {
      memberId: m.id,
      name: (m.displayName || 'Someone').split(' ')[0],
      avatarEmoji: m.avatarEmoji,
      photoURL: m.photoURL,
      chores: choresBy(thisWeek, m.id),
      points,
      lastWeekPoints,
      changePct: lastWeekPoints > 0 ? Math.round(((points - lastWeekPoints) / lastWeekPoints) * 100) : null,
    };
  }).sort((a, b) => b.points - a.points);

  const chores = thisWeek.filter(isChore);
  const days = new Set(chores.filter((t) => t.date).map((t) => (t.date as Date).toDateString()));

  const improvers = kids.filter((k) => k.points > k.lastWeekPoints && k.points > 0);
  const mostImproved = improvers.sort((a, b) => (b.points - b.lastWeekPoints) - (a.points - a.lastWeekPoints))[0] ?? null;

  // Only flag someone when there's a real gap: the lowest kid, if they're well
  // behind the leader. Phrased in the UI as "cheer on", never "failing".
  const lowest = kids.length > 1 ? kids[kids.length - 1] : null;
  const needsCheer = lowest && kids[0].points > 0 && lowest.points < kids[0].points * 0.5 ? lowest : null;

  return {
    chores: chores.length,
    lastWeekChores: lastWeek.filter(isChore).length,
    minutesSaved: chores.reduce((s, t) => s + choreMinutes(t.delta), 0),
    activeDays: days.size,
    familyPoints: thisWeek.reduce((s, t) => s + Math.max(0, earned(t)), 0),
    kids,
    mostImproved,
    needsCheer,
  };
}

/** "2h 35m" / "45m" */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Kid Mode parental gate ──────────────────────────────────────────────────

export interface GateQuestion { a: number; b: number; answer: number; }

/** A grown-up check to leave Kid Mode: a 6–9 times-table question. */
export function makeGateQuestion(rand: () => number = Math.random): GateQuestion {
  const a = 6 + Math.floor(rand() * 4);
  const b = 6 + Math.floor(rand() * 4);
  return { a, b, answer: a * b };
}
