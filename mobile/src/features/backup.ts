import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { todayKey } from '../core/dates';
import { parseIcs, type IcsImportResult } from '../core/ics';
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

export interface BackupFile {
  format: 'red-letter';
  schemaVersion: number;
  exportedAt: string;
  entries: RedLetterData['entries'];
  waiting: RedLetterData['waiting'];
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

  const payload: BackupFile = {
    format: 'red-letter',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries: data.entries,
    waiting: data.waiting,
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

export type RestoreOutcome =
  | { ok: true; data: RedLetterData; report: RestoreReport }
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

  const { data, report } = rebuildData(raw, todayKey());

  // A file that produced nothing at all is more likely the wrong file than an
  // empty calendar, and saying so is more useful than silently wiping theirs.
  if (report.entriesKept === 0 && report.waitingKept === 0) {
    return { ok: false, reason: 'not-a-backup' };
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
