/**
 * __tests__/components/ProfileSwitcher.test.tsx
 * Tests the ProfileSwitcher banner and modal — the managed child proxy feature.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockMember = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} };
const managedChild = { id: 'm2', familyId: 'f1', userId: '', displayName: 'Tommy', role: 'child' as const, avatarEmoji: '🦊', isManaged: true, createdAt: {} };
const managedChild2 = { id: 'm3', familyId: 'f1', userId: '', displayName: 'Emma', role: 'child' as const, avatarEmoji: '🐼', isManaged: true, createdAt: {} };

const mockSetActingAsMember = jest.fn();

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({
    member: mockMember,
    actingAsMember: managedChild,
    setActingAsMember: mockSetActingAsMember,
  })),
  useFamilyStore: jest.fn(() => ({
    members: [mockMember, managedChild, managedChild2],
  })),
}));

import { ProfileSwitcherBanner, ProfilePickerModal } from '@/components/ui/ProfileSwitcher';

// ─── Banner ───────────────────────────────────────────────────────────────────
describe('ProfileSwitcherBanner', () => {
  it('renders banner when actingAsMember is set', () => {
    const { getByText } = render(<ProfileSwitcherBanner onPress={jest.fn()} />);
    expect(getByText('Acting as')).toBeTruthy();
    expect(getByText('Tommy')).toBeTruthy();
  });

  it('shows Switch button', () => {
    const { getByText } = render(<ProfileSwitcherBanner onPress={jest.fn()} />);
    expect(getByText('Switch 🔄')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<ProfileSwitcherBanner onPress={onPress} />);
    fireEvent.press(getByText('Switch 🔄'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does NOT render when actingAsMember is null', () => {
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValueOnce({
      member: mockMember, actingAsMember: null, setActingAsMember: mockSetActingAsMember,
    });
    const { queryByText } = render(<ProfileSwitcherBanner onPress={jest.fn()} />);
    expect(queryByText('Acting as')).toBeNull();
  });
});

// ─── Picker Modal ─────────────────────────────────────────────────────────────
describe('ProfilePickerModal', () => {
  it('renders when visible is true', () => {
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    expect(getByText("Whose tasks are you doing?")).toBeTruthy();
  });

  it('shows Myself row for the parent', () => {
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    expect(getByText('Myself')).toBeTruthy();
  });

  it('shows all managed children', () => {
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    expect(getByText('Tommy')).toBeTruthy();
    expect(getByText('Emma')).toBeTruthy();
  });

  it('shows checkmark on currently active profile', () => {
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    // Tommy is currently active (actingAsMember = managedChild)
    expect(getByText('✓')).toBeTruthy();
  });

  it('shows managed profile badge for children', () => {
    const { getAllByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    const managedBadges = getAllByText('👶 Managed profile');
    expect(managedBadges.length).toBe(2);
  });

  it('calls setActingAsMember(null) when Myself is selected', async () => {
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    await act(async () => { fireEvent.press(getByText('Myself')); });
    expect(mockSetActingAsMember).toHaveBeenCalledWith(null);
  });

  it('calls setActingAsMember with child when child is selected', async () => {
    // Set actingAsMember to null so Tommy is not currently active
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValueOnce({
      member: mockMember,
      actingAsMember: null,
      setActingAsMember: mockSetActingAsMember,
    });
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    await act(async () => { fireEvent.press(getByText('Tommy')); });
    expect(mockSetActingAsMember).toHaveBeenCalledWith(managedChild);
  });

  it('calls onClose after selection', async () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={onClose} />
    );
    await act(async () => { fireEvent.press(getByText('Myself')); });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render for child users', () => {
    const { useAuthStore } = require('@/store');
    (useAuthStore as jest.Mock).mockReturnValueOnce({
      member: { ...mockMember, role: 'child' },
      actingAsMember: null,
      setActingAsMember: mockSetActingAsMember,
    });
    const { queryByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    expect(queryByText("Whose tasks are you doing?")).toBeNull();
  });

  it('shows empty hint when no managed children', () => {
    const { useFamilyStore } = require('@/store');
    (useFamilyStore as jest.Mock).mockReturnValueOnce({ members: [mockMember] });
    const { getByText } = render(
      <ProfilePickerModal visible={true} onClose={jest.fn()} />
    );
    expect(getByText(/No managed children yet/)).toBeTruthy();
  });
});
