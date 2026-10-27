import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Animated, Easing, FlatList, Pressable, View, type ViewStyle } from 'react-native';
import Animated2, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { success, tap } from '@/lib/haptics';
import { isDesktop } from '@/lib/device';
import { speak, stopSpeaking } from '@/lib/tts';
import { openOutput } from '@/skill-exec/outputs';
import { useSettings } from '@/store/settings';
import { useSpeech } from '@/store/speech';
import { radii, useTheme } from '@/theme';
import type { Message, ToolRun } from '@/store/chats';

import { GenUIBlock } from '@/genui/GenUI';
import { parseReply } from '@/genui/parse';

import { Icon, type IconName } from './Icon';
import { Markdown } from './Markdown';
import { ActivityBox } from './Motion';
import { Text } from './Text';

function ToolChip({ run }: { run: ToolRun }) {
  const { colors } = useTheme();
  const command = run.name === 'execute' ? (() => { try { return String(JSON.parse(run.args || '{}').command ?? ''); } catch { return ''; } })() : '';
  const label = command ? `$ ${command.length > 34 ? `${command.slice(0, 33)}…` : command}` : run.server ? `${run.server}.${run.name}` : run.skill ?? run.name;
  const tint = run.status === 'error' || run.status === 'rejected' ? colors.danger : colors.text2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tool ${label}, ${run.status}`}
      onPress={() => router.push({ pathname: '/tool-detail', params: { chatId: '', id: run.id, name: label, args: run.args, result: run.result ?? run.error ?? '' } })}
      style={{ height: 28, minWidth: 44, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="tool" size={13} color={tint} />
      <Text size={12.5} mono style={{ color: tint }}>{label}</Text>
      {run.status === 'running' ? <Text size={11} color="muted">…</Text> : null}
    </Pressable>
  );
}

/** New messages ease in; older ones (scrolled into view later) appear instantly. */
const fresh = (m: Message) => (Date.now() - m.createdAt < 2500 ? FadeInDown.duration(220) : undefined);

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={17} color={colors.muted} />
    </Pressable>
  );
}

/** Split `<think>…</think>` reasoning (also while it is still streaming) from the visible answer. */
function splitThink(content: string) {
  const closed = [...content.matchAll(/<think>([\s\S]*?)<\/think>/g)].map((m) => m[1].trim());
  let rest = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = rest.indexOf('<think>');
  if (open >= 0) {
    closed.push(rest.slice(open + 7).trim());
    rest = rest.slice(0, open);
  }
  return { think: closed.filter(Boolean).join('\n\n'), rest: rest.trim(), open: open >= 0 };
}

/** While thinking, only the latest few lines show, so the reply doesn't jump around. */
const tail = (s: string, n = 700) => {
  if (s.length <= n) return s;
  const cut = s.slice(-n);
  const at = cut.search(/\s/);
  return `…${cut.slice(at >= 0 ? at : 0)}`;
};

/**
 * The model's reasoning, the way Claude shows it: while it thinks, its latest thoughts appear in faint text beside a
 * thin line; once the answer starts they fold away to "Thought for 7s". Tap the line to read them again.
 */
function Reasoning({ text, live }: { text: string; live: boolean }) {
  const { colors } = useTheme();
  const [manual, setManual] = useState<boolean | null>(null); // the user's own choice wins over the automatic one
  const started = useRef<number | null>(null);
  const [secs, setSecs] = useState(0);
  const [took, setTook] = useState<number | null>(null);
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (live) {
      started.current ??= Date.now();
      const t = setInterval(() => setSecs(Math.round((Date.now() - started.current!) / 1000)), 500);
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
      loop.start();
      return () => { clearInterval(t); loop.stop(); pulse.setValue(1); };
    }
    if (started.current) setTook(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
  }, [live, pulse]);

  const open = manual ?? live;
  const label = live ? `Thinking${secs ? ` · ${secs}s` : '…'}` : took ? `Thought for ${took}s` : 'Thoughts';
  return (
    <Animated2.View layout={LinearTransition.duration(200)} style={{ gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? `${label}. Hide the thoughts` : `${label}. Show the thoughts`} onPress={() => { tap(); setManual(!open); }} hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Animated.View style={{ opacity: pulse }}>
          <Icon name="sparkle" size={14} color={live ? colors.accent : colors.muted} />
        </Animated.View>
        <Text size={13.5} color="muted">{label}</Text>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} color={colors.faint} />
      </Pressable>
      {open ? (
        <Animated2.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ marginLeft: 6, paddingLeft: 13, borderLeftWidth: 2, borderLeftColor: colors.border }}>
          <Text size={13.5} color="muted" selectable style={{ lineHeight: 20.5, opacity: live ? 0.7 : 0.85 }}>{live ? tail(text) : text}</Text>
        </Animated2.View>
      ) : null}
    </Animated2.View>
  );
}

function AssistantBody({ chatId, content, streaming, citations }: { chatId: string; content: string; streaming: boolean; citations: Message['citations'] }) {
  const showReasoning = useSettings((s) => s.showReasoning);
  const { think, rest, open: thinkOpen } = splitThink(content);
  const parsed = parseReply(rest);
  const { text } = parsed;
  return (
    <View style={{ gap: 12 }}>
      {think && showReasoning ? <Reasoning text={think} live={streaming && thinkOpen} /> : null}
      {text ? <Markdown citations={citations}>{text}</Markdown> : null}
      {parsed.spec || parsed.open ? <GenUIBlock chatId={chatId} parsed={parsed} streaming={streaming} /> : null}
    </View>
  );
}

type Props = {
  chatId: string;
  messages: Message[];
  streaming: boolean;
  onRegenerate: () => void;
  onFixEndpoint: () => void;
  onSwitchModel: () => void;
  onRetry: () => void;
  /** Big screens: keep the conversation to a readable column. */
  column?: ViewStyle | null;
  /** Show a reply's sources (a panel beside the chat on wide windows, a sheet otherwise). */
  onSources?: (messageId: string) => void;
};

export function ChatView({ chatId, messages, streaming, onRegenerate, onFixEndpoint, onSwitchModel, onRetry, column, onSources }: Props) {
  const { colors } = useTheme();
  const showStats = useSettings((s) => s.showStats);
  const list = useRef<FlatList<Message>>(null);
  const followsOutput = useRef(true);
  const focused = useRef(false);
  const dragging = useRef(false);
  const pendingScrollFrame = useRef<number | null>(null);
  const lastMessage = messages.at(-1);
  const followOutput = useCallback(() => {
    if (!focused.current || !followsOutput.current || pendingScrollFrame.current !== null) return;
    pendingScrollFrame.current = requestAnimationFrame(() => {
      pendingScrollFrame.current = null;
      if (focused.current && followsOutput.current) list.current?.scrollToEnd({ animated: false });
    });
  }, []);
  const isNearBottom = (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    return contentSize.height - layoutMeasurement.height - contentOffset.y <= 72;
  };

  useEffect(() => {
    if (lastMessage?.role === 'user') {
      followsOutput.current = true;
      followOutput();
    }
  }, [lastMessage?.id, lastMessage?.role, followOutput]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    followOutput();
    return () => {
      focused.current = false;
      if (pendingScrollFrame.current !== null) {
        cancelAnimationFrame(pendingScrollFrame.current);
        pendingScrollFrame.current = null;
      }
    };
  }, [followOutput]));

  return (
    <FlatList
      ref={list}
      data={messages}
      keyExtractor={(m) => m.id}
      contentContainerStyle={[{ padding: column ? 24 : 16, gap: 18 }, column]}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={followOutput}
      onLayout={followOutput}
      onScroll={(event) => {
        if (!dragging.current) followsOutput.current = isNearBottom(event);
      }}
      onScrollBeginDrag={() => {
        dragging.current = true;
        followsOutput.current = false;
      }}
      onScrollEndDrag={(event) => {
        dragging.current = false;
        followsOutput.current = isNearBottom(event);
      }}
      onMomentumScrollEnd={(event) => {
        dragging.current = false;
        followsOutput.current = isNearBottom(event);
      }}
      scrollEventThrottle={16}
      renderItem={({ item: m }) => {
        if (m.role === 'user') {
          return (
            <Animated2.View entering={fresh(m)} style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
              <View style={{ backgroundColor: colors.surface2, borderRadius: radii.bubble, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                {m.attachments.map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={a.kind === 'image' ? 'image' : 'file'} size={16} color={colors.muted} />
                    <Text size={13} color="text2" numberOfLines={1} style={{ flexShrink: 1 }}>{a.name}</Text>
                    {a.meta ? <Text size={11.5} color="muted">{a.meta}</Text> : null}
                  </View>
                ))}
                {m.content ? <Text selectable>{m.content}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                {m.content ? <ActionButton icon="copy" label="Copy prompt" onPress={() => { success(); Clipboard.setStringAsync(m.content); }} /> : null}
                <ActionButton icon="more" label="More message actions" onPress={() => router.push({ pathname: '/message-sheet', params: { chatId, messageId: m.id } })} />
              </View>
            </Animated2.View>
          );
        }
        const last = m === messages.at(-1);
        return (
          <Animated2.View entering={fresh(m)} style={{ gap: 10 }}>
            {m.toolCalls.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {m.toolCalls.map((t) => <ToolChip key={t.id} run={t} />)}
              </View>
            )}
            {m.attachments.filter((a) => a.kind === 'image').length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {m.attachments.filter((a) => a.kind === 'image').map((a, i, all) => (
                  <Pressable key={a.id} accessibilityRole="imagebutton" accessibilityLabel={`Image ${i + 1} of ${all.length}`} onPress={() => router.push({ pathname: '/image-viewer', params: { chatId, messageId: m.id, index: String(i) } })}>
                    <Image source={{ uri: a.uri }} style={{ width: all.length > 1 ? '48%' : 280, aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface, minWidth: 140 }} contentFit="cover" />
                  </Pressable>
                ))}
              </View>
            )}
            {m.attachments.some((a) => a.kind === 'file') && (
              <View style={{ gap: 6 }}>
                {m.attachments.filter((a) => a.kind === 'file').map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}. Open or save`}
                    onPress={() => openOutput(a.uri, a.name).catch((e) => Alert.alert('Couldn’t open the file', e.message))}
                    style={({ pressed }) => ({ alignSelf: 'flex-start', maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
                    <Icon name="file" size={18} color={colors.text2} />
                    <View style={{ flexShrink: 1, gap: 1 }}>
                      <Text size={14} numberOfLines={1}>{a.name}</Text>
                      <Text size={12} color="muted" numberOfLines={1}>{`${a.meta ? `${a.meta} · ` : ''}${isDesktop ? 'Save to Downloads' : 'Tap to open or save'}`}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {m.content ? <AssistantBody chatId={chatId} content={m.content} streaming={streaming && last} citations={m.citations} /> : m.status ? <ActivityBox status={m.status} detail={m.statusDetail} since={m.statusSince ?? m.createdAt} /> : last && streaming && !m.error && m.attachments.length === 0 ? <ActivityBox status="Thinking…" since={m.createdAt} /> : null}
            {m.error ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="warn" size={18} color={colors.warn} />
                  <Text weight="semi" color="warn">Couldn’t get a reply</Text>
                </View>
                <Text color="text2" size={13.5}>{m.error}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[['Retry', onRetry], ['Switch model', onSwitchModel], ['Endpoint', onFixEndpoint]].map(([l, f]) => (
                    <Pressable key={l as string} accessibilityRole="button" onPress={f as () => void} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }}>
                      <Text size={13.5}>{l as string}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {!streaming || !last ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActionButton icon="copy" label="Copy" onPress={() => { success(); Clipboard.setStringAsync(splitThink(m.content).rest); }} />
                <ActionButton icon="speaker" label="Read aloud" onPress={() => { tap(); if (useSpeech.getState().status !== 'idle') return stopSpeaking(); speak(splitThink(m.content).rest).catch((e) => { stopSpeaking(); Alert.alert('Could not read aloud', e.message); }); }} />
                <ActionButton icon="refresh" label="Regenerate" onPress={onRegenerate} />
                <ActionButton icon="more" label="More message actions" onPress={() => router.push({ pathname: '/message-sheet', params: { chatId, messageId: m.id } })} />
                <View style={{ flex: 1 }} />
                {m.citations.length > 0 && (
                  <Pressable accessibilityRole="button" onPress={() => (onSources ? onSources(m.id) : router.push({ pathname: '/sources-sheet', params: { chatId, messageId: m.id } }))} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text size={12} color="accent">Sources · {m.citations.length}</Text>
                  </Pressable>
                )}
                {showStats && m.tokens ? <Text mono size={11.5} color="muted">{m.tokens} tok · {((m.ms ?? 0) / 1000).toFixed(1)}s</Text> : null}
              </View>
            ) : null}
          </Animated2.View>
        );
      }}
    />
  );
}
