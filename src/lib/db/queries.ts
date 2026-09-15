/**
 * Read queries for the Library and document detail screens.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { toDocumentKind, type LibraryEntry, type ScanDocument, type ScanPage } from '@/lib/model';

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
    kind: toDocumentKind(row.kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageCount: row.pageCount,
    firstThumbPath: row.firstThumbPath,
  }));
}

/** Fetch one document by id, or null when it does not exist. */
export async function fetchDocument(
  db: SQLiteDatabase,
  documentId: string,
): Promise<ScanDocument | null> {
  const row = await db.getFirstAsync<{
    id: string;
    title: string;
    kind: string;
    created_at: number;
    updated_at: number;
  }>('SELECT * FROM scan_documents WHERE id = ?', [documentId]);

  if (row == null) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    kind: toDocumentKind(row.kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Rename a document. */
export async function renameDocument(
  db: SQLiteDatabase,
  documentId: string,
  title: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE scan_documents SET title = ?, updated_at = ? WHERE id = ?',
    [title, Date.now(), documentId],
  );
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
