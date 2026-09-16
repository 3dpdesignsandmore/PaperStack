/**
 * Unit tests for filename-template expansion (plan §11 Phase 7).
 * Pure string logic — no React, no native, no mocking.
 */
import { describe, expect, it } from 'vitest';

import {
    expandFilenameTemplate,
    resolveExportFilename,
    todayStamp,
} from './filename';

/** Identity sanitizer — the unit under test is expansion, not sanitizing. */
const identity = (value: string) => value;

describe('expandFilenameTemplate', () => {
  const values = { title: 'Groceries Sept 14', date: '2026-09-16', pages: 3, n: 2 };

  it('expands every supported token', () => {
    expect(expandFilenameTemplate('{title} ({date})', values)).toBe(
      'Groceries Sept 14 (2026-09-16)',
    );
    expect(expandFilenameTemplate('{pages}p', values)).toBe('3p');
    expect(expandFilenameTemplate('sheet-{n}', values)).toBe('sheet-2');
  });

  it('expands repeated tokens', () => {
    expect(expandFilenameTemplate('{title}-{title}', values)).toBe(
      'Groceries Sept 14-Groceries Sept 14',
    );
  });

  it('leaves unknown placeholders verbatim — typos stay visible', () => {
    expect(expandFilenameTemplate('{tile}', values)).toBe('{title}'.replace('title', 'tile'));
  });

  it('handles a template with no tokens', () => {
    expect(expandFilenameTemplate('plain-name', values)).toBe('plain-name');
  });
});

describe('resolveExportFilename', () => {
  it('uses the plain title when the setting is unset', () => {
    expect(resolveExportFilename(null, 'Receipt', 1, 1, identity)).toBe('Receipt');
    expect(resolveExportFilename('   ', 'Receipt', 1, 1, identity)).toBe('Receipt');
  });

  it('runs the expanded template through the sanitizer', () => {
    // A sanitizer that strips spaces, as sanitizeTitle-family ones do.
    const noSpaces = (value: string) => value.replace(/\s+/g, '');
    expect(
      resolveExportFilename('{title} {date}', 'Tax Docs', 4, 1, noSpaces),
    ).toBe('TaxDocs2026-09-16');
  });

  it('falls back to the sanitized title when the template sanitizes to nothing', () => {
    // A sanitizer in the sanitizeTitle family: strips everything but
    // alphanumerics, dashes, underscores, spaces.
    const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9-_ ]+/g, '').trim();
    expect(resolveExportFilename('///', 'Receipt', 1, 1, sanitize)).toBe('Receipt');
  });

  it('falls back further to the sanitizer default when the title is also empty', () => {
    const sanitize = (value: string) => {
      const cleaned = value.replace(/[^a-zA-Z0-9-_ ]+/g, '').trim();
      return cleaned.length > 0 ? cleaned : 'document';
    };
    expect(resolveExportFilename('///', '', 1, 1, sanitize)).toBe('document');
  });
});

describe('todayStamp', () => {
  it('formats as zero-padded YYYY-MM-DD', () => {
    expect(todayStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayStamp(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
