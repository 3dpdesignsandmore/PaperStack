/**
 * Compose screen (plan/UI.md §4, PLAN.md §5): the N-up composition cockpit
 * for a set of documents' pages. Reached either from the document detail
 * screen's Export → Combine option via /compose?id=<docId> (one document),
 * or from Library's multi-select Combine via /compose?ids=<id,id,...>
 * (several documents' pages stacked together).
 *
 * A true-to-scale US-Letter page preview shows exactly what `packColumns`
 * computed, with items animating to their new positions as the column
 * count changes (§4's one interaction worth real effort) — plus a column
 * selector with the §5 legibility verdict computed live, and Export →
 * stacked PDF + share sheet.
 */
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { CenteredMessage } from '@/components/centered-message';
import { LegibilityMeter } from '@/components/legibility-meter';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDocument, fetchPages } from '@/lib/db/queries';
import { fitColumns, LETTER, type PlacedItem } from '@/lib/layout/pack-columns';
import type { ScanDocument, ScanPage } from '@/lib/model';
import {
    CAPTION_HEIGHT,
    combinedTitle,
    COMPOSE_GEO,
    composeLayout,
    exportAndShareComposition,
    pagesToPackItems,
} from '@/lib/pdf/compose';

/** Legibility thresholds (plan §5): below this, export is blocked outright. */
const BLOCK_SCALE = 0.45;
/** Preview width as a fraction of the screen. */
const PREVIEW_WIDTH_RATIO = 0.7;
/** Preview never grows past this even on large screens (tablets). */
const MAX_PREVIEW_WIDTH = 340;
/** Reflow animation (plan/UI.md §4). */
const REFLOW_SPRING = { damping: 18, stiffness: 140 };
/** Column options offered, "Auto" being a computed fit rather than a literal. */
const COLUMN_OPTIONS: readonly ('auto' | number)[] = ['auto', 2, 3, 4, 6];

/** `/compose?id=<docId>` or `/compose?ids=<id,id,...>`, normalized to a list. */
function parseDocumentIds(idParam: string | undefined, idsParam: string | undefined): string[] {
  if (idsParam != null && idsParam.length > 0) {
    return idsParam.split(',').filter((value) => value.length > 0);
  }
  if (idParam != null && idParam.length > 0) {
    return [idParam];
  }
  return [];
}

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ id?: string; ids?: string }>();
  // expo-router params can be `string[]` or missing for a malformed link.
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const idsParam = Array.isArray(params.ids) ? params.ids[0] : params.ids;
  const documentIds = parseDocumentIds(idParam, idsParam);
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.min(MAX_PREVIEW_WIDTH, windowWidth * PREVIEW_WIDTH_RATIO);
  const previewHeight = (previewWidth * LETTER.height) / LETTER.width;
  const previewScale = previewWidth / LETTER.width;

  const [documents, setDocuments] = useState<ScanDocument[] | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [columnMode, setColumnMode] = useState<'auto' | number>('auto');
  const [separators, setSeparators] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const ids = parseDocumentIds(idParam, idsParam);
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      // Independent reads, not a read-modify-write of shared state, so
      // fetching every document's pages concurrently is safe — order is
      // still preserved (Promise.all resolves positionally, regardless of
      // which fetch actually finishes first).
      const results = await Promise.all(
        ids.map(async (documentId) => {
          const doc = await fetchDocument(db, documentId);
          if (doc == null) {
            return null;
          }
          const docPages = await fetchPages(db, documentId);
          return { doc, docPages };
        }),
      );
      if (cancelled) {
        return;
      }
      const found = results.filter((r): r is { doc: ScanDocument; docPages: ScanPage[] } => r != null);
      setDocuments(found.map((r) => r.doc));
      setPages(found.flatMap((r) => r.docPages));
    })();
    return () => {
      cancelled = true;
    };
  }, [db, idParam, idsParam]);

  // Auto-fit and the live layout below must reserve the same caption space
  // the export path will (see composeLayout's own comment) — otherwise the
  // preview shows more items per column than the PDF actually gets.
  const captionSpace = captions ? CAPTION_HEIGHT : 0;
  const columns =
    columnMode === 'auto'
      ? pages == null
        ? 3
        : fitColumns(pagesToPackItems(pages), { ...COMPOSE_GEO, captionSpace })
      : columnMode;

  const layout = pages == null ? null : composeLayout(pages, columns, captions);
  const blocked = layout != null && layout.minScale < BLOCK_SCALE;
  const title = documents != null ? combinedTitle(documents) : '';

  async function runExport() {
    if (documents == null || pages == null) {
      return;
    }
    setExporting(true);
    try {
      const result = await exportAndShareComposition(
        db,
        documents,
        pages,
        { columns, separators, captions },
      );
      Alert.alert(
        'Exported',
        `${pages.length} page(s) across ${result.pageCount} sheet(s) · ${Math.round(
          result.sizeBytes / 1024,
        )} KB.`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Export failed', message);
    } finally {
      setExporting(false);
    }
  }

  /**
   * Plan §5's legibility guard: below 0.45 scale, block export unless the
   * user explicitly overrides — a silent "Blocked" label with no actual
   * block just produces an illegible PDF the user discovers too late.
   */
  function onExport() {
    if (!blocked) {
      void runExport();
      return;
    }
    Alert.alert(
      'Text may be unreadable',
      'At this column count some items are shrunk enough that printed text is likely illegible. Reduce columns, or export anyway.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export anyway', style: 'destructive', onPress: () => void runExport() },
      ],
    );
  }

  if (documentIds.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Compose" />
          <CenteredMessage message="No documents selected." />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (documents == null || pages == null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Compose" />
          <CenteredMessage message="Loading…" spinner />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (pages.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title={title} />
          <ThemedView style={styles.center}>
            <ThemedText>
              {documents.length === 1
                ? 'This document has no pages to stack.'
                : 'None of the selected documents have pages to stack.'}
            </ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="linkPrimary">Back</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const firstPageItems = layout?.pages[0]?.items ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Compose" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }, CardShadow(theme.shadow)]}>
            <View style={[styles.previewPage, { backgroundColor: theme.backgroundElement }]}>
              {pages.map((page) => (
                <PreviewTile
                  key={page.id}
                  uri={page.thumbPath}
                  target={targetRect(page, firstPageItems, previewScale, previewHeight, previewWidth)}
                  color={theme.backgroundSelected}
                  borderColor={theme.border}
                />
              ))}
            </View>
          </View>
          <ThemedText type="small" style={[styles.caption, { color: theme.textSecondary }]}>
            Page 1 of {layout?.pages.length ?? 1} · US Letter
          </ThemedText>

          <AppCard style={styles.controlCard}>
            <View style={styles.readoutRow}>
              <ThemedText type="defaultSemiBold">Columns</ThemedText>
              <ThemedText type="mono" style={{ color: theme.textSecondary }}>
                {layout != null ? `${Math.round(layout.minScale * 100)}%` : ''}
              </ThemedText>
            </View>

            <View style={styles.chipRow}>
              {COLUMN_OPTIONS.map((option) => (
                <ColumnChip
                  key={option}
                  label={option === 'auto' ? 'Auto' : String(option)}
                  active={columnMode === option}
                  onPress={() => setColumnMode(option)}
                />
              ))}
            </View>

            <View style={styles.switchRow}>
              <ThemedText type="small">Separators</ThemedText>
              <Switch value={separators} onValueChange={setSeparators} />
            </View>
            <View style={styles.switchRow}>
              <ThemedText type="small">Captions</ThemedText>
              <Switch value={captions} onValueChange={setCaptions} />
            </View>
          </AppCard>

          {layout != null && <LegibilityMeter scale={layout.minScale} />}

          <AppButton
            label={exporting ? 'Exporting…' : blocked ? 'Review before exporting' : 'Export stacked PDF'}
            variant={blocked ? 'muted' : 'filled'}
            onPress={onExport}
            disabled={exporting}
            style={styles.exportButton}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** One tile's animation target, in preview-view pixels. */
interface TileTarget {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
}

/**
 * Convert one page's PDF-space placement (if it landed on page 1 of the
 * current layout) to a view-space animation target. PDF origin is
 * bottom-left; the view's is top-left — `top = (pageHeight - y - height) *
 * scale` is the flip. Pages that spilled onto page 2+ get a target below
 * the sheet at zero opacity, so the tile animates away instead of
 * vanishing.
 */
function targetRect(
  page: ScanPage,
  firstPageItems: PlacedItem[],
  scale: number,
  previewHeight: number,
  previewWidth: number,
): TileTarget {
  const placed = firstPageItems.find((item) => item.id === page.id);
  if (placed == null) {
    return { left: 0, top: previewHeight, width: previewWidth, height: 40, opacity: 0 };
  }
  return {
    left: placed.x * scale,
    top: (LETTER.height - placed.y - placed.height) * scale,
    width: placed.width * scale,
    height: placed.height * scale,
    opacity: 1,
  };
}

/** Props for {@link PreviewTile}. */
interface PreviewTileProps {
  /** Page image URI — the stored thumbnail (small; the preview is tiny). */
  uri: string;
  target: TileTarget;
  color: string;
  borderColor: string;
}

/**
 * One stacked item in the preview sheet: the actual page image at its
 * packed rect (plan/UI.md §4: "a thumbnail of the actual packed page, not
 * an abstract diagram"). Holds its own shared values (same doc: "use
 * useSharedValue / useDerivedValue explicitly — the compiler does not
 * manage worklet values") so a stable key across column-count changes lets
 * it spring to its new rect instead of remounting.
 */
function PreviewTile({ uri, target, color, borderColor }: PreviewTileProps) {
  const left = useSharedValue(target.left);
  const top = useSharedValue(target.top);
  const width = useSharedValue(target.width);
  const height = useSharedValue(target.height);
  const opacity = useSharedValue(target.opacity);

  // Reanimated shared values are mutable by design (CLAUDE.md's
  // reactCompiler exception) — same rationale as `use-press-scale.ts`.
  useEffect(() => {
    left.value = withSpring(target.left, REFLOW_SPRING);
    top.value = withSpring(target.top, REFLOW_SPRING);
    width.value = withSpring(target.width, REFLOW_SPRING);
    height.value = withSpring(target.height, REFLOW_SPRING);
    opacity.value = withSpring(target.opacity, REFLOW_SPRING);
  }, [target.left, target.top, target.width, target.height, target.opacity, left, top, width, height, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: left.value,
    top: top.value,
    width: width.value,
    height: height.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        styles.tile,
        { backgroundColor: color, borderColor, borderWidth: 0.5 },
      ]}>
      <Image source={{ uri }} style={styles.tileImage} contentFit="cover" recyclingKey={uri} />
    </Animated.View>
  );
}

/** Props for {@link ColumnChip}. */
interface ColumnChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** One column-count option — filled, not outlined (plan/UI.md §5 sweep). */
function ColumnChip({ label, active, onPress }: ColumnChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.columnChip,
        { backgroundColor: active ? theme.text : theme.backgroundSelected },
      ]}>
      <ThemedText type="defaultSemiBold" style={{ color: active ? theme.background : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  previewWrap: {
    borderRadius: Radius.small,
  },
  previewPage: {
    flex: 1,
    borderRadius: Radius.small,
    overflow: 'hidden',
  },
  tile: {
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  caption: {
    textAlign: 'center',
  },
  controlCard: {
    width: '100%',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  readoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  columnChip: {
    flex: 1,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // AppButton's `style` prop lands on its outer (shadow) wrapper, not the
  // Pressable that actually sizes itself from padding — so only
  // layout props (width, margin, position) can be overridden per
  // instance here, not an explicit height.
  exportButton: {
    width: '100%',
    marginTop: Spacing.one,
  },
});
