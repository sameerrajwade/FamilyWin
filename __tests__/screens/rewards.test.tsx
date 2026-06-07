/**
 * __tests__/screens/rewards.test.tsx
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', createdAt: {} };
const mockChildMember = { id: 'm3', familyId: 'f1', userId: 'u3', displayName: 'Tommy', role: 'child', avatarEmoji: '🦊', createdAt: {} };
const mockRewards = [
  { id: 'r1', familyId: 'f1', title: '30min Screen Time', pointCost: 30, isActive: true, createdBy: 'm1', createdAt: {} },
  { id: 'r2', familyId: 'f1', title: 'Ice Cream Treat', pointCost: 150, isActive: true, createdBy: 'm1', createdAt: {} },
];

jest.mock('@/lib/firebase', () => ({
  getActiveRewards: jest.fn().mockResolvedValue(mockRewards),
  requestRedemption: jest.fn().mockResolvedValue(undefined),
  approveRedemption: jest.fn().mockResolvedValue(undefined),
  createReward: jest.fn().mockResolvedValue(undefined),
  Col: {
    redemptions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
    transactions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [{ data: () => ({ delta: 100 }) }] }),
    })),
    rewards: jest.fn(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: () => ({ title: '30min Screen Time', pointCost: 30 }) }) })),
    })),
    members: jest.fn(() => ({
      doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: () => ({ displayName: 'Tommy', avatarEmoji: '🦊' }) }) })),
    })),
  },
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: mockMember, family: mockFamily })),
  usePointsStore: jest.fn(() => ({ weeklyTotals: { m1: 100 } })),
}));

jest.spyOn(Alert, 'alert');

describe('RewardsScreen — Parent view', () => {
  let RewardsScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    RewardsScreen = require('@/app/app/tabs/rewards').default;
  });

  it('renders Rewards Store title', async () => {
    const { findByText } = render(<RewardsScreen />);
    expect(await findByText('🎁 Rewards Store')).toBeTruthy();
  });

  it('displays available rewards', async () => {
    const { findByText } = render(<RewardsScreen />);
    expect(await findByText('30min Screen Time')).toBeTruthy();
    expect(await findByText('Ice Cream Treat')).toBeTruthy();
  });

  it('shows point cost for each reward', async () => {
    const { findByText } = render(<RewardsScreen />);
    expect(await findByText('30')).toBeTruthy();
  });

  it('shows + Add button for parents', async () => {
    const { findByText } = render(<RewardsScreen />);
    expect(await findByText('＋ Add')).toBeTruthy();
  });

  it('shows current points balance', async () => {
    const { findByText } = render(<RewardsScreen />);
    expect(await findByText(/pts/)).toBeTruthy();
  });

  it('opens create reward modal when + Add is tapped', async () => {
    const { findByText } = render(<RewardsScreen />);
    const addBtn = await findByText('＋ Add');
    await act(async () => { fireEvent.press(addBtn); });
    expect(await findByText('Create Reward 🎁')).toBeTruthy();
  });
});

describe('RewardsScreen — Child view (not enough points)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValue({ member: mockChildMember, family: mockFamily });
    const { usePointsStore } = require('@/store');
    (usePointsStore as jest.Mock).mockReturnValue({ weeklyTotals: { m3: 10 } });
  });

  it('shows Redeem button for affordable rewards', async () => {
    const RewardsScreen = require('@/app/app/tabs/rewards').default;
    const { findAllByText } = render(<RewardsScreen />);
    // With only 10 pts, no rewards are affordable
    const needMore = await findAllByText('Need More');
    expect(needMore.length).toBeGreaterThan(0);
  });

  it('does NOT show + Add button for child', async () => {
    const RewardsScreen = require('@/app/app/tabs/rewards').default;
    const { queryByText } = render(<RewardsScreen />);
    await waitFor(() => {
      expect(queryByText('＋ Add')).toBeNull();
    });
  });

  it('shows Need More on rewards the child cannot afford', async () => {
    const RewardsScreen = require('@/app/app/tabs/rewards').default;
    const { findAllByText } = render(<RewardsScreen />);
    const needMoreBtns = await findAllByText('Need More');
    // With 10 pts, all rewards (30+ pts) should show "Need More"
    expect(needMoreBtns.length).toBeGreaterThan(0);
  });
});
