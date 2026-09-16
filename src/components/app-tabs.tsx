import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/floating-tab-bar';

/**
 * Tabs are Home / Scan / Library (plan/UI.md §1, §3) — Settings moved
 * off the tab bar to a pushed route reached from Home's header. Route
 * names stay `index`/`scan`/`library`; renaming them changes URLs and
 * breaks `router.push` targets elsewhere.
 *
 * A custom bar requires the classic `Tabs` component from
 * `expo-router/js-tabs` with `tabBar` overridden — see
 * `floating-tab-bar.tsx` for why.
 */
export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
