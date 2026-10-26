import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Dimensions, Platform } from 'react-native';

/**
 * Phones stay upright. Everything with a big screen (tablets, Chromebooks and Android laptops, foldables opened up, iPads,
 * Macs) is left free, so the window can turn and be resized; the layout follows the window's width.
 *
 * The check uses the physical screen, not the window: an app on a Chromebook starts in a phone-sized window, and locking
 * it there would stop it from being maximized or resized.
 */
export function lockPhonesUpright() {
  if (Platform.OS === 'web' || Device.deviceType !== Device.DeviceType.PHONE) return;
  const { width, height } = Dimensions.get('screen');
  if (Math.min(width, height) >= 600) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}
