import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import {
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
} from '@expo-google-fonts/schibsted-grotesk';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { StaleBuildGuard } from '@/components/stale-build-guard';
import { ThemeProvider } from '@/hooks/theme-provider';
import { DATABASE_NAME, migrate } from '@/lib/db/migrations';
import { getSettingSync } from '@/lib/db/queries';
import {
    armDetailFromStored,
    DEBUG_LOG_UNTIL_KEY,
    logInfo,
} from '@/lib/debug-log';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout: font load gate + SQLite provider + a Stack wrapping the
 * (tabs) group. Any route outside (tabs) pushes onto this Stack; without
 * that Stack wrapper, router.push to any non-tab route silently does
 * nothing (learned the hard way, 2026-09-14).
 *
 * The splash screen stays up (`preventAutoHideAsync` above) until every
 * family referenced by `Fonts` in `src/constants/theme.ts` has loaded —
 * otherwise the first frame flashes system-font text before swapping to
 * Schibsted Grotesk / IBM Plex Mono.
 *
 * `StaleBuildGuard` (dev only) intercepts the leftover-old-process case:
 * it probes native-dependent modules at startup and shows recovery steps
 * instead of a TurboModuleRegistry crash mid-screen.
 *
 * `ThemeProvider` sits inside `SQLiteProvider` (it reads the palette and
 * appearance preference from SQLite) and outside `StaleBuildGuard` (that
 * guard's own fallback UI is themed, via `ThemedText`/`ThemedView`, so it
 * needs the theme context too). It reads its preference synchronously on
 * mount, so no screen — including the guard's fallback — ever paints the
 * default palette before swapping to the saved one.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    IBMPlexMono_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError != null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // First line of every session: guarantees the diagnostic log has a
  // verifiable heartbeat (and its disk mirror gets created) even if the
  // user opens the log viewer before doing anything else.
  useEffect(() => {
    logInfo('app', `started (v${Constants.expoConfig?.version ?? 'unknown'})`);
  }, []);

  if (!fontsLoaded && fontError == null) {
    return null;
  }

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      {/* Hydrates the detailed-logging deadline from the settings row so
          the 30-minute window survives reloads/restarts unchanged — the
          same wall-clock deadline, never a fresh one. Inside the provider
          so the database exists. */}
      <DetailDeadlineHydrator />
      <ThemeProvider>
        <StaleBuildGuard>
          <Stack screenOptions={{ headerShown: false }} />
        </StaleBuildGuard>
      </ThemeProvider>
    </SQLiteProvider>
  );
}

/**
 * Reads the persisted `debug_log_until` deadline once per mount and
 * arms the detail window (or disarms it, when absent/expired — which is
 * also how the log line "detailed logging expired" gets its truth).
 * Renders nothing; must sit inside `SQLiteProvider`.
 */
function DetailDeadlineHydrator() {
  const db = useSQLiteContext();

  useEffect(() => {
    const stored = getSettingSync(db, DEBUG_LOG_UNTIL_KEY);
    const armed = armDetailFromStored(stored == null ? null : Number(stored));
    if (stored != null && !armed) {
      logInfo('debug', 'detailed logging expired');
    }
  }, [db]);

  return null;
}
