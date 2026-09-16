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
 *
 * `expo-mail-composer` is loaded dynamically inside the email path,
 * same reasoning as `scanner.ts`: its native module ships with the
 * next dev build, and a static import would crash every route that
 * touches this module on binaries built before it existed. The import
 * is ALSO gated on `requireOptionalNativeModule('ExpoMailComposer')`:
 * the package resolves its native module at module scope, so on a
 * stale binary the throw happens inside Metro's loader and is logged
 * as an ERROR even though the rejection is caught below — checking
 * first keeps old binaries quiet instead of redboxing the console.
 */
import { Linking } from 'react-native';

import { requireOptionalNativeModule } from 'expo';
import type { SQLiteDatabase } from 'expo-sqlite';

import { generateId } from '@/lib/db/persist-scan';
import { touchRecipient, type RecipientRow } from '@/lib/db/queries';
import { RecipientChannel, upsertRecipientByChannel } from '@/lib/recipient-merge';

export { channelsOf, channelSummary, RecipientChannel } from '@/lib/recipient-merge';

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
  /** Which of the recipient's two email slots to send to, when both are
   * set — callers must pick (e.g. ask home vs work); the primary is the
   * default when unset. */
  emailSlot?: 1 | 2;
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
    const address =
      options.emailSlot === 2
        ? recipient.email2 ?? recipient.email
        : recipient.email;
    if (address == null || address === '') {
      return { status: 'unavailable', reason: 'This recipient has no email address saved.' };
    }
    // Gate the import on the native side being present. The package
    // resolves `requireNativeModule('ExpoMailComposer')` at module
    // scope, so on a binary predating it the dynamic import below
    // throws inside Metro's loader — the catch below handles the
    // rejection, but Metro still logs the throw as an ERROR. Asking
    // the runtime directly returns null on stale binaries, skipping
    // the import (and the console noise) entirely.
    if (requireOptionalNativeModule('ExpoMailComposer') == null) {
      return {
        status: 'unavailable',
        reason: 'Email sending needs a newer app build (mail module unavailable). Text sending and the OS share sheet still work.',
      };
    }
    let mail: typeof import('expo-mail-composer');
    try {
      // Metro's CJS interop can hand back either the module namespace or
      // a `{ default: namespace }` wrapper (see `scanner.ts`, which hits
      // the same thing with its CJS package) — unwrap whichever arrives,
      // then verify the API is actually there before calling it.
      const loaded: unknown = await import('expo-mail-composer');
      const candidate =
        typeof (loaded as { default?: unknown }).default === 'object' &&
        (loaded as { default?: { isAvailableAsync?: unknown } }).default != null
          ? (loaded as { default: typeof import('expo-mail-composer') }).default
          : (loaded as typeof import('expo-mail-composer'));
      if (typeof candidate.isAvailableAsync !== 'function') {
        return {
          status: 'unavailable',
          reason: 'Email sending needs a newer app build (mail module unavailable). Text sending and the OS share sheet still work.',
        };
      }
      mail = candidate;
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      return {
        status: 'unavailable',
        reason: `Email sending needs a newer app build (${detail}). Text sending and the OS share sheet still work.`,
      };
    }
    const canMail = await mail.isAvailableAsync();
    if (!canMail) {
      return { status: 'unavailable', reason: 'No email account is set up on this device.' };
    }
    const result = await mail.composeAsync({
      recipients: [address],
      subject: options.subject,
      body: options.body ?? '',
      attachments: [options.fileUri],
    });
    return result.status === mail.MailComposerStatus.SENT
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
