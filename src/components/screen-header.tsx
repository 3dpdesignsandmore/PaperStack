/**
 * Header for pushed (non-tab) screens — Settings, Send, document detail,
 * recipients, licenses, legal. The root Stack renders with
 * `headerShown: false` everywhere (plan §8's tab screens each draw their
 * own header row), so pushed screens need their own back affordance too,
 * or the only way out is an undiscoverable edge-swipe.
 *
 * Renders the SAME dashboard stack the tab screens use (`ScreenTitle`):
 * wordmark eyebrow, left-aligned page title — so "Settings" and "Home"
 * left-align identically (user request, 2026-09-16) — with the back
 * button in the `right` slot where Home's gear / Library's actions live,
 * instead of an arrow column that pushed every title right. The hairline
 * below stays as the push-screen signal.
 */
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link ScreenHeader}. */
export interface ScreenHeaderProps {
  /** Title shown as the page's heading. */
  title: string;
  /** Called on back press. Defaults to `router.back()`. */
  onBack?: () => void;
}

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={[styles.wrap, { borderBottomColor: theme.border }]}>
      <ScreenTitle
        eyebrow="PaperStack"
        title={title}
        right={
          <Pressable
            onPress={onBack ?? (() => router.back())}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              size={18}
              weight="semibold"
              tintColor={theme.text}
            />
          </Pressable>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    // NO top padding — Home/Library's wordmarks sit at the very top of
    // the safe area, and any top padding here pushed Settings' (and every
    // pushed screen's) copy down 8px vs those (user request, 2026-09-16).
    // A little bottom padding keeps the hairline from hugging the title.
    paddingBottom: Spacing.one,
  },
  // Same pill as Home's gear button — the `right`-slot action styling.
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
