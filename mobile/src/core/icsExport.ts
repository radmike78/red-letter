import { addDays, parseDateKey, type DateKey } from './dates';
import type { Entry, RedLetterData } from './model';
import { allMarkedDays, sortDayEntries } from './queries';

/**
 * Writing .ics.
 *
 * This is the interoperability story. The web version of Red Letter already
 * reads .ics, and so does every calendar anyone owns, so exporting it means a
 * marked day can move between the app, the HTML file, Google, Apple and
 * Outlook without a bespoke format on either side.
 *
 * The output is deliberately plain: VEVENTs with a date, an optional time and
 * a summary, and nothing else. No alarms, no recurrence, no attendees, no
 * timezone definitions. A file this simple is one that every reader agrees
 * about, and agreement is the entire point of the exercise.
 */

const PRODID = '-//Red Letter//Red Letter Mobile//EN';

/** RFC 5545 escaping for TEXT values: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a content line to 75 octets, per RFC 5545.
 *
 * The limit is octets rather than characters, so a line is measured by its
 * UTF-8 length and never split in the middle of a multi-byte character — a
 * naive character-count fold corrupts any entry with an accent or an emoji in
 * it, which is exactly the kind of bug that only shows up in someone else's
 * calendar.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const pieces: string[] = [];
  let current = '';
  let currentBytes = 0;
  // First line allows 75 octets; continuations start with a space, so 74.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      pieces.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current.length > 0) pieces.push(current);

  return pieces.join('\r\n ');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYYMMDD`, for an all-day event. */
function icsDate(date: DateKey): string {
  const { year, month, day } = parseDateKey(date);
  return `${year}${pad(month)}${pad(day)}`;
}

/**
 * `YYYYMMDDTHHMMSS`, floating (no Z, no TZID).
 *
 * A marked day is a wall-clock thing: dinner at seven is at seven wherever the
 * user happens to be. Floating time says exactly that, and avoids shipping a
 * VTIMEZONE block that readers disagree about.
 */
function icsDateTime(date: DateKey, time: string): string {
  return `${icsDate(date)}T${time.slice(0, 2)}${time.slice(3, 5)}00`;
}

/** A stable UID: the same entry exported twice will not duplicate on import. */
function uidFor(entry: Entry, date: DateKey): string {
  return `${entry.id}@red-letter.app`;
}

function eventLines(date: DateKey, entry: Entry, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${uidFor(entry, date)}`, `DTSTAMP:${stamp}`];

  if (entry.time === undefined) {
    // An untimed marked day is an all-day event. DTEND is exclusive, so it is
    // the following day — the single most commonly mis-written field in .ics,
    // and getting it wrong shows the event on two days in some readers.
    lines.push(`DTSTART;VALUE=DATE:${icsDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`);
  } else {
    lines.push(`DTSTART:${icsDateTime(date, entry.time)}`);
    const endHour = (Number(entry.time.slice(0, 2)) + 1) % 24;
    // An event running past midnight belongs to the next day.
    const endDate = endHour === 0 ? addDays(date, 1) : date;
    lines.push(`DTEND:${icsDateTime(endDate, `${pad(endHour)}:${entry.time.slice(3, 5)}`)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(entry.title)}`);
  if (entry.note !== undefined) lines.push(`DESCRIPTION:${escapeIcsText(entry.note)}`);
  lines.push('END:VEVENT');

  return lines;
}

export interface ExportIcsOptions {
  /** Injectable so tests are deterministic. */
  now?: Date;
}

/** Serialises the whole calendar as an .ics file. */
export function exportIcs(data: RedLetterData, options: ExportIcsOptions = {}): string {
  const now = options.now ?? new Date();
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Red Letter',
  ];

  for (const day of allMarkedDays(data)) {
    for (const entry of sortDayEntries(day.entries)) {
      lines.push(...eventLines(day.date, entry, stamp));
    }
  }

  lines.push('END:VCALENDAR');

  // CRLF throughout, and a trailing one — some readers reject a file without it.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** How many events an export will contain, for the confirmation message. */
export function countExportableEvents(data: RedLetterData): number {
  return allMarkedDays(data).reduce((total, day) => total + day.entries.length, 0);
}
