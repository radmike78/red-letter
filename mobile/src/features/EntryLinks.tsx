import React, { useCallback, useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { analyzeText, analyzeUrl, displayTarget, type AnalyzedUrl } from '../core/urls';
import { space, type, useTheme } from '../ui/theme';

/**
 * Links found in an entry.
 *
 * Nothing here opens automatically, nothing is fetched, and nothing is
 * previewed — a link is inert until the user has seen where it actually goes
 * and said yes. That ordering is the whole point: the attack on a calendar is
 * a plausible event whose link is not where it appears to lead, and the defence
 * is showing the real destination before the tap rather than after it.
 *
 * Red is used here for a warning, which is the one deliberate exception to the
 * rule that red means "a marked day". A security warning outranks the palette.
 */
export function EntryLinks({ title, note }: { title: string; note?: string }): React.JSX.Element | null {
  const theme = useTheme();

  const links = useMemo(
    () => [...analyzeText(title), ...analyzeText(note)],
    [title, note],
  );

  const confirm = useCallback((link: AnalyzedUrl) => {
    // Re-analyzed at the moment of the tap rather than trusting the verdict
    // computed at render time.
    const checked = analyzeUrl(link.raw);
    const target = displayTarget(checked);

    const body = [
      `Goes to: ${target}`,
      '',
      ...checked.findings.map((f) => `• ${f.message}`),
    ]
      .join('\n')
      .trim();

    if (!checked.openable) {
      Alert.alert('Red Letter will not open this', body, [{ text: 'OK', style: 'cancel' }]);
      return;
    }

    Alert.alert(
      checked.verdict === 'suspicious' ? 'This link looks deceptive' : 'Open this link?',
      body,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          style: checked.verdict === 'suspicious' ? 'destructive' : 'default',
          onPress: () => {
            void Linking.openURL(checked.raw).catch(() => {
              Alert.alert('Could not open', 'Nothing on this device handles that link.');
            });
          },
        },
      ],
    );
  }, []);

  if (links.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {links.map((link, index) => {
        const warned = link.verdict !== 'ok';
        return (
          <Pressable
            key={`${link.raw}-${index}`}
            accessibilityRole="link"
            accessibilityLabel={
              warned
                ? `Link to ${displayTarget(link)}, flagged as unsafe`
                : `Link to ${displayTarget(link)}`
            }
            onPress={() => confirm(link)}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[type.small, { color: warned ? theme.danger : theme.inkMuted }]}>
              {warned ? '⚠ ' : '↗ '}
              {displayTarget(link)}
            </Text>
            {warned ? (
              <Text style={[type.caption, { color: theme.danger }]}>
                {link.verdict === 'blocked' ? 'BLOCKED' : 'CHECK THIS'}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.sm, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
});
