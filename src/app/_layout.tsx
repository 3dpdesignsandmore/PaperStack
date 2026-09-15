import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { StaleBuildGuard } from '@/components/stale-build-guard';
import { DATABASE_NAME, migrate } from '@/lib/db/migrations';

/**
 * Root layout: SQLite provider + a Stack wrapping the (tabs) group. Any
 * route outside (tabs) — e.g. /ocr-spike — pushes onto this Stack; without
 * that Stack wrapper, router.push to any non-tab route silently does
 * nothing (learned the hard way, 2026-09-14).
 *
 * `StaleBuildGuard` (dev only) intercepts the leftover-old-process case:
 * it probes native-dependent modules at startup and shows recovery steps
 * instead of a TurboModuleRegistry crash mid-screen.
 */
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <StaleBuildGuard>
        <Stack screenOptions={{ headerShown: false }} />
      </StaleBuildGuard>
    </SQLiteProvider>
  );
}
