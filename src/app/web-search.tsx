import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Card, EndpointRoute, Field, ListRow, Screen, SectionTitle, Segmented, Text } from '@/components';
import { getApiKey, setApiKey } from '@/lib/keys';
import { pick } from '@/lib/pick';
import { webSearch } from '@/lib/search';
import { useSettings, type Settings } from '@/store/settings';

export default function WebSearch() {
  const s = useSettings();
  const [brave, setBrave] = useState('');
  const [tavily, setTavily] = useState('');
  const [test, setTest] = useState('');

  useEffect(() => {
    getApiKey('search.brave').then((k) => k && setBrave(k));
    getApiKey('search.tavily').then((k) => k && setTavily(k));
  }, []);

  const runTest = async () => {
    setTest('Searching…');
    try {
      const hits = await webSearch('test');
      setTest(hits.length ? `Works · ${hits.length} results, first: ${hits[0].title}` : 'Connected, but no results came back.');
    } catch (e: any) {
      setTest(e.message);
    }
  };

  return (
    <Screen header={{ title: 'Web search' }}>
      <View style={{ gap: 8 }}>
        <SectionTitle>When to search</SectionTitle>
        <Segmented<Settings['searchMode']> options={[{ value: 'ask', label: 'Only when I ask' }, { value: 'auto', label: 'Automatic' }, { value: 'off', label: 'Off' }]} value={s.searchMode} onChange={(searchMode) => s.set({ searchMode })} />
        <Text size={12} color="muted">Only when I ask: turn on the Search chip in the chat box. Automatic: the model can call a web_search tool itself (needs a model with tool calling).</Text>
      </View>
      <View style={{ gap: 12 }}>
        <SectionTitle>Search engine</SectionTitle>
        <Segmented<Settings['searchEngine']>
          options={[{ value: 'provider', label: 'My endpoint' }, { value: 'searxng', label: 'SearXNG' }, { value: 'brave', label: 'Brave' }, { value: 'tavily', label: 'Tavily' }]}
          value={s.searchEngine}
          onChange={(searchEngine) => s.set({ searchEngine })}
        />
        {s.searchEngine === 'provider' && <EndpointRoute cap="search" modelPlaceholder="optional" hint="Calls POST /v1/search on the endpoint you pick (for example a FreeLLMAPI instance), with query / max_results in the body." />}
        {s.searchEngine === 'searxng' && <Field label="SearXNG URL" value={s.searchUrl} onChangeText={(searchUrl) => s.set({ searchUrl })} keyboardType="url" placeholder="http://192.168.1.40:8888" hint="Self-hosted. Enable the json format in the instance settings." />}
        {s.searchEngine === 'brave' && <Field label="Brave Search API key" value={brave} onChangeText={(k) => { setBrave(k); setApiKey('search.brave', k); }} secureTextEntry />}
        {s.searchEngine === 'tavily' && <Field label="Tavily API key" value={tavily} onChangeText={(k) => { setTavily(k); setApiKey('search.tavily', k); }} secureTextEntry />}
        <Card><ListRow label="Test search" icon="search" onPress={runTest} last /></Card>
        {test ? <Text size={13} color="text2">{test}</Text> : null}
      </View>
      <Card>
        <ListRow label="Results per search" value={String(s.searchResults)} onPress={() => pick('Results per search', ['3', '5', '6', '8', '10'], String(s.searchResults), (v) => s.set({ searchResults: Number(v) }))} />
        <ListRow label="Read full pages, not just snippets" toggle={{ on: s.searchFullPages, onChange: (searchFullPages) => s.set({ searchFullPages }) }} />
        <ListRow label="Safe search" toggle={{ on: s.searchSafe, onChange: (searchSafe) => s.set({ searchSafe }) }} last />
      </Card>
      <Field label="Never use these sites" value={s.searchBlocklist} onChangeText={(searchBlocklist) => s.set({ searchBlocklist })} placeholder="example.com, other.org" />
    </Screen>
  );
}
