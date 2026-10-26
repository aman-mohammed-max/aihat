import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { EndpointRoute, Field, Group, ListRow, Note, Screen, SectionTitle, Segmented } from '@/components';
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
    <Screen header={{ title: 'Web search' }} gap={16}>
      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>When to search</SectionTitle>
        <Segmented<Settings['searchMode']> options={[{ value: 'ask', label: 'Only when I ask' }, { value: 'auto', label: 'Automatic' }, { value: 'off', label: 'Off' }]} value={s.searchMode} onChange={(searchMode) => s.set({ searchMode })} />
        <Note>Only when I ask: use the Search chip in the chat box. Automatic: the model can call a web_search tool itself and its sources show under the reply.</Note>
      </View>
      <View style={{ gap: 10 }}>
        <SectionTitle space={0}>Search engine</SectionTitle>
        <Segmented<Settings['searchEngine']>
          options={[{ value: 'provider', label: 'Endpoint' }, { value: 'searxng', label: 'SearXNG' }, { value: 'brave', label: 'Brave' }, { value: 'tavily', label: 'Tavily' }]}
          value={s.searchEngine}
          onChange={(searchEngine) => s.set({ searchEngine })}
        />
        {s.searchEngine === 'provider' && <EndpointRoute cap="search" modelPlaceholder="optional" />}
        {s.searchEngine === 'searxng' && <Field label="SearXNG URL" value={s.searchUrl} onChangeText={(searchUrl) => s.set({ searchUrl })} keyboardType="url" mono placeholder="http://192.168.1.40:8888" hint="Self-hosted. Enable the json format in the instance settings." />}
        {s.searchEngine === 'brave' && <Field label="Brave Search API key" value={brave} onChangeText={(k) => { setBrave(k); setApiKey('search.brave', k); }} secureTextEntry />}
        {s.searchEngine === 'tavily' && <Field label="Tavily API key" value={tavily} onChangeText={(k) => { setTavily(k); setApiKey('search.tavily', k); }} secureTextEntry />}
        <Group>
          <ListRow label="Test search" icon="search" height={46} chevron={false} onPress={runTest} />
        </Group>
        {test ? <Note color={test.startsWith('Works') ? 'accent' : 'muted'}>{test}</Note> : null}
        <Note>SearXNG asks for its URL. Brave and Tavily ask for an API key, stored in the secure keystore.</Note>
      </View>
      <View>
        <ListRow label="Results per search" height={50} value={String(s.searchResults)} onPress={() => pick('Results per search', ['3', '5', '6', '8', '10'], String(s.searchResults), (v) => s.set({ searchResults: Number(v) }))} />
        <ListRow label="Read full pages, not just snippets" height={46} toggle={{ on: s.searchFullPages, onChange: (searchFullPages) => s.set({ searchFullPages }) }} />
        <ListRow label="Safe search" height={46} toggle={{ on: s.searchSafe, onChange: (searchSafe) => s.set({ searchSafe }) }} />
      </View>
      <Field label="Never use these sites" value={s.searchBlocklist} onChangeText={(searchBlocklist) => s.set({ searchBlocklist })} placeholder="example.com, other.org" />
    </Screen>
  );
}
