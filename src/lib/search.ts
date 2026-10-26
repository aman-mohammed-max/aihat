import { providerSearch, type SearchHit } from '@/api/openai';
import { useSettings } from '@/store/settings';

import { resolveRoute } from './endpoints';
import { getApiKey } from './keys';

export type { SearchHit };

const stripHtml = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m));

/** The readable text of a web page (up to 20,000 characters) and its title, for adding a page to a message. */
export async function readWebPage(input: string): Promise<{ url: string; title: string; text: string }> {
  const url = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const html = await res.text();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '') || new URL(url).hostname;
  const text = decode(stripHtml(html)).slice(0, 20000);
  if (!text) throw new Error('That page has no readable text.');
  return { url, title, text };
}

async function run(query: string): Promise<SearchHit[]> {
  const s = useSettings.getState();
  const n = s.searchResults;

  if (s.searchEngine === 'provider') {
    const { provider, model } = resolveRoute('search');
    if (!provider) throw new Error('Add an endpoint first (needed for web search).');
    return providerSearch(provider, query, n, model || undefined);
  }
  if (s.searchEngine === 'searxng') {
    const u = `${s.searchUrl.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query)}&safesearch=${s.searchSafe ? 1 : 0}`;
    const res = await fetch(u);
    if (!res.ok) throw new Error(`SearXNG returned ${res.status}. Is the json format enabled?`);
    return ((await res.json()).results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content ?? '' }));
  }
  if (s.searchEngine === 'brave') {
    const key = await getApiKey('search.brave');
    if (!key) throw new Error('Add your Brave Search API key in Web search settings.');
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}&safesearch=${s.searchSafe ? 'strict' : 'off'}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    });
    if (!res.ok) throw new Error(`Brave Search returned ${res.status}.`);
    return ((await res.json()).web?.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.description ?? '' }));
  }
  const key = await getApiKey('search.tavily');
  if (!key) throw new Error('Add your Tavily API key in Web search settings.');
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: n }),
  });
  if (!res.ok) throw new Error(`Tavily returned ${res.status}.`);
  return ((await res.json()).results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content ?? '' }));
}

/** Search with the engine chosen in settings; optionally read the top pages instead of just snippets. */
export async function webSearch(query: string): Promise<SearchHit[]> {
  const s = useSettings.getState();
  const blocked = s.searchBlocklist.split(/[\s,]+/).filter(Boolean);
  const hits = (await run(query)).filter((h) => !blocked.some((b) => h.url.includes(b))).slice(0, s.searchResults);
  if (!s.searchFullPages) return hits;
  return Promise.all(
    hits.map(async (h, i) => {
      if (i >= 3) return h;
      try {
        const res = await fetch(h.url);
        const text = stripHtml(await res.text()).slice(0, 3500);
        return text.length > 200 ? { ...h, snippet: text } : h;
      } catch {
        return h;
      }
    }),
  );
}

export const formatHits = (hits: SearchHit[], offset = 0) => hits.map((h, i) => `[${offset + i + 1}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n');
