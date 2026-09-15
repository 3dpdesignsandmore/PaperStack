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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { DocumentKind } from '@/lib/model';
import { persistScanSession } from '@/lib/db/persist-scan';
import { scanPages } from '@/lib/scanner';

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const db = useSQLiteContext();

  async function startScan() {
    setScanning(true);
    try {
      const { pageUris } = await scanPages();
      if (pageUris.length === 0) {
        return; // user cancelled
      }
      await persistScanSession(db, pageUris, 'Untitled scan', DocumentKind.Document);
      Alert.alert(
        'Scan complete',
        `${pageUris.length} page(s) captured and saved to Library.`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Scan failed', message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.emoji}>📷</ThemedText>
          <ThemedText type="subtitle">Scan a document</ThemedText>
          <ThemedText type="small" style={styles.hint}>
            Edge detection and perspective correction are handled by your
            platform&apos;s native scanner. Capture one or many pages.
          </ThemedText>
          <Pressable onPress={startScan} disabled={scanning} style={styles.scanButton}>
            {scanning ? (
              <ActivityIndicator />
            ) : (
              <ThemedText type="defaultSemiBold" style={styles.scanButtonText}>
                Open scanner
              </ThemedText>
            )}
          </Pressable>
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
  card: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
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
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    backgroundColor: '#208AEF',
  },
  scanButtonText: {
    color: '#FFFFFF',
  },
});
