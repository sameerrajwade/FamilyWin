/**
 * __tests__/screens/settings.test.tsx
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockParentMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} };
const mockChildMember = { id: 'm3', familyId: 'f1', userId: 'u3', displayName: 'Tommy', role: 'child' as const, avatarEmoji: '🦊', isManaged: true, createdAt: {} };

jest.mock('@/lib/firebase', () => ({
  signOut: jest.fn().mockResolvedValue(undefined),
  getFamilyMembers: jest.fn().mockResolvedValue([]),
  updateMemberProfile: jest.fn().mockResolvedValue(undefined),
  upsertNotifConfig: jest.fn().mockResolvedValue(undefined),
  getNotifConfig: jest.fn().mockResolvedValue({ enabled: true, dailyReminderTime: '20:00' }),
}));

jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: jest.fn().mockResolvedValue(true),
  scheduleDailyReminder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({
    member: mockParentMember, family: mockFamily, clearSession: jest.fn(),
  })),
  useFamilyStore: jest.fn(() => ({
    members: [
      mockParentMember,
      { ...mockChildMember, id: 'm2', displayName: 'Emma', avatarEmoji: '🐼', isManaged: true },
    ],
    setMembers: jest.fn(),
    updateMember: jest.fn(),
  })),
}));

jest.mock('@/components/ui/AppearanceSettings', () => ({
  AppearanceSettings: () => null,
}));

jest.spyOn(Alert, 'alert');

describe('SettingsScreen — Parent', () => {
  let SettingsScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    SettingsScreen = require('@/app/app/tabs/settings').default;
  });

  it('renders Settings title', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('⚙️ Settings')).toBeTruthy();
  });

  it('shows profile section header', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('My Profile')).toBeTruthy();
  });

  it('shows family invite code', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('XK7P2Q')).toBeTruthy();
  });

  it('shows Managed Children section for parents', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Managed Children')).toBeTruthy();
  });

  it('shows managed children badge count', async () => {
    const { findAllByText } = render(<SettingsScreen />);
    // Managed children show "Remove" button
    const removeButtons = await findAllByText('Remove');
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it('shows Add a Child Profile button', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Add a Child Profile')).toBeTruthy();
  });

  it('shows Parental Controls section', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Log Discipline Event')).toBeTruthy();
  });

  it('shows Log Out button', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Log Out')).toBeTruthy();
  });

  it('shows sign-out confirmation alert', async () => {
    const { findByText } = render(<SettingsScreen />);
    const logoutBtn = await findByText('Log Out');
    await act(async () => { fireEvent.press(logoutBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('Log Out', expect.any(String), expect.any(Array));
  });

  it('shows notifications section', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Enable Notifications')).toBeTruthy();
  });

  it('shows Remove button for managed children', async () => {
    const { findAllByText } = render(<SettingsScreen />);
    const removeButtons = await findAllByText('Remove');
    expect(removeButtons.length).toBeGreaterThan(0);
  });
});

describe('SettingsScreen — Child (no parental controls)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValue({
      member: mockChildMember, family: mockFamily, clearSession: jest.fn(),
    });
    const { useFamilyStore } = require('@/store');
    (useFamilyStore as jest.Mock).mockReturnValue({
      members: [mockChildMember],
      setMembers: jest.fn(),
      updateMember: jest.fn(),
    });
  });

  it('does NOT show Managed Children section', async () => {
    const SettingsScreen = require('@/app/app/tabs/settings').default;
    const { queryByText } = render(<SettingsScreen />);
    await waitFor(() => {
      expect(queryByText('Managed Children')).toBeNull();
    });
  });

  it('does NOT show Parental Controls section', async () => {
    const SettingsScreen = require('@/app/app/tabs/settings').default;
    const { queryByText } = render(<SettingsScreen />);
    await waitFor(() => {
      expect(queryByText('Log Discipline Event')).toBeNull();
    });
  });

  it('still shows Log Out for child', async () => {
    const SettingsScreen = require('@/app/app/tabs/settings').default;
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Log Out')).toBeTruthy();
  });
});
