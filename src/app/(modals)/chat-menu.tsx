import { router, useLocalSearchParams } from 'expo-router';
import { Share, View } from 'react-native';

import { ListRow, Text, type IconName } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useRefreshModels } from '@/lib/useRefreshModels';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useTheme } from '@/theme';

export default function ChatMenu() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { colors } = useTheme();
  const chat = useChats((s) => s.chats.find((c) => c.id === chatId));
  const count = useChats((s) => s.messages[chatId]?.length ?? 0);
  const prompt = useLibrary((s) => s.prompts.find((p) => p.id === chat?.promptId));
  const model = useProviders((s) => s.models.find((m) => m.id === chat?.modelId));
  const refresh = useRefreshModels();
  if (!chat) return null;

  const exportMd = async () => {
    const msgs = useChats.getState().messages[chatId] ?? [];
    const md = `# ${chat.title}\n\n` + msgs.map((m) => `**${m.role === 'user' ? 'You' : 'Assistant'}**\n\n${m.content}`).join('\n\n---\n\n');
    await Share.share({ message: md, title: chat.title });
  };
  const go = (pathname: string) => router.replace({ pathname, params: { chatId } } as never);
  const rows: { icon: IconName; label: string; value?: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'edit', label: 'Rename', onPress: () => go('/rename') },
    { icon: 'pin', label: chat.pinned ? 'Unpin' : 'Pin to top', onPress: () => { useChats.getState().patch(chatId, { pinned: !chat.pinned }); router.back(); } },
    { icon: 'archive', label: chat.archived ? 'Unarchive' : 'Archive', onPress: () => { useChats.getState().patch(chatId, { archived: !chat.archived }); router.back(); } },
    { icon: 'prompt', label: 'System prompt', value: prompt?.name ?? 'None', onPress: () => go('/prompt-sheet') },
    { icon: 'sliders', label: 'Model settings', value: `Temp ${chat.params.temperature ?? 0.7}`, onPress: () => go('/params-sheet') },
    { icon: 'refresh', label: 'Refresh models', value: refresh.busy ? 'Fetching…' : refresh.note || undefined, onPress: refresh.run },
    { icon: 'tool', label: 'Tools', value: `${chat.toolIds.length} on`, onPress: () => go('/tools-sheet') },
    { icon: 'share', label: 'Export', value: 'Markdown', onPress: exportMd },
    { icon: 'trash', label: 'Delete chat', danger: true, onPress: () => go('/delete-chat') },
  ];
  return (
    <RouteSheet title="Chat options" bare>
      <View>
        <View style={{ paddingTop: 6, paddingBottom: 10, paddingHorizontal: 4, gap: 3, borderBottomWidth: 1, borderBottomColor: colors.surface2 }}>
          <Text size={16} weight="semi" numberOfLines={1}>{chat.title}</Text>
          <Text size={12.5} color="muted" numberOfLines={1}>{[model?.name ?? chat.modelId, prompt?.name, `${count} messages`].filter(Boolean).join(' · ')}</Text>
        </View>
        {rows.map((r) => <ListRow key={r.label} {...r} height={50} chevron={false} />)}
      </View>
    </RouteSheet>
  );
}
