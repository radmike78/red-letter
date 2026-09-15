import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { totalEntryCount } from '../src/core/queries';
import { countExportableEvents } from '../src/core/icsExport';
import {
  exportBackup,
  exportCalendarFile,
  pickAndReadBackup,
  pickAndReadIcs,
} from '../src/features/backup';
import { disableReminders, enableReminders, syncReminders } from '../src/features/notifications';
import { areRemindersEnabled, isLockEnabled, setLockEnabled } from '../src/features/settings';
import { clearAllPreferences } from '../src/features/settings';
import { destroyDataKey } from '../src/storage/keys';
import { useStore } from '../src/storage/repository';
import { destroyData } from '../src/storage/store';
import { space, type, useTheme } from '../src/ui/theme';

export default function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, importDays, replaceAll, clearEverything } = useStore();

  const [lock, setLock] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lockOn, remindersOn, hardware, enrolled] = await Promise.all([
        isLockEnabled(),
        areRemindersEnabled(),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (cancelled) return;
      setLock(lockOn);
      setReminders(remindersOn);
      setBiometricsAvailable(hardware && enrolled);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLock = useCallback(async (value: boolean) => {
    setLock(value);
    await setLockEnabled(value);
  }, []);

  const toggleReminders = useCallback(
    async (value: boolean) => {
      setReminders(value);
      if (value) {
        const granted = await enableReminders(data);
        if (!granted) {
          setReminders(false);
          Alert.alert(
            'Notifications are off',
            'Red Letter needs notification permission to remind you the evening before. You can turn it on in your device settings.',
          );
        }
      } else {
        await disableReminders();
      }
    },
    [data],
  );

  const onExport = useCallback(async () => {
    setBusy(true);
    try {
      const shared = await exportBackup(data);
      if (!shared) Alert.alert('Cannot share', 'Sharing is not available on this device.');
    } catch {
      Alert.alert('Export failed', 'The backup could not be written.');
    } finally {
      setBusy(false);
    }
  }, [data]);

  const onExportIcs = useCallback(async () => {
    if (countExportableEvents(data) === 0) {
      Alert.alert('Nothing to export', 'Mark a day first.');
      return;
    }
    setBusy(true);
    try {
      const shared = await exportCalendarFile(data);
      if (!shared) Alert.alert('Cannot share', 'Sharing is not available on this device.');
    } catch {
      Alert.alert('Export failed', 'The calendar file could not be written.');
    } finally {
      setBusy(false);
    }
  }, [data]);

  const onRestore = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await pickAndReadBackup();
      if (!outcome.ok) {
        if (outcome.reason === 'cancelled') return;
        Alert.alert('Could not restore', describeRestoreFailure(outcome.reason));
        return;
      }

      const { report, split } = outcome;

      // A backup from the HTML version distinguishes Red Letter days from days
      // that merely have something on them. Importing everything would turn
      // every errand into a red day, so the choice is put to the user in the
      // same terms their web version uses.
      if (split) {
        Alert.alert(
          'Which days?',
          `This backup has ${split.redLetterDays} Red Letter ${
            split.redLetterDays === 1 ? 'day' : 'days'
          } and ${split.ordinaryDays} other ${
            split.ordinaryDays === 1 ? 'day' : 'days'
          } with something on them. Red Letter opens on the year, so bringing everything across will fill it in.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Red Letter days only',
              onPress: () => {
                replaceAll(split.redLetter);
                void syncReminders(split.redLetter);
              },
            },
            {
              text: 'Everything',
              onPress: () => {
                replaceAll(outcome.data);
                void syncReminders(outcome.data);
              },
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Replace everything?',
        `This backup has ${report.entriesKept} ${
          report.entriesKept === 1 ? 'entry' : 'entries'
        } and ${report.waitingKept} waiting ${
          report.waitingKept === 1 ? 'item' : 'items'
        }. Restoring replaces what is in the app now.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: () => {
              replaceAll(outcome.data);
              void syncReminders(outcome.data);
              if (report.entriesDropped > 0 || report.daysDropped > 0) {
                Alert.alert(
                  'Restored',
                  `Some of the file could not be used and was skipped: ${
                    report.entriesDropped
                  } ${report.entriesDropped === 1 ? 'entry' : 'entries'} and ${
                    report.daysDropped
                  } ${report.daysDropped === 1 ? 'day' : 'days'}.`,
                );
              }
            },
          },
        ],
      );
    } finally {
      setBusy(false);
    }
  }, [replaceAll]);

  const onImportIcs = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await pickAndReadIcs();
      if (!outcome.ok) {
        if (outcome.reason === 'cancelled') return;
        Alert.alert('Could not import', describeIcsFailure(outcome.reason));
        return;
      }

      const report = importDays(outcome.result.days);
      const notes: string[] = [
        `${report.added} added.`,
        report.duplicatesSkipped > 0 ? `${report.duplicatesSkipped} already there.` : '',
        outcome.result.eventsSkipped > 0 ? `${outcome.result.eventsSkipped} skipped.` : '',
        outcome.result.recurringFlattened > 0
          ? `${outcome.result.recurringFlattened} repeating ${
              outcome.result.recurringFlattened === 1 ? 'event was' : 'events were'
            } added once only.`
          : '',
      ].filter((line) => line.length > 0);

      Alert.alert('Imported', notes.join(' '));
    } finally {
      setBusy(false);
    }
  }, [importDays]);

  const onDeleteEverything = useCallback(() => {
    Alert.alert(
      'Delete everything?',
      'Every marked day, every waiting item, and the key that encrypts them. This cannot be undone and there is no copy anywhere else.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              clearEverything();
              await disableReminders();
              await destroyData();
              await destroyDataKey();
              await clearAllPreferences();
              setLock(false);
              setReminders(false);
            })();
          },
        },
      ],
    );
  }, [clearEverything]);

  const entryCount = totalEntryCount(data);

  return (
    <ScrollView
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{
        paddingHorizontal: space.md,
        paddingBottom: insets.bottom + space.xxl,
      }}
    >
      <Section title="Reminders">
        <Row
          label="Remind me the evening before"
          hint="One notification, the day before. Never a streak, never a nudge for not opening the app."
        >
          <Switch value={reminders} onValueChange={(v) => void toggleReminders(v)} />
        </Row>
      </Section>

      <Section title="Privacy">
        <Row
          label="Lock the app"
          hint={
            biometricsAvailable
              ? 'Require Face ID, a fingerprint or your passcode to open Red Letter.'
              : 'Set up biometrics or a passcode on this device to use this.'
          }
        >
          <Switch
            value={lock}
            disabled={!biometricsAvailable}
            onValueChange={(v) => void toggleLock(v)}
          />
        </Row>

        <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
          Red Letter has no account and no server. Nothing you write leaves this device unless you
          export it yourself. Your days are encrypted on disk with a key held in
          {' '}
          {'the device keychain'}.
        </Text>
      </Section>

      <Section title="Your data">
        <Action label="Export a backup" hint="A plain JSON file you keep." onPress={onExport} busy={busy} />
        <Action
          label="Restore from a backup"
          hint="Replaces everything currently in the app."
          onPress={onRestore}
          busy={busy}
        />
        <Action
          label="Import a calendar file"
          hint="Reads .ics files. Repeating events are added once, not expanded."
          onPress={onImportIcs}
          busy={busy}
        />
        <Action
          label="Export a calendar file"
          hint="An .ics file your other calendars — and the Red Letter web version — can read."
          onPress={onExportIcs}
          busy={busy}
        />

        <Text style={[type.small, styles.note, { color: theme.inkMuted }]}>
          {entryCount === 0
            ? 'Nothing marked yet.'
            : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} across ${
                Object.keys(data.entries).length
              } ${Object.keys(data.entries).length === 1 ? 'day' : 'days'}.`}
        </Text>
      </Section>

      <Section title="">
        <Pressable
          accessibilityRole="button"
          onPress={onDeleteEverything}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[type.body, { color: theme.danger }]}>Delete everything</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {title.length > 0 ? (
        <Text style={[type.caption, styles.sectionTitle, { color: theme.inkFaint }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.sectionBody, { borderTopColor: theme.rule }]}>{children}</View>
    </View>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={[type.body, { color: theme.ink }]}>{label}</Text>
        <Text style={[type.small, styles.hint, { color: theme.inkMuted }]}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function Action({
  label,
  hint,
  onPress,
  busy,
}: {
  label: string;
  hint: string;
  onPress: () => void | Promise<void>;
  busy: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={() => void onPress()}
      style={({ pressed }) => [styles.action, { opacity: pressed || busy ? 0.5 : 1 }]}
    >
      <Text style={[type.body, { color: theme.ink }]}>{label}</Text>
      <Text style={[type.small, styles.hint, { color: theme.inkMuted }]}>{hint}</Text>
    </Pressable>
  );
}

function describeRestoreFailure(reason: 'too-large' | 'unreadable' | 'not-a-backup'): string {
  switch (reason) {
    case 'too-large':
      return 'That file is far larger than a Red Letter backup should be, so it was not opened.';
    case 'unreadable':
      return 'That file could not be read.';
    default:
      return 'That does not look like a Red Letter backup.';
  }
}

function describeIcsFailure(
  reason: 'too-large' | 'unreadable' | 'not-a-calendar' | 'empty',
): string {
  switch (reason) {
    case 'too-large':
      return 'That calendar file is too large to import safely.';
    case 'unreadable':
      return 'That file could not be read.';
    case 'empty':
      return 'That file is empty.';
    default:
      return 'That does not look like a calendar file.';
  }
}

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  sectionTitle: { marginBottom: space.sm },
  sectionBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.md,
  },
  rowMain: { flex: 1 },
  action: { paddingVertical: space.md },
  hint: { marginTop: space.xs },
  note: { paddingVertical: space.md },
});
