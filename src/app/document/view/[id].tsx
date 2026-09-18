/**
 * Fullscreen page viewer (`/document/view/[id]`, user request
 * 2026-09-18): one page at a time with pinch-zoom (max 6×, anchored on
 * the fingers), pan while zoomed, double-tap toggle, and horizontal
 * swiping between pages — locked while a page is zoomed, so a pan can
 * never be stolen by the pager. Pushed from the document detail
 * screen's page cards; `?page=N` (0-based) opens on that page.
 *
 * The surface is deliberately fixed near-black regardless of palette
 * (product decision 2026-09-18): receipts are white, and the
 * Apple-Photos viewer convention — dark surround, white content — is
 * the highest-contrast way to read one. Palette-tinted chrome behind a
 * photograph helps nothing. The full set of fixed chrome values lives
 * in `ViewerChrome` in `src/constants/theme.ts` — stated once there,
 * not as literals here.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ZoomablePage } from '@/components/zoomable-page';
import { Fonts, Spacing, ViewerChrome } from '@/constants/theme';
import { fetchPages } from '@/lib/db/queries';
import { logThrown } from '@/lib/debug-log';
import type { ScanPage } from '@/lib/model';

export default function DocumentViewerScreen() {
  const params = useLocalSearchParams<{ id: string; page?: string }>();
  // Same deep-link paranoia as document detail: a repeated query key
  // or malformed link must never crash the viewer.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const router = useRouter();
  const db = useSQLiteContext();
  // The pager is edge-to-edge, so window dims ARE its layout — and a
  // stable viewport from mount is what makes getItemLayout (and thus
  // initialScrollIndex) sound. NOTE: `app.json` locks orientation to
  // portrait, which is what keeps this viewport stable while a page is
  // zoomed. If rotation is ever unlocked, a zoomed page's transform must
  // be re-clamped against the new viewport on dimensions change —
  // until then the shared values persist but the clamp math
  // (`fitted`/`viewport` captured in the worklets) goes stale, and a
  // mid-zoom rotation leaves the page over-panned past its bounds.
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // True while the ACTIVE page is zoomed — FlatList swiping locks.
  const [zoomLock, setZoomLock] = useState(false);
  // Scroll handlers read the current index without waiting for the
  // state roundtrip; zoom reports filter against it.
  const activeIndexRef = useRef(0);

  useEffect(() => {
    if (id == null) {
      return;
    }
    fetchPages(db, id)
      .then((rows) => {
        setPages(rows);
        const initial = parsePageIndex(pageParam, rows.length);
        setActiveIndex(initial);
        activeIndexRef.current = initial;
      })
      .catch((e: unknown) => logThrown('viewer-load', e));
  }, [db, id, pageParam]);

  const initialIndex = pages == null ? 0 : parsePageIndex(pageParam, pages.length);

  /** Only the page actually on screen may lock/unlock swiping — resets
   *  and windowed neighbors must not clobber the active page's state. */
  function onPageZoomed(pageIndex: number, zoomed: boolean) {
    if (pageIndex !== activeIndexRef.current) {
      return;
    }
    setZoomLock(zoomed);
  }

  return (
    <View style={styles.screen}>
      {pages == null ? (
        <ActivityIndicator color={ViewerChrome.progress} style={styles.loader} />
      ) : pages.length === 0 ? (
        <View style={styles.loader}>
          <Text style={styles.emptyText}>No pages in this document.</Text>
        </View>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomLock}
          showsHorizontalScrollIndicator={false}
          // Full-res scans: keep one page of headroom either side, not
          // the default window of ~10 screens of images.
          windowSize={3}
          getItemLayout={(_, index) => ({
            length: viewport.width,
            offset: viewport.width * index,
            index,
          })}
          initialScrollIndex={initialIndex}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / viewport.width);
            if (next !== activeIndexRef.current) {
              activeIndexRef.current = next;
              setActiveIndex(next);
            }
          }}
          renderItem={({ item, index }) => (
            <ZoomablePage
              page={item}
              viewport={viewport}
              pageIndex={index}
              onZoomedChange={onPageZoomed}
            />
          )}
        />
      )}

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close viewer"
        hitSlop={8}
        style={[styles.closeButton, { top: insets.top + Spacing.two }]}>
        <SymbolView
          name={{ ios: 'xmark', android: 'close' }}
          size={20}
          tintColor={ViewerChrome.foreground}
        />
      </Pressable>

      {pages != null && pages.length > 1 && (
        <Text style={[styles.indicator, { bottom: insets.bottom + Spacing.two }]}>
          {activeIndex + 1} / {pages.length}
        </Text>
      )}
    </View>
  );
}

/** Clamp the `?page=` URL param to a real page — missing, malformed or
 *  out-of-range values all fall back to the first page. */
function parsePageIndex(raw: string | undefined, pageCount: number): number {
  const requested = raw == null ? 0 : Number(raw);
  const base = Number.isFinite(requested) ? Math.trunc(requested) : 0;
  return Math.min(Math.max(0, base), Math.max(0, pageCount - 1));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ViewerChrome.background,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: ViewerChrome.foregroundDim,
    fontSize: 15,
  },
  closeButton: {
    position: 'absolute',
    left: Spacing.two,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ViewerChrome.controlScrim,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: ViewerChrome.foregroundDim,
  },
});
