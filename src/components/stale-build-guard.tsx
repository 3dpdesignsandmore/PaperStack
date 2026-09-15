/**
 * Dev-only guard against stale app processes.
 *
 * Sideloading a new dev build over an app whose old process is still
 * running does not reliably kill that process. The old binary then loads
 * the *current* JavaScript over Metro and crashes the moment a screen
 * touches a native module the binary predates — surfacing as cryptic
 * "TurboModuleRegistry.getEnforcing ... could not be found" errors.
 *
 * On startup (dev only) we probe each native-dependent module with a
 * dynamic import: evaluation throws when the binary lacks the module,
 * which we turn into an actionable full-screen notice instead of a crash
 * deep inside a screen.
 *
 * Production is exempt: store updates kill the old process before launch,
 * so the situation cannot arise there.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Native-dependent modules the current JS expects the binary to contain. */
const PROBES: [label: string, load: () => Promise<unknown>][] = [
  ['DocumentScanner', () => import('react-native-document-scanner-plugin')],
  ['ExpoSharing', () => import('expo-sharing')],
];

/**
 * Renders `children` once every probed native module is importable.
 * On a stale binary, renders a notice explaining how to recover instead.
 */
export function StaleBuildGuard({ children }: { children: ReactNode }) {
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    let cancelled = false;
    (async () => {
      for (const [label, load] of PROBES) {
        try {
          await load();
        } catch {
          if (!cancelled) {
            setMissing(label);
          }
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing == null) {
    return <>{children}</>;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">Outdated app process</ThemedText>
          <ThemedText style={styles.body}>
            A native module this version needs is missing from the running
            process ({missing}). That usually means an old app process from a
            previous build is still alive.
          </ThemedText>
          <ThemedText style={styles.body}>
            Fully close PaperStack — swipe it away from Recents — then reopen.
            If this screen returns, install the latest development build.
          </ThemedText>
        </ThemedView>
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
  card: {
    flex: 1,
    margin: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  body: {
    lineHeight: 22,
  },
});
