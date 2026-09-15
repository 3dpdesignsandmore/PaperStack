import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Tactile press feedback: a small, quick scale-down on press-in and a
 * spring back on release. `react-native-reanimated`/`react-native-worklets`
 * were already dependencies (left over from the starter template's demo
 * animation) but unused by any real screen — this is the first thing that
 * actually uses them, standardizing the "press" micro-interaction instead
 * of the ad hoc `pressed && { opacity: 0.7 }` used inconsistently across
 * screens.
 */
export function usePressScale(scale = 0.96) {
  const value = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: value.value }],
  }));

  const onPressIn = useCallback(() => {
    // Reanimated shared values are mutable by design — they live outside
    // React's render model (CLAUDE.md's reactCompiler exception), so this
    // assignment is correct despite the compiler-aware lint rule not
    // recognizing SharedValue the way it recognizes `useRef().current`.
    // eslint-disable-next-line react-hooks/immutability
    value.value = withTiming(scale, { duration: 90 });
  }, [value, scale]);

  const onPressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    value.value = withTiming(1, { duration: 150 });
  }, [value]);

  return { animatedStyle, onPressIn, onPressOut };
}
