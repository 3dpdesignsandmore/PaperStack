import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { TabBarSlotProvider } from '@/components/floating-tab-bar';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Above the Tabs navigator: the only spot shared by both the tab
          screens (which claim the floating-bar slot, e.g. Library's
          selection toolbar) and the tab bar itself (which yields when
          claimed). Neither side can see a provider placed inside the
          other. */}
      <TabBarSlotProvider>
        <AppTabs />
      </TabBarSlotProvider>
    </ThemeProvider>
  );
}
