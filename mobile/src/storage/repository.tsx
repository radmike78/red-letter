import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { todayKey, type DateKey, type TimeKey } from '../core/dates';
import { LIMITS, emptyData, type Entry, type RedLetterData, type WaitingItem } from '../core/model';
import { mergeDays, type MergeReport } from '../core/queries';
import { newId } from '../core/random';
import { sanitizeNote, sanitizeTitle } from '../core/validate';
import { installPlatformRandom } from './keys';
import { loadData, saveData, type LoadStatus } from './store';

/**
 * Application state.
 *
 * The whole dataset is small by design — a calendar of exceptional days is a
 * few kilobytes even after years of use — so it is held in memory and written
 * out in full on change. That keeps every write atomic and removes a whole
 * class of partial-update bugs.
 */

export interface EntryDraft {
  title: string;
  time?: TimeKey;
  note?: string;
}

export interface RedLetterStore {
  ready: boolean;
  data: RedLetterData;
  loadStatus: LoadStatus;
  /** Set when the data file could not be decrypted, for the warning banner. */
  loadError?: string;
  today: DateKey;

  addEntry(date: DateKey, draft: EntryDraft): void;
  updateEntry(date: DateKey, id: string, draft: EntryDraft): void;
  removeEntry(date: DateKey, id: string): void;
  moveEntry(from: DateKey, id: string, to: DateKey): void;

  addWaiting(title: string, nudgeOn?: DateKey): void;
  removeWaiting(id: string): void;

  importDays(days: Record<DateKey, Entry[]>): MergeReport;
  replaceAll(data: RedLetterData): void;
  clearEverything(): void;
}

const StoreContext = createContext<RedLetterStore | null>(null);

export function useStore(): RedLetterStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useStore must be used inside <RedLetterProvider>');
  return store;
}

/** Milliseconds to coalesce rapid edits into a single write. */
const SAVE_DEBOUNCE_MS = 250;

export function RedLetterProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [data, setData] = useState<RedLetterData>(emptyData);
  const [ready, setReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('empty');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [today, setToday] = useState<DateKey>(() => todayKey());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<RedLetterData | null>(null);
  const writable = useRef(false);

  useEffect(() => {
    let cancelled = false;
    installPlatformRandom();

    void (async () => {
      try {
        const result = await loadData();
        if (cancelled) return;

        setData(result.data);
        setLoadStatus(result.status);
        if (result.status === 'unreadable') {
          setLoadError(
            result.reason === 'authentication'
              ? 'Your calendar file could not be unlocked. It has not been changed or deleted.'
              : 'Your calendar file could not be read. It has not been changed or deleted.',
          );
        }
        // A file we could not decrypt is left alone: writing over it would
        // destroy the only copy that a recovered key could still open.
        writable.current = result.status !== 'unreadable';
      } catch (error) {
        if (cancelled) return;
        setLoadStatus('unreadable');
        setLoadError(error instanceof Error ? error.message : 'Could not open secure storage.');
        writable.current = false;
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Keeps "today" correct if the app is left open across midnight. */
  useEffect(() => {
    const timer = setInterval(() => {
      const current = todayKey();
      setToday((previous) => (previous === current ? previous : current));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const flush = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    if (next === null || !writable.current) return;
    void saveData(next).catch(() => {
      // A failed write leaves the previous file intact. The next edit retries.
    });
  }, []);

  const commit = useCallback(
    (updater: (current: RedLetterData) => RedLetterData) => {
      setData((current) => {
        const next = updater(current);
        pending.current = next;
        if (saveTimer.current !== null) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [flush],
  );

  // Write out anything still queued when the provider goes away.
  useEffect(
    () => () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      flush();
    },
    [flush],
  );

  const buildEntry = useCallback((draft: EntryDraft): Entry | null => {
    const title = sanitizeTitle(draft.title);
    if (title.length === 0) return null;

    const entry: Entry = { id: newId(), title };
    if (draft.time !== undefined && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      entry.time = draft.time;
    }
    const note = sanitizeNote(draft.note);
    if (note.length > 0) entry.note = note;
    return entry;
  }, []);

  const addEntry = useCallback(
    (date: DateKey, draft: EntryDraft) => {
      const entry = buildEntry(draft);
      if (entry === null) return;

      commit((current) => {
        const day = current.entries[date] ?? [];
        if (day.length >= LIMITS.entriesPerDay) return current;
        return { ...current, entries: { ...current.entries, [date]: [...day, entry] } };
      });
    },
    [buildEntry, commit],
  );

  const updateEntry = useCallback(
    (date: DateKey, id: string, draft: EntryDraft) => {
      const rebuilt = buildEntry(draft);
      if (rebuilt === null) return;

      commit((current) => {
        const day = current.entries[date];
        if (!day) return current;
        // The id is preserved so the row keeps its identity; everything else is
        // rebuilt through the same sanitisers as an imported entry.
        const next = day.map((entry) => (entry.id === id ? { ...rebuilt, id } : entry));
        return { ...current, entries: { ...current.entries, [date]: next } };
      });
    },
    [buildEntry, commit],
  );

  const removeEntry = useCallback(
    (date: DateKey, id: string) => {
      commit((current) => {
        const day = current.entries[date];
        if (!day) return current;

        const next = day.filter((entry) => entry.id !== id);
        const entries = { ...current.entries };
        // An empty day is removed outright rather than kept as an empty array:
        // in this product an unmarked day simply does not exist.
        if (next.length === 0) delete entries[date];
        else entries[date] = next;

        return { ...current, entries };
      });
    },
    [commit],
  );

  const moveEntry = useCallback(
    (from: DateKey, id: string, to: DateKey) => {
      if (from === to) return;

      commit((current) => {
        const source = current.entries[from];
        const moving = source?.find((entry) => entry.id === id);
        if (!source || !moving) return current;

        const target = current.entries[to] ?? [];
        if (target.length >= LIMITS.entriesPerDay) return current;

        const entries = { ...current.entries };
        const remaining = source.filter((entry) => entry.id !== id);
        if (remaining.length === 0) delete entries[from];
        else entries[from] = remaining;
        entries[to] = [...target, moving];

        return { ...current, entries };
      });
    },
    [commit],
  );

  const addWaiting = useCallback(
    (title: string, nudgeOn?: DateKey) => {
      const clean = sanitizeTitle(title);
      if (clean.length === 0) return;

      commit((current) => {
        if (current.waiting.length >= LIMITS.waitingItems) return current;
        const item: WaitingItem = { id: newId(), title: clean, since: todayKey() };
        if (nudgeOn !== undefined) item.nudgeOn = nudgeOn;
        return { ...current, waiting: [...current.waiting, item] };
      });
    },
    [commit],
  );

  const removeWaiting = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        waiting: current.waiting.filter((item) => item.id !== id),
      }));
    },
    [commit],
  );

  /**
   * Merging is synchronous so the import screen can report what happened, but
   * the merge itself runs against the latest state inside `commit`.
   */
  const importDays = useCallback(
    (days: Record<DateKey, Entry[]>): MergeReport => {
      let report: MergeReport = { added: 0, duplicatesSkipped: 0, droppedAtLimit: 0 };
      commit((current) => {
        const merged = mergeDays(current, days);
        report = merged.report;
        return merged.data;
      });
      return report;
    },
    [commit],
  );

  const replaceAll = useCallback(
    (next: RedLetterData) => {
      // A restore is allowed to write even when the existing file was
      // unreadable — replacing an unopenable file is the point of restoring.
      writable.current = true;
      commit(() => next);
    },
    [commit],
  );

  const clearEverything = useCallback(() => {
    writable.current = true;
    commit(() => emptyData());
  }, [commit]);

  const value = useMemo<RedLetterStore>(
    () => ({
      ready,
      data,
      loadStatus,
      loadError,
      today,
      addEntry,
      updateEntry,
      removeEntry,
      moveEntry,
      addWaiting,
      removeWaiting,
      importDays,
      replaceAll,
      clearEverything,
    }),
    [
      ready,
      data,
      loadStatus,
      loadError,
      today,
      addEntry,
      updateEntry,
      removeEntry,
      moveEntry,
      addWaiting,
      removeWaiting,
      importDays,
      replaceAll,
      clearEverything,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
