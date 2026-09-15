import { normalizeBackup, normalizeDate, normalizeTime } from '../src/core/interop';
import { rebuildData } from '../src/core/validate';
import { exportIcs, escapeIcsText, foldLine, countExportableEvents } from '../src/core/icsExport';
import { parseIcs } from '../src/core/ics';
import type { RedLetterData } from '../src/core/model';

const TODAY = '2026-09-15';

/** End to end: a foreign file, reshaped and then sanitised, as restore does. */
function importForeign(raw: unknown) {
  return rebuildData(normalizeBackup(raw).value, TODAY);
}

describe('normalizeTime', () => {
  it('reads 12-hour times', () => {
    expect(normalizeTime('9:05 pm')).toBe('21:05');
    expect(normalizeTime('9pm')).toBe('21:00');
    expect(normalizeTime('12:30am')).toBe('00:30');
    expect(normalizeTime('12pm')).toBe('12:00');
    expect(normalizeTime('11:59 P.M.')).toBe('23:59');
  });

  it('pads a bare 24-hour time', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
    expect(normalizeTime('09:05')).toBe('09:05');
  });

  it('reads a compact time', () => {
    expect(normalizeTime('0905')).toBe('09:05');
  });

  it('leaves junk alone for the validator to reject', () => {
    expect(normalizeTime('lunchtime')).toBe('lunchtime');
  });
});

describe('normalizeDate', () => {
  it('passes a date key straight through', () => {
    expect(normalizeDate('2026-03-15')).toBe('2026-03-15');
  });

  it('strips a time or timezone glued onto a date', () => {
    expect(normalizeDate('2026-03-15T00:00:00Z')).toBe('2026-03-15');
    expect(normalizeDate('2026-03-15 09:00')).toBe('2026-03-15');
  });

  it('reads slash-separated ISO order', () => {
    expect(normalizeDate('2026/3/15')).toBe('2026-03-15');
  });
});

describe('normalizeBackup — shapes a web version might have written', () => {
  it('reads this app’s own format unchanged', () => {
    const result = normalizeBackup({
      format: 'red-letter',
      entries: { '2026-03-15': [{ id: 'x', title: 'Wedding', time: '14:00' }] },
      waiting: [{ title: 'Passport', since: '2026-01-02' }],
    });

    expect(result.shape).toBe('red-letter');
    expect(result.value.entries['2026-03-15']).toHaveLength(1);
    expect(result.value.waiting).toHaveLength(1);
  });

  it('reads date keys sitting at the top level with no wrapper', () => {
    const result = normalizeBackup({
      '2026-03-15': [{ title: 'Wedding', time: '2pm' }],
      '2026-04-02': [{ title: 'Dentist' }],
    });

    expect(result.shape).toBe('keyed-days');
    expect(Object.keys(result.value.entries).sort()).toEqual(['2026-03-15', '2026-04-02']);
  });

  it('reads a day holding bare strings rather than objects', () => {
    const { data } = importForeign({ '2026-03-15': ['Wedding', 'Reception'] });
    expect(data.entries['2026-03-15']!.map((e) => e.title)).toEqual(['Wedding', 'Reception']);
  });

  it('reads a single entry that is not wrapped in an array', () => {
    const { data } = importForeign({ '2026-03-15': { title: 'Wedding' } });
    expect(data.entries['2026-03-15']).toHaveLength(1);
  });

  it('reads a flat array where each item carries its own date', () => {
    const { data } = importForeign([
      { date: '2026-03-15', title: 'Wedding', time: '2:00 pm' },
      { day: '2026-04-02', text: 'Dentist' },
    ]);

    expect(data.entries['2026-03-15']![0]!.title).toBe('Wedding');
    expect(data.entries['2026-03-15']![0]!.time).toBe('14:00');
    expect(data.entries['2026-04-02']![0]!.title).toBe('Dentist');
  });

  it('reads alternative container names', () => {
    for (const key of ['days', 'items', 'events', 'marked', 'calendar']) {
      const { data } = importForeign({ [key]: { '2026-03-15': [{ title: 'Wedding' }] } });
      expect(data.entries['2026-03-15']).toHaveLength(1);
    }
  });

  it('unwraps a nested data or state object', () => {
    for (const key of ['data', 'state', 'payload', 'backup']) {
      const { data } = importForeign({
        version: 3,
        [key]: { entries: { '2026-03-15': [{ title: 'Wedding' }] } },
      });
      expect(data.entries['2026-03-15']).toHaveLength(1);
    }
  });

  it('reads alternative field names for the text', () => {
    for (const key of ['title', 'text', 'label', 'name', 'summary']) {
      const { data } = importForeign({ '2026-03-15': [{ [key]: 'Wedding' }] });
      expect(data.entries['2026-03-15']![0]!.title).toBe('Wedding');
    }
  });

  it('merges two source keys that normalise onto the same day', () => {
    const { data } = importForeign({
      '2026-03-15': [{ title: 'Wedding' }],
      '2026-03-15T00:00:00Z': [{ title: 'Reception' }],
    });
    expect(data.entries['2026-03-15']).toHaveLength(2);
  });

  it('reads waiting items under several names', () => {
    for (const key of ['waiting', 'waitingOn', 'blocked', 'pending']) {
      const { data } = importForeign({ [key]: ['Passport', { title: 'Refund' }] });
      expect(data.waiting.map((w) => w.title)).toEqual(['Passport', 'Refund']);
    }
  });

  it('does not duplicate a description that is identical to the title', () => {
    const { data } = importForeign({
      '2026-03-15': [{ title: 'Wedding', description: 'Wedding' }],
    });
    expect(data.entries['2026-03-15']![0]!.note).toBeUndefined();
  });

  it('returns nothing recognisable for junk, rather than wiping the calendar', () => {
    for (const junk of [null, 42, 'a string', {}, [], { nope: true }]) {
      const result = normalizeBackup(junk);
      expect(result.shape).toBe('unknown');
      expect(Object.keys(result.value.entries)).toHaveLength(0);
    }
  });

  it('still sanitises content after reshaping it', () => {
    const { data } = importForeign({
      '2026-03-15': [{ id: '" onmouseover="alert(1)', title: 'Wedding\u202E', time: '25:99' }],
    });
    const entry = data.entries['2026-03-15']![0]!;

    expect(entry.id).toMatch(/^[0-9a-f]{32}$/);
    expect(entry.title).toBe('Wedding');
    expect(entry.time).toBeUndefined();
  });

  it('refuses a prototype-polluting key while reshaping', () => {
    importForeign(JSON.parse('{"__proto__":{"polluted":true},"2026-03-15":[{"title":"ok"}]}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops impossible dates whatever shape they arrived in', () => {
    const { data } = importForeign([
      { date: '2026-02-30', title: 'Not a day' },
      { date: '2026-03-15', title: 'Real' },
    ]);
    expect(Object.keys(data.entries)).toEqual(['2026-03-15']);
  });
});

describe('escapeIcsText', () => {
  it('escapes the RFC 5545 specials', () => {
    expect(escapeIcsText('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
    expect(escapeIcsText('line one\nline two')).toBe('line one\\nline two');
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb');
  });

  it('escapes the backslash first, so escapes are not double-escaped', () => {
    expect(escapeIcsText('\\;')).toBe('\\\\\\;');
  });
});

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:Dentist')).toBe('SUMMARY:Dentist');
  });

  it('folds a long line with a leading space on continuations', () => {
    const folded = foldLine('SUMMARY:' + 'x'.repeat(200));
    expect(folded).toContain('\r\n ');
    for (const piece of folded.split('\r\n')) {
      expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(76);
    }
  });

  it('never splits a multi-byte character', () => {
    // Emoji are four octets each; a character-count fold corrupts these.
    const folded = foldLine('SUMMARY:' + '💒'.repeat(60));
    const rejoined = folded.split('\r\n ').join('');
    expect(rejoined).toBe('SUMMARY:' + '💒'.repeat(60));
    expect(folded).not.toContain('�');
  });
});

describe('exportIcs', () => {
  const NOW = new Date(Date.UTC(2026, 8, 15, 10, 30, 0));

  const data: RedLetterData = {
    schemaVersion: 1,
    entries: {
      '2026-03-15': [
        { id: 'a1', title: 'Wedding', time: '14:00' },
        { id: 'a2', title: 'Reception' },
      ],
      '2026-04-02': [{ id: 'b1', title: 'Dentist; bring form, card', note: 'Ask about the\nquote' }],
    },
    waiting: [],
  };

  const ics = exportIcs(data, { now: NOW });

  it('produces a well-formed calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Red Letter//Red Letter Mobile//EN');
  });

  it('uses CRLF line endings throughout', () => {
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('writes an all-day event with an exclusive DTEND on the following day', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20260315');
    expect(ics).toContain('DTEND;VALUE=DATE:20260316');
  });

  it('writes a timed event as floating local time', () => {
    expect(ics).toContain('DTSTART:20260315T140000');
    expect(ics).toContain('DTEND:20260315T150000');
    expect(ics).not.toContain('DTSTART:20260315T140000Z');
  });

  it('escapes the summary and description', () => {
    expect(ics).toContain('SUMMARY:Dentist\\; bring form\\, card');
    expect(ics).toContain('DESCRIPTION:Ask about the\\nquote');
  });

  it('gives every event a stable, unique UID', () => {
    expect(ics).toContain('UID:a1@red-letter.app');
    expect(ics).toContain('UID:b1@red-letter.app');
  });

  it('counts what it will export', () => {
    expect(countExportableEvents(data)).toBe(3);
  });

  it('produces a valid empty calendar when nothing is marked', () => {
    const empty = exportIcs({ schemaVersion: 1, entries: {}, waiting: [] }, { now: NOW });
    expect(empty).toContain('BEGIN:VCALENDAR');
    expect(empty).not.toContain('BEGIN:VEVENT');
  });
});

describe('round trip — export then re-import through our own parser', () => {
  const NOW = new Date(Date.UTC(2026, 8, 15, 10, 30, 0));

  it('survives a full cycle with titles, times and notes intact', () => {
    const original: RedLetterData = {
      schemaVersion: 1,
      entries: {
        '2026-03-15': [
          { id: 'a1', title: 'Wedding', time: '14:00' },
          { id: 'a2', title: 'Reception' },
        ],
        '2026-04-02': [{ id: 'b1', title: 'Dentist; bring form, card' }],
        '2026-12-31': [{ id: 'c1', title: 'Café résumé 💒', time: '23:30' }],
      },
      waiting: [],
    };

    const parsed = parseIcs(exportIcs(original, { now: NOW }));

    expect(parsed.refused).toBeUndefined();
    expect(parsed.eventsImported).toBe(4);
    expect(parsed.eventsSkipped).toBe(0);

    expect(parsed.days['2026-03-15']!.map((e) => e.title).sort()).toEqual([
      'Reception',
      'Wedding',
    ]);
    expect(parsed.days['2026-03-15']!.find((e) => e.title === 'Wedding')!.time).toBe('14:00');
    expect(parsed.days['2026-03-15']!.find((e) => e.title === 'Reception')!.time).toBeUndefined();
    expect(parsed.days['2026-04-02']![0]!.title).toBe('Dentist; bring form, card');
    expect(parsed.days['2026-12-31']![0]!.title).toBe('Café résumé 💒');
    expect(parsed.days['2026-12-31']![0]!.time).toBe('23:30');
  });

  it('keeps a long title intact across folding', () => {
    const long = 'Anniversary dinner with everyone we have ever met, at the place by the river';
    const parsed = parseIcs(
      exportIcs(
        {
          schemaVersion: 1,
          entries: { '2026-03-15': [{ id: 'x', title: long }] },
          waiting: [],
        },
        { now: NOW },
      ),
    );
    expect(parsed.days['2026-03-15']![0]!.title).toBe(long);
  });

  it('does not shift an all-day event onto the wrong day', () => {
    const parsed = parseIcs(
      exportIcs(
        {
          schemaVersion: 1,
          entries: { '2026-01-01': [{ id: 'x', title: 'New year' }] },
          waiting: [],
        },
        { now: NOW },
      ),
    );
    expect(Object.keys(parsed.days)).toEqual(['2026-01-01']);
  });
});
