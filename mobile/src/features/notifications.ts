import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { todayKey } from '../core/dates';
import type { RedLetterData } from '../core/model';
import { planReminders } from '../core/reminders';
import { areRemindersEnabled, getReminderHour, setRemindersEnabled } from './settings';

/**
 * Local notifications only.
 *
 * Red Letter has no server and no push token. Everything here is scheduled on
 * the device by the OS, which is also why reminders keep working with the app
 * closed and with no network at all.
 */

const ANDROID_CHANNEL = 'red-letter-days';

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Red Letter days',
    importance: Notifications.AndroidImportance.DEFAULT,
    // No sound: a quiet product should have a quiet notification.
    sound: null,
    vibrationPattern: [0, 200],
    enableVibrate: true,
  });
}

/**
 * Asks for notification permission. Called only when the user turns reminders
 * on, never at launch — a permission prompt before the app has shown what it is
 * for is the thing that gets it denied.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/**
 * Rebuilds the whole schedule from scratch.
 *
 * Cancelling and re-scheduling everything is deliberate: reconciling individual
 * notifications against edited days is a source of duplicates and orphans, and
 * with at most a few dozen reminders the brute-force version is both cheap and
 * obviously correct.
 */
export async function syncReminders(data: RedLetterData): Promise<number> {
  if (!(await areRemindersEnabled())) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }
  if (!(await hasNotificationPermission())) return 0;

  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const hour = await getReminderHour();
  const planned = planReminders(data, todayKey(), { hour });

  for (const reminder of planned) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.body,
        // The date is carried so tapping the notification can open that day.
        data: { date: reminder.date },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.fireAt,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
    });
  }

  return planned.length;
}

/** Turns reminders on, requesting permission first. Returns what actually happened. */
export async function enableReminders(data: RedLetterData): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    await setRemindersEnabled(false);
    return false;
  }
  await setRemindersEnabled(true);
  await syncReminders(data);
  return true;
}

export async function disableReminders(): Promise<void> {
  await setRemindersEnabled(false);
  await Notifications.cancelAllScheduledNotificationsAsync();
}
