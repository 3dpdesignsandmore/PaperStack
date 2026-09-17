/**
 * Legal document route (/legal/privacy, /legal/terms): renders one of the
 * short bundled markdown documents from src/content as styled text.
 *
 * No markdown library and no new dependency — these documents are a
 * handful of paragraphs each, so a minimal line renderer (headings,
 * emphasis-ish paragraphs, plausible list items) is the whole job. No
 * network access: the text ships inside the app bundle.
 */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal-docs';

export default function LegalScreen() {
  const theme = useTheme();
  // expo-router params can be `string[]` (repeated keys) or missing —
  // never trust the typed hint alone.
  const raw = useLocalSearchParams<{ doc?: string }>().doc;
  const docId = (Array.isArray(raw) ? raw[0] : raw) as LegalDocId | undefined;
  const doc = docId != null ? LEGAL_DOCS[docId] : undefined;

  if (doc == null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader title="Legal" />
          <View style={styles.center}>
            <ThemedText>Document not found.</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title={doc.title} />
        <ScrollView contentContainerStyle={styles.content}>
          {doc.paragraphs.map((text, index) => (
            <ThemedText
              key={index}
              type={text.heading ? 'subtitle' : 'default'}
              style={[
                styles.paragraph,
                text.heading && styles.heading,
                !text.heading && { color: theme.text },
              ]}>
              {text.heading ? text.text : text.text}
            </ThemedText>
          ))}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  paragraph: {
    lineHeight: 22,
  },
  heading: {
    marginTop: Spacing.two,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
