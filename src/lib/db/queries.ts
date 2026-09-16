/**
 * Read queries for the Library and document detail screens.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { generateId } from '@/lib/db/persist-scan';
import { toDocumentKind, type LibraryEntry, type ScanDocument, type ScanPage } from '@/lib/model';

/**
 * All documents, newest first, each with its page count, first page
 * thumbnail, and tag names. `search` filters by title substring via
 * SQLite `LIKE` (escaped; ASCII-case-insensitive by default collation).
 */
export async function fetchLibrary(
  db: SQLiteDatabase,
  search?: string,
): Promise<LibraryEntry[]> {
  const term = search?.trim() ?? '';
  const searching = term.length > 0;
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    kind: string;
    created_at: number;
    updated_at: number;
    pageCount: number;
    firstThumbPath: string | null;
    tagNames: string | null;
  }>(
    `SELECT d.id, d.title, d.kind, d.created_at, d.updated_at,
            (SELECT COUNT(*) FROM scan_pages p WHERE p.document_id = d.id) AS pageCount,
            (SELECT p.thumb_path FROM scan_pages p
              WHERE p.document_id = d.id ORDER BY p.page_index ASC LIMIT 1) AS firstThumbPath,
            (SELECT GROUP_CONCAT(t.name)
               FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
              WHERE dt.document_id = d.id) AS tagNames
     FROM scan_documents d
     ${searching ? "WHERE d.title LIKE ? ESCAPE '\\'" : ''}
     ORDER BY d.created_at DESC`,
    searching ? [`%${escapeLike(term)}%`] : [],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: toDocumentKind(row.kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pageCount: row.pageCount,
    firstThumbPath: row.firstThumbPath,
    tags: row.tagNames == null ? [] : row.tagNames.split(','),
  }));
}

/** Escape `\`, `%`, `_` for a LIKE pattern with `'` as the escape char. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `'${ch}`);
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

/* ------------------------------------------------------------------ */
/* Page reordering (Phase 2).                                          */
/* ------------------------------------------------------------------ */

/**
 * Rewrite a document's page order. `orderedPageIds` must contain every
 * page id in that document exactly once; indices are compacted to
 * 0..n-1 inside one transaction, so a mid-flight failure leaves the
 * previous order intact.
 */
export async function reorderPages(
  db: SQLiteDatabase,
  documentId: string,
  orderedPageIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedPageIds.length; index++) {
      await db.runAsync(
        'UPDATE scan_pages SET page_index = ? WHERE id = ? AND document_id = ?',
        [index, orderedPageIds[index], documentId],
      );
    }
    await db.runAsync(
      'UPDATE scan_documents SET updated_at = ? WHERE id = ?',
      [Date.now(), documentId],
    );
  });
}

/* ------------------------------------------------------------------ */
/* Tags (Phase 2).                                                     */
/* ------------------------------------------------------------------ */

/** One `tags` row. */
export interface TagRow {
  id: string;
  name: string;
}

/** All tags, alphabetical. */
export async function fetchTags(db: SQLiteDatabase): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>('SELECT id, name FROM tags ORDER BY name COLLATE NOCASE');
}

/** A document's tags, alphabetical. */
export async function fetchDocumentTags(
  db: SQLiteDatabase,
  documentId: string,
): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>(
    `SELECT t.id, t.name FROM document_tags dt
       JOIN tags t ON t.id = dt.tag_id
      WHERE dt.document_id = ?
      ORDER BY t.name COLLATE NOCASE`,
    [documentId],
  );
}

/**
 * Create a tag if it does not exist (case-insensitive by name), then
 * attach it to a document. Idempotent — an existing pairing is a no-op.
 */
export async function addTagToDocument(
  db: SQLiteDatabase,
  documentId: string,
  name: string,
): Promise<TagRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Tag name cannot be empty');
  }

  let existing = await db.getFirstAsync<TagRow>(
    'SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE',
    [trimmed],
  );
  if (existing == null) {
    const id = generateId();
    await db.runAsync('INSERT INTO tags (id, name) VALUES (?, ?)', [id, trimmed]);
    existing = { id, name: trimmed };
  }
  const tag = existing;
  await db.runAsync(
    'INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [documentId, tag.id],
  );
  return tag;
}

/**
 * Detach a tag from a document and delete the tag itself if this was its
 * last use — tags exist only as long as something references them.
 */
export async function removeTagFromDocument(
  db: SQLiteDatabase,
  documentId: string,
  tagId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?',
      [documentId, tagId],
    );
    await db.runAsync(
      'DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM document_tags WHERE tag_id = ?)',
      [tagId, tagId],
    );
  });
}

/* ------------------------------------------------------------------ */
/* Saved share recipients (Phase 7).                                   */
/* ------------------------------------------------------------------ */

/** One `recipients` row. */
export interface RecipientRow {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  lastUsedAt: number;
}

/** All recipients, most recently used first. */
export async function fetchRecipients(db: SQLiteDatabase): Promise<RecipientRow[]> {
  return db.getAllAsync<RecipientRow>(
    'SELECT id, label, email, phone, last_used_at AS lastUsedAt FROM recipients ORDER BY last_used_at DESC, label COLLATE NOCASE',
  );
}

/** Save (insert or update) a recipient. */
export async function saveRecipient(
  db: SQLiteDatabase,
  recipient: Omit<RecipientRow, 'lastUsedAt'>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO recipients (id, label, email, phone, last_used_at)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, email = excluded.email, phone = excluded.phone`,
    [recipient.id, recipient.label, recipient.email, recipient.phone],
  );
}

/** Delete a recipient. */
export async function deleteRecipient(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM recipients WHERE id = ?', [id]);
}

/** Stamp `last_used_at` after sharing to one. */
export async function touchRecipient(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE recipients SET last_used_at = ? WHERE id = ?', [Date.now(), id]);
}
