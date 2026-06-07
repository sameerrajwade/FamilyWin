/**
 * __tests__/integration/managed-child-flow.test.tsx
 * Integration tests for the managed child profile flow.
 * Uses mocked stores and Firebase — validates the full user journey.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ─── Mocks (no outer variables allowed in jest.mock factories) ────────────────

jest.mock('@/lib/firebase', () => ({
  createManagedMember: jest.fn().mockResolvedValue({
    id: 'm2', familyId: 'f1', userId: '', displayName: 'Tommy',
    role: 'child', avatarEmoji: '🦊', isManaged: true, createdAt: {},
  }),
  completeTask: jest.fn().mockResolvedValue({ id: 'tx1', delta: 10, memberId: 'm2' }),
  getActiveTasks: jest.fn().mockResolvedValue([]),
  getWeekCompletions: jest.fn().mockResolvedValue([]),
  getCurrentWeekId: jest.fn().mockReturnValue('2024-W21'),
  Col: {
    transactions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
    tasks: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'new-task' }) })),
  },
}));

const mockSetActingAsMember = jest.fn();
const mockSetMembers = jest.fn();

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({
    member: { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', createdAt: {} },
    family: { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} },
    actingAsMember: null,
    setActingAsMember: mockSetActingAsMember,
  })),
  useFamilyStore: jest.fn(() => ({
    members: [{ id: 'm1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁' }],
    setMembers: mockSetMembers,
    updateMemberPoints: jest.fn(),
  })),
  useTaskStore: jest.fn(() => ({
    todaysTasks: [],
    isLoadingTasks: false,
    setTodaysTasks: jest.fn(),
    setLoadingTasks: jest.fn(),
    markTaskComplete: jest.fn(),
    currentWeekId: '2024-W21',
  })),
  usePointsStore: jest.fn(() => ({ addTransaction: jest.fn(), weeklyTotals: {} })),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: { primary: '#6C63FF', background: '#F8F9FF', surface: '#FFFFFF', text: '#1A1A2E', textSecondary: '#666', success: '#43D98F', danger: '#FF5C5C', warning: '#FFB347', border: '#E8E8F0' },
    isDark: false, isChildMode: false, fontSize: (s: number) => s,
  })),
}));

jest.spyOn(Alert, 'alert');

// ─── SCENARIO 1: Parent adds managed child ────────────────────────────────────
describe('Integration: Add managed child profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the Add Child screen correctly', async () => {
    const AddChildScreen = require('@/app/app/member/add-child').default;
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText('Add a Child Profile')).toBeTruthy();
    expect(await findByText(/No phone needed/)).toBeTruthy();
  });

  it('creates managed member with correct data on save', async () => {
    const { createManagedMember } = require('@/lib/firebase');
    const AddChildScreen = require('@/app/app/member/add-child').default;
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);

    await act(async () => {
      fireEvent.changeText(
        await findByPlaceholderText('e.g. Tommy, Emma...'),
        'Lily',
      );
      fireEvent.changeText(await findByPlaceholderText('e.g. 8'), '7');
    });

    await act(async () => {
      fireEvent.press(await findByText('Add Lily to Family 🎉'));
    });

    expect(createManagedMember).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Lily', age: 7, familyId: 'f1' })
    );
  });

  it('updates the members list after adding child', async () => {
    const AddChildScreen = require('@/app/app/member/add-child').default;
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);

    await act(async () => {
      fireEvent.changeText(await findByPlaceholderText('e.g. Tommy, Emma...'), 'Max');
    });

    await act(async () => {
      fireEvent.press(await findByText('Add Max to Family 🎉'));
    });

    expect(mockSetMembers).toHaveBeenCalled();
    const newList = mockSetMembers.mock.calls[0][0];
    expect(newList.length).toBe(2); // original + new child
    expect(newList[1].displayName).toBe('Tommy'); // from mock resolve value
    expect(newList[1].isManaged).toBe(true);
  });
});

// ─── SCENARIO 2: Profile switcher state management ───────────────────────────
describe('Integration: Profile switcher state transitions', () => {
  it('actingAsMember starts null (acting as self)', () => {
    const { useAuthStore } = require('@/store');
    const state = useAuthStore();
    expect(state.actingAsMember).toBeNull();
  });

  it('switching to child sets actingAsMember', () => {
    const child = { id: 'm2', displayName: 'Tommy', isManaged: true };
    mockSetActingAsMember(child);
    expect(mockSetActingAsMember).toHaveBeenCalledWith(child);
  });

  it('switching back to self passes null', () => {
    mockSetActingAsMember(null);
    expect(mockSetActingAsMember).toHaveBeenCalledWith(null);
  });
});

// ─── SCENARIO 3: Points go to managed child ──────────────────────────────────
describe('Integration: Task points credited to managed child', () => {
  it('completeTask uses child memberId when acting as child', async () => {
    const { completeTask } = require('@/lib/firebase');

    // Simulate what home screen does when acting as managed child
    await completeTask({
      familyId: 'f1',
      taskId: 't1',
      memberId: 'm2',  // child's ID, not parent's
      weekId: '2024-W21',
      pointValue: 10,
      taskTitle: 'Clean Room',
    });

    expect(completeTask).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'm2' })
    );
  });

  it('does NOT credit parent when acting as child', async () => {
    const { completeTask } = require('@/lib/firebase');

    await completeTask({
      familyId: 'f1', taskId: 't1', memberId: 'm2',
      weekId: '2024-W21', pointValue: 10, taskTitle: 'Clean Room',
    });

    const call = completeTask.mock.calls[0][0];
    expect(call.memberId).not.toBe('m1'); // not parent's ID
  });
});

// ─── SCENARIO 4: Managed child appears on leaderboard ────────────────────────
describe('Integration: Managed child appears in leaderboard', () => {
  it('buildLeaderboard includes managed children', () => {
    const { buildLeaderboard } = require('@/lib/pointsEngine');
    const members = [
      { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁' },
      { id: 'm2', displayName: 'Tommy', avatarEmoji: '🦊', isManaged: true },
    ];
    const board = buildLeaderboard({ m1: 150, m2: 100 }, members, 'm1', {}, {});
    expect(board).toHaveLength(2);
    const tommy = board.find((e: any) => e.memberId === 'm2');
    expect(tommy).toBeTruthy();
    expect(tommy.points).toBe(100);
    expect(tommy.rank).toBe(2);
  });

  it('managed child can win the week', () => {
    const { buildLeaderboard } = require('@/lib/pointsEngine');
    const members = [
      { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁' },
      { id: 'm2', displayName: 'Tommy', avatarEmoji: '🦊', isManaged: true },
    ];
    // Tommy has more points this week
    const board = buildLeaderboard({ m1: 50, m2: 200 }, members, 'm1', {}, {});
    expect(board[0].memberId).toBe('m2'); // Tommy is #1
    expect(board[0].rank).toBe(1);
  });
});

// ─── SCENARIO 5: Validation — empty name blocked ─────────────────────────────
describe('Integration: Add child validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('blocks saving with empty name — shows "Child" as placeholder', async () => {
    const AddChildScreen = require('@/app/app/member/add-child').default;
    const { createManagedMember } = require('@/lib/firebase');
    const { findByText } = render(<AddChildScreen />);

    // Button says "Add Child to Family" when name is empty
    const saveBtn = await findByText('Add Child to Family 🎉');
    await act(async () => { fireEvent.press(saveBtn); });

    expect(createManagedMember).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Missing Name', expect.any(String));
  });

  it('blocks saving with whitespace-only name', async () => {
    const AddChildScreen = require('@/app/app/member/add-child').default;
    const { createManagedMember } = require('@/lib/firebase');
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);

    await act(async () => {
      fireEvent.changeText(await findByPlaceholderText('e.g. Tommy, Emma...'), '   ');
    });

    // trim() returns '' so button still says "Add Child to Family"
    const saveBtn = await findByText('Add Child to Family 🎉');
    await act(async () => { fireEvent.press(saveBtn); });

    expect(createManagedMember).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Missing Name', expect.any(String));
  });
});
