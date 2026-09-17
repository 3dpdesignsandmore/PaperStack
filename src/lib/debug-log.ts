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

/** Maximum lines retained in basic mode; oldest dropped first. */
export const MAX_ENTRIES = 500;
/** Buffer bound while detailed logging is active — a whole debug
 * session should survive for the viewer/export, not just the tail. */
export const DETAIL_MAX_ENTRIES = 2000;
/** The detailed-logging window, per enable: 30 minutes. Wall-clock
 * epoch ms, so a restart or JS-context reload can't extend it. */
export const DETAIL_WINDOW_MS = 30 * 60 * 1000;
/** Rotate the live mirror to log.1…log.N when it exceeds this size. */
export const MAX_LOG_FILE_BYTES = 1024 * 1024;
/** Rotated files kept (log.1 … log.<n>), excluding the live file. */
export const ROTATED_LOG_FILES = 5;

/**
 * The settings key holding the detailed-logging deadline (epoch ms
 * string). Deadline, not boolean: effective state is
 * `now < deadline`, which makes the 30-minute window self-expiring and
 * immune to being restarted into effect. See Settings: "Detailed
 * logging".
 */
export const DEBUG_LOG_UNTIL_KEY = 'debug_log_until';

/** Deadline hydrate state: null = not yet read from SQLite, else the
 * epoch-ms deadline (0 when never enabled / expired abroad). Managed by
 * `armDetailFromStored()` — the ONE entry point for setting it. */
let detailDeadline: number | null = null;

/** Detail-window state, zero-JS-allocation per call in the common
 * (disabled) case, and honest to the ms. */
function detailActive(): boolean {
  return detailDeadline != null && Date.now() < detailDeadline;
}

/** Effective capacity: 2000 while the window is open, else 500. */
function bufferBound(): number {
  return detailActive() ? DETAIL_MAX_ENTRIES : MAX_ENTRIES;
}

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

/** Directory holding the live mirror and its rotations. */
function debugDir(): Directory {
  return new Directory(Paths.document, 'debug');
}

/** The on-disk mirror: one JSON `LogEntry` per line under
 * documents/debug/log.jsonl. Survives process death — the in-memory
 * buffer alone lost everything on restart, which made "export the log
 * after a repro" worthless whenever the app had been relaunched
 * (the OCR hunt, 2026-09-17). */
function logFile(): File {
  return new File(debugDir(), 'log.jsonl');
}

/**
 * Rotate the debug directory when the live mirror exceeds
 * {@link MAX_LOG_FILE_BYTES}: log.N → log.N+1 … log.1 → log.2, live →
 * log.1, then the caller writes a fresh live file. Files past
 * {@link ROTATED_LOG_FILES} fall off. Best-effort per hop — a rotation
 * failure must never take logging down, and a half-rotated set still
 * parses line-by-line.
 */
function rotateIfNeeded(live: File): void {
  if (!live.exists || live.size <= MAX_LOG_FILE_BYTES) {
    return;
  }
  logInfo('debug', `log.jsonl reached ${Math.round(live.size / 1024)} KB; rotating`);
  try {
    const oldest = new File(debugDir(), `log.${ROTATED_LOG_FILES}`);
    if (oldest.exists) {
      oldest.delete();
    }
    for (let i = ROTATED_LOG_FILES - 1; i >= 1; i--) {
      const source = new File(debugDir(), `log.${i}`);
      if (source.exists) {
        source.move(new File(debugDir(), `log.${i + 1}`));
      }
    }
    live.move(new File(debugDir(), 'log.1'));
  } catch {
    // Rotation is best-effort; the live write below still happens.
  }
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
    (record.level === 'info' || record.level === 'error' || record.level === 'detail') &&
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
    const live = logFile();
    rotateIfNeeded(live);
    live.write(buffer.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
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
export type LogLevel = 'info' | 'error' | 'detail';

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

/** Append one entry, trimming the buffer to its current bound (2000
 * inside the detailed window, 500 out of it), and flush the disk
 * mirror write-through. */
export function log(level: LogLevel, area: string, message: string): void {
  ensureLoadedFromDisk();
  buffer.push({ at: Date.now(), level, area, message });
  const bound = bufferBound();
  if (buffer.length > bound) {
    buffer.splice(0, buffer.length - bound);
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
 * Detail level: everything `logInfo` says, plus the verbose breadcrumbs
 * that only matter during a troubleshooting session (ocr-step lines,
 * per-page durations, export timings). No-op outside the
 * detailed-logging window — call sites read as plain log lines and the
 * common case costs a comparison.
 */
export function logDetail(area: string, message: string): void {
  if (detailActive()) {
    log('detail', area, message);
  }
}

/**
 * Enable detailed logging for {@link DETAIL_WINDOW_MS} from now. Also
 * THE one-shot hydrate entry point: the sqlite-backed deadline can be
 * read from a context where DB access is awkward by passing the value
 * directly (used at launch, below). Never later than `Date.now() + 30
 * min` — a reload or restart re-hydrates the same deadline, never a
 * fresh window.
 */
export function detailLoggingSetStatus(enabled: boolean): void {
  if (enabled) {
    logInfo('debug', `detailed logging enabled for ${DETAIL_WINDOW_MS / 60000} minutes`);
  } else {
    logInfo('debug', 'detailed logging disabled');
  }
  detailDeadline = enabled ? Date.now() + DETAIL_WINDOW_MS : 0;
}

/** Whether the detailed window is currently open (Settings switch). */
export function detailLoggingActive(): boolean {
  return detailActive();
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
    const dir = new Directory(Paths.document, 'debug');
    logFile().exists && logFile().delete();
    for (let i = 1; i <= ROTATED_LOG_FILES; i++) {
      const rotated = new File(dir, `log.${i}`);
      if (rotated.exists) {
        rotated.delete();
      }
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
 * facts, then every line in {@link buffer}. Rotated files, oldest first
 * (`log.N` … `log.1`), are concatenated in front of the live buffer so
 * a single export carries the whole debug session even across
 * rotations. Corrupt rotated files are skipped, not fatal.
 *
 * Async because `File.text()` is a Promise in the new class API — and
 * because the caller (`exportAndShareLog`) is async anyway.
 */
export async function renderLogText(): Promise<string> {
  const rotatedBlocks: string[] = [];
  try {
    const dir = debugDir();
    for (let i = ROTATED_LOG_FILES; i >= 1; i--) {
      const rotated = new File(dir, `log.${i}`);
      if (!rotated.exists) {
        continue;
      }
      const restored = parseLogLines(await rotated.text());
      if (restored.length > 0) {
        rotatedBlocks.push(`--- log.${i} (older, ${restored.length} entries) ---`);
        rotatedBlocks.push(...restored.map(formatEntry));
      }
    }
  } catch {
    // A mangled rotation must not kill the export of the live log.
  }
  const header = [
    'PaperStack diagnostic log',
    `appVersion: ${Constants.expoConfig?.version ?? 'unknown'}`,
    `platform: ${Platform.OS} ${Platform.Version}`,
    `generated: ${new Date().toISOString()}`,
    `detailed logging: ${detailActive() ? 'ACTIVE' : detailDeadline === 0 ? 'off' : 'expired'}`,
    `entries: ${buffer.length} (bound ${bufferBound()})${rotatedBlocks.length > 0 ? ' + rotated files queued' : ''}`,
    '',
  ].join('\n');
  const liveLines = buffer.map(formatEntry).join('\n');
  const body = rotatedBlocks.length > 0 ? `${rotatedBlocks.join('\n')}\n${liveLines}` : liveLines;
  return `${header}${body}\n`;
}

/** Directory under documents/ holding debug exports. */
export function debugLogDir(): Directory {
  return new Directory(Paths.document, 'debug');
}

/**
 * Read the persisted detailed-logging deadline from a sqlite row value
 * and arm the window. Shared by the Settings toggle call site (which
 * reads/writes via its own key) and the launch hydrate in the router
 * shell (which reads once at open). `untilEpochMs == null` or expired
 * values disarm cleanly (deadline 0).
 */
export function armDetailFromStored(untilEpochMs: number | null): boolean {
  const parsed = untilEpochMs != null && Number.isFinite(untilEpochMs) && untilEpochMs > Date.now()
    ? untilEpochMs
    : 0;
  detailDeadline = parsed;
  return parsed > 0;
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
  file.write(await renderLogText());

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
