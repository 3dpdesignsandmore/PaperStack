/**
 * Keyboard height for the app's centered dialogs: 0 while hidden, else
 * the vertical space the keyboard takes. Dialogs pad their backdrop by
 * it so the card re-centers above the keyboard — the backdrop's
 * `justifyContent: 'center'` centers within the padded box, and
 * percent-based `maxHeight` on the card clamps to the remaining space.
 *
 * Why dialogs must do this themselves: Android's enforced edge-to-edge
 * (Expo SDK 54+) stops `SOFT_INPUT_ADJUST_RESIZE` from resizing RN
 * `Modal` dialog windows — the keyboard draws straight over the dialog
 * on every phone; tall screens just happened to leave room above it.
 * iOS modals never resized for the keyboard either. `KeyboardAvoidingView`
 * inside a modal solves the same problem with more machinery — a plain
 * height is all a centered backdrop needs.
 *
 * Same event split as `floating-tab-bar.tsx` (§3.3.3): iOS reports
 * before the animation (`keyboardWill*`), Android only after
 * (`keyboardDid*`). Seeded from `Keyboard.metrics()` so a dialog that
 * opens while the keyboard is already up (the picker over the send
 * form) starts out clear of it.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Current on-screen keyboard height, 0 when hidden. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(() =>
    Keyboard.isVisible() ? Keyboard.metrics()?.height ?? 0 : 0,
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) =>
      setHeight(Math.max(event.endCoordinates.height, 0)),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
