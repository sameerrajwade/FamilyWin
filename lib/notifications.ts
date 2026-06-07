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
import messaging from '@react-native-firebase/messaging';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ─── NOTIFICATION HANDLER (unchanged) ────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
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

// ─── LOCAL SCHEDULED NOTIFICATIONS (unchanged — handled by expo-notifications)

/** Schedule a repeating daily reminder */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  memberName: string,
  taskCount: number,
): Promise<void> {
  // Cancel any existing daily reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'daily_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Hey ${memberName}! 📋`,
      body: `You have ${taskCount} task${taskCount !== 1 ? 's' : ''} left today. Don't forget!`,
      data: { type: 'daily_reminder', screen: 'tasks', channelId: 'daily-reminders' },
      sound: true,
    } as any,
    trigger: {
      hour,
      minute,
      repeats: true,
    } as any,
  });
}

/** Cancel all scheduled local notifications */
export async function cancelAllLocalNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Schedule a streak warning for day 6 */
export async function scheduleStreakNotification(memberName: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🔥 Don't break your streak, ${memberName}!`,
      body: "You're on a 6-day streak. Complete a task today to keep it alive!",
      data: { type: 'streak_warning', screen: 'tasks', channelId: 'alerts' },
    } as any,
    trigger: { seconds: 60 } as any, // shown immediately — caller decides when
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

