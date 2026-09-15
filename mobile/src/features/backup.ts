import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { todayKey } from '../core/dates';
import { parseIcs, type IcsImportResult } from '../core/ics';
import { exportIcs, countExportableEvents } from '../core/icsExport';
import { filterToRedLetter, normalizeBackup } from '../core/interop';
import { LIMITS, SCHEMA_VERSION, type RedLetterData } from '../core/model';
import { rebuildData, type RestoreReport } from '../core/validate';

/**
 * Backup, restore and .ics import.
 *
 * Export is plain JSON on purpose. The encrypted store protects data at rest on
 * the device; a backup the user has deliberately sent to themselves needs to be
 * readable in five years by whatever they have then, and a file only this build
 * of this app can open is not a backup. It is written to the cache directory
 * and handed straight to the share sheet, so it never lingers in a directory
 * that gets swept into a cloud backup.
 */

const EXPORT_DIRECTORY = 'exports';

/**
 * The backup file.
 *
 * It carries the same calendar twice, on purpose.
 *
 * `entries` and `waiting` are this app's own shape. `items` and `flags` are the
 * shape the HTML version reads — its restore refuses any file without an
 * `items` object, so a backup written only in this app's shape would simply not
 * open there. Writing both makes the backup work in either direction, at the
 * cost of a file roughly twice the size, which for a calendar of exceptional
 * days is still a few kilobytes.
 *
 * `flags` marks every day this app holds, because in this app an entry existing
 * *is* the day being marked — there is no unflagged day to distinguish.
 */
export interface BackupFile {
  format: 'red-letter';
  schemaVersion: number;
  exportedAt: string;
  entries: RedLetterData['entries'];
  waiting: RedLetterData['waiting'];
  /** Compatibility with the HTML version's restore. */
  items: Record<string, { id: string; title: string; time: string; mark: boolean }[]>;
  /** Compatibility with the HTML version: every day here is a Red Letter day. */
  flags: Record<string, true>;
}

function exportDirectory(): Directory {
  const dir = new Directory(Paths.cache, EXPORT_DIRECTORY);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Removes anything left from a previous export. */
export function clearExports(): void {
  const dir = new Directory(Paths.cache, EXPORT_DIRECTORY);
  if (dir.exists) dir.delete();
}

export async function exportBackup(data: RedLetterData): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const items: BackupFile['items'] = {};
  const flags: BackupFile['flags'] = {};
  for (const [date, dayEntries] of Object.entries(data.entries)) {
    if (dayEntries.length === 0) continue;
    // The HTML version's cleaner keeps only id, title, time and mark, and drops
    // anything else — notes included. Nothing is lost here that it would have
    // kept, and `entries` above still carries the full record for this app.
    items[date] = dayEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      time: entry.time ?? '',
      mark: true,
    }));
    flags[date] = true;
  }

  const payload: BackupFile = {
    format: 'red-letter',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries: data.entries,
    waiting: data.waiting,
    items,
    flags,
  };

  // Previous exports are cleared first so the share sheet cannot offer a stale
  // file, and so old copies of the user's calendar do not accumulate on disk.
  clearExports();
  const file = new File(exportDirectory(), `red-letter-${todayKey()}.json`);
  file.create();
  file.write(JSON.stringify(payload, null, 2));

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your Red Letter backup',
      UTI: 'public.json',
    });
    return true;
  } finally {
    // Whether they shared it or cancelled, the copy in cache has done its job.
    clearExports();
  }
}

/**
 * Exports the calendar as .ics.
 *
 * This is the interoperability path rather than the backup path. The web
 * version of Red Letter reads .ics, and so does every other calendar, so this
 * is how a marked day leaves the app without either side needing to know about
 * the other's format. Use the JSON backup to move the whole calendar; use this
 * to move the days themselves somewhere else.
 */
export async function exportCalendarFile(data: RedLetterData): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  if (countExportableEvents(data) === 0) return false;

  clearExports();
  const file = new File(exportDirectory(), `red-letter-${todayKey()}.ics`);
  file.create();
  file.write(exportIcs(data));

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Export your marked days',
      UTI: 'com.apple.ical.ics',
    });
    return true;
  } finally {
    clearExports();
  }
}

export type RestoreOutcome =
  | {
      ok: true;
      data: RedLetterData;
      report: RestoreReport;
      /** Set when the file distinguished Red Letter days from ordinary ones. */
      split?: { redLetter: RedLetterData; redLetterDays: number; ordinaryDays: number };
    }
  | { ok: false; reason: 'cancelled' | 'too-large' | 'unreadable' | 'not-a-backup' };

/**
 * Reads a backup the user picks.
 *
 * The file is treated as hostile: size is checked before it is read, JSON
 * parsing is guarded, and the contents go through `rebuildData`, which walks
 * our schema rather than adopting the file's.
 */
export async function pickAndReadBackup(): Promise<RestoreOutcome> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled || picked.assets.length === 0) return { ok: false, reason: 'cancelled' };

  const asset = picked.assets[0];
  if (asset === undefined) return { ok: false, reason: 'cancelled' };
  if (asset.size !== undefined && asset.size > LIMITS.importBytes) {
    return { ok: false, reason: 'too-large' };
  }

  let text: string;
  try {
    const file = new File(asset.uri);
    if (file.size > LIMITS.importBytes) return { ok: false, reason: 'too-large' };
    text = file.textSync();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-a-backup' };
  }

  // Reshaped before it is rebuilt, so a backup written by the web version —
  // whose field names this app does not control — still opens here. The
  // normaliser only moves values; rebuildData still sanitises every one.
  const normalized = normalizeBackup(raw);
  const { data, report } = rebuildData(normalized.value, todayKey());

  // A file that produced nothing at all is more likely the wrong file than an
  // empty calendar, and saying so is more useful than silently wiping theirs.
  if (report.entriesKept === 0 && report.waitingKept === 0) {
    return { ok: false, reason: 'not-a-backup' };
  }

  // The HTML version separates Red Letter days from days that merely have
  // something on them. This app has no such split, so rather than silently
  // promote every dentist appointment to a red day — which would bury the year
  // view — the caller is given both readings and asks the user.
  if (normalized.ordinaryDays.length > 0 && normalized.redLetterDays.length > 0) {
    const redOnly = rebuildData(filterToRedLetter(normalized), todayKey());
    return {
      ok: true,
      data,
      report,
      split: {
        redLetter: redOnly.data,
        redLetterDays: normalized.redLetterDays.length,
        ordinaryDays: normalized.ordinaryDays.length,
      },
    };
  }

  return { ok: true, data, report };
}

export type IcsOutcome =
  | { ok: true; result: IcsImportResult }
  | { ok: false; reason: 'cancelled' | 'too-large' | 'unreadable' | 'not-a-calendar' | 'empty' };

export async function pickAndReadIcs(): Promise<IcsOutcome> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/calendar', 'com.apple.ical.ics', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled || picked.assets.length === 0) return { ok: false, reason: 'cancelled' };

  const asset = picked.assets[0];
  if (asset === undefined) return { ok: false, reason: 'cancelled' };
  if (asset.size !== undefined && asset.size > LIMITS.importBytes) {
    return { ok: false, reason: 'too-large' };
  }

  let text: string;
  let byteLength: number;
  try {
    const file = new File(asset.uri);
    byteLength = file.size;
    if (byteLength > LIMITS.importBytes) return { ok: false, reason: 'too-large' };
    text = file.textSync();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const result = parseIcs(text, { byteLength });
  if (result.refused === 'too-large') return { ok: false, reason: 'too-large' };
  if (result.refused === 'not-a-calendar') return { ok: false, reason: 'not-a-calendar' };
  if (result.refused === 'empty') return { ok: false, reason: 'empty' };

  return { ok: true, result };
}
