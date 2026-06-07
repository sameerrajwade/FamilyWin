/**
 * __tests__/screens/discipline.test.tsx
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockParent = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} };
const mockChild = { id: 'm2', familyId: 'f1', userId: 'u2', displayName: 'Tommy', role: 'child' as const, avatarEmoji: '🦊', createdAt: {} };

jest.mock('@/lib/firebase', () => ({
  addPointTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }),
  getFamilyMembers: jest.fn().mockResolvedValue([
    { id: 'm1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', familyId: 'f1', userId: 'u1', createdAt: {} },
    { id: 'm2', displayName: 'Tommy', role: 'child', avatarEmoji: '🦊', familyId: 'f1', userId: 'u2', createdAt: {} },
  ]),
  auth: jest.fn(() => ({ currentUser: { uid: 'u1' } })),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: mockParent, family: mockFamily })),
  useFamilyStore: jest.fn(() => ({
    members: [mockParent, mockChild],
    setMembers: jest.fn(),
  })),
}));

jest.spyOn(Alert, 'alert');

describe('DisciplineLogScreen — Parent', () => {
  let DisciplineScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    DisciplineScreen = require('@/app/app/discipline/log').default;
  });

  it('renders Log Discipline Event title', async () => {
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('Log Discipline Event')).toBeTruthy();
  });

  it('shows family member selector', async () => {
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('1. Select Family Member')).toBeTruthy();
  });

  it('shows Tommy in member list (not self)', async () => {
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('Tommy')).toBeTruthy();
  });

  it('shows Penalty and Bonus type buttons', async () => {
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('Penalty')).toBeTruthy();
    expect(await findByText('Bonus')).toBeTruthy();
  });

  it('shows quick reason section', async () => {
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('3. Quick Reasons')).toBeTruthy();
  });

  it('shows bonus section label when switching to bonus', async () => {
    const { findByText } = render(<DisciplineScreen />);
    const bonusBtn = await findByText('Bonus');
    await act(async () => { fireEvent.press(bonusBtn); });
    // In bonus mode: submit button says "⭐ Award Bonus"
    expect(await findByText('⭐ Award Bonus')).toBeTruthy();
  });

  it('shows point amount chips', async () => {
    const { findAllByText } = render(<DisciplineScreen />);
    const chips = await findAllByText(/^(5|10|15|20|25|30|50)$/);
    expect(chips.length).toBeGreaterThan(0);
  });

  it('shows error when no member selected', async () => {
    const { findByText } = render(<DisciplineScreen />);
    const submitBtn = await findByText('⚠️ Apply Penalty');
    await act(async () => { fireEvent.press(submitBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('Select Member', 'Please select a family member.');
  });

  it('shows error when no reason entered', async () => {
    const { findByText } = render(<DisciplineScreen />);
    // Select Tommy
    const tommyChip = await findByText('Tommy');
    await act(async () => { fireEvent.press(tommyChip); });
    const submitBtn = await findByText('⚠️ Apply Penalty');
    await act(async () => { fireEvent.press(submitBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('Enter Reason', 'Please enter or select a reason.');
  });
});

describe('DisciplineLogScreen — Non-parent sees blocked screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValue({
      member: mockChild, family: mockFamily,
    });
  });

  it('shows Parents Only message for child', async () => {
    const DisciplineScreen = require('@/app/app/discipline/log').default;
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('Parents Only')).toBeTruthy();
    expect(await findByText('Only parents can log discipline events.')).toBeTruthy();
  });

  it('shows Go Back button', async () => {
    const DisciplineScreen = require('@/app/app/discipline/log').default;
    const { findByText } = render(<DisciplineScreen />);
    expect(await findByText('← Go Back')).toBeTruthy();
  });
});
