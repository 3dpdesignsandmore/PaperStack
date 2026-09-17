/**
 * OCR persistence (plan §6/§7): read/write the `page_ocr` and
 * `page_receipts` rows migration v5 created. The background pipeline
 * (post-persist) writes them; the document detail screen reads them for
 * the receipt fields editor; the export path will read `page_ocr` for
 * the invisible text layer.
 *
 * `user_edited` on `page_receipts` is the never-clobber guard: an OCR
 * re-run overwrites `page_ocr` (raw recognition is always refreshable)
 * but only touches `page_receipts` when the user has NOT corrected the
 * extracted fields by hand (see {@link upsertOcrResult} /
 * {@link saveReceiptData}).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { generateId } from '@/lib/db/persist-scan';
import type { OcrBlock, OcrResult, ReceiptData } from '@/lib/model';

/** Shape persisted in `page_ocr.blocks_json` — `OcrBlock` verbatim. */
type BlocksJson = OcrBlock[];

function serializeBlocks(blocks: OcrBlock[]): string {
  const value: BlocksJson = blocks;
  return JSON.stringify(value);
}

function deserializeBlocks(json: string): OcrBlock[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Explicit mapping rather than an `as` — same discipline as network
    // data: the DB row may predate a shape change.
    return parsed
      .filter(
        (block): block is OcrBlock =>
          typeof block === 'object' &&
          block != null &&
          typeof (block as Record<string, unknown>).text === 'string',
      )
      .map((block) => ({
        text: block.text,
        x: typeof block.x === 'number' ? block.x : 0,
        y: typeof block.y === 'number' ? block.y : 0,
        width: typeof block.width === 'number' ? block.width : 0,
        height: typeof block.height === 'number' ? block.height : 0,
        confidence: typeof block.confidence === 'number' ? block.confidence : 0,
      }));
  } catch {
    return [];
  }
}

/**
 * Persist a page's recognition result. Overwrites any prior row for the
 * page (a re-run refreshes the raw text; searchable-PDF exports and the
 * field extractor both want the newest read).
 */
export async function saveOcrResult(
  db: SQLiteDatabase,
  result: Omit<OcrResult, 'id'>,
): Promise<OcrResult> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO page_ocr (id, page_id, full_text, blocks_json, recognized_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET
       id = excluded.id,
       full_text = excluded.full_text,
       blocks_json = excluded.blocks_json,
       recognized_at = excluded.recognized_at`,
    [id, result.pageId, result.fullText, serializeBlocks(result.blocks), Date.now()],
  );
  return { id, ...result };
}

/** Load a page's recognition result, or null when it hasn't run. */
export async function fetchOcrResult(
  db: SQLiteDatabase,
  pageId: string,
): Promise<OcrResult | null> {
  const row = await db.getFirstAsync<{
    id: string;
    page_id: string;
    full_text: string;
    blocks_json: string;
  }>('SELECT * FROM page_ocr WHERE page_id = ?', [pageId]);
  if (row == null) {
    return null;
  }
  return {
    id: row.id,
    pageId: row.page_id,
    fullText: row.full_text,
    blocks: deserializeBlocks(row.blocks_json),
  };
}

/**
 * Persist/refresh a page's extracted receipt fields. Pass
 * `respectUserEdits: true` (the background re-run) to leave an
 * already-user-edited row untouched — the correction guard.
 */
export async function saveReceiptData(
  db: SQLiteDatabase,
  data: ReceiptData,
  respectUserEdits: boolean,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO page_receipts (page_id, merchant, date_ms, total, tax, currency, confidence, user_edited)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET
       merchant = excluded.merchant,
       date_ms = excluded.date_ms,
       total = excluded.total,
       tax = excluded.tax,
       currency = excluded.currency,
       confidence = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.confidence
         ELSE excluded.confidence END,
       user_edited = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN 1
         ELSE excluded.user_edited END,
       merchant = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.merchant
         ELSE excluded.merchant END,
       date_ms = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.date_ms
         ELSE excluded.date_ms END,
       total = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.total
         ELSE excluded.total END,
       tax = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.tax
         ELSE excluded.tax END,
       currency = CASE
         WHEN page_receipts.user_edited = 1 AND ? THEN page_receipts.currency
         ELSE excluded.currency END`,
    [
      data.pageId,
      data.merchant,
      data.date,
      data.total,
      data.tax,
      data.currency,
      data.confidence,
      data.userEdited ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
      respectUserEdits ? 1 : 0,
    ],
  );
}

/** Load a page's extracted receipt fields, or null when none exist. */
export async function fetchReceiptData(
  db: SQLiteDatabase,
  pageId: string,
): Promise<ReceiptData | null> {
  const row = await db.getFirstAsync<{
    page_id: string;
    merchant: string | null;
    date_ms: number | null;
    total: number | null;
    tax: number | null;
    currency: string;
    confidence: number;
    user_edited: number;
  }>('SELECT * FROM page_receipts WHERE page_id = ?', [pageId]);
  if (row == null) {
    return null;
  }
  return {
    pageId: row.page_id,
    merchant: row.merchant,
    date: row.date_ms,
    total: row.total,
    tax: row.tax,
    currency: row.currency,
    confidence: row.confidence,
    userEdited: row.user_edited === 1,
  };
}

/** Setting key holding whether scans get OCR'd in the background. */
export const OCR_ENABLED_KEY = 'ocr_enabled';
