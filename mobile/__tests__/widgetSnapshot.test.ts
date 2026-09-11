import type { Entry, RedLetterData } from '../src/core/model';
import { buildWidgetSnapshot, serialiseWidgetSnapshot } from '../src/features/widgetSnapshot';

const entry = (title: string, time?: string): Entry =>
  time ? { id: title, title, time } : { id: title, title };

const data = (entries: Record<string, Entry[]>): RedLetterData => ({
  schemaVersion: 1,
  entries,
  waiting: [],
});

const TODAY = '2026-03-01';

describe('buildWidgetSnapshot', () => {
  it('describes the next marked day', () => {
    const snapshot = buildWidgetSnapshot(
      data({ '2026-03-15': [entry('Wedding', '14:00'), entry('Reception', '19:00')] }),
      TODAY,
    );

    expect(snapshot.hasNext).toBe(true);
    expect(snapshot.title).toBe('Wedding');
    expect(snapshot.date).toBe('2026-03-15');
    expect(snapshot.count).toBe(2);
    expect(snapshot.distance).toBe('In 2 weeks');
    expect(snapshot.longDate).toBe('Sunday, 15 March');
    expect(snapshot.builtFor).toBe(TODAY);
  });

  it('reports an empty calendar without inventing a day', () => {
    const snapshot = buildWidgetSnapshot(data({}), TODAY);

    expect(snapshot.hasNext).toBe(false);
    expect(snapshot.title).toBe('');
    expect(snapshot.date).toBe('');
    expect(snapshot.count).toBe(0);
  });

  it('ignores days that have already passed', () => {
    expect(buildWidgetSnapshot(data({ '2025-01-01': [entry('Gone')] }), TODAY).hasNext).toBe(false);
  });

  it('truncates a long title rather than overflowing the widget', () => {
    const snapshot = buildWidgetSnapshot(
      data({ '2026-03-15': [entry('x'.repeat(300))] }),
      TODAY,
    );

    expect(snapshot.title).toHaveLength(60);
    expect(snapshot.title.endsWith('…')).toBe(true);
  });

  it('sanitises the title again on the way out to the widget process', () => {
    const snapshot = buildWidgetSnapshot(
      data({ '2026-03-15': [{ id: 'x', title: 'Invoice\u202Egnp.exe' }] }),
      TODAY,
    );
    expect(snapshot.title).toBe('Invoicegnp.exe');
  });

  it('carries no field beyond the one line it needs', () => {
    const snapshot = buildWidgetSnapshot(
      data({ '2026-03-15': [{ id: 'x', title: 'Oncologist', note: 'Results back' }] }),
      TODAY,
    );

    expect(serialiseWidgetSnapshot(snapshot)).not.toContain('Results back');
    expect(Object.keys(snapshot).sort()).toEqual([
      'builtFor',
      'count',
      'date',
      'distance',
      'hasNext',
      'longDate',
      'title',
      'version',
    ]);
  });

  it('leaks no other day in the calendar', () => {
    const json = serialiseWidgetSnapshot(
      buildWidgetSnapshot(
        data({
          '2026-03-15': [entry('Wedding')],
          '2026-04-02': [entry('Court hearing')],
          '2026-05-09': [entry('Scan results')],
        }),
        TODAY,
      ),
    );

    expect(json).toContain('Wedding');
    expect(json).not.toContain('Court hearing');
    expect(json).not.toContain('Scan results');
  });

  it('says Today when the next marked day is today', () => {
    expect(buildWidgetSnapshot(data({ [TODAY]: [entry('Now')] }), TODAY).distance).toBe('Today');
  });
});
