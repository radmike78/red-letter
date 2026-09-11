import type { Entry, RedLetterData } from '../src/core/model';
import { planReminders, widgetSummary } from '../src/core/reminders';

const entry = (title: string, time?: string): Entry =>
  time ? { id: title, title, time } : { id: title, title };

function data(entries: Record<string, Entry[]>): RedLetterData {
  return { schemaVersion: 1, entries, waiting: [] };
}

/** A fixed "now" so the tests do not depend on when they run. */
const NOW = new Date(2026, 2, 1, 9, 0, 0); // 1 March 2026, 09:00 local
const TODAY = '2026-03-01';

describe('planReminders', () => {
  it('schedules the evening before a marked day', () => {
    const plan = planReminders(data({ '2026-03-15': [entry('Wedding')] }), TODAY, {
      hour: 19,
      now: NOW,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]!.date).toBe('2026-03-15');
    expect(plan[0]!.fireAt.getFullYear()).toBe(2026);
    expect(plan[0]!.fireAt.getMonth()).toBe(2);
    expect(plan[0]!.fireAt.getDate()).toBe(14);
    expect(plan[0]!.fireAt.getHours()).toBe(19);
    expect(plan[0]!.fireAt.getMinutes()).toBe(0);
  });

  it('uses the configured hour', () => {
    const plan = planReminders(data({ '2026-03-15': [entry('Wedding')] }), TODAY, {
      hour: 8,
      now: NOW,
    });
    expect(plan[0]!.fireAt.getHours()).toBe(8);
  });

  it('falls back to 7pm for an out-of-range hour', () => {
    const plan = planReminders(data({ '2026-03-15': [entry('Wedding')] }), TODAY, {
      hour: 99,
      now: NOW,
    });
    expect(plan[0]!.fireAt.getHours()).toBe(19);
  });

  it('skips a reminder whose time has already passed', () => {
    // It is already 09:00 on 1 March, so the 7pm-on-28-Feb reminder for a
    // 1 March day is in the past and must not fire immediately.
    const plan = planReminders(data({ '2026-03-01': [entry('Today')] }), TODAY, {
      hour: 19,
      now: NOW,
    });
    expect(plan).toHaveLength(0);
  });

  it('still schedules a later-today reminder for tomorrow', () => {
    const plan = planReminders(data({ '2026-03-02': [entry('Tomorrow')] }), TODAY, {
      hour: 19,
      now: NOW,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.fireAt.getDate()).toBe(1);
  });

  it('ignores days in the past', () => {
    const plan = planReminders(
      data({ '2026-01-01': [entry('Gone')], '2026-03-15': [entry('Ahead')] }),
      TODAY,
      { hour: 19, now: NOW },
    );
    expect(plan.map((p) => p.date)).toEqual(['2026-03-15']);
  });

  it('names a single entry and counts the rest', () => {
    const plan = planReminders(
      data({
        '2026-03-15': [entry('Wedding', '14:00')],
        '2026-03-20': [entry('Dentist', '09:00'), entry('Lunch', '12:00'), entry('Talk')],
      }),
      TODAY,
      { hour: 19, now: NOW },
    );

    expect(plan[0]!.body).toBe('Wedding');
    expect(plan[1]!.body).toBe('Dentist and 2 more');
  });

  it('always says "Tomorrow" rather than counting a streak', () => {
    const plan = planReminders(data({ '2026-03-15': [entry('Wedding')] }), TODAY, {
      hour: 19,
      now: NOW,
    });
    expect(plan[0]!.title).toBe('Tomorrow');
  });

  it('respects the cap so iOS does not silently drop notifications', () => {
    const entries: Record<string, Entry[]> = {};
    for (let day = 1; day <= 30; day += 1) {
      entries[`2026-04-${String(day).padStart(2, '0')}`] = [entry(`Day ${day}`)];
    }

    const plan = planReminders(data(entries), TODAY, { hour: 19, max: 10, now: NOW });
    expect(plan).toHaveLength(10);
    expect(plan[0]!.date).toBe('2026-04-01');
  });

  it('returns nothing for an empty calendar', () => {
    expect(planReminders(data({}), TODAY, { hour: 19, now: NOW })).toEqual([]);
  });

  it('skips a day whose entries were all removed', () => {
    expect(planReminders(data({ '2026-03-15': [] }), TODAY, { hour: 19, now: NOW })).toEqual([]);
  });
});

describe('widgetSummary', () => {
  it('reports the next marked day', () => {
    const summary = widgetSummary(
      data({ '2026-03-15': [entry('Wedding', '14:00'), entry('Reception', '19:00')] }),
      TODAY,
    );

    expect(summary).toEqual({ title: 'Wedding', date: '2026-03-15', count: 2 });
  });

  it('picks the earliest entry of the day, not the first stored', () => {
    const summary = widgetSummary(
      data({ '2026-03-15': [entry('Evening', '19:00'), entry('Morning', '09:00')] }),
      TODAY,
    );
    expect(summary!.title).toBe('Morning');
  });

  it('returns null when there is nothing ahead', () => {
    expect(widgetSummary(data({}), TODAY)).toBeNull();
    expect(widgetSummary(data({ '2025-01-01': [entry('Past')] }), TODAY)).toBeNull();
  });
});
