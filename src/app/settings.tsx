/**
 * Settings (plan/UI.md §1, §4): moved out of `(tabs)` to a pushed route
 * reached from Home's header gear button — it is no longer a tab. Gains
 * the capture settings that used to live on the old Scan tab: multi-page
 * capture and photo quality are wired to `useCapture()`'s scanner call;
 * OCR has no pipeline yet (the "OCR is on-device" plan is still ahead), so
 * it stays a "Coming soon" row rather than a switch with nothing behind
 * it.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View, useColorScheme } from 'react-native';
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
import {
    getSetting,
    SCAN_MULTI_PAGE_KEY,
    SCAN_NAME_PREFIX_KEY,
    SCAN_QUALITY_KEY,
    setSetting,
} from '@/lib/db/queries';

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
    label: 'Coming soon',
    title: 'Recipients',
    detail: 'Saved share targets (Phase 7).',
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
  const router = useRouter();
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

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [storedPrefix, storedMultiPage, storedQuality] = await Promise.all([
          getSetting(db, SCAN_NAME_PREFIX_KEY),
          getSetting(db, SCAN_MULTI_PAGE_KEY),
          getSetting(db, SCAN_QUALITY_KEY),
        ]);
        setPrefix(storedPrefix);
        setMultiPage(storedMultiPage !== 'false');
        setQuality(storedQuality == null ? DEFAULT_QUALITY : Number(storedQuality));
      })();
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

          {__DEV__ && (
            <AppCard style={styles.section}>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                Dev only
              </ThemedText>
              <ThemedText type="defaultSemiBold">Invisible text spike</ThemedText>
              <ThemedText type="small" style={styles.rowDetail}>
                Verifies the pdf-lib searchable-text layer on this device.
              </ThemedText>
              <AppButton
                label="Run OCR spike"
                variant="outline"
                onPress={() => router.push('/ocr-spike')}
                style={styles.devButton}
              />
            </AppCard>
          )}
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
  devButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  paletteRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
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
