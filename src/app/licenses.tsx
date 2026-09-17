/**
 * Open source licenses (store obligation): every production dependency
 * bundled into the app, plus the native libraries shipped inside other
 * packages (ML Kit, Apple Vision — added by hand in
 * scripts/generate-licenses.mjs). Data is the committed
 * src/lib/licenses.json so no build step or network is involved —
 * see that file's generator (`npm run licenses`) for update procedure.
 *
 * Deliberately plain: this screen exists to discharge a license
 * obligation, not to be designed. List of packages; tap a row to expand
 * its full license text.
 */
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import licenses from '@/lib/licenses.json';

interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  publisher: string;
  licenseText: string;
}

const ENTRIES = licenses as LicenseEntry[];

export default function LicensesScreen() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Open source licenses" />
        <FlatList
          data={ENTRIES}
          keyExtractor={(item) => `${item.name}@${item.version}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isOpen = expanded === `${item.name}@${item.version}`;
            return (
              <Pressable
                onPress={() => setExpanded(isOpen ? null : `${item.name}@${item.version}`)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {`${item.version} · ${item.license}`}
                  </ThemedText>
                </View>
                {isOpen && (
                  <ScrollView
                    style={styles.licenseScroll}
                    contentContainerStyle={styles.licenseContent}
                    nestedScrollEnabled>
                    <ThemedText type="mono" style={[styles.licenseText, { color: theme.textSecondary }]}>
                      {item.licenseText === ''
                        ? 'This package does not bundle its license text. See the package source for the definitive text.'
                        : item.licenseText}
                    </ThemedText>
                  </ScrollView>
                )}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  row: {
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  licenseScroll: {
    maxHeight: 240,
  },
  licenseContent: {
    padding: Spacing.two,
  },
  licenseText: {
    fontSize: 11,
    lineHeight: 15,
  },
});
