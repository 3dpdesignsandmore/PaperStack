/**
 * Single-document PDF export (plan §11 Phase 3): turn one library
 * document's stored pages into a PDF — one Letter page per scan page,
 * image fit and centered inside the margins ("one per page" mode in plan
 * §5) — then write it to documents/exports/ and open the OS share sheet.
 *
 * Builds on the Phase 0 spike's verified facts:
 * - pdf-lib runs on-device (invisible-text spike, 2026-09-14)
 * - `File.write(Uint8Array)` + `Sharing.shareAsync` work on-device
 *   (spike Share PDF button, 2026-09-14)
 * - stored pages are already ≤2000px JPEGs, so embed sizes stay bounded
 *   (plan §5 downscale-before-embed happens at persist time)
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { fetchOcrResult } from '@/lib/db/ocr-queries';
import { getSetting } from '@/lib/db/queries';
import type { OcrBlock, ScanDocument, ScanPage } from '@/lib/model';
import { FILENAME_TEMPLATE_KEY, resolveExportFilename } from '@/lib/pdf/filename';
import { drawInvisibleText } from '@/lib/pdf/invisible-text';

/** US Letter, in points (plan §5). */
const PAGE_PTS = { width: 612, height: 792 };
/** Page margin, in points (plan §5). */
const MARGIN_PTS = 36;
/** Directory under documents/ where exported PDFs land. */
export const EXPORT_DIR_NAME = 'exports';

/** A completed export. */
export interface ExportedPdf {
  /** `file://` URI of the written PDF. */
  uri: string;
  /** Size of the written file in bytes. */
  sizeBytes: number;
  /** Number of PDF pages written. */
  pageCount: number;
}

/** The exports directory under documents/, per plan §9 (never Caches). */
function exportDir(): Directory {
  return new Directory(Paths.document, EXPORT_DIR_NAME);
}

/** Filesystem-safe name derived from a document title. */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned : 'document';
}

/**
 * Build PDF bytes for one document: a Letter page per scan page, image
 * scaled proportionally to fit inside the margins and centered — plus,
 * when OCR has run, an invisible searchable text layer over each image
 * (plan §6 Job 1). Pages arrive in reading order from {@link fetchPages}.
 */
export async function buildDocumentPdf(
  db: SQLiteDatabase | null,
  doc: ScanDocument,
  pages: ScanPage[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(doc.title);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const availableW = PAGE_PTS.width - 2 * MARGIN_PTS;
  const availableH = PAGE_PTS.height - 2 * MARGIN_PTS;

  for (const page of pages) {
    const jpgBytes = await new File(page.imagePath).bytes();
    const image = await pdfDoc.embedJpg(jpgBytes);

    const scale = Math.min(availableW / image.width, availableH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;

    const pdfPage = pdfDoc.addPage([PAGE_PTS.width, PAGE_PTS.height]);
    const drawX = (PAGE_PTS.width - drawW) / 2;
    const drawY = (PAGE_PTS.height - drawH) / 2;
    pdfPage.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });

    // Searchable layer: the page's OCR blocks (if any) mapped from
    // normalized image space into the drawn image's rect, then written
    // as invisible text. A missing result (OCR off / not yet run) is
    // not an error — the page just exports without a text layer.
    if (db != null) {
      const ocr = await fetchOcrResult(db, page.id);
      if (ocr != null) {
        for (const block of ocr.blocks) {
          drawInvisibleText(
            pdfPage,
            font,
            block.text,
            mapBlockToRect(block, { x: drawX, y: drawY, width: drawW, height: drawH }),
          );
        }
      }
    }
  }

  return pdfDoc.save();
}

/**
 * Map normalized OCR coordinates onto a fitted image rect. The single
 * place the y-axis flip happens — both export paths call this, so a fix
 * here fixes both.
 *
 * OCR block coordinates are normalized 0..1 measured DOWN from the image's
 * TOP edge. PDF user space measures UP from the page's BOTTOM edge, and
 * `imageRect.y` is the drawn image's bottom edge. The block's bottom edge
 * therefore sits `(1 - y - height)` of the image height above it.
 *
 * Getting this wrong mirrors the text layer vertically: the result still
 * selects and still copies, but returns the text from the opposite end of
 * the page — which is how it shipped until 2026-09-17, when a business
 * card selected at the top returned the two lines from its bottom.
 */
export function mapBlockToRect(
  block: Pick<OcrBlock, 'x' | 'y' | 'width' | 'height'>,
  imageRect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: imageRect.x + block.x * imageRect.width,
    y: imageRect.y + (1 - block.y - block.height) * imageRect.height,
    width: block.width * imageRect.width,
    height: block.height * imageRect.height,
  };
}

/**
 * Export a document as a PDF and return its URI. Does NOT open the OS
 * share sheet — the caller's send sheet owns the handoff (recipient
 * send, or the share-sheet button there). Opening the share sheet here
 * blocked the export promise until the dialog was dismissed, burying
 * the recipient sheet behind it.
 *
 * The file name expands through the user's filename template (Phase 7),
 * so with `{date}` in it the same document re-exported on different
 * days lands under different names — that is the template's point, not
 * an accumulation bug.
 */
export async function exportDocument(
  db: SQLiteDatabase,
  doc: ScanDocument,
  pages: ScanPage[],
): Promise<ExportedPdf> {
  if (pages.length === 0) {
    throw new Error('Cannot export a document with no pages');
  }

  const bytes = await buildDocumentPdf(db, doc, pages);

  const template = await getSetting(db, FILENAME_TEMPLATE_KEY);
  const fileName = resolveExportFilename(
    template,
    doc.title,
    pages.length,
    pages.length,
    sanitizeTitle,
  );

  const dir = exportDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, `${fileName}.pdf`);
  if (file.exists) {
    file.delete();
  }
  file.write(bytes);

  return { uri: file.uri, sizeBytes: file.size, pageCount: pages.length };
}
