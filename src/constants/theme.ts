/**
 * Palette + layout tokens.
 *
 * Four palettes (`Palettes`, keyed by `PaletteId`), each a real change of
 * surface and ink, not just a different accent swapped onto the same
 * grays. The active one is chosen in Settings, resolved by `ThemeProvider`
 * (`src/hooks/theme-provider.tsx`), and read everywhere else via
 * `useTheme()`.
 *
 * Every palette shares one relationship: `background` and
 * `backgroundElement` are close in lightness, with the *element* (card)
 * lighter than the page in light mode, so a card reads as raised without
 * needing a border. That is the inverse of the usual white-screen/gray-card
 * arrangement and the reason cards no longer draw a 1px outline.
 */

import { Platform } from 'react-native';

/** Identifies one of the four palettes below. */
export const PaletteId = {
  Blueprint: 'blueprint',
  Paper: 'paper',
  Graphite: 'graphite',
  Forest: 'forest',
} as const;
export type PaletteId = (typeof PaletteId)[keyof typeof PaletteId];

/**
 * The user's appearance override. `System` follows the OS light/dark
 * setting (today's — and the only — behavior before this existed); `Light`
 * and `Dark` pin one regardless of the OS.
 */
export const ThemeAppearance = {
  System: 'system',
  Light: 'light',
  Dark: 'dark',
} as const;
export type ThemeAppearance = (typeof ThemeAppearance)[keyof typeof ThemeAppearance];

/**
 * One resolved set of colors — a palette's light or dark side. Every
 * palette must define every key; there are no optional fields here, so a
 * palette missing one is a type error, not a silent fallback to the wrong
 * color.
 */
export interface ThemeColors {
  text: string;
  textSecondary: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  warning: string;
  success: string;
  /** Card/sheet drop-shadow color — see {@link CardShadow}. */
  shadow: string;
}

export type ThemeColor = keyof ThemeColors;

/** One palette's light and dark sides. */
export interface Palette {
  light: ThemeColors;
  dark: ThemeColors;
}

/**
 * `blueprint` — the original palette. Cool paper surfaces, blue-black ink,
 * one deep cobalt accent. The accent is deliberately darker and more
 * saturated than a stock system blue: a default `#0A7AFF`-ish blue on
 * neutral gray is the visual signature of an unfinished app, and the point
 * of this palette is to look chosen. Default.
 */
const blueprint: Palette = {
  light: {
    text: '#14181F',
    textSecondary: '#5A6473',
    background: '#F5F7FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E9EDF3',
    border: '#D8DFE8',
    accent: '#2B52B8',
    accentText: '#FFFFFF',
    accentSoft: '#E4EAFA',
    danger: '#B23A2E',
    warning: '#9A6B12',
    success: '#1F7A5C',
    shadow: '#141C2D',
  },
  dark: {
    text: '#E8EDF5',
    textSecondary: '#97A2B3',
    background: '#0F1319',
    backgroundElement: '#1F2632',
    backgroundSelected: '#2A3340',
    border: '#2A3340',
    accent: '#7A9BF0',
    // Dark mode's accent is light, so text on top of it must be dark. White
    // on #7A9BF0 fails contrast; the near-black page color passes comfortably.
    accentText: '#0F1319',
    accentSoft: '#1A2440',
    danger: '#F0736A',
    warning: '#E0A83F',
    success: '#4FC79B',
    shadow: '#141C2D',
  },
};

/**
 * `paper` — warm. Cream paper, ink-brown text, terracotta accent. A warm
 * palette needs a warm shadow too (a cool blue-black shadow under a warm
 * card looks like a mistake), so `shadow` here is a warm brown, not the
 * blue-black `blueprint` uses.
 */
const paper: Palette = {
  light: {
    text: '#1C1815',
    textSecondary: '#7A6F5F',
    background: '#FAF7F1',
    backgroundElement: '#FFFCF6',
    backgroundSelected: '#F0E9DC',
    border: '#E4D9C7',
    accent: '#B0552A',
    accentText: '#FFFFFF',
    accentSoft: '#F5E1D4',
    danger: '#A8402A',
    warning: '#96631A',
    success: '#2F7D4F',
    shadow: '#2A1D12',
  },
  dark: {
    text: '#F0E6D8',
    textSecondary: '#A89A85',
    background: '#17140F',
    backgroundElement: '#241F17',
    backgroundSelected: '#322A1E',
    border: '#3A3122',
    accent: '#D9754A',
    // Same reasoning as blueprint's dark accentText: the dark-mode accent is
    // light, so text on it must be dark — here the palette's own background.
    accentText: '#17140F',
    accentSoft: '#3A2418',
    danger: '#E8785F',
    warning: '#E3A855',
    success: '#5FC98A',
    shadow: '#120D08',
  },
};

/**
 * `graphite` — achromatic, high contrast, no hue anywhere. For people who
 * want no color at all: even the semantic colors (danger/warning/success)
 * are grays, differentiated by value (lightness) rather than hue. Danger
 * sits at the extreme end of the value range (black in light mode, white in
 * dark) rather than being colored red, since coloring it would be the one
 * hue this palette isn't supposed to have.
 */
const graphite: Palette = {
  light: {
    text: '#101010',
    textSecondary: '#5C5C5C',
    background: '#F4F4F4',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E5E5E5',
    border: '#D4D4D4',
    accent: '#262626',
    accentText: '#FFFFFF',
    accentSoft: '#E0E0E0',
    danger: '#000000',
    warning: '#8A8A8A',
    success: '#4D4D4D',
    shadow: '#000000',
  },
  dark: {
    text: '#F5F5F5',
    textSecondary: '#A0A0A0',
    background: '#101010',
    backgroundElement: '#1C1C1C',
    backgroundSelected: '#2A2A2A',
    border: '#333333',
    accent: '#F0F0F0',
    accentText: '#101010',
    accentSoft: '#333333',
    danger: '#FFFFFF',
    warning: '#8F8F8F',
    success: '#C2C2C2',
    shadow: '#000000',
  },
};

/**
 * `forest` — a deep green accent on a slightly warm neutral paper (not the
 * cool paper `blueprint` uses, and less saturated than `paper`'s cream).
 * `success` shares the accent's hue family, since both are naturally green,
 * but is kept a visibly different shade so the two remain distinguishable
 * as separate signals.
 */
const forest: Palette = {
  light: {
    text: '#171B14',
    textSecondary: '#5C6355',
    background: '#F6F5F0',
    backgroundElement: '#FFFEF9',
    backgroundSelected: '#E8ECE3',
    border: '#D7DBCF',
    accent: '#1F5E3E',
    accentText: '#FFFFFF',
    accentSoft: '#DCEAE0',
    danger: '#B23A2E',
    warning: '#96721A',
    success: '#3D8A5E',
    shadow: '#14201A',
  },
  dark: {
    text: '#E9EDE2',
    textSecondary: '#9CA68F',
    background: '#11150F',
    backgroundElement: '#1B2115',
    backgroundSelected: '#232B1D',
    border: '#2B331F',
    accent: '#4FB877',
    accentText: '#11150F',
    accentSoft: '#1F3326',
    danger: '#F0736A',
    warning: '#E0B23F',
    success: '#8FDB9E',
    shadow: '#060905',
  },
};

/**
 * Every palette, keyed by {@link PaletteId}. `Record<PaletteId, Palette>`
 * makes a missing palette a type error rather than a runtime gap — adding a
 * fifth `PaletteId` member without a matching entry here fails to compile.
 */
export const Palettes: Record<PaletteId, Palette> = {
  [PaletteId.Blueprint]: blueprint,
  [PaletteId.Paper]: paper,
  [PaletteId.Graphite]: graphite,
  [PaletteId.Forest]: forest,
};

/** Display name for each palette, for the Settings picker. */
export const PALETTE_NAMES: Record<PaletteId, string> = {
  [PaletteId.Blueprint]: 'Blueprint',
  [PaletteId.Paper]: 'Paper',
  [PaletteId.Graphite]: 'Graphite',
  [PaletteId.Forest]: 'Forest',
};

/**
 * Resolve an appearance preference against the OS scheme: `System` follows
 * `systemScheme`, `Light`/`Dark` override it regardless. Shared by
 * `useTheme()` and Settings' palette-preview swatches, which both need to
 * land on the same light/dark side for a given preference — duplicating
 * this one-line branch in two places is exactly the kind of drift that
 * would eventually make a preview lie about what a palette will actually
 * look like.
 */
export function resolveScheme(
  appearance: ThemeAppearance,
  systemScheme: 'light' | 'dark' | 'unspecified' | null | undefined,
): 'light' | 'dark' {
  if (appearance === ThemeAppearance.System) {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return appearance;
}

/** Corner radii. */
export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

/**
 * The fullscreen page viewer's chrome (`/document/view/[id]`) is
 * deliberately theme-independent (product decision 2026-09-18): receipts
 * are white, and the Apple-Photos convention — fixed near-black surround,
 * light chrome — is the highest-contrast way to read one. Centralized
 * here so the fixed-palette decision is stated once and the values
 * aren't scattered as literals across the viewer's files. Do not resolve
 * these through `useTheme()`; they intentionally ignore the palette.
 */
export const ViewerChrome = {
  /** The near-black page surround. */
  background: '#0A0A0C',
  /** Primary chrome ink — icons on the dark surround. */
  foreground: '#FFFFFFE6',
  /** Dimmed chrome ink — indicators, empty-state copy. */
  foregroundDim: '#FFFFFFB3',
  /** Close-button scrim against the page. */
  controlScrim: '#FFFFFF1A',
  /** Activity-indicator tint while pages load. */
  progress: '#FFFFFFCC',
} as const;

/**
 * Placeholder fill behind a page/cell image while it decodes — the
 * medium-gray translucent square common to viewer, detail-screen, and
 * reorder-thumb styles. Not part of `ViewerChrome`: it sits INSIDE the
 * letterboxed page (against app-themed surroundings in the detail list),
 * so it's a shared neutral, not viewer chrome.
 */
export const PagePlaceholderFill = '#80808040';

/**
 * Custom families loaded via `useFonts` in `src/app/_layout.tsx` — every
 * value here must have a matching entry there. Google Fonts ship as static
 * per-weight files rather than a single variable font RN can reweight with
 * `fontWeight`, so each weight PaperStack actually uses gets its own key
 * instead of trying to derive it from `sans`/`mono` at render time.
 */
export const Fonts = {
  sans: 'SchibstedGrotesk_400Regular',
  sansMedium: 'SchibstedGrotesk_500Medium',
  sansSemiBold: 'SchibstedGrotesk_600SemiBold',
  sansBold: 'SchibstedGrotesk_700Bold',
  /** Tabular figures — currency amounts and other aligned numerals. */
  mono: 'IBMPlexMono_400Regular',
} as const;

/** Spacing scale, in points. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Bottom padding scrollable tab content needs to clear the floating pill
 * tab bar (`floating-tab-bar.tsx`'s `TAB_BAR_HEIGHT` 64 + `TAB_BAR_GAP` 8,
 * duplicated here as literals rather than imported — importing that
 * component from this module would be circular, since it imports `Spacing`
 * from here). The bar no longer reserves layout space itself (it floats
 * absolutely), so every `FlatList`/`ScrollView` on a tab screen must add
 * this to its bottom padding or its last row clips under the bar. The
 * platform split covers the safe-area home indicator (iOS) vs. gesture nav
 * bar (Android), which are typically similar heights.
 */
export const BottomTabInset = Platform.select({ ios: 64 + 8 + 34, android: 64 + 8 + 24 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Cross-platform card elevation. RN ignores `shadow*` props on Android and
 * ignores `elevation` everywhere else, so a shadow that shows up on every
 * platform needs both.
 *
 * This now carries more weight than it used to: cards dropped their 1px
 * border, so a surface reads as raised from exactly two cues — the
 * `background` → `backgroundElement` step and this shadow. Takes the
 * shadow color as a parameter (from the active theme's `shadow`) rather
 * than hardcoding one, since a warm palette needs a warm shadow and a cool
 * one needs a cool one — call as `CardShadow(theme.shadow)`.
 */
export function CardShadow(shadowColor: string): object {
  return (
    Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.11,
        shadowRadius: 12,
      },
    }) ?? {}
  );
}

/**
 * Soft colored glow behind an emphasis surface (the primary export/scan
 * button, a destructive action). Unlike a black shadow, a colored glow
 * stays visible against a dark background — that's deliberate: it's the
 * one place this app leans on shadow for "flare" rather than depth.
 * Android's `elevation` cannot easily take a color, so it falls back to a
 * plain (if slightly more pronounced) elevation there.
 */
export function glowShadow(color: string): object {
  return (
    Platform.select({
      android: { elevation: 6 },
      default: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
    }) ?? {}
  );
}
