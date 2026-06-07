// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type MemberRole = 'admin_parent' | 'parent' | 'child';

export type TaskRecurrence = 'daily' | 'weekly' | 'monthly' | 'once' | 'custom';

export type TaskCategory =
  | 'chores'
  | 'homework'
  | 'hygiene'
  | 'behavior'
  | 'extras';

export type PointSource = 'task' | 'discipline' | 'bonus' | 'manual';

export type RewardStatus = 'pending' | 'approved' | 'rejected';

export type TaskDifficulty = 'easy' | 'medium' | 'hard';

// ─── FAMILY ──────────────────────────────────────────────────────────────────

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  week_start_day: number; // 0 = Sunday, 1 = Monday
  created_at: string;
}

// ─── MEMBER ──────────────────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  display_name: string;
  role: MemberRole;
  avatar_url: string | null;
  avatar_emoji: string; // fallback emoji avatar
  age: number | null;
  pin_protected: boolean;
  pin_hash: string | null;
  created_at: string;
}

export interface MemberWithStats extends FamilyMember {
  current_week_points: number;
  current_week_rank: number;
  current_streak: number;
  tasks_completed_today: number;
  tasks_total_today: number;
}

// ─── TASKS ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  recurrence: TaskRecurrence;
  assigned_to: string | null; // member_id or null = anyone
  point_value: number;
  auto_fail_hour: number; // 0-23, hour of day to auto-fail
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface TaskWithCompletion extends Task {
  completion: TaskCompletion | null;
  assigned_member: FamilyMember | null;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  member_id: string;
  week_id: string;
  completed_at: string | null;
  was_auto_failed: boolean;
  points_awarded: number;
  created_at: string;
}

// ─── DISCIPLINE ───────────────────────────────────────────────────────────────

export interface DisciplineEvent {
  id: string;
  family_id: string;
  member_id: string;
  reason: string;
  point_delta: number; // negative = penalty, positive = bonus
  note: string | null;
  logged_by: string; // parent member_id
  created_at: string;
}

// ─── POINTS ──────────────────────────────────────────────────────────────────

export interface PointTransaction {
  id: string;
  family_id: string;
  member_id: string;
  delta: number;
  reason: string;
  source: PointSource;
  reference_id: string | null;
  created_at: string;
}

// ─── WEEKLY SCORES ────────────────────────────────────────────────────────────

export interface WeeklyScore {
  id: string;
  family_id: string;
  member_id: string;
  week_id: string;
  week_start: string;
  week_end: string;
  total_points: number;
  rank: number;
  winner: boolean;
}

// ─── REWARDS ─────────────────────────────────────────────────────────────────

export interface Reward {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  point_cost: number;
  quantity_available: number | null; // null = unlimited
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface RewardRedemption {
  id: string;
  reward_id: string;
  member_id: string;
  redeemed_at: string;
  approved_by: string | null;
  status: RewardStatus;
  reward?: Reward;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export interface NotificationConfig {
  id: string;
  member_id: string;
  daily_reminder_time: string; // "HH:MM" format
  push_token: string | null;
  enabled: boolean;
  timezone: string;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AppSession {
  user: AuthUser;
  member: FamilyMember;
  family: Family;
}

// ─── FORM TYPES ───────────────────────────────────────────────────────────────

export interface CreateFamilyForm {
  family_name: string;
  display_name: string;
  role: MemberRole;
  age?: number;
}

export interface JoinFamilyForm {
  invite_code: string;
  display_name: string;
  age?: number;
}

export interface CreateTaskForm {
  title: string;
  description?: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  recurrence: TaskRecurrence;
  assigned_to?: string;
  point_value: number;
  auto_fail_hour: number;
}

export interface LogDisciplineForm {
  member_id: string;
  reason: string;
  point_delta: number;
  note?: string;
}

export interface CreateRewardForm {
  title: string;
  description?: string;
  point_cost: number;
  quantity_available?: number;
}
