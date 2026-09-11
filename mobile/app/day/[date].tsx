import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addDays,
  describeDistance,
  formatLongDate,
  formatTime,
  isValidDateKey,
  isValidTimeKey,
  parseDateKey,
  todayKey,
} from '../../src/core/dates';
import { LIMITS, type Entry } from '../../src/core/model';
import { sortDayEntries } from '../../src/core/queries';
import { useStore } from '../../src/storage/repository';
import { space, type, useTheme } from '../../src/ui/theme';

/**
 * One day.
 *
 * This is the only screen that writes calendar data, and it is deliberately a
 * single text field plus an optional time. There is no priority, no category,
 * no colour and no repeat: every one of those is a decision the product exists
 * to spare you.
 */
export default function DayScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date: string }>();
  const { data, today, addEntry, updateEntry, removeEntry } = useStore();

  // Deep links reach this screen, so the parameter is validated, not trusted.
  const date = isValidDateKey(params.date) ? params.date : todayKey();

  const entries = useMemo(() => sortDayEntries(data.entries[date] ?? []), [data.entries, date]);

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const atLimit = entries.length >= LIMITS.entriesPerDay;
  const trimmedTitle = title.trim();
  const timeIsUsable = time.length === 0 || isValidTimeKey(time);
  const canSubmit = trimmedTitle.length > 0 && timeIsUsable && (!atLimit || editingId !== null);

  const reset = useCallback(() => {
    setTitle('');
    setTime('');
    setEditingId(null);
  }, []);

  const submit = useCallback(() => {
    if (!canSubmit) return;

    const draft = {
      title: trimmedTitle,
      ...(isValidTimeKey(time) ? { time } : {}),
    };

    if (editingId !== null) updateEntry(date, editingId, draft);
    else addEntry(date, draft);

    reset();
  }, [canSubmit, trimmedTitle, time, editingId, date, updateEntry, addEntry, reset]);

  const beginEdit = useCallback((entry: Entry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setTime(entry.time ?? '');
    inputRef.current?.focus();
  }, []);

  const confirmRemove = useCallback(
    (entry: Entry) => {
      Alert.alert('Remove this?', entry.title, [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (editingId === entry.id) reset();
            removeEntry(date, entry.id);
          },
        },
      ]);
    },
    [date, editingId, removeEntry, reset],
  );

  const { day, month, year } = parseDateKey(date);

  return (
    <>
      <Stack.Screen options={{ title: describeDistance(today, date) }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.paper }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          style={{ backgroundColor: theme.paper }}
          contentContainerStyle={{
            paddingHorizontal: space.md,
            paddingBottom: insets.bottom + space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[type.display, { color: theme.ink }]}>{formatLongDate(date)}</Text>
            <Text style={[type.small, { color: theme.inkFaint }]}>{year}</Text>
          </View>

          <View style={styles.navRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              hitSlop={space.sm}
              onPress={() => router.replace(`/day/${addDays(date, -1)}`)}
            >
              <Text style={[type.small, { color: theme.inkMuted }]}>‹ Previous</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              hitSlop={space.sm}
              onPress={() => router.replace(`/day/${addDays(date, 1)}`)}
            >
              <Text style={[type.small, { color: theme.inkMuted }]}>Next ›</Text>
            </Pressable>
          </View>

          {entries.length === 0 ? (
            <Text style={[type.body, styles.empty, { color: theme.inkFaint }]}>
              Nothing here. Most days are like this.
            </Text>
          ) : (
            entries.map((entry) => (
              <View key={entry.id} style={[styles.entryRow, { borderBottomColor: theme.rule }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${entry.title}`}
                  style={styles.entryMain}
                  onPress={() => beginEdit(entry)}
                >
                  <Text style={[type.body, { color: theme.ink }]}>{entry.title}</Text>
                  {entry.time ? (
                    <Text style={[type.small, styles.entryTime, { color: theme.red }]}>
                      {formatTime(entry.time)}
                    </Text>
                  ) : null}
                  {entry.note ? (
                    <Text style={[type.small, styles.entryNote, { color: theme.inkMuted }]}>
                      {entry.note}
                    </Text>
                  ) : null}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.title}`}
                  hitSlop={space.sm}
                  onPress={() => confirmRemove(entry)}
                >
                  <Text style={[type.body, { color: theme.inkFaint }]}>×</Text>
                </Pressable>
              </View>
            ))
          )}

          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={title}
              onChangeText={setTitle}
              placeholder={editingId === null ? 'Mark this day' : 'Edit'}
              placeholderTextColor={theme.inkFaint}
              maxLength={LIMITS.titleLength}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="What happens on this day"
              style={[
                styles.input,
                type.body,
                { color: theme.ink, borderBottomColor: theme.rule },
              ]}
            />

            <View style={styles.composerRow}>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="Time, optional (09:30)"
                placeholderTextColor={theme.inkFaint}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Time, optional, 24 hour"
                style={[
                  styles.timeInput,
                  type.small,
                  {
                    color: timeIsUsable ? theme.ink : theme.danger,
                    borderBottomColor: timeIsUsable ? theme.rule : theme.danger,
                  },
                ]}
              />

              <View style={styles.actions}>
                {editingId !== null ? (
                  <Pressable accessibilityRole="button" hitSlop={space.sm} onPress={reset}>
                    <Text style={[type.small, { color: theme.inkMuted }]}>Cancel</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={!canSubmit}
                  onPress={submit}
                  style={({ pressed }) => [
                    styles.submit,
                    {
                      borderColor: canSubmit ? theme.ink : theme.rule,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={[type.small, { color: canSubmit ? theme.ink : theme.inkFaint }]}>
                    {editingId === null ? 'Mark' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {atLimit && editingId === null ? (
              <Text style={[type.small, styles.limit, { color: theme.inkMuted }]}>
                That is {LIMITS.entriesPerDay} things on one day. This probably is not the app for
                that day.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.sm, paddingBottom: space.xs },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  empty: { paddingVertical: space.xl, textAlign: 'center' },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  entryMain: { flex: 1, gap: 2 },
  entryTime: { marginTop: 2 },
  entryNote: { marginTop: space.xs },
  composer: { marginTop: space.xl },
  input: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    gap: space.md,
  },
  timeInput: {
    flex: 1,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  submit: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  limit: { marginTop: space.md },
});
