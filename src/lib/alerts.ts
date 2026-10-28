// Every alert and text prompt in the app uses its own dialog (components/AlertHost), styled like the rest of the app,
// instead of the system one; on Android this also gives Alert.prompt, which the system lacks.
import { Alert, type AlertButton } from 'react-native';

import { showAlert } from '@/components/AlertHost';

Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => showAlert(title, message, buttons);

Alert.prompt = (title: string, message?: string, callbackOrButtons?: ((text: string) => void) | AlertButton[], _type?: unknown, defaultValue?: string) => {
  if (typeof callbackOrButtons === 'function') {
    showAlert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'OK' }], { value: defaultValue ?? '', onText: callbackOrButtons });
  } else {
    showAlert(title, message, callbackOrButtons ?? [{ text: 'Cancel', style: 'cancel' }, { text: 'OK' }], { value: defaultValue ?? '' });
  }
};
