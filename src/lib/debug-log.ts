/**
 * On-device diagnostic log (plan §9 "no analytics" carve-out): a bounded,
 * ring-buffer log of app events and errors that a user can export as a
 * plain text file and send to support — with no identifiers beyond what
 * is strictly needed to diagnose (timestamps, app version, OS, error
 * text). Content of scanned documents is never logged.
 *
 * Not telemetry: nothing is sent anywhere automatically; the user chooses
 * to export and share the file.
 *
 * Why not console.log capture: RN console output goes to Metro in dev
 * and to system logcat on Android — neither survives into something a
 * user can attach to an email from the release build. A small in-memory
 * buffer with an explicit export path is the reliable route.
 *
 * Bound: MAX_ENTRIES, oldest dropped first. Large enough to cover a
 * session of use, small enough that the export is still readable.
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Maximum lines retained; oldest dropped first. */
export const MAX_ENTRIES = 500;

/** Severity of one log line. */
export type LogLevel = 'info' | 'error';

/** One buffered log line. */
export interface LogEntry {
  /** Epoch ms. */
  at: number;
  level: LogLevel;
  /** Short module/area tag, e.g. 'export', 'db', 'capture'. */
  area: string;
  message: string;
}

/** The in-memory buffer, module-scoped. Newest at the end. */
const buffer: LogEntry[] = [];

/** Append one entry, trimming the buffer to its bound. */
export function log(level: LogLevel, area: string, message: string): void {
  buffer.push({ at: Date.now(), level, area, message });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

/** Convenience wrappers. */
export function logInfo(area: string, message: string): void {
  log('info', area, message);
}

export function logError(area: string, message: string): void {
  log('error', area, message);
}

/**
 * Log a thrown value with the repo's `catch (e: unknown)` narrowing —
 * the single place that turns an unknown-typed catch into log text.
 */
export function logThrown(area: string, e: unknown): void {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  log('error', area, message);
}

/** Read a copy of the current buffer, oldest first. */
export function entries(): readonly LogEntry[] {
  return buffer;
}

/** Reset the buffer (tests; a future "clear log" Settings row). */
export function clear(): void {
  buffer.length = 0;
}

/** Format one entry as one line of the export. */
function formatEntry(entry: LogEntry): string {
  const iso = new Date(entry.at).toISOString();
  return `${iso} [${entry.level}] [${entry.area}] ${entry.message}`;
}

/**
 * Render the whole log as export text: a header with version/platform
 * facts, then every buffered line.
 */
export function renderLogText(): string {
  const header = [
    'PaperStack diagnostic log',
    `appVersion: ${Constants.expoConfig?.version ?? 'unknown'}`,
    `platform: ${Platform.OS} ${Platform.Version}`,
    `generated: ${new Date().toISOString()}`,
    `entries: ${buffer.length} (bound ${MAX_ENTRIES})`,
    '',
  ].join('\n');
  return `${header}${buffer.map(formatEntry).join('\n')}\n`;
}

/** Directory under documents/ holding debug exports. */
export function debugLogDir(): Directory {
  return new Directory(Paths.document, 'debug');
}

/**
 * Write the log to documents/debug/paperstack-log-<timestamp>.txt and
 * open the OS share sheet on it. The file persists after the share so it
 * can be re-sent without regenerating.
 */
export async function exportAndShareLog(): Promise<{ uri: string }> {
  const dir = debugLogDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = new File(dir, `paperstack-log-${stamp}.txt`);
  file.write(renderLogText());

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: 'PaperStack diagnostic log',
    });
  }
  // When sharing is unavailable the file still exists — return its URI
  // so the caller can surface the path.
  return { uri: file.uri };
}
