/**
 * Import existing photos as a document — the real "Import from photos"
 * feature, replacing the "Coming soon" stub. Deliberately separate from
 * `scanner.ts`: the document scanner's own gallery-import option runs
 * every picked photo through the same edge-detection/perspective-
 * correction pipeline used for a photographed page at an angle, which can
 * misfire on a photo that was never skewed to begin with (warping or
 * rotating it trying to "flatten" a non-document image). This picker
 * imports photos as-is, with no document-style correction, so it can't
 * produce that artifact.
 */
import * as ImagePicker from 'expo-image-picker';

import { logInfo } from '@/lib/debug-log';

/** A completed photo-import session. */
export interface PhotoPickerSession {
  /** The picked photos' local file URIs, in selection order. */
  pageUris: string[];
}

/**
 * Open the system photo picker and resolve with the picked photos.
 * Resolves with an empty `pageUris` when the user cancels or denies
 * access — same "do nothing, stay where you were" contract as
 * `scanPages()`.
 */
export async function pickPhotos(): Promise<PhotoPickerSession> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    logInfo('photo-picker', 'media-library permission not granted');
    return { pageUris: [] };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: true,
    // 0 = the system's own maximum, not "unlimited" in the literal sense.
    selectionLimit: 0,
  });

  if (result.canceled) {
    return { pageUris: [] };
  }

  const pageUris = result.assets.map((asset) => asset.uri);
  logInfo('photo-picker', `picked ${pageUris.length} photo(s)`);
  return { pageUris };
}
