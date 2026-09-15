import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MONTH_ABBR, WEEKDAY_SHORT, mondayIndex, parseDateKey, type DateKey } from '../core/dates';
import type { RedLetterData } from '../core/model';
import { markedDaysWithin } from '../core/queries';
import { space, type, useTheme } from './theme';

/** Days ahead the bar looks. A month, as its own sentence says. */
const WINDOW_DAYS = 30;

/** Chips shown before it stops listing and counts instead. */
const CHIP_LIMIT = 8;

/**
 * The triage bar.
 *
 * This is the web version's best idea and the thing that makes Red Letter a
 * product rather than a calendar: it answers, before you have looked at
 * anything, how much of the next month actually asks something of you. When the
 * answer is nothing it says so plainly and calls that a success, because it is.
 */
export function Triage({
  data,
  today,
  onPickDay,
}: {
  data: RedLetterData;
  today: DateKey;
  onPickDay: (date: DateKey) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const days = useMemo(() => markedDaysWithin(data, today, WINDOW_DAYS), [data, today]);

  if (days.length === 0) {
    return (
      <View
        style={[
          styles.bar,
          { backgroundColor: theme.surface, borderColor: theme.line, borderLeftColor: theme.ink },
        ]}
      >
        <Text style={[type.serifHeading, { color: theme.ink }]}>
          No Red Letter days in the next month.
        </Text>
        <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
          That is not a gap in your planning. That is the planner working.
        </Text>
      </View>
    );
  }

  const shown = days.slice(0, CHIP_LIMIT);
  const one = days.length === 1;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.surface, borderColor: theme.line, borderLeftColor: theme.red },
      ]}
    >
      <Text style={[type.serifHeading, { color: theme.ink }]}>
        {days.length} {one ? 'day' : 'days'} in the next month {one ? 'is a' : 'are'} Red Letter
        {one ? ' day' : ' days'}.
      </Text>

      <View style={styles.chips}>
        {shown.map((day) => {
          const { day: dayNumber, month } = parseDateKey(day.date);
          const count = day.entries.length;

          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={`${dayNumber} ${MONTH_ABBR[month - 1]}, ${count} ${
                count === 1 ? 'thing' : 'things'
              }`}
              onPress={() => onPickDay(day.date)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: theme.redSoft,
                  borderColor: theme.redLine,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[type.small, styles.chipDate, { color: theme.red }]}>
                {WEEKDAY_SHORT[mondayIndex(day.date)]} {dayNumber} {MONTH_ABBR[month - 1]}
              </Text>
              <Text style={[type.small, { color: theme.red }]}>
                {' · '}
                {count} {count === 1 ? 'thing' : 'things'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {days.length > CHIP_LIMIT ? (
        <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
          and {days.length - CHIP_LIMIT} more further out.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingVertical: space.md - 2,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  note: { marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 3 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm + 2,
  },
  chipDate: { fontWeight: '600' },
});
