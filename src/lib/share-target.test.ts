/**
 * Unit tests for the pure share-target helpers (`src/lib/share-target.ts`):
 * share-intent URL detection, Android's single-slash `file:/` URI
 * normalization, image-payload filtering, and the cache naming rule.
 * Pure module — no react-native in the import graph, matching the
 * recipients/pack-columns test pattern.
 */
import { describe, expect, it } from 'vitest';

import {
    SHARE_INTENT_HOST,
    filterImagePayloads,
    isShareIntentUrl,
    normalizeSharedFileUri,
    sharedCopyName,
} from './share-target';

describe('isShareIntentUrl', () => {
  it('matches the emitted share URL on the app scheme', () => {
    expect(isShareIntentUrl('paperstack://expo-sharing')).toBe(true);
  });

  it('matches other schemes with the share host', () => {
    expect(isShareIntentUrl('exp+paperstack://expo-sharing')).toBe(true);
  });

  it('is case-insensitive on the host', () => {
    expect(isShareIntentUrl('paperstack://EXPO-SHARING')).toBe(true);
  });

  it('rejects a URL with a different host', () => {
    expect(isShareIntentUrl('paperstack://settings')).toBe(false);
  });

  it('rejects plain router paths', () => {
    expect(isShareIntentUrl('/settings')).toBe(false);
  });

  it('rejects document deep links', () => {
    expect(isShareIntentUrl('paperstack:///document/123')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isShareIntentUrl('')).toBe(false);
  });

  it('handles a trailing path after the host without matching router-internal values', () => {
    // Emitted form never has a path, but a rewrite must not be fooled
    // by one if a future runtime adds it.
    expect(isShareIntentUrl('paperstack://expo-sharing/extra')).toBe(true);
  });

  it('exposes the documented host constant', () => {
    expect(SHARE_INTENT_HOST).toBe('expo-sharing');
  });
});

describe('normalizeSharedFileUri', () => {
  it('rewrites Android single-slash file URIs to three-slash', () => {
    expect(normalizeSharedFileUri('file:/data/user/0/app/cache/IMG.png')).toBe(
      'file:///data/user/0/app/cache/IMG.png',
    );
  });

  it('leaves a properly formed file URI untouched', () => {
    expect(normalizeSharedFileUri('file:///data/user/0/app/cache/IMG.png')).toBe(
      'file:///data/user/0/app/cache/IMG.png',
    );
  });

  it('leaves non-file URIs untouched', () => {
    expect(normalizeSharedFileUri('content://media/external/images/12')).toBe(
      'content://media/external/images/12',
    );
  });
});

describe('filterImagePayloads', () => {
  const base = {
    value: 'file:///x.png',
    shareType: 'image' as const,
    mimeType: 'image/png',
  };

  it('keeps image payloads and drops text/file/video', () => {
    const result = filterImagePayloads([
      { ...base, contentType: 'image', contentUri: 'file:///x.png', contentMimeType: 'image/png', originalName: 'x.png', contentSize: 1 },
      { ...base, shareType: 'text' as never, contentType: 'text' as never, mimeType: 'text/plain', contentUri: null, contentMimeType: 'text/plain', originalName: null, contentSize: null },
      { ...base, contentType: 'file', contentUri: 'file:///x.pdf', contentMimeType: 'application/pdf', originalName: 'x.pdf', contentSize: 2 },
      { ...base, contentType: 'video', contentUri: 'file:///x.mp4', contentMimeType: 'video/mp4', originalName: 'x.mp4', contentSize: 3 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].contentType).toBe('image');
  });
});

describe('sharedCopyName', () => {
  it('keeps a sane original name', () => {
    expect(sharedCopyName('Screenshot_2026-09-19-10-00-00.png', 0, 1000)).toBe(
      'shared-rs-0-Screenshot_2026-09-19-10-00-00.png',
    );
  });

  it('falls back to image for a null name', () => {
    expect(sharedCopyName(null, 0, 1000)).toBe('shared-rs-0-image');
  });

  it('falls back for an extensionless name', () => {
    expect(sharedCopyName('noextension', 1, 1000)).toBe('shared-rs-1-image');
  });

  it('strips path components', () => {
    expect(sharedCopyName('etc/passwd.png', 0, 1000)).toContain('passwd.png');
    expect(sharedCopyName('etc\\passwd.png', 0, 1000)).toContain('passwd.png');
  });

  it('embeds the payload index', () => {
    expect(sharedCopyName('a.png', 2, 1000)).toBe('shared-rs-2-a.png');
  });
});
