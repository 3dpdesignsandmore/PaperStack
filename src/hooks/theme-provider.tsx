/**
 * Palette + appearance preference: the raw user choice, persisted to
 * SQLite. `useTheme()` (in `use-theme.ts`) is the sibling that resolves
 * this into the active `ThemeColors` — this module only holds the
 * preference itself and its setters, which is what the Settings screen's
 * theme picker needs.
 *
 * The preference is read synchronously (`getSettingSync`, inside each
 * `useState`'s lazy initializer) rather than loaded in a `useEffect`: an
 * async load would render the default palette for one frame on every
 * launch before swapping to the saved one, a visible flash. `_layout.tsx`
 * mounts `ThemeProvider` immediately inside `<SQLiteProvider>`, before
 * `<Stack>`, so this runs before any screen paints.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { PaletteId, ThemeAppearance } from '@/constants/theme';
import {
    getSettingSync,
    PALETTE_ID_KEY,
    setSetting,
    THEME_APPEARANCE_KEY,
} from '@/lib/db/queries';
import { logThrown } from '@/lib/debug-log';

/** The raw preference and its setters. */
export interface ThemeContextValue {
  paletteId: PaletteId;
  appearance: ThemeAppearance;
  setPaletteId: (id: PaletteId) => void;
  setAppearance: (appearance: ThemeAppearance) => void;
}

/** Exported so `use-theme.ts` can read it too — see that module's comment. */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPaletteId(value: string): value is PaletteId {
  return Object.values(PaletteId).some((id) => id === value);
}

function isThemeAppearance(value: string): value is ThemeAppearance {
  return Object.values(ThemeAppearance).some((appearance) => appearance === value);
}

/** Props for {@link ThemeProvider}. */
export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const db = useSQLiteContext();

  const [paletteId, setPaletteIdState] = useState<PaletteId>(() => {
    const stored = getSettingSync(db, PALETTE_ID_KEY);
    return stored != null && isPaletteId(stored) ? stored : PaletteId.Blueprint;
  });
  const [appearance, setAppearanceState] = useState<ThemeAppearance>(() => {
    const stored = getSettingSync(db, THEME_APPEARANCE_KEY);
    return stored != null && isThemeAppearance(stored) ? stored : ThemeAppearance.System;
  });

  function setPaletteId(id: PaletteId) {
    setPaletteIdState(id);
    setSetting(db, PALETTE_ID_KEY, id).catch((e: unknown) =>
      logThrown('set-palette', e),
    );
  }

  function setAppearance(value: ThemeAppearance) {
    setAppearanceState(value);
    setSetting(db, THEME_APPEARANCE_KEY, value).catch((e: unknown) =>
      logThrown('set-appearance', e),
    );
  }

  const value: ThemeContextValue = { paletteId, appearance, setPaletteId, setAppearance };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The raw preference + setters, for the Settings theme picker. */
export function useThemePreferences(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context == null) {
    throw new Error('useThemePreferences must be used within a ThemeProvider');
  }
  return context;
}
