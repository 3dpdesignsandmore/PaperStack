/**
 * Spike: can pdf-lib draw an invisible text layer (PDF `Tr 3` — text render
 * mode 3) that survives serialization and is extractable/searchable in the
 * generated PDF?
 *
 * This is the highest-risk unknown in plan/PLAN.md §13 step 1 — the
 * searchable-PDF feature depends on it entirely. This spike is verified in
 * Node (scripts/verify-invisible-text.mjs) and is ready to run on device.
 *
 * The module is pure (no React, no native imports) so the exact same code
 * runs in both places. Verification was designed against real findings:
 *
 * 1. Structural — reload the saved bytes with pdf-lib, decode the page's
 *    content stream, and assert that (a) the `3 Tr` operator and (b) the
 *    hex-encoded words are present in the *serialized* content. This proves
 *    the layer reached the file, not just the in-memory model. Assertions
 *    run on decoded page content only, so a coincidental match in font data
 *    or metadata cannot produce a false pass.
 * 2. Behavioral — extract text with pdf-parse (an independent pdf.js-based
 *    library). If the words appear in extracted text, then selection, copy,
 *    and search will find them.
 *
 * Empirical note (2026-09-14, pdf-lib 1.17.1): both a drawText-based
 * wrapper and manual BT/ET operators were tested. The manual-operator
 * approach was chosen: it produces a cleaner content stream (placement via
 * Td, no reliance on the page cursor), and matches the approach plan §6
 * prescribes for OCR blocks.
 *
 * pdf-lib 1.17.1 uses its own seeded SimpleRNG, not crypto.getRandomValues,
 * so no `react-native-get-random-values` polyfill is needed — the plan's
 * §4 polyfill requirement is obsolete for pdf-lib.
 */
import {
  beginText,
  decodePDFRawStream,
  endText,
  grayscale,
  PDFArray,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  setFontAndSize,
  setTextRenderingMode,
  showText,
  moveText,
  TextRenderingMode,
} from 'pdf-lib';

/** Result shape for the invisible text layer spike. */
export interface InvisibleTextSpikeResult {
  /** True when every verification below passed. */
  passed: boolean;
  /** Bytes of the generated PDF — write to a file for manual inspection. */
  pdfBytes: Uint8Array;
  /** Human-readable PASS/FAIL summary. */
  summary: string;
  /** Per-check findings. */
  checks: {
    /** The `3 Tr` operator appears in the decoded page content stream. */
    contentStreamHasTr3: boolean;
    /** Every required word appears (hex-encoded) in the decoded content stream. */
    contentStreamHasWords: boolean;
    /** pdf-parse (independent extractor) found the words in the PDF text.
     *  Null when the check cannot run (React Native: pdf-parse is Node-only). */
    extractedTextMatches: boolean | null;
  };
}

/**
 * OCR-like fixture: multiple lines, mixed case, punctuation — the shapes a
 * real OCR layer (plan §6) would produce. `REQUIRED_WORDS` must be found by
 * every check below.
 */
const OcrLines = [
  'MERCHANT: ACME SUPPLY CO',
  'DATE: 2026-09-14',
  'SUBTOTAL: 41.50',
  'TAX: 3.32',
  'TOTAL: 44.82',
];
const REQUIRED_WORDS = ['ACME', '44.82'];

/** Font size for the invisible OCR layer text. */
const FONT_SIZE = 10;
/** Left margin for the invisible lines. */
const X_POSITION = 36;
/** Baseline of the first line, measured from the bottom of the page. */
const Y_START = 720;
/** Vertical stride between baselines. */
const LINE_STRIDE = 14;
/** US Letter, in points. */
const PAGE_SIZE = [612, 792] as const;

/**
 * Generate a one-page PDF containing an invisible (render mode 3) OCR-like
 * text layer, then verify it structurally and behaviorally. Runs as-is in
 * Node; on device the RN-specific file write happens in the screen.
 */
export async function runInvisibleTextSpike(): Promise<InvisibleTextSpikeResult> {
  // --- 1. Build --------------------------------------------------------
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([...PAGE_SIZE]);

  // Light-gray background so the exported page is easy to inspect manually;
  // the invisible text sits on top of it.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_SIZE[0],
    height: PAGE_SIZE[1],
    color: grayscale(0.95),
  });

  // The invisible layer. Raw operators per OCR line, exactly as sketched in
  // plan §6: Tr 3 + Td (placement) + Tf (font) + Tj (encoded text) in a
  // BT/ET block. The font must be referenced by its *page resource key*,
  // which newFontDictionaryKey derives — this is the subtlety.
  const fontKey = page.node.newFontDictionaryKey('F');
  page.node.setFontDictionary(fontKey, font.ref);

  const ops = [];
  OcrLines.forEach((line, i) => {
    ops.push(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(fontKey, FONT_SIZE),
      moveText(X_POSITION, Y_START - i * LINE_STRIDE),
      showText(font.encodeText(line)),
      endText(),
    );
  });
  page.pushOperators(...ops);

  const pdfBytes = await pdfDoc.save();

  // --- 2. Structural verification ---------------------------------------
  const reloaded = await PDFDocument.load(pdfBytes);
  const reloadedPage = reloaded.getPage(0);
  const contents = reloadedPage.node.Contents();
  let contentText = '';
  if (contents instanceof PDFArray) {
    for (let idx = 0, len = contents.size(); idx < len; idx++) {
      const stream = reloaded.context.lookup(contents.get(idx), PDFRawStream);
      if (stream !== undefined) {
        contentText += latin1(decodePDFRawStream(stream).decode());
      }
    }
  }

  const contentStreamHasTr3 = /\b3\s+Tr\b/.test(contentText);
  const contentStreamHasWords = REQUIRED_WORDS.every((word) =>
    contentText.includes(hexForWord(word)),
  );

  // --- 3. Behavioral verification ---------------------------------------
  // pdf-parse is Node-only (pdf.js-based). Dynamic import keeps this module
  // loadable on device; there the structural checks still run and the
  // dev-client screen shows the outcome.
  let extractedTextMatches: boolean | null = isReactNative() ? null : false;
  if (extractedTextMatches === false) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: pdfBytes });
      const result = await parser.getText();
      parser.destroy();
      extractedTextMatches = REQUIRED_WORDS.every((word) =>
        result.text.includes(word),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[spike] pdf-parse failed: ${message}`);
      extractedTextMatches = false;
    }
  }

  // null = check not runnable in this environment (device) — not a failure.
  // The Node harness verifies it; on device it was verified pre-build.
  const passed =
    contentStreamHasTr3 &&
    contentStreamHasWords &&
    extractedTextMatches !== false;
  const summary = passed
    ? extractedTextMatches === null
      ? 'PASS (on device): invisible text layer (Tr 3) written and verified structurally'
      : 'PASS: invisible text layer (Tr 3) written to file and independently extracted'
    : `FAIL: ${[
        !contentStreamHasTr3 && 'contentStreamHasTr3',
        !contentStreamHasWords && 'contentStreamHasWords',
        extractedTextMatches === false && 'extractedTextMatches',
      ]
        .filter(Boolean)
        .join(', ')}`;

  return {
    passed,
    pdfBytes,
    summary,
    checks: {
      contentStreamHasTr3,
      contentStreamHasWords,
      extractedTextMatches,
    },
  };
}

/** Latin-1 decode of content-stream bytes (avoids TextDecoder in Hermes). */
function latin1(bytes: Uint8Array): string {
  let s = '';
  // Chunked to avoid spread-arg limits on long inputs.
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(
      ...Array.from(bytes.subarray(i, i + 8192) as unknown as number[]),
    );
  }
  return s;
}

/**
 * Encode a word the way the producer did, for the content-stream check.
 * Helvetica (standard font) → WinAnsi encoding → one byte per char, hex
 * uppercase with no delimiters (words sit inside one <...> string per line
 * in the content stream, so brackets would never match).
 */
function hexForWord(word: string): string {
  return Array.from(word)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

/** Is this running inside React Native (Hermes) rather than Node? */
function isReactNative(): boolean {
  // `navigator.product` was removed from modern React Native; Hermes sets
  // HermesInternal. Node defines neither.
  return typeof globalThis.HermesInternal === 'object';
}
