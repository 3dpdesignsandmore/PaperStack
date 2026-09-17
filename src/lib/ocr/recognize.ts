/**
 * OCR engine adapter (plan §6): one page image in, one `OcrResult`-shaped
 * plain object out. Pure plumbing — no React, no DB; the pipeline and
 * unit-testable heuristics live above this.
 *
 * Engine: `react-native-nitro-ocr` — Apple Vision on iOS, Google ML Kit
 * on Android. The engine loads through a dynamic import so a binary
 * predating it fails here, gracefully, rather than redboxing the whole
 * app at module scope (the `expo-mail-composer` lesson; see
 * `recipients.ts`'s header for the full story).
 *
 * ---------------------------------------------------------------------
 * WHY THERE IS NO PRE-FLIGHT AVAILABILITY GATE (2026-09-17)
 *
 * This function used to call expo's `requireOptionalNativeModule
 * ('NitroOcr')` before importing the engine, throwing "needs a newer app
 * build" when it returned null.
 *
 * It ALWAYS returned null. That call queries EXPO's native module
 * registry, and `react-native-nitro-ocr` is not an Expo module: no
 * `expo-module.config.json`, no `ModuleDefinition` in its android/ or
 * ios/ sources, and registration as a Nitro HybridObject via
 * `nitro.json` autolinking. The lookup could not match it on ANY binary,
 * engine present or absent — so execution never reached the import below
 * and the engine was never called once, on any build. The device log
 * that exposed this ended:
 *
 *     2b import('expo') resolved
 *     [error] OCR needs a newer app build (engine module unavailable).
 *
 * The gate was redundant as well as wrong. `react-native-nitro-modules`
 * runs the equivalent check itself at module scope —
 * `TurboModuleRegistry.getEnforcing('NitroModules')`, a miss wrapped in
 * `ModuleNotFoundError` — so a stale binary throws a catchable JS error
 * on import, which is exactly the graceful outcome the gate existed to
 * produce. `isStaleBinaryError` below preserves the distinction its
 * message carried.
 *
 * Do not reintroduce a gate keyed on an Expo-registry lookup.
 *
 * The `ocr-step` breadcrumbs are temporary; remove them once OCR is
 * verified end to end against a real exported PDF.
 * ---------------------------------------------------------------------
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { logDetail } from '@/lib/debug-log';
import type { OcrBlock } from '@/lib/model';

/** Long-edge cap for the image handed to the engine (mirrors the stored
 * page's own cap — the scan was already downscaled to this, but photo
 * imports may exceed it and OCR gains nothing beyond it). */
const OCR_MAX_LONG_EDGE_PX = 2000;

/** Our result shape: the engine's blocks mapped onto the persisted model. */
export interface RecognizedPage {
  fullText: string;
  blocks: OcrBlock[];
}

/** The engine's `OCRBlock`, narrowed to the fields we consume. */
interface EngineBlock {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** The engine module's surface, as far as this adapter cares. */
interface EngineModule {
  recognize: (source: string) => Promise<{ text: string; blocks: EngineBlock[] }>;
}

/**
 * Downscale to the OCR cap, then run the engine on the result. Throws on
 * engine failure or unavailability — the caller (the background
 * pipeline) logs and moves on.
 */
export async function recognizePage(imageUri: string): Promise<RecognizedPage> {
  const startedAt = Date.now();
  logDetail('ocr-step', '1/5 entered recognizePage; downscaling');
  const uri = await downscaleForOcr(imageUri);

  // In dev, Metro serves the bundle with `lazy=true`, so this import is an
  // HTTP fetch from the dev server rather than a local require; a
  // production bundle inlines it. Either way a failure here is reported,
  // not silent — see the header on why no gate precedes it.
  logDetail('ocr-step', "2/5 await import('react-native-nitro-ocr')");
  let loaded: unknown;
  try {
    loaded = await import('react-native-nitro-ocr');
  } catch (e: unknown) {
    if (isStaleBinaryError(e)) {
      throw new Error('OCR needs a newer app build (engine module unavailable).');
    }
    throw e;
  }
  logDetail('ocr-step', '3/5 engine module imported; resolving export');
  const candidate =
    typeof (loaded as Partial<EngineModule>).recognize === 'function'
      ? (loaded as EngineModule)
      : (loaded as { default?: unknown }).default instanceof Object &&
          typeof (loaded as { default: Partial<EngineModule> }).default.recognize === 'function'
        ? (loaded as { default: EngineModule }).default
        : null;
  if (candidate == null) {
    throw new Error('OCR engine failed to load.');
  }

  logDetail('ocr-step', '4/5 calling engine recognize()');
  const result = await candidate.recognize(uri);
  logDetail(
    'ocr-step',
    `5/5 recognize() returned: ${result.blocks?.length ?? 0} block(s), ${result.text?.length ?? 0} char(s) in ${Date.now() - startedAt} ms`,
  );
  // First block's raw box, unmapped — the header claims the engine
  // normalizes to 0..1, but ML Kit's Android APIs report PIXELS. If these
  // numbers are larger than 1, every stored OcrBlock coordinate is wrong
  // and the invisible PDF text layer is misplaced.
  const first = result.blocks?.[0]?.boundingBox;
  if (first != null) {
    logDetail(
      'ocr-step',
      `raw box[0]: x=${first.x} y=${first.y} w=${first.width} h=${first.height} (>1 means pixels, not 0..1)`,
    );
  }

  const blocks: OcrBlock[] = result.blocks.map((block) => ({
    text: block.text,
    x: block.boundingBox.x,
    y: block.boundingBox.y,
    width: block.boundingBox.width,
    height: block.boundingBox.height,
    confidence: block.confidence,
  }));
  return { fullText: result.text, blocks };
}

/**
 * True when a thrown value means the native side is missing from this
 * binary rather than the engine failing at its work. Nitro surfaces both
 * shapes: its own `ModuleNotFoundError`, and the underlying
 * `TurboModuleRegistry.getEnforcing` invariant text.
 */
function isStaleBinaryError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  return (
    e.name === 'ModuleNotFoundError' ||
    e.message.includes('TurboModuleRegistry') ||
    e.message.includes('could not be found')
  );
}

/**
 * Cap the image's long edge (plan §9's reasoning applies to OCR too —
 * 2000px is plenty for text recognition). Returns the ORIGINAL uri when
 * the image is already within the cap (no re-encode), otherwise a cache
 * URI of the downscaled copy.
 */
async function downscaleForOcr(sourceUri: string): Promise<string> {
  logDetail('ocr-step', '1a decoding source to read dimensions');
  const context = ImageManipulator.manipulate(sourceUri);
  const source = await context.renderAsync();
  const longEdge = Math.max(source.width, source.height);
  logDetail('ocr-step', `1b decoded: ${source.width}x${source.height} (long edge ${longEdge})`);
  if (longEdge <= OCR_MAX_LONG_EDGE_PX) {
    logDetail('ocr-step', '1c within cap; passing original uri to engine');
    return sourceUri;
  }
  const scale = OCR_MAX_LONG_EDGE_PX / longEdge;
  context.reset();
  context.resize({
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  });
  logDetail('ocr-step', '1c over cap; rendering resized copy');
  const image = await context.renderAsync();
  // Re-encode at a mid quality — it's transient input to the engine, not
  // a stored artifact.
  const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  logDetail('ocr-step', '1d resized copy saved');
  return saved.uri;
}
