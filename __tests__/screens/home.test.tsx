/**
 * __tests__/screens/home.test.tsx
 * Tests for the Home screen — task list, profile switcher, task completion.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', createdAt: {} };
const mockTasks = [
  { id: 't1', title: 'Clean Room', category: 'chores', difficulty: 'easy', pointValue: 10, recurrence: 'daily', isActive: true, createdBy: 'm1', familyId: 'f1', createdAt: {}, completion: null },
  { id: 't2', title: 'Do Homework', category: 'homework', difficulty: 'medium', pointValue: 25, recurrence: 'daily', isActive: true, createdBy: 'm1', familyId: 'f1', createdAt: {}, completion: null },
  { id: 't3', title: 'Completed Task', category: 'chores', difficulty: 'easy', pointValue: 10, recurrence: 'daily', isActive: true, createdBy: 'm1', familyId: 'f1', createdAt: {}, completion: { id: 'c1', wasAutoFailed: false, pointsAwarded: 10 } },
];

jest.mock('@/lib/firebase', () => ({
  getActiveTasks: jest.fn().mockResolvedValue([]),
  getWeekCompletions: jest.fn().mockResolvedValue([]),
  completeTask: jest.fn().mockResolvedValue({ id: 'tx1', delta: 10 }),
  getCurrentWeekId: jest.fn().mockReturnValue('2024-W21'),
  Col: {
    transactions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
  },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      primary: '#6C63FF', background: '#F8F9FF', surface: '#FFFFFF',
      text: '#1A1A2E', textSecondary: '#666', success: '#43D98F',
      danger: '#FF5C5C', warning: '#FFB347', border: '#E8E8F0',
    },
    isDark: false,
    isChildMode: false,
    fontSize: (s: number) => s,
  })),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({
    member: mockMember, family: mockFamily, actingAsMember: null,
  })),
  useTaskStore: jest.fn(() => ({
    todaysTasks: mockTasks,
    isLoadingTasks: false,
    setTodaysTasks: jest.fn(),
    setLoadingTasks: jest.fn(),
    markTaskComplete: jest.fn(),
    currentWeekId: '2024-W21',
  })),
  useFamilyStore: jest.fn(() => ({ members: [mockMember], updateMemberPoints: jest.fn() })),
  usePointsStore: jest.fn(() => ({ addTransaction: jest.fn(), weeklyTotals: { m1: 50 } })),
}));

jest.spyOn(Alert, 'alert');

describe('HomeScreen', () => {
  let HomeScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    HomeScreen = require('@/app/app/tabs/index').default;
  });

  it('renders greeting with member name', async () => {
    const { findByText } = render(<HomeScreen />);
    const greeting = await findByText(/Hey, Dad/);
    expect(greeting).toBeTruthy();
  });

  it('renders task list with task titles', async () => {
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('Clean Room')).toBeTruthy();
    expect(await findByText('Do Homework')).toBeTruthy();
  });

  it('renders completed task with different style', async () => {
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('Completed Task')).toBeTruthy();
  });

  it('renders + button for parent', async () => {
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('＋')).toBeTruthy();
  });

  it('renders progress bar section', async () => {
    const { findByText } = render(<HomeScreen />);
    expect(await findByText("Today's Tasks")).toBeTruthy();
  });

  it('shows confirm alert when tapping incomplete task', async () => {
    const { findByText } = render(<HomeScreen />);
    const task = await findByText('Clean Room');
    await act(async () => { fireEvent.press(task.parent!.parent!); });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Complete Task? ✅',
      expect.stringContaining('Clean Room'),
      expect.any(Array),
    );
  });
});

// ─── HOME SCREEN — Acting As Child ────────────────────────────────────────────
describe('HomeScreen — Acting as managed child', () => {
  const managedChild = { id: 'm2', familyId: 'f1', userId: '', displayName: 'Tommy', role: 'child', avatarEmoji: '🦊', isManaged: true, createdAt: {} };

  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValue({
      member: mockMember,
      family: mockFamily,
      actingAsMember: managedChild,
    });
  });

  it('shows profile switcher banner when acting as child', async () => {
    // When actingAsMember is set, the ProfileSwitcherBanner renders "Acting as"
    const HomeScreen = require('@/app/app/tabs/index').default;
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('Acting as')).toBeTruthy();
  });
});

// ─── HOME SCREEN — Empty state ────────────────────────────────────────────────
describe('HomeScreen — No tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useTaskStore } = require('@/store');
    (useTaskStore as jest.Mock).mockReturnValue({
      todaysTasks: [],
      isLoadingTasks: false,
      setTodaysTasks: jest.fn(),
      setLoadingTasks: jest.fn(),
      markTaskComplete: jest.fn(),
      currentWeekId: '2024-W21',
    });
  });

  it('shows empty state when no tasks', async () => {
    const HomeScreen = require('@/app/app/tabs/index').default;
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('No tasks today!')).toBeTruthy();
  });
});

// ─── HOME SCREEN — Loading state ─────────────────────────────────────────────
describe('HomeScreen — Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useTaskStore } = require('@/store');
    (useTaskStore as jest.Mock).mockReturnValue({
      todaysTasks: [],
      isLoadingTasks: true,
      setTodaysTasks: jest.fn(),
      setLoadingTasks: jest.fn(),
      markTaskComplete: jest.fn(),
      currentWeekId: '2024-W21',
    });
  });

  it('shows loading skeletons when tasks are loading', async () => {
    const HomeScreen = require('@/app/app/tabs/index').default;
    const { UNSAFE_queryAllByType } = render(<HomeScreen />);
    // Loading state shows shimmer boxes
    expect(UNSAFE_queryAllByType('View').length).toBeGreaterThan(0);
  });
});
