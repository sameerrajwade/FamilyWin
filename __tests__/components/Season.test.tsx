/**
 * __tests__/components/Season.test.tsx — Phase F1 season card on Scores.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';

jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      primary: '#6C63FF', accent: '#FF6B2C', surface: '#FFFFFF', border: '#E8E8F0', text: '#111',
      textSecondary: '#666', textMuted: '#999', textAccent: '#6C63FF',
    },
  })),
}));

const members = [
  { id: 'vian', displayName: 'Vian', role: 'child', isManaged: true, avatarEmoji: '🦁' },
  { id: 'vayu', displayName: 'Vayu', role: 'child', isManaged: true, avatarEmoji: '🐼' },
];
jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ family: { id: 'f1', weekStartDay: 1, competitionMode: 'everyone' } })),
  useFamilyStore: jest.fn(() => ({ members })),
}));

import { SeasonCard } from '@/components/ui/Season';
import { useMemberLevels } from '@/lib/memberLevels';
import { seasonFor } from '@/lib/seasons';

const ts = (d: Date) => ({ toDate: () => d });

it('shows the season, the week and the standings (spending excluded)', () => {
  const s = seasonFor(new Date());
  const inSeason = new Date(s.start.getTime() + 36 * 3600_000);
  act(() => useMemberLevels.getState().setFromTransactions([
    { memberId: 'vian', delta: 120, source: 'task', createdAt: ts(inSeason) },
    { memberId: 'vian', delta: -100, source: 'redemption', createdAt: ts(inSeason) },
    { memberId: 'vayu', delta: 60, source: 'task', createdAt: ts(inSeason) },
  ]));
  const { getByText } = render(<SeasonCard />);
  expect(getByText(`Season ${s.number}`)).toBeTruthy();
  expect(getByText(new RegExp(`^Week ${s.week} of 4`))).toBeTruthy();
  expect(getByText(/^120/)).toBeTruthy();   // Vian's season points ignore the reward spend
  expect(getByText(/^60/)).toBeTruthy();
});
