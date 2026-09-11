import { isValidDateKey, isValidTimeKey, type DateKey } from './dates';
import { LIMITS, SCHEMA_VERSION, emptyData, type Entry, type RedLetterData, type WaitingItem } from './model';
import { newId } from './random';

/**
 * Every value that enters Red Letter from outside — a restored backup, an
 * imported .ics — passes through here first.
 *
 * The rule is that we never adopt the shape of an untrusted file. We walk our
 * own schema and pull each field across only if it validates, discarding
 * everything we did not ask for. A file cannot introduce a key we do not read,
 * an id we did not generate, or a string longer than we will render.
 */

/**
 * Characters removed from every string that reaches the UI.
 *
 * C0/C1 control characters (including NUL, which truncates strings in some
 * native APIs) plus the Unicode bidirectional and zero-width formatting
 * characters. The bidi overrides matter because they can visually reorder a
 * title in a list so it reads as something other than what is stored.
 *
 * Tab, newline and carriage return are deliberately NOT in this set. They
 * are legitimate whitespace, and the caller decides what becomes of them:
 * notes keep their line structure, single-line fields collapse them below.
 */
const UNSAFE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/** Collapses runs of whitespace, including newlines, into single spaces. */
const WHITESPACE_RUN = /\s+/g;

export interface SanitizeOptions {
  maxLength: number;
  /** Multi-line fields (notes) keep their newlines; single-line fields do not. */
  allowNewlines?: boolean;
}

/**
 * Returns a string that is always safe to render and always within limits.
 * Never throws: callers decide whether an empty result means "drop this".
 */
export function sanitizeText(value: unknown, options: SanitizeOptions): string {
  if (typeof value !== 'string') return '';

  let text = value.normalize('NFC').replace(UNSAFE_CHARS, '');
  if (options.allowNewlines) {
    // Normalise line endings, cap consecutive blank lines, but keep structure.
    text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    text = text
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      .trim();
  } else {
    text = text.replace(WHITESPACE_RUN, ' ').trim();
  }

  if (text.length > options.maxLength) {
    text = text.slice(0, options.maxLength).trim();
  }
  return text;
}

export function sanitizeTitle(value: unknown): string {
  return sanitizeText(value, { maxLength: LIMITS.titleLength });
}

export function sanitizeNote(value: unknown): string {
  return sanitizeText(value, { maxLength: LIMITS.noteLength, allowNewlines: true });
}

/** What was thrown away while rebuilding, so the user can be told plainly. */
export interface RestoreReport {
  entriesKept: number;
  entriesDropped: number;
  waitingKept: number;
  waitingDropped: number;
  daysDropped: number;
  truncated: boolean;
}

function emptyReport(): RestoreReport {
  return {
    entriesKept: 0,
    entriesDropped: 0,
    waitingKept: 0,
    waitingDropped: 0,
    daysDropped: 0,
    truncated: false,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Keys that must never be copied across, even if a field name matched. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Rebuilds a single entry. Returns null when there is nothing worth keeping —
 * an entry with no usable title is dropped rather than shown as blank.
 */
export function rebuildEntry(raw: unknown): Entry | null {
  if (!isPlainObject(raw)) return null;

  const title = sanitizeTitle(raw.title);
  if (title.length === 0) return null;

  // The id is always regenerated. Whatever the file claimed is discarded.
  const entry: Entry = { id: newId(), title };

  if (isValidTimeKey(raw.time)) entry.time = raw.time;

  const note = sanitizeNote(raw.note);
  if (note.length > 0) entry.note = note;

  return entry;
}

export function rebuildWaitingItem(raw: unknown, fallbackSince: DateKey): WaitingItem | null {
  if (!isPlainObject(raw)) return null;

  const title = sanitizeTitle(raw.title);
  if (title.length === 0) return null;

  const item: WaitingItem = {
    id: newId(),
    title,
    since: isValidDateKey(raw.since) ? raw.since : fallbackSince,
  };
  if (isValidDateKey(raw.nudgeOn)) item.nudgeOn = raw.nudgeOn;

  return item;
}

/**
 * Rebuilds an entire data file field by field.
 *
 * `today` supplies the fallback for a waiting item with a missing or invalid
 * start date, and is passed in rather than read from the clock so the result
 * is deterministic and testable.
 */
export function rebuildData(
  raw: unknown,
  today: DateKey,
): { data: RedLetterData; report: RestoreReport } {
  const report = emptyReport();
  const data = emptyData();

  if (!isPlainObject(raw)) return { data, report };

  const rawEntries = raw.entries;
  if (isPlainObject(rawEntries)) {
    // Sorted so that hitting a limit drops the chronologically last days,
    // rather than whichever order the file happened to use.
    const dateKeys = Object.keys(rawEntries).sort();

    for (const dateKey of dateKeys) {
      if (FORBIDDEN_KEYS.has(dateKey)) continue;

      if (!isValidDateKey(dateKey)) {
        report.daysDropped += 1;
        continue;
      }
      if (Object.keys(data.entries).length >= LIMITS.distinctDays) {
        report.daysDropped += 1;
        report.truncated = true;
        continue;
      }

      const rawDay = rawEntries[dateKey];
      if (!Array.isArray(rawDay)) {
        report.daysDropped += 1;
        continue;
      }

      const day: Entry[] = [];
      for (const rawEntry of rawDay) {
        if (day.length >= LIMITS.entriesPerDay || report.entriesKept >= LIMITS.entriesTotal) {
          report.entriesDropped += 1;
          report.truncated = true;
          continue;
        }
        const entry = rebuildEntry(rawEntry);
        if (entry === null) {
          report.entriesDropped += 1;
          continue;
        }
        day.push(entry);
        report.entriesKept += 1;
      }

      // A day whose entries were all rejected is not carried across as an
      // empty day; in this product an empty day is simply an unmarked one.
      if (day.length > 0) data.entries[dateKey] = day;
    }
  }

  const rawWaiting = raw.waiting;
  if (Array.isArray(rawWaiting)) {
    for (const rawItem of rawWaiting) {
      if (data.waiting.length >= LIMITS.waitingItems) {
        report.waitingDropped += 1;
        report.truncated = true;
        continue;
      }
      const item = rebuildWaitingItem(rawItem, today);
      if (item === null) {
        report.waitingDropped += 1;
        continue;
      }
      data.waiting.push(item);
      report.waitingKept += 1;
    }
  }

  data.schemaVersion = SCHEMA_VERSION;
  return { data, report };
}
