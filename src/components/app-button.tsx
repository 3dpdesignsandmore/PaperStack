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

/**
 * Visual variants of {@link AppButton}. `muted` is a filled button in
 * `theme.textSecondary` rather than the accent — Compose's "export anyway"
 * state (plan/UI.md §4): the action stays available, just visually
 * discouraged rather than colored as a destructive `danger` action.
 */
export type AppButtonVariant = 'filled' | 'outline' | 'danger' | 'muted';

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
    variant === 'filled' ? theme.accent : variant === 'muted' ? theme.textSecondary : 'transparent';
  const borderColor =
    variant === 'danger'
      ? theme.danger
      : variant === 'muted'
        ? theme.textSecondary
        : variant === 'outline'
          ? theme.border
          : theme.accent;
  // Filled and muted both sit on a solid fill, so their labels need the
  // page background color rather than accent/danger text.
  const textColor =
    variant === 'filled'
      ? theme.accentText
      : variant === 'muted'
        ? theme.background
        : variant === 'danger'
          ? theme.danger
          : theme.accent;
  // The filled variant is the primary action — give it a soft glow rather
  // than a flat fill. A black shadow would barely show against this app's
  // dark background; a colored glow stays visible in both themes. `muted`
  // is deliberately flat — it's the discouraged path, not the emphasized
  // one.
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
          <ThemedText
            type="defaultSemiBold"
            style={{ color: textColor, flexShrink: 1 }}
            numberOfLines={1}>
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
    // Label is one unwrapped line (`numberOfLines={1}` above); keep the
    // pill from growing tall when a row of equal-width buttons is too
    // narrow for the full label at default padding.
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
});
