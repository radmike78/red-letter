import { Directory, File, Paths } from 'expo-file-system';
import { EnvelopeError, open, seal } from '../core/envelope';
import { todayKey } from '../core/dates';
import { emptyData, type RedLetterData } from '../core/model';
import { rebuildData } from '../core/validate';
import { getOrCreateDataKey } from './keys';

/**
 * Reading and writing the encrypted data file.
 *
 * Two rules govern this module. Writes are atomic — a new file is written
 * alongside the old one and moved into place — because a calendar half-written
 * during a crash or a low-battery shutdown is worse than one that is a few
 * seconds stale. And anything read back off disk is passed through the same
 * rebuild as a restored backup: a file that has been modified on a rooted
 * device is as untrusted as one a stranger emailed.
 */

const DIRECTORY_NAME = 'redletter';
const DATA_FILENAME = 'calendar.rlen';
const TEMP_FILENAME = 'calendar.rlen.tmp';

function directory(): Directory {
  return new Directory(Paths.document, DIRECTORY_NAME);
}

function ensureDirectory(): Directory {
  const dir = directory();
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type LoadStatus = 'ok' | 'empty' | 'unreadable';

export interface LoadResult {
  data: RedLetterData;
  status: LoadStatus;
  /** Set when `status` is `unreadable`, for the message shown to the user. */
  reason?: EnvelopeError['reason'];
}

export async function loadData(): Promise<LoadResult> {
  const key = await getOrCreateDataKey();
  const file = new File(directory(), DATA_FILENAME);

  if (!file.exists) return { data: emptyData(), status: 'empty' };

  let raw: unknown;
  try {
    raw = open(file.bytesSync(), key);
  } catch (error) {
    if (error instanceof EnvelopeError) {
      // The file is left on disk untouched. Overwriting it would destroy the
      // only copy of data that a correct key might still recover.
      return { data: emptyData(), status: 'unreadable', reason: error.reason };
    }
    return { data: emptyData(), status: 'unreadable' };
  }

  // Our own file still goes through the full rebuild. It is cheap, and it means
  // there is exactly one path by which data can enter the app.
  const { data } = rebuildData(raw, todayKey());
  return { data, status: 'ok' };
}

export async function saveData(data: RedLetterData): Promise<void> {
  const key = await getOrCreateDataKey();
  const dir = ensureDirectory();

  const temp = new File(dir, TEMP_FILENAME);
  if (temp.exists) temp.delete();
  temp.create();
  temp.write(seal(data, key));

  const target = new File(dir, DATA_FILENAME);
  if (target.exists) target.delete();
  temp.moveSync(target);
}

/** Used by "Delete everything". Removes the file as well as the key. */
export async function destroyData(): Promise<void> {
  const dir = directory();
  if (dir.exists) dir.delete();
}
