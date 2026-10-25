// A web page has no system alert (React Native for Web's Alert does nothing), so the desktop app shows its own.
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
