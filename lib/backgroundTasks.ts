import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

export const AUTO_FAIL_TASK_NAME = 'familywin-auto-fail';

export async function registerBackgroundTasks() {
  try {
    await BackgroundFetch.registerTaskAsync(AUTO_FAIL_TASK_NAME, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    if (__DEV__) console.log('✅ Background tasks registered');
  } catch (error) {
    if (__DEV__) console.warn('Background task registration failed:', error);
  }
}

// ─── AUTO-FAIL TASK ──────────────────────────────────────────────────────────

// NOTE (feedback #1): this on-device auto-fail is intentionally a NO-OP.
//
// It used to write `penaltyKind:'autofail'` completions that deducted the FULL
// point value, keyed off the DEVICE-LOCAL hour and the per-task `autoFailHour`,
// scanning ALL families. That path (a) ignored the family's Off/Half/Full
// missed-task setting, (b) ignored the parent-configured deadline, (c) ran in
// whatever timezone/hour the phone happened to be in, and (d) conflicted with
// the server-side `missedTaskSweep`, which is timezone-aware, deadline-aware,
// and respects the family penalty mode. Two overlapping fail systems is exactly
// what produced premature red-X failures and negative balances.
//
// The server sweep (firebase/functions/sweep.js) is now the single source of
// truth for missed daily tasks. We keep the task registered (harmless) so
// unregister still works cleanly on existing installs, but it does no writes.
TaskManager.defineTask(AUTO_FAIL_TASK_NAME, async () => {
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function unregisterBackgroundTasks() {
  try {
    await BackgroundFetch.unregisterTaskAsync(AUTO_FAIL_TASK_NAME);
  } catch (error) {
    if (__DEV__) console.warn('Could not unregister background tasks:', error);
  }
}
