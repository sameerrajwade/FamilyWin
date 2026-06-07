/**
 * __tests__/store/store.test.ts
 * Tests for all four Zustand stores — state shape, actions, and persistence logic.
 */

import { act } from '@testing-library/react-native';

// We need to reset module state between tests to isolate store state
beforeEach(() => {
  jest.resetModules();
});

// ─── AUTH STORE ───────────────────────────────────────────────────────────────
describe('useAuthStore', () => {
  const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} as any };
  const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} as any };
  const mockUser = { id: 'u1', email: 'dad@test.com', displayName: 'Dad' };

  it('has correct initial state', async () => {
    const { useAuthStore } = require('@/store');
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.member).toBeNull();
    expect(state.family).toBeNull();
    expect(state.actingAsMember).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('setUser updates user state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setUser(mockUser); });
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('setMember updates member state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setMember(mockMember); });
    expect(useAuthStore.getState().member).toEqual(mockMember);
  });

  it('setFamily updates family state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setFamily(mockFamily); });
    expect(useAuthStore.getState().family).toEqual(mockFamily);
  });

  it('setActingAsMember sets proxy child member', async () => {
    const { useAuthStore } = require('@/store');
    const child = { ...mockMember, id: 'm2', displayName: 'Tommy', isManaged: true };
    act(() => { useAuthStore.getState().setActingAsMember(child); });
    expect(useAuthStore.getState().actingAsMember).toEqual(child);
  });

  it('setActingAsMember(null) clears acting as', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setActingAsMember(null); });
    expect(useAuthStore.getState().actingAsMember).toBeNull();
  });

  it('clearSession resets all auth state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setMember(mockMember);
      useAuthStore.getState().setFamily(mockFamily);
      useAuthStore.getState().clearSession();
    });
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.member).toBeNull();
    expect(state.family).toBeNull();
    expect(state.actingAsMember).toBeNull();
  });

  it('setLoading updates loading state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setLoading(false); });
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('setHydrated updates hydration state', async () => {
    const { useAuthStore } = require('@/store');
    act(() => { useAuthStore.getState().setHydrated(true); });
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });
});

// ─── FAMILY STORE ─────────────────────────────────────────────────────────────
describe('useFamilyStore', () => {
  const mockMembers = [
    { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁', role: 'admin_parent', familyId: 'f1', userId: 'u1', createdAt: {} as any },
    { id: 'm2', displayName: 'Tommy', avatarEmoji: '🦊', role: 'child', familyId: 'f1', userId: '', isManaged: true, createdAt: {} as any },
  ];

  it('has empty members array initially', async () => {
    const { useFamilyStore } = require('@/store');
    expect(useFamilyStore.getState().members).toEqual([]);
  });

  it('setMembers replaces member list', async () => {
    const { useFamilyStore } = require('@/store');
    act(() => { useFamilyStore.getState().setMembers(mockMembers as any); });
    expect(useFamilyStore.getState().members).toHaveLength(2);
    expect(useFamilyStore.getState().members[0].displayName).toBe('Dad');
  });

  it('updateMember merges partial updates', async () => {
    const { useFamilyStore } = require('@/store');
    act(() => { useFamilyStore.getState().setMembers(mockMembers as any); });
    act(() => { useFamilyStore.getState().updateMember('m1', { avatarEmoji: '🐯' }); });
    const updated = useFamilyStore.getState().members.find((m: any) => m.id === 'm1');
    expect(updated.avatarEmoji).toBe('🐯');
    expect(updated.displayName).toBe('Dad'); // unchanged
  });

  it('updateMember only affects the targeted member', async () => {
    const { useFamilyStore } = require('@/store');
    act(() => { useFamilyStore.getState().setMembers(mockMembers as any); });
    act(() => { useFamilyStore.getState().updateMember('m1', { displayName: 'Father' }); });
    const tommy = useFamilyStore.getState().members.find((m: any) => m.id === 'm2');
    expect(tommy.displayName).toBe('Tommy'); // unchanged
  });
});

// ─── TASK STORE ───────────────────────────────────────────────────────────────
describe('useTaskStore', () => {
  const mockTask = {
    id: 't1', title: 'Clean Room', category: 'chores', difficulty: 'easy' as const,
    recurrence: 'daily', pointValue: 10, isActive: true, createdBy: 'm1',
    familyId: 'f1', createdAt: {} as any, completion: null,
  };

  it('has empty tasks initially', async () => {
    const { useTaskStore } = require('@/store');
    expect(useTaskStore.getState().todaysTasks).toEqual([]);
  });

  it('setTodaysTasks updates task list', async () => {
    const { useTaskStore } = require('@/store');
    act(() => { useTaskStore.getState().setTodaysTasks([mockTask] as any); });
    expect(useTaskStore.getState().todaysTasks).toHaveLength(1);
  });

  it('markTaskComplete sets completion on correct task', async () => {
    const { useTaskStore } = require('@/store');
    act(() => { useTaskStore.getState().setTodaysTasks([mockTask] as any); });
    act(() => { useTaskStore.getState().markTaskComplete('t1', 10); });
    const task = useTaskStore.getState().todaysTasks[0];
    expect(task.completion).not.toBeNull();
    expect(task.completion.pointsAwarded).toBe(10);
    expect(task.completion.wasAutoFailed).toBe(false);
  });

  it('markTaskComplete does not affect other tasks', async () => {
    const { useTaskStore } = require('@/store');
    const task2 = { ...mockTask, id: 't2', title: 'Do Homework' };
    act(() => { useTaskStore.getState().setTodaysTasks([mockTask, task2] as any); });
    act(() => { useTaskStore.getState().markTaskComplete('t1', 10); });
    const t2 = useTaskStore.getState().todaysTasks.find((t: any) => t.id === 't2');
    expect(t2.completion).toBeNull();
  });

  it('setLoadingTasks updates loading flag', async () => {
    const { useTaskStore } = require('@/store');
    act(() => { useTaskStore.getState().setLoadingTasks(true); });
    expect(useTaskStore.getState().isLoadingTasks).toBe(true);
    act(() => { useTaskStore.getState().setLoadingTasks(false); });
    expect(useTaskStore.getState().isLoadingTasks).toBe(false);
  });

  it('refreshWeekId updates current week id', async () => {
    const { useTaskStore } = require('@/store');
    const before = useTaskStore.getState().currentWeekId;
    act(() => { useTaskStore.getState().refreshWeekId(); });
    const after = useTaskStore.getState().currentWeekId;
    // Should follow YYYY-WNN format
    expect(after).toMatch(/^\d{4}-W\d{2}$/);
    expect(after).toBe(before); // same week unless test runs at week boundary
  });
});

// ─── POINTS STORE ─────────────────────────────────────────────────────────────
describe('usePointsStore', () => {
  const mockTx = {
    id: 'tx1', familyId: 'f1', memberId: 'm1', delta: 25,
    reason: 'Completed: Clean Room', source: 'task' as const,
    createdAt: { toDate: () => new Date(), seconds: 0 } as any,
  };

  it('starts with empty transactions and totals', async () => {
    const { usePointsStore } = require('@/store');
    expect(usePointsStore.getState().transactions).toEqual([]);
    expect(usePointsStore.getState().weeklyTotals).toEqual({});
  });

  it('addTransaction prepends to list and updates totals', async () => {
    const { usePointsStore } = require('@/store');
    act(() => { usePointsStore.getState().addTransaction(mockTx); });
    expect(usePointsStore.getState().transactions[0]).toEqual(mockTx);
    expect(usePointsStore.getState().weeklyTotals['m1']).toBe(25);
  });

  it('addTransaction accumulates totals for same member', async () => {
    const { usePointsStore } = require('@/store');
    act(() => { usePointsStore.getState().addTransaction(mockTx); });
    act(() => { usePointsStore.getState().addTransaction({ ...mockTx, id: 'tx2', delta: 10 }); });
    expect(usePointsStore.getState().weeklyTotals['m1']).toBe(35);
  });

  it('addTransaction handles negative delta (penalty)', async () => {
    const { usePointsStore } = require('@/store');
    act(() => { usePointsStore.getState().addTransaction({ ...mockTx, delta: 25 }); });
    act(() => { usePointsStore.getState().addTransaction({ ...mockTx, id: 'tx2', delta: -10 }); });
    expect(usePointsStore.getState().weeklyTotals['m1']).toBe(15);
  });

  it('addTransaction keeps only last 100 transactions', async () => {
    const { usePointsStore } = require('@/store');
    for (let i = 0; i < 105; i++) {
      act(() => { usePointsStore.getState().addTransaction({ ...mockTx, id: `tx${i}`, delta: 1 }); });
    }
    expect(usePointsStore.getState().transactions).toHaveLength(100);
  });

  it('setWeeklyTotals replaces totals completely', async () => {
    const { usePointsStore } = require('@/store');
    act(() => { usePointsStore.getState().setWeeklyTotals({ m1: 100, m2: 200 }); });
    expect(usePointsStore.getState().weeklyTotals).toEqual({ m1: 100, m2: 200 });
  });

  it('tracks multiple members independently', async () => {
    const { usePointsStore } = require('@/store');
    act(() => { usePointsStore.getState().addTransaction({ ...mockTx, memberId: 'm1', delta: 50 }); });
    act(() => { usePointsStore.getState().addTransaction({ ...mockTx, id: 'tx2', memberId: 'm2', delta: 75 }); });
    expect(usePointsStore.getState().weeklyTotals['m1']).toBe(50);
    expect(usePointsStore.getState().weeklyTotals['m2']).toBe(75);
  });
});
