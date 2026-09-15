import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { DATABASE_NAME, migrate } from '@/lib/db/migrations';

/**
 * Root layout: SQLite provider + a Stack wrapping the (tabs) group. Any
 * route outside (tabs) — e.g. /ocr-spike — pushes onto this Stack; without
 * that Stack wrapper, router.push to any non-tab route silently does
 * nothing (learned the hard way, 2026-09-14).
 */
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
  );
}
