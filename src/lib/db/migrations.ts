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
export const DATABASE_VERSION = 1;

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

  // Future migrations: `if (current === 1) { ... current = 2; }`

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
