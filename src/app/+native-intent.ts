/**
 * Native-intent hook (`src/app/+native-intent.ts`, Expo Router's
 * customizing-links mechanism): rewrites the URL the OS emits for an
 * incoming share onto the intake route.
 *
 * When an image is shared to PaperStack (Android share sheet's SEND
 * intent; iOS share extension), expo-sharing's native layer surfaces it
 * to the router as `<scheme>://expo-sharing` — the payload itself
 * never travels inside the URL, it waits in the module's singleton /
 * app-group store for `useIncomingShare()` on the intake route. This
 * hook's only job is to translate that marker URL into a route the app
 * knows, both when the share cold-launches the app (`initial: true`)
 * and when it arrives mid-session (`initial: false`).
 *
 * The hook must never throw (a throw here can crash the app during
 * linking) and must return the path untouched when it is not ours.
 */
import { isShareIntentUrl, SHARE_INTAKE_PATH } from '@/lib/share-target';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isShareIntentUrl(path)) {
      return SHARE_INTAKE_PATH;
    }
  } catch {
    // Handled isShareIntentUrl's contract — kept for safety: a linking
    // hook that throws can crash the whole app.
  }
  return path;
}
