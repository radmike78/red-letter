import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { toLocalDate, type DateKey } from '../core/dates';
import { sortDayEntries } from '../core/queries';
import type { Entry } from '../core/model';

/**
 * Writing a marked day into the device calendar.
 *
 * This is where the app touches the most sensitive thing it can reach, so the
 * rules are strict:
 *
 * 1. Permission is requested at the moment the user asks for this, never at
 *    launch and never speculatively.
 * 2. On iOS the request is **write-only**. Red Letter has no reason to read
 *    anyone's calendar — it would mean handing the app every work meeting and
 *    medical appointment the user has, for no feature.
 * 3. Only the title, date and optional time of a day the user explicitly
 *    exported are written. Notes stay in Red Letter.
 * 4. Nothing is read back, nothing is copied out, nothing is deleted.
 *
 * Android's permission model has no write-only calendar grant, so it asks for
 * the pair it requires to name a target calendar. That is disclosed in the
 * Settings copy rather than buried.
 */

export type CalendarResult =
  | { ok: true; written: number }
  | { ok: false; reason: 'denied' | 'no-calendar' | 'failed' };

/** iOS supports a write-only grant; Android does not. */
const WRITE_ONLY = Platform.OS === 'ios';

export async function hasCalendarAccess(): Promise<boolean> {
  try {
    const status = await Calendar.getCalendarPermissions(WRITE_ONLY);
    return status.granted;
  } catch {
    return false;
  }
}

async function requestAccess(): Promise<boolean> {
  try {
    const existing = await Calendar.getCalendarPermissions(WRITE_ONLY);
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Calendar.requestCalendarPermissions(WRITE_ONLY);
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Picks somewhere to write.
 *
 * On iOS with write-only access the calendar list is not readable, so the
 * system default is used. On Android a writable calendar is chosen, preferring
 * the account's primary one.
 */
async function targetCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === 'ios') {
    try {
      return Calendar.getDefaultCalendarSync();
    } catch {
      return null;
    }
  }

  try {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const writable = calendars.filter((calendar) => calendar.allowsModifications);
    if (writable.length === 0) return null;
    return writable.find((calendar) => calendar.isPrimary) ?? (writable[0] as Calendar.ExpoCalendar);
  } catch {
    return null;
  }
}

/**
 * Writes one marked day into the device calendar.
 *
 * A day with a time becomes a one-hour event at that time; a day without one
 * becomes an all-day event, which is what an anniversary actually is.
 */
export async function exportDayToDeviceCalendar(
  date: DateKey,
  entries: Entry[],
): Promise<CalendarResult> {
  if (entries.length === 0) return { ok: true, written: 0 };

  if (!(await requestAccess())) return { ok: false, reason: 'denied' };

  const calendar = await targetCalendar();
  if (calendar === null) return { ok: false, reason: 'no-calendar' };

  let written = 0;
  try {
    for (const entry of sortDayEntries(entries)) {
      const start = toLocalDate(date, entry.time);
      const end = new Date(start.getTime());

      if (entry.time === undefined) end.setDate(end.getDate() + 1);
      else end.setHours(end.getHours() + 1);

      await calendar.createEvent({
        title: entry.title,
        startDate: start,
        endDate: end,
        allDay: entry.time === undefined,
        // Notes are deliberately not copied: they are often the private half
        // of an entry, and the device calendar may sync to a work account.
        timeZone: undefined,
      });
      written += 1;
    }
  } catch {
    return { ok: false, reason: 'failed' };
  }

  return { ok: true, written };
}
