/**
 * Full-space centered status message (loading / empty / error), with an
 * optional spinner. Was previously copy-pasted per screen as
 * `<ThemedText style={{ flex: 1, alignItems: 'center', justifyContent:
 * 'center' }}>Loading…</ThemedText>` — those flex props don't center a
 * Text's own content the way they center a View's children, so the text
 * rendered top-left instead of centered. This wraps the message in an
 * actual View.
 */
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Props for {@link CenteredMessage}. */
export interface CenteredMessageProps {
  /** Message text. */
  message: string;
  /** Show a spinner above the message (e.g. while loading). */
  spinner?: boolean;
}

export function CenteredMessage({ message, spinner = false }: CenteredMessageProps) {
  return (
    <ThemedView style={styles.container}>
      {spinner && <ActivityIndicator size="large" />}
      <ThemedText>{message}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
