import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

import { CrashLog } from '../../modules/crashlog';
import { toast } from '@/store/toast';

/**
 * Android: when the app closed by itself last time, say so once, with the details to copy (the reason, and for a crash
 * the place it happened), so a problem can be reported even without a computer.
 */
export function reportLastCrash() {
  let report: string | null = null;
  try {
    report = CrashLog?.take() ?? null;
  } catch {
    return;
  }
  if (!report) return;
  const short = report.split('\n').filter(Boolean).slice(0, 5).join('\n');
  Alert.alert('AI Hat closed unexpectedly last time', short, [
    { text: 'OK', style: 'cancel' },
    {
      text: 'Copy details',
      onPress: () => {
        Clipboard.setStringAsync(report!).then(() => toast('Copied'));
      },
    },
  ]);
}
