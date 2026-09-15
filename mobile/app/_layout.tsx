import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockGate } from '../src/features/LockGate';
import { ReminderSync } from '../src/features/ReminderSync';
import { RedLetterProvider } from '../src/storage/repository';
import { useTheme } from '../src/ui/theme';

export default function RootLayout(): React.JSX.Element {
  const theme = useTheme();

  return (
    <SafeAreaProvider>
      <RedLetterProvider>
        <LockGate>
          <ReminderSync />
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.ground },
              headerTintColor: theme.ink,
              headerTitleStyle: { fontSize: 17, fontWeight: '600' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: theme.ground },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="day/[date]" options={{ title: '' }} />
            <Stack.Screen name="waiting" options={{ title: 'Waiting on' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </LockGate>
      </RedLetterProvider>
    </SafeAreaProvider>
  );
}
