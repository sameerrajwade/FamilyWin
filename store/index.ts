/**
 * store/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand state management — shape identical to original.
 * Firebase types replace Supabase types; MMKV persistence unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FamilyDoc, MemberDoc, TaskDoc, TransactionDoc } from '@/lib/firebase';

// ─── AUTH STORE ───────────────────────────────────────────────────────────────

interface AuthState {
  user: { id: string; email: string | null; displayName?: string | null } | null;
  member: MemberDoc | null;          // the logged-in user's own member doc
  family: FamilyDoc | null;
  actingAsMember: MemberDoc | null;  // null = acting as self; set to a managed child to proxy for them
  isLoading: boolean;
  isHydrated: boolean;
  setUser: (user: AuthState['user']) => void;
  setMember: (member: MemberDoc | null) => void;
  setFamily: (family: FamilyDoc | null) => void;
  setActingAsMember: (member: MemberDoc | null) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      member: null,
      family: null,
      actingAsMember: null,
      isLoading: true,
      isHydrated: false,
      setUser: (user) => set({ user }),
      setMember: (member) => set({ member }),
      setFamily: (family) => set({ family }),
      // null = revert to self; MemberDoc = proxy for a managed child
      setActingAsMember: (actingAsMember) => set({ actingAsMember }),
      setLoading: (isLoading) => set({ isLoading }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      clearSession: () => set({ user: null, member: null, family: null, actingAsMember: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        member: state.member,
        family: state.family,
        // Don't persist actingAsMember — always start as yourself after relaunch
      }),
    },
  ),
);

// ─── FAMILY STORE ─────────────────────────────────────────────────────────────

interface FamilyState {
  members: MemberDoc[];
  setMembers: (members: MemberDoc[]) => void;
  updateMemberPoints: (memberId: string, delta: number) => void;
  updateMember: (memberId: string, data: Partial<MemberDoc>) => void;
}

export const useFamilyStore = create<FamilyState>()((set) => ({
  members: [],
  setMembers: (members) => set({ members }),
  updateMemberPoints: (memberId, delta) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === memberId ? { ...m } : m, // points live in transactions, not member doc
      ),
    })),
  updateMember: (memberId, data) =>
    set((state) => ({
      members: state.members.map((m) => (m.id === memberId ? { ...m, ...data } : m)),
    })),
}));

// ─── TASK STORE ───────────────────────────────────────────────────────────────

interface TaskDoc_WithCompletion extends TaskDoc {
  completion: {
    id: string;
    wasAutoFailed: boolean;
    pointsAwarded: number;
  } | null;
}

interface TaskState {
  todaysTasks: TaskDoc_WithCompletion[];
  isLoadingTasks: boolean;
  currentWeekId: string;
  setTodaysTasks: (tasks: TaskDoc_WithCompletion[]) => void;
  setLoadingTasks: (loading: boolean) => void;
  markTaskComplete: (taskId: string, pointValue: number) => void;
  refreshWeekId: () => void;
}

function calcWeekId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000);
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export const useTaskStore = create<TaskState>()((set) => ({
  todaysTasks: [],
  isLoadingTasks: false,
  currentWeekId: calcWeekId(),
  setTodaysTasks: (todaysTasks) => set({ todaysTasks }),
  setLoadingTasks: (isLoadingTasks) => set({ isLoadingTasks }),
  markTaskComplete: (taskId, pointValue) =>
    set((state) => ({
      todaysTasks: state.todaysTasks.map((t) =>
        t.id === taskId
          ? { ...t, completion: { id: '', wasAutoFailed: false, pointsAwarded: pointValue } }
          : t,
      ),
    })),
  refreshWeekId: () => set({ currentWeekId: calcWeekId() }),
}));

// ─── POINTS STORE ─────────────────────────────────────────────────────────────

interface PointsState {
  transactions: TransactionDoc[];
  weeklyTotals: Record<string, number>; // memberId → weekly points
  addTransaction: (tx: TransactionDoc) => void;
  setWeeklyTotals: (totals: Record<string, number>) => void;
}

export const usePointsStore = create<PointsState>()((set) => ({
  transactions: [],
  weeklyTotals: {},
  addTransaction: (tx) =>
    set((state) => ({
      transactions: [tx, ...state.transactions].slice(0, 100),
      weeklyTotals: {
        ...state.weeklyTotals,
        [tx.memberId]: (state.weeklyTotals[tx.memberId] ?? 0) + tx.delta,
      },
    })),
  setWeeklyTotals: (weeklyTotals) => set({ weeklyTotals }),
}));

// ─── REWARDS STORE ────────────────────────────────────────────────────────────

interface RewardsState {
  isLoadingRewards: boolean;
  setLoadingRewards: (loading: boolean) => void;
}

export const useRewardsStore = create<RewardsState>()((set) => ({
  isLoadingRewards: false,
  setLoadingRewards: (isLoadingRewards) => set({ isLoadingRewards }),
}));
