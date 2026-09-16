/**
 * Local backup (plan §9 "Export All" generalization): zip the app's
 * entire on-device data — the SQLite database, all scan JPEGs, exports,
 * and settings — into one file the user can share anywhere (iCloud
 * Drive, email, Files app). Restore is deliberately manual: unzip the
 * archive over the app's documents directory with the app closed. This
 * is the honest answer to "lost phone = lost tax records" without a
 * backend, and one tap instead of per-document exports.
 *
 * On-device only: the archive is created locally and handed to the OS
 * share sheet; nothing is uploaded by the app itself.
 *
 * The DB file is checkpointed (`wal_checkpoint(TRUNCATE)`) before reading
 * so the WAL sidecar's pending pages are folded into the main .db file —
 * zipping a live WAL-mode database without this silently loses recent
 * writes.
 */
import JSZip from 'jszip';

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Result of building a backup. */
export interface BackupResult {
  /** `file://` URI of the written zip. */
  uri: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** How many files were included. */
  fileCount: number;
}

/** Everything a backup includes, relative paths under documents/. */
const INCLUDED_DIRS = ['scans', 'exports'];

/**
 * Async generator over every file under `dir`, yielding [relativePath,
 * File]. Recursion is iterative-by-batch here (read the list, recurse by
 * stack) so a very large library doesn't blow the native call stack.
 */
async function* walkFiles(dir: Directory, prefix: string): AsyncGenerator<[string, File]> {
  if (!dir.exists) {
    return;
  }
  const stack: [Directory, string][] = [[dir, prefix]];
  while (stack.length > 0) {
    const [current, currentPrefix] = stack.pop() as [Directory, string];
    for (const item of current.list()) {
      if (item instanceof File) {
        yield [currentPrefix + item.name, item];
      } else if (item instanceof Directory) {
        stack.push([item, `${currentPrefix}${item.name}/`]);
      }
    }
  }
}

/**
 * Build the backup zip in memory and write it to
 * documents/backups/paperstack-backup-<timestamp>.zip, then open the
 * share sheet.
 *
 * `db` is the open database: used only to checkpoint WAL, then closed
 * back out of the picture. Note the archive holds the checkpointed .db
 * file itself, so restoring reproduces documents, tags, recipients,
 * and settings exactly.
 */
export async function createAndShareBackup(
  db: SQLiteDatabase,
  databaseFileName: string,
): Promise<BackupResult> {
  // Fold WAL pages into the main database file so the zip captures
  // everything committed so far.
  await db.runAsync('PRAGMA wal_checkpoint(TRUNCATE)');

  const zip = new JSZip();
  let fileCount = 0;

  const documents = new Directory(Paths.document);
  const dbFile = new File(documents, databaseFileName);
  if (dbFile.exists) {
    zip.file(databaseFileName, await dbFile.bytes());
    fileCount++;
  }

  for (const dirName of INCLUDED_DIRS) {
    for await (const [relativePath, file] of walkFiles(new Directory(documents, dirName), `${dirName}/`)) {
      zip.file(relativePath, await file.bytes());
      fileCount++;
    }
  }

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

  const backupDir = new Directory(Paths.document, 'backups');
  if (!backupDir.exists) {
    backupDir.create({ intermediates: true, idempotent: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = new File(backupDir, `paperstack-backup-${stamp}.zip`);
  if (outFile.exists) {
    outFile.delete();
  }
  outFile.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(outFile.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'PaperStack backup',
    });
  }

  return { uri: outFile.uri, sizeBytes: outFile.size, fileCount };
}

/** Explains where the backup lands and how to restore, for Settings. */
export const BACKUP_RESTORE_NOTE =
  'Backups include every scan, export, tag, and setting as one zip. To restore: unzip the archive into the app\u2019s documents folder (replacing what is there) with the app stopped, then relaunch.';
