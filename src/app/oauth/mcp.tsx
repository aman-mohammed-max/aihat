import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * The address the browser returns to after an MCP sign-in (aihat://oauth/mcp). The sign-in code reads the answer from the
 * link itself; this screen only exists so that the link isn't an unknown route, and it closes straight away.
 */
export default function OAuthReturn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
