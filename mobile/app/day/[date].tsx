import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeDistance, isValidDateKey, todayKey, type DateKey } from '../../src/core/dates';
import { useStore } from '../../src/storage/repository';
import { DayView } from '../../src/ui/views/DayView';
import { space, useTheme } from '../../src/ui/theme';

/**
 * A single day, reached from a notification or a deep link.
 *
 * The home screen owns day-to-day navigation through its Day tab; this route
 * exists so tapping a reminder opens the right day directly, and renders the
 * same component so the two can never drift apart.
 */
export default function DayRoute(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { today } = useStore();
  const params = useLocalSearchParams<{ date: string }>();

  // A deep link is untrusted like any other outside input.
  const initial: DateKey = isValidDateKey(params.date) ? params.date : todayKey();
  const [date, setDate] = useState<DateKey>(initial);

  return (
    <>
      <Stack.Screen options={{ title: describeDistance(today, date) }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.ground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          contentContainerStyle={{
            padding: space.md,
            paddingBottom: insets.bottom + space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <DayView date={date} onGo={setDate} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
