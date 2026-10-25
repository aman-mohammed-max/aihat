import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** The web build runs only inside the desktop app (Linux, Windows, macOS), with its Bun backend. */
export const isDesktop = Platform.OS === 'web';

/** What to call this device in sentences like "stored only on this phone". */
export const device: 'phone' | 'tablet' | 'computer' = isDesktop ? 'computer' : Device.deviceType === Device.DeviceType.TABLET ? 'tablet' : 'phone';

/** Where secrets are kept, for hints like "Stored only in …". */
export const keyPlace = isDesktop ? 'your computer’s keychain' : `this ${device}’s secure keystore`;
