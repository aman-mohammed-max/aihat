import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, ListRow, Screen, SectionTitle, Text } from '@/components';
import { exportBackup, importBackup } from '@/lib/backup';
import { pick } from '@/lib/pick';
import { useSettings } from '@/store/settings';

export default function Backup() {
  const s = useSettings();
  const [status, setStatus] = useState('');
  const inc = s.backupInclude;
  const toggle = (k: keyof typeof inc) => (v: boolean) => s.set({ backupInclude: { ...inc, [k]: v } });
  const run = async () => {
    try {
      const r = await exportBackup(inc);
      setStatus(`Backup ready · ${(r.bytes / 1024).toFixed(0)} KB`);
    } catch (e: any) { Alert.alert('Backup failed', e.message); }
  };
  const restore = async () => {
    try {
      const n = await importBackup();
      if (n != null) { setStatus(`Restored ${n} tables`); router.replace('/'); }
    } catch (e: any) { Alert.alert('Restore failed', e.message); }
  };
  return (
    <Screen header={{ title: 'Sync & backup' }} footer={<Button label="Back up now" flex onPress={run} />}>
      {status ? <Text color="accent">{status}</Text> : null}
      <View>
        <SectionTitle>Save to</SectionTitle>
        <Card>
          <ListRow icon="file" label="A .json file" sub="Share it to Drive, iCloud or any app" value={s.backupTarget === 'file' ? 'Selected' : undefined} onPress={() => s.set({ backupTarget: 'file' })} />
          <ListRow icon="link" label="Google Drive" sub="Connect it in Connectors" onPress={() => router.push('/connectors')} />
          <ListRow icon="link" label="iCloud Drive" sub="Apple devices only" onPress={() => router.push('/connectors')} last />
        </Card>
      </View>
      <View>
        <SectionTitle>Include</SectionTitle>
        <Card>
          <ListRow label="Chats and files" toggle={{ on: inc.chats, onChange: toggle('chats') }} />
          <ListRow label="System prompts" toggle={{ on: inc.prompts, onChange: toggle('prompts') }} />
          <ListRow label="Skills" toggle={{ on: inc.skills, onChange: toggle('skills') }} />
          <ListRow label="Providers & MCP" toggle={{ on: inc.mcp, onChange: toggle('mcp') }} />
          <ListRow label="Settings" toggle={{ on: inc.settings, onChange: toggle('settings') }} last />
        </Card>
        <Text size={12} color="muted" style={{ marginTop: 8, paddingLeft: 4 }}>API keys are never backed up.</Text>
      </View>
      <Card>
        <ListRow label="Back up automatically" value={s.backupSchedule === 'off' ? 'Off' : s.backupSchedule} onPress={() => pick('Back up automatically', ['off', 'daily', 'weekly'], s.backupSchedule, (v) => s.set({ backupSchedule: v as typeof s.backupSchedule }))} />
        <ListRow label="Restore from a backup" onPress={restore} last />
      </Card>
    </Screen>
  );
}
