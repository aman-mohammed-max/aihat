import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, ListRow, Note, Screen, SectionTitle, Text } from '@/components';
import { exportBackup, importBackup } from '@/lib/backup';
import { isDesktop } from '@/lib/device';
import { pick } from '@/lib/pick';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

const SCHEDULE: Record<string, string> = { off: 'Off', daily: 'Daily', weekly: 'Weekly' };

/** A place to save backups: a lettered tile, its name and state, and a dot when it's the one in use. */
function Target({ letter, label, sub, on, action, onPress, last }: { letter: string; label: string; sub: string; on?: boolean; action?: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={{ minHeight: 60, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Text size={14} weight="semi">{letter}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size={15}>{label}</Text>
        <Text size={12.5} color="muted">{sub}</Text>
      </View>
      {action ? (
        <View style={{ height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text size={13}>{action}</Text>
        </View>
      ) : on ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
      ) : null}
    </Pressable>
  );
}

export default function Backup() {
  const s = useSettings();
  const [status, setStatus] = useState('');
  const inc = s.backupInclude;
  const toggle = (k: keyof typeof inc) => (v: boolean) => s.set({ backupInclude: { ...inc, [k]: v } });
  const last = s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  const run = async () => {
    try {
      const r = await exportBackup(inc);
      setStatus(r.path ? `Saved to ${r.path}` : `Backup ready · ${(r.bytes / 1024).toFixed(0)} KB`);
    } catch (e: any) {
      Alert.alert('Backup failed', e.message);
    }
  };
  const restore = async () => {
    try {
      const n = await importBackup();
      if (n != null) {
        setStatus(`Restored ${n} tables`);
        router.replace('/');
      }
    } catch (e: any) {
      Alert.alert('Restore failed', e.message);
    }
  };

  return (
    <Screen header={{ title: 'Sync & backup' }} gap={16} footer={<Button label="Back up now" flex height={48} onPress={run} />}>
      <View>
        <SectionTitle>Save to</SectionTitle>
        <Target letter="F" label="A .json file" sub={isDesktop ? 'Saved to your Downloads folder' : `Share it to Drive, iCloud or any app${last ? ` · last ${last}` : ''}`} on={s.backupTarget === 'file'} onPress={() => s.set({ backupTarget: 'file' })} />
        <Target letter="D" label="Google Drive" sub="Connect it in Connectors" action="Connect" onPress={() => router.push('/connectors')} />
        <Target letter="i" label="iCloud Drive" sub="Apple devices only" action="Connect" onPress={() => router.push('/connectors')} last />
      </View>
      <View>
        <SectionTitle>Include</SectionTitle>
        <ListRow label="Chats and files" height={44} toggle={{ on: inc.chats, onChange: toggle('chats') }} />
        <ListRow label="System prompts" height={44} toggle={{ on: inc.prompts, onChange: toggle('prompts') }} />
        <ListRow label="Skills" height={44} toggle={{ on: inc.skills, onChange: toggle('skills') }} />
        <ListRow label="Providers & MCP" height={44} toggle={{ on: inc.mcp, onChange: toggle('mcp') }} />
        <ListRow label="Settings" height={44} toggle={{ on: inc.settings, onChange: toggle('settings') }} />
        <View style={{ paddingTop: 4 }}>
          <Note>API keys are never backed up.</Note>
        </View>
      </View>
      <View>
        <ListRow label="Back up automatically" height={46} value={SCHEDULE[s.backupSchedule]} onPress={() => pick('Back up automatically', [{ value: 'off', label: 'Off' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }], s.backupSchedule, (v) => s.set({ backupSchedule: v as typeof s.backupSchedule }))} />
        <ListRow label="Restore from a backup" height={46} onPress={restore} />
      </View>
      {status ? <Note color="accent">{status}</Note> : null}
    </Screen>
  );
}
