/**
 * Pure presentation of a stacked-composition legibility verdict (plan/UI.md
 * §2; thresholds are PLAN.md §5 and must match `pack-columns.ts`'s scale
 * math — they are duplicated here as literals, not imported, because the
 * bands are a display concern with its own copy/color per band).
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link LegibilityMeter}. */
export interface LegibilityMeterProps {
  /** `PackResult.minScale` — the smallest item scale in the composition. */
  scale: number;
}

/** One legibility band's title and accent color. */
interface LegibilityBand {
  title: string;
  color: string;
}

function bandFor(scale: number, colors: { success: string; warning: string; danger: string }): LegibilityBand {
  if (scale >= 0.6) {
    return { title: 'Crisp', color: colors.success };
  }
  if (scale >= 0.45) {
    return { title: 'Small print', color: colors.warning };
  }
  return { title: 'Too small to read', color: colors.danger };
}

export function LegibilityMeter({ scale }: LegibilityMeterProps) {
  const theme = useTheme();
  const band = bandFor(scale, theme);
  // 12% opacity as a hex alpha suffix: 0.12 * 255 ≈ 31 = 0x1F.
  const background = `${band.color}1F`;

  return (
    <ThemedView style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: band.color }]} />
      <View style={styles.textColumn}>
        <ThemedText type="smallBold" style={{ color: band.color }}>
          {band.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Prints at {Math.round(scale * 100)}% of life size.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.medium,
    padding: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textColumn: {
    gap: Spacing.half,
  },
});
