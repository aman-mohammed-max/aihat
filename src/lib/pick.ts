import { router } from 'expo-router';

import { usePicker, type PickerOption } from '@/store/picker';

/** Open the choice picker sheet for a settings value row. */
export function pick(title: string, options: (string | PickerOption)[], selected: string, onPick: (v: string) => void) {
  usePicker.getState().open({
    title,
    selected,
    onPick,
    options: options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
  });
  router.push('/picker');
}
