/**
 * Small themed confirm dialog — title, message, two buttons.
 *
 * The app's own card style (matching SendSheet / PromptDialog /
 * RecipientFormDialog) instead of React Native's `Alert.alert`, which
 * renders the OS's system dialog: platform-styled, unthemed, and visually
 * inconsistent with every other dialog in the app. Use this wherever a
 * mid-flow decision needs Yes/No-style confirmation; keep `Alert.alert`
 * for incidental error toasts where the system look is fine.
 */
import { Modal, Pressable, StyleSheet } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  visible: boolean;
  /** Dialog title. */
  title: string;
  /** Helper text under the title. */
  message?: string;
  /** Confirm button label. Default "Confirm". */
  confirmLabel?: string;
  /** Use the destructive (red) emphasis on the confirm button. */
  destructive?: boolean;
  /** Called when the confirm button is pressed. */
  onConfirm: () => void;
  /** Called on cancel/dismiss. */
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, CardShadow(theme.shadow), { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {message != null && (
            <ThemedText
              type="small"
              style={[styles.message, { color: theme.textSecondary }]}>
              {message}
            </ThemedText>
          )}
          <ThemedView style={styles.actions}>
            <AppButton label="Cancel" variant="outline" onPress={onCancel} />
            <AppButton
              label={confirmLabel}
              variant={destructive ? 'danger' : 'filled'}
              onPress={onConfirm}
            />
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
  },
  message: {
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
