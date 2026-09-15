/**
 * Shared pill button used across all screens — filled (primary/destructive
 * emphasis) or outlined (secondary emphasis). One canonical style so buttons
 * look identical everywhere they appear.
 */
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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

  const backgroundColor =
    variant === 'filled' ? theme.accent : 'transparent';
  const borderColor =
    variant === 'danger' ? theme.danger : variant === 'outline' ? theme.border : theme.accent;
  // Filled uses accentText; outlines use their own border color.
  const textColor =
    variant === 'filled' ? theme.accentText : variant === 'danger' ? theme.danger : theme.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor, borderColor },
        disabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="defaultSemiBold" style={{ color: textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
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
