/**
 * Document detail (plan §8, Phase 2): full-page viewer for one document's
 * pages, with export (as-is or combined N-up), rename, add-pages, and
 * delete. Reached from a Library card via router.push('/document/[id]').
 */
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { PromptDialog } from '@/components/prompt-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { appendScanSession, scanRootDir } from '@/lib/db/persist-scan';
import { fetchDocument, fetchPages, renameDocument } from '@/lib/db/queries';
import { exportAndShareDocument } from '@/lib/pdf/export-document';
import type { ScanDocument, ScanPage } from '@/lib/model';
import { scanPages } from '@/lib/scanner';
import { Directory } from 'expo-file-system';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();

  const [document, setDocument] = useState<ScanDocument | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const [doc, docPages] = await Promise.all([
      fetchDocument(db, id),
      fetchPages(db, id),
    ]);
    if (doc == null) {
      setMissing(true);
      return;
    }
    setDocument(doc);
    setPages(docPages);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onDelete() {
    if (document == null) {
      return;
    }
    Alert.alert(
      'Delete document',
      `Delete "${document.title}" and its ${pages?.length ?? 0} page(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // DB first (cascade removes pages), then files.
            await db.runAsync('DELETE FROM scan_documents WHERE id = ?', [
              document.id,
            ]);
            const dir = new Directory(scanRootDir(), document.id);
            if (dir.exists) {
              dir.delete();
            }
            router.back();
          },
        },
      ],
    );
  }

  async function onAddPages() {
    setAdding(true);
    try {
      const { pageUris } = await scanPages();
      if (pageUris.length === 0) {
        return;
      }
      await appendScanSession(db, pageUris, id);
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Add pages failed', message);
    } finally {
      setAdding(false);
    }
  }

  /** Export flow entry: choose one-page-per-scan or combined N-up. */
  function onExport() {
    if (document == null) {
      return;
    }
    Alert.alert(
      'Export PDF',
      'Export each scan on its own page, or combine them multiple-per-page?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'One per page',
          onPress: () => {
            void exportAsIs();
          },
        },
        {
          text: 'Combine',
          onPress: () => {
            router.push(`/compose?id=${document.id}`);
          },
        },
      ],
    );
  }

  async function exportAsIs() {
    if (document == null || pages == null) {
      return;
    }
    setExporting(true);
    try {
      const result = await exportAndShareDocument(document, pages);
      Alert.alert(
        'Exported',
        `${result.pageCount} page(s) · ${Math.round(result.sizeBytes / 1024)} KB PDF.`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Export failed', message);
    } finally {
      setExporting(false);
    }
  }

  if (missing) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.center}>
          <ThemedText>Document not found.</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="linkPrimary">Back to Library</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (document == null || pages == null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.center}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={pages}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <ThemedView type="backgroundElement" style={styles.pageCard}>
            <Image
              source={{ uri: item.imagePath }}
              style={styles.pageImage}
              contentFit="contain"
              recyclingKey={item.id}
              transition={150}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Page {index + 1} of {pages.length} · {item.widthPx}×{item.heightPx}
            </ThemedText>
          </ThemedView>
        )}
      />

      <SafeAreaView style={styles.actions} edges={['bottom']}>
        <Pressable style={styles.actionButton} onPress={onExport} disabled={exporting}>
          <ThemedText type="defaultSemiBold">
            {exporting ? 'Exporting…' : 'Export PDF'}
          </ThemedText>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setRenaming(true)}>
          <ThemedText type="defaultSemiBold">Rename</ThemedText>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onAddPages} disabled={adding}>
          <ThemedText type="defaultSemiBold">{adding ? 'Opening scanner…' : 'Add pages'}</ThemedText>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onDelete}>
          <ThemedText type="defaultSemiBold" style={{ color: '#D32F2F' }}>
            Delete
          </ThemedText>
        </Pressable>
      </SafeAreaView>

      <PromptDialog
        visible={renaming}
        title="Rename document"
        initialValue={document.title}
        confirmLabel="Rename"
        onConfirm={async (title) => {
          setRenaming(false);
          await renameDocument(db, id, title);
          await load();
        }}
        onCancel={() => setRenaming(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  pageCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
    alignItems: 'center',
  },
  pageImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Spacing.one,
    backgroundColor: '#80808040',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
