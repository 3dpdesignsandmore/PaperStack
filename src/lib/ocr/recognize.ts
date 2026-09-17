/**
 * OCR engine adapter (plan §6): one page image in, one `OcrResult`-shaped
 * plain object out. Pure plumbing — no React, no DB; the pipeline and
 * unit-testable heuristics live above this.
 *
 * Engine: `react-native-nitro-ocr` — Apple Vision on iOS, Google ML Kit
 * on Android; both already normalize to 0..1 top-left coordinates, so
 * this adapter only maps the engine's block shape onto ours.
 *
 * Like `scanner.ts`/`recipients.ts` before it, the engine loads through
 * a dynamic import with a native-availability gate: `react-native-nitro-ocr`
 * was added 2026-09-16 and installed dev builds predate it — a static
 * import would redbox the whole app on those binaries (module-scope
 * `requireNativeModule`, the `expo-mail-composer` lesson; see
 * `recipients.ts`'s header for the full story).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

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
  const uri = await downscaleForOcr(imageUri);

  // The native-availability gate — see the header. `requireOptionalNativeModule`
  // returns null (never throws) on binaries predating the engine.
  const { requireOptionalNativeModule } = await import('expo');
  if (requireOptionalNativeModule('NitroOcr') == null) {
    throw new Error('OCR needs a newer app build (engine module unavailable).');
  }
  // The gate passed — the module IS in this binary. A failure past this
  // point is an engine error, not a stale build (the pipeline logs it).

  // Metro CJS interop: the package resolves as either the module namespace
  // itself or a `{ default: namespace }` wrapper (same dance as
  // `recipients.ts` with mail-composer).
  const loaded: unknown = await import('react-native-nitro-ocr');
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

  const result = await candidate.recognize(uri);
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
 * Cap the image's long edge (plan §9's reasoning applies to OCR too —
 * 2000px is plenty for text recognition). Returns the ORIGINAL uri when
 * the image is already within the cap (no re-encode), otherwise a cache
 * URI of the downscaled copy.
 */
async function downscaleForOcr(sourceUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri);
  const source = await context.renderAsync();
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= OCR_MAX_LONG_EDGE_PX) {
    return sourceUri;
  }
  const scale = OCR_MAX_LONG_EDGE_PX / longEdge;
  context.reset();
  context.resize({
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  });
  const image = await context.renderAsync();
  // Re-encode at a mid quality — it's transient input to the engine, not
  // a stored artifact.
  const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return saved.uri;
}
