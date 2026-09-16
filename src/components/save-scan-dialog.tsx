/**
 * Save-flow dialog for a just-captured or just-imported set of pages: name
 * it as a new document, or tap an existing one to append to instead.
 * Shared by every entry point that produces page URIs and calls
 * `useSaveFlow()` — scanning (the floating tab bar's Scan pill, Home's
 * Scan tile, the `/scan` deep-link route) via `useCapture()`, and
 * importing existing photos (Library's import icon) via
 * `useImportPhotos()`.
 *

 * One Modal, so both options are always visible together — a Modal always
 * renders in its own native layer above the rest of the screen, so a
 * sibling "append sheet" positioned absolutely below a separate dialog
 * would be permanently hidden behind its backdrop and never reachable.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import type { CaptureDialogState } from '@/hooks/use-capture';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';

export function SaveScanDialog({
  visible,
  pageCount,
  name,
  onChangeName,
  recentDocs,
  onSaveAsNew,
  onAppend,
  onCancel,
}: CaptureDialogState) {
  const theme = useTheme();

  // Reset the append list's scroll position each time the dialog reopens,
  // so a stale offset from a previous scan session doesn't carry over.
  const [listKey, setListKey] = useState(0);
  useResetOnOpen(visible, () => setListKey((k) => k + 1));

  const visibleDocs = recentDocs.slice(0, 10);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.dialogCard, CardShadow(theme.shadow), { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">Save {pageCount} page{pageCount === 1 ? '' : 's'}</ThemedText>
          <ThemedText type="small" style={[styles.dialogMessage, { color: theme.textSecondary }]}>
            {recentDocs.length > 0
              ? 'Name this as a new document, or add it to an existing one below.'
              : 'Name this document.'}
          </ThemedText>

          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
            ]}
            value={name}
            onChangeText={onChangeName}
            placeholder="e.g. Groceries Sept 14"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="done"
            onSubmitEditing={onSaveAsNew}
          />
          <AppButton label="Save as new" onPress={onSaveAsNew} disabled={name.trim().length === 0} />

          {recentDocs.length > 0 && (
            <>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                Or add to an existing document
              </ThemedText>
              <ScrollView key={listKey} style={styles.appendList} keyboardShouldPersistTaps="handled">
                {visibleDocs.map((doc, index) => (
                  <Pressable
                    key={doc.id}
                    onPress={() => onAppend(doc)}
                    style={({ pressed }) => [
                      styles.appendRow,
                      index < visibleDocs.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                      pressed && { backgroundColor: theme.backgroundElement },
                    ]}>
                    <ThemedText numberOfLines={1} style={styles.appendTitle}>
                      {doc.title}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          <AppButton label="Cancel" variant="outline" onPress={onCancel} />
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
  dialogCard: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    gap: Spacing.three,
  },
  dialogMessage: {
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  appendList: {
    maxHeight: 220,
  },
  appendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  appendTitle: {
    flexShrink: 1,
  },
});
