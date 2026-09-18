/**
 * Pinch-zoom viewer geometry (document viewer, plan §8).
 *
 * Pure, dependency-free math in the same spirit as `pack-columns.ts`:
 * no React, no native modules — everything here is deterministic and
 * unit-tested (zoom-math.test.ts). The gesture component
 * (`zoomable-page.tsx`) keeps the live state in Reanimated shared values
 * and calls these from worklet callbacks, hence one `worklet` directive
 * per exported function (inert everywhere else, including Vitest).
 *
 * Coordinate model: the page image is fitted ("contained") into the
 * fullscreen viewport and centered on it. React Native transforms scale
 * about a view's CENTER, so a content point P of the fitted image (taken
 * relative to that center) renders at `T + scale · P`, where
 * T = (translateX, translateY) is the pan offset from the viewport
 * center. Every function below is that one equation rearranged.
 */

/** A 2-D size in view pixels (device-independent). */
export interface Size {
  width: number;
  height: number;
}

/** Complete zoom transform of one page. */
export interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

/** Zoom range (6x max — product decision 2026-09-18). */
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** Releasing a pinch below this springs back to MIN_SCALE. */
export const RESET_THRESHOLD = 1.1;
/** Scale above which a page counts as zoomed (pan takes over from
 *  paging — must stay below RESET_THRESHOLD or a spring-back page would
 *  flip the pager lock while still looking zoomed). */
export const ZOOMED_CUTOFF = 1.05;
/** Double-tap zoom target. */
export const DOUBLE_TAP_SCALE = 2.5;

/** Largest size with the page's aspect ratio that fits the viewport
 *  ("contain"). Scales up as well as down — a small scan should still
 *  fill the screen it's being read on. */
export function fitInView(natural: Size, viewport: Size): Size {
  'worklet';
  const factor = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  return { width: natural.width * factor, height: natural.height * factor };
}

/** Clamp a scale factor into [MIN_SCALE, MAX_SCALE]. */
export function clampScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** The transform that takes `base` to `nextScale` while keeping the
 *  viewport point (focalX, focalY) — where the fingers are — fixed on
 *  the same content pixel. Focal is viewport-relative, as delivered by
 *  gesture events on a fullscreen detector. */
export function zoomAtFocal(
  base: ZoomState,
  focalX: number,
  focalY: number,
  nextScale: number,
  viewport: Size,
): ZoomState {
  'worklet';
  const scale = clampScale(nextScale);
  // Focal point relative to the viewport center (the transform origin).
  const fx = focalX - viewport.width / 2;
  const fy = focalY - viewport.height / 2;
  // Content point under the focal point: T0 + s0·P = F. Keeping it there
  // under the new scale (T1 + s1·P = F) solves to T1 = F − (s1/s0)(F − T0).
  const ratio = scale / base.scale;
  return {
    scale,
    translateX: fx - ratio * (fx - base.translateX),
    translateY: fy - ratio * (fy - base.translateY),
  };
}

/** Clamp one axis to ±max; a max of 0 pins to exactly 0 (a naive min/max
 *  chain yields IEEE -0 for a negative input, which deep-equal tests and
 *  debug logs both render as a surprising value). */
function clampAxis(value: number, max: number): number {
  'worklet';
  if (max === 0) {
    return 0;
  }
  return Math.min(max, Math.max(-max, value));
}

/** Clamp a transform so the scaled page can never be dragged past the
 *  viewport edge on either axis. A fitted-smaller (letterboxed) axis
 *  clamps to 0 until the scale overflows the viewport. */
export function clampPan(state: ZoomState, fitted: Size, viewport: Size): ZoomState {
  'worklet';
  const maxX = Math.max(0, (state.scale * fitted.width - viewport.width) / 2);
  const maxY = Math.max(0, (state.scale * fitted.height - viewport.height) / 2);
  return {
    scale: state.scale,
    translateX: clampAxis(state.translateX, maxX),
    translateY: clampAxis(state.translateY, maxY),
  };
}

/** Apply a pan delta and clamp — the per-frame update for the pan gesture. */
export function addPan(
  state: ZoomState,
  dx: number,
  dy: number,
  fitted: Size,
  viewport: Size,
): ZoomState {
  'worklet';
  return clampPan(
    { ...state, translateX: state.translateX + dx, translateY: state.translateY + dy },
    fitted,
    viewport,
  );
}
