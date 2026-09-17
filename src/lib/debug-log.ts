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

/** True once the disk mirror has been merged into the buffer. */
let loadedFromDisk = false;
/** Resolves when the in-flight (or settled) disk restore completes —
 * `logReady()` hands this to callers that must not race the merge. */
let restorePromise: Promise<void> | null = null;
/** Bumped by `clear()`: a restore that started before a Clear merges
 * nothing (the Clear must win, not the stale read). */
let restoreGeneration = 0;
/** True once the disk restore has settled (resolved or failed). Until it
 * has, a synchronous write would clobber the mirror with a pre-merge
 * buffer, so the write defers to `logReady()` instead. */
let restoreSettled = false;

/** The on-disk mirror: one JSON `LogEntry` per line under
 * documents/debug/log.jsonl. Survives process death — the in-memory
 * buffer alone lost everything on restart, which made "export the log
 * after a repro" worthless whenever the app had been relaunched
 * (the OCR hunt, 2026-09-17). */
function logFile(): File {
  return new File(new Directory(Paths.document, 'debug'), 'log.jsonl');
}

/** Restore previously persisted entries into the buffer (once). Kicks
 * off the async read and merges when it lands — `log()` and `entries()`
 * stay synchronous, so entries logged while the read is in flight simply
 * land after the restored ones (the timestamps keep true order in the
 * text). Best-effort: a missing/corrupt file means starting empty. */
function ensureLoadedFromDisk(): void {
  if (loadedFromDisk) {
    return;
  }
  loadedFromDisk = true;
  const generation = restoreGeneration;
  const file = logFile();
  if (!file.exists) {
    restorePromise = Promise.resolve();
    restoreSettled = true;
    return;
  }
  restorePromise = file
    .text()
    .then((text: string) => {
      if (generation !== restoreGeneration) {
        // A clear() happened mid-read — dropping the merge is the point.
        return;
      }
      const restored = parseLogLines(text);
      if (restored.length === 0) {
        return;
      }
      // Oldest restored first, then anything logged during the read.
      buffer.unshift(...restored.slice(-MAX_ENTRIES));
      if (buffer.length > MAX_ENTRIES) {
        buffer.splice(0, buffer.length - MAX_ENTRIES);
      }
    })
    .catch(() => {
      // Unreadable file — start empty rather than take logging down.
    })
    .finally(() => {
      restoreSettled = true;
    });
}

/** Parse JSONL text into validated entries; corrupt lines are skipped. */
function parseLogLines(text: string): LogEntry[] {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        if (isLogEntry(parsed)) {
          return [parsed];
        }
      } catch {
        // Corrupt line — skip it, keep the rest.
      }
      return [];
    });
}

/** Runtime guard for one restored entry (the file may predate a shape
 * change — same discipline as any parsed input). */
function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value == null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === 'number' &&
    (record.level === 'info' || record.level === 'error') &&
    typeof record.area === 'string' &&
    typeof record.message === 'string'
  );
}

/** Write the whole buffer to the disk mirror. Skips an empty buffer so a
 * `clear()` is not resurrected by a later write. */
function writeMirror(): void {
  if (buffer.length === 0) {
    return;
  }
  try {
    const dir = new Directory(Paths.document, 'debug');
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
    logFile().write(buffer.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  } catch {
    // A failed mirror write must never take the app down — logging is
    // diagnostic, not critical.
  }
}

/**
 * Mirror the buffer to disk, write-through.
 *
 * This was a 1500ms debounced timer until 2026-09-17. A debounce loses
 * every entry written inside the window whenever the JS context is torn
 * down — pending timers die with it — which is precisely the moment a
 * diagnostic log exists to capture. During the OCR investigation each
 * repro came back missing its final lines, so the log could never name
 * the step that preceded a reload.
 *
 * `File.write` is synchronous and the payload is a few hundred bytes for
 * a typical session, so the cost of writing per entry is not worth the
 * blind spot. Before the restore settles (the first few ms of a launch)
 * the write defers to `logReady()`, so it cannot clobber the mirror with
 * a pre-merge buffer.
 */
function flush(): void {
  if (restoreSettled) {
    writeMirror();
    return;
  }
  void logReady().then(writeMirror);
}

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

/** Append one entry, trimming the buffer to its bound, and schedule the
 * disk mirror. */
export function log(level: LogLevel, area: string, message: string): void {
  ensureLoadedFromDisk();
  buffer.push({ at: Date.now(), level, area, message });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
  flush();
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
  ensureLoadedFromDisk();
  return buffer;
}

/** Await the disk mirror restore before reading the buffer for display
 * or export — `entries()` is synchronous and would otherwise race the
 * async merge (the empty-log-on-restart bug, 2026-09-17). */
export function logReady(): Promise<void> {
  ensureLoadedFromDisk();
  return restorePromise ?? Promise.resolve();
}

/** Reset the buffer AND delete the disk mirror (tests; "clear log"). */
export function clear(): void {
  restoreGeneration++;
  buffer.length = 0;
  loadedFromDisk = true;
  restoreSettled = true;
  try {
    const file = logFile();
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Same deal as a failed write: diagnostics never take the app down.
  }
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
  await logReady();
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
