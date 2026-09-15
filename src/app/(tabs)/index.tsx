/**
 * Library screen (plan §8): grid of scanned documents, newest first.
 * Lives at the `/` route (file must be index.tsx — the launch URL must
 * resolve), labeled "Library" in the tab bar.
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLibrary } from '@/lib/db/queries';
import type { LibraryEntry } from '@/lib/model';/** Columns in the library grid. */
const NUM_COLUMNS = 2;

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setEntries(await fetchLibrary(db));
  }, [db]);

  // Reload whenever the tab gains focus (e.g. after a scan completes on the
  // Scan tab and the user comes back).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Library
          </ThemedText>
          {entries != null && (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {entries.length} document{entries.length === 1 ? '' : 's'}
            </ThemedText>
          )}
          {entries != null && entries.length > 0 && (
            <Pressable
              style={styles.selectToggle}
              onPress={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}>
              <ThemedText type="defaultSemiBold" style={styles.selectToggleText}>
                {selecting ? 'Done' : 'Select'}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {entries == null ? (
          <ActivityIndicator style={styles.center} size="large" />
        ) : entries.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyState}>
            <ThemedText type="subtitle" style={{ color: theme.text }}>
              No documents yet
            </ThemedText>
            <ThemedText
              type="small"
              style={[styles.emptyHint, { color: theme.textSecondary }]}>
              Head to the Scan tab to capture your first receipt or document.
              Everything stays on this device.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={() => {
                  if (selecting) {
                    toggleSelected(item.id);
                  } else {
                    router.push(`/document/${item.id}`);
                  }
                }}>
                <ThemedView
                  type="backgroundElement"
                  style={[
                    styles.cardInner,
                    selecting &&
                      selected.has(item.id) && {
                        borderColor: '#208AEF',
                        borderWidth: 2,
                      },
                  ]}>
                  <Image
                    source={{ uri: item.firstThumbPath ?? undefined }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    recyclingKey={item.id}
                    transition={150}
                  />
                  {selecting && selected.has(item.id) && (
                    <ThemedView style={styles.checkBadge}>
                      <ThemedText type="smallBold" style={styles.checkText}>
                        {'✓'}
                      </ThemedText>
                    </ThemedView>
                  )}
                  <ThemedText
                    type="smallBold"
                    style={styles.cardTitle}
                    numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={[styles.cardDetail, { color: theme.textSecondary }]}>
                    {formatDate(item.createdAt)} · {item.pageCount} page
                    {item.pageCount === 1 ? '' : 's'}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
          />
        )}
        {selecting && selected.size > 0 && (
          <Pressable
            style={styles.composeBar}
            onPress={() =>
              router.push({
                pathname: '/compose',
                params: { ids: Array.from(selected).join(',') },
              })
            }>
            <ThemedText type="defaultSemiBold" style={styles.composeBarText}>
              Compose {selected.size} into packed PDF
            </ThemedText>
          </Pressable>
        )}      </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
  },
  center: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
    maxWidth: 320,
  },
  gridContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    flex: 1 / NUM_COLUMNS,
    margin: Spacing.one,
    borderRadius: Spacing.two,
  },
  cardInner: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
    gap: Spacing.one,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Spacing.two,
    backgroundColor: '#80808040',
  },
  cardTitle: {
    paddingHorizontal: Spacing.one,
  },
  cardDetail: {
    paddingHorizontal: Spacing.one,
  },
  selectToggle: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    borderColor: '#208AEF',
    borderWidth: 1,
  },
  selectToggleText: {
    color: '#208AEF',
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  composeBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: BottomTabInset + Spacing.two,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    backgroundColor: '#208AEF',
  },
  composeBarText: {
    color: '#FFFFFF',
  },
});
