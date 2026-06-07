import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import firestore from '@react-native-firebase/firestore';
import { getCurrentWeekId } from '@/lib/firebase';

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

TaskManager.defineTask(AUTO_FAIL_TASK_NAME, async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const weekId = getCurrentWeekId();

    // Get all families (the background task has no user context — scans all)
    const familiesSnap = await firestore().collection('families').get();

    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;

      // Get active tasks with an autoFailHour <= current hour
      const tasksSnap = await firestore()
        .collection('families').doc(familyId)
        .collection('tasks')
        .where('isActive', '==', true)
        .get();

      const dueTasks = tasksSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t: any) => t.autoFailHour != null && t.autoFailHour <= currentHour) as any[];

      if (!dueTasks.length) continue;

      // Get members in this family
      const membersSnap = await firestore()
        .collection('families').doc(familyId)
        .collection('members').get();
      const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

      // Get all completions for this week to avoid double-failing
      const completionsSnap = await firestore()
        .collection('families').doc(familyId)
        .collection('completions')
        .where('weekId', '==', weekId)
        .get();
      const completedPairs = new Set(
        completionsSnap.docs.map((d) => `${d.data().taskId}::${d.data().memberId}`),
      );

      const batch = firestore().batch();
      let batchCount = 0;

      for (const task of dueTasks) {
        const eligibleMembers = task.assignedTo
          ? members.filter((m: any) => m.id === task.assignedTo)
          : members;

        for (const member of eligibleMembers) {
          const pairKey = `${task.id}::${member.id}`;
          if (completedPairs.has(pairKey)) continue;

          // Auto-fail: mark completion + deduct points
          const completionRef = firestore()
            .collection('families').doc(familyId)
            .collection('completions').doc();
          batch.set(completionRef, {
            taskId: task.id,
            memberId: member.id,
            weekId,
            completedAt: null,
            wasAutoFailed: true,
            pointsAwarded: -task.pointValue,
          });

          const txRef = firestore()
            .collection('families').doc(familyId)
            .collection('transactions').doc();
          batch.set(txRef, {
            familyId,
            memberId: member.id,
            delta: -task.pointValue,
            reason: `Auto-failed: ${task.title}`,
            source: 'task',
            referenceId: task.id,
            createdAt: firestore.FieldValue.serverTimestamp(),
          });

          batchCount++;

          // Firestore batch limit is 500 operations (2 ops per member above)
          if (batchCount >= 240) {
            await batch.commit();
            batchCount = 0;
          }
        }
      }

      if (batchCount > 0) await batch.commit();
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    if (__DEV__) console.error('Auto-fail background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function unregisterBackgroundTasks() {
  try {
    await BackgroundFetch.unregisterTaskAsync(AUTO_FAIL_TASK_NAME);
  } catch (error) {
    if (__DEV__) console.warn('Could not unregister background tasks:', error);
  }
}
