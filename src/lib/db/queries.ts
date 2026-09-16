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

/** Read one setting, or null when unset. Values are plain strings. */
export async function getSetting(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

/**
 * Synchronous counterpart to {@link getSetting} — for the one place a
 * setting must be read before first render (the theme preference in
 * `theme-provider.tsx`'s initial state), where an async load would flash
 * the default for one frame on every launch.
 */
export function getSettingSync(db: SQLiteDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

/** Create or overwrite one setting. */
export async function setSetting(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/** Setting key holding the prefix suggested when naming a new scan. */
export const SCAN_NAME_PREFIX_KEY = 'scan_name_prefix';
/** Setting key holding the scanner's cropped-image JPEG quality (0-100). */
export const SCAN_QUALITY_KEY = 'scan_quality';
/** Setting key holding whether a scan session may capture multiple pages. */
export const SCAN_MULTI_PAGE_KEY = 'scan_multi_page';
/** Setting key holding the chosen palette id (a `PaletteId`). */
export const PALETTE_ID_KEY = 'palette_id';
/** Setting key holding the appearance override (a `ThemeAppearance`). */
export const THEME_APPEARANCE_KEY = 'theme_appearance';
