/**
 * __tests__/screens/auth.test.tsx
 * Tests for Login, Register, and Splash screens.
 * Uses module-level mocks (no resetModules) for reliability.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ─── Module-level mocks ───────────────────────────────────────────────────────

const mockSignIn = jest.fn().mockResolvedValue({});
const mockSignUp = jest.fn().mockResolvedValue({});
const mockSignInWithGoogle = jest.fn().mockResolvedValue({ success: true, isNewUser: false });

jest.mock('@/lib/firebase', () => ({
  signIn: (...args: any[]) => mockSignIn(...args),
  signUp: (...args: any[]) => mockSignUp(...args),
  createFamily: jest.fn().mockResolvedValue({ id: 'f1', inviteCode: 'XK7P2Q', name: 'Test Family', weekStartDay: 1, createdAt: {} }),
  getFamilyByInviteCode: jest.fn().mockResolvedValue({ id: 'f1', inviteCode: 'XK7P2Q', name: 'Test Family', weekStartDay: 1, createdAt: {} }),
  createMember: jest.fn().mockResolvedValue({ id: 'm1', displayName: 'Dad', role: 'admin_parent', avatarEmoji: '🦁', familyId: 'f1', userId: 'u1', createdAt: {} }),
  upsertNotifConfig: jest.fn().mockResolvedValue(undefined),
  auth: jest.fn(() => ({ currentUser: { uid: 'u1', displayName: 'Dad' } })),
}));

jest.mock('@/lib/googleAuth', () => ({
  signInWithGoogle: (...args: any[]) => mockSignInWithGoogle(...args),
  configureGoogleSignIn: jest.fn(),
}));

jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({
    user: null, member: null, family: null,
    setUser: jest.fn(), setMember: jest.fn(), setFamily: jest.fn(),
    actingAsMember: null,
  })),
  useFamilyStore: jest.fn(() => ({ members: [], setMembers: jest.fn() })),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

// ─── Import screens at module level (no resetModules) ─────────────────────────
import LoginScreen from '@/app/auth/login';
import RegisterScreen from '@/app/auth/register';
import SplashScreen from '@/app/auth/splash';

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email and password fields', () => {
    const { getByPlaceholderText } = render(<LoginScreen />);
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('••••••••')).toBeTruthy();
  });

  it('renders Sign In button', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('renders Google Sign-In button', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders link to Sign Up', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('renders FamilyWin branding', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('FamilyWin')).toBeTruthy();
  });

  it('shows error alert when fields are empty', async () => {
    const { getByText } = render(<LoginScreen />);
    await act(async () => { fireEvent.press(getByText('Sign In')); });
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Please fill in all fields');
  });

  it('shows password toggle button', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('👁️')).toBeTruthy();
  });

  it('calls signIn with email and password', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
      fireEvent.changeText(getByPlaceholderText('••••••••'), 'password123');
    });
    await act(async () => { fireEvent.press(getByText('Sign In')); });
    expect(mockSignIn).toHaveBeenCalledWith('test@test.com', 'password123');
  });

  it('calls signInWithGoogle when Google button pressed', async () => {
    const { getByText } = render(<LoginScreen />);
    await act(async () => { fireEvent.press(getByText('Continue with Google')); });
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('shows error when sign in fails', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'));
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'bad@test.com');
      fireEvent.changeText(getByPlaceholderText('••••••••'), 'wrongpass');
    });
    await act(async () => { fireEvent.press(getByText('Sign In')); });
    expect(Alert.alert).toHaveBeenCalledWith('Login Failed', expect.any(String));
  });
});

// ─── REGISTER SCREEN ──────────────────────────────────────────────────────────
describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email, password, and confirm password fields', () => {
    const { getByPlaceholderText } = render(<RegisterScreen />);
    expect(getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(getByPlaceholderText('Min. 6 characters')).toBeTruthy();
    expect(getByPlaceholderText('Repeat your password')).toBeTruthy();
  });

  it('renders Google Sign-In button prominently', () => {
    const { getByText } = render(<RegisterScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders Create Account button', () => {
    const { getByText } = render(<RegisterScreen />);
    expect(getByText('Create Account →')).toBeTruthy();
  });

  it('renders link to Sign In', () => {
    const { getByText } = render(<RegisterScreen />);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('shows error when fields are empty', async () => {
    const { getByText } = render(<RegisterScreen />);
    await act(async () => { fireEvent.press(getByText('Create Account →')); });
    expect(Alert.alert).toHaveBeenCalledWith('Missing Fields', 'Please fill in all fields.');
  });

  it('shows error when passwords do not match', async () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
      fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'password123');
      fireEvent.changeText(getByPlaceholderText('Repeat your password'), 'different456');
    });
    await act(async () => { fireEvent.press(getByText('Create Account →')); });
    expect(Alert.alert).toHaveBeenCalledWith('Password Mismatch', 'Passwords do not match.');
  });

  it('shows error for password under 6 chars', async () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
      fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), '123');
      fireEvent.changeText(getByPlaceholderText('Repeat your password'), '123');
    });
    await act(async () => { fireEvent.press(getByText('Create Account →')); });
    expect(Alert.alert).toHaveBeenCalledWith('Weak Password', 'Password must be at least 6 characters.');
  });

  it('calls signUp with valid credentials', async () => {
    const { getByPlaceholderText, getByText } = render(<RegisterScreen />);
    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@test.com');
      fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'password123');
      fireEvent.changeText(getByPlaceholderText('Repeat your password'), 'password123');
    });
    await act(async () => { fireEvent.press(getByText('Create Account →')); });
    expect(mockSignUp).toHaveBeenCalledWith('test@test.com', 'password123');
  });

  it('calls signInWithGoogle for Google button', async () => {
    const { getByText } = render(<RegisterScreen />);
    await act(async () => { fireEvent.press(getByText('Continue with Google')); });
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });
});

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
describe('SplashScreen', () => {
  it('renders the first slide title', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText('Welcome to\nFamilyWin!')).toBeTruthy();
  });

  it('renders feature chips on first slide', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText('📋 Assign tasks')).toBeTruthy();
    expect(getByText('⭐ Earn points')).toBeTruthy();
    expect(getByText('🏅 Win the week')).toBeTruthy();
  });

  it('renders Skip button', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText('Skip')).toBeTruthy();
  });

  it('renders Next → button', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText('Next →')).toBeTruthy();
  });

  it('renders the trophy emoji', () => {
    const { getByText } = render(<SplashScreen />);
    expect(getByText('🏆')).toBeTruthy();
  });
});
