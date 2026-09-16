/**
 * Import-from-photos flow: pick existing photos, then hand them to
 * `useSaveFlow()` — same save dialog (save as new / append to existing)
 * `useCapture()` uses, just sourced from the photo library instead of the
 * scanner. See `photo-picker.ts` for why this exists as its own path
 * rather than the document scanner's own gallery-import option.
 */
import { useState } from 'react';
import { Alert } from 'react-native';

import { useSaveFlow, type CaptureDialogState } from '@/hooks/use-save-flow';
import { pickPhotos } from '@/lib/photo-picker';

/** Return value of {@link useImportPhotos}. */
export interface UseImportPhotosResult {
  /**
   * Opens the photo picker and, on success, the save dialog. Resolves
   * with the resulting document id once the user saves, or `null` if the
   * picker or the dialog was cancelled.
   */
  importPhotos: () => Promise<string | null>;
  /** True while the system photo picker is being launched. */
  picking: boolean;
  /** Props for the save-flow dialog; render `<SaveScanDialog {...dialog} />`. */
  dialog: CaptureDialogState;
}

export function useImportPhotos(): UseImportPhotosResult {
  const [picking, setPicking] = useState(false);
  const { startSave, dialog } = useSaveFlow();

  async function importPhotos(): Promise<string | null> {
    setPicking(true);
    let pageUris: string[];
    try {
      const result = await pickPhotos();
      pageUris = result.pageUris;
    } catch (e: unknown) {
      setPicking(false);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Import failed', message);
      return null;
    }
    setPicking(false);
    if (pageUris.length === 0) {
      return null; // user cancelled or denied access
    }
    return startSave(pageUris);
  }

  return { importPhotos, picking, dialog };
}
