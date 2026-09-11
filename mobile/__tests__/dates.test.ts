import {
  addDays,
  daysBetween,
  daysInMonth,
  describeDistance,
  formatTime,
  isValidDateKey,
  isValidTimeKey,
  monthGrid,
  todayKey,
} from '../src/core/dates';

describe('isValidDateKey', () => {
  it('accepts a real date', () => {
    expect(isValidDateKey('2026-03-15')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
  });

  it('rejects a syntactically valid but impossible date', () => {
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-04-31')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
  });

  it('rejects anything that is not a padded YYYY-MM-DD string', () => {
    for (const bad of ['2026-3-15', '26-03-15', '2026/03/15', '', 'today', null, 20260315, {}]) {
      expect(isValidDateKey(bad)).toBe(false);
    }
  });

  it('rejects years outside the supported range', () => {
    expect(isValidDateKey('1899-01-01')).toBe(false);
    expect(isValidDateKey('2201-01-01')).toBe(false);
  });
});

describe('isValidTimeKey', () => {
  it('accepts a 24-hour padded time', () => {
    expect(isValidTimeKey('00:00')).toBe(true);
    expect(isValidTimeKey('23:59')).toBe(true);
  });

  it('rejects out-of-range or unpadded values', () => {
    for (const bad of ['24:00', '23:60', '9:30', '0930', '', null, 930]) {
      expect(isValidTimeKey(bad)).toBe(false);
    }
  });
});

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('handles month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-03-15', 1)).toBe('2026-03-16');
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('crosses a leap day correctly', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('daysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-03-15', '2026-03-15')).toBe(0);
    expect(daysBetween('2026-03-15', '2026-03-16')).toBe(1);
    expect(daysBetween('2026-03-16', '2026-03-15')).toBe(-1);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('is not thrown off by a daylight-saving transition', () => {
    // Spans the US and EU spring-forward dates; a naive local-midnight
    // subtraction returns 0.95 days here and rounds inconsistently.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('describeDistance', () => {
  it('uses plain language and never a streak count', () => {
    expect(describeDistance('2026-03-15', '2026-03-15')).toBe('Today');
    expect(describeDistance('2026-03-15', '2026-03-16')).toBe('Tomorrow');
    expect(describeDistance('2026-03-15', '2026-03-14')).toBe('Yesterday');
    expect(describeDistance('2026-03-15', '2026-03-18')).toBe('In 3 days');
    expect(describeDistance('2026-03-15', '2026-03-25')).toBe('Next week');
    expect(describeDistance('2026-03-15', '2026-06-15')).toBe('In 3 months');
    expect(describeDistance('2026-03-15', '2026-03-05')).toBe('10 days ago');
  });
});

describe('formatTime', () => {
  it('renders a 12-hour clock without a redundant :00', () => {
    expect(formatTime('09:00')).toBe('9am');
    expect(formatTime('09:30')).toBe('9:30am');
    expect(formatTime('12:00')).toBe('12pm');
    expect(formatTime('00:00')).toBe('12am');
    expect(formatTime('13:05')).toBe('1:05pm');
    expect(formatTime('23:59')).toBe('11:59pm');
  });
});

describe('monthGrid', () => {
  it('produces whole weeks that contain every day of the month', () => {
    const grid = monthGrid(2026, 3);
    const days = grid.flat().filter((d): d is string => d !== null);

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-03-01');
    expect(days[30]).toBe('2026-03-31');
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it('pads a February that starts on a Sunday with no leading blanks', () => {
    // 2026-02-01 is a Sunday.
    const grid = monthGrid(2026, 2);
    expect(grid[0]![0]).toBe('2026-02-01');
  });

  it('includes the leap day in a leap year', () => {
    const days = monthGrid(2028, 2).flat().filter(Boolean);
    expect(days).toHaveLength(29);
  });
});

describe('todayKey', () => {
  it('reads the local date, not a UTC one', () => {
    const fixed = new Date(2026, 0, 1, 23, 30);
    expect(todayKey(fixed)).toBe('2026-01-01');
  });
});
