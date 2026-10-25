import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components';
import * as haptic from '@/lib/haptics';
import { useLibrary } from '@/store/library';
import { toast } from '@/store/toast';

const SHOWN = 40_000;
const SCRIPT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|php|pl|lua|go|rs|java|kt|swift|c|cpp|cs|sql|r)$/i;

/** One of a skill's extra files, as plain text. */
export default function SkillFile() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  const skill = useLibrary((s) => s.skills.find((k) => k.id === id));
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (id && path) useLibrary.getState().readSkillFile(id, path).then(setText);
  }, [id, path]);

  const name = (path ?? '').split('/').pop() ?? 'File';
  return (
    <Screen
      header={{ title: name }}
      footer={text ? <Button label="Copy" variant="outline" flex onPress={async () => { await Clipboard.setStringAsync(text); haptic.success(); toast('Copied'); }} /> : undefined}>
      <View style={{ gap: 4 }}>
        <Text mono size={12.5} color="muted" selectable>{path}</Text>
        {skill ? <Text size={12.5} color="muted">Part of the “{skill.name}” skill</Text> : null}
      </View>
      {SCRIPT.test(path ?? '') && <Text size={12.5} color="warn" style={{ lineHeight: 18 }}>A script. AI Hat keeps it as text so the assistant can read it. It is never run on the phone.</Text>}
      {text === undefined ? <Text color="muted">Loading…</Text> : text === null ? <Text color="muted">This file is no longer stored.</Text> : (
        <Card style={{ padding: 14, gap: 8 }}>
          <Text mono size={12} color="text2" selectable>{text.length > SHOWN ? text.slice(0, SHOWN) : text}</Text>
          {text.length > SHOWN && <Text size={12} color="muted">Showing the first {SHOWN.toLocaleString('en-US')} of {text.length.toLocaleString('en-US')} characters. The assistant can read more.</Text>}
        </Card>
      )}
    </Screen>
  );
}
