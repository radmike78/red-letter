import { addDays, toLocalDate, type DateKey } from './dates';
import { MAX_SCHEDULED_REMINDERS, type RedLetterData } from './model';
import { sortDayEntries } from './queries';
import { nextMarkedDay, upcomingDays } from './queries';

/**
 * Working out which reminders to schedule.
 *
 * Kept pure and separate from the notification API so the decisions — which
 * days, how many, what the text says — are testable without a device.
 *
 * Red Letter reminds you the evening before, once, and never on the day of
 * nothing. There is no "you haven't opened the app" nudge and no streak
 * warning: the product's whole position is that falling out of the habit is
 * fine, so an app that complains about it would be arguing with itself.
 */

export interface PlannedReminder {
  /** The marked day this is about. */
  date: DateKey;
  /** When the notification fires — the evening before. */
  fireAt: Date;
  title: string;
  body: string;
}

export interface PlanOptions {
  /** Hour of day, 0-23, for the evening-before reminder. */
  hour: number;
  /** Cap on scheduled notifications. iOS silently drops past 64 pending. */
  max?: number;
  /** Injectable for tests. */
  now?: Date;
}

export function planReminders(
  data: RedLetterData,
  today: DateKey,
  options: PlanOptions,
): PlannedReminder[] {
  const max = options.max ?? MAX_SCHEDULED_REMINDERS;
  const now = options.now ?? new Date();
  const hour = Number.isInteger(options.hour) && options.hour >= 0 && options.hour <= 23
    ? options.hour
    : 19;

  const planned: PlannedReminder[] = [];

  for (const day of upcomingDays(data, today, max * 2)) {
    if (planned.length >= max) break;

    const eveningBefore = toLocalDate(addDays(day.date, -1));
    eveningBefore.setHours(hour, 0, 0, 0);

    // A day whose reminder time has already passed is skipped rather than
    // fired immediately; being told at 2pm about something "tomorrow evening"
    // that already happened is worse than silence.
    if (eveningBefore.getTime() <= now.getTime()) continue;

    const entries = sortDayEntries(day.entries);
    const first = entries[0];
    if (first === undefined) continue;

    planned.push({
      date: day.date,
      fireAt: eveningBefore,
      title: 'Tomorrow',
      body:
        entries.length === 1
          ? first.title
          : `${first.title} and ${entries.length - 1} more`,
    });
  }

  return planned;
}

/** The one-line summary the home screen widget shows. */
export function widgetSummary(
  data: RedLetterData,
  today: DateKey,
): { title: string; date: DateKey; count: number } | null {
  const next = nextMarkedDay(data, today);
  if (next === null) return null;

  const entries = sortDayEntries(next.entries);
  const first = entries[0];
  if (first === undefined) return null;

  return { title: first.title, date: next.date, count: entries.length };
}
