// Throwaway probe: does Tr-3-wrapped text produce extractable invisible text?
// Approach A: drawText with Tr 3 pushed before, reset after
// Approach B: manual BT/ET operators, font registered via node.newFontDictionaryKey
import { PDFDocument, StandardFonts, TextRenderingMode, beginText, endText, moveText, setFontAndSize, setTextRenderingMode, showText } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

const lines = ['MERCHANT: ACME SUPPLY CO', 'TOTAL: 99.82'];

async function buildApproachA() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
  lines.forEach((line, i) => page.drawText(line, { x: 36, y: 720 - i * 14, size: 10, font }));
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
  return doc.save();
}

async function buildApproachB() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const key = page.node.newFontDictionaryKey('F');
  page.node.setFontDictionary(key, font.ref);
  const ops = [];
  lines.forEach((line, i) => {
    ops.push(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(key, 10),
      moveText(36, 720 - i * 14),
      showText(font.encodeText(line)),
      endText(),
    );
  });
  page.pushOperators(...ops);
  return doc.save();
}

for (const [name, bytes] of [['A: drawText+Tr wrapper', await buildApproachA()], ['B: manual operators', await buildApproachB()]]) {
  const parser = new PDFParse({ data: bytes });
  const result = await parser.getText();
  parser.destroy();
  const text = result.text ?? '';
  const ok = text.includes('ACME') && text.includes('99.82');
  console.log(`${name}: extraction=${ok ? 'PASS' : 'FAIL'}, text=${JSON.stringify(text.slice(0, 80))}`);
}

// Structural check: reload, decode page content streams, find `3 Tr`.
import { PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
for (const [name, bytes] of [['A', await buildApproachA()], ['B', await buildApproachB()]]) {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  let s = '';
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const stream = doc.context.lookup(contents.get(i), PDFRawStream);
      if (stream) s += latin1(decodePDFRawStream(stream).decode());
    }
  }
  console.log(`${name} content: hasTr3=${/\b3\s+Tr\b/.test(s)}, snippet=${JSON.stringify(s.slice(0, 220))}`);
}
function latin1(b) { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
