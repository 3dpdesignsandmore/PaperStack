import { Stack } from 'expo-router';

/**
 * Root layout: a Stack wrapping the (tabs) group. Any route outside (tabs) —
 * e.g. /ocr-spike — pushes onto this Stack; the docs' prescribed structure
 * for native tabs apps ("Stacks inside tabs" also implies a root stack for
 * non-tab routes like detail screens, plan §8).
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
