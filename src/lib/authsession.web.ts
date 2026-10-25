/**
 * Desktop app: the sign-in page opens in your normal browser and comes back to the app's own local address
 * (http://127.0.0.1:<port>/oauth/…, a loopback redirect as RFC 8252 describes). The backend holds the answer
 * until the app collects it here. Gives up after five minutes.
 */
export async function openAuthSession(url: string, _redirect: string): Promise<string | null> {
  const state = new URL(url).searchParams.get('state');
  if (!state) throw new Error('The sign-in request has no state.');
  await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const res = await fetch(`/api/oauth/wait?state=${encodeURIComponent(state)}&ms=300000`);
  if (!res.ok) return null;
  return ((await res.json()) as { url: string }).url;
}
