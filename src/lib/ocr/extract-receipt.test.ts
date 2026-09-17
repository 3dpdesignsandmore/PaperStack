/**
 * Unit tests for the receipt-field extraction heuristics (plan §6 Job 2).
 * Pure function in, expectations out — the edge cases ARE the feature:
 * subtotal-vs-total ordering, currency formats, ambiguous dates, merchant
 * block sizing, no-matches-at-all.
 */
import { describe, expect, it } from 'vitest';

import { extractReceipt, toReceiptData } from './extract-receipt';
import type { OcrBlock, OcrResult } from '@/lib/model';

/** Build a block positioned by row (1 = top of page), sized by height. */
function block(text: string, row: number, height = 0.02): OcrBlock {
  return {
    text,
    x: 0.1,
    y: (row - 1) * 0.08,
    width: 0.8,
    height,
    confidence: 0.9,
  };
}

/** Build an OcrResult from lines of [text, row, height?]. */
function ocr(lines: [string, number, number?][]): OcrResult {
  return {
    id: 'ocr1',
    pageId: 'p1',
    fullText: lines.map(([text]) => text).join('\n'),
    blocks: lines.map(([text, row, height]) => block(text, row, height)),
  };
}

/** A clean, typical receipt the heuristics should nail. */
const CLEAN_RECEIPT = ocr([
  ['ACME SUPPLY CO', 1, 0.05],
  ['2026-09-16', 2, 0.02],
  ['Subtotal 41.50', 5, 0.02],
  ['Tax $3.32', 6, 0.02],
  ['TOTAL DUE $44.82', 7, 0.03],
]);

describe('extractReceipt — total', () => {
  it('picks the last total-labeled number over the subtotal', () => {
    const result = extractReceipt(CLEAN_RECEIPT);
    expect(result.total).toBe(44.82);
    expect(result.tax).toBe(3.32);
    expect(result.currency).toBe('$');
  });

  it('prefers the LAST labeled line (subtotal → tax → total order)', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['TOTAL 10.00', 3],
        ['TOTAL 25.00', 4],
      ]),
    );
    expect(result.total).toBe(25);
  });

  it('falls back to the largest number when no line is labeled', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['1.99', 3],
        ['22.50', 4],
        ['3.75', 5],
      ]),
    );
    expect(result.total).toBe(22.5);
  });

  it('matches "amount due" and "balance" labels too', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['Amount Due: €12,50', 3],
      ]),
    );
    expect(result.total).toBe(12.5);
    expect(result.currency).toBe('€');
  });

  it('handles comma-decimal currency (12,50 €)', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['TOTAL 12,50 €', 3],
      ]),
    );
    expect(result.total).toBe(12.5);
    expect(result.currency).toBe('€');
  });

  it('handles thousands separators ($1,234.56)', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['TOTAL $1,234.56', 3],
      ]),
    );
    expect(result.total).toBeCloseTo(1234.56);
  });

  it('returns null total when nothing looks like money', () => {
    const result = extractReceipt(ocr([['Store', 1, 0.05], ['thank you', 3]]));
    expect(result.total).toBeNull();
  });
});

describe('extractReceipt — date', () => {
  it('parses ISO dates in the top third', () => {
    expect(extractReceipt(CLEAN_RECEIPT).date).toBe(Date.UTC(2026, 8, 16));
  });

  it('prefers a top-third date over an earlier-listed lower one', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['09/16/2026', 2],
        ['Footer date 01/02/2025', 10],
      ]),
    );
    expect(result.date).toBe(Date.UTC(2026, 8, 16));
  });

  it('falls back to a date outside the top third', () => {
    const result = extractReceipt(
      ocr([
        ['Store', 1, 0.05],
        ['Service performed 16 Sep 2026', 8],
      ]),
    );
    expect(result.date).toBe(Date.UTC(2026, 8, 16));
  });

  it('parses US m/d/y', () => {
    const result = extractReceipt(ocr([['Store', 1, 0.05], ['09/16/2026', 2]]));
    expect(result.date).toBe(Date.UTC(2026, 8, 16));
  });

  it('parses written month formats', () => {
    const result = extractReceipt(ocr([['Store', 1, 0.05], ['Sep 16, 2026', 2]]));
    expect(result.date).toBe(Date.UTC(2026, 8, 16));
  });

  it('rejects impossible dates instead of rolling them over', () => {
    const result = extractReceipt(ocr([['Store', 1, 0.05], ['13/45/2026', 2]]));
    expect(result.date).toBeNull();
  });

  it('returns null when no date appears', () => {
    const result = extractReceipt(ocr([['Store', 1, 0.05], ['TOTAL $5.00', 3]]));
    expect(result.date).toBeNull();
  });
});

describe('extractReceipt — merchant', () => {
  it('picks the largest top-third block as the merchant', () => {
    expect(extractReceipt(CLEAN_RECEIPT).merchant).toBe('ACME SUPPLY CO');
  });

  it('prefers the larger block when a small one is higher up', () => {
    const result = extractReceipt(
      ocr([
        ['#1234', 1, 0.02],
        ['BIG MART', 2, 0.06],
        ['Subtotal $1.00', 5, 0.02],
      ]),
    );
    expect(result.merchant).toBe('BIG MART');
  });

  it('ignores total-labeled lines as merchant candidates', () => {
    const result = extractReceipt(
      ocr([
        ['TOTAL $5.00', 1, 0.05],
        ['Store', 2, 0.02],
      ]),
    );
    expect(result.merchant).toBe('Store');
  });

  it('returns null when the top third is empty', () => {
    const result = extractReceipt(ocr([['TOTAL $5.00', 6, 0.02]]));
    expect(result.merchant).toBeNull();
  });
});

describe('toReceiptData', () => {
  it('maps extraction onto the persisted shape with userEdited false', () => {
    const extracted = extractReceipt(CLEAN_RECEIPT);
    const data = toReceiptData('page-7', extracted);
    expect(data).toEqual({
      pageId: 'page-7',
      merchant: 'ACME SUPPLY CO',
      date: Date.UTC(2026, 8, 16),
      total: 44.82,
      tax: 3.32,
      currency: '$',
      confidence: 0,
      userEdited: false,
    });
  });
});
