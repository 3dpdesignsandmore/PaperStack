/**
 * The invisible OCR text layer for exported PDFs (plan §6, Job 1): draw
 * every recognized block at its normalized position using text render
 * mode 3 (invisible) so the glyphs are selectable and searchable, but
 * never painted.
 *
 * Mechanics verified by the Phase 0 spike (2026-09-14, code since
 * removed — see git history and plan §6): raw operators via
 * `page.pushOperators` (NOT `drawText`, whose friendly helpers cannot set
 * render mode), and the font must be registered on the page's Resources
 * under a key from `page.node.newFontDictionaryKey` BEFORE `Tf` can
 * reference it.
 *
 * Coordinate mapping is the caller's job: blocks are normalized 0..1
 * top-left against the PAGE IMAGE, and images are drawn fitted and
 * centered (or packed into N-up rects). This module takes the mapped
 * rect + font + text and writes the operators.
 */
import {
    beginText,
    endText,
    moveText,
    PDFOperator,
    PDFPage,
    setFontAndSize,
    setTextRenderingMode,
    showText,
    TextRenderingMode,
} from 'pdf-lib';
import type { PDFFont, PDFHexString } from 'pdf-lib';

/** Font size floor — tiny PDF text can trip strict readers. */
const MIN_FONT_SIZE = 4;

/**
 * Write one invisible text block onto a page.
 *
 * `block` is the OCR text with its rect already mapped into PDF page
 * coordinates (points, bottom-left origin) by the caller — for a fitted
 * image that means scaling normalized block coordinates by the drawn
 * image's rect and flipping y (OCR origin is top-left; PDF's is
 * bottom-left).
 *
 * Multi-line text (the block's own embedded newlines) becomes one BT/ET
 * block with successive `Td` offsets — a fraction of first-line size
 * per line, which keeps every glyph inside (or at worst adjacent to)
 * the mapped rect.
 *
 * Invalid characters are dropped rather than encoded — Helvetica's
 * WinAnsi encoding rejects anything outside it, and a hard failure here
 * would cost the whole export for one glyph.
 */
export function drawInvisibleText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    rect: { x: number; y: number; width: number; height: number },
): void {
    const lines = text.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) {
        return;
    }

    const fontKey = page.node.newFontDictionaryKey('F');
    page.node.setFontDictionary(fontKey, font.ref);

    // Size the glyphs to the block's mapped height: the height split
    // across the block's own line count, i.e. a 3-line block gets a third
    // of its mapped height per line.
    const lineHeight = rect.height / lines.length;
    const fontSize = Math.max(MIN_FONT_SIZE, Math.min(lineHeight, 24));

    const sanitized = lines.map((line) => sanitizeForWinAnsi(line));

    // Once per string: throw away the whole line if nothing survives
    // sanitization — an empty Tj writes nothing anyway.
    const ops: PDFOperator[] = [];
    for (let index = 0; index < sanitized.length; index++) {
        const line = sanitized[index];
        if (line.length === 0) {
            continue;
        }
        const encodedLine: PDFHexString = font.encodeText(line);
        if (index === 0) {
            ops.push(
                beginText(),
                setTextRenderingMode(TextRenderingMode.Invisible),
                setFontAndSize(fontKey, fontSize),
                // Baseline sits one lineHeight up from the block's top
                // edge (y here is the TOP of the rect; flip inside).
                moveText(rect.x, rect.y + rect.height - fontSize),
                showText(encodedLine),
                endText(),
            );
        } else {
            ops.push(
                beginText(),
                setTextRenderingMode(TextRenderingMode.Invisible),
                setFontAndSize(fontKey, fontSize),
                moveText(rect.x, rect.y + rect.height - fontSize - index * lineHeight),
                showText(encodedLine),
                endText(),
            );
        }
    }
    page.pushOperators(...ops);
}

/**
 * Drop characters Helvetica's WinAnsi encoding cannot represent. The
 * common OCR noise cases (smart quotes, dashes, ellipsis) map to close
 * ASCII equivalents first; everything else exotic is simply removed.
 */
function sanitizeForWinAnsi(line: string): string {
    return line
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .split('')
    .filter((ch) => {
        const code = ch.charCodeAt(0);
        // WinAnsi covers Latin-1 plus a supplement; anything outside
        // that a single UTF-16 unit can express is dropped.
        return code >= 32 && code <= 255;
    })
    .join('');
}
