/**
 * Recipients screen (Phase 7): the full manage view for saved send
 * targets — list (via the shared dropdown + searchable picker), edit
 * (the field dialog), merge duplicates, delete. Reached from Home's
 * "View recipients" tile; the send flow stays in the send sheet.
 *
 * Everything here used to live inline in Settings' Sharing card; this
 * screen inherits the identical state machine and handlers.
 */
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { DialogBackdrop } from '@/components/dialog-backdrop';
import { RecipientDropdown, RecipientPickerSheet } from '@/components/recipient-picker';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import { generateId } from '@/lib/db/persist-scan';
import {
    deleteRecipient,
    fetchRecipients,
    saveRecipient,
    type RecipientRow,
} from '@/lib/db/queries';
import { logThrown } from '@/lib/debug-log';
import {
    applyMergeTwo,
    mergeTwoRecords,
    type MergeTwoResult,
} from '@/lib/recipient-merge';

/** Which recipient dialog is open over the screen. */
type RecipientDialog =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; recipient: RecipientRow }
  /** Merge-pick: `foldId` is the record to fold into another; the next
   * different row picked in the picker is the survivor. */
  | { kind: 'merge-pick'; foldId: string };

export default function RecipientsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  // The id chosen from the dropdown — the action row acts on it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<RecipientDialog>({ kind: 'closed' });

  useFocusEffect(
    useCallback(() => {
      fetchRecipients(db)
        .then(setRecipients)
        .catch((e: unknown) => logThrown('recipients-load', e));
    }, [db]),
  );

  /** The selected recipient, or null when nothing is picked (or the id
   * went stale after a delete). */
  const selectedRecipient: RecipientRow | null =
    recipients.find((r) => r.id === selectedId) ?? null;
  const editing = dialog.kind === 'edit' ? dialog.recipient : null;
  const mergePickTargetId: string | null =
    dialog.kind === 'merge-pick' ? dialog.foldId : null;

  /** Persist the add-or-edit form. */
  async function saveRecipientForm(label: string, email: string, email2: string, phone: string) {
    const editingSnapshot = editing;
    setDialog({ kind: 'closed' });
    const recipient: RecipientRow =
      editingSnapshot == null
        ? {
            id: generateId(),
            label: label.trim(),
            email: email.trim().length > 0 ? email.trim() : null,
            email2: email2.trim().length > 0 ? email2.trim() : null,
            phone: phone.trim().length > 0 ? phone.trim() : null,
            lastUsedAt: 0,
          }
        : {
            ...editingSnapshot,
            label: label.trim(),
            email: email.trim().length > 0 ? email.trim() : null,
            email2: email2.trim().length > 0 ? email2.trim() : null,
            phone: phone.trim().length > 0 ? phone.trim() : null,
          };
    if (recipient.label.length === 0) {
      return;
    }
    try {
      await saveRecipient(db, recipient);
    } catch (e: unknown) {
      logThrown('save-recipient', e);
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
      return;
    }
    setRecipients(await fetchRecipients(db));
  }

  /** Commit the pairwise merge and reload. */
  async function commitMerge(result: MergeTwoResult) {
    setDialog({ kind: 'closed' });
    setSelectedId(null);
    try {
      await applyMergeTwo(db, result);
    } catch (e: unknown) {
      logThrown('merge-recipients', e);
      Alert.alert('Merge failed', e instanceof Error ? e.message : String(e));
    }
    setRecipients(await fetchRecipients(db));
  }

  /** Confirm then commit a pairwise merge, listing kept/dropped labels
   * and any field conflicts. */
  function confirmMerge(result: MergeTwoResult) {
    const lines = [
      `Keep "${result.merged.label}" and fold in "${lookupLabel(result.droppedId)}"?`,
    ];
    for (const conflict of result.conflicts) {
      lines.push(
        `Both have a${conflict.field === 'email' ? 'n email' : ' phone'} — "${conflict.kept}" is kept; "${conflict.dropped}" is discarded.`,
      );
    }
    Alert.alert('Merge recipients', lines.join('\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Merge', onPress: () => void commitMerge(result) },
    ]);
  }

  function lookupLabel(id: string): string {
    const found = recipients.find((r) => r.id === id);
    return found == null ? '' : found.label;
  }

  function onDeleteRecipient(recipient: RecipientRow) {
    Alert.alert('Remove recipient', `Remove "${recipient.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipient(db, recipient.id);
          setSelectedId(null);
          setRecipients(await fetchRecipients(db));
        },
      },
    ]);
  }

  function onPickerSelect(recipient: RecipientRow) {
    if (dialog.kind !== 'merge-pick') {
      setSelectedId(recipient.id);
      setPickerOpen(false);
      return;
    }
    if (recipient.id === dialog.foldId) {
      return; // folded into itself — pick a different row
    }
    const folding = recipients.find((r) => r.id === dialog.foldId);
    if (folding == null) {
      setDialog({ kind: 'closed' });
      setPickerOpen(false);
      return;
    }
    setPickerOpen(false);
    confirmMerge(mergeTwoRecords(recipient, folding));
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Recipients" />
        <ScrollView contentContainerStyle={styles.content}>
          <AppCard style={styles.card}>
            <ThemedText type="label" style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Sharing
            </ThemedText>

            {recipients.length === 0 ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                No saved recipients yet — send a PDF once and save them in the send sheet, or add one now.
              </ThemedText>
            ) : (
              <View style={styles.listArea}>
                <RecipientDropdown
                  recipients={recipients}
                  selected={selectedRecipient}
                  onOpen={() => setPickerOpen(true)}
                />
                <View style={styles.recipientActions}>
                  <AppButton
                    label="Edit"
                    variant="outline"
                    disabled={selectedRecipient == null}
                    onPress={() => selectedRecipient != null && setDialog({ kind: 'edit', recipient: selectedRecipient })}
                  />
                  <AppButton
                    label="Merge"
                    variant="outline"
                    disabled={selectedRecipient == null || recipients.length < 2}
                    onPress={() => {
                      if (selectedRecipient == null) {
                        return;
                      }
                      setDialog({ kind: 'merge-pick', foldId: selectedRecipient.id });
                      setPickerOpen(true);
                    }}
                  />
                  <AppButton
                    label="Delete"
                    variant="danger"
                    disabled={selectedRecipient == null}
                    onPress={() => selectedRecipient != null && onDeleteRecipient(selectedRecipient)}
                  />
                </View>
                <AppButton
                  label="Add recipient"
                  variant="outline"
                  onPress={() => setDialog({ kind: 'add' })}
                  style={styles.grow}
                />
              </View>
            )}
          </AppCard>
        </ScrollView>
      </SafeAreaView>

      <RecipientPickerSheet
        visible={pickerOpen}
        recipients={recipients}
        selectedId={selectedId}
        mergePickId={mergePickTargetId}
        onPick={onPickerSelect}
        onClose={() => {
          setPickerOpen(false);
          setDialog((state) => (state.kind === 'merge-pick' ? { kind: 'closed' } : state));
        }}
      />

      <RecipientFormDialog
        visible={dialog.kind === 'add' || dialog.kind === 'edit'}
        editing={editing}
        onSave={(label, email, email2, phone) => void saveRecipientForm(label, email, email2, phone)}
        onCancel={() => setDialog({ kind: 'closed' })}
      />
    </ThemedView>
  );
}

/** Props for {@link RecipientFormDialog}. */
interface RecipientFormDialogProps {
  visible: boolean;
  /** The row being edited, null when adding. */
  editing: RecipientRow | null;
  onSave: (label: string, email: string, email2: string, phone: string) => void;
  onCancel: () => void;
}

/**
 * Four-field dialog for add *and* edit: a label (required) plus an
 * optional email / second email / phone — one record per person, so all
 * channels live on the same row. Edit mode reseeds from the row; pass
 * `editing={null}` for add.
 */
function RecipientFormDialog({ visible, editing, onSave, onCancel }: RecipientFormDialogProps) {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [email2, setEmail2] = useState('');
  const [phone, setPhone] = useState('');

  useResetOnOpen(visible, () => {
    setLabel(editing?.label ?? '');
    setEmail(editing?.email ?? '');
    setEmail2(editing?.email2 ?? '');
    setPhone(editing?.phone ?? '');
  });

  return (
    <DialogBackdrop visible={visible} onDismiss={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.dialogCard, CardShadow(theme.shadow), { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          {/* Four stacked inputs outrun a short screen once the keyboard
              takes its share (the shared backdrop pads for it); the card
              clamps at 85% and scrolls so Save never falls off. */}
          <ScrollView
            contentContainerStyle={styles.dialogFields}
            keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">{editing == null ? 'Add recipient' : `Edit ${editing.label}`}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            A person you send PDFs to. Fill any channel — you can pick which to use when sending.
          </ThemedText>
          <TextInput
            style={[styles.dialogInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            value={label}
            onChangeText={setLabel}
            placeholder="Label (e.g. Accountant)"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.dialogInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            value={email}
            onChangeText={setEmail}
            placeholder="Email (optional)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.dialogInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            value={email2}
            onChangeText={setEmail2}
            placeholder="Second email, e.g. work (optional)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.dialogInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone, for texts (optional)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="done"
          />
          <View style={styles.dialogActions}>
            <AppButton label="Cancel" variant="outline" onPress={onCancel} />
            <AppButton
              label="Save"
              disabled={label.trim().length === 0}
              onPress={() => onSave(label, email, email2, phone)}
            />
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </DialogBackdrop>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  card: {
    padding: Spacing.three,
  },
  cardLabel: {
    marginBottom: Spacing.one,
  },
  listArea: {
    gap: Spacing.two,
  },
  recipientActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  grow: {
    flex: 1,
  },
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
  // Vertical rhythm for the form's children — on the ScrollView's
  // content container, since the scroller replaced the card as their
  // direct parent.
  dialogFields: {
    gap: Spacing.three,
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
