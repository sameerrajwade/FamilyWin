/**
 * __tests__/screens/add-child.test.tsx
 * Tests the Add Managed Child screen — the key new feature.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockFamily = { id: 'f1', name: 'Smith Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockParent = { id: 'm1', familyId: 'f1', userId: 'u1', displayName: 'Dad', role: 'admin_parent' as const, avatarEmoji: '🦁', createdAt: {} };

jest.mock('@/lib/firebase', () => ({
  createManagedMember: jest.fn().mockResolvedValue({
    id: 'm-new',
    familyId: 'f1',
    userId: '',
    displayName: 'Tommy',
    role: 'child',
    avatarEmoji: '🦊',
    isManaged: true,
    createdAt: {},
  }),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ family: mockFamily })),
  useFamilyStore: jest.fn(() => ({
    members: [mockParent],
    setMembers: jest.fn(),
  })),
}));

jest.spyOn(Alert, 'alert');

describe('AddChildScreen', () => {
  let AddChildScreen: React.ComponentType;

  beforeEach(() => {
    jest.clearAllMocks();
    AddChildScreen = require('@/app/app/member/add-child').default;
  });

  it('renders Add a Child Profile title', async () => {
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText('Add a Child Profile')).toBeTruthy();
  });

  it('shows no-phone-needed subtitle', async () => {
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText(/No phone needed/)).toBeTruthy();
  });

  it('renders avatar picker row', async () => {
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText('Pick an Avatar')).toBeTruthy();
  });

  it("renders Child's Name input", async () => {
    const { findByPlaceholderText } = render(<AddChildScreen />);
    expect(await findByPlaceholderText('e.g. Tommy, Emma...')).toBeTruthy();
  });

  it('renders Age optional input', async () => {
    const { findByPlaceholderText } = render(<AddChildScreen />);
    expect(await findByPlaceholderText('e.g. 8')).toBeTruthy();
  });

  it('shows How this works info box', async () => {
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText('How this works')).toBeTruthy();
  });

  it('shows preview card when name is entered', async () => {
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);
    const input = await findByPlaceholderText('e.g. Tommy, Emma...');
    await act(async () => { fireEvent.changeText(input, 'Tommy'); });
    expect(await findByText('Tommy')).toBeTruthy();
  });

  it('shows error when name is empty on save', async () => {
    const { findByText } = render(<AddChildScreen />);
    const saveBtn = await findByText(/Add .* to Family/);
    await act(async () => { fireEvent.press(saveBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('Missing Name', expect.any(String));
  });

  it('calls createManagedMember with correct data', async () => {
    const { createManagedMember } = require('@/lib/firebase');
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);
    const nameInput = await findByPlaceholderText('e.g. Tommy, Emma...');
    const ageInput = await findByPlaceholderText('e.g. 8');
    await act(async () => {
      fireEvent.changeText(nameInput, 'Tommy');
      fireEvent.changeText(ageInput, '8');
    });
    const saveBtn = await findByText('Add Tommy to Family 🎉');
    await act(async () => { fireEvent.press(saveBtn); });
    expect(createManagedMember).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'f1',
        displayName: 'Tommy',
        age: 8,
      })
    );
  });

  it('shows success alert after adding child', async () => {
    const { findByPlaceholderText, findByText } = render(<AddChildScreen />);
    const nameInput = await findByPlaceholderText('e.g. Tommy, Emma...');
    await act(async () => { fireEvent.changeText(nameInput, 'Tommy'); });
    const saveBtn = await findByText('Add Tommy to Family 🎉');
    await act(async () => { fireEvent.press(saveBtn); });
    expect(Alert.alert).toHaveBeenCalledWith('👶 Child Added!', expect.any(String), expect.any(Array));
  });

  it('renders Cancel button', async () => {
    const { findByText } = render(<AddChildScreen />);
    expect(await findByText('Cancel')).toBeTruthy();
  });
});
