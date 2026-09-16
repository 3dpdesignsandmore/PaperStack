/**
 * Pure recipient-merge logic — no React, no native imports, so it runs
 * under Vitest (see recipients.test.ts). The send mechanics (mail
 * composer, sms links) live in `recipients.ts`; this module is only the
 * one-record-per-person bookkeeping:
 *
 *   email Jeff today → record {label: Jeff, email}
 *   text  Jeff later → same record, phone filled in
 *
 * Never creates a second record for a person who already has one unless
 * the match is genuinely ambiguous (same label, occupied field → a
 * different person sharing the name).
 *
 * `generateId` is injected rather than imported so the module stays
 * free of `persist-scan`'s (native-adjacent) import graph — see the
 * test, which runs without Metro.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { fetchRecipients, saveRecipient, type RecipientRow } from '@/lib/db/queries';

/** A channel a recipient can be reached on. */
export const RecipientChannel = {
  Email: 'email',
  Text: 'text',
} as const;
export type RecipientChannel = (typeof RecipientChannel)[keyof typeof RecipientChannel];

/** Which channels a record has values for, for UI display. */
export function channelsOf(recipient: RecipientRow): RecipientChannel[] {
  const channels: RecipientChannel[] = [];
  if (recipient.email != null && recipient.email !== '') {
    channels.push(RecipientChannel.Email);
  }
  if (recipient.phone != null && recipient.phone !== '') {
    channels.push(RecipientChannel.Text);
  }
  return channels;
}

/** How a new record's id is produced — injected for purity. */
export type GenerateRecipientId = () => string;

/**
 * Merge-save a channel value onto the recipient set, per the
 * one-record-per-person rule:
 * 1. exact match by email or phone → that record, unchanged;
 * 2. same-label record with this channel empty → fill the empty field;
 * 3. nothing matches → new record with just this channel.
 *
 * Returns the record the value now belongs to.
 */
export async function upsertRecipientByChannel(
  db: SQLiteDatabase,
  label: string,
  channelValue: string,
  channel: RecipientChannel,
  generateId: GenerateRecipientId,
): Promise<RecipientRow> {
  const trimmedLabel = label.trim();
  const trimmedValue = channelValue.trim();
  if (trimmedLabel.length === 0 || trimmedValue.length === 0) {
    throw new Error('Label and channel value are both required');
  }

  const all = await fetchRecipients(db);
  const emailEquivalent = channel === RecipientChannel.Email ? trimmedValue : null;
  const phoneEquivalent = channel === RecipientChannel.Text ? trimmedValue : null;

  // 1. Exact channel match — same value already on a record.
  const exact = all.find(
    (recipient) =>
      (emailEquivalent != null && recipient.email === emailEquivalent) ||
      (phoneEquivalent != null && recipient.phone === phoneEquivalent),
  );
  if (exact != null) {
    return exact;
  }

  // 2. Same-label record missing this channel — fill into it.
  const byLabel = all.find(
    (recipient) =>
      recipient.label.toLowerCase() === trimmedLabel.toLowerCase() &&
      ((channel === RecipientChannel.Email && (recipient.email == null || recipient.email === '')) ||
        (channel === RecipientChannel.Text && (recipient.phone == null || recipient.phone === ''))),
  );
  if (byLabel != null) {
    const updated: RecipientRow = {
      ...byLabel,
      email: channel === RecipientChannel.Email ? trimmedValue : byLabel.email,
      phone: channel === RecipientChannel.Text ? trimmedValue : byLabel.phone,
    };
    await saveRecipient(db, updated);
    return updated;
  }

  // 3. New record.
  const created: RecipientRow = {
    id: generateId(),
    label: trimmedLabel,
    email: channel === RecipientChannel.Email ? trimmedValue : null,
    phone: channel === RecipientChannel.Text ? trimmedValue : null,
    lastUsedAt: 0,
  };
  await saveRecipient(db, created);
  return created;
}
