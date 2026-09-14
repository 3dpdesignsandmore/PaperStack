/**
 * Library screen (plan §8): grid of scanned documents, filterable by kind.
 * Phase 0 state: empty-state UI pointing at the Scan tab; the grid fills in
 * Phase 1 when scans land on disk and in SQLite.
 */
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function LibraryScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Library
          </ThemedText>
        </ThemedView>

        {/* v1 empty state — the grid of ScanDocument cards arrives with Phase 1. */}
        <ThemedView type="backgroundElement" style={styles.emptyState}>
          <ThemedText type="subtitle" style={{ color: theme.text }}>
            No documents yet
          </ThemedText>
          <ThemedText type="small" style={[styles.emptyHint, { color: theme.textSecondary }]}>
            Head to the Scan tab to capture your first receipt or document.
            Everything stays on this device.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
  },
  emptyState: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
    maxWidth: 320,
  },
});

