import { useState } from 'react';

/**
 * Runs `reset()` once, synchronously, whenever `open` transitions from
 * false to true — the render-phase alternative to a `useEffect` that calls
 * `setState` synchronously (flagged by the `react-hooks/set-state-in-effect`
 * lint rule: https://react.dev/learn/you-might-not-need-an-effect). Used by
 * dialogs that need to reseed their local state (an input value, a scroll
 * position) each time they reopen.
 */
export function useResetOnOpen(open: boolean, reset: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      reset();
    }
  }
}
