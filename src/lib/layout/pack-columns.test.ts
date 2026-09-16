/**
 * Unit tests for the N-up column-packing engine (plan §10).
 *
 * These lock down the geometry invariants the compose screen and PDF
 * renderer rely on. Pure module — no React, no native, no mocking.
 */
import { describe, expect, it } from 'vitest';

import {
    A4,
    fitColumns,
    LETTER,
    packColumns,
    type PackItem,
    type PackOptions,
} from './pack-columns';

/** Fixture page geometry: Letter, 36pt margins, 18pt gutters, 3 columns. */
const OPTS: PackOptions = {
  pageSize: LETTER,
  margin: 36,
  gutter: 18,
  verticalGutter: 12,
  columns: 3,
};
/** Printable height under OPTS: 792 - 72. */
const PRINTABLE_H = 720;
/** Column width under OPTS: (612 - 72 - 36) / 3 = 168. */
const COL_W = 168;

/** Item fixture: a typical 3"-wide receipt is 216pt natural width. */
function receipt(id: string, aspect = 4): PackItem {
  return { id, naturalWidth: 216, naturalHeight: 216 * aspect };
}

describe('packColumns', () => {
  it('packs the empty selection into zero pages', () => {
    const result = packColumns([], OPTS);
    expect(result.pages).toEqual([]);
    expect(result.minScale).toBe(Number.POSITIVE_INFINITY);
  });

  it('places a single item in column 0 at the top', () => {
    const result = packColumns([receipt('a')], OPTS);
    const [item] = result.pages[0].items;
    expect(result.pages).toHaveLength(1);
    expect(item.x).toBe(36);
    // Top at 792-36=756; height 216*4*(168/216)=672 → base at 84.
    expect(item.y).toBeCloseTo(84, 5);
    expect(item.width).toBeCloseTo(COL_W, 5);
    expect(item.height).toBeCloseTo(672, 5);
    expect(item.scale).toBeCloseTo(COL_W / 216, 5);
  });

  it('scales every item to the column width', () => {
    const wide = { id: 'w', naturalWidth: 1000, naturalHeight: 500 };
    const result = packColumns([wide], OPTS);
    expect(result.pages[0].items[0].width).toBeCloseTo(COL_W, 5);
    expect(result.pages[0].items[0].height).toBeCloseTo(
      500 * (COL_W / 1000),
      5,
    );
  });

  it('stacks items down a column until overflow, then moves to column 2', () => {
    // Two 336pt-high half-page items fill column 0; the third must move on.
    const items: PackItem[] = [
      { id: 'a', naturalWidth: 216, naturalHeight: 432 },
      { id: 'b', naturalWidth: 216, naturalHeight: 432 },
      { id: 'c', naturalWidth: 216, naturalHeight: 432 },
    ];
    const result = packColumns(items, OPTS);
    expect(result.pages).toHaveLength(1);
    const placed = result.pages[0].items;
    // a and b share column 0; c starts column 1.
    expect(placed[0].x).toBeCloseTo(36, 5);
    expect(placed[1].x).toBeCloseTo(36, 5);
    expect(placed[2].x).toBeCloseTo(36 + COL_W + 18, 5);
    // Vertical gutter separates a and b within the column.
    const gap = placed[0].y - (placed[1].y + placed[1].height);
    expect(gap).toBeCloseTo(12, 5);
  });

  it('starts a new page when all columns are full', () => {
    // Fill all three columns of page 1, then one more item.
    const tall = { naturalWidth: 216, naturalHeight: 864, id: '' };
    const items: PackItem[] = [
      { ...tall, id: 'a' },
      { ...tall, id: 'b' },
      { ...tall, id: 'c' },
      { ...tall, id: 'd' },
    ];
    const result = packColumns(items, OPTS);
    expect(result.pages).toHaveLength(2);
    const page1Ids = result.pages[0].items.map((i) => i.id);
    const page2Ids = result.pages[1].items.map((i) => i.id);
    expect(page1Ids).toEqual(['a', 'b', 'c']);
    expect(page2Ids).toEqual(['d']);
  });

  it('keeps items inside the printable area', () => {
    const items = [
      receipt('a', 8), // much taller than the page
      receipt('b', 0.5), // short and wide
      receipt('c', 2.5),
    ];
    const result = packColumns(items, OPTS);
    for (const page of result.pages) {
      for (const item of page.items) {
        expect(item.x).toBeGreaterThanOrEqual(36 - 1e-6);
        expect(item.y).toBeGreaterThanOrEqual(36 - 1e-6);
        expect(item.x + item.width).toBeLessThanOrEqual(612 - 36 + 1e-6);
        expect(item.y + item.height).toBeLessThanOrEqual(792 - 36 + 1e-6);
      }
    }
  });

  it('clamps a receipt taller than the printable height to exactly it', () => {
    // Natural aspect 6 at column width → height 1008 > 720 → clamped.
    const result = packColumns([receipt('a', 6)], OPTS);
    const [item] = result.pages[0].items;
    expect(item.height).toBeCloseTo(PRINTABLE_H, 5);
    // Clamped items keep aspect: width shrinks accordingly.
    expect(item.width).toBeCloseTo(
      216 * (PRINTABLE_H / (216 * 6)),
      5,
    );
    // Base sits at the bottom margin.
    expect(item.y).toBeCloseTo(36, 5);
  });

  it('reports minScale across the job (smallest item scale)', () => {
    const result = packColumns([receipt('a', 2), receipt('b', 12)], OPTS);
    // The aspect-12 receipt is clamped, producing PRINTABLE_H/(216*12).
    const clampedScale = PRINTABLE_H / (216 * 12);
    expect(result.minScale).toBeCloseTo(clampedScale, 5);
  });

  it('rejects invalid options', () => {
    expect(() =>
      packColumns([], { ...OPTS, columns: 0 }),
    ).toThrowError(/columns/);
    expect(() => packColumns([], { ...OPTS, margin: -1 })).toThrowError(
      /margin/,
    );
    expect(() =>
      packColumns([], { ...OPTS, pageSize: { width: 0, height: 100 } }),
    ).toThrowError(/pageSize/);
  });

  it('starts every column at the same top edge — a leading gutter must not carry across a column break', () => {
    // Same fixture as "stacks items down a column...": a and b share
    // column 0, c starts column 1.
    const items: PackItem[] = [
      { id: 'a', naturalWidth: 216, naturalHeight: 432 },
      { id: 'b', naturalWidth: 216, naturalHeight: 432 },
      { id: 'c', naturalWidth: 216, naturalHeight: 432 },
    ];
    const result = packColumns(items, OPTS);
    const placed = result.pages[0].items;
    const topOfColumn = LETTER.height - OPTS.margin; // 792 - 36 = 756
    // a is column 0's first item; c is column 1's first item. Before the
    // fix, c's leading gutterBefore was left over from column 0's overflow
    // check and pushed it — and every column after the first — down by
    // `verticalGutter`.
    expect(placed[0].y + placed[0].height).toBeCloseTo(topOfColumn, 5);
    expect(placed[2].y + placed[2].height).toBeCloseTo(topOfColumn, 5);
  });
});

describe('packColumns with captionSpace', () => {
  // Chosen so exactly 2 fit per column with no caption space reserved, but
  // only 1 fits once 14pt is reserved below each: 2*350+12=712 ≤ 720, while
  // 2*(350+14)+12=740 > 720.
  const items: PackItem[] = [
    { id: 'a', naturalWidth: 216, naturalHeight: 450 }, // height 450*(7/9)=350
    { id: 'b', naturalWidth: 216, naturalHeight: 450 },
  ];

  it('keeps every item at or above margin + captionSpace', () => {
    const varied = [receipt('a', 8), receipt('b', 0.5), receipt('c', 2.5)];
    const result = packColumns(varied, { ...OPTS, captionSpace: 14 });
    for (const page of result.pages) {
      for (const item of page.items) {
        expect(item.y).toBeGreaterThanOrEqual(36 + 14 - 1e-6);
      }
    }
  });

  it('fits fewer items per column than with no caption space', () => {
    const withCaptionSpace = packColumns(items, { ...OPTS, captionSpace: 14 });
    const without = packColumns(items, { ...OPTS, captionSpace: 0 });
    const column0Count = (result: ReturnType<typeof packColumns>) =>
      result.pages[0].items.filter((i) => i.x === 36).length;
    expect(column0Count(without)).toBe(2);
    expect(column0Count(withCaptionSpace)).toBe(1);
  });

  it('does not change minScale for unclamped items — width, not height, drives their scale', () => {
    const withCaptionSpace = packColumns(items, { ...OPTS, captionSpace: 14 });
    const without = packColumns(items, { ...OPTS, captionSpace: 0 });
    expect(withCaptionSpace.minScale).toBeCloseTo(without.minScale, 5);
  });
});

describe('fitColumns', () => {
  it('returns the largest column count meeting the threshold', () => {
    const base = {
      pageSize: LETTER,
      margin: 36,
      gutter: 18,
      verticalGutter: 12,
    };
    // 216pt-wide receipts: 3 columns → 168/216 = 0.78 ≥ 0.6;
    // 4 columns → 120/216 = 0.56 < 0.6. Auto-fit must pick 3.
    const items: PackItem[] = [receipt('a'), receipt('b')];
    expect(fitColumns(items, base)).toBe(3);
  });

  it('falls back to 1 column when only single-column packing qualifies', () => {
    const base = {
      pageSize: LETTER,
      margin: 36,
      gutter: 18,
      verticalGutter: 12,
    };
    // Very wide items: any multi-column layout scales them below 0.6.
    const wide: PackItem[] = [
      { id: 'a', naturalWidth: 4000, naturalHeight: 1000 },
    ];
    expect(fitColumns(wide, base, 0.6)).toBe(1);
  });
});

describe('page sizes', () => {
  it('exposes Letter and A4 in points', () => {
    expect(LETTER).toEqual({ width: 612, height: 792 });
    expect(A4).toEqual({ width: 595, height: 842 });
  });
});
