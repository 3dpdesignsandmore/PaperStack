/**
 * N-up composition export (plan §5): pack pages into multi-up Letter
 * pages via the column engine, then render the packed PDF and share it.
 *
 * Compositions are per-document: every page of the selected document
 * becomes an item. (Multi-document composition, if ever wanted, is a
 * matter of concatenating page lists before calling in.)
 *
 * This is PaperStack's signature feature: N receipts per page instead of
 * one per page, with a legibility guard surfaced before export.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

import {
    LETTER,
    packColumns,
    type PackedPage,
    type PackItem,
    type PackOptions,
} from '@/lib/layout/pack-columns';
import type { ScanDocument, ScanPage } from '@/lib/model';
import { sanitizeTitle } from '@/lib/pdf/export-document';

/** Options for building a packed composition PDF. */
export interface ComposeOptions {
  /** Column count (plan §5 N-per-page mode). */
  columns: number;
  /** Print hairline separators between packed items. */
  separators: boolean;
  /** Print titles under items. */
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

/** Per-page caption text: `title` (single page) or `title · pN`. */
function captionsFor(doc: ScanDocument, pages: ScanPage[]): Map<string, string> {
  const map = new Map<string, string>();
  pages.forEach((page, index) => {
    const suffix = pages.length > 1 ? ` · p${index + 1}` : '';
    map.set(page.id, `${doc.title}${suffix}`.slice(0, 40));
  });
  return map;
}

/**
 * Run the packer for one document's pages. Captions are NOT deducted from
 * printable height in v1 — items keep full packing room and captions may
 * overlap the tile below on very tight packs; revisit with §5 polish.
 */
export function composeLayout(
  doc: ScanDocument,
  pages: ScanPage[],
  columns: number,
): { pages: PackedPage[]; minScale: number } {
  const items: PackItem[] = pages.map((page) => ({
    id: page.id,
    naturalWidth: page.widthPx,
    naturalHeight: page.heightPx,
  }));

  const result = packColumns(items, { ...COMPOSE_GEO, columns });
  return { pages: result.pages, minScale: result.minScale };
}

/** Where packed-page images live, by item id. */
function imageUrisByItem(pages: ScanPage[]): Map<string, string> {
  return new Map(pages.map((page) => [page.id, page.imagePath]));
}

/**
 * Render the packed composition to PDF bytes: one Letter page per packed
 * page, items drawn at their computed rects, optional hairline separators
 * and caption text.
 */
export async function buildPackedPdf(
  doc: ScanDocument,
  pages: ScanPage[],
  options: ComposeOptions,
): Promise<Uint8Array> {
  const { pages: packedPages } = composeLayout(doc, pages, options.columns);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(doc.title);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const imageUris = imageUrisByItem(pages);
  const captions = captionsFor(doc, pages);

  for (const packedPage of packedPages) {
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
      const uri = imageUris.get(item.id);
      if (uri == null) {
        continue;
      }
      const jpgBytes = await new File(uri).bytes();
      const image = await pdfDoc.embedJpg(jpgBytes);
      pdfPage.drawImage(image, {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });

      if (options.captions) {
        const caption = captions.get(item.id);
        if (caption != null) {
          pdfPage.drawText(caption, {
            x: item.x,
            y: item.y - CAPTION_HEIGHT + 2,
            size: 8,
            font,
            color: rgb(0.35, 0.35, 0.35),
          });
        }
      }
    }
  }

  return pdfDoc.save();
}

/**
 * Export and share the packed composition for one document's pages.
 * Sequential by design (write then share); writes into
 * documents/exports/compositions/.
 */
export async function exportAndShareComposition(
  doc: ScanDocument,
  pages: ScanPage[],
  options: ComposeOptions,
  fileName: string,
): Promise<{ uri: string; sizeBytes: number; pageCount: number }> {
  if (pages.length === 0) {
    throw new Error('Cannot compose a document with no pages');
  }

  const bytes = await buildPackedPdf(doc, pages, options);

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
    dialogTitle: doc.title,
    UTI: 'com.adobe.pdf',
  });

  return {
    uri: file.uri,
    sizeBytes: file.size,
    pageCount: composeLayout(doc, pages, options.columns).pages.length,
  };
}
