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
 * The walk can't see native libraries bundled inside other packages, so
 * MANUAL_ENTRIES below appends those by hand: today Google ML Kit (pulled
 * in by react-native-document-scanner-plugin on Android) and Apple's
 * Vision framework (iOS, OCR) — both Apache-2.0. They live in the script,
 * not a second file to keep in sync, so every regeneration includes them.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import licenseChecker from 'license-checker';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const outFile = resolve(projectRoot, 'src/lib/licenses.json');

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

const packages = await init(projectRoot, {
  production: true,
  // The full text is the point of the screen — never truncate.
  markdown: false,
  direct: false,
});

const entries = Object.entries(packages).map(([key, info]) => {
  // license-checker keys are "name@version"
  const at = key.lastIndexOf('@');
  return {
    name: key.slice(0, at),
    version: key.slice(at + 1),
    license: Array.isArray(info.licenses) ? info.licenses.join(' OR ') : info.licenses ?? 'UNKNOWN',
    publisher: info.publisher ?? '',
    licenseText: info.licenseText ?? '',
  };
});

// Sorted by name (then version, for duplicates) so the JSON and the
// rendered list are both stable across regenerations.
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const all = [...entries, ...MANUAL_ENTRIES];

await writeFile(outFile, JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Wrote ${all.length} license entries (${entries.length} walked, ${MANUAL_ENTRIES.length} manual) to ${outFile}`);
