// Desktop app: API keys live in the computer's keychain (through the app's Bun backend). They are never written to
// the database or to backups.
const k = (providerId: string) => `apikey.${providerId}`;

async function secret(name: string, method: 'GET' | 'PUT' | 'DELETE', value?: string) {
  const res = await fetch(`/api/secret?name=${encodeURIComponent(name)}`, {
    method,
    headers: value === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: value === undefined ? undefined : JSON.stringify({ value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'The keychain could not be reached.');
  return (data.value ?? null) as string | null;
}

export const getApiKey = (providerId: string) => secret(k(providerId), 'GET');
export const setApiKey = (providerId: string, key: string) => secret(k(providerId), 'PUT', key).then(() => {});
export const deleteApiKey = (providerId: string) => secret(k(providerId), 'DELETE').then(() => {});
