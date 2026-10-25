import { router } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { useChats } from '@/store/chats';
import { useTheme } from '@/theme';

/** "Allow this action?" — shown when a write/delete tool call needs approval. */
export default function GenAction() {
  const { colors } = useTheme();
  const approval = useChats((s) => s.approval);
  const answer = (ok: boolean) => { approval?.resolve(ok); router.back(); };
  if (!approval) return null;
  const { run } = approval;
  return (
    <RouteSheet title="Allow this action?" snapPoints={['55%']} footer={[{ label: 'Deny', onPress: () => answer(false) }, { label: 'Allow once', onPress: () => answer(true) }]}>
      <Text color="warn" size={13}>Writes data</Text>
      <Text mono>{run.server ? `${run.server}.` : ''}{run.name}</Text>
      <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12 }}>
        <Text mono size={12.5} color="text2">{(() => { try { return JSON.stringify(JSON.parse(run.args || '{}'), null, 2); } catch { return run.args; } })()}</Text>
      </View>
    </RouteSheet>
  );
}
