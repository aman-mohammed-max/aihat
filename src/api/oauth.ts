/**
 * Browser sign-in (OAuth 2.1 with PKCE) for MCP servers, the way the MCP specification describes it:
 *
 *  1. Ask the server without credentials. A 401 answer names where its sign-in is described (RFC 9728).
 *  2. Read the sign-in service's addresses (RFC 8414 / OpenID discovery).
 *  3. Register this app as a client on the fly (RFC 7591), so there is nothing to set up by hand.
 *  4. Open the system browser at the authorization address with a PKCE challenge, and come back through the `aihat://`
 *     link (the desktop app comes back to its own address on 127.0.0.1 instead).
 *  5. Trade the code for tokens, keep them in the keystore, and refresh them when they run out.
 *
 * Servers that don't allow step 3 (no registration address) can't be signed into this way; an access token still works.
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';

import { getDb } from '@/db';
import { openAuthSession } from '@/lib/authsession';
import { deleteApiKey, getApiKey, setApiKey } from '@/lib/keys';

export class OAuthError extends Error {
  constructor(public code: 'unsupported' | 'cancelled' | 'denied' | 'failed' | 'expired', message: string) {
    super(message);
    this.name = 'OAuthError';
  }
}

// ---------- small helpers ----------

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytesToB64url = (bytes: Uint8Array) => b64url(btoa(String.fromCharCode(...bytes)));

/** The address the browser returns to: `aihat://oauth/mcp` on a phone, `http://127.0.0.1:<port>/oauth/mcp` on a computer. */
export const redirectUri = () => Linking.createURL('oauth/mcp');

const isLocalHost = (h: string) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(h) || h.endsWith('.local');

/** Sign-in addresses must use https; a server on your own network over plain http may use http for its own. */
function requireSafe(address: string, mcpUrl: string, what: string) {
  const u = new URL(address);
  if (u.protocol === 'https:') return;
  if (u.protocol === 'http:' && new URL(mcpUrl).protocol === 'http:' && isLocalHost(u.hostname)) return;
  throw new OAuthError('unsupported', `The ${what} isn’t on https, so the app won’t use it.`);
}

/** fetch that gives up after `ms`, so a server that never answers can't leave the screen waiting. */
async function timedFetch(url: string, init: RequestInit = {}, ms = 12_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await timedFetch(url, { headers: { Accept: 'application/json' } }, 8_000);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ---------- discovery ----------

/** `Bearer realm="OAuth", resource_metadata="https://…", scope="read write"` → the parts we use. */
export function parseChallenge(header: string | null | undefined) {
  const get = (k: string) => header?.match(new RegExp(`(?:^|[\\s,])${k}="([^"]*)"`, 'i'))?.[1];
  return { resourceMetadata: get('resource_metadata'), scope: get('scope') };
}

export type Discovery = {
  /** The canonical address of the MCP server (sent as `resource`). */
  resource: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  /** What to ask for: the server's own hint, else the scopes it lists. */
  scope?: string;
  authMethods: string[];
};

const INIT = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'AI Hat', version: '1' } } });

const asMetadataUrls = (issuer: string) => {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/+$/, '');
  return path
    ? [`${u.origin}/.well-known/oauth-authorization-server${path}`, `${u.origin}/.well-known/openid-configuration${path}`, `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`]
    : [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`];
};

/** Find out how a server wants you to sign in. Throws `unsupported` when it doesn't ask for a sign-in or the sign-in can't be understood. */
export async function discover(mcpUrl: string): Promise<Discovery> {
  try {
    return await findSignIn(mcpUrl);
  } catch (e) {
    if (e instanceof OAuthError) throw e;
    const gone = e instanceof TypeError || (e as Error)?.name === 'AbortError';
    throw new OAuthError('failed', gone ? 'Couldn’t reach the server. Check the address and your connection.' : (e as Error)?.message ?? 'Sign-in could not be set up.');
  }
}

async function findSignIn(mcpUrl: string): Promise<Discovery> {
  const res = await timedFetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: INIT }, 10_000);
  if (res.status !== 401) throw new OAuthError('unsupported', res.ok ? 'This server doesn’t ask for a sign-in.' : `The server answered ${res.status}.`);
  const challenge = parseChallenge(res.headers.get('WWW-Authenticate'));
  const origin = new URL(mcpUrl).origin;
  const path = new URL(mcpUrl).pathname.replace(/\/+$/, '');

  let prm: any = null;
  for (const u of [challenge.resourceMetadata, path ? `${origin}/.well-known/oauth-protected-resource${path}` : undefined, `${origin}/.well-known/oauth-protected-resource`]) {
    if (!u) continue;
    requireSafe(u, mcpUrl, 'sign-in description');
    prm = await getJson(u);
    if (prm) break;
  }

  const issuer: string = prm?.authorization_servers?.[0] ?? origin;
  requireSafe(issuer, mcpUrl, 'sign-in service');
  let meta: any = null;
  for (const u of asMetadataUrls(issuer)) {
    meta = await getJson(u);
    if (meta?.authorization_endpoint && meta?.token_endpoint) break;
    meta = null;
  }
  // Servers from before the discovery documents existed use these fixed paths on their own address.
  if (!meta && !prm) meta = { authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register` };
  if (!meta) throw new OAuthError('unsupported', 'This server’s sign-in service could not be found.');

  if (Array.isArray(meta.code_challenge_methods_supported) && !meta.code_challenge_methods_supported.includes('S256')) {
    throw new OAuthError('unsupported', 'This service doesn’t support the secure sign-in (PKCE) the app uses.');
  }
  requireSafe(meta.authorization_endpoint, mcpUrl, 'sign-in page');
  requireSafe(meta.token_endpoint, mcpUrl, 'token address');
  if (meta.registration_endpoint) requireSafe(meta.registration_endpoint, mcpUrl, 'registration address');

  const prmScopes: string[] | undefined = Array.isArray(prm?.scopes_supported) ? prm.scopes_supported : undefined;
  let scope = challenge.scope || prmScopes?.join(' ') || undefined;
  // Refresh tokens are only handed out on request by services that list this scope.
  if (scope && Array.isArray(meta.scopes_supported) && meta.scopes_supported.includes('offline_access') && !scope.split(' ').includes('offline_access')) scope += ' offline_access';

  return {
    resource: typeof prm?.resource === 'string' ? prm.resource : mcpUrl,
    issuer,
    authorizationEndpoint: meta.authorization_endpoint,
    tokenEndpoint: meta.token_endpoint,
    registrationEndpoint: meta.registration_endpoint,
    scope,
    authMethods: Array.isArray(meta.token_endpoint_auth_methods_supported) ? meta.token_endpoint_auth_methods_supported : [],
  };
}

/** What a server needs before the app can use it: nothing, a browser sign-in, or an access token you paste. */
export async function probeAuth(mcpUrl: string): Promise<'none' | 'oauth' | 'token' | 'unknown'> {
  let res: Response;
  try {
    res = await timedFetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: INIT }, 10_000);
  } catch {
    return 'unknown'; // unreachable: the add step will say so
  }
  if (res.ok) return 'none';
  if (res.status !== 401) return 'unknown';
  try {
    return (await findSignIn(mcpUrl)).registrationEndpoint ? 'oauth' : 'token';
  } catch {
    return 'token';
  }
}

// ---------- stored state ----------

type Method = 'none' | 'post' | 'basic';
type Meta = {
  clientId: string;
  method: Method;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string;
  redirect: string;
  scope?: string;
  /** When the access token stops working (ms since 1970), if the service said. */
  expiresAt?: number;
};

const metaKey = (id: string) => `mcp.${id}.oauth`;
const tokenKey = (id: string, part: 'access' | 'refresh' | 'secret') => `mcp.${id}.oauth.${part}`;

async function readMeta(id: string): Promise<Meta | null> {
  const row = await (await getDb()).getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key=?', metaKey(id));
  try {
    return row ? (JSON.parse(row.value) as Meta) : null;
  } catch {
    return null;
  }
}
const writeMeta = async (id: string, m: Meta) => void (await (await getDb()).runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)', metaKey(id), JSON.stringify(m)));

export async function isSignedIn(id: string) {
  return !!(await readMeta(id)) && !!(await getApiKey(tokenKey(id, 'access')));
}

/** Sign out: the tokens go, the app's registration with the service stays so signing in again doesn't register again. */
export async function signOut(id: string) {
  await Promise.all((['access', 'refresh'] as const).map((p) => deleteApiKey(tokenKey(id, p)).catch(() => {})));
}

/** Forget everything about a server's sign-in (when the server is removed). */
export async function forget(id: string) {
  await (await getDb()).runAsync('DELETE FROM kv WHERE key=?', metaKey(id));
  await Promise.all((['access', 'refresh', 'secret'] as const).map((p) => deleteApiKey(tokenKey(id, p)).catch(() => {})));
}

// ---------- tokens ----------

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(meta: Pick<Meta, 'clientId' | 'method' | 'tokenEndpoint'>, secret: string | null, form: Record<string, string>): Promise<TokenReply> {
  const body = new URLSearchParams({ ...form, client_id: meta.clientId });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (secret && meta.method === 'post') body.set('client_secret', secret);
  if (secret && meta.method === 'basic') headers.Authorization = `Basic ${btoa(`${encodeURIComponent(meta.clientId)}:${encodeURIComponent(secret)}`)}`;
  const res = await timedFetch(meta.tokenEndpoint, { method: 'POST', headers, body: body.toString() }, 20_000);
  const data: TokenReply = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new OAuthError(data.error === 'invalid_grant' ? 'expired' : 'failed', data.error_description || data.error || `The sign-in service answered ${res.status}.`);
  }
  return data;
}

async function keep(id: string, meta: Meta, t: TokenReply) {
  await setApiKey(tokenKey(id, 'access'), t.access_token!);
  if (t.refresh_token) await setApiKey(tokenKey(id, 'refresh'), t.refresh_token);
  await writeMeta(id, { ...meta, scope: t.scope ?? meta.scope, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined });
}

const refreshing = new Map<string, Promise<string | null>>();

/** A working access token for the server, refreshed when it has run out, or null when you need to sign in again. */
export async function accessToken(id: string, force = false): Promise<string | null> {
  const meta = await readMeta(id);
  const access = await getApiKey(tokenKey(id, 'access'));
  if (!meta || !access) return null;
  const stale = force || (meta.expiresAt !== undefined && Date.now() > meta.expiresAt - 60_000);
  if (!stale) return access;
  const running = refreshing.get(id);
  if (running) return running;
  const job = (async () => {
    const refresh = await getApiKey(tokenKey(id, 'refresh'));
    if (!refresh) return null;
    try {
      const t = await tokenRequest(meta, await getApiKey(tokenKey(id, 'secret')), { grant_type: 'refresh_token', refresh_token: refresh, resource: meta.resource });
      await keep(id, meta, t);
      return t.access_token!;
    } catch (e) {
      // The refresh token was refused: the sign-in is over. A network hiccup keeps it for next time.
      if (e instanceof OAuthError && e.code === 'expired') await signOut(id);
      return null;
    }
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, job);
  return job;
}

// ---------- sign in ----------

async function register(d: Discovery, redirect: string) {
  if (!d.registrationEndpoint) {
    throw new OAuthError('unsupported', 'This service doesn’t let apps sign themselves up, so browser sign-in isn’t possible here. Use an access token instead.');
  }
  const method = !d.authMethods.length || d.authMethods.includes('none') ? 'none' : d.authMethods.includes('client_secret_post') ? 'client_secret_post' : 'client_secret_basic';
  const res = await timedFetch(d.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_name: 'AI Hat', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: method }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_id) throw new OAuthError('unsupported', data.error_description || data.error || `The service refused the app’s registration (${res.status}).`);
  const given: string = data.token_endpoint_auth_method ?? method;
  return { clientId: String(data.client_id), secret: data.client_secret ? String(data.client_secret) : null, method: (given === 'client_secret_post' ? 'post' : given === 'client_secret_basic' ? 'basic' : 'none') as Method };
}

/** Run the whole browser sign-in for a server and keep the tokens. Throws OAuthError. */
export async function signIn(id: string, mcpUrl: string): Promise<void> {
  const d = await discover(mcpUrl);
  const redirect = redirectUri();

  // Reuse the registration from an earlier sign-in to the same service.
  const prev = await readMeta(id);
  let client: { clientId: string; method: Method; secret: string | null };
  if (prev && prev.issuer === d.issuer && prev.redirect === redirect) {
    client = { clientId: prev.clientId, method: prev.method, secret: await getApiKey(tokenKey(id, 'secret')) };
  } else {
    client = await register(d, redirect);
    if (client.secret) await setApiKey(tokenKey(id, 'secret'), client.secret);
    else await deleteApiKey(tokenKey(id, 'secret')).catch(() => {});
  }

  const verifier = bytesToB64url(await Crypto.getRandomBytesAsync(32));
  const challenge = b64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  const state = bytesToB64url(await Crypto.getRandomBytesAsync(16));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: redirect,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    resource: d.resource,
    ...(d.scope ? { scope: d.scope } : {}),
  });
  const authUrl = `${d.authorizationEndpoint}${d.authorizationEndpoint.includes('?') ? '&' : '?'}${params}`;

  const returned = await openAuthSession(authUrl, redirect);
  if (!returned) throw new OAuthError('cancelled', 'Sign-in was cancelled.');
  const back = new URL(returned).searchParams;
  if (back.get('error')) throw new OAuthError('denied', back.get('error_description') || `The service said: ${back.get('error')}.`);
  if (back.get('state') !== state) throw new OAuthError('failed', 'The sign-in answer didn’t match the request, so it was ignored.');
  const code = back.get('code');
  if (!code) throw new OAuthError('failed', 'The sign-in finished without a code.');

  const meta: Meta = { clientId: client.clientId, method: client.method, issuer: d.issuer, authorizationEndpoint: d.authorizationEndpoint, tokenEndpoint: d.tokenEndpoint, resource: d.resource, redirect, scope: d.scope };
  const t = await tokenRequest(meta, client.secret, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, resource: d.resource });
  await keep(id, meta, t);
}
