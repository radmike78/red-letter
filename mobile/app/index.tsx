import { Link } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MONTH_ABBR,
  MONTH_NAMES,
  addDays,
  makeDateKey,
  parseDateKey,
  startOfWeek,
  type DateKey,
} from '../src/core/dates';
import { useStore } from '../src/storage/repository';
import { Triage } from '../src/ui/Triage';
import { DayView } from '../src/ui/views/DayView';
import { MonthView } from '../src/ui/views/MonthView';
import { WeekView } from '../src/ui/views/WeekView';
import { YearView } from '../src/ui/views/YearView';
import { space, type, useTheme } from '../src/ui/theme';

/** Which of the four calendar scales the home screen is showing. */
type Scale = 'year' | 'month' | 'week' | 'day';

const TABS: { id: Scale; label: string }[] = [
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

/**
 * The home screen, laid out like the web version.
 *
 * Masthead, a stepper for whatever period is showing, four tabs, then the
 * triage bar and the view itself. One cursor drives all four: stepping a month
 * and then switching to Week shows the week you were already looking at, rather
 * than throwing you back to today.
 *
 * It opens on Year. Every other planner opens on today; opening on the year,
 * with most of it deliberately empty, is the argument the product is making.
 */
export default function HomeScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, today, loadError } = useStore();

  const [view, setView] = useState<Scale>('year');
  const [cursor, setCursor] = useState<DateKey>(today);

  const { year, month } = parseDateKey(cursor);

  /** The label between the two arrows, in the units the current view steps in. */
  const period = useMemo(() => {
    if (view === 'year') return String(year);
    if (view === 'month') return `${MONTH_ABBR[month - 1]} ${year}`;
    if (view === 'week') {
      const monday = startOfWeek(cursor);
      const sunday = addDays(monday, 6);
      const a = parseDateKey(monday);
      const b = parseDateKey(sunday);
      return `${a.day} ${MONTH_ABBR[a.month - 1]} – ${b.day} ${MONTH_ABBR[b.month - 1]}`;
    }
    const d = parseDateKey(cursor);
    return `${d.day} ${MONTH_ABBR[d.month - 1]}`;
  }, [view, year, month, cursor]);

  const step = useCallback(
    (direction: 1 | -1) => {
      setCursor((current) => {
        const { year: y, month: m, day } = parseDateKey(current);
        if (view === 'year') {
          // Clamp the day so stepping off 29 February does not land nowhere.
          const safeDay = Math.min(day, new Date(y + direction, m, 0).getDate());
          return makeDateKey(y + direction, m, safeDay);
        }
        if (view === 'month') {
          const targetMonth = m + direction;
          const targetYear = y + Math.floor((targetMonth - 1) / 12);
          const normalized = ((targetMonth - 1 + 12) % 12) + 1;
          const safeDay = Math.min(day, new Date(targetYear, normalized, 0).getDate());
          return makeDateKey(targetYear, normalized, safeDay);
        }
        return addDays(current, direction * (view === 'week' ? 7 : 1));
      });
    },
    [view],
  );

  /** Tapping a day anywhere jumps to it and opens the Day tab. */
  const openDay = useCallback((date: DateKey) => {
    setCursor(date);
    setView('day');
  }, []);

  const openMonth = useCallback(
    (targetMonth: number) => {
      setCursor(makeDateKey(year, targetMonth, 1));
      setView('month');
    },
    [year],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.ground }}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: insets.bottom + space.xxl,
        paddingHorizontal: space.md,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.masthead}>
        <View style={styles.mastheadText}>
          <Text style={[type.mark, { color: theme.red }]}>Red Letter</Text>
          <Text style={[type.small, styles.tagline, { color: theme.inkMuted }]}>
            Not every day needs a plan. This shows you the ones that do.
          </Text>
        </View>

        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            hitSlop={space.sm}
            onPress={() => step(-1)}
            style={({ pressed }) => [
              styles.nav,
              { borderColor: theme.line, backgroundColor: theme.surface, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[type.body, { color: theme.ink }]}>‹</Text>
          </Pressable>

          <Text style={[type.period, styles.period, { color: theme.ink }]} numberOfLines={1}>
            {period}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            hitSlop={space.sm}
            onPress={() => step(1)}
            style={({ pressed }) => [
              styles.nav,
              { borderColor: theme.line, backgroundColor: theme.surface, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[type.body, { color: theme.ink }]}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.line }]}>
        {TABS.map((tab) => {
          const selected = tab.id === view;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setView(tab.id)}
              style={[
                styles.tab,
                { borderBottomColor: selected ? theme.ink : 'transparent' },
              ]}
            >
              <Text style={[type.body, { color: selected ? theme.ink : theme.inkMuted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loadError ? (
        <View
          style={[styles.banner, { backgroundColor: theme.redSoft, borderLeftColor: theme.red }]}
        >
          <Text style={[type.small, { color: theme.ink }]}>{loadError}</Text>
          <Text style={[type.small, styles.bannerHint, { color: theme.inkMuted }]}>
            Restore a backup from Settings to start again.
          </Text>
        </View>
      ) : null}

      <View style={styles.triage}>
        <Triage data={data} today={today} onPickDay={openDay} />
      </View>

      {view === 'year' ? (
        <YearView
          data={data}
          year={year}
          today={today}
          onPickDay={openDay}
          onPickMonth={openMonth}
        />
      ) : null}

      {view === 'month' ? (
        <MonthView data={data} year={year} month={month} today={today} onPickDay={openDay} />
      ) : null}

      {view === 'week' ? (
        <WeekView data={data} anchor={cursor} today={today} onPickDay={openDay} />
      ) : null}

      {view === 'day' ? <DayView date={cursor} onGo={setCursor} /> : null}

      <View style={[styles.section, { borderTopColor: theme.line }]}>
        <Text style={[type.serifHeading, { color: theme.ink }]}>
          What makes a <Text style={{ color: theme.red }}>Red Letter</Text> day
        </Text>
        <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
          Don’t want to forget something coming up? Mark it as a Red Letter day so it stands out.
          Export to your Google or Apple calendar and get notified there too.
        </Text>
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

      <Text style={[type.small, styles.colophon, { color: theme.inkMuted }]}>
        Medieval scribes copied their calendars in plain black and saved the red ink for feast days,
        the ones that asked something of you. Everything else stayed unmarked. That practice is
        where the phrase <Text style={{ color: theme.red }}>red-letter day</Text> comes from.
      </Text>
    </ScrollView>
  );
}

/** Kept so a deep link can name a month; the home screen owns navigation now. */
export function monthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

const styles = StyleSheet.create({
  masthead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    flexWrap: 'wrap',
  },
  mastheadText: { flexShrink: 1, minWidth: 180 },
  tagline: { marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nav: {
    width: 30,
    height: 30,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  period: { minWidth: 96, textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    gap: 2,
    marginTop: space.lg - 2,
    marginBottom: space.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { paddingVertical: space.sm, paddingHorizontal: space.md - 2, borderBottomWidth: 2 },
  banner: { padding: space.md, borderLeftWidth: 3, marginBottom: space.md },
  bannerHint: { marginTop: space.xs },
  triage: { marginBottom: space.lg - 2 },
  section: { marginTop: space.xl - 6, paddingTop: space.md + 2, borderTopWidth: StyleSheet.hairlineWidth },
  note: { marginTop: space.xs + 2, lineHeight: 21 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg },
  colophon: { marginTop: space.lg, lineHeight: 22 },
});
