/**
 * lib/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrappers around Firebase Analytics + Crashlytics.
 * All calls are try/catch so they never crash the app if Firebase is not ready.
 *
 * PRIVACY (G11, kids' app): never send names, task/reward titles or member ids
 * — only opaque ids (uid, family id) and numbers. Families-policy safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { analytics } from '@/lib/fb';

// ── Identify the logged-in user ───────────────────────────────────────────────

export async function identifyUser(uid: string, displayName: string, familyId: string) {
  try {
    await analytics().setUserId(uid);
    void displayName; // deliberately NOT sent — see PRIVACY above
    await analytics().setUserProperties({ family_id: familyId });
  } catch { /* silent */ }
}

// ── Screen tracking ───────────────────────────────────────────────────────────

export async function trackScreen(screenName: string) {
  try {
    await analytics().logScreenView({ screen_name: screenName, screen_class: screenName });
  } catch { /* silent */ }
}

// ── Key events ────────────────────────────────────────────────────────────────

export async function trackTaskCompleted(taskTitle: string, pointValue: number, memberId: string) {
  try {
    void taskTitle; void memberId; // not sent — see PRIVACY above
    await analytics().logEvent('task_completed', { point_value: pointValue });
  } catch { /* silent */ }
}

export async function trackRewardRedeemed(rewardTitle: string, pointCost: number) {
  try {
    void rewardTitle; // not sent — see PRIVACY above
    await analytics().logEvent('reward_redeemed', { point_cost: pointCost });
  } catch { /* silent */ }
}

export async function trackFamilyCreated(familyId: string) {
  try {
    await analytics().logEvent('family_created', { family_id: familyId });
  } catch { /* silent */ }
}

export async function trackFamilyJoined(familyId: string) {
  try {
    await analytics().logEvent('family_joined', { family_id: familyId });
  } catch { /* silent */ }
}

// ── Error recording ───────────────────────────────────────────────────────────

export function recordError(error: Error, context?: string) {
  // Crashlytics removed from the build (its Gradle plugin caused a startup crash).
  // Errors are logged locally instead; consider Sentry or Firebase Analytics exceptions later.
  if (__DEV__) {
    console.error(context ? `[${context}]` : '[error]', error);
  }
}
