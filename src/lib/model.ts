/**
 * Domain model types (plan §7) shared across the app: SQLite rows, scanner
 * session results, and persistence pipeline outputs.
 */
export const DocumentKind = {
  Document: 'document',
  Receipt: 'receipt',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

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
}
