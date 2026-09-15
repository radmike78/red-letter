import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { isLockEnabled } from './settings';
import { space, type, useTheme } from '../ui/theme';

/**
 * Optional biometric lock in front of the app.
 *
 * Off by default: a calendar of birthdays does not need a lock, and forcing one
 * on everybody is exactly the kind of imposed ceremony this product is against.
 * For anyone who does keep medical or personal dates in it, the option is one
 * switch in Settings.
 *
 * The lock re-arms when the app has been in the background for longer than the
 * grace period, so switching to another app to check a date does not demand a
 * re-scan, but leaving the phone on a table does.
 */

const GRACE_PERIOD_MS = 60_000;

export function LockGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const authenticate = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setFailed(false);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Red Letter',
        // Falling back to the device passcode means someone without a working
        // fingerprint sensor is not locked out of their own calendar.
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
      if (result.success) setUnlocked(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const on = await isLockEnabled();
      if (cancelled) return;

      // If the lock is on but the hardware is gone (biometrics removed, passcode
      // turned off), do not strand the user outside their own data.
      const capable = on ? await LocalAuthentication.hasHardwareAsync() : false;
      const enrolled = capable ? await LocalAuthentication.isEnrolledAsync() : false;
      const effective = on && capable && enrolled;

      if (cancelled) return;
      setEnabled(effective);
      if (effective) void authenticate();
      else setUnlocked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticate]);

  useEffect(() => {
    if (enabled !== true) return undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;

      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since !== null && Date.now() - since > GRACE_PERIOD_MS) {
        setUnlocked(false);
        void authenticate();
      }
    });

    return () => subscription.remove();
  }, [enabled, authenticate]);

  if (enabled === null) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.ground }]}>
        <ActivityIndicator color={theme.inkFaint} />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.ground }]}>
        <Text style={[type.title, { color: theme.ink }]}>Red Letter</Text>
        <Text style={[type.small, styles.hint, { color: theme.inkMuted }]}>
          {failed ? 'Locked.' : 'Unlocking…'}
        </Text>
        {failed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void authenticate()}
            style={({ pressed }) => [
              styles.button,
              { borderColor: theme.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[type.body, { color: theme.ink }]}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  hint: { marginTop: space.sm },
  button: {
    marginTop: space.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
});
