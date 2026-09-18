/**
 * Unit tests for the pinch-zoom math (document viewer, plan §8).
 * Pure geometry — no React, no native, no mocking.
 */
import { describe, expect, it } from 'vitest';

import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  RESET_THRESHOLD,
  ZOOMED_CUTOFF,
  addPan,
  clampPan,
  clampScale,
  fitInView,
  zoomAtFocal,
  type ZoomState,
} from './zoom-math';

describe('fitInView', () => {
  it('scales a same-aspect page up to fill the viewport', () => {
    expect(fitInView({ width: 800, height: 1600 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 800,
    });
  });

  it('letterboxes a wide page vertically', () => {
    expect(fitInView({ width: 1600, height: 800 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 200,
    });
  });

  it('never upscales past a limiting axis', () => {
    // Height already matches; only the width could grow — contain won't.
    expect(fitInView({ width: 200, height: 800 }, { width: 400, height: 800 })).toEqual({
      width: 200,
      height: 800,
    });
  });

  it('upscales a smaller page to the viewport when aspects match', () => {
    expect(fitInView({ width: 200, height: 400 }, { width: 400, height: 800 })).toEqual({
      width: 400,
      height: 800,
    });
  });
});

describe('clampScale', () => {
  it('floors below the minimum', () => {
    expect(clampScale(0.5)).toBe(MIN_SCALE);
  });

  it('caps above the maximum', () => {
    expect(clampScale(7.25)).toBe(MAX_SCALE);
  });

  it('passes an in-range value through', () => {
    expect(clampScale(3)).toBe(3);
  });
});

describe('zoomAtFocal', () => {
  const viewport = { width: 300, height: 600 };
  const identity: ZoomState = { scale: 1, translateX: 0, translateY: 0 };

  it('zooming on the viewport center only scales', () => {
    expect(zoomAtFocal(identity, 150, 300, 2, viewport)).toEqual({
      scale: 2,
      translateX: 0,
      translateY: 0,
    });
  });

  it('zooming on the top-left corner shifts the page right and down', () => {
    expect(zoomAtFocal(identity, 0, 0, 2, viewport)).toEqual({
      scale: 2,
      translateX: 150,
      translateY: 300,
    });
  });

  it('keeps the focal point on the same content pixel', () => {
    // From a panned state, zoom on (200, 250) — solve and verify the
    // focal point still maps to itself: T1 + s1·P where P = (F − T0)/s0.
    const base: ZoomState = { scale: 1, translateX: 50, translateY: -25 };
    const next = zoomAtFocal(base, 200, 250, 3, viewport);
    expect(next).toEqual({ scale: 3, translateX: 50, translateY: 25 });
    // F = (viewport/2-relative) (50, -50); P = (F - T0)/s0 = (0, -25).
    const screenX = next.translateX + next.scale * 0;
    const screenY = next.translateY + next.scale * -25;
    expect({ x: screenX, y: screenY }).toEqual({ x: 50, y: -50 });
  });

  it('clamps the requested scale to MAX_SCALE', () => {
    expect(zoomAtFocal(identity, 150, 300, 99, viewport)).toEqual({
      scale: MAX_SCALE,
      translateX: 0,
      translateY: 0,
    });
  });
});

describe('clampPan', () => {
  const viewport = { width: 300, height: 600 };

  it('keeps an in-bounds transform unchanged', () => {
    expect(clampPan({ scale: 2, translateX: 100, translateY: -200 }, viewport, viewport)).toEqual({
      scale: 2,
      translateX: 100,
      translateY: -200,
    });
  });

  it('clamps an over-pan on both axes, preserving direction', () => {
    expect(clampPan({ scale: 2, translateX: 400, translateY: -400 }, viewport, viewport)).toEqual({
      scale: 2,
      translateX: 150,
      translateY: -300,
    });
  });

  it('allows pan only along an axis the scaled page overflows', () => {
    // A 1:4 receipt fitted 150×600 in a 300×600 viewport: at 2x the page
    // is 300×1200, so Y pans up to 300 but the width exactly fills the
    // viewport and X can't move at all.
    const fitted = { width: 150, height: 600 };
    expect(clampPan({ scale: 2, translateX: 999, translateY: 500 }, fitted, viewport)).toEqual({
      scale: 2,
      translateX: 0,
      translateY: 300,
    });
  });

  it('zeroes both axes at scale 1', () => {
    expect(clampPan({ scale: 1, translateX: 999, translateY: -999 }, viewport, viewport)).toEqual({
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  });
});

describe('addPan', () => {
  it('accumulates and clamps in one step', () => {
    expect(addPan({ scale: 3, translateX: 0, translateY: 0 }, 400, -400, { width: 300, height: 600 }, { width: 300, height: 600 })).toEqual({
      scale: 3,
      translateX: 300,
      translateY: -400,
    });
  });
});

describe('invariants', () => {
  it('double-tap zoom registers as zoomed and exceeds the reset threshold', () => {
    expect(DOUBLE_TAP_SCALE).toBeGreaterThan(ZOOMED_CUTOFF);
    expect(RESET_THRESHOLD).toBeGreaterThan(ZOOMED_CUTOFF);
    expect(MAX_SCALE).toBeGreaterThan(MIN_SCALE);
  });
});
