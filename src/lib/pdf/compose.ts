/**
 * N-up composition export (plan §5): stack pages into multi-up Letter
 * pages via the column engine, then render the stacked PDF and share it.
 *
 * Stacks combine pages from one or more documents. `pages` may come from a
 * single document (the document detail screen's Export → Combine option)
 * or from several (Library's multi-select Combine) — every page carries
 * its own `documentId`, which is all this module needs to caption each
 * item with its own source document's title rather than one shared title.
 *
 * This is PaperStack's signature feature: N documents per page instead of
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

/** Options for building a stacked composition PDF. */
export interface ComposeOptions {
  /** Column count (plan §5 N-per-page mode). */
  columns: number;
  /** Print hairline separators between stacked items. */
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

/**
 * Caption height reserve, in points — exported so callers computing a
 * layout for preview (compose.tsx) use the exact same value the export
 * path reserves, and the two never drift apart.
 */
export const CAPTION_HEIGHT = 14;

/**
 * A display title for the whole stack — the PDF's own title metadata, the
 * share-sheet dialog title, and (by the caller) the exported file's name.
 * One canonical place for this so all three never say different things.
 */
export function combinedTitle(documents: ScanDocument[]): string {
  if (documents.length === 1) {
    return documents[0].title;
  }
  return `${documents.length} documents combined`;
}

/**
 * Per-item caption text: `title` (the page's own source document has just
 * one included page) or `title · pN` (more than one, numbered by that
 * page's real position within its own document — not its position in the
 * flattened, possibly multi-document `pages` array).
 */
function captionsFor(documents: ScanDocument[], pages: ScanPage[]): Map<string, string> {
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]));
  const pageCountByDocument = new Map<string, number>();
  for (const page of pages) {
    pageCountByDocument.set(page.documentId, (pageCountByDocument.get(page.documentId) ?? 0) + 1);
  }

  const map = new Map<string, string>();
  for (const page of pages) {
    const title = documentsById.get(page.documentId)?.title ?? 'Untitled';
    const pagesInThisDocument = pageCountByDocument.get(page.documentId) ?? 1;
    const suffix = pagesInThisDocument > 1 ? ` · p${page.pageIndex + 1}` : '';
    map.set(page.id, `${title}${suffix}`.slice(0, 40));
  }
  return map;
}

/** Convert pages to the packer's natural-size item shape. */
export function pagesToPackItems(pages: ScanPage[]): PackItem[] {
  return pages.map((page) => ({
    id: page.id,
    naturalWidth: page.widthPx,
    naturalHeight: page.heightPx,
  }));
}

/**
 * Run the packer over a set of pages (one document's or several, combined).
 * `captions` must match whatever will actually be exported — reserving
 * `CAPTION_HEIGHT` per item stacks fewer per column, so a caller computing
 * this for a live preview needs the same flag the export path uses, or the
 * preview will show more items per column than the PDF actually gets.
 */
export function composeLayout(
  pages: ScanPage[],
  columns: number,
  captions: boolean,
): { pages: PackedPage[]; minScale: number } {
  const captionSpace = captions ? CAPTION_HEIGHT : 0;
  const result = packColumns(pagesToPackItems(pages), { ...COMPOSE_GEO, columns, captionSpace });
  return { pages: result.pages, minScale: result.minScale };
}

/** Where each page's image lives on disk, by item id. */
function imageUrisByItem(pages: ScanPage[]): Map<string, string> {
  return new Map(pages.map((page) => [page.id, page.imagePath]));
}

/**
 * Render the stacked composition to PDF bytes: one Letter page per stacked
 * page, items drawn at their computed rects, optional hairline separators
 * and per-item caption text.
 */
export async function buildStackedPdf(
  documents: ScanDocument[],
  pages: ScanPage[],
  options: ComposeOptions,
): Promise<Uint8Array> {
  const { pages: stackedPages } = composeLayout(pages, options.columns, options.captions);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(combinedTitle(documents));
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const imageUris = imageUrisByItem(pages);
  const captions = captionsFor(documents, pages);

  for (const stackedPage of stackedPages) {
    const pdfPage = pdfDoc.addPage([LETTER.width, LETTER.height]);

    if (options.separators) {
      for (const item of stackedPage.items) {
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

    for (const item of stackedPage.items) {
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

      // The packer reserves `CAPTION_HEIGHT` below every item when
      // `captions` is on (see `composeLayout`), so every item has room.
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
 * Export and share the stacked composition for a set of documents' pages
 * (one document, or several combined). Sequential by design (write then
 * share); writes into documents/exports/compositions/.
 */
export async function exportAndShareComposition(
  documents: ScanDocument[],
  pages: ScanPage[],
  options: ComposeOptions,
  fileName: string,
): Promise<{ uri: string; sizeBytes: number; pageCount: number }> {
  if (pages.length === 0) {
    throw new Error('Cannot stack a selection with no pages');
  }

  const bytes = await buildStackedPdf(documents, pages, options);

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
    dialogTitle: combinedTitle(documents),
    UTI: 'com.adobe.pdf',
  });

  return {
    uri: file.uri,
    sizeBytes: file.size,
    pageCount: composeLayout(pages, options.columns, options.captions).pages.length,
  };
}
