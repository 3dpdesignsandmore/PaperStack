/**
 * Custom floating pill tab bar (plan/UI.md §3). Replaces `NativeTabs`,
 * which wraps the platform's own tab bar and accepts no custom renderer —
 * a custom bar requires the classic `Tabs` component from `expo-router`,
 * which takes this as its `tabBar` prop.
 *
 * Everything the OS tab bar did for free is now this component's job
 * (§3.3): safe area, accessibility, keeping clear of the keyboard, press
 * feedback, and 44×44 hit targets. Content padding for the bar's height is
 * exported as `TAB_BAR_HEIGHT`/`TAB_BAR_GAP` and consumed via
 * `BottomTabInset` in `theme.ts`.
 *
 * The center Scan item does not navigate like a normal tab — it launches
 * the capture flow directly via `useCapture()` (plan §1), so tapping it
 * never shows an intermediate screen. Success pushes `/document/[id]`;
 * cancel leaves the user exactly where they were.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { SaveScanDialog } from '@/components/save-scan-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, glowShadow, Radius, Spacing } from '@/constants/theme';
import { useCapture } from '@/hooks/use-capture';
import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/hooks/use-theme';

/** Bar height, exported so screens can pad their scrollable content. */
export const TAB_BAR_HEIGHT = 64;
/** Gap between the bar and the safe-area bottom edge. */
export const TAB_BAR_GAP = Spacing.two;

/** Icon per route name, matching `screen-header.tsx`'s SymbolView usage. */
const ICONS: Record<string, SymbolViewProps['name']> = {
  index: { ios: 'house.fill', android: 'home' },
  library: { ios: 'folder.fill', android: 'folder' },
  scan: { ios: 'camera.viewfinder', android: 'document_scanner' },
};

export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const { capture, dialog } = useCapture();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // §3.3.3: a floating absolute bar sits on top of the keyboard unless
  // told otherwise — the rename dialog and receipt-field editor both open
  // it.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  async function onScanPress(routeKey: string) {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (event.defaultPrevented) {
      return;
    }
    const documentId = await capture();
    if (documentId != null) {
      router.push(`/document/${documentId}`);
    }
    // Cancelled: do nothing, the user stays exactly where they were.
  }

  const items = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const label = options.title ?? route.name;
    const accessibilityLabel = options.tabBarAccessibilityLabel ?? label;
    const isScan = route.name === 'scan';

    function onPress() {
      if (isScan) {
        void onScanPress(route.key);
        return;
      }
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }

    function onLongPress() {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    }

    return (
      <TabBarItem
        key={route.key}
        label={label}
        accessibilityLabel={accessibilityLabel}
        icon={ICONS[route.name]}
        focused={focused}
        accent={isScan}
        onPress={onPress}
        onLongPress={onLongPress}
      />
    );
  });

  const barPosition = { bottom: insets.bottom + TAB_BAR_GAP };
  // §3.4 (optional): on a Liquid Glass-capable iOS, the pill picks up the
  // system material instead of a flat fill — it reads noticeably better
  // floating over a scrolling grid. Falls back to the flat fill everywhere
  // else (older iOS, Android, or when the API isn't available).
  const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <>
      {useGlass ? (
        <GlassView glassEffectStyle="regular" style={[styles.bar, barPosition]}>
          {items}
        </GlassView>
      ) : (
        <ThemedView
          type="backgroundElement"
          style={[styles.bar, CardShadow(theme.shadow), styles.barShadowBoost, barPosition]}>
          {items}
        </ThemedView>
      )}
      <SaveScanDialog {...dialog} />
    </>
  );
}

/** Props for {@link TabBarItem}. */
interface TabBarItemProps {
  label: string;
  accessibilityLabel: string;
  icon: SymbolViewProps['name'] | undefined;
  focused: boolean;
  /** The centre Scan pill: always accent-filled, the primary action. */
  accent?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function TabBarItem({
  label,
  accessibilityLabel,
  icon,
  focused,
  accent = false,
  onPress,
  onLongPress,
}: TabBarItemProps) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const iconColor = accent ? theme.accentText : focused ? theme.text : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      style={styles.itemHitArea}>
      <Animated.View
        style={[
          accent ? styles.scanPill : styles.item,
          accent && { backgroundColor: theme.accent, ...glowShadow(theme.accent) },
          animatedStyle,
        ]}>
        {icon != null && <SymbolView name={icon} size={accent ? 20 : 22} tintColor={iconColor} />}
        <ThemedText
          type={accent ? 'defaultSemiBold' : 'label'}
          style={[
            accent ? styles.scanLabel : styles.itemLabel,
            { color: iconColor },
          ]}>
          {label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    height: TAB_BAR_HEIGHT,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
  },
  // The bar floats higher than a card, so its shadow reads stronger than
  // the flat `CardShadow` every other surface uses.
  barShadowBoost: {
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  itemHitArea: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    width: 72,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  itemLabel: {
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'none',
    letterSpacing: 0,
  },
  scanPill: {
    height: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  scanLabel: {
    fontSize: 14,
  },
});
