/**
 * Shared elevated surface — the bordered `backgroundElement` box repeated
 * across every screen (Settings sections, the Scan capture card, the
 * Compose control card, document detail page cards, dialog cards), now
 * with a consistent shadow so surfaces read as raised rather than just
 * outlined.
 *
 * Not used where the card also clips its own content with `overflow:
 * 'hidden'` (the Library grid thumbnails) — `overflow: 'hidden'` would
 * clip the shadow itself there, so that one keeps its own two-layer
 * (shadow container + clipping inner view) treatment instead. Every other
 * card here has no such conflict, so `style` — including layout props
 * like `flex: 1` — applies directly to this one view, same as the plain
 * `ThemedView` it replaces.
 */
import { type ViewProps } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { CardShadow, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AppCard({ style, ...rest }: ViewProps) {
  const theme = useTheme();

  return (
    <ThemedView
      type="backgroundElement"
      style={[{ borderRadius: Radius.large, borderWidth: 1, borderColor: theme.border }, CardShadow, style]}
      {...rest}
    />
  );
}
