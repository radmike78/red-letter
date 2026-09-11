import { isValidDateKey, makeDateKey, type DateKey, type TimeKey } from './dates';
import { LIMITS, type Entry } from './model';
import { sanitizeNote, sanitizeTitle } from './validate';
import { newId } from './random';

/**
 * A deliberately small .ics reader.
 *
 * This is the app's main untrusted input, so it is written to the rule that a
 * calendar file is hostile until proven otherwise: it never throws, it never
 * allocates unboundedly, it reads only the four properties Red Letter actually
 * uses, and everything it produces goes through the same sanitisers as a
 * restored backup. Anything it cannot understand is skipped and counted rather
 * than guessed at.
 *
 * It is not a general RFC 5545 implementation and is not trying to be. In
 * particular RRULE is not expanded — see `parseIcs` for why.
 */

export type IcsRefusal = 'too-large' | 'not-a-calendar' | 'empty';

export interface IcsImportResult {
  /** Entries ready to merge, keyed by local calendar day. */
  days: Record<DateKey, Entry[]>;
  eventsFound: number;
  eventsImported: number;
  /** Events skipped: no title, no usable start date, or out of range. */
  eventsSkipped: number;
  /** Recurring events imported as their first occurrence only. */
  recurringFlattened: number;
  /** True when a limit was hit and the rest of the file was ignored. */
  truncated: boolean;
  refused?: IcsRefusal;
}

function emptyResult(): IcsImportResult {
  return {
    days: {},
    eventsFound: 0,
    eventsImported: 0,
    eventsSkipped: 0,
    recurringFlattened: 0,
    truncated: false,
  };
}

/**
 * Undoes RFC 5545 line folding: a CRLF followed by a space or tab is a
 * continuation of the previous line, not a new one.
 *
 * Lines are capped individually and in total. A file that folds a single
 * property across a hundred thousand lines is refused rather than assembled
 * into one enormous string.
 */
export function unfoldLines(text: string): { lines: string[]; truncated: boolean } {
  const raw = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  let truncated = false;

  for (const line of raw) {
    if (lines.length >= LIMITS.icsLines) {
      truncated = true;
      break;
    }

    const isContinuation = line.startsWith(' ') || line.startsWith('\t');
    if (isContinuation && lines.length > 0) {
      const previous = lines[lines.length - 1] as string;
      if (previous.length >= LIMITS.icsLineLength) {
        truncated = true;
        continue;
      }
      lines[lines.length - 1] = (previous + line.slice(1)).slice(0, LIMITS.icsLineLength);
      continue;
    }

    if (line.length > LIMITS.icsLineLength) {
      truncated = true;
      lines.push(line.slice(0, LIMITS.icsLineLength));
      continue;
    }
    lines.push(line);
  }

  return { lines, truncated };
}

interface ParsedProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

/**
 * Splits `DTSTART;TZID=Europe/London:20260315T090000` into its parts.
 *
 * The colon that ends the property name can be preceded by parameters, and a
 * parameter value may itself be quoted and contain a colon, so the split has
 * to respect quoting rather than using indexOf.
 */
export function parseProperty(line: string): ParsedProperty | null {
  let inQuotes = false;
  let colonAt = -1;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ':' && !inQuotes) {
      colonAt = i;
      break;
    }
  }
  if (colonAt === -1) return null;

  const head = line.slice(0, colonAt);
  const value = line.slice(colonAt + 1);

  const segments = head.split(';');
  const name = (segments[0] ?? '').trim().toUpperCase();
  if (name.length === 0) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i] as string;
    const equalsAt = segment.indexOf('=');
    if (equalsAt === -1) continue;
    const key = segment.slice(0, equalsAt).trim().toUpperCase();
    let paramValue = segment.slice(equalsAt + 1).trim();
    if (paramValue.startsWith('"') && paramValue.endsWith('"') && paramValue.length >= 2) {
      paramValue = paramValue.slice(1, -1);
    }
    // Own-property assignment only; a file cannot reach the prototype chain.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    params[key] = paramValue;
  }

  return { name, params, value };
}

/** Reverses the TEXT escaping defined by RFC 5545 (`\n`, `\,`, `\;`, `\\`). */
export function unescapeIcsText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = value[i + 1];
    i += 1;
    switch (next) {
      case 'n':
      case 'N':
        out += '\n';
        break;
      case ',':
        out += ',';
        break;
      case ';':
        out += ';';
        break;
      case '\\':
        out += '\\';
        break;
      default:
        // Unknown escape: drop the backslash, keep the character verbatim.
        if (next !== undefined) out += next;
        else i -= 1;
        break;
    }
  }
  return out;
}

export interface ParsedStart {
  date: DateKey;
  time?: TimeKey;
}

const DATE_ONLY = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/;

/**
 * Reads a DTSTART value into a local calendar day.
 *
 * A trailing `Z` means UTC and is converted to the device's local day, which
 * can legitimately shift the date. A floating or TZID-qualified time is taken
 * as wall-clock time and used as written: without a full timezone database the
 * honest reading of "09:00 in Europe/London" is "09:00", and the wall time is
 * what the user actually wants to see on the day.
 */
export function parseIcsStart(value: string, isDateOnly: boolean): ParsedStart | null {
  const trimmed = value.trim();

  const dateMatch = DATE_ONLY.exec(trimmed);
  if (dateMatch) {
    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    return isValidDateKey(date) ? { date } : null;
  }

  const dateTimeMatch = DATE_TIME.exec(trimmed);
  if (!dateTimeMatch) return null;

  const [, year, month, day, hour, minute, , utcFlag] = dateTimeMatch;
  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;

  if (!isValidDateKey(date)) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;

  // VALUE=DATE with a time component: trust the declared type, drop the time.
  if (isDateOnly) return { date };

  if (utcFlag === 'Z') {
    const utc = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
    );
    const localDate = makeDateKey(utc.getFullYear(), utc.getMonth() + 1, utc.getDate());
    if (!isValidDateKey(localDate)) return null;
    const localTime = `${String(utc.getHours()).padStart(2, '0')}:${String(utc.getMinutes()).padStart(2, '0')}`;
    return { date: localDate, time: localTime };
  }

  return { date, time };
}

export interface ParseIcsOptions {
  /** Byte length of the source file, checked before any parsing happens. */
  byteLength?: number;
}

/**
 * Parses a calendar file into entries.
 *
 * RRULE is intentionally not expanded. Expanding recurrence means generating an
 * unbounded number of entries from a handful of bytes — a weekly event with no
 * UNTIL is infinite — and in a calendar whose whole premise is that most days
 * are empty, silently filling every Tuesday of the next decade would destroy
 * the product. Recurring events are imported as their first occurrence and
 * counted in `recurringFlattened` so the user can be told.
 */
export function parseIcs(text: string, options: ParseIcsOptions = {}): IcsImportResult {
  const result = emptyResult();

  const byteLength = options.byteLength ?? text.length;
  if (byteLength > LIMITS.importBytes) {
    result.refused = 'too-large';
    return result;
  }
  if (text.trim().length === 0) {
    result.refused = 'empty';
    return result;
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    result.refused = 'not-a-calendar';
    return result;
  }

  const { lines, truncated } = unfoldLines(text);
  result.truncated = truncated;

  let depth = 0;
  let inEvent = false;
  let start: ParsedStart | null = null;
  let summary = '';
  let description = '';
  let recurring = false;

  const resetEvent = (): void => {
    start = null;
    summary = '';
    description = '';
    recurring = false;
  };

  const commitEvent = (): void => {
    result.eventsFound += 1;

    const title = sanitizeTitle(summary);
    if (start === null || title.length === 0) {
      result.eventsSkipped += 1;
      return;
    }
    if (result.eventsImported >= LIMITS.entriesTotal) {
      result.eventsSkipped += 1;
      result.truncated = true;
      return;
    }

    const { date, time } = start as ParsedStart;
    const day = result.days[date] ?? [];
    if (day.length >= LIMITS.entriesPerDay) {
      result.eventsSkipped += 1;
      result.truncated = true;
      return;
    }

    const entry: Entry = { id: newId(), title };
    if (time !== undefined) entry.time = time;
    const note = sanitizeNote(description);
    if (note.length > 0) entry.note = note;

    day.push(entry);
    result.days[date] = day;
    result.eventsImported += 1;
    if (recurring) result.recurringFlattened += 1;
  };

  for (const line of lines) {
    const property = parseProperty(line);
    if (property === null) continue;

    if (property.name === 'BEGIN') {
      const component = property.value.trim().toUpperCase();
      if (component === 'VEVENT' && !inEvent) {
        inEvent = true;
        depth = 0;
        resetEvent();
      } else if (inEvent) {
        // A nested component (VALARM and friends). Track it so its properties
        // are not mistaken for the event's own.
        depth += 1;
      }
      continue;
    }

    if (property.name === 'END') {
      const component = property.value.trim().toUpperCase();
      if (component === 'VEVENT' && inEvent && depth === 0) {
        commitEvent();
        inEvent = false;
        resetEvent();
      } else if (inEvent && depth > 0) {
        depth -= 1;
      }
      continue;
    }

    if (!inEvent || depth > 0) continue;

    switch (property.name) {
      case 'DTSTART': {
        const isDateOnly = (property.params.VALUE ?? '').toUpperCase() === 'DATE';
        start = parseIcsStart(property.value, isDateOnly);
        break;
      }
      case 'SUMMARY':
        summary = unescapeIcsText(property.value);
        break;
      case 'DESCRIPTION':
        description = unescapeIcsText(property.value);
        break;
      case 'RRULE':
      case 'RDATE':
        recurring = true;
        break;
      default:
        // Every other property is ignored by design.
        break;
    }
  }

  // A VEVENT left open by a truncated file is still worth keeping if it is
  // complete enough to use.
  if (inEvent) commitEvent();

  return result;
}
