/**
 * lib/entitlements.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for "is this family entitled to X".
 *
 * While MONETIZATION_ENABLED is false, EVERY check returns "unlocked" — the app
 * is free for all. When it's flipped on, these read the family's plan (which is
 * written server-side; the client never trusts a client-set plan field).
 * Gating everywhere routes through here, so enabling paid is a one-flag change.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { MONETIZATION_ENABLED, FREE_LIMITS, type FeatureKey } from '@/constants/plans';
import type { FamilyDoc } from '@/lib/firebase';

type FamilyLike = Pick<FamilyDoc, 'plan' | 'planExpiresAt'> | null | undefined;

/** True if the family currently has Plus (always true while monetization off). */
export function isPlus(family: FamilyLike): boolean {
  if (!MONETIZATION_ENABLED) return true;
  if (!family || family.plan !== 'plus') return false;
  const exp = family.planExpiresAt?.toDate?.();
  return !exp || exp.getTime() > Date.now();
}

/** True if the family can use a given Plus capability. */
export function hasFeature(family: FamilyLike, _key: FeatureKey): boolean {
  // All current Plus features are gated purely by plan; per-feature free
  // allowances (if any) would branch here later.
  return isPlus(family);
}

/** Member cap for the family's plan (Infinity while free-for-all / on Plus). */
export function memberLimit(family: FamilyLike): number {
  return isPlus(family) ? Infinity : FREE_LIMITS.maxMembers;
}

/** Active-reward cap for the family's plan. */
export function rewardLimit(family: FamilyLike): number {
  return isPlus(family) ? Infinity : FREE_LIMITS.maxActiveRewards;
}

/** Weeks of history the family can see. */
export function historyWeeksLimit(family: FamilyLike): number {
  return isPlus(family) ? Infinity : FREE_LIMITS.historyWeeks;
}

/**
 * Whether to surface Plus *marketing* (badges, the "free for everyone" banner,
 * the upsell rows). While monetization is off we DO show these — that's the
 * whole point: users learn what Plus is and that it's currently free, so turning
 * it on later isn't a surprise.
 */
export const SHOW_PLUS_MARKETING = true;
