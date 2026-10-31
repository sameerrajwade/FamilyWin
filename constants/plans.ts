/**
 * constants/plans.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lootboard Plus — monetization configuration.
 *
 * The machinery is fully built, but MONETIZATION_ENABLED is the master switch.
 * While it is FALSE:
 *   • every family is treated as Plus (see lib/entitlements.ts) — nothing is
 *     locked, so no user is ever blocked;
 *   • the app openly shows which features are "Plus" and a banner that they are
 *     FREE FOR EVERYONE right now.
 * The point: when Plus is switched on later, users have already seen the
 * Plus labelling and the "free for now" framing — so it isn't a surprise.
 *
 * To go paid later: set MONETIZATION_ENABLED = true and wire real entitlements
 * (RevenueCat webhook → Cloud Function writes family.plan). No UI rewrite needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** MASTER SWITCH. false = everything free for everyone (current launch state). */
export const MONETIZATION_ENABLED = false;

export type PlanId = 'free' | 'plus';

/** Launch pricing (shown as "will be" while free; charged when enabled). */
export const PLUS_PRICING = {
  monthly: '$3.99/mo',
  yearly: '$24.99/yr',
  trialDays: 7,
} as const;

/** Free-tier limits (enforced only when MONETIZATION_ENABLED is true). */
export const FREE_LIMITS = {
  maxMembers: 4,
  maxActiveRewards: 3,
  historyWeeks: 2,
} as const;

/** A capability key used with hasFeature(). */
export type FeatureKey =
  | 'unlimited_members'
  | 'full_history'
  | 'unlimited_rewards'
  | 'reward_images'
  | 'streak_insurance'
  | 'co_admin'
  | 'custom_points'
  | 'premium_themes'
  | 'photo_proof';

/** The Plus feature list — shown on the Plus screen and used for PLUS badges. */
// NOTE: the FeatureKey union above intentionally keeps keys that aren't shown
// here yet (reward_images, streak_insurance, premium_themes, photo_proof) — those
// are MVP2 and deliberately omitted from the displayed list until they ship.
export const PLUS_FEATURES: { key: FeatureKey; icon: string; title: string; desc: string }[] = [
  { key: 'unlimited_members', icon: 'people', title: 'Unlimited members', desc: 'Add the whole family — beyond the free 4.' },
  { key: 'full_history', icon: 'stats-chart', title: 'Full history & trends', desc: 'See every week and long-term insights, not just the last 2.' },
  { key: 'unlimited_rewards', icon: 'gift', title: 'Unlimited rewards', desc: 'Create as many rewards as you like.' },
  { key: 'co_admin', icon: 'shield-checkmark', title: 'Co-admin & approvals', desc: 'Share admin with another parent, route approvals.' },
  { key: 'custom_points', icon: 'options', title: 'Custom points & goals', desc: 'Custom point values, penalty rules and per-child weekly goals.' },
];
