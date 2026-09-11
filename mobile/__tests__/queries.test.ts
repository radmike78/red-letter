import type { Entry, RedLetterData } from '../src/core/model';
import {
  allMarkedDays,
  markedDaysInYear,
  mergeDays,
  monthlyCounts,
  nextMarkedDay,
  pastDays,
  sortDayEntries,
  totalEntryCount,
  upcomingDays,
  waitingByAge,
  yearsWithEntries,
} from '../src/core/queries';

const entry = (title: string, time?: string): Entry =>
  time ? { id: title, title, time } : { id: title, title };

function fixture(): RedLetterData {
  return {
    schemaVersion: 1,
    entries: {
      '2026-01-10': [entry('New year lunch')],
      '2026-03-15': [entry('Wedding', '14:00'), entry('Reception', '19:00')],
      '2026-03-20': [entry('Dentist', '09:00')],
      '2026-11-02': [entry('Anniversary')],
      '2027-01-01': [entry('Next year')],
      '2026-06-01': [],
    },
    waiting: [
      { id: 'w1', title: 'Passport', since: '2026-01-02' },
      { id: 'w2', title: 'Refund', since: '2026-08-01' },
      { id: 'w3', title: 'Builder quote', since: '2025-11-15' },
    ],
  };
}

describe('allMarkedDays', () => {
  it('returns marked days in date order and ignores empty ones', () => {
    expect(allMarkedDays(fixture()).map((d) => d.date)).toEqual([
      '2026-01-10',
      '2026-03-15',
      '2026-03-20',
      '2026-11-02',
      '2027-01-01',
    ]);
  });
});

describe('markedDaysInYear', () => {
  it('only includes days in the requested year', () => {
    const days = markedDaysInYear(fixture(), 2026);
    expect(days.has('2026-03-15')).toBe(true);
    expect(days.has('2027-01-01')).toBe(false);
    expect(days.size).toBe(4);
  });

  it('excludes a day whose entries were all removed', () => {
    expect(markedDaysInYear(fixture(), 2026).has('2026-06-01')).toBe(false);
  });

  it('returns an empty set for a year with nothing in it', () => {
    expect(markedDaysInYear(fixture(), 2030).size).toBe(0);
  });
});

describe('monthlyCounts', () => {
  it('counts marked days per month, not entries', () => {
    const counts = monthlyCounts(fixture(), 2026);
    expect(counts[0]).toBe(1); // January
    expect(counts[2]).toBe(2); // March: two marked days, three entries
    expect(counts[10]).toBe(1); // November
    expect(counts[5]).toBe(0); // June, emptied
    expect(counts).toHaveLength(12);
  });
});

describe('nextMarkedDay', () => {
  it('finds the soonest day on or after today', () => {
    expect(nextMarkedDay(fixture(), '2026-02-01')!.date).toBe('2026-03-15');
  });

  it('counts today itself as the next one', () => {
    expect(nextMarkedDay(fixture(), '2026-03-15')!.date).toBe('2026-03-15');
  });

  it('crosses a year boundary', () => {
    expect(nextMarkedDay(fixture(), '2026-12-01')!.date).toBe('2027-01-01');
  });

  it('returns null when nothing is ahead', () => {
    expect(nextMarkedDay(fixture(), '2030-01-01')).toBeNull();
  });

  it('returns null for empty data', () => {
    expect(nextMarkedDay({ schemaVersion: 1, entries: {}, waiting: [] }, '2026-01-01')).toBeNull();
  });
});

describe('upcomingDays and pastDays', () => {
  it('splits around today, with today counted as upcoming', () => {
    expect(upcomingDays(fixture(), '2026-03-20').map((d) => d.date)).toEqual([
      '2026-03-20',
      '2026-11-02',
      '2027-01-01',
    ]);
    expect(pastDays(fixture(), '2026-03-20').map((d) => d.date)).toEqual([
      '2026-03-15',
      '2026-01-10',
    ]);
  });

  it('respects the limit', () => {
    expect(upcomingDays(fixture(), '2026-01-01', 2)).toHaveLength(2);
  });
});

describe('waitingByAge', () => {
  it('puts the longest wait first', () => {
    expect(waitingByAge(fixture(), '2026-09-11').map((w) => w.title)).toEqual([
      'Builder quote',
      'Passport',
      'Refund',
    ]);
  });

  it('does not mutate the original list', () => {
    const data = fixture();
    waitingByAge(data, '2026-09-11');
    expect(data.waiting[0]!.title).toBe('Passport');
  });
});

describe('totalEntryCount and yearsWithEntries', () => {
  it('counts entries, not days', () => {
    // Five marked days, but 15 March holds two entries.
    expect(totalEntryCount(fixture())).toBe(6);
  });

  it('lists years that actually contain something', () => {
    expect(yearsWithEntries(fixture())).toEqual([2026, 2027]);
  });
});

describe('mergeDays', () => {
  it('adds new entries without mutating the original', () => {
    const data = fixture();
    const { data: merged, report } = mergeDays(data, {
      '2026-05-01': [entry('May day')],
    });

    expect(report.added).toBe(1);
    expect(merged.entries['2026-05-01']).toHaveLength(1);
    expect(data.entries['2026-05-01']).toBeUndefined();
  });

  it('skips an entry that is already there, so re-importing is safe', () => {
    const { data: merged, report } = mergeDays(fixture(), {
      '2026-03-15': [entry('Wedding', '14:00'), entry('Rehearsal', '10:00')],
    });

    expect(report.duplicatesSkipped).toBe(1);
    expect(report.added).toBe(1);
    expect(merged.entries['2026-03-15']).toHaveLength(3);
  });

  it('treats the same title at a different time as a different entry', () => {
    const { report } = mergeDays(fixture(), {
      '2026-03-15': [entry('Wedding', '15:00')],
    });
    expect(report.added).toBe(1);
    expect(report.duplicatesSkipped).toBe(0);
  });

  it('appends to an existing day rather than replacing it', () => {
    const { data: merged } = mergeDays(fixture(), { '2026-03-20': [entry('Lunch', '12:00')] });
    expect(merged.entries['2026-03-20']!.map((e) => e.title)).toEqual(['Dentist', 'Lunch']);
  });

  it('ignores an invalid date key in the incoming set', () => {
    const { data: merged, report } = mergeDays(fixture(), {
      '2026-02-30': [entry('Impossible')],
    });
    expect(report.added).toBe(0);
    expect(merged.entries['2026-02-30']).toBeUndefined();
  });

  it('stops at the per-day limit and reports it', () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(`e${i}`));
    const { data: merged, report } = mergeDays(fixture(), { '2026-04-01': many });

    expect(merged.entries['2026-04-01']).toHaveLength(50);
    expect(report.droppedAtLimit).toBe(10);
  });
});

describe('sortDayEntries', () => {
  it('orders timed entries by time and puts untimed ones last', () => {
    const sorted = sortDayEntries([
      entry('Evening', '19:00'),
      entry('All day'),
      entry('Morning', '09:00'),
    ]);
    expect(sorted.map((e) => e.title)).toEqual(['Morning', 'Evening', 'All day']);
  });

  it('does not mutate its input', () => {
    const original = [entry('b', '19:00'), entry('a', '09:00')];
    sortDayEntries(original);
    expect(original[0]!.title).toBe('b');
  });
});
