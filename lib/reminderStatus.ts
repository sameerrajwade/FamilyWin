/**
 * lib/reminderStatus.ts
 * Session-only record of whether the always-on reminders could actually be
 * scheduled. Set by the launch hook in app/app/tabs/_layout.tsx; read by Home
 * to show a "turn notifications on" nudge instead of failing silently.
 */
import { create } from 'zustand';
import type { ReminderPermission } from '@/lib/notifications';

interface ReminderStatusState {
  permission: ReminderPermission | null;
  setPermission: (p: ReminderPermission) => void;
}

export const useReminderStatus = create<ReminderStatusState>((set) => ({
  permission: null,
  setPermission: (permission) => set({ permission }),
}));
