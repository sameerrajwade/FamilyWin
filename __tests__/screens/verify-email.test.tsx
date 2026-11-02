/**
 * "Check your email" — new email accounts wait here until the link is tapped.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';

const mockReload = jest.fn();
const mockSendVerify = jest.fn(() => Promise.resolve());
jest.mock('@/lib/fb', () => ({
  auth: () => ({ currentUser: { email: 'new@family.com' }, reloadCurrentUser: mockReload, sendEmailVerification: mockSendVerify }),
}));
jest.mock('@/lib/firebase', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

import VerifyEmailScreen from '@/app/auth/verify-email';

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });

it('shows where the link went and moves on once the email is verified', async () => {
  mockReload.mockResolvedValue({ emailVerified: true });
  const { getByText } = render(<VerifyEmailScreen />);
  expect(getByText('new@family.com')).toBeTruthy();
  await act(async () => { fireEvent.press(getByText('I’ve verified it')); });
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/onboarding'));
});

it('stays put (and says so) while the email is not verified', async () => {
  mockReload.mockResolvedValue({ emailVerified: false });
  const { getByText } = render(<VerifyEmailScreen />);
  await act(async () => { fireEvent.press(getByText('I’ve verified it')); });
  expect(router.replace).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Not verified yet', expect.stringContaining('new@family.com'));
});

it('resend waits for the cool-down (the sign-up already sent one)', () => {
  const { getByText } = render(<VerifyEmailScreen />);
  fireEvent.press(getByText(/Resend the email in \d+s/));
  expect(mockSendVerify).not.toHaveBeenCalled();
});
