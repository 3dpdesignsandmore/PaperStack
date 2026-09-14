/**
 * Export a spike PDF to the OS share sheet.
 *
 * Write path for the on-device spike (plan §13 step 1 follow-up). Uses the
 * new `expo-file-system` `File`/`Paths` class API (SDK 54+; the legacy
 * function API lives at `expo-file-system/legacy` — do not use it here) and
 * `expo-sharing` for the share sheet.
 *
 * Scans and PDFs belong in the documents directory (plan §9): backed up on
 * iOS, never purged by the OS. For a throwaway spike the cache directory
 * would be defensible, but sharing the same convention as production code
 * keeps one canonical write path.
 */
import { Directory, File, Paths } from 'expo-file-system';

/** Where the exported file landed, for display. */
export interface ShareResult {
  /** `file://` URI of the written PDF. */
  uri: string;
  /** Size of the written file in bytes. */
  sizeBytes: number;
}

/**
 * Write raw PDF bytes to `<documents>/spike-artifacts/<fileName>` and hand
 * the file to the OS share sheet.
 */
export async function shareSpikePdf(
  fileName: string,
  pdfBytes: Uint8Array,
): Promise<ShareResult> {
  if (!fileName.endsWith('.pdf')) {
    throw new Error(`fileName must end in .pdf, got "${fileName}"`);
  }

  const dir = new Directory(Paths.document, 'spike-artifacts');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, fileName);
  file.write(pdfBytes);

  // Dynamic import on purpose: expo-sharing resolves its native module at
  // import time, so a module-scope import crashes the entire route when the
  // installed dev build predates it (JS over Metro can be newer than the
  // binary). Keeping it inside the call confines the failure to a catchable
  // error on the Share button.
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'PaperStack spike PDF',
    UTI: 'com.adobe.pdf',
  });

  return { uri: file.uri, sizeBytes: file.size };
}
