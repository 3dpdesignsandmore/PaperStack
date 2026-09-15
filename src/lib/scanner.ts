/**
 * Shared scanner invocation for the Scan tab and Library quick-actions.
 *
 * Wraps react-native-document-scanner-plugin (Apple VisionKit on iOS, ML Kit
 * Document Scanner on Android) behind PaperStack's own result type. Native
 * result validation happens here so screens can trust `pages`.
 */
import type {
    ScanDocumentOptions,
    ScanDocumentResponse,
} from 'react-native-document-scanner-plugin';

/** A completed scanner session. */
export interface ScannerSession {
  /** The scanner's file-path URIs for each captured page, in order. */
  pageUris: string[];
}

/**
 * Open the native document scanner and resolve with the captured pages.
 * Resolves with an empty `pageUris` when the user cancels.
 *
 * Dynamic import: the scanner native module only exists in dev builds from
 * commit a4d35a7+; a static import would crash route modules in binaries
 * built before that.
 */
export async function scanPages(
  options?: ScanDocumentOptions,
): Promise<ScannerSession> {
  const { default: DocumentScanner } = await import(
    'react-native-document-scanner-plugin'
  );

  let response: ScanDocumentResponse;
  try {
    response = await DocumentScanner.scanDocument(options);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Scanner failed: ${message}`);
  }

  if (response.status !== 'success') {
    return { pageUris: [] };
  }

  const scanned = response.scannedImages;
  if (scanned == null) {
    throw new Error('Scanner returned success with no images');
  }

  return { pageUris: scanned };
}
