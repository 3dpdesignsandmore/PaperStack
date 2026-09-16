/**
 * Settings (plan/UI.md §1, §4): moved out of `(tabs)` to a pushed route
 * reached from Home's header gear button — it is no longer a tab. Gains
 * the capture settings that used to live on the old Scan tab: multi-page
 * capture and photo quality are wired to `useCapture()`'s scanner call;
 * OCR has no pipeline yet (the "OCR is on-device" plan is still ahead), so
 * it stays a "Coming soon" row rather than a switch with nothing behind
 * it.
 */
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { PromptDialog } from '@/components/prompt-dialog';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
    MaxContentWidth,
    PALETTE_NAMES,
    PaletteId,
    Palettes,
    Radius,
    resolveScheme,
    Spacing,
    ThemeAppearance,
    type ThemeColors,
} from '@/constants/theme';
import { useThemePreferences } from '@/hooks/theme-provider';
import { useTheme } from '@/hooks/use-theme';
import { createAndShareBackup } from '@/lib/backup';
import { DATABASE_NAME } from '@/lib/db/migrations';
import {
    getSetting,
    SCAN_MULTI_PAGE_KEY,
    SCAN_NAME_PREFIX_KEY,
    SCAN_QUALITY_KEY,
    setSetting,
} from '@/lib/db/queries';
import { exportAndShareLog, logInfo, logThrown } from '@/lib/debug-log';
import { FILENAME_TEMPLATE_KEY } from '@/lib/pdf/filename';

/** Quality presets exposed in Settings, mapped to `croppedImageQuality`. */
const QUALITY_LEVELS = [
  { label: 'Space saver', value: 60 },
  { label: 'Standard', value: 85 },
  { label: 'Best', value: 100 },
] as const;
const DEFAULT_QUALITY = 85;

/** Appearance options for the segmented control. */
const APPEARANCE_OPTIONS: readonly { label: string; value: ThemeAppearance }[] = [
  { label: 'System', value: ThemeAppearance.System },
  { label: 'Light', value: ThemeAppearance.Light },
  { label: 'Dark', value: ThemeAppearance.Dark },
];

/** Every palette, in the fixed display order the picker shows them. */
const PALETTE_ORDER: readonly PaletteId[] = [
  PaletteId.Blueprint,
  PaletteId.Paper,
  PaletteId.Graphite,
  PaletteId.Forest,
];

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
    label: 'Defaults',
    title: 'Page size',
    detail: 'US Letter. An A4 option is planned but not built yet.',
  },
  {
    label: 'About',
    title: 'PaperStack',
    detail:
      'PaperStack scans and stacks documents onto shared pages. Nothing leaves your device. Version 1.0.0 (development).',
  },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { paletteId, appearance, setPaletteId, setAppearance } = useThemePreferences();
  const systemScheme = useColorScheme();
  // The scheme every palette-preview swatch resolves against — computed
  // once here, not per row, and never from `useTheme()` (which only ever
  // returns the *active* palette's colors and would make every row's
  // swatches identical).
  const previewScheme = resolveScheme(appearance, systemScheme);

  const [prefix, setPrefix] = useState<string | null>(null);
  const [editingPrefix, setEditingPrefix] = useState(false);
  const [multiPage, setMultiPage] = useState(true);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  // Filename template (Phase 7): null while loading, '' meaning
  // "unset" (the placeholder shows the default).
  const [template, setTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  // Backup + diagnostic-log busy flags.
  const [backingUp, setBackingUp] = useState(false);
  const [exportingLog, setExportingLog] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [storedPrefix, storedMultiPage, storedQuality, storedTemplate] =
          await Promise.all([
            getSetting(db, SCAN_NAME_PREFIX_KEY),
            getSetting(db, SCAN_MULTI_PAGE_KEY),
            getSetting(db, SCAN_QUALITY_KEY),
            getSetting(db, FILENAME_TEMPLATE_KEY),
          ]);
        setPrefix(storedPrefix);
        setMultiPage(storedMultiPage !== 'false');
        setQuality(storedQuality == null ? DEFAULT_QUALITY : Number(storedQuality));
        setTemplate(storedTemplate);
      })().catch((e: unknown) => logThrown('settings-load', e));
    }, [db]),
  );

  async function savePrefix(value: string) {
    setEditingPrefix(false);
    await setSetting(db, SCAN_NAME_PREFIX_KEY, value);
    setPrefix(value);
  }

  async function toggleMultiPage(value: boolean) {
    setMultiPage(value);
    await setSetting(db, SCAN_MULTI_PAGE_KEY, value ? 'true' : 'false');
  }

  async function chooseQuality(value: number) {
    setQuality(value);
    await setSetting(db, SCAN_QUALITY_KEY, String(value));
  }

  /* ---------------- Filename template (Phase 7) ---------------- */

  async function saveTemplate(value: string) {
    setEditingTemplate(false);
    await setSetting(db, FILENAME_TEMPLATE_KEY, value);
    setTemplate(value);
  }

  /* ---------------- Backup & diagnostics ---------------- */

  async function onBackup() {
    setBackingUp(true);
    logInfo('backup', 'starting');
    try {
      const result = await createAndShareBackup(db, DATABASE_NAME);
      logInfo('backup', `created: ${result.fileCount} files, ${result.sizeBytes} bytes`);
      Alert.alert(
        'Backup created',
        `${result.fileCount} item${result.fileCount === 1 ? '' : 's'} · ${Math.round(
          result.sizeBytes / 1024,
        )} KB. The zip is also saved under Documents/backups.`,
      );
    } catch (e: unknown) {
      logThrown('backup', e);
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBackingUp(false);
    }
  }

  async function onExportLog() {
    setExportingLog(true);
    try {
      await exportAndShareLog();
    } catch (e: unknown) {
      logThrown('debug-log', e);
      Alert.alert('Send failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExportingLog(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Settings" />
        <ScrollView contentContainerStyle={styles.content}>
          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Appearance
            </ThemedText>
            <View style={styles.qualityRow}>
              {APPEARANCE_OPTIONS.map((option) => (
                <SettingsChip
                  key={option.value}
                  label={option.label}
                  active={option.value === appearance}
                  onPress={() => setAppearance(option.value)}
                />
              ))}
            </View>
          </AppCard>

          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Palette
            </ThemedText>
            {PALETTE_ORDER.map((id, index) => (
              <PaletteRow
                key={id}
                id={id}
                scheme={previewScheme}
                active={id === paletteId}
                last={index === PALETTE_ORDER.length - 1}
                onPress={() => setPaletteId(id)}
              />
            ))}
          </AppCard>

          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Capture
            </ThemedText>

            <SettingsRow>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Scan name prefix</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {prefix == null || prefix === '' ? 'None set' : prefix}
                </ThemedText>
              </View>
              <AppButton label="Edit" variant="outline" onPress={() => setEditingPrefix(true)} />
            </SettingsRow>

            <SettingsRow>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Multiple pages per scan</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Keep capturing pages until you close the scanner.
                </ThemedText>
              </View>
              <Switch value={multiPage} onValueChange={toggleMultiPage} />
            </SettingsRow>

            <SettingsRow>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Photo quality</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Higher quality uses more storage per page.
                </ThemedText>
              </View>
            </SettingsRow>
            <View style={styles.qualityRow}>
              {QUALITY_LEVELS.map((level) => (
                <SettingsChip
                  key={level.value}
                  label={level.label}
                  active={level.value === quality}
                  onPress={() => chooseQuality(level.value)}
                />
              ))}
            </View>

            <SettingsRow last>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Read text (OCR)</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Coming soon — a searchable text layer for exported PDFs.
                </ThemedText>
              </View>
            </SettingsRow>
          </AppCard>

          {/* Filename template (Phase 7) */}
          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Export file names
            </ThemedText>
            <SettingsRow last>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Filename template</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {template == null || template.trim() === ''
                    ? '{title} (default)'
                    : template}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {'Tokens: {title} {date} {pages} {n} — e.g. "{title} {date}".'}
                </ThemedText>
              </View>
              <AppButton label="Edit" variant="outline" onPress={() => setEditingTemplate(true)} />
            </SettingsRow>
          </AppCard>

          {/* Backup & diagnostics (plan §9) */}
          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Backup &amp; support
            </ThemedText>
            <SettingsRow>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Backup everything</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  One zip with every scan, export, tag, recipient, and setting. Share it anywhere; restore by unzipping over the app&apos;s documents folder.
                </ThemedText>
              </View>
              <AppButton
                label={backingUp ? 'Backing up…' : 'Back up'}
                variant="outline"
                onPress={() => void onBackup()}
                disabled={backingUp}
              />
            </SettingsRow>
            <SettingsRow last>
              <View style={styles.rowText}>
                <ThemedText type="defaultSemiBold">Diagnostic log</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  A plain-text log of recent app activity (no document content) to send to support.
                </ThemedText>
              </View>
              <AppButton
                label={exportingLog ? 'Exporting…' : 'Export log'}
                variant="outline"
                onPress={() => void onExportLog()}
                disabled={exportingLog}
              />
            </SettingsRow>
          </AppCard>

          {SECTIONS.map((section) => (
            <AppCard key={section.title} style={styles.section}>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                {section.label}
              </ThemedText>
              <ThemedText type="defaultSemiBold">{section.title}</ThemedText>
              <ThemedText type="small" style={styles.rowDetail}>
                {section.detail}
              </ThemedText>
            </AppCard>
          ))}
        </ScrollView>
      </SafeAreaView>

      <PromptDialog
        visible={editingPrefix}
        title="Scan name prefix"
        message="New scans will suggest this name. Leave empty for no prefix."
        initialValue={prefix ?? ''}
        placeholder="e.g. Groceries"
        confirmLabel="Save prefix"
        onConfirm={savePrefix}
        onCancel={() => setEditingPrefix(false)}
      />

      <PromptDialog
        visible={editingTemplate}
        title="Filename template"
        message="Used for exported PDF file names. Tokens: {title} {date} {pages} {n}."
        initialValue={template ?? ''}
        placeholder="{title}"
        confirmLabel="Save template"
        onConfirm={saveTemplate}
        onCancel={() => setEditingTemplate(false)}
      />
    </ThemedView>
  );
}

/** Props for {@link SettingsRow}. */
interface SettingsRowProps {
  children: ReactNode;
  /** Suppresses the bottom hairline — never draw one below the last row. */
  last?: boolean;
}

/** One 52px-minimum settings row, hairline-separated except after the last. */
function SettingsRow({ children, last = false }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      {children}
    </View>
  );
}

/**
 * Props for {@link SettingsChip}. Shared by the Photo quality and
 * Appearance rows — both are "one active choice from a short fixed list"
 * rendered as equal-width filled chips, so one component covers both
 * instead of two near-identical ones.
 */
interface SettingsChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function SettingsChip({ label, active, onPress }: SettingsChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.qualityChip, { backgroundColor: active ? theme.text : theme.backgroundSelected }]}>
      <ThemedText type="small" style={{ color: active ? theme.background : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Props for {@link PaletteRow}. */
interface PaletteRowProps {
  id: PaletteId;
  /** Which side of the palette to preview — resolved once by the caller
   * from the current appearance preference, not read from `useTheme()`
   * (which only ever knows the *active* palette). */
  scheme: 'light' | 'dark';
  active: boolean;
  last: boolean;
  onPress: () => void;
}

/**
 * One row in the palette picker: name, a live four-swatch preview strip
 * (paper, surface, ink, accent) drawn from `Palettes[id]` directly, and a
 * checkmark on the active row. Tapping applies immediately — no confirm
 * step, per the spec.
 */
function PaletteRow({ id, scheme, active, last, onPress }: PaletteRowProps) {
  const theme = useTheme();
  const previewColors: ThemeColors = Palettes[id][scheme];
  const swatches: string[] = [
    previewColors.background,
    previewColors.backgroundElement,
    previewColors.text,
    previewColors.accent,
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.paletteRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="defaultSemiBold">{PALETTE_NAMES[id]}</ThemedText>
      <View style={styles.paletteTrailing}>
        <View style={styles.swatchStrip}>
          {swatches.map((color, index) => (
            <View key={index} style={[styles.swatch, { backgroundColor: color }]} />
          ))}
        </View>
        {active && (
          <SymbolView
            name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
            size={20}
            tintColor={theme.accent}
          />
        )}
      </View>
    </Pressable>
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  card: {
    padding: Spacing.three,
  },
  cardLabel: {
    marginBottom: Spacing.one,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  // Content-hugging, not `flex: 1` — three equal-width chips stretched
  // across the card read as oversized capsules with a label lost in the
  // middle of a lot of empty pill.
  qualityChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  rowDetail: {
    lineHeight: 18,
  },
  paletteRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  paletteTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatchStrip: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
