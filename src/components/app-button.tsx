/**
 * Shared pill button used across all screens — filled (primary/destructive
 * emphasis) or outlined (secondary emphasis). One canonical style so buttons
 * look identical everywhere they appear.
 */
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { glowShadow, Radius, Spacing } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/hooks/use-theme';

/** Visual variants of {@link AppButton}. */
export type AppButtonVariant = 'filled' | 'outline' | 'danger';

/** Props for {@link AppButton}. */
export interface AppButtonProps {
  /** Button label. */
  label: string;
  /** Visual variant. Default 'filled'. */
  variant?: AppButtonVariant;
  /** Press handler. */
  onPress: () => void;
  /** Disable interaction and dim the button. */
  disabled?: boolean;
  /** Show a spinner in place of the label (while disabled). */
  loading?: boolean;
  /** Extra style, e.g. margin. */
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  variant = 'filled',
  onPress,
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  const backgroundColor =
    variant === 'filled' ? theme.accent : 'transparent';
  const borderColor =
    variant === 'danger' ? theme.danger : variant === 'outline' ? theme.border : theme.accent;
  // Filled uses accentText; outlines use their own border color.
  const textColor =
    variant === 'filled' ? theme.accentText : variant === 'danger' ? theme.danger : theme.accent;
  // The filled variant is the primary action — give it a soft glow rather
  // than a flat fill. A black shadow would barely show against this app's
  // dark background; a colored glow stays visible in both themes.
  const glow = variant === 'filled' && !disabled ? glowShadow(theme.accent) : null;

  return (
    <Animated.View style={[glow, animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={[styles.button, { backgroundColor, borderColor }, disabled && styles.disabled]}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <ThemedText type="defaultSemiBold" style={{ color: textColor }}>
            {label}
          </ThemedText>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
