import React, { useCallback, useMemo, useState } from 'react';
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
import { daysBetween } from '../src/core/dates';
import { LIMITS } from '../src/core/model';
import { waitingByAge } from '../src/core/queries';
import { useStore } from '../src/storage/repository';
import { space, type, useTheme } from '../src/ui/theme';

/**
 * Waiting on.
 *
 * Things other people owe you. Not a task list: there is nothing to tick off
 * daily, no due date and no streak, because you are not the one who can finish
 * these. The only thing the list tracks is how long it has been sitting there,
 * which is the fact that actually prompts you to chase it.
 */
export default function WaitingScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, today, addWaiting, removeWaiting } = useStore();

  const [title, setTitle] = useState('');
  const items = useMemo(() => waitingByAge(data, today), [data, today]);

  const trimmed = title.trim();
  const atLimit = data.waiting.length >= LIMITS.waitingItems;
  const canSubmit = trimmed.length > 0 && !atLimit;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    addWaiting(trimmed);
    setTitle('');
  }, [canSubmit, trimmed, addWaiting]);

  const confirmRemove = useCallback(
    (id: string, label: string) => {
      Alert.alert('Got it at last?', label, [
        { text: 'Still waiting', style: 'cancel' },
        { text: 'Done', onPress: () => removeWaiting(id) },
      ]);
    },
    [removeWaiting],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.ground }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.md,
          paddingBottom: insets.bottom + space.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[type.small, styles.intro, { color: theme.inkMuted }]}>
          Things you are waiting on someone else for.
        </Text>

        <View style={styles.composer}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Waiting on…"
            placeholderTextColor={theme.inkFaint}
            maxLength={LIMITS.titleLength}
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="What are you waiting on"
            style={[styles.input, type.body, { color: theme.ink, borderBottomColor: theme.line }]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.submit,
              { borderColor: canSubmit ? theme.ink : theme.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[type.small, { color: canSubmit ? theme.ink : theme.inkFaint }]}>Add</Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <Text style={[type.body, styles.empty, { color: theme.inkFaint }]}>
            Nobody owes you anything.
          </Text>
        ) : (
          items.map((item) => {
            const age = daysBetween(item.since, today);

            return (
              <View key={item.id} style={[styles.row, { borderBottomColor: theme.line }]}>
                <View style={styles.rowMain}>
                  <Text style={[type.body, { color: theme.ink }]}>{item.title}</Text>
                  <Text style={[type.small, styles.age, { color: theme.inkMuted }]}>
                    {describeWait(age)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${item.title} as resolved`}
                  hitSlop={space.sm}
                  onPress={() => confirmRemove(item.id, item.title)}
                >
                  <Text style={[type.body, { color: theme.inkFaint }]}>×</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Plainly factual, never scolding. "Waiting 40 days" is information; "overdue"
 * would be the app taking a side about someone else's delay.
 */
function describeWait(days: number): string {
  if (days <= 0) return 'Since today';
  if (days === 1) return 'Since yesterday';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

const styles = StyleSheet.create({
  intro: { paddingTop: space.sm, paddingBottom: space.lg },
  composer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  input: { flex: 1, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  submit: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  empty: { paddingVertical: space.xl, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: space.md,
    marginTop: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  rowMain: { flex: 1 },
  age: { marginTop: 2 },
});
