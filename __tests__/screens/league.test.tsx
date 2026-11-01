/**
 * __tests__/screens/league.test.tsx — Phase G7 family league screen.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

let mockLeagueData: any = null;
jest.mock('@/lib/leagues', () => {
  const actual = jest.requireActual('@/lib/leagues');
  return {
    ...actual,
    createLeague: jest.fn().mockResolvedValue({ leagueId: 'L1', inviteCode: 'ABC234' }),
    joinLeague: jest.fn().mockResolvedValue({ leagueId: 'L9', joined: true }),
    leaveLeague: jest.fn().mockResolvedValue(undefined),
    watchLeague: jest.fn((_id: string, cb: (l: any) => void) => { cb(mockLeagueData); return jest.fn(); }),
  };
});
jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      primary: '#6C63FF', accent: '#FF6B2C', surface: '#FFFFFF', border: '#E8E8F0', text: '#111', textSecondary: '#666',
      textMuted: '#999', textAccent: '#6C63FF', textDanger: '#C00', danger: '#F00', background: '#F8F9FF',
    },
  })),
}));
jest.mock('@/components/ui/ScreenHeader', () => ({ ScreenHeader: ({ title }: any) => { const { Text } = require('react-native'); return <Text>{title}</Text>; } }));

let mockAuth: any;
const mockSetFamily = jest.fn((f: any) => { mockAuth.family = f; });
jest.mock('@/store', () => ({ useAuthStore: jest.fn(() => mockAuth) }));

import LeagueScreen from '@/app/app/league';
import { seasonFor } from '@/lib/seasons';
const leagues = require('@/lib/leagues');

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { family: { id: 'famA', name: 'Rajwades' }, member: { id: 'dad', role: 'admin_parent' }, setFamily: mockSetFamily };
  mockLeagueData = null;
});

it('a parent with no league can start one', async () => {
  const { getByLabelText } = render(<LeagueScreen />);
  fireEvent.changeText(getByLabelText('League name'), 'Cousins Cup');
  fireEvent.press(getByLabelText('Start a league'));
  await waitFor(() => expect(leagues.createLeague).toHaveBeenCalledWith('Cousins Cup'));
  expect(mockSetFamily).toHaveBeenCalledWith(expect.objectContaining({ leagueIds: ['L1'] }));
});

it('a parent can join with a code (typed in lower case)', async () => {
  const { getByLabelText } = render(<LeagueScreen />);
  fireEvent.changeText(getByLabelText('League code'), 'abc234');
  fireEvent.press(getByLabelText('Join league'));
  await waitFor(() => expect(leagues.joinLeague).toHaveBeenCalledWith('ABC234'));
});

it('in a league: the table ranks by average per player and highlights your family', () => {
  const season = seasonFor(new Date(), 1).number;
  mockAuth.family.leagueIds = ['L1'];
  mockLeagueData = {
    id: 'L1', name: 'Cousins Cup', inviteCode: 'ABC234', familyIds: ['famA', 'famB'],
    rows: [
      { familyId: 'famB', familyName: 'The Patels', season, points: 300, players: 4, avgPoints: 75 },
      { familyId: 'famA', familyName: 'Rajwades', season, points: 200, players: 2, avgPoints: 100 },
    ],
  };
  const { getByText, getByLabelText } = render(<LeagueScreen />);
  expect(getByText('Cousins Cup')).toBeTruthy();
  expect(getByLabelText('1. Rajwades (your family), 100 points per player')).toBeTruthy();
  expect(getByLabelText('2. The Patels, 75 points per player')).toBeTruthy();
  expect(getByText('ABC234')).toBeTruthy();
});

it('a kid without a league is told to ask a parent (no create/join)', () => {
  mockAuth.member = { id: 'kid', role: 'child' };
  const { getByText, queryByLabelText } = render(<LeagueScreen />);
  expect(getByText('No league yet')).toBeTruthy();
  expect(queryByLabelText('Start a league')).toBeNull();
});
