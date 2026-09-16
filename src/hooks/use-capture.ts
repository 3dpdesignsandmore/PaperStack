/**
 * Capture flow, extracted out of the old Scan tab (plan/UI.md §1): launch
 * the scanner, then hand the result to `useSaveFlow()` to ask how to file
 * it (save as a new document or append to an existing one). No UI of its
 * own — callers render `SaveScanDialog` with `dialog`, so it can appear
 * above whichever screen triggered the capture (the floating tab bar's
 * Scan pill, Home's Scan tile, or the thin `/scan` deep-link route).
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';

import { type CaptureDialogState, useSaveFlow } from '@/hooks/use-save-flow';
import { getSetting, SCAN_MULTI_PAGE_KEY, SCAN_QUALITY_KEY } from '@/lib/db/queries';
import { scanPages } from '@/lib/scanner';

export type { CaptureDialogState };

/** Return value of {@link useCapture}. */
export interface UseCaptureResult {
  /**
   * Launches the scanner and, on success, the save dialog. Resolves with
   * the resulting document id once the user saves, or `null` if the scan
   * or the dialog was cancelled — the correct outcome is to do nothing and
   * leave the caller where it was.
   */
  capture: () => Promise<string | null>;
  /** True while the native scanner sheet is being launched. */
  scanning: boolean;
  /** Props for the save-flow dialog; render `<SaveScanDialog {...dialog} />`. */
  dialog: CaptureDialogState;
}

export function useCapture(): UseCaptureResult {
  const db = useSQLiteContext();
  const [scanning, setScanning] = useState(false);
  const { startSave, dialog } = useSaveFlow();

  async function capture(): Promise<string | null> {
    setScanning(true);
    let pageUris: string[];
    try {
      const [quality, multiPage] = await Promise.all([
        getSetting(db, SCAN_QUALITY_KEY),
        getSetting(db, SCAN_MULTI_PAGE_KEY),
      ]);
      const result = await scanPages({
        croppedImageQuality: quality == null ? undefined : Number(quality),
        // Android-only cap (plugin limitation); iOS always allows multiple.
        maxNumDocuments: multiPage === 'false' ? 1 : undefined,
      });
      pageUris = result.pageUris;
    } catch (e: unknown) {
      setScanning(false);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Scan failed', message);
      return null;
    }
    setScanning(false);
    if (pageUris.length === 0) {
      return null; // user cancelled
    }
    return startSave(pageUris);
  }

  return { capture, scanning, dialog };
}
