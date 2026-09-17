/**
 * The post-export send sheet: after a PDF is written, offer one-tap
 * sends to saved recipients (email or text channel per record), the raw
 * OS share sheet, and a "save a recipient" path that records who it went
 * to — including merging a new channel value into an existing record
 * (email Jeff today, text him later → one record with both fields).
 *
 * Recipients are picked from the shared dropdown (`recipient-picker.tsx`)
 * — the same searchable sheet Settings uses — rather than a row list,
 * so a hundred saved recipients stay one compact field.
 *
 * Rendered by the export screens over their own UI; owns no data beyond
 * the recipient list it loads when opened.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { RecipientDropdown, RecipientPickerSheet, type RecipientAddress } from '@/components/recipient-picker';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import { fetchRecipients, saveRecipient, type RecipientRow } from '@/lib/db/queries';
import { logThrown } from '@/lib/debug-log';
import {
    RecipientChannel,
    channelsOf,
    mergeRecipient,
    recordRecipientUse,
    sendToRecipient,
    type SendOutcome,
} from '@/lib/recipients';

/** Props for {@link SendSheet}. */
export interface SendSheetProps {
  visible: boolean;
  /** The exported file to send. */
  fileUri: string;
  /** Email subject line. */
  subject: string;
  /** Called when the sheet is dismissed (any reason). */
  onClose: () => void;
  /** Slot for the "share via OS sheet instead" action. */
  onShareViaOs: () => void;
}

/** What the user is doing in the save-new flow. */
type SaveMode =
  | { kind: 'idle' }
  | { kind: 'picking-channel'; label: string; value: string; channel: RecipientChannel };

/** The recipient chosen from the picker, if any — their values seed the
 * send form's fields. */
export function SendSheet({ visible, fileUri, subject, onClose, onShareViaOs }: SendSheetProps) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [recipients, setRecipients] = useState<RecipientRow[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>({ kind: 'idle' });
  /** The recipient chosen from the picker, if any — seeds the form. */
  const [picked, setPicked] = useState<RecipientRow | null>(null);
  const [channel, setChannel] = useState<RecipientChannel>(RecipientChannel.Email);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  /** Set once the OS app took over (or the composer was cancelled out).
   * null = still composing. See {@link HandoffState}. */
  const [handoff, setHandoff] = useState<HandoffState | null>(null);

  useResetOnOpen(visible, () => {
    setSaveMode({ kind: 'idle' });
    setHandoff(null);
    setNewLabel('');
    setNewValue('');
    setPicked(null);
    setChannel(RecipientChannel.Email);
  });

  // Reload the recipient list each time the sheet opens — records may
  // have changed since (a send from another screen, edits in Settings).
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await fetchRecipients(db);
      if (!cancelled) {
        setRecipients(rows);
      }
    })().catch((e: unknown) =>
      logThrown('send-sheet-load', e),
    );
    return () => {
      cancelled = true;
    };
  }, [db, visible]);

  async function send(recipient: RecipientRow, channel: RecipientChannel, emailSlot?: 1 | 2) {
    setSaveMode({ kind: 'idle' });
    let outcome: SendOutcome;
    try {
      outcome = await sendToRecipient(recipient, channel, { fileUri, subject, emailSlot });
    } catch (e: unknown) {
      // The send path surprised us (native interop, OS quirk) — catch it
      // here rather than let it surface as an unhandled rejection.
      logThrown('send-recipient', e);
      Alert.alert('Send failed', e instanceof Error ? e.message : String(e));
      return;
    }
    if (outcome.status === 'sent') {
      await recordRecipientUse(db, recipient.id);
    }
    if (outcome.status === 'unavailable') {
      if (channelsOf(recipient).includes(channel)) {
        // The record already has this channel's address — the gap is
        // device-side (build predates email sending, no mail account,
        // no messaging app). Say so rather than ask for a value that
        // already exists.
        Alert.alert('Send unavailable', outcome.reason);
        return;
      }
      // Keep the sheet open and surface the gap — the user can pick the
      // other channel or save the missing value onto the record.
      setSaveMode({ kind: 'picking-channel', label: recipient.label, value: '', channel });
      return;
    }
    // Sent or cancelled-by-user: the OS app took over either way (the
    // composer was opened, or the messaging app came forward). Show the
    // handoff state instead of closing — the user gets an explicit
    // signal that the handoff happened, and a cancelled compose is
    // honestly labelled so they can retry rather than wonder.
    setHandoff({ channel, cancelled: outcome.status === 'cancelled' });
  }

  /** A recipient was picked from the picker: close it and populate the
   * form with their saved values — the user then picks the channel and
   * reviews/edits the address before tapping Send. */
  function onPickRecipient(recipient: RecipientRow) {
    setPickerOpen(false);
    setPicked(recipient);
    setNewLabel(recipient.label);
    setChannel(
      recipient.email != null && recipient.email !== ''
        ? RecipientChannel.Email
        : RecipientChannel.Text,
    );
    setNewValue(
      recipient.email != null && recipient.email !== ''
        ? recipient.email
        : recipient.phone ?? '',
    );
  }

  /** An address chip was tapped in the picker: seed the form with that
   * exact channel + value (the second email, or the phone) rather than
   * the primary-first default a name tap gives. */
  function onPickAddress(address: RecipientAddress) {
    setPickerOpen(false);
    setPicked(address.recipient);
    setNewLabel(address.recipient.label);
    setChannel(address.channel);
    setNewValue(address.value);
  }

  /** Send to whatever the form holds: a picked recipient (address may
   * have been edited in the field) or a new person. The merge-save
   * dedupes either way; for two-email recipients whose form value
   * matches the second email, that slot is used. */
  async function sendPicked() {
    const label = newLabel.trim();
    const value = newValue.trim();
    if (label.length === 0 || value.length === 0) {
      return;
    }
    try {
      const recipient =
        picked != null && picked.label === label
          ? await updatedPicked(label, value)
          : await mergeRecipient(db, label, value, channel);
      await recordRecipientUse(db, recipient.id);
      const slot: 1 | 2 | undefined =
        channel !== RecipientChannel.Email
          ? undefined
          : value === (recipient.email2 ?? '').trim() && value !== (recipient.email ?? '').trim()
            ? 2
            : 1;
      setSaveMode({ kind: 'idle' });
      await send(recipient, channel, slot);
    } catch (e: unknown) {
      logThrown('send-sheet-save', e);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Send failed', message);
    }
  }

  /** Persist an edited value for the picked record (the user changed the
   * address in the form but kept the person) — keeps the same record
   * rather than minting a same-label duplicate. */
  async function updatedPicked(label: string, value: string): Promise<RecipientRow> {
    if (picked == null) {
      throw new Error('No recipient picked');
    }
    const updated: RecipientRow =
      channel === RecipientChannel.Email
        ? {
            ...picked,
            label,
            email: picked.email == null || picked.email === '' ? value : picked.email,
            email2:
              picked.email != null &&
              picked.email !== '' &&
              (picked.email2 == null || picked.email2 === '') &&
              value !== picked.email
                ? value
                : picked.email2,
          }
        : {
            ...picked,
            label,
            phone: picked.phone == null || picked.phone === '' ? value : picked.phone,
          };
    await saveRecipient(db, updated);
    return updated;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            CardShadow(theme.shadow),
            { backgroundColor: theme.background },
          ]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">Send to</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            PDF ready: {subject}
          </ThemedText>

          {handoff != null ? (
            <View style={styles.saveForm}>
              <SymbolView
                name={
                  handoff.cancelled
                    ? { ios: 'xmark.circle', android: 'cancel' }
                    : { ios: 'checkmark.circle.fill', android: 'check_circle' }
                }
                size={40}
                tintColor={handoff.cancelled ? theme.warning : theme.success}
              />
              <ThemedText type="defaultSemiBold">
                {handoff.cancelled
                  ? 'Composer was closed without sending'
                  : handoff.channel === RecipientChannel.Email
                    ? 'Opened in your email app'
                    : 'Opened in your messaging app'}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {handoff.cancelled
                  ? 'Nothing was sent. Send again to retry, or Done to close.'
                  : handoff.channel === RecipientChannel.Email
                    ? 'Your email app has the message with the PDF attached — press send there to finish.'
                    : 'Your messaging app has the number filled in — the file sends from the OS share sheet if you need it.'}
              </ThemedText>
              <View style={styles.actionsRow}>
                {handoff.cancelled && (
                  <AppButton
                    label="Send again"
                    variant="outline"
                    onPress={() => setHandoff(null)}
                    style={styles.grow}
                  />
                )}
                <AppButton
                  label="Done"
                  onPress={onClose}
                  style={handoff.cancelled ? styles.grow : undefined}
                />
              </View>
            </View>
          ) : saveMode.kind === 'picking-channel' ? (
            <View style={styles.saveForm}>
              <ThemedText type="defaultSemiBold">
                {saveMode.channel === RecipientChannel.Email ? 'Add an email' : 'Add a phone number'}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {`Sending to "${saveMode.label}" by ${saveMode.channel === RecipientChannel.Email ? 'email' : 'text'} needs an address. Enter one to save onto the record.`}
              </ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                value={saveMode.value}
                onChangeText={setNewValue}
                placeholder={saveMode.channel === RecipientChannel.Email ? 'name@example.com' : '555-0100'}
                placeholderTextColor={theme.textSecondary}
                keyboardType={saveMode.channel === RecipientChannel.Email ? 'email-address' : 'phone-pad'}
                autoFocus
                autoCorrect={false}
                underlineColorAndroid="transparent"
                returnKeyType="done"
              />
              <View style={styles.actionsRow}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setSaveMode({ kind: 'idle' })}
                />
                <AppButton
                  label="Save & send"
                  disabled={newValue.trim().length === 0}
                  onPress={() => {
                    void (async () => {
                      const recipient = await mergeRecipient(
                        db,
                        saveMode.label,
                        newValue.trim(),
                        saveMode.channel,
                      );
                      await recordRecipientUse(db, recipient.id);
                      setSaveMode({ kind: 'idle' });
                      await send(recipient, saveMode.channel);
                    })().catch((e: unknown) => {
                      logThrown('send-sheet-save', e);
                      const message = e instanceof Error ? e.message : String(e);
                      Alert.alert('Send failed', message);
                    });
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              {recipients == null ? (
                <ActivityIndicator style={styles.listSpinner} />
              ) : (
                <View style={styles.pickerOpenRow}>
                  <RecipientDropdown
                    recipients={recipients}
                    selected={picked}
                    onOpen={() => setPickerOpen(true)}
                    titlePlaceholder="Pick someone to send to…"
                    subtitlePlaceholder="saved recipients — tap to fill the form"
                  />
                </View>
              )}

              <View style={styles.saveForm}>
                <View style={styles.channelToggle}>
                  <Pressable
                    onPress={() => {
                      setChannel(RecipientChannel.Email);
                      if (picked != null && (picked.email != null && picked.email !== '')) {
                        setNewValue(picked.email ?? '');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: channel === RecipientChannel.Email }}
                    style={[
                      styles.channelChip,
                      channel === RecipientChannel.Email && { backgroundColor: theme.text },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: channel === RecipientChannel.Email ? theme.background : theme.textSecondary }}>
                      Email
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setChannel(RecipientChannel.Text);
                      if (picked != null && (picked.phone != null && picked.phone !== '')) {
                        setNewValue(picked.phone ?? '');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: channel === RecipientChannel.Text }}
                    style={[
                      styles.channelChip,
                      channel === RecipientChannel.Text && { backgroundColor: theme.text },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: channel === RecipientChannel.Text ? theme.background : theme.textSecondary }}>
                      Text
                    </ThemedText>
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="Name (e.g. Jeff)"
                  placeholderTextColor={theme.textSecondary}
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
                  value={newValue}
                  onChangeText={setNewValue}
                  placeholder={channel === RecipientChannel.Email ? 'name@example.com' : '555-0100'}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={channel === RecipientChannel.Email ? 'email-address' : 'phone-pad'}
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  returnKeyType="done"
                />
                <View style={styles.actionsRow}>
                  <AppButton
                    label="Share"
                    variant="outline"
                    onPress={onShareViaOs}
                    style={styles.grow}
                  />
                  <AppButton
                    label="Send"
                    disabled={newLabel.trim().length === 0 || newValue.trim().length === 0}
                    onPress={() => void sendPicked()}
                    style={styles.grow}
                  />
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>

      <RecipientPickerSheet
        visible={pickerOpen}
        recipients={recipients ?? []}
        selectedId={picked?.id ?? null}
        onPick={onPickRecipient}
        onPickAddress={onPickAddress}
        inline
        onClose={() => setPickerOpen(false)}
      />
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
  sheet: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  pickerOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listSpinner: {
    marginVertical: Spacing.three,
  },
  saveForm: {
    gap: Spacing.two,
  },
  channelToggle: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  channelChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
});
