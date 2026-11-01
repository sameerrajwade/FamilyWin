/**
 * lib/taskNav.ts
 * One way to open the task editor for an existing task — used by the Home task
 * card's long-press menu and Family → Tasks, so both pass the same fields.
 */
import { router } from 'expo-router';

export function openTaskEditor(task: any) {
  router.push({
    pathname: '/app/task/create' as any,
    params: {
      taskId: task.id,
      taskData: JSON.stringify({
        title: task.title, description: task.description, category: task.category,
        difficulty: task.difficulty, recurrence: task.recurrence, assignedTo: task.assignedTo,
        rotation: task.rotation ?? null, scheduledDays: task.scheduledDays ?? null,
        pointValue: task.pointValue, autoFailHour: task.autoFailHour, taskEmoji: task.taskEmoji,
        requiresApproval: task.requiresApproval, requiresPhoto: task.requiresPhoto,
      }),
    },
  });
}
