/**
 * __tests__/components/TwistBanner.test.tsx — the weekly twist stays quiet:
 * one explanation pop-up per week, then a single line on Today with an ✕ that
 * hides it for the rest of the week (user feedback 2026-11-01).
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({ colors: { primary: '#6C63FF', surface: '#FFF', border: '#EEE', text: '#111', textSecondary: '#666', textMuted: '#777', textAccent: '#6C63FF' } })),
}));
jest.mock('@/store', () => ({
  // 2026-10-26 is a Team week (rotation), so a twist is always on for this family.
  useAuthStore: jest.fn(() => ({ family: { id: 'f1', weekStartDay: 1 }, member: { id: 'mom', role: 'admin_parent' }, setFamily: jest.fn() })),
  useFamilyStore: jest.fn(() => ({ members: [{ id: 'mom', role: 'admin_parent' }, { id: 'vian', role: 'child', isManaged: true }] })),
}));
jest.mock('@/lib/firebase', () => ({
  getTodayDateString: jest.fn(() => '2026-10-28'),
  setEngagementSettings: jest.fn(() => Promise.resolve()),
}));

import { TwistBanner } from '@/components/ui/TwistBanner';

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

it('explains the twist in plain words once, the first time Today opens that week', async () => {
  const first = render(<TwistBanner dismissible showIntro />);
  expect(await first.findByText('THIS WEEK’S TWIST')).toBeTruthy();
  expect(first.getByText(/two teams: kids vs grown-ups/)).toBeTruthy();
  fireEvent.press(first.getByText('Got it'));
  first.unmount();

  const again = render(<TwistBanner dismissible showIntro />);
  expect(await again.findByText(/This week: Team week/)).toBeTruthy();
  expect(again.queryByText('THIS WEEK’S TWIST')).toBeNull();
});

it('the ✕ hides the line for the rest of the week', async () => {
  store['twist_intro_2026-10-26'] = '1';
  const a = render(<TwistBanner dismissible showIntro />);
  fireEvent.press(await a.findByLabelText('Hide this week\'s twist'));
  await waitFor(() => expect(a.queryByText(/This week: Team week/)).toBeNull());
  a.unmount();
  const b = render(<TwistBanner dismissible showIntro />);
  await new Promise((r) => setTimeout(r, 0));
  expect(b.queryByText(/This week: Team week/)).toBeNull();
});

it('on Scores the line stays (no ✕) and shows the team totals', async () => {
  const s = render(<TwistBanner totals={{ mom: 30, vian: 45 }} />);
  expect(await s.findByText('Kids 45 · Grown-ups 30')).toBeTruthy();
  expect(s.queryByLabelText('Hide this week\'s twist')).toBeNull();
});
