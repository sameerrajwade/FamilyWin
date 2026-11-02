/**
 * __tests__/screens/leaderboard.test.tsx
 */

import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', createdAt: {} };
const mockMembers = [
  { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁', role: 'admin_parent', familyId: 'f1', userId: 'u1', createdAt: {} },
  { id: 'm2', displayName: 'Mom', avatarEmoji: '🐸', role: 'parent', familyId: 'f1', userId: 'u2', createdAt: {} },
  { id: 'm3', displayName: 'Tommy', avatarEmoji: '🦊', role: 'child', familyId: 'f1', userId: '', isManaged: true, createdAt: {} },
];

jest.mock('@/lib/firebase', () => ({
  getFamilyMembers: jest.fn().mockResolvedValue([
    { id: 'm1', displayName: 'Dad', avatarEmoji: '🦁', role: 'admin_parent', familyId: 'f1', userId: 'u1', createdAt: {} },
    { id: 'm2', displayName: 'Mom', avatarEmoji: '🐸', role: 'parent', familyId: 'f1', userId: 'u2', createdAt: {} },
    { id: 'm3', displayName: 'Tommy', avatarEmoji: '🦊', role: 'child', familyId: 'f1', userId: '', isManaged: true, createdAt: {} },
  ]),
  getCurrentWeekId: jest.fn().mockReturnValue('2024-W21'),
  getPeriodCompletions: jest.fn().mockResolvedValue([]),
  getMemberPersonalBest: jest.fn().mockResolvedValue(0),
  getTodayDateString: jest.fn().mockReturnValue('2024-05-21'),
  setEngagementSettings: jest.fn().mockResolvedValue(undefined),
  Col: {
    transactions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      onSnapshot: jest.fn((cb) => { cb({ docs: [] }); return jest.fn(); }),
      get: jest.fn().mockResolvedValue({
        docs: [
          { data: () => ({ memberId: 'm1', delta: 100 }) },
          { data: () => ({ memberId: 'm2', delta: 75 }) },
          { data: () => ({ memberId: 'm3', delta: 50 }) },
        ],
      }),
    })),
  },
}));

jest.mock('@react-native-firebase/firestore', () => {
  const mock = jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
      onSnapshot: jest.fn((cb) => { cb({ docs: [] }); return jest.fn(); }),
    })),
  }));
  (mock as any).Timestamp = { fromDate: jest.fn((d: Date) => ({ toDate: () => d })) };
  return { default: mock, __esModule: true };
});

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: mockMember, family: mockFamily })),
  useFamilyStore: jest.fn(() => ({ members: mockMembers, setMembers: jest.fn() })),
  usePointsStore: jest.fn(() => ({
    weeklyTotals: { m1: 100, m2: 75, m3: 50 },
    setWeeklyTotals: jest.fn(),
  })),
}));

describe('LeaderboardScreen', () => {
  let LeaderboardScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    // The board reads the app-wide LIVE ledger (lib/memberLevels), not a one-off query.
    const { useMemberLevels } = require('@/lib/memberLevels');
    const now = { toDate: () => new Date() };
    act(() => useMemberLevels.getState().setFromTransactions([
      { memberId: 'm1', delta: 100, source: 'task', createdAt: now },
      { memberId: 'm2', delta: 75, source: 'task', createdAt: now },
      { memberId: 'm3', delta: 50, source: 'task', createdAt: now },
    ]));
    LeaderboardScreen = require('@/app/app/tabs/leaderboard').default;
  });

  it('waits for the live ledger instead of painting 0 points (user report)', async () => {
    const { useMemberLevels } = require('@/lib/memberLevels');
    act(() => useMemberLevels.getState().reset());
    const { queryAllByText } = render(<LeaderboardScreen />);
    await new Promise((r) => setTimeout(r, 50));
    expect(queryAllByText('Tommy')).toHaveLength(0); // still loading — no zero board
    act(() => useMemberLevels.getState().setFromTransactions([{ memberId: 'm3', delta: 50, source: 'task', createdAt: { toDate: () => new Date() } }]));
    await waitFor(() => expect(queryAllByText('Tommy').length).toBeGreaterThan(0));
  });

  it('renders the This week header', async () => {
    const { findByText } = render(<LeaderboardScreen />);
    expect(await findByText('This week')).toBeTruthy();
  });

  it('renders leaderboard entries', async () => {
    const { findByText } = render(<LeaderboardScreen />);
    // At least the title should render and loading finishes
    expect(await findByText('This week')).toBeTruthy();
  });

  // Who competes: default 'everyone' — parents rank too (current user is a
  // parent, so their row is highlighted). 'kids' mode makes parents coaches.
  it('by default everyone competes, including the current parent', async () => {
    const { findAllByText, queryByText } = render(<LeaderboardScreen />);
    // 3 players → podium + list, so names can appear twice.
    expect((await findAllByText('Tommy')).length).toBeGreaterThan(0);
    expect((await findAllByText(/\(You\)/)).length).toBeGreaterThan(0);
    expect(queryByText(/COACHES/)).toBeNull();
  });

  it("in 'kids' mode parents are listed as coaches, not ranked", async () => {
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValue({ member: mockMember, family: { ...mockFamily, competitionMode: 'kids' } });
    const { findByText, findAllByText, queryByText } = render(<LeaderboardScreen />);
    expect((await findAllByText('Tommy')).length).toBeGreaterThan(0);
    expect(await findByText(/COACHES/)).toBeTruthy();
    expect(queryByText(/\(You\)/)).toBeNull();
    (useAuthStore as jest.Mock).mockReturnValue({ member: mockMember, family: mockFamily });
  });

  it('shows week label', async () => {
    const { findByText } = render(<LeaderboardScreen />);
    // Should show some date range
    const el = await findByText(/-/);
    expect(el).toBeTruthy();
  });

  it('renders without crashing', async () => {
    const { findByText } = render(<LeaderboardScreen />);
    expect(await findByText('This week')).toBeTruthy();
  });
});
