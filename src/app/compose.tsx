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
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
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

/** Screen width the preview scales into. */
const PREVIEW_WIDTH = 300;

export default function ComposeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();

  const [doc, setDoc] = useState<ScanDocument | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [columns, setColumns] = useState(3);
  const [separators, setSeparators] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
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

  const previewScale = PREVIEW_WIDTH / LETTER.width;

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

  async function onExport() {
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

  if (doc == null || pages == null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.center}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (pages.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.center}>
          <ThemedText>This document has no pages to compose.</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.headerLabel}>
            <ThemedText type="label" style={{ color: theme.accent }}>
              Compose
            </ThemedText>
          </ThemedView>
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
                      width: PREVIEW_WIDTH / 3 - Spacing.two,
                      height:
                        ((PREVIEW_WIDTH / 3 - Spacing.two) * LETTER.height) /
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

          <ThemedText type="small" style={{ color: theme.textSecondary }}>
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
            label={exporting ? 'Exporting…' : 'Export packed PDF'}
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
  headerLabel: {
    marginBottom: -Spacing.two,
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
