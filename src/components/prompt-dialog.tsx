/**
 * Small themed dialog with a single text input.
 *
 * `Alert.prompt` exists only on iOS, so PaperStack needs its own modal
 * for "name this scan" (and future one-field prompts like rename).
 */
import { useEffect, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
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

  // The dialog stays mounted; pick up a new initialValue each time it
  // opens (e.g. the prefix loaded from settings just before showing).
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">{title}</ThemedText>
          {message != null && (
            <ThemedText
              type="small"
              style={[styles.message, { color: theme.textSecondary }]}>
              {message}
            </ThemedText>
          )}
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
              },
            ]}
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
            <AppButton label="Cancel" variant="outline" onPress={onCancel} />
            <AppButton
              label={confirmLabel}
              variant="filled"
              onPress={() => onConfirm(value.trim())}
              disabled={value.trim().length === 0}
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
    borderWidth: 1,
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
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.OS === 'ios' ? Spacing.two : 0,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
