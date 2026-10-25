import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Chip, Header, SearchBar, Text } from '@/components';
import { getDb } from '@/db';
import { useTheme } from '@/theme';

type Hit = { chat_id: string; title: string; snippet: string; updated_at: number };
const FILTERS = ['All', 'Titles', 'Files', 'Images'] as const;

export default function SearchChats() {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!q.trim()) return live && setHits([]);
      const like = `%${q.trim()}%`;
      const db = await getDb();
      const sql =
        filter === 'Titles'
          ? `SELECT id AS chat_id, title, '' AS snippet, updated_at FROM chats WHERE title LIKE ? ORDER BY updated_at DESC LIMIT 50`
          : `SELECT c.id AS chat_id, c.title, m.content AS snippet, c.updated_at FROM messages m JOIN chats c ON c.id = m.chat_id
             WHERE m.content LIKE ? ${filter === 'Files' ? "AND m.attachments LIKE '%\"kind\":\"file\"%'" : ''} ${filter === 'Images' ? "AND m.attachments LIKE '%\"kind\":\"image\"%'" : ''}
             GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 50`;
      const rows = await db.getAllAsync<Hit>(sql, like);
      if (live) setHits(rows);
    })();
    return () => {
      live = false;
    };
  }, [q, filter]);

  const excerpt = (s: string) => {
    const i = s.toLowerCase().indexOf(q.trim().toLowerCase());
    return i < 0 ? s.slice(0, 100) : `…${s.slice(Math.max(0, i - 40), i + 80)}…`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header left="back" title="Search chats" />
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search chats" autoFocus hint={q ? `${hits.length} results` : undefined} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FILTERS.map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
        </View>
      </View>
      <FlatList
        data={hits}
        keyExtractor={(h) => h.chat_id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/chat/${item.chat_id}`)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text>
              <Text size={12} color="muted">{new Date(item.updated_at).toLocaleDateString()}</Text>
            </View>
            {item.snippet ? <Text size={13} color="muted" numberOfLines={2}>{excerpt(item.snippet)}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
