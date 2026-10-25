import { router } from 'expo-router';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Card, ListRow, Text, Icon, type IconName } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { pickFiles, pickPhotos, takePhoto } from '@/lib/attach';
import { useDraft } from '@/store/draft';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

export default function AttachSheet() {
  const { colors } = useTheme();
  const draft = useDraft();
  const settings = useSettings();
  // Close the sheet first: iOS cannot present a system picker over another modal.
  const add = (fn: () => Promise<import('@/store/chats').Attachment[]>) => () => {
    router.back();
    setTimeout(async () => {
      try {
        (await fn()).forEach(useDraft.getState().addFile);
      } catch (e: any) {
        Alert.alert('Could not add that', e?.message ?? 'Try again.');
      }
    }, 450);
  };
  const tiles: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'camera', label: 'Camera', onPress: add(takePhoto) },
    { icon: 'image', label: 'Photos', onPress: add(pickPhotos) },
    { icon: 'file', label: 'Files', onPress: add(pickFiles) },
  ];
  return (
    <RouteSheet title="Add to message" snapPoints={['62%']}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" onPress={t.onPress} style={{ flex: 1, minHeight: 80, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name={t.icon} size={22} color={colors.text} />
            <Text size={13}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <ListRow icon="file" label="Google Drive" value="Connect" onPress={() => router.replace('/connectors')} />
        <ListRow icon="globe" label="Search the web" value={settings.searchEngine === 'searxng' ? 'SearXNG' : settings.searchEngine} onPress={() => { draft.set({ searchOn: true }); router.back(); }} />
        <ListRow icon="sparkle" label="Create an image" value={settings.imageEngine === 'provider' ? 'My endpoint' : settings.imageEngine} onPress={() => { draft.set({ imageOn: true }); router.replace('/image-options'); }} />
        <ListRow icon="layout" label="Build a UI" value={draft.uiOn ? 'On' : undefined} onPress={() => { draft.set({ uiOn: !draft.uiOn }); router.back(); }} />
        <ListRow icon="link" label="Add a web page by link" onPress={() => Alert.prompt?.('Add a web page', 'Paste a URL', async (url) => {
          try {
            const res = await fetch(url);
            const html = await res.text();
            const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000);
            draft.addFile({ id: String(Date.now()), kind: 'file', name: new URL(url).hostname, uri: url, text });
            router.back();
          } catch { Alert.alert('Could not load that page'); }
        }) ?? Linking.canOpenURL('')} last />
      </Card>
      <Text size={12} color="muted" style={{ textAlign: 'center' }}>Up to 10 files, {settings.maxFileMb} MB each · PDF, DOCX, TXT, MD, CSV, code, images</Text>
    </RouteSheet>
  );
}
