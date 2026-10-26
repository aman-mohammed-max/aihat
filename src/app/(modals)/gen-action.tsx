import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Text } from '@/components';
import { RouteSheet } from '@/components/RouteOverlays';
import { device, isDesktop } from '@/lib/device';
import { EXECUTE } from '@/skill-exec/tool';
import { useChats } from '@/store/chats';
import { useTheme } from '@/theme';

/** "Allow this action?": a write/delete tool call, or a skill command, waiting for the user's OK. */
export default function GenAction() {
  const { colors } = useTheme();
  const approval = useChats((s) => s.approval);
  const answered = useRef(false);
  const answer = (ok: boolean) => {
    answered.current = true;
    approval?.resolve(ok);
    router.back();
  };
  // Closing the sheet any other way counts as "no", so the reply doesn't wait forever.
  const pending = useRef(approval);
  useEffect(() => {
    pending.current = approval;
  }, [approval]);
  useEffect(() => () => {
    if (!answered.current) pending.current?.resolve(false);
  }, []);
  if (!approval) return null;
  const { run } = approval;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(run.args || '{}');
  } catch {
    /* shown as it came */
  }

  if (run.name === EXECUTE) {
    return (
      <RouteSheet title="Run this command?" footer={[{ label: 'Don’t run', onPress: () => answer(false) }, { label: 'Run', onPress: () => answer(true), primary: true }]}>
        {args.skill ? <Text size={13} color="muted">{`For the “${String(args.skill)}” skill`}</Text> : null}
        <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12 }}>
          <Text mono size={13} selectable>{String(args.command ?? run.args)}</Text>
        </View>
        <Text size={13} color="text2" style={{ lineHeight: 19 }}>
          {isDesktop
            ? 'It runs on this computer with your own Python or Node, in a temporary folder. Only run commands you understand or trust.'
            : `It runs in a closed sandbox on this ${device}: no internet, no access to your photos, contacts or other apps. It only sees the files in this chat.`}
        </Text>
        <Text size={12} color="muted">You can stop asking in Skills › Run skill scripts.</Text>
      </RouteSheet>
    );
  }

  return (
    <RouteSheet title="Allow this action?" footer={[{ label: 'Deny', onPress: () => answer(false) }, { label: 'Allow once', onPress: () => answer(true) }]}>
      <Text color="warn" size={13}>Writes data</Text>
      <Text mono>{run.server ? `${run.server}.` : ''}{run.name}</Text>
      <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12 }}>
        <Text mono size={12.5} color="text2">{JSON.stringify(args, null, 2) || run.args}</Text>
      </View>
    </RouteSheet>
  );
}
