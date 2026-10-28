import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, TextInput } from 'react-native';

import { Button, Screen } from '@/components';
import * as haptic from '@/lib/haptics';
import { useChats } from '@/store/chats';
import { toast } from '@/store/toast';
import { fonts, useTheme } from '@/theme';

/** A message as plain text for selecting: markdown marks gone, line breaks and code kept. */
export function plainText(markdown: string) {
  return markdown
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/```spec[\s\S]*?(```|$)/g, '')
    .replace(/^\s*```[^\n]*\n?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[([ xX])\]\s+/gm, (_, x) => (x === ' ' ? '☐ ' : '☑ '))
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~/g, (_, a, b, c, d) => a ?? b ?? c ?? d)
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])|(?<![_\w])_([^_\n]+)_(?![_\w])/g, (_, a, b) => a ?? b)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (_, text, url) => (text && text !== url ? `${text} (${url})` : url))
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, row: string) => row.split('|').map((c) => c.trim()).join('   '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * "Select text", the way ChatGPT and Claude do it: the whole message in one read-only text box, where the phone's own
 * selection handles work across every paragraph, plus Copy all.
 */
export default function SelectText() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const { colors, body } = useTheme();
  const msg = useChats((s) => s.messages[chatId]?.find((m) => m.id === messageId));
  const text = plainText(msg?.content ?? '');
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    haptic.success();
    toast('Copied');
    router.back();
  };
  return (
    <Screen header={{ left: 'cancel', title: 'Select text' }} scroll={false} footer={<Button label="Copy all" height={48} flex onPress={copy} />}>
      <TextInput
        accessibilityLabel="Message text"
        value={text}
        editable={false}
        multiline
        scrollEnabled
        contextMenuHidden={false}
        selectTextOnFocus={false}
        selectionColor={colors.accent}
        textAlignVertical="top"
        style={{ flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: body, lineHeight: Math.round(body * 1.55), paddingVertical: 8, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
      />
    </Screen>
  );
}
