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
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DialogBackdrop } from '@/components/dialog-backdrop';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import type { CaptureDialogState } from '@/hooks/use-capture';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';

export function SaveScanDialog({
  visible,
  pageCount,
  name,
  onChangeName,
  recentDocs,
  saving,
  onSaveAsNew,
  onSaveSeparate,
  canSplitDocuments,
  onAppend,
  onCancel,
}: CaptureDialogState) {
  const theme = useTheme();

  // Reset the append list's scroll position each time the dialog reopens,
  // so a stale offset from a previous scan session doesn't carry over.
  const [scrollKey, setScrollKey] = useState(0);
  useResetOnOpen(visible, () => setScrollKey((k) => k + 1));

  const visibleDocs = recentDocs.slice(0, 10);

  return (
    <DialogBackdrop visible={visible} onDismiss={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.dialogCard, CardShadow(theme.shadow), { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          {/* One ScrollView for the whole card: the card clamps at 85% of
              the space left once the keyboard takes its share (the shared
              backdrop pads for it), and the content scrolls inside rather
              than clipping the bottom buttons. The append rows are plain
              children now, not a nested scroll list — one scrollable per
              axis, no scroller fighting. */}
          <ScrollView
            key={scrollKey}
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled">
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
          <AppButton
            label="Save as one document"
            onPress={onSaveAsNew}
            disabled={saving || name.trim().length === 0}
            loading={saving}
          />
          {canSplitDocuments && (
            <AppButton
              label={`Save as ${pageCount} separate documents`}
              variant="outline"
              onPress={onSaveSeparate}
              disabled={saving || name.trim().length === 0}
            />
          )}

          {recentDocs.length > 0 && (
            <>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                Or add to an existing document
              </ThemedText>
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
            </>
          )}

          <AppButton label="Cancel" variant="outline" onPress={onCancel} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </DialogBackdrop>
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
  },
  // Vertical rhythm for the card's children — on the ScrollView's
  // content container, since the scroller replaced the card as their
  // direct parent.
  cardContent: {
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
