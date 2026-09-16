/**
 * The "file this session" half of capture/import: given a set of already-
 * captured or picked page URIs, ask whether to save them as a new document
 * or append to an existing one. Shared by `useCapture()` (scanner-sourced)
 * and `useImportPhotos()` (photo-library-sourced) — the two differ only in
 * *where* `pageUris` comes from; what happens after that is identical, so
 * it lives here once rather than duplicated in both hooks.
 *
 * No UI of its own — callers render `SaveScanDialog` with `dialog`, so it
 * can appear above whichever screen triggered the flow.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { appendScanSession, persistScanSession } from '@/lib/db/persist-scan';
import { fetchLibrary, getSetting, SCAN_NAME_PREFIX_KEY } from '@/lib/db/queries';
import { DocumentKind, type LibraryEntry } from '@/lib/model';

/** State + handlers for the save-flow dialog a caller renders. */
export interface CaptureDialogState {
  visible: boolean;
  pageCount: number;
  name: string;
  onChangeName: (value: string) => void;
  recentDocs: LibraryEntry[];
  onSaveAsNew: () => void;
  onAppend: (target: LibraryEntry) => void;
  onCancel: () => void;
}

/** Return value of {@link useSaveFlow}. */
export interface UseSaveFlowResult {
  /**
   * Show the save dialog for these page URIs. Resolves with the saved
   * document id once the user saves, or `null` if the dialog was
   * cancelled — the correct outcome is to do nothing and leave the caller
   * where it was.
   */
  startSave: (pageUris: string[]) => Promise<string | null>;
  /** Props for the save-flow dialog; render `<SaveScanDialog {...dialog} />`. */
  dialog: CaptureDialogState;
}

export function useSaveFlow(): UseSaveFlowResult {
  const db = useSQLiteContext();
  const [pendingUris, setPendingUris] = useState<string[] | null>(null);
  const [recentDocs, setRecentDocs] = useState<LibraryEntry[]>([]);
  const [saveName, setSaveName] = useState('');
  const resolveRef = useRef<((documentId: string | null) => void) | null>(null);

  function settle(documentId: string | null) {
    setPendingUris(null);
    resolveRef.current?.(documentId);
    resolveRef.current = null;
  }

  async function startSave(pageUris: string[]): Promise<string | null> {
    const [docs, prefix] = await Promise.all([
      fetchLibrary(db),
      getSetting(db, SCAN_NAME_PREFIX_KEY),
    ]);
    setRecentDocs(docs);
    setSaveName(prefix ?? '');
    setPendingUris(pageUris);

    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }

  async function onSaveAsNew() {
    if (pendingUris == null) {
      return;
    }
    const title = saveName.trim();
    if (title.length === 0) {
      return;
    }
    const uris = pendingUris;
    try {
      const doc = await persistScanSession(db, uris, title, DocumentKind.Document);
      settle(doc.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
      settle(null);
    }
  }

  async function onAppend(target: LibraryEntry) {
    if (pendingUris == null) {
      return;
    }
    const uris = pendingUris;
    try {
      await appendScanSession(db, uris, target.id);
      settle(target.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
      settle(null);
    }
  }

  return {
    startSave,
    dialog: {
      visible: pendingUris != null,
      pageCount: pendingUris?.length ?? 0,
      name: saveName,
      onChangeName: setSaveName,
      recentDocs,
      onSaveAsNew,
      onAppend,
      onCancel: () => settle(null),
    },
  };
}
