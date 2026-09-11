import { Link, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MONTH_ABBR,
  daysInMonth,
  describeDistance,
  formatLongDate,
  makeDateKey,
  parseDateKey,
} from '../src/core/dates';
import { markedDaysInYear, nextMarkedDay, sortDayEntries } from '../src/core/queries';
import { useStore } from '../src/storage/repository';
import { space, type, useTheme } from '../src/ui/theme';

/**
 * The year, all of it, mostly empty.
 *
 * Every other planner opens on today. Red Letter opens on the year with twelve
 * months laid out at once and only the marked days inked in, because the empty
 * space is the argument: you can see at a glance that most of your year is
 * unclaimed. Defaulting the zoom outward is the thesis, not a view option.
 */
export default function YearScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, today, ready, loadError } = useStore();

  const [year, setYear] = useState(() => parseDateKey(today).year);

  const marked = useMemo(() => markedDaysInYear(data, year), [data, year]);
  const next = useMemo(() => nextMarkedDay(data, today), [data, today]);
  const thisYear = parseDateKey(today).year;

  // Two columns of months on a phone, three once there is room for them.
  const columns = width >= 700 ? 3 : 2;
  const gutter = space.md;
  const columnWidth = (width - gutter * 2 - gutter * (columns - 1)) / columns;

  return (
    <ScrollView
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: insets.bottom + space.xxl,
        paddingHorizontal: gutter,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Previous year, ${year - 1}`}
          hitSlop={space.md}
          onPress={() => setYear((y) => y - 1)}
        >
          <Text style={[type.title, { color: theme.inkFaint }]}>‹</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Year ${year}. Tap to return to ${thisYear}.`}
          onPress={() => setYear(thisYear)}
        >
          <Text style={[type.display, { color: theme.ink }]}>{year}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next year, ${year + 1}`}
          hitSlop={space.md}
          onPress={() => setYear((y) => y + 1)}
        >
          <Text style={[type.title, { color: theme.inkFaint }]}>›</Text>
        </Pressable>
      </View>

      {loadError ? (
        <View style={[styles.banner, { backgroundColor: theme.redSoft, borderColor: theme.red }]}>
          <Text style={[type.small, { color: theme.ink }]}>{loadError}</Text>
          <Text style={[type.small, styles.bannerHint, { color: theme.inkMuted }]}>
            Restore a backup from Settings to start again.
          </Text>
        </View>
      ) : null}

      <NextDay next={next} today={today} ready={ready} />

      <View style={[styles.grid, { gap: gutter }]}>
        {MONTH_ABBR.map((label, index) => (
          <MiniMonth
            key={label}
            year={year}
            month={index + 1}
            label={label}
            marked={marked}
            today={today}
            width={columnWidth}
            onPress={() => router.push(`/month/${year}-${String(index + 1).padStart(2, '0')}`)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Link href="/waiting" asChild>
          <Pressable accessibilityRole="button" hitSlop={space.sm}>
            <Text style={[type.body, { color: theme.inkMuted }]}>Waiting on</Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" hitSlop={space.sm}>
            <Text style={[type.body, { color: theme.inkMuted }]}>Settings</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

function NextDay({
  next,
  today,
  ready,
}: {
  next: ReturnType<typeof nextMarkedDay>;
  today: string;
  ready: boolean;
}): React.JSX.Element {
  const theme = useTheme();

  if (!ready) return <View style={styles.nextBlock} />;

  if (next === null) {
    return (
      <View style={styles.nextBlock}>
        <Text style={[type.body, { color: theme.inkMuted }]}>Nothing ahead.</Text>
      </View>
    );
  }

  const first = sortDayEntries(next.entries)[0];

  return (
    <Link href={`/day/${next.date}`} asChild>
      <Pressable accessibilityRole="button" style={styles.nextBlock}>
        <Text style={[type.caption, { color: theme.red }]}>
          {describeDistance(today, next.date).toUpperCase()}
        </Text>
        <Text style={[type.title, styles.nextTitle, { color: theme.ink }]} numberOfLines={2}>
          {first?.title ?? ''}
        </Text>
        <Text style={[type.small, { color: theme.inkMuted }]}>
          {formatLongDate(next.date)}
          {next.entries.length > 1 ? ` · ${next.entries.length} things` : ''}
        </Text>
      </Pressable>
    </Link>
  );
}

function MiniMonth({
  year,
  month,
  label,
  marked,
  today,
  width,
  onPress,
}: {
  year: number;
  month: number;
  label: string;
  marked: Set<string>;
  today: string;
  width: number;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const total = daysInMonth(year, month);
  const leading = new Date(year, month - 1, 1).getDay();

  // Seven columns, sized from the available width so the dots stay on a grid.
  const cell = Math.floor((width - space.sm * 2) / 7);
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => makeDateKey(year, month, i + 1)),
  ];

  const count = cells.filter((date) => date !== null && marked.has(date)).length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${year}, ${count === 0 ? 'nothing marked' : `${count} marked`}`}
      onPress={onPress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.monthHeader}>
        <Text style={[type.caption, { color: theme.inkMuted }]}>{label.toUpperCase()}</Text>
        {count > 0 ? <View style={[styles.countDot, { backgroundColor: theme.red }]} /> : null}
      </View>

      <View style={styles.monthGrid}>
        {cells.map((date, index) => {
          if (date === null) {
            return <View key={`blank-${index}`} style={{ width: cell, height: cell }} />;
          }
          const isMarked = marked.has(date);
          const isToday = date === today;

          return (
            <View key={date} style={[styles.dayCell, { width: cell, height: cell }]}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: isMarked ? theme.red : 'transparent',
                    borderColor: isToday ? theme.ink : 'transparent',
                    borderWidth: isToday ? 1 : 0,
                  },
                  !isMarked && !isToday ? { backgroundColor: theme.rule } : null,
                ]}
              />
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  banner: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  bannerHint: { marginTop: space.xs },
  nextBlock: { minHeight: 84, marginTop: space.lg, marginBottom: space.lg, paddingHorizontal: space.sm },
  nextTitle: { marginTop: space.xs, marginBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  countDot: { width: 4, height: 4, borderRadius: 2 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xl,
    paddingHorizontal: space.sm,
  },
});
