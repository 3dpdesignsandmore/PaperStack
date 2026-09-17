/**
 * Header block for Library, Scan (deep-link target), and Settings — a
 * dashboard-style eyebrow/title/subtitle stack that replaces each screen's
 * hand-rolled header row (plan/UI.md §2).
 */
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link ScreenTitle}. */
export interface ScreenTitleProps {
  /** Small uppercase label above the title, e.g. "Your scans". */
  eyebrow: string;
  /** The screen's large bold title. */
  title: string;
  /** Optional detail line, e.g. "12 documents · 38.4 MB". */
  subtitle?: string;
  /** Action cluster, right-aligned on the subtitle row. */
  right?: ReactNode;
}

export function ScreenTitle({ eyebrow, title, subtitle, right }: ScreenTitleProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      {/* The eyebrow slot holds the brand wordmark ("PaperStack") —
          the app name, larger than the old micro-label, on every tab
          screen (user request, 2026-09-16). */}
      <ThemedText type="brand" style={{ color: theme.accent }}>
        {eyebrow}
      </ThemedText>
      {/* Title and `right` share a row so an action like Home's gear button
          sits vertically centered beside the title, not below it. */}
      <ThemedView style={styles.titleRow}>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        {right}
      </ThemedView>
      {subtitle != null && (
        <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
          {subtitle}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: Spacing.two,
  },
});
