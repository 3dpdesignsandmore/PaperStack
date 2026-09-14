/**
 * Settings screen (plan §8): defaults, recipients, page size, about.
 * Phase 0 state: static informational rows.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Settings
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="defaultSemiBold">Storage</ThemedText>
            <ThemedText type="small" style={styles.rowDetail}>
              Scans are saved only on this device, in the app&apos;s documents
              folder. Backups happen through your device&apos;s normal backup.
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="defaultSemiBold">Recipients</ThemedText>
            <ThemedText type="small" style={styles.rowDetail}>
              Saved share targets (Phase 7).
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="defaultSemiBold">Page size</ThemedText>
            <ThemedText type="small" style={styles.rowDetail}>
              US Letter (A4 option arrives with the N-up engine, Phase 4).
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="defaultSemiBold">About PaperStack</ThemedText>
            <ThemedText type="small" style={styles.rowDetail}>
              PaperStack scans and packs receipts and documents. Nothing
              leaves your device. Version 0.1.0 (development).
            </ThemedText>
          </ThemedView>
        </ScrollView>
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
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
  },
  section: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  rowDetail: {
    lineHeight: 18,
  },
});
