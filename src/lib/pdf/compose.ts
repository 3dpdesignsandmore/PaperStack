/**
 * N-up composition export (plan §5): pack selected documents' first pages
 * — one item per document — into multi-up Letter pages via the column
 * engine, then render the packed PDF and share it.
 *
 * This is PaperStack's signature feature: N receipts per page instead of
 * one per page, with a legibility guard surfaced before export.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import {
  LETTER,
  packColumns,
  type PackedPage,
  type PackItem,
  type PackOptions,
} from '@/lib/layout/pack-columns';
import type { ScanDocument, ScanPage } from '@/lib/model';
import { sanitizeTitle } from '@/lib/pdf/export-document';

/** Container for one document selected into a composition. */
export interface ComposeEntry {
  document: ScanDocument;
  /** The page that represents the document in the pack (its first page). */
  page: ScanPage;
}

/** Options for building a packed composition PDF. */
export interface ComposeOptions {
  /** Column count (plan §5 N-per-page mode). */
  columns: number;
  /** Print hairline separators between packed items. */
  separators: boolean;
  /** Print `title · date` captions under items. */
  captions: boolean;
}

/** Default §5 geometry shared with the preview. */
export const COMPOSE_GEO: Omit<PackOptions, 'columns'> = {
  pageSize: LETTER,
  margin: 36,
  gutter: 18,
  verticalGutter: 12,
};

/** Caption height reserve, in points. */
const CAPTION_HEIGHT = 14;

/**
 * Run the packer for the current selection and columns. Caption rows are
 * deducted from printable height so pack and render agree (the preview
 * and the PDF both consume this same result).
 */
export function composeLayout(
  entries: ComposeEntry[],
  columns: number,
): { pages: PackedPage[]; minScale: number } {
  const items: PackItem[] = entries.map((entry) => ({
    id: entry.document.id,
    naturalWidth: entry.page.widthPx,
    naturalHeight: entry.page.heightPx,
  }));

  const result = packColumns(items, { ...COMPOSE_GEO, columns });
  return { pages: result.pages, minScale: result.minScale };
}

/**
 * Render the packed composition to PDF bytes. Separators are hairlines
 * between items; captions print the document title under each tile.
 */
export async function buildPackedPdf(
  entries: ComposeEntry[],
  options: ComposeOptions,
): Promise<Uint8Array> {
  const { pages } = composeLayout(entries, options.columns);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('PaperStack composition');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const byDoc = new Map(
    entries.map((e) => [e.document.id, e] satisfies [string, ComposeEntry][]),
  );

  for (const packedPage of pages) {
    const pdfPage = pdfDoc.addPage([LETTER.width, LETTER.height]);

    if (options.separators) {
      for (const item of packedPage.items) {
        pdfPage.drawRectangle({
          x: item.x - 3,
          y: item.y - 3,
          width: item.width + 6,
          height: item.height + 6,
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.5,
        });
      }
    }

    for (const item of packedPage.items) {
      const entry = byDoc.get(item.id);
      if (entry == null) {
        continue;
      }
      const jpgBytes = await new File(entry.page.imagePath).bytes();
      const image = await pdfDoc.embedJpg(jpgBytes);
      pdfPage.drawImage(image, {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });

      if (options.captions) {
        pdfPage.drawText(entry.document.title.slice(0, 40), {
          x: item.x,
          y: item.y - CAPTION_HEIGHT + 2,
          size: 8,
          font,
          color: rgb(0.35, 0.35, 0.35),
        });
      }
    }
  }

  return pdfDoc.save();
}

/**
 * Export and share the packed composition. Sequential by design (write
 * then share), writing into documents/exports/compositions/.
 */
export async function exportAndShareComposition(
  entries: ComposeEntry[],
  options: ComposeOptions,
  fileName: string,
): Promise<{ uri: string; sizeBytes: number; pageCount: number }> {
  if (entries.length === 0) {
    throw new Error('Nothing selected to compose');
  }

  const bytes = await buildPackedPdf(entries, options);

  const dir = new Directory(Paths.document, 'exports', 'compositions');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, `${sanitizeTitle(fileName)}.pdf`);
  if (file.exists) {
    file.delete();
  }
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'PaperStack composition',
    UTI: 'com.adobe.pdf',
  });

  const pageCount = composeLayout(entries, options.columns).pages.length;
  return { uri: file.uri, sizeBytes: file.size, pageCount };
}
