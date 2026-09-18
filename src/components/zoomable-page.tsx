/**
 * One pinch-zoomable page in the fullscreen document viewer
 * (`/document/view/[id]`, user request 2026-09-18).
 *
 * Geometry lives in `src/lib/layout/zoom-math.ts` (pure, unit-tested);
 * this component owns the live state as Reanimated shared values — the
 * sanctioned exception to the "the compiler handles memoization" rule —
 * with every gesture callback running on the UI thread.
 *
 * Coordinate model recap: RN applies the LAST transform in an array
 * first, so `[{translateX}, {translateY}, {scale}]` is
 * scale-about-center THEN translate — a content point P (relative to
 * the centered fitted image) renders at `T + s·P`. The pinch anchors on
 * the fingers' focal point, pan is clamped to the page bounds (only
 * while zoomed), double-tap toggles 2.5x at the tap point, and
 * releasing a pinch below ~1.1x springs home.
 *
 * Crossing `ZOOMED_CUTOFF` flips React state twice, both via runOnJS:
 * this page's pan-gesture gate, and the pager's swipe lock — while a
 * page is zoomed the pager must not steal a pan as a page swipe (and
 * the lock is what guarantees a swipe can never leave a zoomed page).
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PagePlaceholderFill, Radius } from '@/constants/theme';
import {
  DOUBLE_TAP_SCALE,
  MIN_SCALE,
  RESET_THRESHOLD,
  ZOOMED_CUTOFF,
  addPan,
  clampPan,
  fitInView,
  zoomAtFocal,
  type Size,
  type ZoomState,
} from '@/lib/layout/zoom-math';
import type { ScanPage } from '@/lib/model';

/** Props for {@link ZoomablePage}. */
export interface ZoomablePageProps {
  page: ScanPage;
  /** Fullscreen viewport the page is fitted into — gesture coordinates
   *  and zoom math both live in this space. */
  viewport: Size;
  /** This page's position in the pager (zoom-lock reporting). */
  pageIndex: number;
  /** Fires when this page crosses the zoomed cutoff — the parent uses
   *  it to lock pager swipes while zoomed. */
  onZoomedChange: (pageIndex: number, zoomed: boolean) => void;
}

export function ZoomablePage({
  page,
  viewport,
  pageIndex,
  onZoomedChange,
}: ZoomablePageProps) {
  // The live transform, as three scalar shared values — `withTiming`
  // animates numbers, so the fields stay separate (an object-valued
  // shared value can't be driven by withTiming).
  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // The transform at pinch start: every pinch update is computed
  // absolutely from this snapshot, so the clamping of one frame can
  // never corrupt the next (no integration drift).
  const pinchStart = useSharedValue<ZoomState>({ scale: MIN_SCALE, translateX: 0, translateY: 0 });
  // React mirror of "this page is zoomed": gates the pan gesture. It
  // flips mid-pinch, which is fine — pan can only activate on a fresh
  // touch, so it arms for the drag AFTER the pinch completes.
  const [zoomed, setZoomed] = useState(false);
  const fitted = fitInView({ width: page.widthPx, height: page.heightPx }, viewport);

  /** Current transform as one value (worklet-side reader). */
  function readZoom(): ZoomState {
    'worklet';

    return { scale: scale.value, translateX: translateX.value, translateY: translateY.value };
  }

  /** Write a transform to the three scalars (worklet-side writer). */
  function writeZoom(next: ZoomState): void {
    'worklet';

    scale.value = next.scale;
    translateX.value = next.translateX;
    translateY.value = next.translateY;
  }

  /** Animate a transform in, field by field (worklet-side writer). */
  function animateZoom(next: ZoomState, duration: number): void {
    'worklet';

    scale.value = withTiming(next.scale, { duration });
    translateX.value = withTiming(next.translateX, { duration });
    translateY.value = withTiming(next.translateY, { duration });
  }

  // No reset-on-leave effect by design (a first version had one; the
  // react-compiler lint and the state machine itself made it dead
  // weight): the pager's swipe lock means a zoomed page can never be
  // swiped away from, the pinch's own below-threshold release springs
  // the transform home, and stale cross-page lock reports are filtered
  // by the parent's activeIndexRef. A remounting page re-initializes.

  /** Zoom-cutoff crossing on the JS thread: pan gate + pager lock. */
  function handleZoomCrossed(isZoomed: boolean): void {
    setZoomed(isZoomed);
    onZoomedChange(pageIndex, isZoomed);
  }

  useAnimatedReaction(
    () => scale.value > ZOOMED_CUTOFF,
    (isZoomed, wasZoomed) => {
      if (isZoomed !== wasZoomed) {
        runOnJS(handleZoomCrossed)(isZoomed);
      }
    },
  );

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      pinchStart.value = readZoom();
    })
    .onUpdate((event) => {
      const next = zoomAtFocal(
        pinchStart.value,
        event.focalX,
        event.focalY,
        pinchStart.value.scale * event.scale,
        viewport,
      );
      writeZoom(clampPan(next, fitted, viewport));
    })
    .onFinalize(() => {
      // Released below the threshold springs home — the spring-back
      // passes through the cutoff and releases the swipe lock itself.
      if (scale.value < RESET_THRESHOLD) {
        animateZoom({ scale: MIN_SCALE, translateX: 0, translateY: 0 }, 180);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    // onChange (not onUpdate): changeX/changeY are the per-frame
    // deltas — a release-and-regrip mid-drag can't jump the image.
    //
    // Pointer-count gate (fixes the dead-pan bug, 2026-09-18): events
    // carrying more than one pointer are a pinch's finger travel — the
    // pinch's own focal math already accounts for it, so pan skips
    // them. A first version gated this on an `isPinching` flag set in
    // pinch.onBegin; that fires when the gesture begins TRACKING (the
    // first pointer of even a single-finger drag), so the flag stayed
    // true for the whole drag and pan never applied anything.
    // numberOfPointers is per-event truth — no flag, no ordering
    // assumptions, nothing to fall out of step.
    .onChange((event) => {
      if (event.numberOfPointers > 1) {
        return;
      }
      writeZoom(addPan(readZoom(), event.changeX, event.changeY, fitted, viewport));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (!success) {
        return;
      }
      if (scale.value > RESET_THRESHOLD) {
        animateZoom({ scale: MIN_SCALE, translateX: 0, translateY: 0 }, 200);
      } else {
        const target = zoomAtFocal(
          { scale: MIN_SCALE, translateX: 0, translateY: 0 },
          event.x,
          event.y,
          DOUBLE_TAP_SCALE,
          viewport,
        );
        animateZoom(clampPan(target, fitted, viewport), 220);
      }
    });

  // Composition (2026-09-18 review): Race, not Simultaneous, between the
  // double-tap and the (pinch+pan) pair. First try fed all three to
  // Simultaneous — harmless in theory (taps carry no movement, pan is
  // gated on `zoomed`), but a recognised double-tap leaves RNGH's
  // NativeViewGestureHandler-based pan armed in the same touch, so a
  // double-tap on a zoomed page could nudge the image before the
  // animation takes over. Racing the tap against the others makes the
  // tap win exclusively on the touch it claims.
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    // Order matters — see the module comment.
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cell, { width: viewport.width }, animatedStyle]}>
        <Image
          source={{ uri: page.imagePath }}
          style={[styles.image, { width: fitted.width, height: fitted.height }]}
          contentFit="contain"
          recyclingKey={page.id}
          transition={150}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Horizontal FlatList cell: explicit width, stretched to the pager's
  // height by the row's default cross-axis alignment (the GestureDetector
  // must own the full cell so gesture coordinates equal viewport ones).
  cell: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderRadius: Radius.small,
    backgroundColor: PagePlaceholderFill,
  },
});
