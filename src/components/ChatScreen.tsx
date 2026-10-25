import { router, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, View } from 'react-native';

import { pickFiles } from '@/lib/attach';
import { runCommandText } from '@/lib/commands';
import { submit } from '@/lib/send';
import { useChats } from '@/store/chats';
import { useDraft } from '@/store/draft';
import { useLibrary } from '@/store/library';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { ChatView } from './ChatView';
import { Composer } from './Composer';
import { CommandPalette } from './CommandPalette';
import { SpeechBar } from './SpeechBar';
import { Header } from './Header';
import { Icon } from './Icon';
import { Text } from './Text';

const SUGGESTIONS = [
  { title: 'Search the web', sub: 'for the latest Fabric API changes', mode: 'search' as const },
  { title: 'Summarise a file', sub: 'PDF, code, text or a spreadsheet', mode: 'file' as const },
  { title: 'Create an image', sub: 'pixel-art icon for my launcher', mode: 'image' as const },
  { title: 'Build a UI', sub: 'a checklist, form or dashboard', mode: 'ui' as const },
];

/** One screen for New chat (no id) and Chat ([id]). File / search / image / error states are states of this view. */
export function ChatScreen({ chatId }: { chatId?: string }) {
  const { colors } = useTheme();
  const nav = useNavigation();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const messages = useChats((s) => (chatId ? s.messages[chatId] : undefined)) ?? [];
  const streaming = useChats((s) => (chatId ? !!s.streaming[chatId] : false));
  const { providers, models } = useProviders();
  const prompts = useLibrary((s) => s.prompts);
  const approval = useChats((s) => s.approval);
  const draft = useDraft();
  const defaults = useSettings();

  useEffect(() => {
    if (chatId) useChats.getState().loadMessages(chatId);
  }, [chatId]);

  useEffect(() => {
    if (approval && approval.chatId === chatId) router.push('/gen-action');
  }, [approval, chatId]);

  const provider = providers.find((p) => p.id === (chat?.providerId ?? defaults.defaultProviderId)) ?? providers.find((p) => p.isDefault) ?? providers[0];
  const modelId = chat?.modelId ?? defaults.defaultModelId ?? models.find((m) => m.providerId === provider?.id && m.enabled && isChatModel(m))?.id;
  const prompt = prompts.find((p) => p.id === (chat?.promptId ?? defaults.defaultPromptId));
  const openDrawer = () => (nav as unknown as { openDrawer?: () => void }).openDrawer?.();
  const params = chatId ? { chatId } : {};

  const subtitle = provider ? `${provider.name}${provider.latencyMs ? ` · ${provider.latencyMs} ms` : ''}` : 'No endpoint';

  /** The open chat, or a new one (opened in place) when this is the empty "New chat" screen. */
  const ensureChat = async () => {
    if (chatId) return chatId;
    if (!provider) {
      router.push('/welcome');
      throw new Error('No endpoint');
    }
    const id = await useChats.getState().create({ providerId: provider.id, modelId: modelId ?? null, promptId: defaults.defaultPromptId, params: defaults.defaultParams });
    router.replace(`/chat/${id}`);
    return id;
  };

  const send = async () => {
    const text = draft.text.trim();
    if (!text && draft.files.length === 0) return;

    // Slash commands: "/image a cabin", "/effort high", "/search …" run instead of being sent as text.
    if (text.startsWith('/') && draft.files.length === 0) {
      draft.set({ text: '' });
      try {
        if (await runCommandText(text, { chatId, ensureChat })) return;
      } catch (e: any) {
        if (e?.message !== 'No endpoint') Alert.alert('Command failed', e?.message ?? 'Try again.');
        return;
      }
      draft.set({ text }); // not a command after all: send it as a message below
    }

    if (!provider) return router.push('/welcome');
    const id = await ensureChat();
    const files = [...draft.files];
    const opts = { search: draft.searchOn, ui: draft.uiOn, image: draft.imageOn };
    if (opts.ui) draft.set({ uiOn: false }); // the UI chip applies to one message
    draft.reset();
    await submit(id, text.startsWith('//') ? text.slice(1) : text, { files, ...opts, search: opts.search && !opts.image });
  };

  const suggestion = (mode: (typeof SUGGESTIONS)[number]['mode']) => {
    if (mode === 'search') draft.set({ searchOn: true });
    if (mode === 'image') {
      draft.set({ imageOn: true });
      router.push('/image-options');
    }
    if (mode === 'file') pickFiles().then((fs) => fs.forEach(draft.addFile));
    if (mode === 'ui') draft.set({ uiOn: true, text: draft.text || 'Make a ' });
  };

  return (
    <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        left="menu"
        onLeft={openDrawer}
        right={chatId ? 'both' : 'new'}
        title={modelId ?? 'Add a model'}
        sub={subtitle}
        onTitlePress={() => router.push({ pathname: '/model-sheet', params })}
        onNew={() => router.replace('/')}
        onMore={() => router.push({ pathname: '/chat-menu', params })}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/prompt-sheet', params })}
        style={{ alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
        <Icon name="prompt" size={15} color={colors.muted} />
        <Text size={13} color="muted">{prompt?.name ?? 'No system prompt'}</Text>
        <Icon name="chevronDown" size={13} color={colors.faint} />
      </Pressable>

      {chatId ? (
        <View style={{ flex: 1 }}>
          <ChatView
            chatId={chatId}
            messages={messages}
            streaming={streaming}
            onRegenerate={() => useChats.getState().regenerate(chatId)}
            onRetry={() => useChats.getState().regenerate(chatId)}
            onSwitchModel={() => router.push({ pathname: '/model-sheet', params })}
            onFixEndpoint={() => (provider ? router.push({ pathname: '/provider-detail', params: { id: provider.id } }) : router.push('/providers'))}
          />
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text size={28} weight="semi" style={{ textAlign: 'center' }}>What are we working on?</Text>
          </View>
          <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s.title} accessibilityRole="button" onPress={() => suggestion(s.mode)} style={{ width: '48.5%', minHeight: 64, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 2 }}>
                <Text size={14} weight="medium">{s.title}</Text>
                <Text size={12} color="muted" numberOfLines={2}>{s.sub}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <SpeechBar />
      <CommandPalette
        text={draft.text}
        onInsert={(text) => draft.set({ text })}
        onRun={async (text) => {
          draft.set({ text: '' });
          try {
            await runCommandText(text, { chatId, ensureChat });
          } catch (e: any) {
            if (e?.message !== 'No endpoint') Alert.alert('Command failed', e?.message ?? 'Try again.');
          }
        }}
      />
      <Composer
        value={draft.text}
        onChangeText={(text) => draft.set({ text })}
        onSend={streaming && chatId ? () => useChats.getState().stop(chatId) : send}
        placeholder={`Message ${modelId ?? ''}`.trim()}
        files={draft.files.map((f) => ({ id: f.id, ext: (f.name.split('.').pop() ?? '').slice(0, 4).toUpperCase(), label: f.name, meta: f.meta }))}
        onRemoveFile={draft.removeFile}
        searchOn={draft.searchOn}
        imageOn={draft.imageOn}
        uiOn={draft.uiOn}
        imageLabel={defaults.imageAspect}
        onToggleUi={() => draft.set({ uiOn: false })}
        onImageOptions={() => router.push('/image-options')}
        onToggleSearch={() => draft.set({ searchOn: false })}
        onToggleImage={() => draft.set({ imageOn: false })}
        onAdd={() => router.push('/attach-sheet')}
        onTools={() => router.push({ pathname: '/tools-sheet', params })}
        onVoice={() => router.push('/voice')}
        onSlash={() => draft.set({ text: draft.text.startsWith('/') ? '' : '/' })}
      />
    </KeyboardAvoidingView>
  );
}
