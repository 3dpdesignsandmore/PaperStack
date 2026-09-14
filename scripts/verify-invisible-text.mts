// Node harness for the pdf-lib invisible-text spike (plan §13 step 1).
// Runs the same pure module the app will run, then verifies it printed
// PASS and wrote a PDF for manual inspection.
//
// Usage: npx tsx scripts/verify-invisible-text.mts
import { mkdirSync, writeFileSync } from 'node:fs';

import { runInvisibleTextSpike } from '../src/lib/spikes/invisible-text';

async function main() {
  const result = await runInvisibleTextSpike();

  console.log(`passed:        ${result.passed}`);
  console.log(`summary:       ${result.summary}`);
  console.log(`checks:`);
  console.log(`  contentStreamHasTr3:   ${result.checks.contentStreamHasTr3}`);
  console.log(`  contentStreamHasWords: ${result.checks.contentStreamHasWords}`);
  console.log(`  extractedTextMatches:  ${result.checks.extractedTextMatches}`);;

  // Write the artifact for manual inspection (open in any PDF viewer —
  // the text should be invisible but selectable/searchable).
  mkdirSync('spike-artifacts', { recursive: true });
  writeFileSync(
    'spike-artifacts/invisible-text.pdf',
    result.pdfBytes as unknown as Uint8Array<ArrayBuffer>,
  );
  console.log('artifact:      spike-artifacts/invisible-text.pdf');

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
