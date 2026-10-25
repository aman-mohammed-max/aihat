import * as WebBrowser from 'expo-web-browser';

/**
 * Open a sign-in page in the system browser and wait for it to come back to `redirect`. Resolves with the full
 * address it came back to, or null when you closed the browser first.
 */
export async function openAuthSession(url: string, redirect: string): Promise<string | null> {
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  return result.type === 'success' ? result.url : null;
}
