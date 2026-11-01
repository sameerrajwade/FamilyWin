/**
 * __tests__/components/BountyBoard.test.tsx — Phase E4 bounty board behaviour.
 * The Firestore side (lib/bounties) is mocked; this checks which call each
 * role makes: a kid claims (waits for OK), a parent approves a claim, and a
 * parent marking it done for a kid awards it directly.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

let mockBounties: any[] = [];
jest.mock('@/lib/bounties', () => ({
  watchBounties: jest.fn((_f: string, cb: (b: any[]) => void) => { cb(mockBounties); return jest.fn(); }),
  postBounty: jest.fn().mockResolvedValue('new'),
  claimBounty: jest.fn().mockResolvedValue(undefined),
  releaseBounty: jest.fn().mockResolvedValue(undefined),
  awardBounty: jest.fn().mockResolvedValue('kid'),
  deleteBounty: jest.fn().mockResolvedValue(undefined),
  BountyTakenError: class extends Error {},
}));

jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      primary: '#6C63FF', background: '#F8F9FF', surface: '#FFFFFF', text: '#1A1A2E',
      textSecondary: '#666', textMuted: '#999', textAccent: '#6C63FF', success: '#43D98F',
      danger: '#FF5C5C', warning: '#FFB347', border: '#E8E8F0',
    },
  })),
}));

import { BountyBoard } from '@/components/ui/BountyBoard';
const bounties = require('@/lib/bounties');

const members = [{ id: 'dad', displayName: 'Sameer R' }, { id: 'kid', displayName: 'Vian' }];
const open = { id: 'b1', title: 'Wash the car', points: 100, status: 'open', createdBy: 'dad', claimedBy: null };

beforeEach(() => jest.clearAllMocks());

it('a kid claims an open bounty — it waits for a parent', async () => {
  mockBounties = [open];
  const { getByText } = render(
    <BountyBoard familyId="f1" actor={{ id: 'kid', displayName: 'Vian' }} viewerId="kid" canManage={false} needsOk members={members} />,
  );
  fireEvent.press(getByText('I did it!'));
  await waitFor(() => expect(bounties.claimBounty).toHaveBeenCalledWith({ familyId: 'f1', bountyId: 'b1', memberId: 'kid' }));
  expect(bounties.awardBounty).not.toHaveBeenCalled();
});

it('the poster cannot claim their own bounty', () => {
  mockBounties = [open];
  const { queryByText } = render(
    <BountyBoard familyId="f1" actor={{ id: 'dad' }} viewerId="dad" canManage needsOk={false} members={members} />,
  );
  expect(queryByText('I did it!')).toBeNull();
});

it('a parent approves a claimed bounty', async () => {
  mockBounties = [{ ...open, status: 'claimed', claimedBy: 'kid' }];
  const { getByText } = render(
    <BountyBoard familyId="f1" actor={{ id: 'dad' }} viewerId="dad" canManage needsOk={false} members={members} />,
  );
  expect(getByText("⏳ Vian says it's done · +100")).toBeTruthy();
  fireEvent.press(getByText('✓ OK'));
  await waitFor(() => expect(bounties.awardBounty).toHaveBeenCalledWith({ familyId: 'f1', bountyId: 'b1', approvedBy: 'dad' }));
});

it('a parent on a kid profile awards it straight to the kid', async () => {
  mockBounties = [open];
  const { getByText } = render(
    <BountyBoard familyId="f1" actor={{ id: 'kid', displayName: 'Vian' }} viewerId="dad" canManage needsOk={false} members={members} />,
  );
  fireEvent.press(getByText('Vian did it'));
  await waitFor(() => expect(bounties.awardBounty).toHaveBeenCalledWith({ familyId: 'f1', bountyId: 'b1', approvedBy: 'dad', memberId: 'kid' }));
});

it('hides the whole board for a kid when there are no bounties', () => {
  mockBounties = [];
  const { queryByText } = render(
    <BountyBoard familyId="f1" actor={{ id: 'kid' }} viewerId="kid" canManage={false} needsOk members={members} />,
  );
  expect(queryByText('Bounties')).toBeNull();
});
