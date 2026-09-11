import * as SecureStore from 'expo-secure-store';

/**
 * User preferences.
 *
 * These live in the Keychain / Keystore alongside the data key rather than in
 * AsyncStorage or SharedPreferences. None of them is a secret on its own, but
 * "lock the app" stored in a world-readable preferences file is a switch an
 * attacker with filesystem access can simply turn off, and keeping one storage
 * mechanism for everything means there is no plain-preferences file to audit.
 */

const KEYS = {
  lock: 'redletter.pref.lock',
  reminders: 'redletter.pref.reminders',
  reminderHour: 'redletter.pref.reminderHour',
  calendarSync: 'redletter.pref.calendarSync',
  syncedCalendarId: 'redletter.pref.syncedCalendarId',
} as const;

async function readFlag(key: string, fallback: boolean): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value === null) return fallback;
    return value === '1';
  } catch {
    return fallback;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value ? '1' : '0');
  } catch {
    // A preference that cannot be saved is not worth failing the app over.
  }
}

/** Biometric lock. Off by default — see `LockGate` for why. */
export const isLockEnabled = (): Promise<boolean> => readFlag(KEYS.lock, false);
export const setLockEnabled = (value: boolean): Promise<void> => writeFlag(KEYS.lock, value);

/** Reminders the evening before a marked day. On by default. */
export const areRemindersEnabled = (): Promise<boolean> => readFlag(KEYS.reminders, true);
export const setRemindersEnabled = (value: boolean): Promise<void> =>
  writeFlag(KEYS.reminders, value);

export const isCalendarSyncEnabled = (): Promise<boolean> => readFlag(KEYS.calendarSync, false);
export const setCalendarSyncEnabled = (value: boolean): Promise<void> =>
  writeFlag(KEYS.calendarSync, value);

/** Hour of the day, 0-23, that the day-before reminder fires. */
export async function getReminderHour(): Promise<number> {
  try {
    const value = await SecureStore.getItemAsync(KEYS.reminderHour);
    const hour = Number(value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 19;
  } catch {
    return 19;
  }
}

export async function setReminderHour(hour: number): Promise<void> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
  try {
    await SecureStore.setItemAsync(KEYS.reminderHour, String(hour));
  } catch {
    // Ignored, as above.
  }
}

/** The device calendar Red Letter writes to, once the user has turned sync on. */
export async function getSyncedCalendarId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.syncedCalendarId);
  } catch {
    return null;
  }
}

export async function setSyncedCalendarId(id: string | null): Promise<void> {
  try {
    if (id === null) await SecureStore.deleteItemAsync(KEYS.syncedCalendarId);
    else await SecureStore.setItemAsync(KEYS.syncedCalendarId, id);
  } catch {
    // Ignored, as above.
  }
}

export async function clearAllPreferences(): Promise<void> {
  for (const key of Object.values(KEYS)) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Best effort.
    }
  }
}
