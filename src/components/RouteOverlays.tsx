import { router } from 'expo-router';
import { useCallback, useRef } from 'react';

import { BottomSheet, Dialog } from './Overlays';

const close = () => {
  if (router.canGoBack()) router.back();
};

/** A bottom sheet that is its own route (presentation: transparentModal). Closing pops the route once. */
export function RouteSheet(props: Omit<React.ComponentProps<typeof BottomSheet>, 'onClose'>) {
  const closed = useRef(false);
  const onClose = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    close();
  }, []);
  return <BottomSheet {...props} onClose={onClose} />;
}

/** A dialog that is its own route. */
export function RouteDialog(props: Omit<React.ComponentProps<typeof Dialog>, 'visible' | 'onClose'> & { onClose?: () => void }) {
  return <Dialog {...props} visible onClose={props.onClose ?? close} />;
}
