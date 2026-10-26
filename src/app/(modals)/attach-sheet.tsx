import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Banner, Button, Field, Icon, ListRow, Note, Text, type IconName } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { pickFiles, pickPhotos, takePhoto } from '@/lib/attach';
import { isDesktop } from '@/lib/device';
import { CONNECTORS } from '@/lib/mcp-connect';
import { readWebPage } from '@/lib/search';
import { useDraft } from '@/store/draft';
import { useLibrary } from '@/store/library';
import { useSettings, type Settings } from '@/store/settings';
import { useTheme } from '@/theme';

const SEARCH: Record<Settings['searchEngine'], string> = { provider: 'My endpoint', searxng: 'SearXNG', brave: 'Brave', tavily: 'Tavily' };
const IMAGE: Record<Settings['imageEngine'], string> = { provider: 'My endpoint', comfyui: 'ComfyUI', a1111: 'A1111' };

export default function AttachSheet() {
  const { colors } = useTheme();
  const draft = useDraft();
  const settings = useSettings();
  const servers = useLibrary((s) => s.servers);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  const addLink = async () => {
    if (!link?.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const page = await readWebPage(link);
      draft.addFile({ id: String(Date.now()), kind: 'file', name: page.title, uri: page.url, text: `${page.title}\n${page.url}\n\n${page.text}`, meta: `${Math.round(page.text.length / 1000)}k chars` });
      router.back();
    } catch (e: any) {
      setError(e?.message === 'Network request failed' ? 'Couldn’t reach that page. Check the address.' : e?.message ?? 'Couldn’t load that page.');
    } finally {
      setBusy(false);
    }
  };

  /** A storage connector: tap to pick from it with the system file picker once connected, or to connect it. */
  const storage = (key: 'gdrive' | 'icloud', icon: IconName) => {
    const c = CONNECTORS.find((x) => x.key === key)!;
    const on = servers.some((s) => s.isConnector && s.name === c.name && s.connected);
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        onPress={on ? add(pickFiles) : () => router.replace({ pathname: '/connector-auth', params: { key } })}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 50, paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}>
        <Icon name={icon} size={19} color={colors.muted} />
        <Text style={{ flex: 1 }}>{c.name}</Text>
        <Text size={13} color={on ? 'muted' : 'accent'}>{on ? 'Connected' : 'Connect'}</Text>
      </Pressable>
    );
  };

  const tiles: { icon: IconName; label: string; onPress: () => void }[] = [
    ...(isDesktop ? [] : [{ icon: 'camera' as const, label: 'Camera', onPress: add(takePhoto) }]),
    { icon: 'image', label: 'Photos', onPress: add(pickPhotos) },
    { icon: 'file', label: 'Files', onPress: add(pickFiles) },
  ];
  return (
    <RouteSheet title="Add to message" bare>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tiles.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" onPress={t.onPress} style={({ pressed }) => ({ flex: 1, height: 76, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
            <Icon name={t.icon} size={21} color={colors.text} />
            <Text size={13}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View>
        {storage('gdrive', 'drive')}
        {Platform.OS === 'ios' ? storage('icloud', 'cloud') : null}
        <ListRow icon="globe" label="Search the web" value={SEARCH[settings.searchEngine]} height={50} chevron={false} onPress={() => { draft.set({ searchOn: true }); router.back(); }} />
        <ListRow icon="sparkle" label="Create an image" value={IMAGE[settings.imageEngine]} height={50} chevron={false} onPress={() => { draft.set({ imageOn: true }); router.replace('/image-options'); }} />
        <ListRow icon="layout" label="Build a UI" value={draft.uiOn ? 'On for the next message' : 'For the next message'} height={50} chevron={false} onPress={() => { draft.set({ uiOn: !draft.uiOn }); router.back(); }} />
        <ListRow icon="link" label="Add a web page by link" height={50} chevron={false} onPress={() => { setLink(link == null ? '' : null); setError(''); }} />
      </View>
      {link != null && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field label="Web page" value={link} onChangeText={(t) => { setLink(t); setError(''); }} mono keyboardType="url" autoCapitalize="none" autoCorrect={false} autoFocus returnKeyType="go" onSubmitEditing={addLink} placeholder="https://…" error={!!error} />
            </View>
            <Button label={busy ? 'Adding…' : 'Add'} height={46} onPress={addLink} disabled={!link.trim() || busy} />
          </View>
          {error ? <Banner tone="danger">{error}</Banner> : null}
        </View>
      )}
      <Note>{`Up to 10 files, ${settings.maxFileMb} MB each · PDF, DOCX, TXT, MD, CSV, code, images`}</Note>
    </RouteSheet>
  );
}
