/**
 * Saved-recipient send mechanics: the OS-facing half of the feature.
 * The pure merge logic (one record per person, email + text channels)
 * lives in `recipient-merge.ts`; this module sends:
 *
 * - email via `expo-mail-composer` — in-app compose sheet with the PDF
 *   attached, works with whatever mail app the device has set up;
 * - text via `sms:` link — the messaging app opens with the number
 *   filled. iOS cannot attach a file through an sms: link, so the user
 *   sends the message and shares the file from the sheet the OS opens;
 *   acknowledged trade-off, documented in the plan.
 *
 * On-device only: no addresses go anywhere except into the OS's own
 * mail/messages apps when the user sends.
 *
 * Why not `expo-sms`: it is a native module (rebuild) and its
 * sendSMSAsync requires user consent per send anyway — Linking gives
 * the same handoff with zero new native surface.
 */
import * as MailComposer from 'expo-mail-composer';
import { Linking } from 'react-native';

import type { SQLiteDatabase } from 'expo-sqlite';

import { generateId } from '@/lib/db/persist-scan';
import { touchRecipient, type RecipientRow } from '@/lib/db/queries';
import { RecipientChannel, upsertRecipientByChannel } from '@/lib/recipient-merge';

export { channelsOf, RecipientChannel } from '@/lib/recipient-merge';

/**
 * The app-facing merge with the real id generator bound in (the pure
 * version takes it as a parameter; see `recipient-merge.ts` for why).
 */
export async function mergeRecipient(
  db: SQLiteDatabase,
  label: string,
  channelValue: string,
  channel: RecipientChannel,
): Promise<RecipientRow> {
  return upsertRecipientByChannel(db, label, channelValue, channel, generateId);
}

/** Options for {@link sendToRecipient}. */
export interface SendOptions {
  /** The exported file URI to attach / point at. */
  fileUri: string;
  /** A subject for email sends. */
  subject: string;
  /** A short body for email sends. */
  body?: string;
}

/** Result of the send interaction. */
export type SendOutcome =
  | { status: 'sent'; recipient: RecipientRow }
  | { status: 'cancelled'; recipient: RecipientRow }
  | { status: 'unavailable'; reason: string };

/**
 * Hand the export to a recipient over the chosen channel (see the
 * module comment for the sms: caveat). Treats an OS handoff — the
 * messaging app opening — as 'sent'; the OS provides no completion
 * callback.
 */
export async function sendToRecipient(
  recipient: RecipientRow,
  channel: RecipientChannel,
  options: SendOptions,
): Promise<SendOutcome> {
  if (channel === RecipientChannel.Email) {
    if (recipient.email == null || recipient.email === '') {
      return { status: 'unavailable', reason: 'This recipient has no email address saved.' };
    }
    const canMail = await MailComposer.isAvailableAsync();
    if (!canMail) {
      return { status: 'unavailable', reason: 'No email account is set up on this device.' };
    }
    const result = await MailComposer.composeAsync({
      recipients: [recipient.email],
      subject: options.subject,
      body: options.body ?? '',
      attachments: [options.fileUri],
    });
    return result.status === MailComposer.MailComposerStatus.SENT
      ? { status: 'sent', recipient }
      : { status: 'cancelled', recipient };
  }

  if (recipient.phone == null || recipient.phone === '') {
    return { status: 'unavailable', reason: 'This recipient has no phone number saved.' };
  }
  const url = `sms:${recipient.phone}`;
  if (!(await Linking.canOpenURL(url))) {
    return { status: 'unavailable', reason: 'No messaging app is available on this device.' };
  }
  await Linking.openURL(url);
  return { status: 'sent', recipient };
}

/** Stamp recency; call after any send, whatever the outcome. */
export async function recordRecipientUse(db: SQLiteDatabase, id: string): Promise<void> {
  await touchRecipient(db, id);
}
