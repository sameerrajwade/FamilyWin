/**
 * lib/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Push notifications via Firebase Cloud Messaging (FCM) directly.
 * Cuts out the Expo Push Service middleman — lower latency, better control.
 *
 * FCM token is stored in Firestore notificationConfigs so the Cloud
 * Function's weekly reset can read it server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as Notifications from 'expo-notifications';
import { messaging } from '@/lib/fb';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ─── NOTIFICATION HANDLER (unchanged) ────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // SDK 53+ split shouldShowAlert into shouldShowBanner + shouldShowList.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── ANDROID CHANNELS (unchanged) ────────────────────────────────────────────

async function createAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('daily-reminders', {
    name: 'Daily Task Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6C63FF',
  });
  await Notifications.setNotificationChannelAsync('weekly-results', {
    name: 'Weekly Results',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#FFD700',
  });
  await Notifications.setNotificationChannelAsync('alerts', {
    name: 'Family Alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#6C63FF',
  });
}

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    if (__DEV__) console.warn('Notifications only work on physical devices');
    return false;
  }
  await createAndroidChannels();

  // Request via FCM (handles both Android and iOS)
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  return enabled;
}

// ─── FCM TOKEN (replaces Expo Push Token) ────────────────────────────────────

/**
 * Get the FCM token for this device.
 * Save this in Firestore so the Cloud Function can send push to it.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const token = await messaging().getToken();
    return token;
  } catch (error) {
    if (__DEV__) console.error('FCM token error:', error);
    return null;
  }
}

// ─── DAILY REMINDERS (always on) ─────────────────────────────────────────────
//
// Two local reminders, both ALWAYS ON (there is deliberately no off switch —
// the reminder IS the habit loop; only the times are adjustable):
//   • Morning plan  — parents only: "plan today's tasks"
//   • Evening check — everyone:     "check off what's done"
//
// ⚠️ Expo SDK 53+ REQUIRES an explicit trigger `type`. The old untyped
// `{ hour, minute, repeats }` trigger silently fell through to an Android
// "channel" trigger, which fires IMMEDIATELY instead of daily — so the old
// "8 PM reminder" never actually repeated at 8 PM.

export const DEFAULT_MORNING_REMINDER = '08:00';
export const DEFAULT_EVENING_REMINDER = '20:00';
/** Parent Report lands on the LAST evening of the family's week. */
export const PARENT_REPORT_TIME = '19:00';
const REMINDER_TYPES = ['daily_reminder', 'morning_plan', 'parent_report'];

/**
 * Expo weekday (1 = Sunday … 7 = Saturday) for the last day of a week that
 * starts on `weekStartDay` (JS getDay: 0 = Sunday … 6 = Saturday). A Monday
 * week (1) ends Sunday → 1.
 */
export function reportWeekday(weekStartDay: number = 1): number {
  const lastJsDay = ((weekStartDay - 1) % 7 + 7) % 7;
  return lastJsDay + 1;
}

export type ReminderPermission = 'granted' | 'denied' | 'unavailable';

/** "HH:MM" → minutes after midnight, or -1 if malformed. */
function toMinutes(t: string | null | undefined): number {
  if (!t) return -1;
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return Number.isNaN(h) || Number.isNaN(m) ? -1 : h * 60 + m;
}
function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Phase 5 #5 — is a "HH:MM" time inside the quiet-hours window? Handles windows
 * that wrap past midnight (e.g. 22:00 → 07:00). Missing/blank window = never.
 */
export function isInQuietHours(hhmm: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const t = toMinutes(hhmm), s = toMinutes(start), e = toMinutes(end);
  if (t < 0 || s < 0 || e < 0) return false;
  return s <= e ? (t >= s && t < e) : (t >= s || t < e); // wrap past midnight
}

/**
 * Quiet hours MOVE an always-on reminder instead of cancelling it: an evening
 * reminder that lands inside the window fires 30 min before quiet starts; a
 * morning one fires right as quiet ends.
 */
export function placeOutsideQuiet(
  time: string, kind: 'morning' | 'evening', start?: string | null, end?: string | null,
): string {
  if (!isInQuietHours(time, start, end)) return time;
  return kind === 'evening' ? fromMinutes(toMinutes(start) - 30) : (end as string);
}

/**
 * Make sure we're ALLOWED to show notifications. With `prompt`, asks the OS only
 * when it still can (never-asked / ask-again) — the OS itself rate-limits this,
 * so calling it on launch never nags someone who said no.
 */
export async function ensureNotificationPermission(prompt: boolean): Promise<ReminderPermission> {
  if (!Device.isDevice) return 'unavailable';
  await createAndroidChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!prompt || !current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

async function cancelReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (REMINDER_TYPES.includes(n.content.data?.type as string)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

async function scheduleDaily(time: string, content: Notifications.NotificationContentInput): Promise<void> {
  const mins = toMinutes(time);
  if (mins < 0) return;
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: Math.floor(mins / 60),
      minute: mins % 60,
      channelId: 'daily-reminders',
    },
  });
}

// ─── Per-type on/off (G4) ────────────────────────────────────────────────────
// Every reminder is ON by default; each person can switch any type off in
// Settings → Notifications. Stored on their notificationConfigs doc as
// "<type>Off: true" (absent = on). The two server pushes (overtaken, Sunday
// results) read the same flags in the Cloud Functions.

export type NotifType = 'morning' | 'evening' | 'report' | 'overtaken' | 'weekly';

export const NOTIF_OFF_FIELD: Record<NotifType, string> = {
  morning: 'morningOff',
  evening: 'eveningOff',
  report: 'reportOff',
  overtaken: 'overtakenOff',
  weekly: 'weeklyResultsOff',
};

/** Which types are ON for a stored config (absent config / flag = on). */
export function notifPrefs(cfg: Record<string, any> | null | undefined): Record<NotifType, boolean> {
  const out = {} as Record<NotifType, boolean>;
  (Object.keys(NOTIF_OFF_FIELD) as NotifType[]).forEach((t) => { out[t] = cfg?.[NOTIF_OFF_FIELD[t]] !== true; });
  return out;
}

/**
 * Schedule (or reschedule) the reminders for this device's account holder —
 * every type on unless the person switched it off (G4). Idempotent — cancels
 * the previous reminders first — so it is safe to
 * call on every launch and after any settings change. Returns the permission
 * state so the UI can surface "notifications are blocked" instead of failing
 * silently.
 */
export async function ensureReminders(opts: {
  name: string;
  isParent: boolean;
  morning?: string | null;
  evening?: string | null;
  quiet?: { start?: string | null; end?: string | null };
  prompt?: boolean;
  /** Family week start (JS getDay) — the Parent Report fires on its last day. */
  weekStartDay?: number;
  /** G4: types switched OFF by this person (default: all on). */
  off?: Partial<Record<'morning' | 'evening' | 'report', boolean>>;
}): Promise<ReminderPermission> {
  try {
    const permission = await ensureNotificationPermission(!!opts.prompt);
    if (permission !== 'granted') return permission;
    await cancelReminders();

    const first = opts.name?.split(' ')[0] || 'there';
    const qs = opts.quiet?.start, qe = opts.quiet?.end;
    const evening = placeOutsideQuiet(opts.evening || DEFAULT_EVENING_REMINDER, 'evening', qs, qe);
    if (!opts.off?.evening) await scheduleDaily(evening, {
      title: `Lootboard time, ${first}! ✅`,
      body: "Check off what's done before the day ends — your points are waiting.",
      data: { type: 'daily_reminder', screen: 'tasks' },
      sound: true,
    });

    if (opts.isParent) {
      const morning = placeOutsideQuiet(opts.morning || DEFAULT_MORNING_REMINDER, 'morning', qs, qe);
      if (!opts.off?.morning) await scheduleDaily(morning, {
        title: `Plan today's quests, ${first} ☀️`,
        body: "Add or tweak today's tasks so everyone can start earning.",
        data: { type: 'morning_plan', screen: 'tasks' },
        sound: true,
      });

      // Bet 2: the weekly payoff — "here's what the app did for you".
      const mins = toMinutes(placeOutsideQuiet(PARENT_REPORT_TIME, 'evening', qs, qe));
      if (!opts.off?.report) await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your family’s week is in 📊',
          body: 'See how many chores the kids handled — and how much time it saved you.',
          data: { type: 'parent_report', screen: 'report' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: reportWeekday(opts.weekStartDay ?? 1),
          hour: Math.floor(mins / 60),
          minute: mins % 60,
          channelId: 'daily-reminders',
        },
      });
    }
    return 'granted';
  } catch (e) {
    if (__DEV__) console.warn('ensureReminders failed:', e);
    return 'denied';
  }
}

/** Mute the daily reminders (vacation/sick hold) without touching other alerts. */
export async function pauseReminders(): Promise<void> {
  try { await cancelReminders(); } catch { /* best-effort */ }
}

/** Cancel all scheduled local notifications */
export async function cancelAllLocalNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Schedule a streak warning, shown a minute from now — caller decides when. */
export async function scheduleStreakNotification(memberName: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🔥 Don't break your streak, ${memberName}!`,
      body: "You're on a 6-day streak. Complete a task today to keep it alive!",
      data: { type: 'streak_warning', screen: 'tasks' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 60, channelId: 'alerts' },
  });
}

// ─── NOTIFICATION LISTENERS (unchanged) ──────────────────────────────────────

export function setupNotificationListeners(
  onReceive: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receiveSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);

  // FCM background message handler
  const unsubFCMBackground = messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    if (__DEV__) console.log('FCM background message:', remoteMessage);
  });

  return () => {
    receiveSub.remove();
    responseSub.remove();
  };
}

