/**
 * N-up column-packing layout engine (plan §5, §10).
 *
 * Pure, dependency-free geometry: no React, no native modules. Everything
 * here is deterministic and unit-testable (see pack-columns.test.ts); the
 * compose screen and PDF renderer consume its output.
 *
 * Model: a page is C vertical columns of printable width `columnWidth`.
 * Every item is scaled to the column width (masonry/shelf packing) and
 * stacked down its column until the next item would overflow, then packing
 * continues in the next column; when columns are exhausted a new page
 * begins. Unlike a grid, tall items consume column height continuously,
 * wasting far less paper.
 */

/** Whole-page geometry in points. */
export interface PageSize {
  width: number;
  height: number;
}

/** Packing configuration. */
export interface PackOptions {
  pageSize: PageSize;
  /** Margin on every side, in points. */
  margin: number;
  /** Horizontal gap between columns, in points. */
  gutter: number;
  /** Vertical gap between items, in points. */
  verticalGutter: number;
  /** Number of columns (plan §5: 2 / 3 / 4 / 6, or a computed auto-fit). */
  columns: number;
  /**
   * Cap on items per column. `1` with `columns: 1` is one item per
   * page — classic fit-to-page. Default is uncapped (fill the column).
   */
  maxPerColumn?: number;
  /**
   * Extra height reserved directly below each item, in points — room for a
   * caption drawn by a caller (this module has no PDF/text knowledge of its
   * own). Defaults to 0, so existing callers are unaffected. An oversize
   * item is clamped to leave this much room too, so its own caption still
   * fits below it.
   */
  captionSpace?: number;
}

/** One thing being packed: natural size in points. */
export interface PackItem {
  id: string;
  naturalWidth: number;
  naturalHeight: number;
}

/** One item's placement after packing a page. */
export interface PlacedItem {
  id: string;
  /** Bottom-left origin in PDF coordinates (points). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Physical scale vs natural size — the §5 legibility guard's input. */
  scale: number;
}

/** A packed page: the items placed on it, in placement order. */
export interface PackedPage {
  items: PlacedItem[];
}

/** Packing result. */
export interface PackResult {
  pages: PackedPage[];
  /** Smallest item scale anywhere in the job — drives the legibility guard. */
  minScale: number;
}

/**
 * Pack items into pages of C columns (plan §5 "N per page" mode; pass an
 * auto-fit column count computed by `fitColumns` for the default mode).
 *
 * Placement rules:
 * - an item's width is the column width, scaled proportionally;
 * - an item taller than the printable height is clamped to it (and then
 *   centered horizontally, since it is narrower than the column);
 * - items stack down a column separated by `verticalGutter`; the first
 *   item of a column starts at the top;
 * - when the next item would overflow the column, packing continues at
 *   the top of the next column; when no columns remain, the page is
 *   emitted and a new one begins.
 */
export function packColumns(
  items: PackItem[],
  options: PackOptions,
): PackResult {
  validateOptions(options);

  const { pageSize, margin, gutter, verticalGutter, columns, captionSpace = 0, maxPerColumn } = options;
  const printableH = pageSize.height - 2 * margin;
  const columnWidth = columnWidthOf(options);
  const topOfColumn = pageSize.height - margin;

  const pages: PackedPage[] = [];
  let page: PlacedItem[] = [];
  let column = 0;
  let usedH = 0; // height consumed in the current column (items + gutters)
  let itemsInColumn = 0;
  let minScale = Number.POSITIVE_INFINITY;

  for (const item of items) {
    let scale = columnWidth / item.naturalWidth;
    let width = columnWidth;
    let height = item.naturalHeight * scale;

    // Item taller than the printable area (less any reserved caption
    // space): clamp so its own caption still has room below it.
    if (height > printableH - captionSpace) {
      scale = (printableH - captionSpace) / item.naturalHeight;
      width = item.naturalWidth * scale;
      height = printableH - captionSpace;
    }

    let gutterBefore = usedH > 0 ? verticalGutter : 0;
    // The block an item occupies includes its reserved caption band, which
    // sits directly below the image itself.
    const block = height + captionSpace;
    // `maxPerColumn` cap: the column is "full" once the cap is reached —
    // same wrap logic as a height overflow, so the two share one code path.
    const columnFull =
      usedH + gutterBefore + block > printableH ||
      (maxPerColumn != null && itemsInColumn + 1 > maxPerColumn);
    if (columnFull) {
      // Move to the next column; if none remain, emit the page. The first
      // item of a new column starts at the top with no leading gutter —
      // `gutterBefore` was computed against the *previous* column's usedH
      // and must be reset here, or it both drops this item and every
      // column after the first by `verticalGutter` and over-counts usedH
      // by the same amount.
      column += 1;
      if (column >= columns) {
        pages.push({ items: page });
        page = [];
        column = 0;
      }
      usedH = 0;
      itemsInColumn = 0;
      gutterBefore = 0;
    }

    const itemTop = topOfColumn - usedH - gutterBefore;
    const columnX = margin + column * (columnWidth + gutter);
    const x = columnX + (columnWidth - width) / 2;

    page.push({ id: item.id, x, y: itemTop - height, width, height, scale });
    usedH += gutterBefore + block;
    itemsInColumn += 1;
    minScale = Math.min(minScale, scale);
  }

  if (page.length > 0) {
    pages.push({ items: page });
  }

  return {
    pages,
    minScale: items.length > 0 ? minScale : Number.POSITIVE_INFINITY,
  };
}

/** Printable width of one column under the given options. */
export function columnWidthOf(options: PackOptions): number {
  const printableW = options.pageSize.width - 2 * options.margin;
  return (printableW - (options.columns - 1) * options.gutter) / options.columns;
}

/**
 * Largest column count where every item keeps `scale` ≥ the given
 * threshold (plan §5 auto-fit mode; default threshold 0.60 = "fine").
 * Falls back to 1 when nothing satisfies the threshold.
 */
export function fitColumns(
  items: PackItem[],
  options: Omit<PackOptions, 'columns'>,
  threshold = 0.6,
): number {
  const maxColumns = 6;
  let best = 1;
  for (let c = maxColumns; c >= 1; c--) {
    const result = packColumns(items, { ...options, columns: c });
    if (result.minScale >= threshold) {
      best = c;
      break;
    }
  }
  return best;
}

/** Shared option validation with clear messages. */
function validateOptions(options: PackOptions): void {
  if (options.columns < 1) {
    throw new Error(`columns must be >= 1, got ${options.columns}`);
  }
  if (options.maxPerColumn != null && options.maxPerColumn < 1) {
    throw new Error(`maxPerColumn must be >= 1, got ${options.maxPerColumn}`);
  }
  if (options.margin < 0) {
    throw new Error(`margin must be >= 0, got ${options.margin}`);
  }
  if (options.gutter < 0) {
    throw new Error(`gutter must be >= 0, got ${options.gutter}`);
  }
  if (options.pageSize.width <= 0 || options.pageSize.height <= 0) {
    throw new Error(
      `pageSize must be positive, got ${options.pageSize.width}x${options.pageSize.height}`,
    );
  }
}

/** US Letter size in points (plan SS5). */
export const LETTER: PageSize = { width: 612, height: 792 };
/** A4 size in points. */
export const A4: PageSize = { width: 595, height: 842 };
