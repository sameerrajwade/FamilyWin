/**
 * __tests__/screens/family-tab.test.tsx — Family tab (people + the game)
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockFamily = { id: 'f1', name: 'Rajwade Family', inviteCode: 'XK7P2Q', weekStartDay: 1, createdAt: {} };
const mockParent = { id: 'm1', displayName: 'Sameer', role: 'admin_parent', avatarEmoji: '🦁' };
const mockKid = { id: 'm3', displayName: 'Vian', role: 'child', isManaged: true, avatarEmoji: '🦊' };
const mockMembers = [mockParent, { id: 'm2', displayName: 'Asmita', role: 'parent', avatarEmoji: '🐸' }, mockKid];
let mockMe: any = mockParent;
let mockMode: any;

const mockSnap = (docs: any[]) => ({
  where: jest.fn().mockReturnThis(),
  onSnapshot: jest.fn((cb: any) => { cb({ docs, size: docs.length }); return jest.fn(); }),
  get: jest.fn().mockResolvedValue({ docs }),
});

jest.mock('@/lib/firebase', () => ({
  getCurrentWeekId: jest.fn(() => '2026-W45'),
  setFamilyGoal: jest.fn(),
  Col: {
    completions: jest.fn(() => mockSnap([{ id: 'c1' }, { id: 'c2' }])), // 2 pending
    transactions: jest.fn(() => mockSnap([])),
  },
}));
jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: mockMe, family: { ...mockFamily, competitionMode: mockMode }, setFamily: jest.fn() })),
  useFamilyStore: jest.fn(() => ({ members: mockMembers })),
}));
jest.mock('@/lib/kidMode', () => ({ useKidMode: { getState: () => ({ enter: jest.fn() }) } }));

describe('Family tab', () => {
  let FamilyTab: React.ComponentType;
  beforeEach(() => {
    jest.clearAllMocks();
    mockMe = mockParent; mockMode = undefined;
    FamilyTab = require('@/app/app/tabs/family').default;
  });

  it('shows the family, its members and their roles', async () => {
    const { findByText } = render(<FamilyTab />);
    expect(await findByText('Rajwade Family')).toBeTruthy();
    expect(await findByText('Vian')).toBeTruthy();
    // E3: the role line also carries the lifetime level title.
    expect(await findByText('Player · Lv 1 Rookie')).toBeTruthy();
    expect(await findByText('Sameer (you)')).toBeTruthy();
  });

  it('labels parents as competing by default, coaches in kids-only mode', async () => {
    const a = render(<FamilyTab />);
    expect((await a.findAllByText(/^Parent · competing · Lv \d/)).length).toBe(2);
    a.unmount();
    mockMode = 'kids';
    const b = render(<FamilyTab />);
    expect((await b.findAllByText(/^Coach · Lv \d/)).length).toBe(2);
  });

  it('surfaces everything waiting (tasks + rewards) with the same count as the badge', async () => {
    const { usePending } = require('@/lib/pending');
    usePending.getState().set({ claims: 2, rewards: 1 });
    const { findByText } = render(<FamilyTab />);
    expect(await findByText('2 tasks · 1 reward waiting for your OK')).toBeTruthy();
  });

  it('gives parents the game setup: tasks, rewards, penalties, rules, history', async () => {
    const { router } = require('expo-router');
    const { findByLabelText, findByText } = render(<FamilyTab />);
    fireEvent.press(await findByLabelText('Edit Rewards'));
    expect(router.push).toHaveBeenCalledWith('/app/manage/rewards');
    expect(await findByText('Game rules')).toBeTruthy();
    expect(await findByText('Points history')).toBeTruthy();
  });

  it('hides parent tools from kids', async () => {
    mockMe = { ...mockKid, isManaged: false };
    const { findByText, queryByText } = render(<FamilyTab />);
    expect(await findByText('Members')).toBeTruthy();
    expect(queryByText('Set up the game')).toBeNull();
    expect(queryByText('Game rules')).toBeNull();
  });
});
