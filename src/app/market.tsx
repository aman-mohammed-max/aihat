import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, Chip, Icon, PulseDots, Screen, SearchBar, SectionTitle, Segmented, Text } from '@/components';
import {
  compact, FEATURED_MCP, parseGithubRef, parseSiteRef, pluginSkills, rememberMcp, rememberSkill, repoSkills, searchMcp, siteSkills, siteSourceLabel, skillSourceLabel, skillsShSearch, SKILL_SITES, SKILL_SOURCES,
  type McpListing, type SkillListing,
} from '@/lib/market';
import { LocalModelsTab } from '@/components/LocalModels';
import { isDesktop } from '@/lib/device';
import { useLayout, useNavWidth } from '@/lib/layout';
import { useLibrary } from '@/store/library';
import { useTheme } from '@/theme';

type Tab = 'skills' | 'mcp' | 'models';
type Source = 'popular' | 'skillssh' | 'github';

type Page<T> = { items: T[]; next?: string; total?: number };
type Result<T> = { key: string; items: T[]; next?: string; total?: number; error?: string };

/**
 * Loads a list for a key (source + query). `loading` is "the result on screen isn't for this key yet", so changing the
 * key shows the loading state without any state being set from inside the effect.
 */
function useList<T>(key: string, enabled: boolean, load: (key: string) => Promise<Page<T>>) {
  const [res, setRes] = useState<Result<T> | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load(key).then(
      (r) => alive && setRes({ key, ...r }),
      (e) => alive && setRes({ key, items: [], error: e?.message ?? 'Something went wrong.' }),
    );
    return () => {
      alive = false;
    };
    // `load` is recreated on every render; the key is what identifies a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  const current = res?.key === key ? res : null;
  return {
    items: current?.items ?? [],
    next: current?.next,
    total: current?.total,
    error: current?.error,
    loading: enabled && !current,
    loadingMore: more,
    /** Add the next page to what is showing. */
    async loadMore(next: (r: Result<T>) => Promise<Page<T>>) {
      if (!current || more) return;
      setMore(true);
      try {
        const r = await next(current);
        setRes({ ...current, items: [...current.items, ...r.items], next: r.next, total: r.total ?? current.total });
      } catch (e: any) {
        setRes({ ...current, error: e?.message ?? 'Something went wrong.' });
      } finally {
        setMore(false);
      }
    },
  };
}

/** Tile colours: the first follows the chosen accent, the others are fixed muted tints (dark theme). */
const TILE = ['accent', '#1F2A33', '#33271F', '#2B2540', '#3A2330', '#242B36'];
function Tile({ name }: { name: string }) {
  const { colors, isDark } = useTheme();
  const pick = TILE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TILE.length];
  const tint = pick === 'accent' || !isDark ? colors.accentSoft : pick;
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
      <Text weight="semi" size={16} style={{ color: colors.text }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/** Widest the marketplace grows on a big screen (a grid of cards, like a store). */
const GRID = 1120;

/** On a tablet or computer, the width of one card in the grid; null on a phone (a list). */
function useCardWidth() {
  const { wide, width } = useLayout();
  const nav = useNavWidth();
  if (!wide) return null;
  const inner = Math.min(width - nav, GRID) - 48;
  const cols = Math.max(1, Math.min(4, Math.floor((inner + 12) / 272)));
  return Math.floor((inner - 12 * (cols - 1)) / cols);
}

/** Search results: a list on a phone, a grid of cards on a bigger screen. */
function Results({ children }: { children: React.ReactNode }) {
  const card = useCardWidth();
  const { colors } = useTheme();
  return card ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View> : <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>{children}</View>;
}

function Row({ title, sub, meta, badge, onPress, last }: { title: string; sub?: string; meta?: string; badge?: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  const card = useCardWidth();
  if (card) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${sub ?? ''} ${meta ?? ''}`}
        onPress={onPress}
        style={(s) => ({ width: card, minHeight: 150, padding: 16, gap: 10, borderRadius: 16, backgroundColor: (s as { hovered?: boolean }).hovered ? colors.surface2 : colors.surface, borderWidth: 1, borderColor: (s as { hovered?: boolean }).hovered ? colors.border : colors.surface2 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tile name={title} />
          <Text weight="semi" size={15} numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
          {badge ? (
            <View style={{ height: 22, borderRadius: 6, paddingHorizontal: 7, justifyContent: 'center', backgroundColor: colors.accentSoft }}>
              <Text size={11} color="accent" weight="semi">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text size={13} color="text2" numberOfLines={3} style={{ flex: 1, lineHeight: 19 }}>{sub ?? ''}</Text>
        {meta ? <Text size={11.5} color="faint" numberOfLines={1}>{meta}</Text> : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub ?? ''} ${meta ?? ''}`}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline })}>
      <Tile name={title} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text size={15} weight="medium" numberOfLines={1}>{title}</Text>
        {sub ? <Text size={12.5} color="muted" numberOfLines={2} style={{ lineHeight: 17 }}>{sub}</Text> : null}
        {meta ? <Text size={11.5} color="faint" numberOfLines={1}>{meta}</Text> : null}
      </View>
      {badge ? (
        <View style={{ height: 24, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center', backgroundColor: colors.accentSoft }}>
          <Text size={11.5} color="accent" weight="medium">{badge}</Text>
        </View>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
      )}
    </Pressable>
  );
}

function Status({ loading, error, empty, onRetry }: { loading: boolean; error?: string; empty?: string; onRetry?: () => void }) {
  if (loading) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }}>
        <PulseDots />
        <Text color="muted" size={13.5}>Loading…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ gap: 10, padding: 4 }}>
        <Text color="warn" size={13.5}>{error}</Text>
        {onRetry ? <Button label="Try again" variant="outline" height={40} onPress={onRetry} /> : null}
      </View>
    );
  }
  return empty ? <Text color="muted" size={13.5} style={{ padding: 4 }}>{empty}</Text> : null;
}

// ---------------- Skills ----------------

const PAGE = 25;
const IDEAS = ['pdf', 'react', 'testing', 'design', 'git', 'writing', 'sql', 'docs'];

function SkillsTab({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const skills = useLibrary((s) => s.skills);
  const [src, setSrc] = useState<Source>('popular');
  const [applied, setApplied] = useState('');
  const [nonce, setNonce] = useState(0);
  // Typing waits a moment so every keystroke doesn't become a request. The GitHub box waits for the go key instead.
  useEffect(() => {
    if (src === 'github') return;
    const t = setTimeout(() => setApplied(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q, src]);

  const key = `${src}|${applied}|${nonce}`;
  const ready = src === 'popular' || (src === 'skillssh' && applied.length >= 2) || (src === 'github' && !!(parseGithubRef(applied) || parseSiteRef(applied)));
  const list = useList<SkillListing>(key, ready, async () => {
    if (src === 'popular') {
      const r = await pluginSkills(applied, 0, PAGE);
      return { items: r.items, total: r.total, next: PAGE < r.total ? String(PAGE) : undefined };
    }
    if (src === 'skillssh') return { items: await skillsShSearch(applied) };
    const repo = parseGithubRef(applied);
    return { items: repo ? await repoSkills(repo) : await siteSkills(applied) };
  });

  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const open = (l: SkillListing) => router.push({ pathname: '/market-skill', params: { key: rememberSkill(l) } });
  const meta = (l: SkillListing) => [l.source, l.installs ? `${compact(l.installs)} installs` : '', l.stars ? `★ ${compact(l.stars)}` : ''].filter(Boolean).join(' · ');
  // Lists that know the folder match it exactly; skills.sh only knows the skill's name.
  const isAdded = (l: SkillListing) =>
    skills.some((s) => (l.from === 'site' ? s.source === siteSourceLabel(l.source, l.dir!) : l.dir !== undefined ? s.source === skillSourceLabel(l.source, l.dir) : s.source.startsWith(`github.com/${l.source}`) && norm(s.name) === norm(l.skillId ?? l.name)));

  const sources: { id: Source; label: string }[] = [{ id: 'popular', label: 'Popular' }, { id: 'skillssh', label: 'skills.sh' }, { id: 'github', label: 'Repo or site' }];
  const placeholder = src === 'github' ? 'owner/repo, a GitHub link or vercel.com' : src === 'skillssh' ? 'Search skills.sh' : 'Search skills';

  return (
    <>
      <SearchBar value={q} onChangeText={setQ} placeholder={placeholder} keyboardType={src === 'github' ? 'url' : 'default'} onSubmit={() => setApplied(q.trim())} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {sources.map((s) => (
          <Chip key={s.id} label={s.label} selected={src === s.id} onPress={() => { setSrc(s.id); setQ(''); setApplied(''); }} />
        ))}
      </ScrollView>
      <Text size={12.5} color="muted" style={{ paddingHorizontal: 4, lineHeight: 19 }}>
        {src === 'popular' ? 'The most-installed skills from public GitHub repositories, listed by claude-plugins.dev.' : src === 'skillssh' ? 'Search skills.sh, the open skills directory from Vercel.' : 'A public GitHub repository or folder with SKILL.md files, or a website that publishes skills itself.'} You see the full text before adding anything.
      </Text>

      {!ready && src === 'skillssh' && (
        <View style={{ gap: 10 }}>
          <SectionTitle space={0}>Try searching for</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {IDEAS.map((i) => <Chip key={i} label={i} onPress={() => { setQ(i); setApplied(i); }} />)}
          </View>
        </View>
      )}

      {!ready && src === 'github' && (
        <View style={{ gap: 20 }}>
          <View>
            <SectionTitle space={8}>Skills published by the companies themselves</SectionTitle>
            <Results>
              {SKILL_SITES.map((s, i) => (
                <Row key={s.site} title={s.label} sub={s.sub} meta={s.site} last={i === SKILL_SITES.length - 1} onPress={() => { setQ(s.site); setApplied(s.site); }} />
              ))}
            </Results>
            <Text size={12.5} color="muted" style={{ marginTop: 8, paddingHorizontal: 4, lineHeight: 19 }}>Any website can publish skills at /.well-known/agent-skills (the open Agent Skills standard). Downloads are checked against the checksum the site gives.</Text>
          </View>
          <View>
            <SectionTitle space={8}>Repositories that publish skills</SectionTitle>
            <Results>
              {SKILL_SOURCES.map((s, i) => (
                <Row key={s.source} title={s.label} sub={s.sub} meta={`github.com/${s.source}`} last={i === SKILL_SOURCES.length - 1} onPress={() => { setQ(s.source); setApplied(s.source); }} />
              ))}
            </Results>
          </View>
        </View>
      )}

      {src === 'github' && applied && !ready && <Text color="warn" size={13.5}>That doesn’t look like a GitHub repository, a folder link or a website address.</Text>}

      {ready && (
        <View>
          <SectionTitle space={8}>{src === 'popular' ? (applied ? `Results${list.total ? ` · ${list.total.toLocaleString()}` : ''}` : 'Popular skills') : src === 'github' ? (parseGithubRef(applied) ? 'Skills in this repository' : `Skills from ${applied.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`) : 'Results'}</SectionTitle>
          {list.items.length > 0 && (
            <Results>
              {list.items.map((l, i) => (
                <Row
                  key={l.key}
                  title={l.name}
                  sub={l.description}
                  meta={meta(l)}
                  badge={isAdded(l) ? 'Added' : undefined}
                  last={i === list.items.length - 1}
                  onPress={() => open(l)}
                />
              ))}
            </Results>
          )}
          <Status loading={list.loading} error={list.error} empty={list.items.length === 0 ? 'Nothing found. Try another word.' : undefined} onRetry={() => setNonce((n) => n + 1)} />
          {list.next && !list.loading && (
            <View style={{ paddingTop: 12 }}>
              <Button
                label={list.loadingMore ? 'Loading…' : 'Show more'}
                variant="outline"
                height={42}
                disabled={list.loadingMore}
                onPress={() =>
                  list.loadMore(async (cur) => {
                    // `next` holds the offset of the next page (some rows are dropped, so it isn't the number of items shown).
                    const at = Number(cur.next);
                    const r = await pluginSkills(applied, at, PAGE);
                    const have = new Set(cur.items.map((i) => i.key));
                    return { items: r.items.filter((i) => !have.has(i.key)), total: r.total, next: at + PAGE < r.total ? String(at + PAGE) : undefined };
                  })
                }
              />
            </View>
          )}
        </View>
      )}
    </>
  );
}

// ---------------- MCP servers ----------------

function McpTab({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const servers = useLibrary((s) => s.servers);
  const [applied, setApplied] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setApplied(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const list = useList<McpListing>(`mcp|${applied}|${nonce}`, true, async () => searchMcp(applied));
  const urls = useMemo(() => new Set(servers.map((s) => s.url.replace(/\/+$/, ''))), [servers]);
  const isAdded = (l: McpListing) => !!l.remote && urls.has(l.remote.url.replace(/\/+$/, ''));
  const open = (l: McpListing) => router.push({ pathname: '/market-mcp', params: { id: rememberMcp(l) } });
  const featured = FEATURED_MCP.filter((f) => !applied || `${f.title} ${f.description} ${f.category}`.toLowerCase().includes(applied.toLowerCase()));

  return (
    <>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search MCP servers" onSubmit={() => setApplied(q.trim())} />
      <Text size={12.5} color="muted" style={{ paddingHorizontal: 4, lineHeight: 19 }}>
        Servers that run online, from the official MCP registry. Anyone can publish to the registry, so add only ones you trust. Actions that change things ask you first.
      </Text>

      {featured.length > 0 && (
        <View>
          <SectionTitle space={8}>Good to start with</SectionTitle>
          <Results>
            {featured.map((l, i) => (
              <Row key={l.id} title={l.title} sub={l.description} meta={(l as (typeof FEATURED_MCP)[number]).category} badge={isAdded(l) ? 'Added' : undefined} last={i === featured.length - 1} onPress={() => open(l)} />
            ))}
          </Results>
        </View>
      )}

      <View>
        <SectionTitle space={8}>{applied ? 'From the MCP registry' : 'Browse the MCP registry'}</SectionTitle>
        {list.items.length > 0 && (
          <Results>
            {list.items.map((l, i) => (
              <Row key={l.id} title={l.title} sub={l.description} meta={l.publisher} badge={isAdded(l) ? 'Added' : undefined} last={i === list.items.length - 1} onPress={() => open(l)} />
            ))}
          </Results>
        )}
        <Status loading={list.loading} error={list.error} empty={list.items.length === 0 ? 'No hosted servers match.' : undefined} onRetry={() => setNonce((n) => n + 1)} />
        {list.next && !list.loading && (
          <View style={{ paddingTop: 12 }}>
            <Button
              label={list.loadingMore ? 'Loading…' : 'Show more'}
              variant="outline"
              height={42}
              disabled={list.loadingMore}
              onPress={() =>
                list.loadMore(async (cur) => {
                  const r = await searchMcp(applied, cur.next);
                  const have = new Set(cur.items.map((i) => i.id));
                  return { items: r.items.filter((i) => !have.has(i.id)), next: r.next };
                })
              }
            />
          </View>
        )}
      </View>
    </>
  );
}

export default function Market() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'mcp' ? 'mcp' : params.tab === 'models' && !isDesktop ? 'models' : 'skills');
  // Each tab keeps its own search text.
  const [qs, setQs] = useState<Record<'skills' | 'mcp', string>>({ skills: '', mcp: '' });
  // Models that run on the device: phones and tablets (the desktop app uses endpoints for now).
  const options: { value: Tab; label: string }[] = [{ value: 'skills', label: 'Skills' }, { value: 'mcp', label: 'MCP servers' }, ...(isDesktop ? [] : [{ value: 'models' as Tab, label: 'Local models' }])];
  return (
    <Screen header={{ title: 'Marketplace' }} maxWidth={GRID} gap={16}>
      <Segmented<Tab> options={options} value={tab} onChange={setTab} />
      {tab === 'skills' ? <SkillsTab q={qs.skills} setQ={(v) => setQs((s) => ({ ...s, skills: v }))} /> : tab === 'mcp' ? <McpTab q={qs.mcp} setQ={(v) => setQs((s) => ({ ...s, mcp: v }))} /> : <LocalModelsTab />}
    </Screen>
  );
}
