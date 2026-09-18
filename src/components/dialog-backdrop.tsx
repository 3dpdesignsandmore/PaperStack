/**
 * Shared scaffold for the app's centered dialogs: the transparent
 * Modal plus the keyboard-avoiding wrapper around whatever the dialog
 * renders. Every themed dialog (save scan, prompt, confirm, recipient
 * form/picker, send sheet) renders through this so they all behave
 * alike — same fade-in, same hardware-back dismissal, same keyboard
 * behavior. The dialog keeps its own backdrop Pressable (scrim +
 * tap-outside) and card; they become children here.
 *
 * Keyboard: Android's enforced edge-to-edge (Expo SDK 54+) ignores the
 * modal window's `SOFT_INPUT_ADJUST_RESIZE` — the window never resizes,
 * so the IME draws straight over a centered card unless the card moves
 * itself (reported 2026-09-17 on a standard-height phone; taller screens
 * just happened to clear it). iOS modals never resized for the keyboard
 * either. So this shell pads its bottom by the live keyboard height and
 * lets the dialog's `justifyContent: 'center'` re-center the card in
 * the space that remains — the split an adjusting window used to
 * provide. The reported height is the IME inset minus the system-bar
 * overlap, which is exactly the space the (possibly inset) modal
 * window loses. Cards still own their `maxHeight` and flexible lists
 * to shrink within the reduced space.
 */
import { type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

/** Props for {@link DialogBackdrop}. */
export interface DialogBackdropProps {
  /** Whether the dialog is visible. */
  visible: boolean;
  /** Dismissed by backdrop tap or Android hardware back. */
  onDismiss: () => void;
  /** The dialog card (plus any sibling nested modals it renders). */
  children: ReactNode;
}

export function DialogBackdrop({ visible, onDismiss, children }: DialogBackdropProps) {
  const keyboardHeight = useKeyboardHeight();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.keyboardAvoid, { paddingBottom: keyboardHeight }]}>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
});
