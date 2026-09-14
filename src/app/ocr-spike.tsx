/**
 * On-device spike screen for the pdf-lib invisible text layer (plan §13
 * step 1). Not a tab — reached via router.push('/ocr-spike') from the dev
 * menu/home so it stays out of the shipping navigation.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import type { InvisibleTextSpikeResult } from '@/lib/spikes/invisible-text';
import { runInvisibleTextSpike } from '@/lib/spikes/invisible-text';

export default function OcrSpikeScreen() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InvisibleTextSpikeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSpike() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await runInvisibleTextSpike();
      setResult(r);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Invisible text spike
          </ThemedText>
          <ThemedText>
            Verifies pdf-lib can write a searchable-but-invisible (Tr 3) text
            layer — the highest-risk unknown in the plan (§13.1).
          </ThemedText>

          <Pressable onPress={runSpike} disabled={running} style={styles.button}>
            <ThemedText type="defaultSemiBold" style={styles.buttonText}>
              {running ? 'Running…' : 'Run spike'}
            </ThemedText>
          </Pressable>

          {running && <ActivityIndicator size="large" />}

          {error != null && (
            <ThemedView type="backgroundElement" style={styles.statusBox}>
              <ThemedText type="defaultSemiBold">Error</ThemedText>
              <ThemedText type="small">{error}</ThemedText>
            </ThemedView>
          )}

          {result != null && (
            <ThemedView type="backgroundElement" style={styles.statusBox}>
              <ThemedText type="defaultSemiBold">
                {result.passed ? 'PASS' : 'FAIL'}
              </ThemedText>
              <ThemedText type="small">{result.summary}</ThemedText>
              <ThemedText type="small">
                {`contentStreamHasTr3:   ${result.checks.contentStreamHasTr3}\n` +
                  `contentStreamHasWords: ${result.checks.contentStreamHasWords}\n` +
                  `extractedTextMatches:  ${
                    result.checks.extractedTextMatches === null
                      ? 'skipped (Node-only check)'
                      : result.checks.extractedTextMatches
                  }`}
              </ThemedText>
            </ThemedView>
          )}
        </ScrollView>
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
    maxWidth: MaxContentWidth,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  buttonText: {
    textAlign: 'center',
  },
  statusBox: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
