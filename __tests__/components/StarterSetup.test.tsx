/**
 * __tests__/components/StarterSetup.test.tsx — Phase G6 easy setup.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/lib/firebase', () => ({
  applyStarterKit: jest.fn().mockResolvedValue(undefined),
  setDiscoverState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      primary: '#6C63FF', surface: '#FFFFFF', border: '#E8E8F0', text: '#111', textSecondary: '#666',
      textMuted: '#999', textAccent: '#6C63FF', background: '#F8F9FF',
    },
  })),
}));
let mockFamily: any = { id: 'f1', name: 'Fam' };
const mockSetFamily = jest.fn((f: any) => { mockFamily = f; });
jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ family: mockFamily, setFamily: mockSetFamily })),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: any[]) => mockPush(...a) } }));

import { StarterSetup } from '@/components/ui/StarterSetup';
import { DiscoverCard } from '@/components/ui/DiscoverCard';
const fb = require('@/lib/firebase');

beforeEach(() => { jest.clearAllMocks(); mockFamily = { id: 'f1', name: 'Fam' }; });

const kids = [{ id: 'vian', name: 'Vian', age: 10 }, { id: 'vayu', name: 'Vayu', age: 4 }];

it('builds a kit from the kids\' ages, lets the parent untick and add their own, then applies it', async () => {
  const onDone = jest.fn();
  const { getByText, getAllByLabelText, getByLabelText } = render(
    <StarterSetup familyId="f1" createdBy="dad" kids={kids} onDone={onDone} />,
  );
  expect(getByText('For Vian')).toBeTruthy();
  expect(getByText('For Vayu')).toBeTruthy();

  fireEvent.press(getAllByLabelText('Finish homework')[0]);            // untick one of Vian's
  fireEvent.changeText(getByLabelText('Your own task'), 'Water the plants');
  fireEvent.press(getByLabelText('Add task'));                       // "Each kid" → one copy per kid
  fireEvent.press(getByText('Start with this setup'));

  await waitFor(() => expect(fb.applyStarterKit).toHaveBeenCalled());
  const arg = fb.applyStarterKit.mock.calls[0][0];
  const titles = arg.tasks.map((t: any) => `${t.assignedTo}:${t.title}`);
  expect(titles).not.toContain('vian:Finish homework');
  expect(titles).toEqual(expect.arrayContaining(['vian:Water the plants', 'vayu:Water the plants', 'vayu:Brush my teeth', 'null:Family dinner together']));
  expect(arg.rewards).toHaveLength(4);
  expect(arg.autoApproveUnder).toBe(10);

  // Discover stage: mark one "Not for us", then skip for now.
  await waitFor(() => expect(getByText('There\'s more when you\'re ready')).toBeTruthy());
  fireEvent.press(getByLabelText('Pocket money: remind me later. Tap if not for us'));
  fireEvent.press(getByText('Skip for now — start playing 🏆'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  const state = fb.setDiscoverState.mock.calls[0][1];
  expect(state.allowance).toEqual({ status: 'no' });
  expect(state.goal.status).toBe('later');
});

it('"Skip — I\'ll set it up myself" adds nothing but still offers Discover more', async () => {
  const { getByText } = render(<StarterSetup familyId="f1" createdBy="dad" kids={kids} onDone={jest.fn()} />);
  fireEvent.press(getByText('Skip — I\'ll set it up myself'));
  await waitFor(() => expect(getByText('There\'s more when you\'re ready')).toBeTruthy());
  expect(fb.applyStarterKit).not.toHaveBeenCalled();
});

it('Discover card: shows a due feature; Not now snoozes it; Set it up opens the screen', () => {
  const due = Date.now() - 1000;
  mockFamily = { id: 'f1', discover: { goal: { status: 'later', until: due }, kidmode: { status: 'later', until: due } } };
  const { getByText, rerender } = render(<DiscoverCard />);
  expect(getByText('A family goal')).toBeTruthy();
  fireEvent.press(getByText('Not now'));
  expect(fb.setDiscoverState.mock.calls[0][1].goal.until).toBeGreaterThan(Date.now());

  rerender(<DiscoverCard />);
  expect(getByText('Kid Mode')).toBeTruthy();       // the snoozed one steps aside
  fireEvent.press(getByText('See Kid Mode'));
  expect(mockPush).toHaveBeenCalledWith('/app/tabs/family');
});

it('no Discover card for families without a schedule (set up before G6)', () => {
  mockFamily = { id: 'f1' };
  const { toJSON } = render(<DiscoverCard />);
  expect(toJSON()).toBeNull();
});
