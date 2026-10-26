import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickFiles, readFiles } from '@/lib/attach';
import { runCommandText } from '@/lib/commands';
import { useFileDrop } from '@/lib/drop';
import { useLayout } from '@/lib/layout';
import { setViewing } from '@/lib/notify';
import { submit } from '@/lib/send';
import { useChats } from '@/store/chats';
import { useDictation } from '@/store/dictation';
import { useDraft } from '@/store/draft';
import { useLibrary } from '@/store/library';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

import { ChatView } from './ChatView';
import { Composer } from './Composer';
import { CommandPalette } from './CommandPalette';
import { DictationBar } from './DictationBar';
import { SpeechBar } from './SpeechBar';
import { Header } from './Header';
import { Icon, type IconName } from './Icon';
import { useColumn } from './Screen';
import { SourcesPanel } from './SourcesPanel';
import { Text } from './Text';

const SUGGESTIONS = [
  { title: 'Search the web', sub: 'for the latest Fabric API changes', mode: 'search' as const },
  { title: 'Summarise a file', sub: 'PDF, code, text or a spreadsheet', mode: 'file' as const },
  { title: 'Create an image', sub: 'pixel-art icon for my launcher', mode: 'image' as const },
  { title: 'Build a UI', sub: 'a checklist, form or dashboard', mode: 'ui' as const },
];

const hover = (s: PressableStateCallbackType, bg: string, on?: string) => (on ?? ((s as { hovered?: boolean }).hovered || s.pressed ? bg : 'transparent'));

function HeaderIcon({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} onPress={onPress} style={(s) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: hover(s, colors.surface, on ? colors.surface2 : undefined) })}>
      <Icon name={icon} size={icon === 'more' ? 19 : 18} color={colors.text2} />
    </Pressable>
  );
}

/** One screen for New chat (no id) and Chat ([id]). File / search / image / error states are states of this view. */
export function ChatScreen({ chatId }: { chatId?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { wide, panel } = useLayout();
  const column = useColumn();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const messages = useChats((s) => (chatId ? s.messages[chatId] : undefined)) ?? [];
  const streaming = useChats((s) => (chatId ? !!s.streaming[chatId] : false));
  const { providers, models } = useProviders();
  const prompts = useLibrary((s) => s.prompts);
  const approval = useChats((s) => s.approval);
  const draft = useDraft();
  const defaults = useSettings();
  const dictating = useDictation((s) => s.phase !== 'idle');
  const [sourcesOf, setSourcesOf] = useState<string | null>(null);
  const dragging = useFileDrop((list) => {
    readFiles(list).then((files) => files.forEach(useDraft.getState().addFile));
  });

  useEffect(() => {
    if (chatId) useChats.getState().loadMessages(chatId);
  }, [chatId]);

  useEffect(() => {
    setViewing(chatId ?? null);
    return () => setViewing(null);
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

  // Wide windows: a reply's sources sit in a panel beside the chat (the one you picked, else the latest).
  const showPanel = panel && defaults.sourcesPanel && !!chatId;
  const panelMessage = messages.find((m) => m.id === sourcesOf) ?? [...messages].reverse().find((m) => m.citations.length > 0);
  const openSources = (messageId: string) => {
    if (panel) {
      setSourcesOf(messageId);
      if (!defaults.sourcesPanel) defaults.set({ sourcesPanel: true });
    } else router.push({ pathname: '/sources-sheet', params: { chatId: chatId!, messageId } });
  };

  /** The open chat, or a new one (opened in place) when this is the empty "New chat" screen. */
  const ensureChat = async () => {
    if (chatId) return chatId;
    if (!provider) {
      router.push('/welcome');
      throw new Error('No endpoint');
    }
    const id = await useChats.getState().create({ providerId: provider.id, modelId: modelId ?? null, promptId: defaults.defaultPromptId });
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

  const promptChip = (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/prompt-sheet', params })}
      style={(s) =>
        wide
          ? { height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 15, backgroundColor: (s as { hovered?: boolean }).hovered ? colors.surface2 : colors.surface, flexShrink: 1, minWidth: 0 }
          : { alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }
      }>
      <Icon name="prompt" size={wide ? 13 : 15} color={wide ? colors.text2 : colors.muted} />
      <Text size={wide ? 12.5 : 13} color={wide ? 'text2' : 'muted'} numberOfLines={1}>{prompt?.name ?? 'No system prompt'}</Text>
      {wide ? null : <Icon name="chevronDown" size={13} color={colors.faint} />}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={'padding'} style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {wide ? (
          <View style={{ height: 56 + insets.top, paddingTop: insets.top, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${modelId ?? 'No model'}, change model`}
              onPress={() => router.push({ pathname: '/model-sheet', params })}
              style={(s) => ({ height: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: hover(s, colors.surface), minWidth: 0, flexShrink: 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text size={15} weight="semi" numberOfLines={1}>{modelId ?? 'Add a model'}</Text>
                <Icon name="chevronDown" size={14} color={colors.muted} strokeWidth={2} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
                <Text size={11.5} color="muted" numberOfLines={1}>{subtitle}</Text>
              </View>
            </Pressable>
            {promptChip}
            <View style={{ flex: 1 }} />
            {panel && chatId ? <HeaderIcon icon="panel" label="Show sources panel" on={defaults.sourcesPanel} onPress={() => defaults.set({ sourcesPanel: !defaults.sourcesPanel })} /> : null}
            {chatId ? <HeaderIcon icon="more" label="More options" onPress={() => router.push({ pathname: '/chat-menu', params })} /> : null}
          </View>
        ) : (
          <>
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
            {promptChip}
          </>
        )}

        {chatId ? (
          <View style={{ flex: 1 }}>
            <ChatView
              chatId={chatId}
              messages={messages}
              streaming={streaming}
              column={column}
              onSources={openSources}
              onRegenerate={() => useChats.getState().regenerate(chatId)}
              onRetry={() => useChats.getState().regenerate(chatId)}
              onSwitchModel={() => router.push({ pathname: '/model-sheet', params })}
              onFixEndpoint={() => (provider ? router.push({ pathname: '/provider-detail', params: { id: provider.id } }) : router.push('/providers'))}
            />
          </View>
        ) : (
          <View style={[{ flex: 1, justifyContent: 'space-between' }, column]}>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
              <Text size={wide ? 32 : 28} weight="semi" style={{ textAlign: 'center' }}>What are we working on?</Text>
            </View>
            <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.title} accessibilityRole="button" onPress={() => suggestion(s.mode)} style={(st) => ({ width: '48.5%', minHeight: 64, backgroundColor: (st as { hovered?: boolean }).hovered ? colors.surface2 : colors.surface, borderRadius: 16, padding: 12, gap: 2 })}>
                  <Text size={14} weight="medium">{s.title}</Text>
                  <Text size={12} color="muted" numberOfLines={2}>{s.sub}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={[{ width: '100%' }, column]}>
          <SpeechBar />
          <DictationBar />
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
            onVoice={() => useDictation.getState().begin()}
            voiceActive={dictating}
            onSlash={() => draft.set({ text: draft.text.startsWith('/') ? '' : '/' })}
          />
          {Platform.OS === 'web' ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: -6, paddingBottom: 10 }}>
              {['Enter to send', 'Shift + Enter for a new line', 'Drop files anywhere'].map((t) => <Text key={t} size={11.5} color="faint">{t}</Text>)}
            </View>
          ) : null}
        </View>

        {dragging ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Icon name="file" size={28} color={colors.accent} />
            <Text size={16} weight="medium">Drop files to add them to your message</Text>
            <Text size={13} color="muted">Text, code, PDF, Word, PowerPoint, Excel and pictures</Text>
          </View>
        ) : null}
      </View>

      {showPanel ? <SourcesPanel message={panelMessage} onClose={() => defaults.set({ sourcesPanel: false })} /> : null}
    </KeyboardAvoidingView>
  );
}
