import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  MONTH_ABBR,
  WEEKDAY_SHORT,
  formatTime,
  parseDateKey,
  weekOf,
  type DateKey,
} from '../../core/dates';
import type { RedLetterData } from '../../core/model';
import { sortDayEntries } from '../../core/queries';
import { space, type, useTheme } from '../theme';

/**
 * Seven days side by side, or stacked on a phone.
 *
 * The web version drops its week grid to a single column below 560px and lets
 * each day size to its contents, which is the right call: seven columns on a
 * phone gives each day about fifty points, and nothing readable fits.
 */
export function WeekView({
  data,
  anchor,
  today,
  onPickDay,
}: {
  data: RedLetterData;
  /** Any day in the week to show. */
  anchor: DateKey;
  today: DateKey;
  onPickDay: (date: DateKey) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 560;

  const days = useMemo(() => weekOf(anchor), [anchor]);
  const columnWidth = stacked
    ? '100%'
    : (width - space.md * 2 - StyleSheet.hairlineWidth * 6) / 7;

  return (
    <View
      style={[
        styles.frame,
        { borderColor: theme.line, backgroundColor: theme.line },
        stacked ? styles.stacked : styles.side,
      ]}
    >
      {days.map((date, index) => {
        const entries = sortDayEntries(data.entries[date] ?? []);
        const isMarked = entries.length > 0;
        const isToday = date === today;
        const { day, month } = parseDateKey(date);

        return (
          <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityLabel={`${WEEKDAY_SHORT[index]} ${day} ${MONTH_ABBR[month - 1]}, ${
              entries.length === 0 ? 'nothing marked' : `${entries.length} marked`
            }`}
            onPress={() => onPickDay(date)}
            style={({ pressed }) => [
              styles.column,
              {
                width: columnWidth as number | '100%',
                minHeight: stacked ? 0 : 200,
                backgroundColor: isMarked ? theme.redSoft : theme.surface,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.dayHead}>
              <Text style={[type.serifSmall, { color: theme.ink }]}>{WEEKDAY_SHORT[index]}</Text>
              {isToday ? <View style={[styles.todayDot, { backgroundColor: theme.ink }]} /> : null}
            </View>
            <Text style={[type.tiny, styles.sub, { color: theme.inkMuted }]}>
              {day} {MONTH_ABBR[month - 1]}
            </Text>

            {entries.length === 0 ? (
              <Text style={[type.tiny, { color: theme.inkFaint }]}>—</Text>
            ) : (
              entries.map((entry) => (
                <View key={entry.id} style={styles.entry}>
                  {entry.time ? (
                    <Text style={[type.tiny, styles.time, { color: theme.inkMuted }]}>
                      {formatTime(entry.time)}
                    </Text>
                  ) : null}
                  <Text
                    style={[type.small, styles.title, { color: theme.red }]}
                    numberOfLines={stacked ? 1 : 3}
                  >
                    {entry.title}
                  </Text>
                </View>
              ))
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: StyleSheet.hairlineWidth, gap: StyleSheet.hairlineWidth },
  side: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  column: { padding: space.sm + 2 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  todayDot: { width: 4, height: 4, borderRadius: 2 },
  sub: { marginBottom: space.xs + 2 },
  entry: { flexDirection: 'row', gap: space.xs + 2, marginBottom: space.xs + 2 },
  time: { fontVariant: ['tabular-nums'], marginTop: 2 },
  title: { flex: 1 },
});
