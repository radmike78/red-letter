import { LIMITS } from '../src/core/model';
import { rebuildData, rebuildEntry, sanitizeNote, sanitizeTitle } from '../src/core/validate';

const TODAY = '2026-09-11';

describe('sanitizeTitle', () => {
  it('keeps ordinary text unchanged', () => {
    expect(sanitizeTitle('Dentist')).toBe('Dentist');
  });

  it('rejects non-strings rather than coercing them', () => {
    expect(sanitizeTitle(42)).toBe('');
    expect(sanitizeTitle(null)).toBe('');
    expect(sanitizeTitle(undefined)).toBe('');
    expect(sanitizeTitle({ toString: () => 'sneaky' })).toBe('');
    expect(sanitizeTitle(['a'])).toBe('');
  });

  it('strips control characters, including NUL', () => {
    expect(sanitizeTitle('Den\u0000tist')).toBe('Dentist');
    expect(sanitizeTitle('a\u0007b\u001Bc')).toBe('abc');
    expect(sanitizeTitle('a\u009Fb')).toBe('ab');
  });

  it('strips bidi overrides that could visually reorder a title', () => {
    expect(sanitizeTitle('Invoice\u202Egnp.exe')).toBe('Invoicegnp.exe');
    expect(sanitizeTitle('a\u200Bb\u2066c\u2069d')).toBe('abcd');
    expect(sanitizeTitle('\uFEFFDentist')).toBe('Dentist');
  });

  it('collapses newlines and whitespace runs on single-line fields', () => {
    expect(sanitizeTitle('  Dentist \n\n  appointment  ')).toBe('Dentist appointment');
  });

  it('caps length at 300 characters, matching the web version', () => {
    const long = 'x'.repeat(5_000);
    expect(sanitizeTitle(long)).toHaveLength(LIMITS.titleLength);
  });

  it('does not execute or unwrap markup, it just stores the text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    expect(sanitizeTitle(payload)).toBe(payload);
  });
});

describe('sanitizeNote', () => {
  it('keeps paragraph structure but caps blank runs', () => {
    expect(sanitizeNote('one\n\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('caps length', () => {
    expect(sanitizeNote('y'.repeat(50_000))).toHaveLength(LIMITS.noteLength);
  });
});

describe('rebuildEntry', () => {
  it('always regenerates the id and never adopts the file’s', () => {
    const hostile = { id: '" onmouseover="alert(1)', title: 'Dentist' };
    const entry = rebuildEntry(hostile);

    expect(entry).not.toBeNull();
    expect(entry!.id).not.toBe(hostile.id);
    expect(entry!.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('gives two entries built from identical input distinct ids', () => {
    const a = rebuildEntry({ title: 'Same' });
    const b = rebuildEntry({ title: 'Same' });
    expect(a!.id).not.toBe(b!.id);
  });

  it('drops an entry with no usable title', () => {
    expect(rebuildEntry({ title: '   ' })).toBeNull();
    expect(rebuildEntry({ title: '\u0000\u202E' })).toBeNull();
    expect(rebuildEntry({})).toBeNull();
    expect(rebuildEntry(null)).toBeNull();
    expect(rebuildEntry('Dentist')).toBeNull();
  });

  it('keeps a valid time and discards an invalid one', () => {
    expect(rebuildEntry({ title: 'a', time: '09:30' })!.time).toBe('09:30');
    expect(rebuildEntry({ title: 'a', time: '25:00' })!.time).toBeUndefined();
    expect(rebuildEntry({ title: 'a', time: '9:30' })!.time).toBeUndefined();
    expect(rebuildEntry({ title: 'a', time: '"><script>' })!.time).toBeUndefined();
    expect(rebuildEntry({ title: 'a', time: 930 })!.time).toBeUndefined();
  });

  it('copies across no field it was not asked for', () => {
    const entry = rebuildEntry({ title: 'a', evil: 'payload', onclick: 'alert(1)' });
    expect(Object.keys(entry!).sort()).toEqual(['id', 'title']);
  });
});

describe('rebuildData', () => {
  it('rebuilds a well-formed backup', () => {
    const { data, report } = rebuildData(
      {
        entries: { '2026-03-15': [{ title: 'Wedding', time: '14:00' }] },
        waiting: [{ title: 'Passport', since: '2026-01-02' }],
      },
      TODAY,
    );

    expect(Object.keys(data.entries)).toEqual(['2026-03-15']);
    expect(data.entries['2026-03-15']![0]!.title).toBe('Wedding');
    expect(data.waiting[0]!.title).toBe('Passport');
    expect(report.entriesKept).toBe(1);
    expect(report.waitingKept).toBe(1);
  });

  it('refuses malformed top-level input without throwing', () => {
    for (const input of [null, undefined, 'string', 42, [], true]) {
      const { data } = rebuildData(input, TODAY);
      expect(data.entries).toEqual({});
      expect(data.waiting).toEqual([]);
    }
  });

  it('drops date keys that are not real dates', () => {
    const { data, report } = rebuildData(
      {
        entries: {
          '2026-02-30': [{ title: 'Not a day' }],
          '2026-13-01': [{ title: 'Not a month' }],
          '2026-3-15': [{ title: 'Unpadded' }],
          'javascript:alert(1)': [{ title: 'Hostile' }],
          '2026-03-15': [{ title: 'Real' }],
        },
      },
      TODAY,
    );

    expect(Object.keys(data.entries)).toEqual(['2026-03-15']);
    expect(report.daysDropped).toBe(4);
  });

  it('accepts a leap day only in a leap year', () => {
    const leap = rebuildData({ entries: { '2028-02-29': [{ title: 'Leap' }] } }, TODAY);
    expect(Object.keys(leap.data.entries)).toEqual(['2028-02-29']);

    const notLeap = rebuildData({ entries: { '2026-02-29': [{ title: 'Leap' }] } }, TODAY);
    expect(Object.keys(notLeap.data.entries)).toEqual([]);
  });

  it('does not pollute Object.prototype via a crafted key', () => {
    rebuildData(
      { entries: { __proto__: [{ title: 'x' }], constructor: [{ title: 'x' }] } },
      TODAY,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'entries')).toBe(false);
  });

  it('ignores a prototype-polluting payload nested in an entry', () => {
    const { data } = rebuildData(
      JSON.parse('{"entries":{"2026-03-15":[{"title":"ok","__proto__":{"polluted":true}}]}}'),
      TODAY,
    );
    expect(data.entries['2026-03-15']).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('caps entries per day and reports truncation', () => {
    const many = Array.from({ length: LIMITS.entriesPerDay + 25 }, (_, i) => ({ title: `e${i}` }));
    const { data, report } = rebuildData({ entries: { '2026-03-15': many } }, TODAY);

    expect(data.entries['2026-03-15']).toHaveLength(LIMITS.entriesPerDay);
    expect(report.entriesDropped).toBe(25);
    expect(report.truncated).toBe(true);
  });

  it('caps the waiting list', () => {
    const many = Array.from({ length: LIMITS.waitingItems + 10 }, (_, i) => ({ title: `w${i}` }));
    const { data, report } = rebuildData({ waiting: many }, TODAY);

    expect(data.waiting).toHaveLength(LIMITS.waitingItems);
    expect(report.truncated).toBe(true);
  });

  it('falls back to today when a waiting item has no valid start date', () => {
    const { data } = rebuildData({ waiting: [{ title: 'Passport', since: 'not-a-date' }] }, TODAY);
    expect(data.waiting[0]!.since).toBe(TODAY);
  });

  it('drops a day whose entries were all rejected rather than keeping it empty', () => {
    const { data } = rebuildData({ entries: { '2026-03-15': [{ title: '' }, null] } }, TODAY);
    expect(data.entries['2026-03-15']).toBeUndefined();
  });

  it('survives a deeply nested hostile structure', () => {
    let nested: unknown = { title: 'deep' };
    for (let i = 0; i < 2_000; i += 1) nested = { title: 'x', note: nested };

    expect(() => rebuildData({ entries: { '2026-03-15': [nested] } }, TODAY)).not.toThrow();
  });

  it('neutralises a full hostile backup end to end', () => {
    const hostile = {
      entries: {
        '2026-03-15': [
          {
            id: '" onmouseover="alert(1)',
            title: '<script>alert(document.cookie)</script>',
            time: '"><img src=x onerror=alert(1)>',
            note: 'x'.repeat(100_000),
            extra: 'ignored',
          },
        ],
        'constructor': [{ title: 'nope' }],
      },
      waiting: [{ id: 'evil', title: 'a\u0000b', since: '9999-99-99' }],
      schemaVersion: 'not a number',
      somethingElse: { deeply: { nested: true } },
    };

    const { data } = rebuildData(hostile, TODAY);
    const entry = data.entries['2026-03-15']![0]!;

    expect(entry.id).toMatch(/^[0-9a-f]{32}$/);
    expect(entry.time).toBeUndefined();
    expect(entry.note!.length).toBeLessThanOrEqual(LIMITS.noteLength);
    expect(Object.keys(entry).sort()).toEqual(['id', 'note', 'title']);
    expect(data.waiting[0]!.since).toBe(TODAY);
    expect(data.schemaVersion).toBe(1);
    expect(Object.keys(data).sort()).toEqual(['entries', 'schemaVersion', 'waiting']);
  });
});
