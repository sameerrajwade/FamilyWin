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

// ─── Game health metrics (Phase F3) ──────────────────────────────────────────
// Is the game actually working for this family? Four honest numbers for the
// Parent Report, all from data the app already has (completions + ledger).

export interface MetricCompletion {
  memberId: string;
  completedAt: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  status?: string;
  wasAutoFailed?: boolean;
}

export interface GameHealth {
  /** Days this week a parent did something (completed or approved). 0..7 */
  parentActiveDays: number;
  /** % of kids' chores the KID claimed (vs a parent ticking it). null = none yet. */
  kidClaimedPct: number | null;
  /** Median minutes from a kid's claim to a parent's OK. null = no approvals. */
  medianApprovalMins: number | null;
  /** The last-place kid this season and whether they're still playing. */
  lastPlace: { memberId: string; name: string; daysSinceActive: number | null; stillActive: boolean } | null;
}

/** "Still playing" = did something within this many days. */
export const STILL_ACTIVE_DAYS = 3;

export function buildGameHealth(p: {
  completions: MetricCompletion[];               // this week's completions
  members: GameMember[];
  seasonRows: { memberId: string; points: number; rank: number }[]; // season standings
  lastActiveByMember: Record<string, Date | null>;                  // latest completed task
  now?: Date;
}): GameHealth {
  const now = p.now ?? new Date();
  const kids = new Set(p.members.filter(isKid).map((m) => m.id));
  const parents = new Set(p.members.filter((m) => !isKid(m)).map((m) => m.id));

  const parentDays = new Set<string>();
  for (const c of p.completions) {
    if (parents.has(c.memberId) && c.completedAt && !c.wasAutoFailed) parentDays.add(c.completedAt.toDateString());
    if (c.approvedBy && parents.has(c.approvedBy) && c.approvedAt) parentDays.add(c.approvedAt.toDateString());
  }

  const kidDone = p.completions.filter((c) => kids.has(c.memberId) && !c.wasAutoFailed && c.status !== 'rejected');
  const claimed = kidDone.filter((c) => c.status === 'pending' || c.status === 'approved' || !!c.approvedBy);

  const waits = p.completions
    .filter((c) => c.approvedBy && c.approvedAt && c.completedAt && c.status === 'approved')
    .map((c) => (c.approvedAt!.getTime() - c.completedAt!.getTime()) / 60_000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  const median = waits.length === 0 ? null
    : waits.length % 2 ? waits[(waits.length - 1) / 2]
    : (waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2;

  // Last place only means something with at least two kids racing.
  const kidRows = p.seasonRows.filter((r) => kids.has(r.memberId));
  let lastPlace: GameHealth['lastPlace'] = null;
  if (kidRows.length >= 2) {
    const last = kidRows[kidRows.length - 1];
    const seen = p.lastActiveByMember[last.memberId] ?? null;
    const days = seen ? Math.floor((now.getTime() - seen.getTime()) / 86_400_000) : null;
    const m = p.members.find((x) => x.id === last.memberId);
    lastPlace = {
      memberId: last.memberId,
      name: (m?.displayName || 'Someone').split(' ')[0],
      daysSinceActive: days,
      stillActive: days != null && days <= STILL_ACTIVE_DAYS,
    };
  }

  return {
    parentActiveDays: parentDays.size,
    kidClaimedPct: kidDone.length ? Math.round((claimed.length / kidDone.length) * 100) : null,
    medianApprovalMins: median == null ? null : Math.round(median),
    lastPlace,
  };
}

/** "12 min" / "3 h" / "2 days" — for the approval-time metric. */
export function formatWait(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} days`;
}

/** "2h 35m" / "45m" */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── 6-week trend (member profile) ───────────────────────────────────────────

export interface WeekBar { start: Date; points: number }

/**
 * Earned points per family week for the last `weeks` weeks (oldest first),
 * reward spending excluded — the same "earned" number the leaderboard uses.
 */
export function weeklyTrend(
  txns: { delta: number; source?: string; date: Date | null }[],
  weekStartDay: number = 1,
  weeks: number = 6,
  now: Date = new Date(),
): WeekBar[] {
  const thisStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  thisStart.setDate(thisStart.getDate() - ((thisStart.getDay() - weekStartDay + 7) % 7));
  const bars: WeekBar[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisStart); start.setDate(thisStart.getDate() - i * 7);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    const points = txns
      .filter((t) => t.source !== 'redemption' && t.date && t.date >= start && t.date < end)
      .reduce((s, t) => s + t.delta, 0);
    bars.push({ start, points });
  }
  return bars;
}

// ─── Save for a reward (Phase E2) ────────────────────────────────────────────

export interface SavingProgress {
  progress: number;   // 0..1 (a negative balance never shows as progress)
  pct: number;        // 0..100, floored so 99.6% never reads "100%" early
  remaining: number;
  affordable: boolean;
}

export function savingProgress(spendable: number, cost: number): SavingProgress {
  const c = Math.max(0, Math.round(cost || 0));
  const have = Math.max(0, spendable || 0);
  if (c === 0) return { progress: 1, pct: 100, remaining: 0, affordable: true };
  const progress = Math.min(1, have / c);
  return {
    progress,
    pct: Math.floor(progress * 100),
    remaining: Math.max(0, c - have),
    affordable: have >= c,
  };
}

// ─── Bounties (Phase E4) ─────────────────────────────────────────────────────
// A parent posts "first to wash the car +100"; the first person whose claim a
// parent approves wins it. Firestore side lives in lib/bounties.

export type BountyStatus = 'open' | 'claimed' | 'done';

export interface Bounty {
  id: string;
  title: string;
  points: number;
  emoji?: string;
  status: BountyStatus;
  createdBy: string;
  claimedBy?: string | null;
  createdAt?: Date | null;
  completedAt?: Date | null;
}

/** How long a won bounty stays on the board ("🏆 Vian won it"). */
export const BOUNTY_WON_SHOW_MS = 24 * 60 * 60 * 1000;

/** The fixed transaction id for a bounty's award — at most one, ever. */
export const bountyTxId = (bountyId: string) => `bounty_${bountyId}`;

/**
 * What the board shows: claimed bounties first (they need a parent's eye),
 * then open ones newest first, then ones won in the last 24h.
 */
export function visibleBounties<T extends Bounty>(bounties: T[], now: Date = new Date()): T[] {
  const t = (d?: Date | null) => (d ? d.getTime() : 0);
  const order: Record<BountyStatus, number> = { claimed: 0, open: 1, done: 2 };
  return bounties
    .filter((b) => b.status !== 'done' || (b.completedAt && now.getTime() - b.completedAt.getTime() < BOUNTY_WON_SHOW_MS))
    .sort((a, b) => order[a.status] - order[b.status] || t(b.createdAt) - t(a.createdAt));
}

/** Can this member claim it? Only an open bounty, and not one they posted. */
export function canClaimBounty(b: Pick<Bounty, 'status' | 'createdBy'>, memberId: string): boolean {
  return b.status === 'open' && b.createdBy !== memberId;
}

// ─── Sunday crowning ceremony (Phase E5) ─────────────────────────────────────

/** How long into a new week the ceremony may still auto-open (days 0–2). */
export const CROWNING_WINDOW_DAYS = 3;

/**
 * Auto-open last week's winner screen on the first launch of a new week?
 * Yes when this device hasn't shown it for `thisWeekKey` yet, we're still in
 * the first few days of the week (a Thursday upgrade shouldn't replay last
 * week), and last week actually had a champion (no "nobody won" screen).
 */
export function shouldShowCrowning(p: {
  seenWeekKey: string | null;
  thisWeekKey: string;
  daysIntoWeek: number;
  lastWeekHadChampion: boolean;
}): boolean {
  if (p.seenWeekKey === p.thisWeekKey) return false;
  if (p.daysIntoWeek < 0 || p.daysIntoWeek >= CROWNING_WINDOW_DAYS) return false;
  return p.lastWeekHadChampion;
}

// ─── Kid Mode parental gate ──────────────────────────────────────────────────

export interface GateQuestion { a: number; b: number; answer: number; }

/** A grown-up check to leave Kid Mode: a 6–9 times-table question. */
export function makeGateQuestion(rand: () => number = Math.random): GateQuestion {
  const a = 6 + Math.floor(rand() * 4);
  const b = 6 + Math.floor(rand() * 4);
  return { a, b, answer: a * b };
}
