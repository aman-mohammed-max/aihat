import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

// Small markdown subset: fenced code, headings, bullets, **bold**, `code`. Enough for chat replies.
function Inline({ text }: { text: string }) {
  const { colors } = useTheme();
  const parts = useMemo(() => text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean), [text]);
  return (
    <Text color="text2" style={{ lineHeight: 22 }}>
      {parts.map((p, i) =>
        p.startsWith('`') ? (
          <Text key={i} mono size={13} style={{ backgroundColor: colors.surface2, color: colors.text }}>{p.slice(1, -1)}</Text>
        ) : p.startsWith('**') ? (
          <Text key={i} weight="semi" color="text">{p.slice(2, -2)}</Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function Markdown({ children }: { children: string }) {
  const { colors } = useTheme();
  const blocks = useMemo(() => {
    const out: { type: 'code' | 'p' | 'h' | 'li'; text: string }[] = [];
    const lines = children.split('\n');
    let code: string[] | null = null;
    for (const line of lines) {
      if (line.trimStart().startsWith('```')) {
        if (code) { out.push({ type: 'code', text: code.join('\n') }); code = null; } else code = [];
        continue;
      }
      if (code) { code.push(line); continue; }
      if (!line.trim()) continue;
      if (/^#{1,6}\s/.test(line)) out.push({ type: 'h', text: line.replace(/^#{1,6}\s/, '') });
      else if (/^\s*[-*]\s/.test(line)) out.push({ type: 'li', text: line.replace(/^\s*[-*]\s/, '') });
      else out.push({ type: 'p', text: line });
    }
    if (code) out.push({ type: 'code', text: code.join('\n') });
    return out;
  }, [children]);

  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) =>
        b.type === 'code' ? (
          <ScrollView key={i} horizontal style={{ backgroundColor: colors.surface, borderRadius: 12 }} contentContainerStyle={{ padding: 12 }}>
            <Text mono size={12.5} color="text">{b.text}</Text>
          </ScrollView>
        ) : b.type === 'h' ? (
          <Text key={i} weight="semi" size={16}>{b.text}</Text>
        ) : b.type === 'li' ? (
          <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
            <Text color="muted">•</Text>
            <View style={{ flex: 1 }}><Inline text={b.text} /></View>
          </View>
        ) : (
          <Inline key={i} text={b.text} />
        ),
      )}
    </View>
  );
}
