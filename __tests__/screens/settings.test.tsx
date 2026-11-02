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
  uploadMemberPhoto: jest.fn().mockResolvedValue('https://example.com/p.jpg'),
  removeMemberPhoto: jest.fn().mockResolvedValue(undefined),
  deleteMyAccount: jest.fn().mockResolvedValue(undefined),
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

  // Settings is now a HUB (iter 27): a profile card + grouped NavRows to
  // sub-screens (Family & Members, Appearance, Notifications, Parental Controls,
  // Help & Legal) + inline Account actions. Invite code / managed children /
  // discipline / notification toggles now live on their own sub-screens.

  // Settings is now 'you + the app': Family & Members and the game rules
  // (old Parental Controls) moved to the Family tab.
  it('renders the Preferences group (header condensed to the brand row)', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Appearance')).toBeTruthy();
  });

  it('shows the profile card (name + family)', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Dad')).toBeTruthy();
    expect(await findByText('Smith Family')).toBeTruthy();
  });

  it('no longer hosts Family & Members (moved to the Family tab)', async () => {
    const { findByText, queryByText } = render(<SettingsScreen />);
    await findByText('Appearance');
    expect(queryByText('Family & Members')).toBeNull();
  });

  it('links to Appearance and Notifications', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Appearance')).toBeTruthy();
    expect(await findByText('Notifications')).toBeTruthy();
  });

  it('no longer hosts Parental Controls (now Family → Game rules)', async () => {
    const { findByText, queryByText } = render(<SettingsScreen />);
    await findByText('Appearance');
    expect(queryByText('Parental Controls')).toBeNull();
  });

  it('links to Help & Legal', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Help & Legal')).toBeTruthy();
  });

  it('shows Log Out row', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Log Out')).toBeTruthy();
  });

  it('shows sign-out confirmation alert', async () => {
    const { findByText } = render(<SettingsScreen />);
    const logoutBtn = await findByText('Log Out');
    await act(async () => { fireEvent.press(logoutBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('Log out?', expect.any(String), expect.any(Array));
  });

  it('shows Delete My Account row', async () => {
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Delete My Account')).toBeTruthy();
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

  it('does NOT show the Parental Controls row for a child', async () => {
    const SettingsScreen = require('@/app/app/tabs/settings').default;
    const { queryByText } = render(<SettingsScreen />);
    await waitFor(() => {
      expect(queryByText('Parental Controls')).toBeNull();
    });
  });

  it('still shows Log Out for child', async () => {
    const SettingsScreen = require('@/app/app/tabs/settings').default;
    const { findByText } = render(<SettingsScreen />);
    expect(await findByText('Log Out')).toBeTruthy();
  });
});
