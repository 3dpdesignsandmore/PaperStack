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
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';

import type { ScanDocument, ScanPage } from '@/lib/model';

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
 * scaled proportionally to fit inside the margins and centered. Pages
 * arrive in reading order from {@link fetchPages}.
 */
export async function buildDocumentPdf(
  doc: ScanDocument,
  pages: ScanPage[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(doc.title);

  const availableW = PAGE_PTS.width - 2 * MARGIN_PTS;
  const availableH = PAGE_PTS.height - 2 * MARGIN_PTS;

  for (const page of pages) {
    const jpgBytes = await new File(page.imagePath).bytes();
    const image = await pdfDoc.embedJpg(jpgBytes);

    const scale = Math.min(availableW / image.width, availableH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;

    const pdfPage = pdfDoc.addPage([PAGE_PTS.width, PAGE_PTS.height]);
    pdfPage.drawImage(image, {
      x: (PAGE_PTS.width - drawW) / 2,
      y: (PAGE_PTS.height - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return pdfDoc.save();
}

/**
 * Export a document as a PDF and share it. Re-exports of the same
 * document overwrite the same file (no accumulation), matching one
 * stable artifact per document title.
 */
export async function exportAndShareDocument(
  doc: ScanDocument,
  pages: ScanPage[],
): Promise<ExportedPdf> {
  if (pages.length === 0) {
    throw new Error('Cannot export a document with no pages');
  }

  const bytes = await buildDocumentPdf(doc, pages);

  const dir = exportDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, `${sanitizeTitle(doc.title)}.pdf`);
  if (file.exists) {
    file.delete();
  }
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: doc.title,
    UTI: 'com.adobe.pdf',
  });

  return { uri: file.uri, sizeBytes: file.size, pageCount: pages.length };
}
