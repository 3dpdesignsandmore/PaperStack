/**
 * Generate src/lib/licenses.json — the bundled open-source license list
 * the /licenses screen renders. Run via `npm run licenses` whenever
 * dependencies change; the JSON is committed so neither EAS builds nor
 * the app depend on this script at build/run time.
 *
 * What lands in the file, per package:
 *   { name, version, license, publisher, licenseText }
 * sorted by name. Production dependencies only — dev tooling never
 * ships inside the app binary, so its licenses aren't owed to anyone
 * in-app.
 *
 * Same package at multiple versions dedupes into ONE row: the versions
 * join into "1.2.3, 1.3.0"; the license text is taken from the copy that
 * has one (they are licenses — the text does not meaningfully differ
 * between versions of the same package). This keeps the list a list of
 * SOFTWARE the app ships rather than a node_modules tree dump.
 *
 * license-checker reports the license file path (`licenseFile`) but does
 * NOT inline its contents — the text is read from disk here (556/577
 * packages ship one today; the rest get the screen's "see the package
 * source" fallback).
 *
 * The walk can't see native libraries bundled inside other packages, so
 * MANUAL_ENTRIES below appends those by hand: today Google ML Kit (pulled
 * in by react-native-document-scanner-plugin on Android) and Apple's
 * Vision framework (iOS, OCR). They live in the script, not a second file
 * to keep in sync, so every regeneration includes them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import licenseChecker from 'license-checker';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const outFile = resolve(projectRoot, 'src/lib/licenses.json');

/**
 * Cap a single entry's license text — the longest real-world license
 * files (Apache-2.0 with appendix, GPL family) run ~11k chars; anything
 * far past that is almost certainly a misdetected file (a CHANGELOG, a
 * bundled dist), and a scrollable row doesn't want it anyway.
 */
const MAX_TEXT_CHARS = 30_000;

/**
 * Native libraries reachable only through other packages — kept by hand
 * so they survive regeneration (see header comment).
 */
const MANUAL_ENTRIES = [
  {
    name: 'Google ML Kit Document Scanner',
    version: 'bundled (react-native-document-scanner-plugin)',
    license: 'Apache-2.0',
    publisher: 'Google LLC',
    licenseText:
      'ML Kit document scanning is distributed under the Apache License, Version 2.0.\n\n' +
      'OAuth 2.0 and ML Kit Terms of Service also apply to ML Kit APIs: https://developers.google.com/ml-kit/terms\n\n' +
      'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\n' +
      'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at\n\nhttp://www.apache.org/licenses/LICENSE-2.0\n\n' +
      'Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.',
  },
  {
    name: 'Apple Vision (OCR)',
    version: 'bundled (iOS system framework)',
    license: 'Apple SDK Agreement',
    publisher: 'Apple Inc.',
    licenseText:
      'The Vision framework is part of the iOS SDK and is used under the terms of the Apple SDK Agreement:\nhttps://developer.apple.com/support/terms/',
  },
];

/** Wrap license-checker's callback API in a promise. */
function init(pkgPath, options) {
  return new Promise((resolveInit, reject) => {
    licenseChecker.init({ start: pkgPath, ...options }, (err, packages) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolveInit(packages);
    });
  });
}

/** Read a package's license text from its license file, best-effort.
 * License files are UTF-8 text; a binary or oversized file means the
 * path was misdetected — return '' and let the UI show its fallback. */
async function readLicenseText(licenseFile) {
  if (licenseFile == null) {
    return '';
  }
  try {
    const raw = await readFile(licenseFile, 'utf8');
    return raw.length > MAX_TEXT_CHARS ? '' : raw.trim();
  } catch {
    return '';
  }
}

const packages = await init(projectRoot, {
  production: true,
  markdown: false,
  direct: false,
});

/** name → merged entry (same package, possibly several versions). */
const merged = new Map();
for (const [key, info] of Object.entries(packages)) {
  // license-checker keys are "name@version"
  const at = key.lastIndexOf('@');
  const name = key.slice(0, at);
  const version = key.slice(at + 1);
  const license = Array.isArray(info.licenses) ? info.licenses.join(' OR ') : info.licenses ?? 'UNKNOWN';
  const text = await readLicenseText(info.licenseFile);

  const existing = merged.get(name);
  if (existing == null) {
    merged.set(name, {
      name,
      versions: [version],
      license,
      publisher: info.publisher ?? '',
      licenseText: text,
    });
    continue;
  }
  // Same package again at another version: pile the version on, and
  // take this copy's text if there wasn't one (or this one is longer —
  // a bigger file usually means a fuller text, never noise; empty never
  // overwrites a good read).
  existing.versions.push(version);
  if (text.length > existing.licenseText.length) {
    existing.licenseText = text;
  }
}

const entries = [...merged.values()].map(({ name, versions, license, publisher, licenseText }) => ({
  name,
  version: versions.join(', '),
  license,
  publisher,
  licenseText,
}));

// Sorted by name so the JSON and the rendered list are both stable across
// regenerations.
entries.sort((a, b) => a.name.localeCompare(b.name));

const all = [...entries, ...MANUAL_ENTRIES];

await writeFile(outFile, JSON.stringify(all, null, 2) + '\n', 'utf8');
const withText = all.filter((e) => e.licenseText.length > 0).length;
console.log(
  `Wrote ${all.length} license entries ` +
    `(${entries.length} packages after dedup, ${MANUAL_ENTRIES.length} manual; ` +
    `${withText} carry full license text) to ${outFile}`,
);
