import type { Task, TaskCompletion, PointTransaction, DisciplineEvent } from '@/types';

// ─── POINT CALCULATIONS ───────────────────────────────────────────────────────

export function calculateTaskPoints(task: Task): number {
  return task.point_value;
}

export function calculateAutoFailPenalty(task: Task): number {
  // Auto-fail loses the full point value
  return -task.point_value;
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
