/**
 * Home (plan/UI.md §1, §4): a dashboard, not a menu. Takes over the launch
 * route (`index.tsx`) from Library, which moved to `library.tsx`. Every
 * element here either tells the user something they didn't know or starts
 * work they came here to do — a tile that only says "Library" would fail
 * that test, since the tab bar already does it.
 */
import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppCard } from '@/components/app-card';
import { SaveScanDialog } from '@/components/save-scan-dialog';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, glowShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCapture } from '@/hooks/use-capture';
import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/hooks/use-theme';
import { logThrown } from '@/lib/debug-log';
import { fetchLibrary } from '@/lib/db/queries';
import type { LibraryEntry } from '@/lib/model';
import { SCAN_DIR_NAME } from '@/lib/db/persist-scan';

/** How many of the newest documents show in the Recent row. */
const RECENT_COUNT = 5;

/** Human-readable byte size, e.g. "38.4 MB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  // The scan dialog still mounts here (the flow can be triggered while
  // Home is focused); the tile itself now routes to the recipients page.
  const { dialog } = useCapture();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  // Tracks the document count `usedBytes` was last computed for, so a plain
  // tab-switch back to Home doesn't re-walk the scans directory.
  const sizedForCount = useRef<number | null>(null);

  const load = useCallback(async () => {
    const library = await fetchLibrary(db);
    setEntries(library);
    // `Directory.size` is a synchronous, recursive filesystem walk — real
    // cost with enough scans. `fetchLibrary` runs on every focus (a tab
    // switch back to Home), so only re-walk when the document count
    // actually changed since the last read (a new scan or a delete);
    // renaming or appending pages to an existing document won't refresh
    // this figure until the count next changes, which is an acceptable
    // approximation for a status line, not an exact quota.
    if (sizedForCount.current !== library.length) {
      sizedForCount.current = library.length;
      setUsedBytes(new Directory(Paths.document, SCAN_DIR_NAME).size ?? 0);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e: unknown) => logThrown('home-load', e));
    }, [load]),
  );

  const recent = entries?.slice(0, RECENT_COUNT) ?? [];
  const isEmpty = entries != null && entries.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenTitle
            eyebrow="PaperStack"
            title="Home"
            right={
              <Pressable
                onPress={() => router.push('/settings')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                style={({ pressed }) => [
                  styles.gearButton,
                  { backgroundColor: theme.backgroundSelected },
                  pressed && styles.pressed,
                ]}>
                <SymbolView name={{ ios: 'gearshape.fill', android: 'settings' }} size={18} tintColor={theme.text} />
              </Pressable>
            }
          />

          <ThemedView style={styles.tileRow}>
            <ActionTile
              icon={{ ios: 'person.2', android: 'group' }}
              label="View recipients"
              accent
              onPress={() => router.push('/recipients')}
            />
            <ActionTile
              icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
              label="Send"
              detail="One scan per page, or combined"
              onPress={() => router.push('/library')}
            />
          </ThemedView>

          {!isEmpty && recent.length > 0 && (
            <ThemedView style={styles.section}>
              <ThemedView style={styles.sectionHeader}>
                <ThemedText type="label" style={{ color: theme.textSecondary }}>
                  Recent
                </ThemedText>
                <Pressable onPress={() => router.push('/library')} hitSlop={8}>
                  <ThemedText type="link" style={{ color: theme.accent }}>
                    See all
                  </ThemedText>
                </Pressable>
              </ThemedView>
              <FlatList
                data={recent}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentContent}
                renderItem={({ item }) => (
                  <Pressable onPress={() => router.push(`/document/${item.id}`)} style={styles.recentItem}>
                    <Image
                      source={{ uri: item.firstThumbPath ?? undefined }}
                      style={[
                        styles.recentThumb,
                        { borderRadius: Radius.medium, backgroundColor: theme.backgroundSelected },
                      ]}
                      contentFit="cover"
                      transition={150}
                      // Same recycling gotcha as Library's PaperThumb — this
                      // list is small enough today to not show it, but a
                      // FlatList cell can still get reused.
                      recyclingKey={item.firstThumbPath ?? undefined}
                    />
                    <ThemedText type="small" numberOfLines={1} style={styles.recentTitle}>
                      {item.title}
                    </ThemedText>
                  </Pressable>
                )}
              />
            </ThemedView>
          )}

          {entries != null && usedBytes != null && (
            <ThemedText type="small" style={[styles.statusLine, { color: theme.textSecondary }]}>
              {isEmpty
                ? 'Scan your first document. Everything stays on this device.'
                : `${entries.length} document${entries.length === 1 ? '' : 's'} · ${formatBytes(usedBytes)} used`}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>

      <SaveScanDialog {...dialog} />
    </ThemedView>
  );
}

/** Props for {@link ActionTile}. */
interface ActionTileProps {
  icon: SymbolViewProps['name'];
  label: string;
  /** Optional smaller line under the tile title. */
  detail?: string;
  accent?: boolean;
  onPress: () => void;
}

/** One of Home's two primary action tiles. */
function ActionTile({ icon, label, detail, accent = false, onPress }: ActionTileProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const glow = accent ? glowShadow(theme.accent) : null;

  return (
    <Animated.View style={[styles.tile, glow, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.tilePressable}>
        <AppCard style={[styles.tileCard, accent && { backgroundColor: theme.accent }]}>
          <SymbolView name={icon} size={26} tintColor={accent ? theme.accentText : theme.text} />
          <View style={styles.tileText}>
            <ThemedText type="defaultSemiBold" style={{ color: accent ? theme.accentText : theme.text }}>
              {label}
            </ThemedText>
            {detail != null && (
              <ThemedText type="small" style={{ color: accent ? theme.accentText : theme.textSecondary }}>
                {detail}
              </ThemedText>
            )}
          </View>
        </AppCard>
      </Pressable>
    </Animated.View>
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
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  gearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
  },
  tilePressable: {
    flex: 1,
  },
  tileCard: {
    flex: 1,
    aspectRatio: 1.15,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  tileText: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentContent: {
    gap: Spacing.three,
  },
  recentItem: {
    width: 110,
    gap: Spacing.one,
  },
  recentThumb: {
    width: 110,
    aspectRatio: 3 / 4,
  },
  recentTitle: {
    textAlign: 'left',
  },
  statusLine: {
    textAlign: 'center',
  },
});
