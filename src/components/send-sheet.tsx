/**
 * The post-export send sheet: after a PDF is written, offer one-tap
 * sends to saved recipients (email or text channel per record), the raw
 * OS share sheet, and a "save a recipient" path that records who it went
 * to — including merging a new channel value into an existing record
 * (email Jeff today, text him later → one record with both fields).
 *
 * Rendered by the export screens over their own UI; owns no data beyond
 * the recipient list it loads when opened.
 */
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import { fetchRecipients, type RecipientRow } from '@/lib/db/queries';
import {
  RecipientChannel,
  channelsOf,
  mergeRecipient,
  recordRecipientUse,
  sendToRecipient,
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

export function SendSheet({ visible, fileUri, subject, onClose, onShareViaOs }: SendSheetProps) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [recipients, setRecipients] = useState<RecipientRow[] | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>({ kind: 'idle' });
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newChannel, setNewChannel] = useState<RecipientChannel>(RecipientChannel.Email);

  useResetOnOpen(visible, () => {
    setSaveMode({ kind: 'idle' });
    setNewLabel('');
    setNewValue('');
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
    })();
    return () => {
      cancelled = true;
    };
  }, [db, visible]);

  async function send(recipient: RecipientRow, channel: RecipientChannel) {
    setSaveMode({ kind: 'idle' });
    const outcome = await sendToRecipient(recipient, channel, { fileUri, subject });
    if (outcome.status === 'sent') {
      await recordRecipientUse(db, recipient.id);
    }
    if (outcome.status === 'unavailable') {
      // Keep the sheet open and surface the gap — the user can pick the
      // other channel or save the missing value onto the record.
      setSaveMode({ kind: 'picking-channel', label: recipient.label, value: '', channel });
      return;
    }
    onClose();
  }

  async function saveNewAndSend() {
    const label = newLabel.trim();
    const value = newValue.trim();
    if (label.length === 0 || value.length === 0) {
      return;
    }
    const recipient = await mergeRecipient(db, label, value, newChannel);
    await recordRecipientUse(db, recipient.id);
    setSaveMode({ kind: 'idle' });
    await send(recipient, newChannel);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, CardShadow(theme.shadow), { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">Send to</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Exported PDF: {subject}
          </ThemedText>

          {saveMode.kind === 'picking-channel' ? (
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
                    })();
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              {recipients == null ? (
                <ActivityIndicator style={styles.listSpinner} />
              ) : recipients.length === 0 ? (
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  No saved recipients yet — send once and save them here, or use the share sheet below.
                </ThemedText>
              ) : (
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                  {recipients.map((recipient) => (
                    <View key={recipient.id} style={styles.recipientRow}>
                      <View style={styles.recipientText}>
                        <ThemedText type="defaultSemiBold" numberOfLines={1}>
                          {recipient.label}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                          {[recipient.email, recipient.phone].filter((p) => p != null && p !== '').join(' · ')}
                        </ThemedText>
                      </View>
                      {channelsOf(recipient).map((channel) => (
                        <Pressable
                          key={channel}
                          onPress={() => void send(recipient, channel)}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel={`${channel === RecipientChannel.Email ? 'Email' : 'Text'} ${recipient.label}`}
                          style={[styles.channelButton, { backgroundColor: theme.backgroundSelected }]}>
                          <SymbolView
                            name={
                              channel === RecipientChannel.Email
                                ? { ios: 'envelope', android: 'email' }
                                : { ios: 'message', android: 'sms' }
                            }
                            size={18}
                            tintColor={theme.text}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={styles.saveForm}>
                <ThemedText type="defaultSemiBold">Save someone new</ThemedText>
                <View style={styles.channelToggle}>
                  <Pressable
                    onPress={() => setNewChannel(RecipientChannel.Email)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: newChannel === RecipientChannel.Email }}
                    style={[
                      styles.channelChip,
                      newChannel === RecipientChannel.Email && { backgroundColor: theme.text },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: newChannel === RecipientChannel.Email ? theme.background : theme.textSecondary }}>
                      Email
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => setNewChannel(RecipientChannel.Text)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: newChannel === RecipientChannel.Text }}
                    style={[
                      styles.channelChip,
                      newChannel === RecipientChannel.Text && { backgroundColor: theme.text },
                    ]}>
                    <ThemedText
                      type="small"
                      style={{ color: newChannel === RecipientChannel.Text ? theme.background : theme.textSecondary }}>
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
                  placeholder={newChannel === RecipientChannel.Email ? 'name@example.com' : '555-0100'}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={newChannel === RecipientChannel.Email ? 'email-address' : 'phone-pad'}
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                  returnKeyType="done"
                />
                <View style={styles.actionsRow}>
                  <AppButton
                    label="OS share sheet"
                    variant="outline"
                    onPress={onShareViaOs}
                    style={styles.grow}
                  />
                  <AppButton
                    label="Save & send"
                    disabled={newLabel.trim().length === 0 || newValue.trim().length === 0}
                    onPress={() => void saveNewAndSend()}
                    style={styles.grow}
                  />
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  list: {
    flexGrow: 0,
    maxHeight: 220,
  },
  listSpinner: {
    marginVertical: Spacing.three,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  recipientText: {
    flex: 1,
    gap: 2,
  },
  channelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
