/**
 * Background OCR pipeline (plan §6): after a scan session persists, run
 * the engine over each new page and store the results. Always OUTSIDE
 * the persist transaction — OCR is slow (hundreds of ms per page) and
 * the scan must be saved even if recognition fails entirely.
 *
 * Contract:
 * - one page at a time, sequentially (the engine holds one recognizer;
 *   parallel recognition buys nothing on-device);
 * - each page's result is written as soon as it finishes, so the detail
 *   screen shows fields as they land;
 * - a failure on one page logs and moves to the next — the scan stays
 *   saved (the whole point of running this after the persist);
 * - respects the "Read text (OCR)" setting — off means this never runs;
 * - re-runs refresh `page_ocr` but never clobber user-corrected
 *   `page_receipts` rows (saveReceiptData's `respectUserEdits` guard).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, SCAN_QUALITY_KEY } from '@/lib/db/queries';
import { OCR_ENABLED_KEY, saveOcrResult, saveReceiptData } from '@/lib/db/ocr-queries';
import { logInfo, logThrown } from '@/lib/debug-log';
import { extractReceipt, toReceiptData } from '@/lib/ocr/extract-receipt';
import { recognizePage } from '@/lib/ocr/recognize';
import type { OcrResult, ScanPage } from '@/lib/model';

/** A persisted page the pipeline can work on. */
interface PipelinePage {
  id: string;
  imagePath: string;
}

/** Read the pages of a document the pipeline should recognize. */
async function fetchPipelinePages(db: SQLiteDatabase, documentId: string): Promise<PipelinePage[]> {
  const rows = await db.getAllAsync<{ id: string; image_path: string }>(
    'SELECT id, image_path FROM scan_pages WHERE document_id = ? ORDER BY page_index ASC',
    [documentId],
  );
  return rows.map((row) => ({ id: row.id, imagePath: row.image_path }));
}

/** Map a raw `ScanPage`-shaped row onto the pipeline's needs. */
export function pagesForOcr(pages: Pick<ScanPage, 'id' | 'imagePath'>[]): PipelinePage[] {
  return pages.map((page) => ({ id: page.id, imagePath: page.imagePath }));
}

/**
 * Run OCR over a document's pages in the background. Fire-and-forget:
 * callers `void` this (or attach a catch — the function itself never
 * throws), nothing awaits it in the save flow.
 */
export async function runOcrForDocument(db: SQLiteDatabase, documentId: string): Promise<void> {
  try {
    // Front-door instrumentation (2026-09-17): the silent exits below
    // produced a ZERO-entry log while every page "read" forever — the
    // diagnosis was impossible without knowing whether the pipeline
    // ran at all. Every exit path now leaves a line.
    logInfo('ocr-pipeline', `start: document ${documentId}`);
    const enabled = await getSetting(db, OCR_ENABLED_KEY);
    if (enabled === 'false') {
      logInfo('ocr-pipeline', 'skipped: OCR disabled in settings');
      return;
    }
    const pages = await fetchPipelinePages(db, documentId);
    logInfo('ocr-pipeline', `recognizing ${pages.length} page(s)`);
    for (const page of pages) {
      await runOcrForPage(db, page);
    }
  } catch (e: unknown) {
    // The pipeline's own promise — per-page failures are handled inside
    // the loop; this catches only setup failures (settings read, page
    // query). A scan is never lost to it.
    logThrown('ocr-pipeline', e);
  }
}

/**
 * Recognize one page and store both halves (raw result + extracted
 * receipt fields). Never throws — logging and moving on is the contract.
 */
export async function runOcrForPage(db: SQLiteDatabase, page: PipelinePage): Promise<void> {
  logInfo('ocr-recognize', `page ${page.id}: start`);
  let recognized: Awaited<ReturnType<typeof recognizePage>>;
  try {
    recognized = await recognizePage(page.imagePath);
  } catch (e: unknown) {
    logThrown('ocr-recognize', e);
    return;
  }

  try {
    const result: Omit<OcrResult, 'id'> = {
      pageId: page.id,
      fullText: recognized.fullText,
      blocks: recognized.blocks,
    };
    await saveOcrResult(db, result);

    const receipt = toReceiptData(page.id, extractReceipt({ id: 'pipeline', ...result }));
    // respectUserEdits: a user-corrected row survives an OCR re-run.
    await saveReceiptData(db, receipt, true);

    logInfo(
      'ocr-pipeline',
      `page ${page.id}: ${recognized.blocks.length} block(s), total ${receipt.total ?? '—'}`,
    );
  } catch (e: unknown) {
    logThrown('ocr-persist', e);
  }
}

/**
 * The post-persist hook the save flows call: schedule background OCR for
 * a just-saved document. Deliberately not awaited by callers — see
 * {@link runOcrForDocument}.
 */
export function scheduleOcr(db: SQLiteDatabase, documentId: string): void {
  void runOcrForDocument(db, documentId);
}

/** Re-exported so the settings screen can offer a re-run affordance
 * against the same total key the pipeline uses. */
export { SCAN_QUALITY_KEY as OCR_SCAN_QUALITY_KEY };
