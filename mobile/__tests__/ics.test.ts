import { parseIcs, parseIcsStart, parseProperty, unescapeIcsText, unfoldLines } from '../src/core/ics';
import { LIMITS } from '../src/core/model';

function calendar(body: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

function event(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

describe('parseProperty', () => {
  it('splits a bare property', () => {
    expect(parseProperty('SUMMARY:Dentist')).toEqual({
      name: 'SUMMARY',
      params: {},
      value: 'Dentist',
    });
  });

  it('reads parameters', () => {
    const parsed = parseProperty('DTSTART;VALUE=DATE:20260315');
    expect(parsed!.name).toBe('DTSTART');
    expect(parsed!.params.VALUE).toBe('DATE');
    expect(parsed!.value).toBe('20260315');
  });

  it('does not split on a colon inside a quoted parameter', () => {
    const parsed = parseProperty('DTSTART;TZID="Weird:Zone":20260315T090000');
    expect(parsed!.params.TZID).toBe('Weird:Zone');
    expect(parsed!.value).toBe('20260315T090000');
  });

  it('returns null for a line with no colon', () => {
    expect(parseProperty('GARBAGE')).toBeNull();
    expect(parseProperty('')).toBeNull();
  });

  it('refuses to set prototype-polluting parameter names', () => {
    const parsed = parseProperty('DTSTART;__proto__=polluted;VALUE=DATE:20260315');
    expect(parsed!.params.VALUE).toBe('DATE');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(parsed!.params)).toBe(Object.prototype);
  });
});

describe('unescapeIcsText', () => {
  it('handles the RFC 5545 escapes', () => {
    expect(unescapeIcsText('a\\nb')).toBe('a\nb');
    expect(unescapeIcsText('a\\,b')).toBe('a,b');
    expect(unescapeIcsText('a\\;b')).toBe('a;b');
    expect(unescapeIcsText('a\\\\b')).toBe('a\\b');
  });

  it('drops an unknown escape without losing the character', () => {
    expect(unescapeIcsText('a\\qb')).toBe('aqb');
  });

  it('does not hang on a trailing backslash', () => {
    expect(unescapeIcsText('abc\\')).toBe('abc');
  });
});

describe('unfoldLines', () => {
  it('joins folded continuation lines', () => {
    const { lines } = unfoldLines('SUMMARY:Long\r\n  tail');
    expect(lines).toEqual(['SUMMARY:Long tail']);
  });

  it('caps a single line rather than assembling it unboundedly', () => {
    const folded = 'SUMMARY:start' + '\r\n x'.repeat(20_000);
    const { lines, truncated } = unfoldLines(folded);

    expect(truncated).toBe(true);
    expect(lines[0]!.length).toBeLessThanOrEqual(LIMITS.icsLineLength);
  });

  it('caps total line count', () => {
    const many = Array.from({ length: LIMITS.icsLines + 500 }, () => 'X-JUNK:1').join('\r\n');
    const { lines, truncated } = unfoldLines(many);

    expect(lines.length).toBeLessThanOrEqual(LIMITS.icsLines);
    expect(truncated).toBe(true);
  });
});

describe('parseIcsStart', () => {
  it('reads a date-only value', () => {
    expect(parseIcsStart('20260315', true)).toEqual({ date: '2026-03-15' });
  });

  it('reads a floating date-time as wall-clock time', () => {
    expect(parseIcsStart('20260315T091500', false)).toEqual({
      date: '2026-03-15',
      time: '09:15',
    });
  });

  it('rejects an impossible date', () => {
    expect(parseIcsStart('20260230', true)).toBeNull();
    expect(parseIcsStart('20261301', true)).toBeNull();
    expect(parseIcsStart('not-a-date', true)).toBeNull();
    expect(parseIcsStart('', false)).toBeNull();
  });

  it('rejects an impossible time', () => {
    expect(parseIcsStart('20260315T256100', false)).toBeNull();
  });

  it('drops the time when the property declares VALUE=DATE', () => {
    expect(parseIcsStart('20260315T091500', true)).toEqual({ date: '2026-03-15' });
  });

  it('converts a UTC time into the device’s local day', () => {
    const parsed = parseIcsStart('20260315T120000Z', false);
    const expected = new Date(Date.UTC(2026, 2, 15, 12, 0));
    const expectedDay = String(expected.getDate()).padStart(2, '0');

    expect(parsed!.date.slice(8, 10)).toBe(expectedDay);
    expect(parsed!.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('parseIcs', () => {
  it('imports a straightforward event', () => {
    const result = parseIcs(
      calendar(event(['DTSTART;VALUE=DATE:20260315', 'SUMMARY:Wedding'])),
    );

    expect(result.refused).toBeUndefined();
    expect(result.eventsImported).toBe(1);
    expect(result.days['2026-03-15']![0]!.title).toBe('Wedding');
  });

  it('refuses a file that is not a calendar', () => {
    expect(parseIcs('just some text').refused).toBe('not-a-calendar');
    expect(parseIcs('').refused).toBe('empty');
  });

  it('refuses an oversized file before parsing it', () => {
    const result = parseIcs(calendar(event(['SUMMARY:x'])), {
      byteLength: LIMITS.importBytes + 1,
    });
    expect(result.refused).toBe('too-large');
    expect(result.eventsFound).toBe(0);
  });

  it('generates its own ids rather than using UID from the file', () => {
    const result = parseIcs(
      calendar(
        event([
          'UID:" onmouseover="alert(1)',
          'DTSTART;VALUE=DATE:20260315',
          'SUMMARY:Wedding',
        ]),
      ),
    );

    const entry = result.days['2026-03-15']![0]!;
    expect(entry.id).toMatch(/^[0-9a-f]{32}$/);
    expect(Object.keys(entry).sort()).toEqual(['id', 'title']);
  });

  it('sanitises a hostile summary and keeps it as inert text', () => {
    const result = parseIcs(
      calendar(
        event([
          'DTSTART;VALUE=DATE:20260315',
          'SUMMARY:<script>alert(1)</script>',
          'DESCRIPTION:' + 'z'.repeat(50_000),
        ]),
      ),
    );

    const entry = result.days['2026-03-15']![0]!;
    expect(entry.title).toBe('<script>alert(1)</script>');
    expect(entry.note!.length).toBeLessThanOrEqual(LIMITS.noteLength);
  });

  it('skips an event with no title or no usable start', () => {
    const result = parseIcs(
      calendar(
        [
          event(['DTSTART;VALUE=DATE:20260315']),
          event(['SUMMARY:No date']),
          event(['DTSTART;VALUE=DATE:20260230', 'SUMMARY:Impossible date']),
        ].join('\r\n'),
      ),
    );

    expect(result.eventsFound).toBe(3);
    expect(result.eventsImported).toBe(0);
    expect(result.eventsSkipped).toBe(3);
  });

  it('imports a recurring event once and reports it', () => {
    const result = parseIcs(
      calendar(
        event([
          'DTSTART;VALUE=DATE:20260315',
          'RRULE:FREQ=WEEKLY;COUNT=520',
          'SUMMARY:Standup',
        ]),
      ),
    );

    expect(result.eventsImported).toBe(1);
    expect(result.recurringFlattened).toBe(1);
    expect(Object.keys(result.days)).toHaveLength(1);
  });

  it('does not take properties from a nested VALARM as the event’s own', () => {
    const result = parseIcs(
      calendar(
        event([
          'DTSTART;VALUE=DATE:20260315',
          'SUMMARY:Real title',
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'SUMMARY:Alarm title',
          'END:VALARM',
        ]),
      ),
    );

    expect(result.days['2026-03-15']![0]!.title).toBe('Real title');
  });

  it('caps entries landing on a single day', () => {
    const events = Array.from({ length: LIMITS.entriesPerDay + 10 }, (_, i) =>
      event(['DTSTART;VALUE=DATE:20260315', `SUMMARY:Event ${i}`]),
    ).join('\r\n');

    const result = parseIcs(calendar(events));

    expect(result.days['2026-03-15']).toHaveLength(LIMITS.entriesPerDay);
    expect(result.truncated).toBe(true);
  });

  it('never throws on malformed structure', () => {
    const nasty = [
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Unclosed\r\nDTSTART;VALUE=DATE:20260315',
      'BEGIN:VCALENDAR\r\nEND:VEVENT\r\nEND:VCALENDAR',
      'BEGIN:VCALENDAR\r\n' + 'BEGIN:VEVENT\r\n'.repeat(500) + 'END:VCALENDAR',
      'BEGIN:VCALENDAR\r\n:::::\r\n;;;;;\r\nEND:VCALENDAR',
      'BEGIN:VCALENDAR\r\nDTSTART;VALUE=DATE:20260315\r\nEND:VCALENDAR',
    ];

    for (const input of nasty) {
      expect(() => parseIcs(input)).not.toThrow();
    }
  });

  it('keeps a VEVENT left open by a truncated file when it is usable', () => {
    const result = parseIcs(
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260315\r\nSUMMARY:Cut off',
    );
    expect(result.eventsImported).toBe(1);
  });

  it('unfolds a summary split across lines', () => {
    const result = parseIcs(
      calendar('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260315\r\nSUMMARY:Long\r\n  title\r\nEND:VEVENT'),
    );
    expect(result.days['2026-03-15']![0]!.title).toBe('Long title');
  });
});
