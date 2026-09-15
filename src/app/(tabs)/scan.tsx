/**
 * Scan tab (plan §8): launches the native document scanner — Apple
 * VisionKit on iOS, ML Kit Document Scanner on Android — and persists the
 * captured pages through the pipeline in `@/lib/db/persist-scan`:
 * long-edge downscale → JPEG compress → documents/scans/ → SQLite rows.
 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import { PromptDialog } from '@/components/prompt-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { appendScanSession, persistScanSession } from '@/lib/db/persist-scan';
import { fetchLibrary } from '@/lib/db/queries';
import { DocumentKind, type LibraryEntry } from '@/lib/model';
import { scanPages } from '@/lib/scanner';

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const db = useSQLiteContext();
  const theme = useTheme();

  // Pending session awaiting a save decision (name + new-vs-append).
  const [pendingUris, setPendingUris] = useState<string[] | null>(null);
  const [recentDocs, setRecentDocs] = useState<LibraryEntry[]>([]);

  async function startScan() {
    setScanning(true);
    try {
      const { pageUris } = await scanPages();
      if (pageUris.length === 0) {
        return; // user cancelled
      }
      // Capture the session, then ask how to file it before persisting.
      setRecentDocs(await fetchLibrary(db));
      setPendingUris(pageUris);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Scan failed', message);
    } finally {
      setScanning(false);
    }
  }

  async function saveAsNew(title: string) {
    if (pendingUris == null) {
      return;
    }
    const uris = pendingUris;
    setPendingUris(null);
    try {
      await persistScanSession(db, uris, title, DocumentKind.Document);
      Alert.alert('Saved', `"${title}" is in your Library.`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
    }
  }

  async function saveAppend(target: LibraryEntry) {
    if (pendingUris == null) {
      return;
    }
    const uris = pendingUris;
    setPendingUris(null);
    try {
      await appendScanSession(db, uris, target.id);
      Alert.alert('Saved', `Added to "${target.title}".`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView
          type="backgroundElement"
          style={[styles.card, { borderColor: theme.border }]}>
          <ThemedView style={styles.labelWrap}>
            <ThemedText type="label" style={{ color: theme.accent }}>
              Capture
            </ThemedText>
          </ThemedView>
          <ThemedText type="title" style={styles.emoji}>📷</ThemedText>
          <ThemedText type="subtitle">Scan a document</ThemedText>
          <ThemedText type="small" style={styles.hint}>
            Edge detection and perspective correction are handled by your
            platform&apos;s native scanner. Capture one or many pages.
          </ThemedText>
          <Pressable
            onPress={startScan}
            disabled={scanning}
            style={[styles.scanButton, { backgroundColor: theme.accent }]}>
            {scanning ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <ThemedText
                type="defaultSemiBold"
                style={{ color: theme.accentText }}>
                Open scanner
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </SafeAreaView>

      {/* Save flow: name it, then file as new or append to an existing
          library entry. */}
      <PromptDialog
        visible={pendingUris != null}
        title={pendingUris != null ? `Save ${pendingUris.length} page(s)` : ''}
        message={
          recentDocs.length > 0
            ? 'Name this scan as a new document, or add these pages to an existing one below.'
            : 'Name this scan.'
        }
        placeholder="e.g. Groceries Sept 14"
        confirmLabel="Save as new"
        initialValue=""
        onConfirm={saveAsNew}
        onCancel={() => setPendingUris(null)}
      />

      {/* Append picker — shown while the save dialog is open. */}
      {pendingUris != null && recentDocs.length > 0 && (
        <ThemedView
          type="backgroundElement"
          style={[styles.appendSheet, { borderColor: theme.border }]}>
          {recentDocs.slice(0, 10).map((doc) => (
            <Pressable key={doc.id} onPress={() => saveAppend(doc)} style={styles.appendRow}>
              <ThemedText numberOfLines={1} style={styles.appendTitle}>
                {doc.title}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      )}
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
  card: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  labelWrap: {
    alignSelf: 'flex-start',
  },
  emoji: {
    fontSize: 48,
    lineHeight: 56,
    marginBottom: Spacing.one,
  },
  hint: {
    textAlign: 'center',
    maxWidth: 320,
  },
  scanButton: {
    marginTop: Spacing.three,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  appendSheet: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: BottomTabInset + Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    maxHeight: 260,
  },
  appendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  appendTitle: {
    flexShrink: 1,
  },
});
