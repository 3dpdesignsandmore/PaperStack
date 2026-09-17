/**
 * In-app diagnostic log viewer (user request, 2026-09-17): renders the
 * same buffer `exportAndShareLog` serializes, so a repro can be checked
 * on-device without exporting to another app first. Read-mostly — the
 * destructive action (clear) sits behind a confirm because it wipes the
 * disk mirror too, and the export button covers "send it to support".
 *
 * Newest at the top: for "what just happened?" you read down from the
 * top, matching the mental model of every other log view.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clear, entries, exportAndShareLog, logReady, type LogEntry } from '@/lib/debug-log';

/** Newest-first copy of the buffer: screens read top-down for recency. */
function snapshot(): LogEntry[] {
  return [...entries()].reverse();
}

function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function LogViewerScreen() {
  const theme = useTheme();
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [exporting, setExporting] = useState(false);

  function refresh(): void {
    setLines(snapshot());
  }

  // The initial load can lose to the async disk restore (entries() is
  // synchronous) — await logReady() before the first snapshot so a
  // restart-then-view shows the persisted log instead of a false
  // "nothing logged yet".
  useEffect(() => {
    let cancelled = false;
    void logReady().then(() => {
      if (!cancelled) {
        refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-snapshot when the screen gains focus: the stack keeps this route
  // mounted, so returning to it must pick up lines logged elsewhere.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, []),
  );

  function onClear(): void {
    Alert.alert('Clear log?', 'This deletes the log on disk too. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clear();
          refresh();
        },
      },
    ]);
  }

  async function onExport(): Promise<void> {
    setExporting(true);
    try {
      await exportAndShareLog();
    } finally {
      setExporting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Diagnostic log" />
        {lines.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="defaultSemiBold">Nothing logged yet</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              App activity appears here as it happens. It is also saved to a file, so it survives a
              restart.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={lines}
            keyExtractor={(item) => String(item.at)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.row,
                  item.level === 'detail' && { opacity: 0.75, paddingVertical: 1 },
                ]}>
                <ThemedText type="mono" style={[styles.meta, { color: theme.textSecondary }]}>
                  {`${formatTime(item.at)}${item.level === 'detail' ? ' ·' : ''}  ${item.area}`}
                </ThemedText>
                <ThemedText
                  type="mono"
                  style={[
                    styles.message,
                    item.level === 'error'
                      ? { color: theme.danger }
                      : { color: theme.text },
                  ]}>
                  {item.message}
                </ThemedText>
              </View>
            )}
          />
        )}
        <View style={styles.actionBar}>
          <AppButton label="Refresh" variant="outline" onPress={refresh} />
          <AppButton label="Clear" variant="outline" onPress={onClear} />
          <AppButton
            label={exporting ? 'Exporting…' : 'Export'}
            variant="filled"
            onPress={() => void onExport()}
            disabled={exporting}
            loading={exporting}
          />
          </View>
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
  },
  empty: {
    padding: Spacing.four,
    gap: Spacing.one,
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.four,
  },
  row: {
    paddingVertical: Spacing.one,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  meta: {
    fontSize: 10,
    lineHeight: 13,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
