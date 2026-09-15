/**
 * Header for pushed (non-tab) screens — document detail, compose. The root
 * Stack renders with `headerShown: false` everywhere (plan §8's tab screens
 * each draw their own custom header row), so pushed screens need their own
 * back affordance too, or the only way out is an undiscoverable edge-swipe
 * gesture with no page title. This is that affordance, styled to match the
 * rest of the app rather than falling back to the native header bar.
 */
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link ScreenHeader}. */
export interface ScreenHeaderProps {
  /** Title shown next to the back button. */
  title: string;
  /** Called on back press. Defaults to `router.back()`. */
  onBack?: () => void;
}

export function ScreenHeader({ title, onBack }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.row}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={18}
          weight="semibold"
          tintColor={theme.text}
        />
      </Pressable>
      <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      {/* Balances the back button so the title centers visually. */}
      <ThemedView style={styles.spacer} />
    </ThemedView>
  );
}

const SIDE_WIDTH = 36;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  backButton: {
    width: SIDE_WIDTH,
    height: SIDE_WIDTH,
    borderRadius: SIDE_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    width: SIDE_WIDTH,
    backgroundColor: 'transparent',
  },
});
