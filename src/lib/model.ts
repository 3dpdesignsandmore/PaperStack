/**
 * Domain model types (plan §7) shared across the app: SQLite rows, scanner
 * session results, and persistence pipeline outputs.
 */
export const DocumentKind = {
  Document: 'document',
  Receipt: 'receipt',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

/** Narrow a raw DB `kind` string; unknown values fall back to document. */
export function toDocumentKind(value: string): DocumentKind {
  return value === DocumentKind.Receipt
    ? DocumentKind.Receipt
    : DocumentKind.Document;
}

/** A `scan_documents` row. */
export interface ScanDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  createdAt: number;
  updatedAt: number;
}

/** A `scan_pages` row. */
export interface ScanPage {
  id: string;
  documentId: string;
  pageIndex: number;
  imagePath: string;
  thumbPath: string;
  widthPx: number;
  heightPx: number;
}

/** Library list item: a document with its first page for the thumbnail. */
export interface LibraryEntry {
  id: string;
  title: string;
  kind: DocumentKind;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  firstThumbPath: string | null;
  /** Tag names, alphabetical. May be empty; never null. */
  tags: string[];
}

/** One recognized region of a page — normalized 0..1, top-left origin
 * (the engine already normalizes on both platforms; this is the
 * persisted shape, flattened for SQLite and the export path). */
export interface OcrBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/** A page's full OCR result (plan §7). */
export interface OcrResult {
  id: string;
  pageId: string;
  fullText: string;
  blocks: OcrBlock[];
}

/** Extracted receipt fields for a page (plan §7) — every value is a
 * guess the user can correct; `userEdited` guards against a later OCR
 * re-run clobbering corrections. */
export interface ReceiptData {
  pageId: string;
  merchant: string | null;
  date: number | null;
  total: number | null;
  tax: number | null;
  currency: string;
  confidence: number;
  userEdited: boolean;
}
