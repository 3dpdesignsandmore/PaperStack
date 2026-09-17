/**
 * Document detail (plan §8, Phase 2): full-page viewer for one document's
 * pages, with export (as-is or combined N-up), rename, add-pages, and
 * delete. Reached from a Library card via router.push('/document/[id]').
 */
import { Directory } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { CenteredMessage } from '@/components/centered-message';
import { PromptDialog } from '@/components/prompt-dialog';
import { ScreenHeader } from '@/components/screen-header';
import { SendSheet } from '@/components/send-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/hooks/use-theme';
import { fetchReceiptData, saveReceiptData } from '@/lib/db/ocr-queries';
import { appendScanSession, persistOptionsFromSetting, scanRootDir } from '@/lib/db/persist-scan';
import {
    addTagToDocument,
    fetchDocument,
    fetchDocumentTags,
    fetchPages,
    getSetting,
    removeTagFromDocument,
    renameDocument,
    reorderPages,
    SCAN_MULTI_PAGE_KEY,
    SCAN_QUALITY_KEY,
    type TagRow,
} from '@/lib/db/queries';
import { logInfo, logThrown } from '@/lib/debug-log';
import type { ReceiptData, ScanDocument, ScanPage } from '@/lib/model';
import { runOcrForDocument } from '@/lib/ocr/pipeline';
import { scanPages } from '@/lib/scanner';

export default function DocumentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // expo-router params can legitimately be `string[]` (repeated query keys)
  // or missing entirely for a malformed deep link — never trust the typed
  // hint alone.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const db = useSQLiteContext();
  const theme = useTheme();

  const [document, setDocument] = useState<ScanDocument | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  // Reorder mode (Phase 2): the local order is mutated by move buttons and
  // committed atomically via `reorderPages` on Done; cancel just drops it
  // and `load()` restores the DB order.
  const [reordering, setReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<ScanPage[]>([]);
  // The just-exported file the send sheet offers recipient sends for.
  const [sentFile, setSentFile] = useState<{ uri: string; subject: string } | null>(null);
  // Tags on this document (Phase 2).
  const [tags, setTags] = useState<TagRow[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  // Real bottom inset for the pinned action bar — `bottom` on an absolute
  // view is measured from its parent's edge, and SafeAreaView padding does
  // NOT offset it (that cost the previous fix: the bar sat under the
  // Android gesture bar). Same technique as Library's selection toolbar.
  const insets = useSafeAreaInsets();
  // Receipt fields for the first page (OCR, plan §6). null = OCR hasn't
  // produced anything to show; 'pending' = the quiet reading state while
  // the background pipeline works; a ReceiptData = extracted fields,
  // editable — corrections set userEdited so a re-run can't clobber them.
  const [receipt, setReceipt] = useState<ReceiptData | 'pending' | null>(null);
  // True while the explicit "Read text" button is re-running recognition
  // for this document (busy state on the button).
  const [reading, setReading] = useState(false);

  const load = useCallback(async () => {
    if (id == null) {
      setMissing(true);
      return;
    }
    const [doc, docPages, docTags] = await Promise.all([
      fetchDocument(db, id),
      fetchPages(db, id),
      fetchDocumentTags(db, id),
    ]);
    if (doc == null) {
      setMissing(true);
      return;
    }
    setDocument(doc);
    setPages(docPages);
    setTags(docTags);
    // Receipt-style fields follow OCR (plan §6): a first page with an
    // extracted row shows it; no row yet means the background pipeline
    // may still be working — 'pending' renders the quiet reading state and
    // two polls (short + long) pick the result up when it lands. If nothing
    // lands, the status line keeps "Reading document…" with the Read-text
    // button beside it — pre-OCR documents have no results and no
    // automatic path to get them; the button is that path.
    const firstPage = docPages[0];
    if (firstPage != null) {
      const extracted = await fetchReceiptData(db, firstPage.id);
      if (extracted != null) {
        setReceipt(extracted);
      } else {
        setReceipt('pending');
        const poll = async () => {
          try {
            const late = await fetchReceiptData(db, firstPage.id);
            if (late != null) {
              setReceipt(late);
            }
          } catch (e: unknown) {
            logThrown('receipt-poll', e);
          }
        };
        setTimeout(() => void poll(), 2500);
        setTimeout(() => void poll(), 9000);
      }
    } else {
      setReceipt(null);
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e: unknown) => logThrown('document-load', e));
    }, [load]),
  );

  async function onDelete() {
    if (document == null) {
      return;
    }
    Alert.alert(
      'Delete document',
      `Delete "${document.title}" and its ${pages?.length ?? 0} page(s)? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // DB first (cascade removes pages), then files.
              await db.runAsync('DELETE FROM scan_documents WHERE id = ?', [
                document.id,
              ]);
              const dir = new Directory(scanRootDir(), document.id);
              if (dir.exists) {
                dir.delete();
              }
            } catch (e: unknown) {
              logThrown('delete-document', e);
              const message = e instanceof Error ? e.message : String(e);
              Alert.alert('Delete failed', message);
              return;
            }
            router.back();
          },
        },
      ],
    );
  }

  async function onAddPages() {
    if (id == null) {
      return;
    }
    setAdding(true);
    try {
      // Same settings as the Scan flow: quality for the scanner's own
      // JPEGs and for our re-encode, multi-page cap on Android.
      const [quality, multiPage] = await Promise.all([
        getSetting(db, SCAN_QUALITY_KEY),
        getSetting(db, SCAN_MULTI_PAGE_KEY),
      ]);
      const { pageUris } = await scanPages({
        croppedImageQuality: quality == null ? undefined : Number(quality),
        maxNumDocuments: multiPage === 'false' ? 1 : undefined,
      });
      if (pageUris.length === 0) {
        return;
      }
      await appendScanSession(db, pageUris, id, persistOptionsFromSetting(quality));
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Add pages failed', message);
    } finally {
      setAdding(false);
    }
  }

  /** Send flow entry: go straight to the Combine screen, defaulting to
   * one scan per page — the old "one per page or combine?" prompt is
   * gone; the column chips there cover every density anyway. */
  function onExport() {
    if (document == null) {
      return;
    }
    router.push(`/compose?id=${document.id}`);
  }

  /** Explicit OCR for THIS document (user-requested 2026-09-17): re-runs
   * the pipeline over its pages on demand. This is the path pre-OCR
   * documents (saved before the engine shipped) have to get a text layer
   * and receipt fields — nothing back-fills them otherwise — and the
   * manual control for "I want THIS page read". Re-runs refresh the raw
   * text but never clobber corrected fields (respectUserEdits inside
   * the pipeline). */
  async function onReadText(): Promise<void> {
    if (id == null || reading) {
      return;
    }
    setReading(true);
    try {
      await runOcrForDocument(db, id);
      const firstPage = pages?.[0];
      if (firstPage != null) {
        const extracted = await fetchReceiptData(db, firstPage.id);
        if (extracted != null) {
          setReceipt(extracted);
        }
      }
    } catch (e: unknown) {
      logThrown('read-text', e);
      Alert.alert('Read text failed', e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  /** Persist a correction to one receipt field (plan §6: every extracted
   * value is editable; corrections must never be clobbered by a re-run).
   * `respectUserEdits` is false here — the user's own edit IS the edit. */
  function updateReceipt(patch: Partial<Omit<ReceiptData, 'pageId'>>): void {
    setReceipt((current) => {
      if (current == null || current === 'pending') {
        return current;
      }
      const next: ReceiptData = {
        ...current,
        ...patch,
        userEdited: true,
      };
      const pageId = next.pageId;
      saveReceiptData(db, next, false).catch((e: unknown) => {
        logThrown('receipt-edit', e);
        Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      });
      void pageId;
      return next;
    });
  }

  const receiptCard =
    receipt === 'pending' ? (
      <View style={styles.receiptBar}>
        <ThemedText type="small" style={[styles.receiptHint, { color: theme.textSecondary }]}>
          Reading document…
        </ThemedText>
        <AppButton
          label={reading ? 'Reading…' : 'Read text'}
          variant="outline"
          onPress={() => void onReadText()}
          disabled={reading}
          loading={reading}
        />
      </View>
    ) : receipt == null ? null : (
      <View style={styles.receiptBar}>
        <TextInput
          style={[styles.receiptInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          value={receipt.merchant ?? ''}
          onChangeText={(merchant) => updateReceipt({ merchant: merchant.trim() === '' ? null : merchant })}
          placeholder="Merchant"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          underlineColorAndroid="transparent"
          accessibilityLabel="Merchant"
        />
        <TextInput
          style={[styles.receiptInput, styles.receiptInputNarrow, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          value={receipt.date == null ? '' : new Date(receipt.date).toISOString().slice(0, 10)}
          onChangeText={(text) => {
            const parsed = Date.parse(`${text}T00:00:00Z`);
            updateReceipt({ date: Number.isNaN(parsed) ? null : parsed });
          }}
          placeholder="Date"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          underlineColorAndroid="transparent"
          accessibilityLabel="Date"
        />
        <TextInput
          style={[styles.receiptInput, styles.receiptInputNarrow, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          value={receipt.total == null ? '' : String(receipt.total)}
          onChangeText={(text) => {
            const value = Number(text);
            updateReceipt({ total: Number.isFinite(value) ? value : null });
          }}
          placeholder="Total"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          underlineColorAndroid="transparent"
          keyboardType="decimal-pad"
          accessibilityLabel="Total"
        />
      </View>
    );

  if (missing) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Document" />
          <ThemedView style={styles.center}>
            <ThemedText>Document not found.</ThemedText>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="linkPrimary">Back to Library</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (document == null || pages == null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Document" />
          <CenteredMessage message="Loading…" spinner />
        </SafeAreaView>
      </ThemedView>
    );
  }

  /* ---------------- Reorder (Phase 2) ---------------- */

  function enterReorder() {
    if (pages == null) {
      return;
    }
    setDraftOrder([...pages]);
    setReordering(true);
  }

  function movePage(pageId: string, delta: -1 | 1) {
    setDraftOrder((prev) => {
      const index = prev.findIndex((page) => page.id === pageId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  async function commitReorder() {
    if (id == null || pages == null) {
      setReordering(false);
      return;
    }
    setReordering(false);
    // Only write when the order actually changed — a no-op commit would
    // still bump `updated_at` and rewrite every row for nothing.
    if (draftOrder.some((page, index) => pages[index]?.id !== page.id)) {
      try {
        await reorderPages(db, id, draftOrder.map((page) => page.id));
        await load();
      } catch (e: unknown) {
        logThrown('reorder-pages', e);
        const message = e instanceof Error ? e.message : String(e);
        Alert.alert('Reorder failed', message);
      }
    }
    setDraftOrder([]);
  }

  function cancelReorder() {
    setReordering(false);
    setDraftOrder([]);
  }

  /* ---------------- Tags (Phase 2) ---------------- */

  async function onAddTag(name: string) {
    if (id == null) {
      return;
    }
    try {
      await addTagToDocument(db, id, name);
      setTags(await fetchDocumentTags(db, id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not add tag', message);
    }
  }

  async function onRemoveTag(tagId: string) {
    if (id == null) {
      return;
    }
    try {
      await removeTagFromDocument(db, id, tagId);
      setTags(await fetchDocumentTags(db, id));
    } catch (e: unknown) {
      logThrown('remove-tag', e);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Could not remove tag', message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      {/* One SafeAreaView wraps the WHOLE column (header → receipt →
          tags → pages → actions). The earlier "align the header" change
          closed it right after the header, leaving every sibling below
          (receipt bar, tags, the page list, the action bar) as a child
          of the row-flex MaxContentWidth scaffold — the screen laid out
          horizontally, squeezing pages and misplacing buttons (regression
          fixed 2026-09-17). */}
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScreenHeader title={document.title} />
        {/* Receipt fields (OCR, plan §6): extracted values as editable
            inputs — "design the receipt detail screen around correction,
            not display". Corrections set userEdited so an OCR re-run
            never clobbers them. 'pending' is the quiet reading state. */}
        {!reordering && receiptCard}
        {/* Tags row (Phase 2): chips plus add. Hidden while reordering —
            reordering is about the pages, not the metadata. */}
        {!reordering && (
        <View style={styles.tagBar}>
          {tags.map((tag) => (
            <Pressable
              key={tag.id}
              onPress={() => void onRemoveTag(tag.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag.name}`}
              style={[styles.tagChip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {tag.name} ✕
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setAddingTag(true)}
            accessibilityRole="button"
            accessibilityLabel="Add tag"
            style={[styles.tagChip, styles.tagAddChip, { borderColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              + Tag
            </ThemedText>
          </Pressable>
        </View>
      )}
      {reordering ? (
        <FlatList
          data={draftOrder}
          keyExtractor={(page) => page.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <AppCard style={styles.pageCard}>
              <View style={styles.reorderRow}>
                <Image
                  source={{ uri: item.imagePath }}
                  style={styles.reorderThumb}
                  contentFit="cover"
                  recyclingKey={item.id}
                  transition={150}
                />
                <ThemedText type="small" style={styles.reorderLabel}>
                  Page {index + 1} of {draftOrder.length}
                </ThemedText>
                <View style={styles.reorderButtons}>
                  <Pressable
                    onPress={() => movePage(item.id, -1)}
                    disabled={index === 0}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Move page ${index + 1} up`}>
                    <SymbolView
                      name={{ ios: 'arrow.up', android: 'arrow_upward' }}
                      size={20}
                      tintColor={index === 0 ? theme.border : theme.text}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => movePage(item.id, 1)}
                    disabled={index === draftOrder.length - 1}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Move page ${index + 1} down`}>
                    <SymbolView
                      name={{ ios: 'arrow.down', android: 'arrow_downward' }}
                      size={20}
                      tintColor={index === draftOrder.length - 1 ? theme.border : theme.text}
                    />
                  </Pressable>
                </View>
              </View>
            </AppCard>
          )}
        />
      ) : (
      <FlatList
        data={pages}
        keyExtractor={(page) => page.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <AppCard style={styles.pageCard}>
            <Image
              source={{ uri: item.imagePath }}
              style={[styles.pageImage, { aspectRatio: item.widthPx / item.heightPx }]}
              contentFit="contain"
              recyclingKey={item.id}
              transition={150}
            />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Page {index + 1} of {pages.length} · {item.widthPx}×{item.heightPx}
            </ThemedText>
          </AppCard>
        )}
      />
      )}

      {/* Action bar: floating pill pinned above the system nav/gesture
          area (measured inset — see the comment at `insets`), list
          scrolling beneath it. Swaps to Done/Cancel while reordering. */}
      {reordering ? (
        <ThemedView type="backgroundElement" style={[styles.actionBar, CardShadow(theme.shadow), { bottom: insets.bottom + Spacing.two }]}>
          <AppButton label="Done" onPress={() => void commitReorder()} style={styles.reorderDone} />
          <AppButton label="Cancel" variant="outline" onPress={cancelReorder} style={styles.reorderDone} />
        </ThemedView>
      ) : (
        <ThemedView type="backgroundElement" style={[styles.actionBar, CardShadow(theme.shadow), { bottom: insets.bottom + Spacing.two }]}>
          <ActionBarItem
            icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
            label="Send"
            color={theme.accent}
            onPress={onExport}
          />
          <ActionBarItem
            icon={{ ios: 'pencil', android: 'edit' }}
            label="Rename"
            color={theme.text}
            onPress={() => setRenaming(true)}
          />
          <ActionBarItem
            icon={{ ios: 'arrow.up.arrow.down', android: 'swap_vert' }}
            label="Reorder"
            color={theme.text}
            onPress={enterReorder}
            disabled={(pages?.length ?? 0) < 2}
          />
          <ActionBarItem
            icon={{ ios: 'doc.badge.plus', android: 'note_add' }}
            label={adding ? 'Adding…' : 'Add pages'}
            color={theme.text}
            onPress={onAddPages}
            disabled={adding}
          />
          <ActionBarItem
            icon={{ ios: 'trash', android: 'delete' }}
            label="Delete"
            color={theme.danger}
            onPress={onDelete}
          />
        </ThemedView>
      )}
      </SafeAreaView>

      <PromptDialog
        visible={renaming}
        title="Rename document"
        initialValue={document.title}
        confirmLabel="Rename"
        onConfirm={async (title) => {
          setRenaming(false);
          await renameDocument(db, document.id, title);
          await load();
        }}
        onCancel={() => setRenaming(false)}
      />

      <PromptDialog
        visible={addingTag}
        title="Add tag"
        message="A short label for this document, e.g. Taxes 2026."
        placeholder="Tag name"
        confirmLabel="Add"
        onConfirm={(name) => {
          setAddingTag(false);
          void onAddTag(name);
        }}
        onCancel={() => setAddingTag(false)}
      />

      {/* Post-export send sheet (Phase 7): one-tap sends to saved
          recipients after the shared-out PDF is written. */}
      <SendSheet
        visible={sentFile != null}
        fileUri={sentFile?.uri ?? ''}
        subject={sentFile?.subject ?? document.title}
        onClose={() => {
          const file = sentFile;
          setSentFile(null);
          if (file != null) {
            logInfo('export', `send sheet closed for ${file.subject}`);
          }
        }}
        onShareViaOs={async () => {
          const file = sentFile;
          if (file == null) {
            return;
          }
          await import('expo-sharing').then((m) =>
            m.shareAsync(file.uri, {
              mimeType: 'application/pdf',
              dialogTitle: file.subject,
              UTI: 'com.adobe.pdf',
            }),
          );
          setSentFile(null);
        }}
      />
    </ThemedView>
  );
}

/** Props for {@link ActionBarItem}. */
interface ActionBarItemProps {
  icon: SymbolViewProps['name'];
  label: string;
  /** Icon + label tint — accent for the primary action, danger for the
   * destructive one, `theme.text` for the rest. */
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * One icon-over-label item in the floating action bar — same visual
 * language as `FloatingTabBar`'s items (icon, small non-uppercase label,
 * press feedback), so this screen's actions read as part of the same app
 * instead of a separate row of pill buttons.
 */
function ActionBarItem({ icon, label, color, onPress, disabled = false }: ActionBarItemProps) {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const tint = disabled ? color + '80' : color;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.actionItemHitArea}>
      <Animated.View style={[styles.actionItem, animatedStyle]}>
        <SymbolView name={icon} size={22} tintColor={tint} />
        <ThemedText type="label" style={[styles.actionItemLabel, { color: tint }]}>
          {label}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The standard screen scaffold: a centered column capped at
  // MaxContentWidth, so the header (wordmark + title) sits at the same
  // left edge as Home/Library/Settings on every screen width.
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  listContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    // Clear the floating action bar so the last page scrolls fully
    // above it (bar ≈ 64px + inset + gap).
    paddingBottom: 120,
  },
  tagBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  receiptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  receiptHint: {
    flexShrink: 1,
  },
  receiptInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  receiptInputNarrow: {
    flex: 0,
    minWidth: 92,
  },
  tagChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  tagAddChip: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  reorderThumb: {
    width: 56,
    height: 72,
    borderRadius: Radius.small,
    backgroundColor: '#80808040',
  },
  reorderLabel: {
    flex: 1,
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  reorderDone: {
    flex: 1,
  },
  pageCard: {
    padding: Spacing.two,
    gap: Spacing.one,
    alignItems: 'center',
  },
  pageImage: {
    width: '100%',
    // The scan's own aspect ratio, set inline per page (each page knows
    // its dimensions) — a fixed 3:4 cropped tall receipts and stretched
    // wide ones (part of the 2026-09-17 layout regression).
    alignSelf: 'stretch',
    minHeight: 120,
    borderRadius: Radius.small,
    backgroundColor: '#80808040',
  },
  // Same pill silhouette as the floating tab bar, sized for four icon+label
  // items instead of three tab items. `bottom` is set inline from the
  // measured safe-area inset (see the `insets` comment in the component) —
  // a static bottom here would tuck the bar under the system nav area
  // on gesture-nav devices.
  actionBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  actionItemHitArea: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionItem: {
    alignItems: 'center',
    gap: 2,
  },
  actionItemLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
