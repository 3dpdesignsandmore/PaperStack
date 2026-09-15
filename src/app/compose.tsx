/**
 * Compose screen (plan §5, Phase 4): the N-up composition cockpit for one
 * document's pages. Reached from the document detail screen's Export →
 * Combine option via /compose?id=<docId>.
 *
 * Presents a live page preview (schematic rectangles of the packed
 * layout — exactly what `packColumns` computed), a column selector with
 * the §5 legibility verdict computed live, captions/separators toggles,
 * and Export → packed PDF + share sheet.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { CenteredMessage } from '@/components/centered-message';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDocument, fetchPages } from '@/lib/db/queries';
import { LETTER } from '@/lib/layout/pack-columns';
import type { ScanDocument, ScanPage } from '@/lib/model';
import {
    composeLayout,
    exportAndShareComposition,
} from '@/lib/pdf/compose';

/** Legibility thresholds (plan §5): below this, export is blocked outright. */
const BLOCK_SCALE = 0.45;
/** Preview content padding on each side — kept in sync with `styles.content`. */
const PREVIEW_PADDING = Spacing.four;
/** Preview never grows past this even on large screens (tablets). */
const MAX_PREVIEW_WIDTH = 300;

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // expo-router params can be `string[]` or missing for a malformed link.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  // Scale the preview to the actual screen width instead of a fixed
  // constant — a hardcoded 300pt overflows a 320pt-wide phone once the
  // screen's own horizontal padding is subtracted.
  const previewWidth = Math.min(MAX_PREVIEW_WIDTH, windowWidth - PREVIEW_PADDING * 2);

  const [doc, setDoc] = useState<ScanDocument | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [columns, setColumns] = useState(3);
  const [separators, setSeparators] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (id == null) {
      return;
    }
    let cancelled = false;
    (async () => {
      const document = await fetchDocument(db, id);
      const docPages = await fetchPages(db, id);
      if (!cancelled) {
        setDoc(document);
        setPages(docPages);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  const layout = useMemo(() => {
    if (doc == null || pages == null) {
      return null;
    }
    return composeLayout(doc, pages, columns);
  }, [doc, pages, columns]);

  const previewScale = previewWidth / LETTER.width;
  const blocked = layout != null && layout.minScale < BLOCK_SCALE;

  const verdict = useMemo(() => {
    if (layout == null) {
      return '';
    }
    const s = layout.minScale;
    if (s >= 0.6) {
      return `Fine — every item at ${Math.round(s * 100)}% of original size`;
    }
    if (s >= 0.45) {
      return `Warning — text may be hard to read when printed (${Math.round(
        s * 100,
      )}%)`;
    }
    return `Blocked — shrunk to ${Math.round(
      s * 100,
    )}%. Reduce columns or remove items`;
  }, [layout]);

  async function runExport() {
    if (doc == null || pages == null) {
      return;
    }
    setExporting(true);
    try {
      const result = await exportAndShareComposition(
        doc,
        pages,
        { columns, separators, captions },
        doc.title,
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

  if (id == null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Compose" />
          <CenteredMessage message="No document selected." />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (doc == null || pages == null) {
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
          <ScreenHeader title={doc.title} />
          <ThemedView style={styles.center}>
            <ThemedText>This document has no pages to compose.</ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="linkPrimary">Back</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Compose" />
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{doc.title}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Combining {pages.length} page{pages.length === 1 ? '' : 's'} into
            packed sheets
          </ThemedText>

          {/* Live preview: the true packed geometry, scaled down. */}
          {layout != null && (
            <View style={styles.previewRow}>
              {layout.pages.slice(0, 3).map((page, pageIdx) => (
                <View
                  key={pageIdx}
                  style={[
                    styles.previewPage,
                    {
                      width: previewWidth / 3 - Spacing.two,
                      height:
                        ((previewWidth / 3 - Spacing.two) * LETTER.height) /
                        LETTER.width,
                    },
                  ]}>
                  {page.items.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        position: 'absolute',
                        left: item.x * previewScale * (1 / 3),
                        top: (LETTER.height - item.y - item.height) * previewScale * (1 / 3),
                        width: item.width * previewScale * (1 / 3),
                        height: item.height * previewScale * (1 / 3),
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.textSecondary,
                        borderWidth: 0.5,
                      }}
                    />
                  ))}
                </View>
              ))}
              {layout.pages.length > 3 && (
                <ThemedText type="small">
                  +{layout.pages.length - 3} more page(s)
                </ThemedText>
              )}
            </View>
          )}

          <ThemedText
            type="small"
            style={{
              color: blocked ? theme.danger : layout != null && layout.minScale < 0.6 ? theme.warning : theme.textSecondary,
            }}>
            {layout != null
              ? `${layout.pages.length} page(s) · ${verdict}`
              : ''}
          </ThemedText>

          <ThemedView
            type="backgroundElement"
            style={[styles.controlCard, { borderColor: theme.border }]}>
            <ThemedText type="defaultSemiBold">Columns: {columns}</ThemedText>
            <View style={styles.stepperRow}>
              {[2, 3, 4, 6].map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.columnChip,
                    { borderColor: theme.border },
                    c === columns && { borderColor: theme.accent, backgroundColor: theme.accent },
                  ]}
                  onPress={() => setColumns(c)}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={
                      c === columns
                        ? { color: theme.accentText }
                        : { color: theme.text }
                    }>
                    {c}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedView type="background" style={styles.switchRow}>
              <ThemedText type="small">Separators</ThemedText>
              <Switch value={separators} onValueChange={setSeparators} />
            </ThemedView>
            <ThemedView type="background" style={styles.switchRow}>
              <ThemedText type="small">Captions</ThemedText>
              <Switch value={captions} onValueChange={setCaptions} />
            </ThemedView>
          </ThemedView>

          <AppButton
            label={exporting ? 'Exporting…' : blocked ? 'Review before exporting' : 'Export packed PDF'}
            variant={blocked ? 'danger' : 'filled'}
            onPress={onExport}
            disabled={exporting}
            style={styles.exportButton}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  },
  previewRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  previewPage: {
    backgroundColor: '#FFFFFF',
    borderColor: '#808080',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  controlCard: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  columnChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportButton: {
    marginTop: Spacing.one,
  },
});
