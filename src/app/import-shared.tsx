/**
 * Share-target intake route (`/import-shared`, plan §8): the landing
 * screen when an image is shared to PaperStack from the OS share sheet
 * — the motivating case being a hardware screenshot of a receipt
 * confirmation or web page, shared without ever saving it to the
 * gallery first.
 *
 * Split into two phases on purpose:
 *
 *   Phase 1 (this route): resolve the incoming payloads via
 *   `useIncomingShare()`, COPY each image out of the sharing layer's
 *   storage (Android: its cache dir; iOS: the shared app-group
 *   container) into the app's own `cache/shared/`, then hand the
 *   stable `file:///` URIs to `useSaveFlow` — the exact same
 *   machinery the scanner and photo import use (`SaveScanDialog`:
 *   new document / append / split-save).
 *
 *   Phase 2 (existing code): `persistScanSession` re-encodes each page
 *   (bounded long edge, JPEG) and MOVES it into `documents/scans/` —
 *   the shared bytes never linger anywhere the OS might purge, and
 *   everything downstream (OCR, packing, export) treats the page like
 *   any other.
 *
 * The copy in phase one is deliberate: the resolver's `contentUri`
 * points at storage the sharing layer owns and may recycle, and the
 * payload docs are explicit that they are short-lived system copies.
 * Copying first decouples "the OS gave us bytes" from "the user
 * finished the save dialog", so a slow save can't lose its input.
 * Cancelled copies stay behind in `cache/` — purgeable by design, same
 * as any scanner temp file.
 */
import { useRouter } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useIncomingShare, type UriBasedResolvedSharePayload } from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredMessage } from '@/components/centered-message';
import { SaveScanDialog } from '@/components/save-scan-dialog';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { useSaveFlow } from '@/hooks/use-save-flow';
import { logInfo, logThrown } from '@/lib/debug-log';
import { filterImagePayloads, normalizeSharedFileUri, sharedCopyName } from '@/lib/share-target';

/** State machine for the intake screen. One screen, one job. */
type IntakePhase =
  | { kind: 'resolving' }
  | { kind: 'unsupported'; count: number }
  | { kind: 'error'; message: string }
  | { kind: 'saving'; uris: string[] }
  | { kind: 'cancelled' };

/** Copy one resolved image payload into the app's own cache. */
async function copyPayloadToCache(
  payload: UriBasedResolvedSharePayload,
  index: number,
  stamp: number,
): Promise<string> {
  const source = new File(normalizeSharedFileUri(payload.contentUri));
  if (!source.exists) {
    throw new Error(`the shared image is no longer available (${payload.originalName ?? 'unnamed'})`);
  }
  const dir = new Directory(Paths.cache, 'shared');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, sharedCopyName(payload.originalName, index, stamp));
  if (dest.exists) {
    dest.delete();
  }
  source.copy(dest);
  logInfo('share-intake', `copied ${payload.originalName ?? 'unnamed'} into app cache`);
  return dest.uri;
}

export default function ImportSharedScreen() {
  const router = useRouter();
  const { startSave, dialog } = useSaveFlow();
  const insets = useSafeAreaInsets();
  const {
    sharedPayloads,
    resolvedSharedPayloads,
    isResolving,
    error: resolveError,
    clearSharedPayloads,
  } = useIncomingShare();

  const [phase, setPhase] = useState<IntakePhase>({ kind: 'resolving' });
  // The payload source is a native singleton that survives re-renders,
  // and resolve timing can re-run this effect — ingest each share
  // exactly once per landing on this route.
  const ingestedRef = useRef(false);

  useEffect(() => {
    if (isResolving || sharedPayloads.length === 0) {
      return;
    }
    if (resolvedSharedPayloads.length === 0 || ingestedRef.current) {
      return;
    }
    ingestedRef.current = true;

    const stamp = Date.now();
    const payloads = resolvedSharedPayloads;

    (async () => {
      const images = filterImagePayloads(payloads);
      if (images.length === 0) {
        setPhase({ kind: 'unsupported', count: payloads.length });
        return;
      }
      // Sequential by convention (read-modify-write of shared storage).
      const uris: string[] = [];
      for (let index = 0; index < images.length; index++) {
        uris.push(await copyPayloadToCache(images[index], index, stamp));
      }
      // The bytes are ours now; let the sharing layer recycle its side
      // of the handoff.
      clearSharedPayloads();
      setPhase({ kind: 'saving', uris });
      const documentId = await startSave(uris);
      if (documentId != null) {
        // Same landing as a scanner capture or photo import.
        router.replace(`/document/${documentId}`);
      } else {
        setPhase({ kind: 'cancelled' });
      }
    })().catch((e: unknown) => {
      logThrown('share-intake', e);
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    });
  }, [isResolving, sharedPayloads, resolvedSharedPayloads, clearSharedPayloads, startSave, router]);

  // Derived, not stored: "nothing was shared" is a render-time fact of
  // the hook (mounted with no pending payload — typed URL / debug
  // launch), so no effect roundtrip is needed to show it.
  const awaitingPayload =
    phase.kind === 'resolving' && !isResolving && sharedPayloads.length === 0;

  const body = (() => {
    if (resolveError != null) {
      return (
        <CenteredMessage message={`Could not read the shared image. ${resolveError.message}`} />
      );
    }
    switch (phase.kind) {
      case 'resolving':
        return awaitingPayload ? (
          <CenteredMessage message="Nothing was shared with PaperStack. Share an image to it from another app to import." />
        ) : (
          <CenteredMessage spinner message="Receiving shared image…" />
        );
      case 'saving':
        return <CenteredMessage spinner message="Receiving shared image…" />;
      case 'unsupported':
        return (
          <CenteredMessage
            message={`PaperStack imports images only — ${phase.count} item${phase.count === 1 ? '' : 's'} of another type arrived.`}
          />
        );
      case 'error':
        return <CenteredMessage message={`Import failed — ${phase.message}`} />;
      case 'cancelled':
        return <CenteredMessage message="Not saved. The shared image was discarded." />;
    }
  })();

  return (
    <ThemedView style={styles.container}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Add shared image" />
      </View>
      {body}
      <SaveScanDialog {...dialog} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
