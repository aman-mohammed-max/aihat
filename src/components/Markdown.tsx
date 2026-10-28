import * as Clipboard from 'expo-clipboard';
import { Fragment, memo, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';

import { codeColors, highlight, languageOf } from '@/lib/highlight';
import { parseBlocks, parseInline, type Block, type Citation, type Inline } from '@/lib/markdown';
import * as haptic from '@/lib/haptics';
import { fonts, useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Chat replies as rich text, the way ChatGPT and Claude show them: headings, paragraphs, bold / italic / strikethrough,
 * links, numbered, bulleted, nested and task lists, quotes, rules, tables, code blocks with colours and a Copy button,
 * and the web sources a reply cites ([1], [2]) as small tappable chips. Copes with half-written markdown while a
 * reply streams in.
 */

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const open = (url: string) => {
  if (/^(https?|mailto):/i.test(url)) Linking.openURL(url).catch(() => {});
};

function CiteChip({ n, cite }: { n: number; cite?: Citation }) {
  const { colors } = useTheme();
  const label = cite ? host(cite.url).replace(/^(docs|en|developer|developers|blog)\./, '') : String(n);
  const chip = (
    <Text size={11.5} color="text2" numberOfLines={1} style={{ lineHeight: 16 }}>{label.length > 22 ? `${label.slice(0, 21)}…` : label}</Text>
  );
  const onPress = cite ? () => open(cite.url) : undefined;
  // Phones draw a rounded chip inside the line; the desktop's web view uses an inline span.
  if (Platform.OS === 'web') {
    return (
      <Text onPress={onPress} accessibilityRole="link" accessibilityLabel={`Source ${n}: ${cite?.title ?? ''}`} style={{ backgroundColor: colors.surface2, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1, marginHorizontal: 2, fontSize: 11.5, color: colors.text2, cursor: 'pointer' } as object}>
        {label}
      </Text>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`Source ${n}: ${cite?.title ?? ''}`} hitSlop={6} style={{ transform: [{ translateY: 3 }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface2, borderRadius: 9, height: 18, paddingHorizontal: 6, marginHorizontal: 2 }}>
        <Icon name="link" size={10} color={colors.muted} strokeWidth={2} />
        {chip}
      </View>
    </Pressable>
  );
}

function Spans({ nodes, cites }: { nodes: Inline[]; cites: Citation[] }) {
  const { colors } = useTheme();
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.v}</Fragment>;
          case 'code':
            return (
              <Text key={i} style={{ fontFamily: fonts.mono, fontSize: 13.5, backgroundColor: colors.surface2, color: colors.text, borderRadius: 5 }}>
                {` ${n.v} `}
              </Text>
            );
          case 'b':
            return <Text key={i} weight="semi" color="text"><Spans nodes={n.kids} cites={cites} /></Text>;
          case 'i':
            return <Text key={i} style={{ fontStyle: 'italic' }}><Spans nodes={n.kids} cites={cites} /></Text>;
          case 'bi':
            return <Text key={i} weight="semi" style={{ fontStyle: 'italic' }}><Spans nodes={n.kids} cites={cites} /></Text>;
          case 's':
            return <Text key={i} style={{ textDecorationLine: 'line-through' }} color="muted"><Spans nodes={n.kids} cites={cites} /></Text>;
          case 'link':
            return (
              <Text key={i} accessibilityRole="link" onPress={() => open(n.href)} style={{ color: colors.accent, textDecorationLine: 'underline', textDecorationColor: colors.accent }}>
                <Spans nodes={n.kids} cites={cites} />
              </Text>
            );
          case 'cite':
            return <CiteChip key={i} n={n.n} cite={cites[n.n - 1]} />;
        }
      })}
    </>
  );
}

/** One run of text with its inline formatting. */
function Rich({ text, cites, size, weight, color = 'text', lineHeight }: { text: string; cites: Citation[]; size?: number; weight?: 'regular' | 'medium' | 'semi'; color?: 'text' | 'text2' | 'muted'; lineHeight?: number }) {
  const { body } = useTheme();
  const nodes = useMemo(() => parseInline(text, cites.length), [text, cites.length]);
  const s = size ?? body;
  return (
    <Text selectable={Platform.OS === 'web'} size={s} weight={weight} color={color} style={{ lineHeight: lineHeight ?? Math.round(s * 1.55) }}>
      <Spans nodes={nodes} cites={cites} />
    </Text>
  );
}

// ---------- code ----------

const CodeBlock = memo(function CodeBlock({ lang, text, open: streaming }: { lang: string; text: string; open: boolean }) {
  const { colors, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const { name, label } = languageOf(lang);
  const palette = useMemo(() => codeColors(isDark), [isDark]);
  const segments = useMemo(() => highlight(text, name), [text, name]);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: isDark ? colors.bgDeep : colors.surface, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, height: 36, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        <Text size={12} color="muted" style={{ flex: 1 }}>{label || 'Code'}</Text>
        {!streaming ? (
          <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Copied' : 'Copy code'} onPress={copy} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 8, borderRadius: 8, opacity: pressed ? 0.6 : 1 })}>
            <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.accent : colors.muted} />
            <Text size={12} color={copied ? 'accent' : 'muted'}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text selectable style={{ fontFamily: fonts.mono, fontSize: 12.5, lineHeight: 19.5, color: colors.text }}>
          {segments.map((s, i) => (s.type && palette[s.type] ? <Text key={i} style={{ color: palette[s.type], fontStyle: s.type === 'comment' ? 'italic' : undefined }}>{s.text}</Text> : s.text))}
        </Text>
      </ScrollView>
    </View>
  );
});

// ---------- tables ----------

function Table({ head, align, rows, cites }: { head: string[]; align: ('left' | 'center' | 'right')[]; rows: string[][]; cites: Citation[] }) {
  const { colors } = useTheme();
  const cols = Math.max(head.length, ...rows.map((r) => r.length));
  // Column widths from the longest text in each column, so short tables stay compact and wide ones scroll.
  const widths = Array.from({ length: cols }, (_, c) => {
    const longest = Math.max(...[head, ...rows].map((r) => (r[c] ?? '').replace(/[*_`]/g, '').length));
    return Math.min(260, Math.max(72, longest * 7.4 + 24));
  });
  const cell = (text: string, c: number, header: boolean, key: string) => (
    <View key={key} style={{ width: widths[c], paddingHorizontal: 12, paddingVertical: 9, borderLeftWidth: c ? 1 : 0, borderLeftColor: colors.hairline, justifyContent: 'center' }}>
      <View style={{ alignItems: align[c] === 'right' ? 'flex-end' : align[c] === 'center' ? 'center' : 'flex-start' }}>
        <Rich text={text} cites={cites} size={13.5} weight={header ? 'semi' : 'regular'} lineHeight={19} />
      </View>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface }}>{Array.from({ length: cols }, (_, c) => cell(head[c] ?? '', c, true, `h${c}`))}</View>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: ri % 2 ? colors.surface + '66' : 'transparent' }}>
            {Array.from({ length: cols }, (_, c) => cell(r[c] ?? '', c, false, `${ri}-${c}`))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------- blocks ----------

function Blocks({ blocks, cites, depth = 0 }: { blocks: Block[]; cites: Citation[]; depth?: number }) {
  const { colors, body } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return <Rich key={i} text={b.text} cites={cites} />;
          case 'h': {
            const size = [0, 21, 18.5, 16.5, body + 0.5, body, body][b.level];
            return (
              <View key={i} style={{ paddingTop: i && b.level <= 3 ? 6 : 0 }}>
                <Rich text={b.text} cites={cites} size={size} weight="semi" lineHeight={Math.round(size * 1.35)} />
              </View>
            );
          }
          case 'code':
            return <CodeBlock key={i} lang={b.lang} text={b.text} open={b.open} />;
          case 'hr':
            return <View key={i} style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />;
          case 'quote':
            return (
              <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 12 }}>
                <Blocks blocks={b.blocks} cites={cites} depth={depth} />
              </View>
            );
          case 'table':
            return <Table key={i} head={b.head} align={b.align} rows={b.rows} cites={cites} />;
          case 'list':
            return (
              <View key={i} style={{ gap: 6 }}>
                {b.items.map((it, k) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ minWidth: b.ordered ? 22 : 14, alignItems: b.ordered ? 'flex-end' : 'center', paddingTop: it.task ? 3 : 0 }}>
                      {it.task ? (
                        <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: it.done ? colors.accent : colors.border, backgroundColor: it.done ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {it.done ? <Icon name="check" size={11} color={colors.onAccent} strokeWidth={2.6} /> : null}
                        </View>
                      ) : b.ordered ? (
                        <Text color="muted" style={{ lineHeight: Math.round(body * 1.55), fontVariant: ['tabular-nums'] }}>{`${b.start + k}.`}</Text>
                      ) : (
                        <Text color="muted" style={{ lineHeight: Math.round(body * 1.55) }}>{['•', '◦', '▪'][Math.min(depth, 2)]}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Rich text={it.text} cites={cites} color={it.done ? 'muted' : 'text'} />
                      {it.children.length ? <Blocks blocks={it.children} cites={cites} depth={depth + 1} /> : null}
                    </View>
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

export function Markdown({ children, citations }: { children: string; citations?: Citation[] }) {
  const blocks = useMemo(() => parseBlocks(children), [children]);
  return <Blocks blocks={blocks} cites={citations ?? []} />;
}
