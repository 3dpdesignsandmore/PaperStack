import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  | 'default'
  | 'defaultSemiBold'
  | 'title'
  | 'small'
  | 'smallBold'
  | 'subtitle'
  | 'label'
  | 'link'
  | 'linkPrimary'
  | 'mono';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'defaultSemiBold' && styles.defaultSemiBold,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'label' && styles.label,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.accent }],
        type === 'mono' && styles.mono,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  defaultSemiBold: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  // 25% smaller than the original 34/38 (was sized for the display serif).
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 26,
    lineHeight: 29,
  },
  subtitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
    lineHeight: 26,
  },
  small: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  smallBold: {
    fontFamily: Fonts.sansBold,
    fontSize: 13,
    lineHeight: 19,
  },
  // +14% tracking (of 11) opens up the uppercase caps so they don't clump.
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.54,
    textTransform: 'uppercase',
  },
  link: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 30,
  },
  // Color is not set here — it's the app's current accent, which is a
  // theme value, not a static one; see the inline override above.
  linkPrimary: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 30,
  },
  // Tabular figures so stacked amounts stay column-aligned.
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 15,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
});
