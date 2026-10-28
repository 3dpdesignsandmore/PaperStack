/**
 * Pure helpers for the share-target import path (plan §8) — the "share
 * an image to PaperStack from the OS share sheet" flow. Deliberately
 * dependency-free: type-only imports, no React, no native modules, so
 * `share-target.test.ts` runs under Vitest like the other pure modules.
 *
 * Two boundaries live here:
 *
 * 1. URL detection — both platforms surface an incoming share to the
 *    router as `<app-scheme>://expo-sharing` (Android's lifecycle
 *    listener rewrites the SEND intent into an ACTION_VIEW on that URI;
 *    iOS's share extension opens it on the main app). The host is
 *    hardcoded in expo-sharing's native code on both sides, so one
 *    constant covers both. `+native-intent.ts` uses `isShareIntentUrl`
 *    to rewrite that URL onto the intake route; the payload itself
 *    travels out-of-band (the sharing module's singleton / app group),
 *    never inside the URL.
 *
 * 2. Payload normalization — the resolver's `contentUri` is a plain
 *    local file URI, but Android builds it with
 *    `java.io.File.toURI()`, which emits SINGLE-slash `file:/…`, while
 *    everything in the RN ecosystem (ImageManipulator, the new `File`
 *    class, scanner output URIs) expects `file:///…`.
 */
import type { ResolvedSharePayload, UriBasedResolvedSharePayload } from 'expo-sharing';

/**
 * Hostname both platforms emit when a share lands in the app. Stated
 * once here because it is a wire contract with expo-sharing's native
 * code (`ShareIntoUtils.kt` / `ShareIntoViewController.swift`), not a
 * value anyone should be tweaking per call site.
 */
export const SHARE_INTENT_HOST = 'expo-sharing';

/** Route that handles an incoming share (see `src/app/import-shared.tsx`). */
export const SHARE_INTAKE_PATH = '/import-shared';

/**
 * Whether a router path is the URL the OS emits for an incoming share.
 * Router-internal paths (`/settings`, `/document/123`) and malformed
 * input are not URLs and never match — this runs on every link the app
 * processes, so it stays cheap and can never throw.
 *
 * Written as plain string parsing rather than `new URL()` to avoid any
 * dependence on a WHATWG URL global on the JS runtime; the emitted form
 * is exactly `scheme://expo-sharing` (no port, query, or credentials).
 */
export function isShareIntentUrl(url: string): boolean {
  const schemeSplit = url.indexOf('://');
  if (schemeSplit < 0) {
    return false; // router path like /settings, not a URL
  }
  const host = url
    .slice(schemeSplit + 3)
    .split('/')[0]
    .toLowerCase();
  return host === SHARE_INTENT_HOST;
}

/**
 * Normalize a resolved payload's `contentUri` to the conventional
 * three-slash `file:///…` form. Android's resolver returns
 * `java.io.File.toURI().toString()` (`file:/data/…`); pass everything
 * through unchanged once it is already in `file:///` form or is a
 * non-file URI.
 */
export function normalizeSharedFileUri(uri: string): string {
  if (uri.startsWith('file:/') && !uri.startsWith('file:///')) {
    return `file:///${uri.slice('file:/'.length)}`;
  }
  return uri;
}

/**
 * Keep only the image payloads from a resolved share. The app
 * registers for images only (`app.json` plugin config), so a non-image
 * result means a share type slipped through the registration anyway —
 * the intake route explains rather than silently dropping it.
 */
export function filterImagePayloads(
  payloads: ResolvedSharePayload[],
): UriBasedResolvedSharePayload[] {
  return payloads.filter((payload): payload is UriBasedResolvedSharePayload => payload.contentType === 'image');
}

/**
 * Cache filename for one copied shared image. The original name is
 * kept when it is sane (the extension matters — the image pipeline
 * sniffs it); anything path-like, oversized, or extensionless falls
 * back to `image` rather than trusting it. `stamp` and `index` make
 * the name unique within and across ingests.
 */
export function sharedCopyName(originalName: string | null, index: number, stamp: number): string {
  const base = (originalName ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '');
  const usable =
    cleaned.length > 0 && cleaned.length <= 60 && cleaned.includes('.') ? cleaned : 'image';
  return `shared-${stamp.toString(36)}-${index}-${usable}`;
}
