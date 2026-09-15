import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  MONTH_NAMES,
  WEEKDAY_ABBR,
  daysInMonth,
  makeDateKey,
  parseDateKey,
  type DateKey,
} from '../../core/dates';
import type { RedLetterData } from '../../core/model';
import { markedDaysInYear } from '../../core/queries';
import { space, type, useTheme } from '../theme';

/**
 * Twelve months at once, mostly empty.
 *
 * Every date is printed. Days with nothing on them are faint, days with
 * something are ink, and Red Letter days are red and bold — the same three
 * states the web version uses, which is what lets a year be read at a glance
 * rather than counted.
 */
export function YearView({
  data,
  year,
  today,
  onPickDay,
  onPickMonth,
}: {
  data: RedLetterData;
  year: number;
  today: DateKey;
  onPickDay: (date: DateKey) => void;
  onPickMonth: (month: number) => void;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const marked = React.useMemo(() => markedDaysInYear(data, year), [data, year]);

  const columns = width >= 700 ? 4 : 2;
  const gutter = space.md;
  const columnWidth = (width - gutter * 2 - gutter * (columns - 1)) / columns;

  return (
    <View style={[styles.grid, { gap: gutter }]}>
      {MONTH_NAMES.map((name, index) => (
        <MiniMonth
          key={name}
          year={year}
          month={index + 1}
          name={name}
          data={data}
          marked={marked}
          today={today}
          width={columnWidth}
          onPickDay={onPickDay}
          onPickMonth={onPickMonth}
        />
      ))}
    </View>
  );
}

function MiniMonth({
  year,
  month,
  name,
  data,
  marked,
  today,
  width,
  onPickDay,
  onPickMonth,
}: {
  year: number;
  month: number;
  name: string;
  data: RedLetterData;
  marked: Set<DateKey>;
  today: DateKey;
  width: number;
  onPickDay: (date: DateKey) => void;
  onPickMonth: (month: number) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const total = daysInMonth(year, month);
  // Monday-first, like the web version.
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const cell = Math.floor((width - space.sm) / 7);
  // Sized from the cell, since a year grid gives each day roughly 24pt on a
  // phone and no fixed size survives both that and a tablet.
  const numeral = Math.max(9, Math.min(13, Math.round(cell * 0.46)));

  const cells: (DateKey | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => makeDateKey(year, month, i + 1)),
  ];

  const count = cells.filter((date) => date !== null && marked.has(date)).length;

  return (
    <View style={[styles.month, { width, backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} ${year}, ${count === 0 ? 'nothing marked' : `${count} marked`}`}
        onPress={() => onPickMonth(month)}
        hitSlop={space.xs}
      >
        <Text style={[type.serifSmall, styles.monthName, { color: theme.ink }]}>{name}</Text>
      </Pressable>

      <View style={styles.weekdays}>
        {WEEKDAY_ABBR.map((letter, i) => (
          <Text
            key={`${letter}-${i}`}
            style={[styles.weekday, { width: cell, color: theme.inkFaint, fontSize: numeral - 1 }]}
          >
            {letter}
          </Text>
        ))}
      </View>

      <View style={styles.days}>
        {cells.map((date, index) => {
          if (date === null) {
            return <View key={`blank-${index}`} style={{ width: cell, height: cell }} />;
          }

          const isMarked = marked.has(date);
          const hasSomething = (data.entries[date]?.length ?? 0) > 0;
          const isToday = date === today;

          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${parseDateKey(date).day} ${name}${
                isMarked ? ', marked' : ''
              }`}
              onPress={() => onPickDay(date)}
              style={[styles.dayCell, { width: cell, height: cell }]}
            >
              <View
                style={[
                  styles.ring,
                  {
                    width: cell - 2,
                    height: cell - 2,
                    borderRadius: 2,
                    borderColor: isToday ? theme.ink : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    {
                      fontSize: numeral,
                      color: isMarked ? theme.red : hasSomething ? theme.ink : theme.inkFaint,
                      fontWeight: isMarked ? '700' : '400',
                    },
                  ]}
                >
                  {parseDateKey(date).day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  month: { borderWidth: StyleSheet.hairlineWidth, padding: space.sm, paddingBottom: space.sm + 2 },
  monthName: { marginBottom: space.xs + 2 },
  weekdays: { flexDirection: 'row', marginBottom: 2 },
  weekday: { textAlign: 'center' },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dayNumber: { textAlign: 'center', fontVariant: ['tabular-nums'] },
});
