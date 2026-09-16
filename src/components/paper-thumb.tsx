/**
 * Library grid thumbnail — a sheet of paper, not a bordered box (plan/UI.md
 * §2). Multi-page documents show 1–2 offset sheets peeking out behind the
 * top image, capped at two regardless of the real page count.
 *
 * Two-layer split, same reason as `AppCard`'s comment: the outer view owns
 * the shadow and must not clip, the inner view owns the radius and clips
 * the image.
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link PaperThumb}. */
export interface PaperThumbProps {
  /** Image URI for the top sheet, or null while a thumbnail is missing. */
  uri: string | null;
  /** Total page count — drives the stacked-sheet decoration. */
  pageCount: number;
  /** Draws the accent selection ring and check badge. */
  selected?: boolean;
}

export function PaperThumb({ uri, pageCount, selected = false }: PaperThumbProps) {
  const theme = useTheme();
  const decorationCount = Math.min(Math.max(pageCount - 1, 0), 2);

  return (
    <ThemedView style={[styles.outer, CardShadow(theme.shadow)]}>
      {decorationCount >= 2 && (
        <ThemedView
          style={[
            styles.decoration,
            { backgroundColor: theme.backgroundSelected },
            styles.decorationBack,
          ]}
        />
      )}
      {decorationCount >= 1 && (
        <ThemedView
          style={[
            styles.decoration,
            { backgroundColor: theme.backgroundSelected },
            styles.decorationFront,
          ]}
        />
      )}
      <ThemedView type="backgroundElement" style={styles.inner}>
        <Image
          source={{ uri: uri ?? undefined }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          // Library's grid is a virtualized FlatList — without a
          // recyclingKey, expo-image can reuse a recycled cell's native
          // image view for a different item without resetting it first,
          // leaving the thumbnail blank until something else forces a
          // repaint (e.g. toggling selection). `uri` is unique per
          // document (each lives under its own documents/scans/<id>/
          // folder), so it's a stable, sufficient key on its own.
          recyclingKey={uri ?? undefined}
        />
        {selected && (
          <ThemedView style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.background }]}>
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              {'✓'}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
      {/*
       * A sibling overlay, not a border added to `inner` — RN includes
       * border width inside a view's own box, so toggling a border there
       * shrinks the Image's computed size by a few px on every select/
       * deselect. That layout churn on a recycled FlatList cell was
       * exactly what made the thumbnail go blank after deselecting.
       * This ring sits on top instead and never touches the image's box.
       */}
      {selected && (
        <View pointerEvents="none" style={[styles.selectionRing, { borderColor: theme.accent }]} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  outer: {
    aspectRatio: 3 / 4,
    position: 'relative',
  },
  decoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.medium,
  },
  decorationBack: {
    transform: [{ translateX: 7 }, { translateY: 7 }, { rotate: '-1.8deg' }],
  },
  decorationFront: {
    transform: [{ translateX: 6 }, { translateY: 6 }, { rotate: '2.2deg' }],
  },
  inner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.medium,
    borderWidth: 2,
  },
});
