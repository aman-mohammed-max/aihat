import { useState } from 'react';

import * as haptic from '@/lib/haptics';
import { useProviders } from '@/store/providers';

/**
 * Re-fetch model lists: one provider (`providerId`) or all of them. `note` is a short result line for the UI,
 * for example "12 models · 2 new".
 */
export function useRefreshModels(providerId?: string) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    haptic.select();
    const store = useProviders.getState();
    if (providerId) {
      const r = await store.refreshModels(providerId);
      setNote(r.ok ? `${r.total} models${r.added ? ` · ${r.added} new` : ''}${r.removed ? ` · ${r.removed} removed` : ''}` : r.error ?? 'Could not reach the endpoint');
      if (r.ok) haptic.success();
      else haptic.error();
    } else {
      if (!store.providers.length) {
        setNote('No endpoints yet');
      } else {
        const r = await store.refreshAll();
        setNote(
          r.failed.length
            ? `${r.ok} of ${r.ok + r.failed.length} updated · couldn’t reach ${r.failed.join(', ')}`
            : `${r.total} models${r.added ? ` · ${r.added} new` : ''}`,
        );
        if (r.failed.length) haptic.error();
        else haptic.success();
      }
    }
    setBusy(false);
  };

  return { busy, note, run };
}
