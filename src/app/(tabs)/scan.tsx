/**
 * Scan tab (plan §8): launches the native document scanner — Apple
 * VisionKit on iOS, ML Kit Document Scanner on Android — and persists the
 * captured pages through the pipeline in `@/lib/db/persist-scan`:
 * long-edge downscale → JPEG compress → documents/scans/ → SQLite rows.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppCard } from '@/components/app-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, CardShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useTheme } from '@/hooks/use-theme';
import { appendScanSession, persistScanSession } from '@/lib/db/persist-scan';
import {
    fetchLibrary,
    getSetting,
    SCAN_NAME_PREFIX_KEY,
} from '@/lib/db/queries';
import { DocumentKind, type LibraryEntry } from '@/lib/model';
import { scanPages } from '@/lib/scanner';

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const db = useSQLiteContext();
  const theme = useTheme();

  // Pending session awaiting a save decision (name + new-vs-append).
  const [pendingUris, setPendingUris] = useState<string[] | null>(null);
  const [recentDocs, setRecentDocs] = useState<LibraryEntry[]>([]);
  // Name field, seeded from the configured prefix each time the dialog opens.
  const [saveName, setSaveName] = useState('');

  async function startScan() {
    setScanning(true);
    try {
      const { pageUris } = await scanPages();
      if (pageUris.length === 0) {
        return; // user cancelled
      }
      // Capture the session, then ask how to file it before persisting.
      const [docs, prefix] = await Promise.all([
        fetchLibrary(db),
        getSetting(db, SCAN_NAME_PREFIX_KEY),
      ]);
      setRecentDocs(docs);
      setSaveName(prefix ?? '');
      setPendingUris(pageUris);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Scan failed', message);
    } finally {
      setScanning(false);
    }
  }

  function closeDialog() {
    setPendingUris(null);
  }

  async function saveAsNew() {
    if (pendingUris == null) {
      return;
    }
    const title = saveName.trim();
    if (title.length === 0) {
      return;
    }
    const uris = pendingUris;
    closeDialog();
    try {
      await persistScanSession(db, uris, title, DocumentKind.Document);
      Alert.alert('Saved', `"${title}" is in your Library.`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
    }
  }

  async function saveAppend(target: LibraryEntry) {
    if (pendingUris == null) {
      return;
    }
    const uris = pendingUris;
    closeDialog();
    try {
      await appendScanSession(db, uris, target.id);
      Alert.alert('Saved', `Added to "${target.title}".`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <AppCard style={styles.card}>
          <ThemedView style={styles.labelWrap}>
            <ThemedText type="label" style={{ color: theme.accent }}>
              Capture
            </ThemedText>
          </ThemedView>
          <ThemedText type="title" style={styles.emoji}>📷</ThemedText>
          <ThemedText type="subtitle">Scan a document</ThemedText>
          <ThemedText type="small" style={styles.hint}>
            Edge detection and perspective correction are handled by your
            platform&apos;s native scanner. Capture one or many pages.
          </ThemedText>
          <AppButton
            label="Open scanner"
            onPress={startScan}
            loading={scanning}
            disabled={scanning}
            style={styles.scanButton}
          />
        </AppCard>
      </SafeAreaView>

      {/*
       * Save flow: name it, or append to an existing document — both
       * options live in ONE Modal. They used to be two separate pieces
       * (a shared PromptDialog plus a sibling "append sheet" positioned
       * absolutely in the screen below it) — a Modal always renders in
       * its own native layer above the rest of the screen, so that sheet
       * was permanently hidden behind the dialog's backdrop and never
       * reachable. Keeping both options inside the same Modal is what
       * actually makes "add to an existing document" usable.
       */}
      <SaveScanDialog
        visible={pendingUris != null}
        pageCount={pendingUris?.length ?? 0}
        name={saveName}
        onChangeName={setSaveName}
        recentDocs={recentDocs}
        onSaveAsNew={saveAsNew}
        onAppend={saveAppend}
        onCancel={closeDialog}
      />
    </ThemedView>
  );
}

/** Props for {@link SaveScanDialog}. */
interface SaveScanDialogProps {
  visible: boolean;
  pageCount: number;
  name: string;
  onChangeName: (value: string) => void;
  recentDocs: LibraryEntry[];
  onSaveAsNew: () => void;
  onAppend: (target: LibraryEntry) => void;
  onCancel: () => void;
}

/**
 * Save-flow dialog for a just-captured scan session: name it as a new
 * document, or tap an existing one to append to instead. One Modal, so
 * both options are always visible together (see the comment above).
 */
function SaveScanDialog({
  visible,
  pageCount,
  name,
  onChangeName,
  recentDocs,
  onSaveAsNew,
  onAppend,
  onCancel,
}: SaveScanDialogProps) {
  const theme = useTheme();

  // Reset the append list's scroll position each time the dialog reopens,
  // so a stale offset from a previous scan session doesn't carry over.
  const [listKey, setListKey] = useState(0);
  useResetOnOpen(visible, () => setListKey((k) => k + 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.dialogCard, CardShadow, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">Save {pageCount} page{pageCount === 1 ? '' : 's'}</ThemedText>
          <ThemedText type="small" style={[styles.dialogMessage, { color: theme.textSecondary }]}>
            {recentDocs.length > 0
              ? 'Name this scan as a new document, or add these pages to an existing one below.'
              : 'Name this scan.'}
          </ThemedText>

          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
            ]}
            value={name}
            onChangeText={onChangeName}
            placeholder="e.g. Groceries Sept 14"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="done"
            onSubmitEditing={onSaveAsNew}
          />
          <AppButton label="Save as new" onPress={onSaveAsNew} disabled={name.trim().length === 0} />

          {recentDocs.length > 0 && (
            <>
              <ThemedText type="label" style={{ color: theme.textSecondary }}>
                Or add to an existing document
              </ThemedText>
              <ScrollView key={listKey} style={styles.appendList} keyboardShouldPersistTaps="handled">
                {recentDocs.slice(0, 10).map((doc) => (
                  <Pressable
                    key={doc.id}
                    onPress={() => onAppend(doc)}
                    style={({ pressed }) => [
                      styles.appendRow,
                      { borderColor: theme.border },
                      pressed && { backgroundColor: theme.backgroundElement },
                    ]}>
                    <ThemedText numberOfLines={1} style={styles.appendTitle}>
                      {doc.title}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          <AppButton label="Cancel" variant="outline" onPress={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
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
    maxWidth: MaxContentWidth,
  },
  card: {
    flex: 1,
    margin: Spacing.four,
    marginBottom: BottomTabInset + Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  labelWrap: {
    alignSelf: 'flex-start',
  },
  emoji: {
    fontSize: 48,
    lineHeight: 56,
    marginBottom: Spacing.one,
  },
  hint: {
    textAlign: 'center',
    maxWidth: 320,
  },
  scanButton: {
    marginTop: Spacing.three,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialogCard: {
    borderRadius: Radius.large,
    borderWidth: 1,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    gap: Spacing.three,
  },
  dialogMessage: {
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  appendList: {
    maxHeight: 220,
  },
  appendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
    marginBottom: Spacing.half,
  },
  appendTitle: {
    flexShrink: 1,
  },
});
