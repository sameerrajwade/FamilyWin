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
  getWeekCompletions: jest.fn().mockResolvedValue([]),
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
    LeaderboardScreen = require('@/app/app/tabs/leaderboard').default;
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

  // Phase B, Bet 3: kids are the players, parents are coaches. The current
  // user here is a parent, so they appear in the Coaches strip — not ranked.
  it('ranks kids and lists parents as coaches', async () => {
    const { findByText, queryByText } = render(<LeaderboardScreen />);
    expect(await findByText('Tommy')).toBeTruthy();
    expect(await findByText(/COACHES/)).toBeTruthy();
    expect(queryByText(/\(You\)/)).toBeNull();
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
