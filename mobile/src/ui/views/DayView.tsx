import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addDays,
  formatLongDate,
  formatTime,
  isValidTimeKey,
  type DateKey,
} from '../../core/dates';
import { LIMITS, type Entry } from '../../core/model';
import { sortDayEntries } from '../../core/queries';
import { EntryLinks } from '../../features/EntryLinks';
import { useStore } from '../../storage/repository';
import { space, type, useTheme } from '../theme';

/**
 * One day, and the only place in the app that writes.
 *
 * A single text field and an optional time. No priority, no category, no
 * colour, no repeat — each of those is a decision the product exists to spare
 * you.
 */
export function DayView({
  date,
  onGo,
}: {
  date: DateKey;
  onGo: (date: DateKey) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { data, addEntry, updateEntry, removeEntry } = useStore();

  const entries = sortDayEntries(data.entries[date] ?? []);

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const atLimit = entries.length >= LIMITS.entriesPerDay;
  const trimmed = title.trim();
  const timeUsable = time.length === 0 || isValidTimeKey(time);
  const canSubmit = trimmed.length > 0 && timeUsable && (!atLimit || editingId !== null);

  const reset = useCallback(() => {
    setTitle('');
    setTime('');
    setEditingId(null);
  }, []);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    const draft = { title: trimmed, ...(isValidTimeKey(time) ? { time } : {}) };
    if (editingId !== null) updateEntry(date, editingId, draft);
    else addEntry(date, draft);
    reset();
  }, [canSubmit, trimmed, time, editingId, date, updateEntry, addEntry, reset]);

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

  const marked = entries.length > 0;

  return (
    <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Text style={[type.period, { color: theme.ink }]}>{formatLongDate(date)}</Text>
      <Text
        style={[
          type.small,
          styles.verdict,
          { color: marked ? theme.red : theme.inkMuted },
        ]}
      >
        {marked ? 'A Red Letter day.' : 'Nothing here. Leave it alone.'}
      </Text>

      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          hitSlop={space.sm}
          onPress={() => onGo(addDays(date, -1))}
        >
          <Text style={[type.small, { color: theme.inkMuted }]}>‹ Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          hitSlop={space.sm}
          onPress={() => onGo(addDays(date, 1))}
        >
          <Text style={[type.small, { color: theme.inkMuted }]}>Next ›</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <Text style={[type.body, styles.empty, { color: theme.inkMuted }]}>
          Nothing on this day yet.
        </Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={[styles.entry, { borderBottomColor: theme.line }]}>
            <View style={styles.entryTop}>
              <View style={[styles.pin, { backgroundColor: theme.red, borderColor: theme.red }]} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${entry.title}`}
                style={styles.entryMain}
                onPress={() => beginEdit(entry)}
              >
                <Text style={[type.body, { color: theme.red }]}>{entry.title}</Text>
                {entry.note ? (
                  <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
                    {entry.note}
                  </Text>
                ) : null}
              </Pressable>
              <Text style={[type.small, styles.time, { color: theme.inkMuted }]}>
                {entry.time ? formatTime(entry.time) : '—'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${entry.title}`}
                hitSlop={space.sm}
                onPress={() => confirmRemove(entry)}
              >
                <Text style={[type.body, { color: theme.inkFaint }]}>×</Text>
              </Pressable>
            </View>
            <EntryLinks title={entry.title} note={entry.note} />
          </View>
        ))
      )}

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          value={title}
          onChangeText={setTitle}
          placeholder={editingId === null ? 'What is happening?' : 'Edit'}
          placeholderTextColor={theme.inkFaint}
          maxLength={LIMITS.titleLength}
          returnKeyType="done"
          onSubmitEditing={submit}
          accessibilityLabel="What happens on this day"
          style={[
            styles.input,
            type.body,
            { color: theme.ink, borderColor: theme.line, backgroundColor: theme.ground },
          ]}
        />

        <View style={styles.composerRow}>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="09:30"
            placeholderTextColor={theme.inkFaint}
            maxLength={5}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Time, optional, 24 hour"
            style={[
              styles.input,
              styles.timeInput,
              type.small,
              {
                color: timeUsable ? theme.ink : theme.danger,
                borderColor: timeUsable ? theme.line : theme.danger,
                backgroundColor: theme.ground,
              },
            ]}
          />

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
              styles.button,
              {
                backgroundColor: canSubmit ? theme.ink : theme.line,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[type.small, { color: canSubmit ? theme.surface : theme.inkMuted }]}>
              {editingId === null ? 'Add' : 'Save'}
            </Text>
          </Pressable>
        </View>

        {atLimit && editingId === null ? (
          <Text style={[type.small, styles.limit, { color: theme.inkMuted }]}>
            That is {LIMITS.entriesPerDay} things on one day. This probably is not the app for that
            day.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderWidth: StyleSheet.hairlineWidth, padding: space.lg - 2 },
  verdict: { marginTop: 2 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md },
  empty: { paddingVertical: space.lg },
  entry: { paddingVertical: space.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 1 },
  pin: { width: 11, height: 11, borderRadius: 6, borderWidth: 1 },
  entryMain: { flex: 1, gap: 2 },
  note: { marginTop: 2 },
  time: { fontVariant: ['tabular-nums'] },
  composer: { marginTop: space.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  timeInput: { width: 92 },
  button: {
    marginLeft: 'auto',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: 2,
  },
  limit: { marginTop: space.md },
});
