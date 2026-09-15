/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#16181C',
    textSecondary: '#5C6169',
    background: '#FFFFFF',
    backgroundElement: '#F2F3F5',
    backgroundSelected: '#E2E4E8',
    border: '#DEE0E4',
    accent: '#2F7CF6',
    accentText: '#FFFFFF',
    accentSoft: '#E7F0FE',
    danger: '#D33A2F',
    warning: '#B96A00',
    success: '#1F8A4C',
  },
  dark: {
    text: '#F2F3F5',
    textSecondary: '#9BA0A8',
    background: '#0E0F11',
    backgroundElement: '#1A1C1F',
    backgroundSelected: '#26282C',
    border: '#2C2F34',
    accent: '#4E93F9',
    accentText: '#FFFFFF',
    accentSoft: '#1B2A41',
    danger: '#F0635A',
    warning: '#E2A336',
    success: '#4CC38A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Corner radii. */
export const Radius = {
  small: 8,
  medium: 14,
  large: 20,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
