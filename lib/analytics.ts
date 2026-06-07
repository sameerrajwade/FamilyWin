/**
 * lib/analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrappers around Firebase Analytics + Crashlytics.
 * All calls are try/catch so they never crash the app if Firebase is not ready.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import analytics from '@react-native-firebase/analytics';

// ── Identify the logged-in user ───────────────────────────────────────────────

export async function identifyUser(uid: string, displayName: string, familyId: string) {
  try {
    await analytics().setUserId(uid);
    await analytics().setUserProperties({ family_id: familyId, display_name: displayName });
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
    await analytics().logEvent('task_completed', {
      task_title: taskTitle,
      point_value: pointValue,
      member_id: memberId,
    });
  } catch { /* silent */ }
}

export async function trackRewardRedeemed(rewardTitle: string, pointCost: number) {
  try {
    await analytics().logEvent('reward_redeemed', {
      reward_title: rewardTitle,
      point_cost: pointCost,
    });
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
