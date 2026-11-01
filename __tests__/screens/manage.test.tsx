/**
 * __tests__/screens/manage.test.tsx — Family → Set up the game (edit anything)
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

let mockKind = 'rewards';
let mockEdit: string | undefined;
const mockRewards = [
  { id: 'r1', title: '30min Screen Time', pointCost: 30, isActive: true },
  { id: 'r2', title: 'Movie night pick', pointCost: 80, isActive: true },
];
let mockPresets: any[] = [];
const mockCol = (docs: any[]) => ({
  where: jest.fn().mockReturnThis(),
  onSnapshot: jest.fn((cb: any) => { cb({ docs: docs.map((d) => ({ id: d.id, data: () => d })) }); return jest.fn(); }),
  get: jest.fn().mockResolvedValue({ docs: docs.map((d) => ({ id: d.id, data: () => d })) }),
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ kind: mockKind, edit: mockEdit })),
}));
jest.mock('@/lib/firebase', () => ({
  Col: {
    tasks: jest.fn(() => mockCol([])),
    rewards: jest.fn(() => mockCol(mockRewards)),
    penalties: jest.fn(() => mockCol(mockPresets)),
  },
  deleteTask: jest.fn(),
  createReward: jest.fn().mockResolvedValue({ deduped: false }),
  updateReward: jest.fn().mockResolvedValue(undefined),
  deactivateReward: jest.fn().mockResolvedValue(undefined),
  createPenalty: jest.fn().mockResolvedValue(undefined),
  updatePenalty: jest.fn().mockResolvedValue(undefined),
  deletePenalty: jest.fn().mockResolvedValue(undefined),
  materializeStarterPresets: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/store', () => ({
  useAuthStore: jest.fn(() => ({ member: { id: 'm1', role: 'admin_parent' }, family: { id: 'f1' } })),
  useFamilyStore: jest.fn(() => ({ members: [] })),
}));

describe('Manage screen', () => {
  let Manage: React.ComponentType;
  beforeEach(() => {
    jest.clearAllMocks();
    mockKind = 'rewards'; mockEdit = undefined; mockPresets = [];
    Manage = require('@/app/app/manage/[kind]').default;
  });

  it('lists rewards and edits one in place (new price saved)', async () => {
    const fb = require('@/lib/firebase');
    const { findByLabelText, findByDisplayValue, findByText } = render(<Manage />);
    fireEvent.press(await findByLabelText('Edit 30min Screen Time'));
    const cost = await findByDisplayValue('30');
    fireEvent.changeText(cost, '50');
    await act(async () => { fireEvent.press(await findByText('Save')); });
    expect(fb.updateReward).toHaveBeenCalledWith('f1', 'r1', expect.objectContaining({ title: '30min Screen Time', pointCost: 50 }));
  });

  it('opens the editor straight from a long-press deep link (?edit=)', async () => {
    mockEdit = 'r2';
    const { findByText, findByDisplayValue } = render(<Manage />);
    expect(await findByText(/Edit reward/i)).toBeTruthy();
    expect(await findByDisplayValue('Movie night pick')).toBeTruthy();
  });

  it('shows starter penalties AND bonuses until the family customizes them', async () => {
    mockKind = 'penalties';
    const { findByText, findAllByText } = render(<Manage />);
    expect(await findByText('Talked back')).toBeTruthy();
    expect(await findByText('Great attitude')).toBeTruthy();
    expect((await findAllByText('Starter — tap to customize')).length).toBeGreaterThan(3);
  });

  it('editing a starter saves the whole starter list first (none disappear)', async () => {
    mockKind = 'penalties';
    const fb = require('@/lib/firebase');
    const { findByLabelText } = render(<Manage />);
    await act(async () => { fireEvent.press(await findByLabelText('Edit Great attitude')); });
    await waitFor(() => expect(fb.materializeStarterPresets).toHaveBeenCalledWith('f1', 'bonus', expect.any(Array), 'm1'));
  });

  it("blocks saving without a name or points", async () => {
    const { Alert } = require('react-native');
    jest.spyOn(Alert, 'alert');
    const { findByText } = render(<Manage />);
    await act(async () => { fireEvent.press(await findByText('＋ New')); });
    await act(async () => { fireEvent.press(await findByText('Save')); });
    expect(Alert.alert).toHaveBeenCalledWith('Add a name', expect.any(String));
  });
});
