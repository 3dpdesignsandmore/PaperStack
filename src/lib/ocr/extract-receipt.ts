/**
 * Receipt-field extraction heuristics (plan §6, Job 2): raw OCR in,
 * best-guess merchant/date/total out. Pure function — no React, no DB,
 * no engine — so every edge case is unit-testable and the same code runs
 * in Vitest and on device.
 *
 * The heuristics, per the plan:
 * - **Total** — the LAST currency-formatted number on a line that also
 *   contains total / amount due / balance (receipts show subtotal, tax,
 *   then total; the last one is the one owed). Falls back to the largest
 *   currency number anywhere when no labeled line exists.
 * - **Date** — common formats; matches in the top third of the page win
 *   (receipt headers), otherwise the first match anywhere.
 * - **Merchant** — the largest-text block in the top third; block height
 *   is the size signal (normalized, so it compares fairly across pages).
 *
 * Every value is a guess for the user to correct (§6: "design the
 * receipt detail screen around correction, not display") — expect
 * 70–85% on clean receipts and treat that as success.
 */
import type { OcrResult, ReceiptData } from '@/lib/model';

/** Extracted fields plus how much to trust them. */
export interface ExtractedReceipt {
  merchant: string | null;
  date: number | null;
  total: number | null;
  tax: number | null;
  currency: string;
  confidence: number;
}

/** Lines containing one of these label the total-to-pay line. */
const TOTAL_LABEL = /total|amount\s+due|balance/i;
/** Lines containing this label the tax line. */
const TAX_LABEL = /\btax\b/i;
/** Fraction of the page height counted as the "top" for date/merchant. */
const TOP_THIRD = 1 / 3;

/** Currency-prefixed ($1,234.56) or -suffixed (1.234,56 €, 12,50 £). */
const CURRENCY_PREFIX = /([$€£])\s*([0-9][0-9.,]*)/;
const CURRENCY_SUFFIX = /([0-9][0-9.,]*)\s*([$€£])/;

/** Date formats, tried in order; each captures y/m/d or m/d/y. */
const DATE_PATTERNS: RegExp[] = [
  // 2026-09-16 (ISO)
  /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/,
  // 09/16/2026, 9-16-26 (US)
  /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/,
  // 16 Sep 2026 / Sep 16, 2026
  /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i,
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
];
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** A parsed candidate, carrying the numeric value for max-selection. */
interface MoneyMatch {
  value: number;
  currency: string;
  /** The OCR block's line index — the LAST total-labeled line wins. */
  lineIndex: number;
}

/** Parse "1,234.56" / "12,50" / "1.234,56"-style digit runs to a number. */
function parseAmount(raw: string): number {
  // Heuristic decimal separator: the LAST of ',' or '.' that is followed
  // by exactly two digits at the end.
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let decimal: number;
  let whole: string;
  if (lastComma > lastDot) {
    decimal = lastComma;
    whole = raw.slice(0, lastComma);
  } else {
    decimal = lastDot;
    whole = raw.slice(0, lastDot);
  }
  const decimalPart = raw.slice(decimal + 1);
  const wholeDigits = whole.replace(/[.,]/g, '');
  if (decimalPart.length === 0) {
    return Number(wholeDigits);
  }
  return Number(`${wholeDigits}.${decimalPart}`);
}

/** Collect currency-formatted numbers on one text line. Bare numbers
 * with a decimal part (25.00, 12,50) count too — plenty of receipts
 * print the total with no symbol; they carry an empty currency. */
function findMoney(line: string): { value: number; currency: string }[] {
  const found: { value: number; currency: string }[] = [];
  const prefix = CURRENCY_PREFIX.exec(line);
  if (prefix != null) {
    found.push({ value: parseAmount(prefix[2]), currency: prefix[1] });
  }
  const suffix = CURRENCY_SUFFIX.exec(line);
  if (suffix != null) {
    found.push({ value: parseAmount(suffix[1]), currency: suffix[2] });
  }
  if (found.length === 0) {
    const bare = /(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?![\d.,%])/.exec(line);
    if (bare != null) {
      found.push({ value: parseAmount(bare[1]), currency: '' });
    }
  }
  return found;
}

/** Build a UTC-midnight epoch from date parts (ambiguous years are
 * two-digit years: 26 → 2026). */
function dateToEpoch(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const fullYear = year < 100 ? 2000 + year : year;
  const ms = Date.UTC(fullYear, month - 1, day);
  const date = new Date(ms);
  // Round-trip check — Date.UTC silently rolls invalid dates over.
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

/**
 * Extract best-guess receipt fields from a page's OCR result. Pure: same
 * input, same output, no clock reads (ambiguous years resolve against a
 * fixed 2000 pivot, not "now").
 */
export function extractReceipt(result: OcrResult): ExtractedReceipt {
  const lines = result.blocks.map((block) => block.text);

  // --- Total & tax -------------------------------------------------------
  let total: number | null = null;
  let tax: number | null = null;
  let currency = '';
  let labeledTotal: MoneyMatch | null = null;
  const unlabeled: MoneyMatch[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const money = findMoney(line);
    if (money.length === 0) {
      continue;
    }
    const first = money[0];
    if (TOTAL_LABEL.test(line)) {
      // Last labeled line wins (subtotal → tax → total order).
      labeledTotal = { ...first, lineIndex: index };
    } else {
      unlabeled.push({ ...first, lineIndex: index });
    }
    if (tax == null && TAX_LABEL.test(line)) {
      tax = first.value;
      if (currency === '') {
        currency = first.currency;
      }
    }
  }

  if (labeledTotal != null) {
    total = labeledTotal.value;
  } else {
    const largest = unlabeled.reduce<MoneyMatch | null>(
      (best, current) => (best == null || current.value > best.value ? current : best),
      null,
    );
    total = largest == null ? null : largest.value;
  }
  if (currency === '') {
    const anyMoney: MoneyMatch | null =
      unlabeled.length > 0 ? unlabeled[0] : labeledTotal;
    if (anyMoney != null) {
      currency = anyMoney.currency;
    }
  }

  // --- Date ----------------------------------------------------------------
  let date: number | null = null;
  outer: for (const window of ['top', 'any'] as const) {
    for (let index = 0; index < result.blocks.length; index++) {
      const block = result.blocks[index];
      const inTop = block.y < TOP_THIRD;
      if (window === 'top' && !inTop) {
        continue;
      }
      const parsed = parseDate(block.text);
      if (parsed != null) {
        date = parsed;
        break outer;
      }
    }
  }

  // --- Merchant ------------------------------------------------------------
  // Largest normalized block height in the top third; ties broken by
  // higher position (smaller y).
  let merchant: string | null = null;
  let bestHeight = 0;
  for (const block of result.blocks) {
    if (block.y > TOP_THIRD) {
      continue;
    }
    const text = block.text.trim();
    if (text.length === 0 || TOTAL_LABEL.test(text)) {
      continue;
    }
    if (block.height > bestHeight) {
      bestHeight = block.height;
      merchant = text;
    }
  }

  return { merchant, date, total, tax, currency, confidence: 0 };
}

/** Try every date pattern against one text block. */
function parseDate(text: string): number | null {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match == null) {
      continue;
    }
    // Pattern 3/4 use month names in different group orders; 1/2 are
    // numeric y-first / m-first.
    if (pattern === DATE_PATTERNS[2]) {
      const month = MONTHS[match[2].toLowerCase()];
      return month == null ? null : dateToEpoch(Number(match[3]), month, Number(match[1]));
    }
    if (pattern === DATE_PATTERNS[3]) {
      const month = MONTHS[match[1].toLowerCase()];
      return month == null ? null : dateToEpoch(Number(match[3]), month, Number(match[2]));
    }
    const a = Number(match[1]);
    const b = Number(match[2]);
    const c = Number(match[3]);
    if (match[1].length === 4) {
      return dateToEpoch(a, b, c); // ISO: y m d
    }
    // US: m d y — reject physically impossible readings before committing.
    const asUs = dateToEpoch(c, a, b);
    if (asUs != null) {
      return asUs;
    }
    return dateToEpoch(c, b, a); // fallback: maybe it was d m y
  }
  return null;
}

/**
 * Map an {@link ExtractedReceipt} onto the persisted `ReceiptData` shape
 * for a page — the extraction itself stays storage-free.
 */
export function toReceiptData(pageId: string, extracted: ExtractedReceipt): ReceiptData {
  return {
    pageId,
    merchant: extracted.merchant,
    date: extracted.date,
    total: extracted.total,
    tax: extracted.tax,
    currency: extracted.currency,
    confidence: extracted.confidence,
    userEdited: false,
  };
}
