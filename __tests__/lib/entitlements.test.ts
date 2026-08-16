/**
 * __tests__/lib/entitlements.test.ts
 * Covers the monetization entitlement layer in BOTH states:
 *   • free-for-all (MONETIZATION_ENABLED = false, the shipped default)
 *   • paid (switch flipped on) — exercised via module mock, so the day we go
 *     paid the gating math is already proven.
 */
import { isPlus, hasFeature, memberLimit, rewardLimit, historyWeeksLimit } from '@/lib/entitlements';
import { FREE_LIMITS } from '@/constants/plans';

const plusFamily = { plan: 'plus' as const, planExpiresAt: null };
const freeFamily = { plan: 'free' as const, planExpiresAt: null };

describe('entitlements — free-for-all (monetization OFF)', () => {
  it('treats everyone as Plus, even a free/absent plan', () => {
    expect(isPlus(freeFamily)).toBe(true);
    expect(isPlus(null)).toBe(true);
    expect(isPlus(undefined)).toBe(true);
  });

  it('unlocks every feature', () => {
    expect(hasFeature(null, 'photo_proof')).toBe(true);
    expect(hasFeature(freeFamily, 'unlimited_members')).toBe(true);
  });

  it('lifts all limits to Infinity', () => {
    expect(memberLimit(freeFamily)).toBe(Infinity);
    expect(rewardLimit(null)).toBe(Infinity);
    expect(historyWeeksLimit(freeFamily)).toBe(Infinity);
  });
});

describe('entitlements — paid mode (monetization ON, via mock)', () => {
  const makeExp = (msFromNow: number) => ({ toDate: () => new Date(Date.now() + msFromNow) });

  function loadPaid() {
    let mod!: typeof import('@/lib/entitlements');
    jest.isolateModules(() => {
      jest.doMock('@/constants/plans', () => ({
        MONETIZATION_ENABLED: true,
        FREE_LIMITS: { maxMembers: 4, maxActiveRewards: 3, historyWeeks: 2 },
      }));
      mod = require('@/lib/entitlements');
    });
    return mod;
  }

  afterEach(() => jest.resetModules());

  it('a plus family is entitled; a free/absent one is not', () => {
    const e = loadPaid();
    expect(e.isPlus(plusFamily)).toBe(true);
    expect(e.isPlus(freeFamily)).toBe(false);
    expect(e.isPlus(null)).toBe(false);
  });

  it('respects plan expiry (expired plus = not entitled; future = entitled)', () => {
    const e = loadPaid();
    expect(e.isPlus({ plan: 'plus', planExpiresAt: makeExp(-1000) as any })).toBe(false);
    expect(e.isPlus({ plan: 'plus', planExpiresAt: makeExp(+60_000) as any })).toBe(true);
    expect(e.isPlus({ plan: 'plus', planExpiresAt: null })).toBe(true); // no expiry = lifetime
  });

  it('applies free-tier caps to non-plus families', () => {
    const e = loadPaid();
    expect(e.memberLimit(freeFamily)).toBe(FREE_LIMITS.maxMembers);
    expect(e.rewardLimit(freeFamily)).toBe(FREE_LIMITS.maxActiveRewards);
    expect(e.historyWeeksLimit(freeFamily)).toBe(FREE_LIMITS.historyWeeks);
    // plus family stays uncapped
    expect(e.memberLimit(plusFamily)).toBe(Infinity);
  });
});
