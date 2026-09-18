/**
 * Shared recipient dropdown + picker sheet (Phase 7).
 *
 * `RecipientDropdown` is the compact field — current choice + chevron —
 * that replaces an ever-growing row list: one row whether there are two
 * recipients or two hundred.
 *
 * `RecipientPickerSheet` is the centered dialog the dropdown opens: a
 * search box (essential past a handful of recipients) over a scrollable
 * list. A row tap picks the recipient (`onPick`) — what the picker means
 * is the caller's business: the manage page selects for edit/merge/delete,
 * the send sheet populates its form. In send mode (`onPickAddress`) each
 * row also carries tappable chips, one per saved address — either email
 * slot or the phone — so the picked channel + value is the one meant, not
 * a primary-first guess.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DialogBackdrop } from '@/components/dialog-backdrop';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import type { RecipientRow } from '@/lib/db/queries';
import { channelSummary, RecipientChannel } from '@/lib/recipient-merge';

/** Props for {@link RecipientDropdown}. */
export interface RecipientDropdownProps {
  recipients: RecipientRow[];
  /** The currently chosen recipient, null when none. */
  selected: RecipientRow | null;
  /** Opens the picker sheet. */
  onOpen: () => void;
  /** Field title when nothing is selected. */
  titlePlaceholder?: string;
  /** Field subtitle prefix when nothing is selected — the recipient
   * count is appended by the component. */
  subtitlePlaceholder?: string;
}

/**
 * The compact "dropdown" field: current choice (label + email · phone)
 * with a chevron — one 52px-min row replacing a potentially huge radio
 * list. Tapping opens the searchable picker dialog.
 */
export function RecipientDropdown({
  recipients,
  selected,
  onOpen,
  titlePlaceholder = 'Choose a recipient…',
  subtitlePlaceholder = 'saved — tap to pick one',
}: RecipientDropdownProps) {
  const theme = useTheme();
  const count = recipients.length;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Choose a recipient"
      style={({ pressed }) => [styles.dropdownField, pressed && styles.pressed]}>
      <View style={styles.dropdownText}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {selected == null ? titlePlaceholder : selected.label}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
          {selected == null
            ? `${count} ${subtitlePlaceholder}`
            : channelSummary(selected) === ''
              ? 'No email or phone yet'
              : channelSummary(selected)}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.down', android: 'expand_more' }}
        size={22}
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

/** Props for {@link RecipientPickerSheet}. */
export interface RecipientPickerSheetProps {
  visible: boolean;
  recipients: RecipientRow[];
  /** The id of the currently selected recipient, if any (checkmark). */
  selectedId?: string | null;
  /** Merge-pick mode (Settings): the id of the record being folded in;
   * the next different row tapped is the survivor. */
  mergePickId?: string | null;
  /** A row was tapped — what the pick means is the caller's business. */
  onPick?: (recipient: RecipientRow) => void;
  /**
   * Send mode: render an address chip per saved value and report the
   * exact channel + value tapped (either email slot, or the phone).
   * Omitted on the manage page — plain row-tap semantics.
   */
  onPickAddress?: (address: RecipientAddress) => void;
  /** Dismiss the sheet (any reason). */
  onClose: () => void;
  /**
   * Visually stack below the calling dialog (the send sheet opens this
   * from its centered form — the picker reads as the next step just
   * beneath it) rather than sitting dead-center as a standalone dialog.
   */
  inline?: boolean;
}

/**
 * The dropdown's picker dialog: search over a scrollable list of
 * label + "email · email2 · phone" rows. Rows show a checkmark on the
 * current selection and a "(merging…)" tag on the merge-pick origin.
 * With `onPickAddress`, rows swap the summary text for tappable chips —
 * one per saved address. Centered like every other dialog in the app;
 * `inline` nudges it below the caller instead of dead-center.
 */
export function RecipientPickerSheet({
  visible,
  recipients,
  selectedId = null,
  mergePickId = null,
  onPick,
  onPickAddress,
  onClose,
  inline = false,
}: RecipientPickerSheetProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  useResetOnOpen(visible, () => setQuery(''));

  // Fold-filter: keep rows whose label or channel values contain the
  // term — names, emails, and phone digits are the search keys.
  const needle = query.trim().toLowerCase();
  const filtered = recipients.filter((recipient) => {
    if (needle === '') {
      return true;
    }
    return (
      recipient.label.toLowerCase().includes(needle) ||
      (recipient.email ?? '').toLowerCase().includes(needle) ||
      (recipient.email2 ?? '').toLowerCase().includes(needle) ||
      (recipient.phone ?? '').includes(needle)
    );
  });

  return (
    <DialogBackdrop visible={visible} onDismiss={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.pickerSheet,
            CardShadow(theme.shadow),
            // Visually stacked below the calling dialog, not dead-center.
            inline && styles.pickerInline,
            { backgroundColor: theme.background },
          ]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">
            {mergePickId != null ? 'Merge into…' : 'Choose a recipient'}
          </ThemedText>
          {mergePickId != null && (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {`Tap the recipient that "${lookupLabel(recipients, mergePickId)}" should fold into.`}
            </ThemedText>
          )}
          <TextInput
            style={[styles.searchInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, email, or phone"
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="search"
          />
          <FlatList
            data={filtered}
            keyExtractor={(recipient) => recipient.id}
            renderItem={({ item }) => {
              const addresses = onPickAddress == null ? [] : addressesOf(item);
              return (
                <Pressable
                  onPress={() => onPick?.(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === selectedId }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
                  <View style={styles.pickerRowText}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1}>
                      {item.label}
                      {item.id === mergePickId && '  (merging…)'}
                    </ThemedText>
                    {addresses.length > 0 ? (
                      <View style={styles.addressRow}>
                        {addresses.map((address) => (
                          <Pressable
                            key={`${address.channel}:${address.value}`}
                            onPress={() => onPickAddress?.(address)}
                            accessibilityRole="button"
                            accessibilityLabel={`${address.channel === RecipientChannel.Email ? 'Email' : 'Text'} ${address.value}`}
                            style={({ pressed }) => [
                              styles.addressChip,
                              pressed && styles.pressed,
                              { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                            ]}>
                            <SymbolView
                              name={
                                address.channel === RecipientChannel.Email
                                  ? { ios: 'envelope', android: 'mail' }
                                  : { ios: 'message', android: 'textsms' }
                              }
                              size={14}
                              tintColor={theme.textSecondary}
                            />
                            <ThemedText type="small" numberOfLines={1} style={styles.addressChipText}>
                              {address.value}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                        {channelSummary(item) === '' ? 'No email or phone yet' : channelSummary(item)}
                      </ThemedText>
                    )}
                  </View>
                  {item.id === selectedId && (
                    <SymbolView
                      name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                      size={22}
                      tintColor={theme.accent}
                    />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                No recipients match “{query.trim()}”.
              </ThemedText>
            }
            style={styles.pickerList}
            keyboardShouldPersistTaps="handled"
          />
        </Pressable>
      </Pressable>
    </DialogBackdrop>
  );
}

/** One pickable address on a recipient — the channel and the exact
 * value to send to (either email slot, or the phone number). */
export interface RecipientAddress {
  /** The record the address belongs to — the form seeds its label. */
  recipient: RecipientRow;
  /** How the value is sent — email or text. */
  channel: RecipientChannel;
  /** The address itself. */
  value: string;
}

/** The addresses a record can be reached on — primary email, second
 * email, then phone; empty slots are skipped. */
function addressesOf(recipient: RecipientRow): RecipientAddress[] {
  const addresses: RecipientAddress[] = [];
  if (recipient.email != null && recipient.email !== '') {
    addresses.push({ recipient, channel: RecipientChannel.Email, value: recipient.email });
  }
  if (recipient.email2 != null && recipient.email2 !== '') {
    addresses.push({ recipient, channel: RecipientChannel.Email, value: recipient.email2 });
  }
  if (recipient.phone != null && recipient.phone !== '') {
    addresses.push({ recipient, channel: RecipientChannel.Text, value: recipient.phone });
  }
  return addresses;
}

/** Label lookup against the sheet's own list. */
function lookupLabel(recipients: RecipientRow[], id: string): string {
  const found = recipients.find((r) => r.id === id);
  return found == null ? '' : found.label;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dropdownField: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dropdownText: {
    flex: 1,
    gap: 2,
  },
  pickerSheet: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
    maxHeight: '70%',
  },
  // Opened from the send sheet: nudge down so the card sits just below
  // where the send form was centered, reading as its "step 2".
  pickerInline: {
    transform: [{ translateY: 60 }],
  },
  pickerRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  pickerRowText: {
    flex: 1,
    gap: 2,
  },
  addressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    maxWidth: '100%',
  },
  addressChipText: {
    flexShrink: 1,
  },
  pickerList: {
    flexGrow: 0,
    // Shrinks when the sheet is height-clamped (keyboard up on a short
    // phone) instead of pushing rows behind the keyboard — the search
    // box above it stays put.
    flexShrink: 1,
    maxHeight: 320,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.6,
  },
});
