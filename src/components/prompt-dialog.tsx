/**
 * Small themed dialog with a single text input.
 *
 * `Alert.prompt` exists only on iOS, so PaperStack needs its own modal
 * for "name this scan" (and future one-field prompts like rename).
 */
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Props for {@link PromptDialog}. */
export interface PromptDialogProps {
  /** Whether the dialog is visible. */
  visible: boolean;
  /** Dialog title. */
  title: string;
  /** Helper text under the title. */
  message?: string;
  /** Initial value in the input. */
  initialValue?: string;
  /** Placeholder when empty. */
  placeholder?: string;
  /** Confirm button label. */
  confirmLabel?: string;
  /** Called with the trimmed value on confirm. Empty input is rejected. */
  onConfirm: (value: string) => void;
  /** Called on cancel/dismiss. */
  onCancel: () => void;
}

export function PromptDialog({
  visible,
  title,
  message,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {message != null && (
            <ThemedText type="small" style={styles.message}>
              {message}
            </ThemedText>
          )}
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (value.trim().length > 0) {
                onConfirm(value.trim());
              }
            }}
          />
          <ThemedView style={styles.actions}>
            <Pressable style={styles.action} onPress={onCancel}>
              <ThemedText type="defaultSemiBold">Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.action}
              disabled={value.trim().length === 0}
              onPress={() => onConfirm(value.trim())}>
              <ThemedText
                type="defaultSemiBold"
                style={value.trim().length === 0 ? styles.actionDisabled : styles.actionConfirm}>
                {confirmLabel}
              </ThemedText>
            </Pressable>
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
    borderRadius: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
  },
  message: {
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.OS === 'ios' ? Spacing.two : 0,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  action: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  actionConfirm: {
    color: '#208AEF',
  },
  actionDisabled: {
    opacity: 0.4,
  },
});
