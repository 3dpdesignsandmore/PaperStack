/**
 * Library screen (plan §8): grid of scanned documents, newest first.
 * Lives at the `/` route (file must be index.tsx — the launch URL must
 * resolve), labeled "Library" in the tab bar.
 */
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLibrary } from '@/lib/db/queries';
import type { LibraryEntry } from '@/lib/model'; /** Columns in the library grid. */
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
          <ThemedView style={styles.headerLabel}>
            <ThemedText type="label" style={{ color: theme.accent }}>
              Your scans
            </ThemedText>
          </ThemedView>
          <ThemedText type="title" style={styles.title}>
            Library
          </ThemedText>
          <ThemedView style={styles.headerRow}>
            {entries != null && (
              <ThemedText
                type="small"
                numberOfLines={1}
                style={[styles.entryCount, { color: theme.textSecondary }]}>
                {entries.length} document{entries.length === 1 ? '' : 's'}
              </ThemedText>
            )}
            {entries != null && entries.length > 0 && (
              <AppButton
                label={selecting ? 'Done' : 'Select'}
                variant="outline"
                onPress={() => {
                  setSelecting((s) => !s);
                  setSelected(new Set());
                }}
              />
            )}
          </ThemedView>
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
                    { borderColor: theme.border },
                    selecting &&
                      selected.has(item.id) && {
                        borderColor: theme.accent,
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
                    <ThemedView
                      style={[
                        styles.checkBadge,
                        {
                          backgroundColor: theme.accent,
                          borderColor: theme.background,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={[styles.checkText, { color: theme.accentText }]}>
                        {'✓'}
                      </ThemedText>
                    </ThemedView>
                  )}
                  <ThemedView style={styles.cardBody}>
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
                </ThemedView>
              </Pressable>
            )}
          />
        )}
        {selecting && selected.size > 0 && (
          <AppButton
            label={`Compose ${selected.size} into packed PDF`}
            onPress={() =>
              router.push({
                pathname: '/compose',
                params: { ids: Array.from(selected).join(',') },
              })
            }
            style={styles.composeBar}
          />
        )}
      </SafeAreaView>
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
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  entryCount: {
    flexShrink: 1,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    paddingHorizontal: Spacing.four,
  },
  headerLabel: {
    paddingHorizontal: Spacing.four,
  },
  center: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: Spacing.two,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: Radius.medium,
  },
  cardInner: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#80808040',
  },
  cardBody: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  cardDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  composeBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: BottomTabInset + Spacing.two,
  },
});
