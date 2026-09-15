import { isValidDateKey, type DateKey } from './dates';

/**
 * Reading backups written by something other than this app.
 *
 * Red Letter began as a single HTML file, and people will have years of marked
 * days saved out of it. Those files must open here, and a build of the web
 * version from eighteen months ago is not going to have used the field names
 * this app settled on.
 *
 * Rather than encode one guess about the web version's shape, this recognises
 * the handful of ways a calendar of this kind can plausibly be laid out and
 * reshapes any of them into the one form `rebuildData` understands. It only
 * ever *moves* values; every string is still sanitised, every date still
 * validated and every id still regenerated downstream. Being permissive about
 * shape does not mean being permissive about content.
 */

export type BackupShape =
  | 'red-letter'      // What this app writes.
  | 'wrapped'         // Ours, inside { data: ... } or { state: ... }.
  | 'keyed-days'      // Date keys at the top level, no "entries" wrapper.
  | 'entry-array'     // A flat list, each item carrying its own date.
  | 'unknown';

export interface NormalizeResult {
  shape: BackupShape;
  /** Always in this app's shape, ready for `rebuildData`. */
  value: { entries: Record<string, unknown>; waiting: unknown[] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Field names a day's list of things might plausibly live under. */
const ENTRY_CONTAINER_KEYS = ['entries', 'days', 'items', 'events', 'marked', 'calendar'];
const WAITING_KEYS = ['waiting', 'waitingOn', 'waiting_on', 'blocked', 'pending'];
const WRAPPER_KEYS = ['data', 'state', 'redLetter', 'red_letter', 'payload', 'backup'];

/** Field names a single entry's text might live under. */
const TITLE_KEYS = ['title', 'text', 'label', 'name', 'summary', 'event', 'description'];
const TIME_KEYS = ['time', 'at', 'start', 'startTime', 'start_time', 'hour'];
const NOTE_KEYS = ['note', 'notes', 'detail', 'details', 'body'];
const DATE_KEYS = ['date', 'day', 'on', 'dateKey', 'date_key'];

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

/**
 * Normalises one entry into `{ title, time?, note? }`.
 *
 * A day's list may hold bare strings rather than objects — that is a very
 * natural way to write a calendar whose entries are one line of text — so a
 * string is treated as a title rather than discarded.
 */
function normalizeEntry(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    return raw.trim().length > 0 ? { title: raw } : null;
  }
  if (!isPlainObject(raw)) return null;

  const title = firstString(raw, TITLE_KEYS);
  if (title === undefined) return null;

  const out: Record<string, unknown> = { title };

  const time = firstString(raw, TIME_KEYS);
  if (time !== undefined) out.time = normalizeTime(time);

  const note = firstString(raw, NOTE_KEYS);
  // Guard against a format where description *is* the title: do not duplicate.
  if (note !== undefined && note !== title) out.note = note;

  return out;
}

/**
 * Accepts the handful of time spellings a hand-written calendar produces and
 * returns `HH:MM`, or the original if it cannot be read — `rebuildData` will
 * reject anything still malformed.
 */
export function normalizeTime(value: string): string {
  const text = value.trim();

  // "9:05 pm", "9pm", "09:05PM"
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text);
  if (twelve) {
    let hour = Number(twelve[1]);
    const minute = twelve[2] ?? '00';
    const isPm = (twelve[3] as string).toLowerCase() === 'p';
    if (hour >= 1 && hour <= 12) {
      if (hour === 12) hour = 0;
      if (isPm) hour += 12;
      return `${String(hour).padStart(2, '0')}:${minute}`;
    }
  }

  // "9:05" — pad the hour.
  const bare = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (bare) return `${(bare[1] as string).padStart(2, '0')}:${bare[2]}`;

  // "0905"
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  if (compact) return `${compact[1]}:${compact[2]}`;

  return text;
}

/** Turns "15/03/2026", "2026/03/15" and "March 15, 2026" into a date key. */
export function normalizeDate(value: string): string {
  const text = value.trim();
  if (isValidDateKey(text)) return text;

  // A date key with a time or timezone glued on, e.g. "2026-03-15T00:00:00Z".
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(text);
  if (isoPrefix) return isoPrefix[1] as string;

  const slashed = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (slashed) {
    return `${slashed[1]}-${(slashed[2] as string).padStart(2, '0')}-${(slashed[3] as string).padStart(2, '0')}`;
  }

  return text;
}

function collectFromKeyedDays(
  source: Record<string, unknown>,
): Record<string, unknown> | null {
  const entries: Record<string, unknown> = {};
  let matched = 0;

  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    const date = normalizeDate(key);
    if (!isValidDateKey(date)) continue;

    const list = Array.isArray(value) ? value : [value];
    const normalized = list.map(normalizeEntry).filter((e) => e !== null);
    if (normalized.length === 0) continue;

    // Two source keys can normalise onto the same day; merge rather than clobber.
    const existing = (entries[date] as unknown[] | undefined) ?? [];
    entries[date] = [...existing, ...normalized];
    matched += 1;
  }

  return matched > 0 ? entries : null;
}

function collectFromEntryArray(list: unknown[]): Record<string, unknown> | null {
  const entries: Record<string, unknown> = {};
  let matched = 0;

  for (const item of list) {
    if (!isPlainObject(item)) continue;

    const rawDate = firstString(item, DATE_KEYS);
    if (rawDate === undefined) continue;

    const date = normalizeDate(rawDate);
    if (!isValidDateKey(date)) continue;

    const entry = normalizeEntry(item);
    if (entry === null) continue;

    const existing = (entries[date] as unknown[] | undefined) ?? [];
    entries[date] = [...existing, entry];
    matched += 1;
  }

  return matched > 0 ? entries : null;
}

function findWaiting(source: Record<string, unknown>): unknown[] {
  for (const key of WAITING_KEYS) {
    const value = source[key];
    if (!Array.isArray(value)) continue;

    return value
      .map((item) => {
        if (typeof item === 'string') return { title: item };
        if (!isPlainObject(item)) return null;

        const title = firstString(item, TITLE_KEYS);
        if (title === undefined) return null;

        const out: Record<string, unknown> = { title };
        const since = firstString(item, ['since', 'from', 'started', 'createdAt', 'created_at']);
        if (since !== undefined) out.since = normalizeDate(since);
        const nudge = firstString(item, ['nudgeOn', 'nudge_on', 'remindOn', 'chase']);
        if (nudge !== undefined) out.nudgeOn = normalizeDate(nudge);
        return out;
      })
      .filter((item) => item !== null);
  }
  return [];
}

/**
 * Reshapes a parsed backup into the form `rebuildData` reads.
 *
 * Never throws and never returns null — an unrecognisable file yields an empty
 * result, which the caller reports as "that does not look like a backup"
 * rather than silently wiping the user's calendar.
 */
export function normalizeBackup(raw: unknown): NormalizeResult {
  const empty: NormalizeResult['value'] = { entries: {}, waiting: [] };

  // A bare array of entries, each carrying its own date.
  if (Array.isArray(raw)) {
    const entries = collectFromEntryArray(raw);
    return entries === null
      ? { shape: 'unknown', value: empty }
      : { shape: 'entry-array', value: { entries, waiting: [] } };
  }

  if (!isPlainObject(raw)) return { shape: 'unknown', value: empty };

  // Unwrap one level of { data: ... } / { state: ... } and try again.
  for (const key of WRAPPER_KEYS) {
    const inner = raw[key];
    if (isPlainObject(inner) || Array.isArray(inner)) {
      const unwrapped = normalizeBackup(inner);
      if (Object.keys(unwrapped.value.entries).length > 0) {
        // Waiting items may sit outside the wrapper.
        const waiting =
          unwrapped.value.waiting.length > 0 ? unwrapped.value.waiting : findWaiting(raw);
        return { shape: 'wrapped', value: { entries: unwrapped.value.entries, waiting } };
      }
    }
  }

  const waiting = findWaiting(raw);

  // A named container: { entries: ... }, { days: ... }, { events: [...] }.
  for (const key of ENTRY_CONTAINER_KEYS) {
    const container = raw[key];

    if (Array.isArray(container)) {
      const entries = collectFromEntryArray(container);
      if (entries !== null) {
        return { shape: key === 'entries' ? 'red-letter' : 'entry-array', value: { entries, waiting } };
      }
    }
    if (isPlainObject(container)) {
      const entries = collectFromKeyedDays(container);
      if (entries !== null) {
        return {
          shape: key === 'entries' ? 'red-letter' : 'keyed-days',
          value: { entries, waiting },
        };
      }
    }
  }

  // Date keys sitting at the top level with no wrapper at all.
  const topLevel = collectFromKeyedDays(raw);
  if (topLevel !== null) return { shape: 'keyed-days', value: { entries: topLevel, waiting } };

  // Nothing recognisable, but waiting items alone are still worth keeping.
  return waiting.length > 0
    ? { shape: 'red-letter', value: { entries: {}, waiting } }
    : { shape: 'unknown', value: empty };
}

/** Days present in a normalised result, for reporting to the user. */
export function normalizedDayCount(result: NormalizeResult): number {
  return Object.keys(result.value.entries).length;
}

export type { DateKey };
