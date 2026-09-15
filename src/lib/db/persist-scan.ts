/**
 * Scan persistence pipeline (plan §9, §7): scanner output → durable storage.
 *
 * The scanner returns JPEG file URIs in a cache/temp location the OS may
 * purge. This module moves each page into the app's documents directory
 * (backed up on iOS, never purged), downscaling to a bounded long edge
 * first — 2000px is plenty for OCR and print at the scales in plan §5 —
 * and records everything in SQLite.
 *
 * Steps for a session, in order and deliberately sequential (repo
 * convention: no Promise.all on read-modify-write of shared state):
 *   1. create document directory + id
 *   2. per page: bound long edge → compress → move into documents/scans/
 *   3. insert document + page rows
 *   4. return the persisted document
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DocumentKind, ScanDocument } from '@/lib/model';

/** Long-edge pixel cap for stored scans (plan §9 storage budget). */
export const MAX_LONG_EDGE_PX = 2000;
/** JPEG quality for stored scans (plan §9 default). */
export const JPEG_QUALITY = 0.8;
/** Directory under documents/ holding all scan files. */
export const SCAN_DIR_NAME = 'scans';

/** A page as persisted on disk + DB. */
export interface PersistedPage {
  id: string;
  imagePath: string;
  thumbPath: string;
  widthPx: number;
  heightPx: number;
  pageIndex: number;
}

/** Generate a collision-resistant id (time-ordered + random suffix). */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The documents-directory folder all scans live under. */
export function scanRootDir(): Directory {
  return new Directory(Paths.document, SCAN_DIR_NAME);
}

/**
 * Compress one scanned page, downscaled so its long edge is at most
 * `MAX_LONG_EDGE_PX`, re-encoded as JPEG (plan §9). Returns the resulting
 * cache file plus its final pixel dimensions.
 */
async function preparePage(sourceUri: string): Promise<{
  uri: string;
  widthPx: number;
  heightPx: number;
}> {
  const context = ImageManipulator.manipulate(sourceUri);

  // First render reads the source dimensions — no transforms scheduled,
  // so this is effectively a decode pass.
  const source = await context.renderAsync();
  const srcLongEdge = Math.max(source.width, source.height);

  let image = source;
  if (srcLongEdge > MAX_LONG_EDGE_PX) {
    const scale = MAX_LONG_EDGE_PX / srcLongEdge;
    context.reset();
    context.resize({
      width: Math.round(source.width * scale),
      height: Math.round(source.height * scale),
    });
    image = await context.renderAsync();
  }

  const saved = await image.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, widthPx: saved.width, heightPx: saved.height };
}

/**
 * Persist a completed scanner session: one document, N ordered pages.
 * `pageUris` are the scanner's temp/cache file URIs (from `scanPages()`),
 * in capture order.
 *
 * On failure the partially-written document directory is removed so no
 * orphans accumulate; DB rows are only written after every file is in
 * place.
 */
export async function persistScanSession(
  db: SQLiteDatabase,
  pageUris: string[],
  title: string,
  kind: DocumentKind,
): Promise<ScanDocument> {
  const docId = generateId();
  const now = Date.now();

  const docDir = new Directory(scanRootDir(), docId);
  docDir.create({ intermediates: true, idempotent: true });

  try {
    const pages: PersistedPage[] = [];
    for (let index = 0; index < pageUris.length; index++) {
      const prepared = await preparePage(pageUris[index]);
      const dest = new File(docDir, `page-${index}.jpg`);
      new File(prepared.uri).move(dest);
      pages.push({
        id: generateId(),
        // Phase 1 reuses the stored image as its thumbnail; a dedicated
        // small thumbnail file arrives with the Library grid polish.
        imagePath: dest.uri,
        thumbPath: dest.uri,
        widthPx: prepared.widthPx,
        heightPx: prepared.heightPx,
        pageIndex: index,
      });
    }

    await db.runAsync(
      'INSERT INTO scan_documents (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [docId, title, kind, now, now],
    );
    for (const page of pages) {
      await db.runAsync(
        `INSERT INTO scan_pages (id, document_id, page_index, image_path, thumb_path, width_px, height_px)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          page.id,
          docId,
          page.pageIndex,
          page.imagePath,
          page.thumbPath,
          page.widthPx,
          page.heightPx,
        ],
      );
    }

    return { id: docId, title, kind, createdAt: now, updatedAt: now };
  } catch (e: unknown) {
    // Never leave a half-persisted document behind.
    if (docDir.exists) {
      docDir.delete();
    }
    throw e;
  }
}
