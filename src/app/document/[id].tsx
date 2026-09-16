/**
 * Document detail (plan §8, Phase 2): full-page viewer for one document's
 * pages, with export (as-is or combined N-up), rename, add-pages, and
 * delete. Reached from a Library card via router.push('/document/[id]').
 */
import { Directory } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppCard } from '@/components/app-card';
import { CenteredMessage } from '@/components/centered-message';
import { PromptDialog } from '@/components/prompt-dialog';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/hooks/use-theme';
import { appendScanSession, persistOptionsFromSetting, scanRootDir } from '@/lib/db/persist-scan';
import { fetchDocument, fetchPages, getSetting, renameDocument, SCAN_MULTI_PAGE_KEY, SCAN_QUALITY_KEY } from '@/lib/db/queries';
import type { ScanDocument, ScanPage } from '@/lib/model';
import { exportAndShareDocument } from '@/lib/pdf/export-document';
import { scanPages } from '@/lib/scanner';

export default function DocumentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // expo-router params can legitimately be `string[]` (repeated query keys)
  // or missing entirely for a malformed deep link — never trust the typed
  // hint alone.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
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
    if (id == null) {
      setMissing(true);
      return;
    }
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
    if (id == null) {
      return;
    }
    setAdding(true);
    try {
      // Same settings as the Scan flow: quality for the scanner's own
      // JPEGs and for our re-encode, multi-page cap on Android.
      const [quality, multiPage] = await Promise.all([
        getSetting(db, SCAN_QUALITY_KEY),
        getSetting(db, SCAN_MULTI_PAGE_KEY),
      ]);
      const { pageUris } = await scanPages({
        croppedImageQuality: quality == null ? undefined : Number(quality),
        maxNumDocuments: multiPage === 'false' ? 1 : undefined,
      });
      if (pageUris.length === 0) {
        return;
      }
      await appendScanSession(db, pageUris, id, persistOptionsFromSetting(quality));
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
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Document" />
          <ThemedView style={styles.center}>
            <ThemedText>Document not found.</ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="linkPrimary">Back to Library</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (document == null || pages == null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Document" />
          <CenteredMessage message="Loading…" spinner />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <ScreenHeader title={document.title} />
      </SafeAreaView>
      <FlatList
        data={pages}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <AppCard style={styles.pageCard}>
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
          </AppCard>
        )}
      />

      <SafeAreaView style={styles.actions} edges={['bottom']}>
        <ThemedView type="backgroundElement" style={[styles.actionBar, CardShadow(theme.shadow)]}>
          <ActionBarItem
            icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
            label={exporting ? 'Exporting…' : 'Export'}
            color={theme.accent}
            onPress={onExport}
            disabled={exporting}
          />
          <ActionBarItem
            icon={{ ios: 'pencil', android: 'edit' }}
            label="Rename"
            color={theme.text}
            onPress={() => setRenaming(true)}
          />
          <ActionBarItem
            icon={{ ios: 'doc.badge.plus', android: 'note_add' }}
            label={adding ? 'Adding…' : 'Add pages'}
            color={theme.text}
            onPress={onAddPages}
            disabled={adding}
          />
          <ActionBarItem
            icon={{ ios: 'trash', android: 'delete' }}
            label="Delete"
            color={theme.danger}
            onPress={onDelete}
          />
        </ThemedView>
      </SafeAreaView>

      <PromptDialog
        visible={renaming}
        title="Rename document"
        initialValue={document.title}
        confirmLabel="Rename"
        onConfirm={async (title) => {
          setRenaming(false);
          await renameDocument(db, document.id, title);
          await load();
        }}
        onCancel={() => setRenaming(false)}
      />
    </ThemedView>
  );
}

/** Props for {@link ActionBarItem}. */
interface ActionBarItemProps {
  icon: SymbolViewProps['name'];
  label: string;
  /** Icon + label tint — accent for the primary action, danger for the
   * destructive one, `theme.text` for the rest. */
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * One icon-over-label item in the floating action bar — same visual
 * language as `FloatingTabBar`'s items (icon, small non-uppercase label,
 * press feedback), so this screen's actions read as part of the same app
 * instead of a separate row of pill buttons.
 */
function ActionBarItem({ icon, label, color, onPress, disabled = false }: ActionBarItemProps) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const tint = disabled ? color + '80' : color;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.actionItemHitArea}>
      <Animated.View style={[styles.actionItem, animatedStyle]}>
        <SymbolView name={icon} size={22} tintColor={tint} />
        <ThemedText type="label" style={[styles.actionItemLabel, { color: tint }]}>
          {label}
        </ThemedText>
      </Animated.View>
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
  listContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  pageCard: {
    padding: Spacing.two,
    gap: Spacing.one,
    alignItems: 'center',
  },
  pageImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.small,
    backgroundColor: '#80808040',
  },
  actions: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  // Same pill silhouette as the floating tab bar, sized for four icon+label
  // items instead of three tab items.
  actionBar: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  actionItemHitArea: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionItem: {
    alignItems: 'center',
    gap: 2,
  },
  actionItemLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
