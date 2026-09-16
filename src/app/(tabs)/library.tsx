/**
 * Library screen (plan/UI.md §1, §4): grid of scanned documents, newest
 * first. Moved off the launch route (`index.tsx`, now Home) to its own
 * file — the route move plan/UI.md §6 step 4 calls for.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/components/floating-tab-bar';
import { PaperThumb } from '@/components/paper-thumb';
import { SaveScanDialog } from '@/components/save-scan-dialog';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useImportPhotos } from '@/hooks/use-import-photos';
import { usePressScale } from '@/hooks/use-press-scale';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import { scanRootDir } from '@/lib/db/persist-scan';
import { fetchLibrary } from '@/lib/db/queries';
import { logThrown } from '@/lib/debug-log';
import { Directory } from 'expo-file-system';
import type { LibraryEntry } from '@/lib/model';

/** Columns in the library grid. */
const NUM_COLUMNS = 2;

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ select?: string }>();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Search-as-you-type (Phase 2): the term is state; `load` folds it into
  // the query. Debounced below so a fast typist fires one query per pause,
  // not per keystroke.
  const [search, setSearch] = useState('');
  // Seeded from the param, not just `false` — expo-router's tab screens
  // mount lazily, so the very first visit to Library from Home's "Combine
  // documents" tile IS the initial mount, with `select=combine` already
  // present. A later effect can't land before that first paint, so relying
  // on one alone means this mode never engages the first time.
  const [selecting, setSelecting] = useState(() => params.select === 'combine');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { importPhotos, dialog: importDialog } = useImportPhotos();
  /** Multi-delete confirm (plan §8's delete semantics, batched): the themed
   * confirm is open, waiting on the user to remove the selected documents
   * or back out. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  // True while the batch delete is writing — the toolbar's actions
  // disable so a slow delete can't be double-tapped.
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setEntries(await fetchLibrary(db, search));
  }, [db, search]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e: unknown) => logThrown('library-load', e));
    }, [load]),
  );

  // Handles arriving here while Library is already mounted (the tab was
  // visited before) — the initial-state seeding above only covers the
  // first mount. `useResetOnOpen` only fires on a false→true transition,
  // which is reliable here specifically because the effect below clears
  // the param right after it's consumed — otherwise a *second* tap of
  // Home's tile would never register as a change (the param would already
  // be sitting at 'combine' from last time).
  useResetOnOpen(params.select === 'combine', () => {
    setSelecting(true);
    setSelected(new Set());
  });

  // Side effect only (no local setState here — that's what the render-phase
  // `useResetOnOpen` above is for): tell the router to drop the param once
  // consumed, so a stale `select=combine` can't re-enter selection mode on
  // a later tab focus after the user taps Done.
  useEffect(() => {
    if (params.select === 'combine') {
      router.setParams({ select: undefined });
    }
  }, [params.select, router]);

  // Debounced re-query while the term changes (Phase 2). The focus effect
  // above covers focus/param changes; this covers typing. Clearing runs
  // immediately; typing waits 250ms for a pause.
  useEffect(() => {
    if (search === '') {
      return; // focus effect and stale-timer cleanup handle the empty term
    }
    const timer = setTimeout(() => {
      load().catch((e: unknown) => logThrown('library-search', e));
    }, 250);
    return () => clearTimeout(timer);
    // `load` intentionally excluded: it already changes identity with
    // `search` (its dependency), which is the only trigger this timer
    // wants; focus-effect recreation would otherwise restart it needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function enterSelection(seedId?: string) {
    setSelecting(true);
    setSelected(seedId == null ? new Set() : new Set([seedId]));
  }

  function exitSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function onImportPhotos() {
    const documentId = await importPhotos();
    if (documentId != null) {
      router.push(`/document/${documentId}`);
    } else {
      // Split-save (and cancel) resolve as "stay here" — but the grid
      // only reloads on focus, and nothing navigates, so an import that
      // saved documents would leave a stale list on screen.
      load().catch((e: unknown) => logThrown('library-import-load', e));
    }
  }

  /** Remove every selected document — rows first (FK cascades pages and
   * document_tags), then each document's scan files from disk. Sequential
   * by convention (read-modify-write of shared state); one failure stops
   * the batch with what happened reported, never a silent partial. */
  async function onDeleteSelected() {
    if (selected.size === 0 || deleting) {
      return;
    }
    setDeleting(true);
    const ids = Array.from(selected);
    const removals: Directory[] = ids.map((docId) => new Directory(scanRootDir(), docId));
    try {
      // A single transaction wrapping every delete keeps the batch
      // atomic: either all rows go or none do. `withTransactionAsync`
      // callbacks must return Promise<void>, so the loop lives inside it.
      await db.withTransactionAsync(async () => {
        for (const docId of ids) {
          await db.runAsync('DELETE FROM scan_documents WHERE id = ?', [docId]);
        }
      });
      // Files only after the rows committed — a failure here leaves
      // orphans (harmless, invisible) rather than live rows with no
      // files (visible thumbnails that 404 on open).
      for (const dir of removals) {
        if (dir.exists) {
          dir.delete();
        }
      }
      exitSelection();
    } catch (e: unknown) {
      logThrown('library-delete', e);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Delete failed', message);
    } finally {
      setDeleting(false);
      load().catch((e: unknown) => logThrown('library-delete-load', e));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenTitle
          eyebrow="Your scans"
          title="Library"
          subtitle={entries != null ? `${entries.length} document${entries.length === 1 ? '' : 's'}` : undefined}
          right={
            entries != null && entries.length > 0 ? (
              <ThemedView style={styles.headerActions}>
                <IconButton accessibilityLabel="Import from photos" onPress={() => void onImportPhotos()} />
                {/*
                 * "Cancel", not "Done" — this always discards the
                 * selection and exits; it never finishes anything (the
                 * bottom "Combine N..." bar is the actual completion
                 * action). "Done" implied it would confirm/complete,
                 * which made it look broken once items were selected.
                 */}
                <AppButton
                  label={selecting ? 'Cancel' : 'Combine'}
                  variant="outline"
                  onPress={() => (selecting ? exitSelection() : enterSelection())}
                />
              </ThemedView>
            ) : undefined
          }
        />

        {/* Search (Phase 2) — under the header, above the grid. Hidden
            while selecting; combining wants the full list visible. */}
        {!selecting && (entries == null || search.length > 0 || (entries != null && entries.length > 0)) && (
          <View style={styles.searchRow}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search' }}
              size={16}
              tintColor={theme.textSecondary}
            />
            <TextInput
              style={[
                styles.searchInput,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by title"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              autoCorrect={false}
              underlineColorAndroid="transparent"
              accessibilityLabel="Search documents by title"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search">
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel' }}
                  size={16}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            )}
          </View>
        )}

        {entries == null ? (
          <ActivityIndicator style={styles.center} size="large" />
        ) : entries.length === 0 ? (
          search.trim().length > 0 ? (
            <ThemedView style={styles.emptyState}>
              <ThemedText type="subtitle">No matches</ThemedText>
              <ThemedText type="small" style={[styles.emptyHint, { color: theme.textSecondary }]}>
                {`Nothing is titled "${search.trim()}".`}
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedView style={styles.emptyState}>
              <ThemedText type="subtitle">No documents yet</ThemedText>
              <ThemedText type="small" style={[styles.emptyHint, { color: theme.textSecondary }]}>
                Scan your first document. Everything stays on this device.
              </ThemedText>
            </ThemedView>
          )
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => (
              <LibraryCell
                item={item}
                selecting={selecting}
                selected={selected.has(item.id)}
                onPress={() => {
                  if (selecting) {
                    toggleSelected(item.id);
                  } else {
                    router.push(`/document/${item.id}`);
                  }
                }}
                onLongPress={() => {
                  if (!selecting) {
                    enterSelection(item.id);
                  }
                }}
              />
            )}
          />
        )}
        {selecting && selected.size > 0 && (
          <ThemedView
            type="backgroundElement"
            style={[
              styles.selectionBar,
              CardShadow(theme.shadow),
              { bottom: insets.bottom + TAB_BAR_GAP },
            ]}>
            {deleting ? (
              <ActivityIndicator style={styles.toolbarSpinner} />
            ) : (
              <>
                <AppButton
                  label={`Combine ${selected.size}`}
                  onPress={() =>
                    router.push({
                      pathname: '/compose',
                      params: { ids: Array.from(selected).join(',') },
                    })
                  }
                />
                <AppButton
                  label="Delete"
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                />
              </>
            )}
          </ThemedView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete documents"
        message={`Delete ${selected.size} document${selected.size === 1 ? '' : 's'} and all their pages? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          void onDeleteSelected();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <SaveScanDialog {...importDialog} />
    </ThemedView>
  );
}

/** Props for {@link IconButton}. */
interface IconButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * Small round icon-only action for the header's secondary actions —
 * currently just "Import from photos" (plan/UI.md §1).
 */
function IconButton({ accessibilityLabel, onPress }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      {/*
       * `photo.on.rectangle` depicts two overlapping, offset photo frames
       * by design — that's the "tilted" look. A plain single frame reads
       * as level.
       */}
      <SymbolView name={{ ios: 'photo', android: 'photo_library' }} size={18} tintColor={theme.text} />
    </Pressable>
  );
}

/** Props for {@link LibraryCell}. */
interface LibraryCellProps {
  item: LibraryEntry;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * One grid cell: `PaperThumb` above a name/meta column, with press
 * feedback. Its own component (not inlined in `renderItem`) because
 * `usePressScale` is a hook — `renderItem` is a plain callback invoked per
 * row, not a component instance, so a hook can't live there directly.
 */
function LibraryCell({ item, selecting, selected, onPress, onLongPress }: LibraryCellProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <ThemedView style={styles.cell}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}>
        <Animated.View style={animatedStyle}>
          <PaperThumb uri={item.firstThumbPath} pageCount={item.pageCount} selected={selecting && selected} />
        </Animated.View>
      </Pressable>
      <ThemedText type="defaultSemiBold" numberOfLines={1}>
        {item.title}
      </ThemedText>
      <ThemedView style={styles.metaRow}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {formatDate(item.createdAt)} · {item.pageCount} page{item.pageCount === 1 ? '' : 's'}
        </ThemedText>
      </ThemedView>
      {item.tags.length > 0 && (
        <View style={styles.tagRow}>
          {item.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                {tag}
              </ThemedText>
            </View>
          ))}
          {item.tags.length > 3 && (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              +{item.tags.length - 3}
            </ThemedText>
          )}
        </View>
      )}
    </ThemedView>
  );
}

/** Stable short date for the card detail line. */
function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    // Breathing room below the header's count line — the header's own
    // bottom padding is deliberately tight, and the search field tucked
    // right under it read as part of the title block.
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tagChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  center: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    textAlign: 'center',
  },
  gridContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.three,
  },
  cell: {
    flex: 1 / NUM_COLUMNS,
    gap: Spacing.two,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // `bottom` comes from the real safe-area inset at the call site, not a
  // static value here. Same pill geometry as the floating tab bar so the
  // swap reads as *that bar changing contents*, not an overlay popping in.
  selectionBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    height: TAB_BAR_HEIGHT,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: Spacing.two,
  },
  toolbarSpinner: {
    flex: 1,
  },
});
