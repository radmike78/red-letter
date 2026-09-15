import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WEEKDAY_SHORT, monthGrid, parseDateKey, type DateKey } from '../../core/dates';
import type { RedLetterData } from '../../core/model';
import { sortDayEntries } from '../../core/queries';
import { space, type, useTheme } from '../theme';

/** How many entries a cell shows before it collapses to "+N more". */
const PREVIEW_LIMIT = 3;

/**
 * A month as a grid of cells, each showing what is on the day.
 *
 * A marked day washes its whole cell red rather than only colouring the
 * numeral, so the month reads as a shape before it reads as a list — the same
 * thing the web version does with `.cell.flagged`.
 */
export function MonthView({
  data,
  year,
  month,
  today,
  onPickDay,
}: {
  data: RedLetterData;
  year: number;
  month: number;
  today: DateKey;
  onPickDay: (date: DateKey) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);

  const available = width - space.md * 2;
  const cell = Math.floor(available / 7);
  // The web version gives a cell 104px, dropping to 70 on a narrow phone.
  const cellHeight = width < 560 ? 74 : 104;
  const compact = width < 560;

  return (
    <View style={[styles.frame, { borderColor: theme.line, backgroundColor: theme.line }]}>
      <View style={styles.row}>
        {WEEKDAY_SHORT.map((label) => (
          <View
            key={label}
            style={[styles.head, { width: cell, backgroundColor: theme.surface }]}
          >
            <Text style={[type.caption, { color: theme.inkMuted }]}>
              {compact ? label.slice(0, 1) : label}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.row}>
          {week.map((date, dayIndex) => {
            if (date === null) {
              return (
                <View
                  key={`blank-${dayIndex}`}
                  style={[
                    styles.cell,
                    { width: cell, height: cellHeight, backgroundColor: theme.ground },
                  ]}
                />
              );
            }

            const entries = sortDayEntries(data.entries[date] ?? []);
            const isMarked = entries.length > 0;
            const isToday = date === today;
            const { day } = parseDateKey(date);

            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={`${day}, ${
                  entries.length === 0 ? 'nothing marked' : `${entries.length} marked`
                }`}
                onPress={() => onPickDay(date)}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    width: cell,
                    height: cellHeight,
                    backgroundColor: isMarked ? theme.redSoft : theme.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    {
                      color: isToday ? theme.ink : theme.inkMuted,
                      fontWeight: isToday ? '700' : '400',
                    },
                  ]}
                >
                  {day}
                </Text>

                {entries.slice(0, compact ? 2 : PREVIEW_LIMIT).map((entry) => (
                  <View key={entry.id} style={styles.itemRow}>
                    <View style={[styles.bullet, { backgroundColor: theme.red }]} />
                    <Text
                      numberOfLines={1}
                      style={[styles.item, { color: theme.red, fontSize: compact ? 10 : 12 }]}
                    >
                      {entry.title}
                    </Text>
                  </View>
                ))}

                {entries.length > (compact ? 2 : PREVIEW_LIMIT) ? (
                  <Text style={[styles.more, { color: theme.inkMuted }]}>
                    +{entries.length - (compact ? 2 : PREVIEW_LIMIT)} more
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The hairline gaps between cells are the container's own colour showing
  // through, which is how the web version draws its grid lines too.
  frame: { borderWidth: StyleSheet.hairlineWidth, gap: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: StyleSheet.hairlineWidth },
  head: { paddingVertical: space.xs + 2, alignItems: 'center' },
  cell: { paddingHorizontal: 5, paddingTop: 4 },
  number: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  bullet: { width: 3, height: 3, borderRadius: 2 },
  item: { flex: 1, lineHeight: 14 },
  more: { fontSize: 10, marginTop: 1 },
});
