/**
 * Export filename templates (plan §11 Phase 7): a user-editable pattern
 * stored in `app_settings` (`FILENAME_TEMPLATE_KEY`), expanded at export
 * time into the PDF's file name.
 *
 * Supported placeholders:
 *   {title} — the document's (or composition's) title
 *   {date}  — export date, YYYY-MM-DD
 *   {pages} — page count
 *   {n}    — ordinal: page count for single documents, sheet count for
 *            compositions
 *
 * Unknown placeholders are left verbatim — a typo like {tile} shows up in
 * the filename where the user can see it, rather than being silently
 * swallowed (fail-loudly over fallback chains, per repo convention).
 *
 * Pure string logic, no React/native deps, so it unit-tests in isolation.
 */

/** Setting key holding the filename template. */
export const FILENAME_TEMPLATE_KEY = 'filename_template';

/** The default template. */
export const DEFAULT_FILENAME_TEMPLATE = '{title}';

/** Tokens a template may contain, and how each expands. */
interface TemplateValues {
  title: string;
  date: string;
  pages: number;
  n: number;
}

/** Expand a template using explicit values. */
export function expandFilenameTemplate(template: string, values: TemplateValues): string {
  return template
    .replace(/\{title\}/g, values.title)
    .replace(/\{date\}/g, values.date)
    .replace(/\{pages\}/g, String(values.pages))
    .replace(/\{n\}/g, String(values.n));
}

/** Today as YYYY-MM-DD — the `{date}` value. */
export function todayStamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Build the values for one export: title plus the token values. */
export function templateValuesFor(
  title: string,
  pageCount: number,
  ordinal: number,
  now: Date = new Date(),
): TemplateValues {
  return {
    title,
    date: todayStamp(now),
    pages: pageCount,
    n: ordinal,
  };
}

/**
 * Resolve the filename for an export: expand the template, then sanitize
 * via the caller-provided sanitizer (the export modules own theirs).
 * Falls back to the plain title when the template is unset (`null`) or
 * expands to something that sanitizes away to nothing.
 */
export function resolveExportFilename(
  rawTemplate: string | null,
  title: string,
  pageCount: number,
  ordinal: number,
  sanitize: (value: string) => string,
  now: Date = new Date(),
): string {
  const template = rawTemplate != null && rawTemplate.trim().length > 0
    ? rawTemplate
    : DEFAULT_FILENAME_TEMPLATE;
  const values: TemplateValues = {
    title,
    date: todayStamp(now),
    pages: pageCount,
    n: ordinal,
  };
  const expanded = expandFilenameTemplate(template, values);
  const sanitized = sanitize(expanded);
  // Fail to the plain title rather than shipping "document.pdf" unaware —
  // a template typo shouldn't hide what's being exported.
  return sanitized.length > 0 ? sanitized : sanitize(title);
}
