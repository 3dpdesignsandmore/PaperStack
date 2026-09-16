/**
 * Resolves the active `ThemeColors`: the chosen palette (`Palettes`,
 * `src/constants/theme.ts`) crossed with the appearance preference
 * (`ThemeProvider`, `theme-provider.tsx`) — `System` follows the OS scheme,
 * `Light`/`Dark` override it.
 *
 * Signature is unchanged from before the theme picker existed (no
 * arguments, returns the color set) — every component already calls this,
 * so the resolution logic moving from a fixed `Colors[scheme]` lookup to
 * this palette-aware one had to stay invisible to callers.
 */
import { useContext } from 'react';

import { Palettes, resolveScheme, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeContext } from '@/hooks/theme-provider';

export function useTheme(): ThemeColors {
  const context = useContext(ThemeContext);
  const systemScheme = useColorScheme();

  if (context == null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  const scheme = resolveScheme(context.appearance, systemScheme);
  return Palettes[context.paletteId][scheme];
}
