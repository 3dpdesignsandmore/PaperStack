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

import { deleteRecipient, fetchRecipients, saveRecipient, type RecipientRow } from '@/lib/db/queries';

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

  // 1. Exact channel match — same value already on a record (either
  // email slot counts: a work address is still "already saved").
  const exact = all.find(
    (recipient) =>
      (emailEquivalent != null &&
        (recipient.email === emailEquivalent || recipient.email2 === emailEquivalent)) ||
      (phoneEquivalent != null && recipient.phone === phoneEquivalent),
  );
  if (exact != null) {
    return exact;
  }

  // 2. Same-label record missing this channel — fill into it. An email
  // fills the empty *second* slot when the primary is taken: saving
  // "Jeff / jeff@work" when Jeff already has jeff@home is the home+work
  // case, not a new person.
  const byLabel = all.find(
    (recipient) =>
      recipient.label.toLowerCase() === trimmedLabel.toLowerCase() &&
      ((channel === RecipientChannel.Email &&
        (recipient.email == null ||
          recipient.email === '' ||
          recipient.email2 == null ||
          recipient.email2 === '')) ||
        (channel === RecipientChannel.Text && (recipient.phone == null || recipient.phone === ''))),
  );
  if (byLabel != null) {
    const updated: RecipientRow =
      channel === RecipientChannel.Email
        ? {
            ...byLabel,
            email:
              byLabel.email == null || byLabel.email === ''
                ? trimmedValue
                : byLabel.email,
            email2:
              byLabel.email != null && byLabel.email !== '' &&
              (byLabel.email2 == null || byLabel.email2 === '')
                ? trimmedValue
                : byLabel.email2,
          }
        : {
            ...byLabel,
            phone: trimmedValue,
          };
    await saveRecipient(db, updated);
    return updated;
  }

  // 3. New record.
  const created: RecipientRow = {
    id: generateId(),
    label: trimmedLabel,
    email: channel === RecipientChannel.Email ? trimmedValue : null,
    email2: null,
    phone: channel === RecipientChannel.Text ? trimmedValue : null,
    lastUsedAt: 0,
  };
  await saveRecipient(db, created);
  return created;
}

/* ------------------------------------------------------------------ */
/* Explicit record-to-record merge (Settings).                         */
/* ------------------------------------------------------------------ */

/** One edge in a pairwise merge conflict — same field set on both. */
interface MergeConflict {
  /** The field both records set: 'email', 'email2', or 'phone'. */
  field: 'email' | 'email2' | 'phone';
  /** The value that survives; the other is discarded. */
  kept: string;
  /** The value that is discarded. */
  dropped: string;
}

/**
 * The result of a pairwise merge: the `RecipientRow` that replaces the
 * source record (same id), the id of the record to delete, and any
 * conflicts the caller should surface before committing (kept vs
 * dropped values are decided here so callers stay dumb).
 */
export interface MergeTwoResult {
  /** The merged row — same id as `target`, so history keeps pointing
   * at one stable identity. */
  merged: RecipientRow;
  /** The id of the record to delete from the table. */
  droppedId: string;
  /** Fields set on both records: empty when the merge is clean. */
  conflicts: MergeConflict[];
}

/** Non-null, non-empty — a field that counts as "set". */
function isSet(value: string | null): value is string {
  return value != null && value !== '';
}

/** Is phone `phone` numerically equivalent to `other` (digits only)? */
function phonesEquivalent(phone: string, other: string): boolean {
  const digits = (value: string) => value.replace(/\D+/g, '');
  const a = digits(phone);
  const b = digits(other);
  return a.length > 0 && a === b;
}

/**
 * Merge `source` into `target` (same person, accidental duplicate
 * records): the union of both — label/first-used recency kept by
 * `lastUsedAt`, first-set channel value wins a conflict unless the
 * values are equivalent (phone digit-insensitive). Pure: computes the
 * merged row and conflict list, writes nothing.
 */
export function mergeTwoRecords(
  target: RecipientRow,
  source: RecipientRow,
): MergeTwoResult {
  const conflicts: MergeConflict[] = [];

  // Emails: distinct-union into the two slots (order preserved — the
  // target's entries first, the source's appended). More than two
  // distinct addresses can't fit, so a third becomes a listed conflict
  // (dropped) rather than being silently lost.
  const emails: string[] = [target.email, target.email2].filter(isSet);
  for (const candidate of [source.email, source.email2].filter(isSet)) {
    if (!emails.includes(candidate)) {
      if (emails.length < 2) {
        emails.push(candidate);
      } else {
        conflicts.push({ field: 'email2', kept: emails[1], dropped: candidate });
      }
    }
  }

  let phone = target.phone;
  if (!isSet(phone)) {
    phone = source.phone;
  } else if (
    isSet(source.phone) &&
    source.phone !== phone &&
    !phonesEquivalent(phone, source.phone)
  ) {
    conflicts.push({ field: 'phone', kept: phone, dropped: source.phone });
  }

  const merged: RecipientRow = {
    id: target.id,
    label: target.label,
    email: emails[0] ?? null,
    email2: emails[1] ?? null,
    phone,
    lastUsedAt: Math.max(target.lastUsedAt, source.lastUsedAt),
  };
  return { merged, droppedId: source.id, conflicts };
}

/**
 * Commit {@link mergeTwoRecords}'s output atomically: persist
 * `merged` (which has `target`'s id) and delete `droppedId` in one
 * transaction, so a crash can't leave behind both rows or neither.
 */
export async function applyMergeTwo(
  db: SQLiteDatabase,
  result: MergeTwoResult,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await saveRecipient(db, result.merged);
    await deleteRecipient(db, result.droppedId);
  });
}

/** Union of set channel values, separator-joined for display. */
export function channelSummary(recipient: RecipientRow): string {
  return [recipient.email, recipient.email2, recipient.phone]
    .filter((part) => part != null && part !== '')
    .join(' · ');
}
