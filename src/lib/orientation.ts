import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

/**
 * Phones stay upright; tablets (and foldables opened up, on Android 16+) turn with the device, and the layout follows
 * the window's width. Unknown device types are left free rather than risk locking a tablet.
 */
export function lockPhonesUpright() {
  if (Platform.OS === 'web' || Device.deviceType !== Device.DeviceType.PHONE) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}
