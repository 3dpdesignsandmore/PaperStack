/**
 * Read queries for the Library and document detail screens.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DocumentKind, LibraryEntry, ScanPage } from '@/lib/model';

function toKind(value: string): DocumentKind {
  return value === 'receipt' ? 'receipt' : 'document';
}

/**
 * All documents, newest first, with page counts and the first page's
 * thumbnail path for the Library grid.
 */
export async function fetchLibrary(db: SQLiteDatabase): Promise<LibraryEntry[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    kind: string;
    created_at: number;
    updated_at: number;
    pageCount: number;
    firstThumbPath: string | null;
  }>(
    `SELECT d.id, d.title, d.kind, d.created_at, d.updated_at,
            (SELECT COUNT(*) FROM scan_pages p WHERE p.document_id = d.id) AS pageCount,
            (SELECT p.thumb_path FROM scan_pages p
              WHERE p.document_id = d.id ORDER BY p.page_index ASC LIMIT 1) AS firstThumbPath
     FROM scan_documents d
     ORDER BY d.created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: toKind(row.kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageCount: row.pageCount,
    firstThumbPath: row.firstThumbPath,
  }));
}

/** Ordered pages of one document. */
export async function fetchPages(
  db: SQLiteDatabase,
  documentId: string,
): Promise<ScanPage[]> {
  const rows = await db.getAllAsync<{
    id: string;
    document_id: string;
    page_index: number;
    image_path: string;
    thumb_path: string;
    width_px: number;
    height_px: number;
  }>(
    'SELECT * FROM scan_pages WHERE document_id = ? ORDER BY page_index ASC',
    [documentId],
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    pageIndex: row.page_index,
    imagePath: row.image_path,
    thumbPath: row.thumb_path,
    widthPx: row.width_px,
    heightPx: row.height_px,
  }));
}
