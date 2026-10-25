import { autoFixSpec, validateSpec } from '@json-render/core';
import { createStandardActionHandlers, JSONUIProvider, Renderer, type Spec } from '@json-render/react-native';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, View } from 'react-native';

import { callTool } from '@/api/mcp';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { GenUIBoundary } from './Boundary';
import { ALLOWED_TYPES } from './catalog';
import { normalizeSpec, type ParsedReply } from './parse';
import { registry } from './registry';

const confirm = (title: string, message: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow', onPress: () => resolve(true) },
    ], { onDismiss: () => resolve(false) }),
  );

/** Actions a generated UI may trigger. Anything that leaves the app or writes data asks first. */
function buildHandlers(chatId: string) {
  return {
    ...createStandardActionHandlers({ navigate: (screen) => router.push(screen as never), goBack: () => router.back() }),
    openURL: async ({ url }: Record<string, unknown>) => {
      if (await confirm('Open link?', String(url))) await Linking.openURL(String(url));
    },
    sendMessage: ({ text }: Record<string, unknown>) => useChats.getState().send(chatId, String(text)),
    setDefaultModel: ({ id }: Record<string, unknown>) => {
      const m = useProviders.getState().models.find((x) => x.id === id);
      useSettings.getState().set({ defaultModelId: String(id), defaultProviderId: m?.providerId ?? null });
    },
    runMcpTool: async ({ server, tool, args }: Record<string, unknown>) => {
      const s = useLibrary.getState().servers.find((x) => x.name === server && x.connected);
      if (!s) return Alert.alert('Server not connected', String(server));
      if (!(await confirm('Run tool?', `${server}.${tool}\n${JSON.stringify(args ?? {}, null, 2)}`))) return;
      try {
        Alert.alert(`${tool} finished`, (await callTool({ url: s.url, id: s.id }, String(tool), (args as object) ?? {})).slice(0, 600));
      } catch (e: any) {
        Alert.alert(`${tool} failed`, e.message);
      }
    },
  };
}

/** A generated UI drawn with this app's own themed components. While it streams in, partial UIs render as soon as they are valid. */
export function GenUIBlock({ chatId, parsed, streaming }: { chatId: string; parsed: ParsedReply; streaming: boolean }) {
  const { colors } = useTheme();
  const developer = useSettings((s) => s.developerMode);

  const note = (text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
      <Icon name="sparkle" size={14} color={colors.muted} />
      <Text size={13} color="muted" style={{ flex: 1 }}>{text}</Text>
    </View>
  );

  if (!parsed.spec) return streaming || parsed.open ? note('Building UI…') : null;

  // Half-streamed or malformed specs must never crash the chat: treat any failure as "not valid yet".
  let spec: Spec | null = null;
  let valid = false;
  try {
    spec = normalizeSpec(autoFixSpec(normalizeSpec(parsed.spec, ALLOWED_TYPES) ?? parsed.spec).spec as Spec, ALLOWED_TYPES);
    valid = !!spec && validateSpec(spec).valid;
  } catch {
    valid = false;
  }
  if (!valid || !spec) {
    if (streaming || parsed.open) return note('Building UI…');
    return (
      <View style={{ gap: 6 }}>
        {note('This UI couldn’t be drawn. The model’s spec didn’t match the available components.')}
        {developer ? <Text mono size={11.5} color="muted">{parsed.raw}</Text> : null}
      </View>
    );
  }

  const count = Object.keys(spec.elements ?? {}).length;
  return (
    <View style={{ gap: 6 }}>
      <GenUIBoundary fallback={note('This UI couldn’t be drawn.')}>
        <JSONUIProvider registry={registry} initialState={(spec as { state?: Record<string, unknown> }).state ?? {}} handlers={buildHandlers(chatId)}>
          <Renderer spec={spec} registry={registry} loading={streaming} />
        </JSONUIProvider>
      </GenUIBoundary>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="sparkle" size={12} color={colors.muted} />
        <Text size={12} color="muted">Generated UI · {count} elements</Text>
        {developer ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/gen-spec', params: { spec: JSON.stringify(spec) } })} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 6 }}>
            <Text size={12} color="accent">View spec</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
