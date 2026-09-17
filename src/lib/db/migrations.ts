/**
 * SQLite schema and migrations (plan §7).
 *
 * The DB stores metadata only — image bytes live on disk in the documents
 * directory, with paths recorded in `scan_pages`.
 *
 * Migrations use `PRAGMA user_version`: each new schema version appends a
 * case to `migrate()`; never edit a shipped migration.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

/** Current schema version. Increment when adding a migration step. */
export const DATABASE_VERSION = 5;

/** Database file name, opened relative to the default SQLite directory. */
export const DATABASE_NAME = 'paperstack.db';

/**
 * Bring the database up to `DATABASE_VERSION`. Idempotent — safe to run on
 * every launch. Invoked from `SQLiteProvider`'s `onInit`.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  // `ON DELETE CASCADE` only fires with foreign keys enabled, and the
  // pragma is per-connection — so set it on every init, not just v0→v1.
  await db.execAsync('PRAGMA foreign_keys = ON');

  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  let current = result?.user_version ?? 0;
  if (current >= DATABASE_VERSION) {
    return;
  }

  if (current === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE scan_documents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'document',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE scan_pages (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES scan_documents(id) ON DELETE CASCADE,
        page_index INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        thumb_path TEXT NOT NULL,
        width_px INTEGER NOT NULL,
        height_px INTEGER NOT NULL,
        UNIQUE (document_id, page_index)
      );

      CREATE INDEX idx_scan_pages_document ON scan_pages (document_id, page_index);
    `);
    current = 1;
  }

  if (current === 1) {
    // v2: key-value settings store (scan-name prefix and future defaults).
    await db.execAsync(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    current = 2;
  }

  if (current === 2) {
    // v3 (Phase 2): document tags — many-to-many through document_tags.
    // Plus (Phase 7) saved share recipients: label + optional email/phone,
    // ordered by last use. Both in one migration so there is one schema
    // version to reason about for a release, not two shipped a day apart.
    await db.execAsync(`
      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
      );

      CREATE TABLE document_tags (
        document_id TEXT NOT NULL REFERENCES scan_documents(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (document_id, tag_id)
      );

      CREATE INDEX idx_document_tags_document ON document_tags (document_id);
      CREATE INDEX idx_document_tags_tag ON document_tags (tag_id);

      CREATE TABLE recipients (
        id TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        last_used_at INTEGER NOT NULL DEFAULT 0
      );
    `);
    current = 3;
  }

  // Future migrations: `if (current === 3) { ... current = 4; }`

  if (current === 3) {
    // v4: a second email per recipient — the home + work case. The
    // primary `email` stays the default send target; `email_2` is an
    // explicitly chosen alternative, never a fallback the user didn't opt
    // into.
    await db.execAsync(`
      ALTER TABLE recipients ADD COLUMN email_2 TEXT;
    `);
    current = 4;
  }

  if (current === 4) {
    // v5 (plan §6/§7): OCR. One row per page for the full recognition
    // result (searchable text + blocks), one for the extracted receipt
    // fields. `page_receipts.user_edited` is the "never clobber
    // corrections" guard — the background re-run refreshes `page_ocr`
    // but leaves an edited `page_receipts` row alone.
    await db.execAsync(`
      CREATE TABLE page_ocr (
        id TEXT PRIMARY KEY NOT NULL,
        page_id TEXT NOT NULL UNIQUE REFERENCES scan_pages(id) ON DELETE CASCADE,
        full_text TEXT NOT NULL,
        blocks_json TEXT NOT NULL,
        recognized_at INTEGER NOT NULL
      );

      CREATE TABLE page_receipts (
        page_id TEXT PRIMARY KEY NOT NULL REFERENCES scan_pages(id) ON DELETE CASCADE,
        merchant TEXT,
        date_ms INTEGER,
        total REAL,
        tax REAL,
        currency TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        user_edited INTEGER NOT NULL DEFAULT 0
      );
    `);
    current = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
