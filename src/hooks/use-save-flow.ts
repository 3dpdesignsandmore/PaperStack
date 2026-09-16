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

import { appendScanSession, type PersistOptions, persistOptionsFromSetting, persistScanSession } from '@/lib/db/persist-scan';
import { fetchLibrary, getSetting, SCAN_NAME_PREFIX_KEY, SCAN_QUALITY_KEY } from '@/lib/db/queries';
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
  /** A save is writing — the dialog's actions disable while true. */
  saving: boolean;
  /** "Save each as separate document" is available — only when the
   * session has more than one page (with one page it's meaningless).
   * The dialog reads it to show/hide the option. */
  canSplitDocuments: boolean;
  onSaveSeparate: () => void;
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
  // True while a save action is writing — the dialog disables its
  // actions so a slow save can't be double-tapped.
  const [saving, setSaving] = useState(false);
  const resolveRef = useRef<((documentId: string | null) => void) | null>(null);
  // Persist options for the pending session — read once in `startSave`
  // (alongside the other settings), not re-read per save action; the save
  // the user tapped should use the settings that existed when the dialog
  // opened.
  const persistOptionsRef = useRef<PersistOptions>({});

  function settle(documentId: string | null) {
    setPendingUris(null);
    resolveRef.current?.(documentId);
    resolveRef.current = null;
  }

  async function startSave(pageUris: string[]): Promise<string | null> {
    const [docs, prefix, quality] = await Promise.all([
      fetchLibrary(db),
      getSetting(db, SCAN_NAME_PREFIX_KEY),
      getSetting(db, SCAN_QUALITY_KEY),
    ]);
    persistOptionsRef.current = persistOptionsFromSetting(quality);
    setRecentDocs(docs);
    setSaveName(prefix ?? '');
    setPendingUris(pageUris);

    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }

  async function onSaveAsNew() {
    if (pendingUris == null || saving) {
      return;
    }
    const title = saveName.trim();
    if (title.length === 0) {
      return;
    }
    const uris = pendingUris;
    const persistOptions = persistOptionsRef.current;
    setSaving(true);
    try {
      const doc = await persistScanSession(db, uris, title, DocumentKind.Document, persistOptions);
      setSaving(false);
      settle(doc.id);
    } catch (e: unknown) {
      setSaving(false);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
      settle(null);
    }
  }

  /** Save each pending page as its own document — the user's name gets a
   * numeric suffix on every page after the first. Resolves the session
   * as "stay where you were" (null): there is no single document to
   * land on, and the count confirmation below is the feedback. */
  async function onSaveSeparate() {
    if (pendingUris == null || pendingUris.length < 2 || saving) {
      return;
    }
    const base = saveName.trim();
    if (base.length === 0) {
      return;
    }
    const uris = [...pendingUris];
    const persistOptions = persistOptionsRef.current;
    setSaving(true);
    let saved = 0;
    try {
      // Sequential by convention (read-modify-write of the same tables).
      for (let index = 0; index < uris.length; index++) {
        const title = index === 0 ? base : `${base} (${index + 1})`;
        await persistScanSession(db, [uris[index]], title, DocumentKind.Document, persistOptions);
        saved++;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Save failed',
        saved > 0
          ? `Saved ${saved} of ${uris.length} before failing: ${message}`
          : message,
      );
    }
    setSaving(false);
    settle(null);
    if (saved > 0) {
      Alert.alert('Saved', `Saved ${saved} document${saved === 1 ? '' : 's'} to your library.`);
    }
  }

  async function onAppend(target: LibraryEntry) {
    if (pendingUris == null) {
      return;
    }
    const uris = pendingUris;
    const persistOptions = persistOptionsRef.current;
    try {
      await appendScanSession(db, uris, target.id, persistOptions);
      settle(target.id);
      // The settle above lands the caller on the target document, new
      // pages at the bottom — say it out loud too, so the save outcome
      // is confirmed rather than inferred (same feedback shape as the
      // split-save alert below).
      Alert.alert(
        'Added to document',
        `Added ${uris.length} page${uris.length === 1 ? '' : 's'} to "${target.title}".`,
      );
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
      saving,
      onSaveAsNew,
      onSaveSeparate,
      canSplitDocuments: (pendingUris?.length ?? 0) > 1,
      onAppend,
      onCancel: () => settle(null),
    },
  };
}
