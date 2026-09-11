/**
 * Date handling for Red Letter.
 *
 * Every stored date is a plain `YYYY-MM-DD` string in the user's own local
 * calendar, never a timestamp. A "day" in this product is a human day, not an
 * instant: the 3rd of March is the 3rd of March regardless of the device's
 * timezone, and it must not shift when someone flies somewhere. Storing
 * timestamps is the standard way calendar apps end up showing a birthday on
 * the wrong day, so the type system keeps them out of the store entirely.
 */

/** A local calendar day, `YYYY-MM-DD`. */
export type DateKey = string;

/** A local wall-clock time, `HH:MM` on a 24-hour clock. */
export type TimeKey = string;

export const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_KEY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Range of years the app will store or display. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Days in a given month, accounting for leap years. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * True only for a syntactically valid key that also names a real day.
 * `2025-02-30` matches the pattern but is not a date, so it is rejected here.
 */
export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  return day <= daysInMonth(year, month);
}

export function isValidTimeKey(value: unknown): value is TimeKey {
  return typeof value === 'string' && TIME_KEY_PATTERN.test(value);
}

export function makeDateKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  };
}

/** Today in the device's local timezone. */
export function todayKey(now: Date = new Date()): DateKey {
  return makeDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** A local `Date` at midnight, for formatting and for scheduling only. */
export function toLocalDate(key: DateKey, time?: TimeKey): Date {
  const { year, month, day } = parseDateKey(key);
  const hours = time ? Number(time.slice(0, 2)) : 0;
  const minutes = time ? Number(time.slice(3, 5)) : 0;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/** 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(key: DateKey): number {
  return toLocalDate(key).getDay();
}

export function addDays(key: DateKey, delta: number): DateKey {
  const d = toLocalDate(key);
  d.setDate(d.getDate() + delta);
  return makeDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const MS_PER_DAY = 86_400_000;
  // Compare UTC midnights so a DST boundary between the two dates cannot
  // produce a 23- or 25-hour day and round the result off by one.
  const a = Date.UTC(...utcParts(from));
  const b = Date.UTC(...utcParts(to));
  return Math.round((b - a) / MS_PER_DAY);
}

function utcParts(key: DateKey): [number, number, number] {
  const { year, month, day } = parseDateKey(key);
  return [year, month - 1, day];
}

export function isSameMonth(key: DateKey, year: number, month: number): boolean {
  const p = parseDateKey(key);
  return p.year === year && p.month === month;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const WEEKDAY_ABBR = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/** "Saturday, 3 May" — the long form used on the day screen. */
export function formatLongDate(key: DateKey): string {
  const d = toLocalDate(key);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  const { day, month } = parseDateKey(key);
  return `${weekday}, ${day} ${monthName(month)}`;
}

/** 24h `HH:MM` rendered for display, e.g. "7:30pm". */
export function formatTime(time: TimeKey): string {
  const hours = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === '00' ? `${display}${suffix}` : `${display}:${minutes}${suffix}`;
}

/**
 * Plain-language distance used on the year screen and the widget.
 * Red Letter never shows a streak or a running total; it only ever answers
 * "when is the next one".
 */
export function describeDistance(from: DateKey, to: DateKey): string {
  const delta = daysBetween(from, to);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta < 0) return `${Math.abs(delta)} days ago`;
  if (delta < 7) return `In ${delta} days`;
  if (delta < 14) return 'Next week';
  if (delta < 45) return `In ${Math.round(delta / 7)} weeks`;
  return `In ${Math.round(delta / 30)} months`;
}

/** Weeks of a month as `DateKey | null` grids, Sunday-first, for the month view. */
export function monthGrid(year: number, month: number): (DateKey | null)[][] {
  const total = daysInMonth(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: (DateKey | null)[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= total; day += 1) cells.push(makeDateKey(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
