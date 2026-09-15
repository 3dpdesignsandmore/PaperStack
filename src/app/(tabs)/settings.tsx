/**
 * Settings screen (plan §8): defaults, recipients, page size, about.
 * Interactive: scan-name prefix used to suggest names in the save dialog.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppButton } from '@/components/app-button';
import { PromptDialog } from '@/components/prompt-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getSetting,
  SCAN_NAME_PREFIX_KEY,
  setSetting,
} from '@/lib/db/queries';

/** One static info card on the Settings screen. */
interface SettingsSection {
  label: string;
  title: string;
  detail: string;
}

const SECTIONS: SettingsSection[] = [
  {
    label: 'Privacy',
    title: 'Storage',
    detail:
      "Scans are saved only on this device, in the app's documents folder. Backups happen through your device's normal backup.",
  },
  {
    label: 'Coming soon',
    title: 'Recipients',
    detail: 'Saved share targets (Phase 7).',
  },
  {
    label: 'Defaults',
    title: 'Page size',
    detail: 'US Letter (A4 option arrives with the N-up engine, Phase 4).',
  },
  {
    label: 'About',
    title: 'PaperStack',
    detail:
      'PaperStack scans and packs receipts and documents. Nothing leaves your device. Version 0.1.0 (development).',
  },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const [prefix, setPrefix] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getSetting(db, SCAN_NAME_PREFIX_KEY).then(setPrefix);
    }, [db]),
  );

  async function savePrefix(value: string) {
    setEditing(false);
    await setSetting(db, SCAN_NAME_PREFIX_KEY, value);
    setPrefix(value);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.headerLabel}>
            <ThemedText type="label" style={{ color: theme.accent }}>
              Preferences
            </ThemedText>
          </ThemedView>
          <ThemedText type="title" style={styles.title}>
            Settings
          </ThemedText>

          <ThemedView
            type="backgroundElement"
            style={[styles.section, { borderColor: theme.border }]}>
            <ThemedText type="label" style={{ color: theme.textSecondary }}>
              Defaults
            </ThemedText>
            <ThemedText type="defaultSemiBold">Scan name prefix</ThemedText>
            <ThemedText type="small" style={styles.rowDetail}>
              Suggested name when you save a scan. New scans start with it.
            </ThemedText>
            <ThemedView style={styles.prefixValue}>
              <ThemedText
                type="default"
                style={prefix == null ? { color: theme.textSecondary } : undefined}>
                {prefix == null || prefix === '' ? 'None set' : prefix}
              </ThemedText>
              <AppButton
                label="Edit"
                variant="outline"
                onPress={() => setEditing(true)}
              />
            </ThemedView>
          </ThemedView>

          {SECTIONS.map((section) => (
            <ThemedView
              key={section.title}
              type="backgroundElement"
              style={[styles.section, { borderColor: theme.border }]}>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                {section.label}
              </ThemedText>
              <ThemedText type="defaultSemiBold">{section.title}</ThemedText>
              <ThemedText type="small" style={styles.rowDetail}>
                {section.detail}
              </ThemedText>
            </ThemedView>
          ))}
        </ScrollView>
      </SafeAreaView>

      <PromptDialog
        visible={editing}
        title="Scan name prefix"
        message="New scans will suggest this name. Leave empty for no prefix."
        initialValue={prefix ?? ''}
        placeholder="e.g. Groceries"
        confirmLabel="Save prefix"
        onConfirm={savePrefix}
        onCancel={() => setEditing(false)}
      />
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
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    marginBottom: Spacing.three,
  },
  headerLabel: {
    marginBottom: Spacing.one,
  },
  section: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  prefixValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  rowDetail: {
    lineHeight: 18,
  },
});
