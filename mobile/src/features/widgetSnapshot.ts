import { describeDistance, formatLongDate, type DateKey } from '../core/dates';
import type { RedLetterData } from '../core/model';
import { sanitizeTitle } from '../core/validate';
import { widgetSummary } from '../core/reminders';

/**
 * The payload a home-screen widget renders.
 *
 * A calendar whose thesis is "most days are empty" wants to tell you your next
 * Red Letter day without being opened, which is exactly what a widget is for.
 *
 * The snapshot is deliberately the smallest thing that can answer that
 * question, and it is a security decision as much as a design one. Widget
 * extensions run in a separate process that cannot reach the app's Keychain
 * key, so anything they display has to live outside the encrypted store. Rather
 * than weaken the store, the app writes out one line — the next day's title,
 * its date and a count — and nothing else. The rest of the calendar never
 * leaves the encrypted file.
 *
 * That one line is still plaintext in a shared container, so writing it is
 * opt-in: no widget enabled, no snapshot written. The title is in any case
 * about to be displayed on a home screen, where anyone holding the phone can
 * read it, so the exposure the snapshot adds is the exposure the user asked
 * for.
 */

export interface WidgetSnapshot {
  /** Schema marker, so a stale snapshot from an older build is ignored. */
  version: 1;
  /** Empty when nothing is ahead. */
  hasNext: boolean;
  /** Already-sanitised and truncated for a small display. */
  title: string;
  /** "In 3 weeks", "Tomorrow". Pre-rendered so the widget does no date maths. */
  distance: string;
  /** "Saturday, 14 March". */
  longDate: string;
  date: DateKey | '';
  /** Entries on that day, so the widget can say "and 2 more". */
  count: number;
  /** The day the snapshot was built, so a widget can tell it has gone stale. */
  builtFor: DateKey;
}

/** Widgets are small; a long title is cut rather than wrapped to nothing. */
const WIDGET_TITLE_LENGTH = 60;

export function buildWidgetSnapshot(data: RedLetterData, today: DateKey): WidgetSnapshot {
  const summary = widgetSummary(data, today);

  if (summary === null) {
    return {
      version: 1,
      hasNext: false,
      title: '',
      distance: '',
      longDate: '',
      date: '',
      count: 0,
      builtFor: today,
    };
  }

  // Sanitised again on the way out. The widget renders this in a different
  // process and a different language, so it gets the same guarantees the
  // in-app list does rather than inheriting them by assumption.
  const clean = sanitizeTitle(summary.title);
  const title =
    clean.length > WIDGET_TITLE_LENGTH ? `${clean.slice(0, WIDGET_TITLE_LENGTH - 1).trimEnd()}…` : clean;

  return {
    version: 1,
    hasNext: true,
    title,
    distance: describeDistance(today, summary.date),
    longDate: formatLongDate(summary.date),
    date: summary.date,
    count: summary.count,
    builtFor: today,
  };
}

/** The JSON the native side stores. Kept stable; the widget parses it. */
export function serialiseWidgetSnapshot(snapshot: WidgetSnapshot): string {
  return JSON.stringify(snapshot);
}
