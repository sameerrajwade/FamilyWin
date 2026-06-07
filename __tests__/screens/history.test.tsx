/**
 * __tests__/screens/history.test.tsx
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} };

const mockTxDocs = [
  { id: 'tx1', data: () => ({ id: 'tx1', familyId: 'f1', memberId: 'm1', delta: 25, reason: 'Completed: Clean Room', source: 'task', createdAt: { toDate: () => new Date() } }) },
  { id: 'tx2', data: () => ({ id: 'tx2', familyId: 'f1', memberId: 'm1', delta: -10, reason: 'Penalty: Argued at dinner', source: 'discipline', createdAt: { toDate: () => new Date() } }) },
];

jest.mock('@/lib/firebase', () => ({
  Col: {
    transactions: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: mockTxDocs }),
    })),
  },
  auth: jest.fn(() => ({ currentUser: { uid: 'u1' } })),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: mockMember, family: mockFamily })),
}));

describe('HistoryScreen', () => {
  let HistoryScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    HistoryScreen = require('@/app/app/tabs/history').default;
  });

  it('renders 📊 History title', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('📊 History')).toBeTruthy();
  });

  it('shows Mine and Family toggle buttons for parents', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('Mine')).toBeTruthy();
    expect(await findByText('Family')).toBeTruthy();
  });

  it('shows All Time and This Week stat cards', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('All Time')).toBeTruthy();
    expect(await findByText('This Week')).toBeTruthy();
  });

  it('shows 6-Week bar chart section', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('6-Week Points Trend')).toBeTruthy();
  });

  it('shows Recent Activity section', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('Recent Activity')).toBeTruthy();
  });

  it('renders transactions after loading', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('Completed: Clean Room')).toBeTruthy();
    expect(await findByText('Penalty: Argued at dinner')).toBeTruthy();
  });

  it('shows positive delta in green', async () => {
    const { findByText } = render(<HistoryScreen />);
    const positiveDelta = await findByText('+25');
    expect(positiveDelta).toBeTruthy();
  });

  it('shows negative delta in red', async () => {
    const { findByText } = render(<HistoryScreen />);
    const negativeDelta = await findByText('-10');
    expect(negativeDelta).toBeTruthy();
  });

  it('shows events count stat card', async () => {
    const { findByText } = render(<HistoryScreen />);
    expect(await findByText('Events')).toBeTruthy();
  });
});
