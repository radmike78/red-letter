import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WEEKDAY_ABBR,
  formatTime,
  monthGrid,
  monthName,
  parseDateKey,
  todayKey,
} from '../../src/core/dates';
import { sortDayEntries } from '../../src/core/queries';
import { useStore } from '../../src/storage/repository';
import { space, type, useTheme } from '../../src/ui/theme';

/** Matches the `YYYY-MM` route parameter. */
const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export default function MonthScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, today } = useStore();
  const params = useLocalSearchParams<{ month: string }>();

  // The route parameter is as untrusted as any other input: it can arrive from
  // a deep link. An unparseable one falls back to the current month.
  const match = MONTH_PARAM.exec(params.month ?? '');
  const year = match ? Number(match[1]) : parseDateKey(todayKey()).year;
  const month = match ? Number(match[2]) : parseDateKey(todayKey()).month;

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const cell = Math.floor((width - space.md * 2) / 7);

  const markedInMonth = useMemo(
    () =>
      weeks
        .flat()
        .filter((date): date is string => date !== null)
        .filter((date) => (data.entries[date]?.length ?? 0) > 0),
    [weeks, data.entries],
  );

  return (
    <>
      <Stack.Screen options={{ title: `${monthName(month)} ${year}` }} />
      <ScrollView
        style={{ backgroundColor: theme.paper }}
        contentContainerStyle={{
          paddingHorizontal: space.md,
          paddingBottom: insets.bottom + space.xxl,
        }}
      >
        <View style={styles.weekdayRow}>
          {WEEKDAY_ABBR.map((label, index) => (
            <View key={`${label}-${index}`} style={{ width: cell }}>
              <Text style={[type.caption, styles.weekday, { color: theme.inkFaint }]}>{label}</Text>
            </View>
          ))}
        </View>

        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((date, dayIndex) => {
              if (date === null) {
                return <View key={`blank-${dayIndex}`} style={{ width: cell, height: cell }} />;
              }

              const count = data.entries[date]?.length ?? 0;
              const isToday = date === today;
              const { day } = parseDateKey(date);

              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${monthName(month)}${
                    count > 0 ? `, ${count} marked` : ', nothing marked'
                  }`}
                  onPress={() => router.push(`/day/${date}`)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    { width: cell, height: cell, opacity: pressed ? 0.5 : 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.dayInner,
                      isToday ? { borderColor: theme.ink, borderWidth: 1 } : null,
                    ]}
                  >
                    <Text
                      style={[
                        type.small,
                        { color: count > 0 ? theme.red : theme.inkMuted },
                        count > 0 ? styles.markedNumber : null,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={[styles.rule, { backgroundColor: theme.rule }]} />

        {markedInMonth.length === 0 ? (
          <Text style={[type.body, styles.empty, { color: theme.inkFaint }]}>
            Nothing this month.
          </Text>
        ) : (
          markedInMonth.map((date) => {
            const entries = sortDayEntries(data.entries[date] ?? []);
            const { day } = parseDateKey(date);

            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                onPress={() => router.push(`/day/${date}`)}
                style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[type.heading, styles.listDay, { color: theme.red }]}>{day}</Text>
                <View style={styles.listBody}>
                  {entries.map((entry) => (
                    <View key={entry.id} style={styles.listEntry}>
                      <Text style={[type.body, { color: theme.ink }]} numberOfLines={2}>
                        {entry.title}
                      </Text>
                      {entry.time ? (
                        <Text style={[type.small, { color: theme.inkMuted }]}>
                          {formatTime(entry.time)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  weekdayRow: { flexDirection: 'row', marginBottom: space.sm },
  weekday: { textAlign: 'center' },
  week: { flexDirection: 'row' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  dayInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markedNumber: { fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  empty: { textAlign: 'center', paddingVertical: space.lg },
  listRow: { flexDirection: 'row', paddingVertical: space.md },
  listDay: { width: 36 },
  listBody: { flex: 1, gap: space.xs },
  listEntry: { gap: 2 },
});
