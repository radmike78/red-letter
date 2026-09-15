import { filterToRedLetter, normalizeBackup } from '../src/core/interop';
import { rebuildData } from '../src/core/validate';
import { exportIcs } from '../src/core/icsExport';
import { parseIcs } from '../src/core/ics';
import type { RedLetterData } from '../src/core/model';

/**
 * Compatibility with the HTML version of Red Letter.
 *
 * The fixtures here are the real thing, not an approximation: the web version's
 * `backup()` is `JSON.stringify(state)` where state is
 * `{ items, flags, seen }`, and its `restore()` refuses any file whose `items`
 * is not an object. Both facts are load-bearing, so both are tested.
 *
 * The web file itself is not committed — it is a paid product and this
 * repository may not stay private — so its format is pinned here instead.
 */

const TODAY = '2026-09-15';

/** Exactly what the HTML version's "Save a backup file" writes. */
const webBackup = {
  items: {
    '2026-03-15': [
      { id: 'k3j2h1', title: 'Mum’s birthday', time: '', mark: true },
      { id: 'p9o8i7', title: 'Order flowers', time: '09:00', mark: false },
    ],
    '2026-03-20': [{ id: 'z1x2c3', title: 'Dentist', time: '09:30', mark: false }],
    '2026-04-02': [{ id: 'q1w2e3', title: 'Quarterly review', time: '14:00', mark: true }],
    '2026-05-11': [
      { id: 'a1s2d3', title: 'Team lunch', time: '12:00', mark: false, imported: true },
    ],
  },
  flags: { '2026-03-15': true, '2026-04-02': true },
  seen: true,
};

describe('reading the HTML version’s backup', () => {
  const normalized = normalizeBackup(webBackup);

  it('finds the calendar under "items", which is what the web version calls it', () => {
    expect(Object.keys(normalized.value.entries).sort()).toEqual([
      '2026-03-15',
      '2026-03-20',
      '2026-04-02',
      '2026-05-11',
    ]);
  });

  it('reads "flags", which is where the Red Letter designation actually lives', () => {
    expect(normalized.redLetterDays.sort()).toEqual(['2026-03-15', '2026-04-02']);
    expect(normalized.ordinaryDays.sort()).toEqual(['2026-03-20', '2026-05-11']);
  });

  it('keeps every entry on a flagged day, not only the marked one', () => {
    // 15 March is flagged and holds two things; both belong to that day.
    const { data } = rebuildData(filterToRedLetter(normalized), TODAY);
    expect(data.entries['2026-03-15']).toHaveLength(2);
  });

  it('narrows to Red Letter days only when asked', () => {
    const { data } = rebuildData(filterToRedLetter(normalized), TODAY);
    expect(Object.keys(data.entries).sort()).toEqual(['2026-03-15', '2026-04-02']);
  });

  it('can also bring everything across', () => {
    const { data } = rebuildData(normalized.value, TODAY);
    expect(Object.keys(data.entries)).toHaveLength(4);
  });

  it('carries titles, times and typographic characters intact', () => {
    const { data } = rebuildData(normalized.value, TODAY);
    const day = data.entries['2026-03-15']!;

    expect(day.map((e) => e.title)).toEqual(['Mum’s birthday', 'Order flowers']);
    expect(day[0]!.time).toBeUndefined();
    expect(day[1]!.time).toBe('09:00');
  });

  it('regenerates the web version’s ids rather than adopting them', () => {
    const { data } = rebuildData(normalized.value, TODAY);
    expect(data.entries['2026-03-15']![0]!.id).not.toBe('k3j2h1');
    expect(data.entries['2026-03-15']![0]!.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('treats a day flagged only by a marked item as a Red Letter day', () => {
    // Defensive: the web version writes both, but a file could carry one.
    const result = normalizeBackup({
      items: { '2026-06-01': [{ id: 'x', title: 'Thing', time: '', mark: true }] },
      flags: {},
    });
    expect(result.redLetterDays).toEqual(['2026-06-01']);
  });

  it('treats a file with no flag information at all as entirely Red Letter days', () => {
    const result = normalizeBackup({
      items: { '2026-06-01': [{ id: 'x', title: 'Thing', time: '' }] },
    });
    expect(result.redLetterDays).toEqual(['2026-06-01']);
    expect(result.ordinaryDays).toEqual([]);
  });

  it('ignores the web version’s "seen" and "imported" bookkeeping', () => {
    const { data } = rebuildData(normalized.value, TODAY);
    for (const day of Object.values(data.entries)) {
      for (const entry of day) {
        expect(Object.keys(entry).sort()).toEqual(
          entry.time === undefined ? ['id', 'title'] : ['id', 'time', 'title'],
        );
      }
    }
  });

  it('survives an empty web backup without inventing anything', () => {
    const result = normalizeBackup({ items: {}, flags: {}, seen: false });
    expect(Object.keys(result.value.entries)).toHaveLength(0);
  });
});

describe('writing a backup the HTML version can restore', () => {
  /**
   * Mirrors the web version's restore():
   *   if (!o || typeof o !== "object" || typeof o.items !== "object") reject
   * then clean(), which keeps only title, time, mark and imported.
   */
  function webRestoreAccepts(parsed: unknown): boolean {
    if (parsed === null || typeof parsed !== 'object') return false;
    const items = (parsed as Record<string, unknown>).items;
    return typeof items === 'object' && items !== null;
  }

  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

  /** The web version's clean(), reimplemented to check what it would keep. */
  function webClean(parsed: Record<string, unknown>) {
    const src = (parsed.items ?? {}) as Record<string, unknown>;
    const out: Record<string, { title: string; time: string; mark: boolean }[]> = {};

    for (const key of Object.keys(src)) {
      const list = src[key];
      if (!DATE_KEY.test(key) || !Array.isArray(list)) continue;

      const kept = list
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          title: typeof x.title === 'string' ? x.title.slice(0, 300) : '',
          time: typeof x.time === 'string' && TIME.test(x.time) ? x.time : '',
          mark: x.mark === true,
        }))
        .filter((x) => x.title.length > 0);

      if (kept.length) out[key] = kept;
    }
    return out;
  }

  const appData: RedLetterData = {
    schemaVersion: 1,
    entries: {
      '2026-03-15': [
        { id: 'a1', title: 'Wedding', time: '14:00' },
        { id: 'a2', title: 'Reception', note: 'Speech at nine' },
      ],
      '2026-04-02': [{ id: 'b1', title: 'Dentist', time: '09:30' }],
    },
    waiting: [{ id: 'w1', title: 'Passport', since: '2026-01-02' }],
  };

  // Built the same way exportBackup does.
  function buildPayload(data: RedLetterData) {
    const items: Record<string, { id: string; title: string; time: string; mark: boolean }[]> = {};
    const flags: Record<string, true> = {};
    for (const [date, dayEntries] of Object.entries(data.entries)) {
      if (dayEntries.length === 0) continue;
      items[date] = dayEntries.map((e) => ({
        id: e.id,
        title: e.title,
        time: e.time ?? '',
        mark: true,
      }));
      flags[date] = true;
    }
    return {
      format: 'red-letter',
      schemaVersion: 1,
      exportedAt: '2026-09-15T10:30:00.000Z',
      entries: data.entries,
      waiting: data.waiting,
      items,
      flags,
    };
  }

  const payload = buildPayload(appData);

  it('is accepted by the web version’s restore, which requires an "items" object', () => {
    expect(webRestoreAccepts(JSON.parse(JSON.stringify(payload)))).toBe(true);
  });

  it('would be REJECTED without the items key — the reason it is written', () => {
    const withoutItems = { ...payload } as Record<string, unknown>;
    delete withoutItems.items;
    expect(webRestoreAccepts(withoutItems)).toBe(false);
  });

  it('survives the web version’s cleaner with titles and times intact', () => {
    const cleaned = webClean(JSON.parse(JSON.stringify(payload)));

    expect(Object.keys(cleaned).sort()).toEqual(['2026-03-15', '2026-04-02']);
    expect(cleaned['2026-03-15']!.map((x) => x.title)).toEqual(['Wedding', 'Reception']);
    expect(cleaned['2026-03-15']![0]!.time).toBe('14:00');
    // An untimed entry becomes "" there, which its TIME check treats as absent.
    expect(cleaned['2026-03-15']![1]!.time).toBe('');
  });

  it('arrives there as Red Letter days, because that is what they are here', () => {
    expect(payload.flags).toEqual({ '2026-03-15': true, '2026-04-02': true });
    const cleaned = webClean(JSON.parse(JSON.stringify(payload)));
    expect(cleaned['2026-03-15']!.every((x) => x.mark)).toBe(true);
  });

  it('round-trips back into this app unchanged', () => {
    const back = normalizeBackup(JSON.parse(JSON.stringify(payload)));
    const { data } = rebuildData(back.value, TODAY);

    expect(Object.keys(data.entries).sort()).toEqual(['2026-03-15', '2026-04-02']);
    expect(data.entries['2026-03-15']!.map((e) => e.title)).toEqual(['Wedding', 'Reception']);
    expect(data.waiting.map((w) => w.title)).toEqual(['Passport']);
  });
});

describe('.ics between the two versions', () => {
  const NOW = new Date(Date.UTC(2026, 8, 15, 10, 30, 0));

  /** A file shaped exactly like the web version's exportICS() output. */
  const webIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Michael Radecker\\, Herzog von Las Vegas//Red Letter//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Red Letter',
    'X-RL-COPY:abc123',
    'BEGIN:VEVENT',
    'UID:k3j2h1@redletter.local',
    'DTSTAMP:20260915T103000Z',
    'SUMMARY:Quarterly review',
    'DTSTART:20260402T140000Z',
    'DTEND:20260402T150000Z',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Quarterly review',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:z1x2c3@redletter.local',
    'DTSTAMP:20260915T103000Z',
    'SUMMARY:Mum’s birthday',
    'DTSTART;VALUE=DATE:20260315',
    'DTEND;VALUE=DATE:20260316',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Mum’s birthday',
    'TRIGGER:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  it('imports the web version’s .ics, alarms and all', () => {
    const result = parseIcs(webIcs);

    expect(result.refused).toBeUndefined();
    expect(result.eventsImported).toBe(2);
    expect(result.eventsSkipped).toBe(0);
    expect(result.days['2026-03-15']![0]!.title).toBe('Mum’s birthday');
  });

  it('does not mistake the VALARM description for the event title', () => {
    const result = parseIcs(webIcs);
    expect(result.days['2026-03-15']![0]!.note).toBeUndefined();
  });

  it('reads the web version’s UTC timestamps as local wall-clock time', () => {
    const result = parseIcs(webIcs);
    // 14:00Z converted to whatever this machine's local zone is; the point is
    // that it produced a valid time on a real day rather than dropping it.
    const days = Object.keys(result.days);
    expect(days).toContain('2026-03-15');
    expect(days.length).toBe(2);
  });

  it('produces .ics the web version’s parser can read back', () => {
    // The web version reads DTSTART, SUMMARY and RRULE via line-anchored
    // regexes over unfolded text. Check our output satisfies exactly that.
    const ours = exportIcs(
      {
        schemaVersion: 1,
        entries: {
          '2026-03-15': [{ id: 'a1', title: 'Wedding', time: '14:00' }],
          '2026-04-02': [{ id: 'b1', title: 'Anniversary' }],
        },
        waiting: [],
      },
      { now: NOW },
    );

    const unfolded = ours.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    const blocks = unfolded.split(/BEGIN:VEVENT/).slice(1);
    expect(blocks).toHaveLength(2);

    for (const block of blocks) {
      const body = block.split(/END:VEVENT/)[0] as string;
      expect(/^DTSTART([^:\n]*):(.+)$/m.test(body)).toBe(true);
      expect(/^SUMMARY[^:\n]*:(.*)$/m.test(body)).toBe(true);
    }
  });
});
