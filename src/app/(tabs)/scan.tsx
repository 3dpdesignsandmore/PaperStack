/**
 * Scan route (plan/UI.md §1, §4): no UI of its own. It exists so a deep
 * link or `router.push('/scan')` still resolves to something — the normal
 * path is the floating tab bar intercepting the Scan press and calling
 * `useCapture()` directly without ever navigating here (see
 * `floating-tab-bar.tsx`). On focus this route runs the same capture flow
 * and either pushes the new document or, on cancel, goes back to wherever
 * the user came from.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { SaveScanDialog } from '@/components/save-scan-dialog';
import { ThemedView } from '@/components/themed-view';
import { useCapture } from '@/hooks/use-capture';

export default function ScanRoute() {
  const router = useRouter();
  const { capture, dialog } = useCapture();
  const triggered = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (triggered.current) {
        return;
      }
      triggered.current = true;
      (async () => {
        const documentId = await capture();
        triggered.current = false;
        if (documentId != null) {
          router.replace(`/document/${documentId}`);
        } else {
          router.back();
        }
      })();
    }, [capture, router]),
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <SaveScanDialog {...dialog} />
    </ThemedView>
  );
}
