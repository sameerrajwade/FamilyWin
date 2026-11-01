/**
 * __tests__/components/LevelFrames.test.tsx — Phase E3.
 * <Avatar memberId> draws the member's earned frame from the app-wide level
 * store; the badge appears from Lv 4. Spending never lowers the level.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';

jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: { primary: '#6C63FF', accent: '#FF6B2C', surface: '#FFFFFF', border: '#E8E8F0' },
  })),
}));

import { Avatar } from '@/components/ui';
import { useMemberLevels } from '@/lib/memberLevels';

beforeEach(() => act(() => useMemberLevels.getState().reset()));

it('no frame badge below Lv 4, badge once they reach it', () => {
  act(() => useMemberLevels.getState().setFromTransactions([{ memberId: 'vian', delta: 450, source: 'task' }])); // Lv 3
  const { queryByLabelText, rerender } = render(<Avatar emoji="🦁" size={44} memberId="vian" />);
  expect(queryByLabelText(/^Level \d/)).toBeNull();

  act(() => useMemberLevels.getState().setFromTransactions([{ memberId: 'vian', delta: 900, source: 'task' }])); // Lv 4
  rerender(<Avatar emoji="🦁" size={44} memberId="vian" />);
  expect(queryByLabelText('Level 4')).toBeTruthy();
});

it('redeeming a reward does not take the frame away', () => {
  act(() => useMemberLevels.getState().setFromTransactions([
    { memberId: 'vian', delta: 900, source: 'task' },
    { memberId: 'vian', delta: -800, source: 'redemption' },
  ]));
  const { queryByLabelText } = render(<Avatar emoji="🦁" size={44} memberId="vian" />);
  expect(queryByLabelText('Level 4')).toBeTruthy();
});

it('an avatar without memberId never shows a level badge', () => {
  act(() => useMemberLevels.getState().setFromTransactions([{ memberId: 'vian', delta: 5000, source: 'task' }]));
  const { queryByLabelText } = render(<Avatar emoji="🦁" size={44} />);
  expect(queryByLabelText(/^Level/)).toBeNull();
});
