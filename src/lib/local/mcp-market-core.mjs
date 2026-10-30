import { fillSafeHttpsTemplate, isSafeHttpsUrl } from './market-core.mjs';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const variableNames = (value) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);

function safeVariableMap(value) {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || Object.keys(value).length > 100) return null;
  const out = Object.create(null);
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_]+$/.test(key) || !isRecord(raw)) return null;
    const item = {};
    if (typeof raw.description === 'string') item.description = raw.description.slice(0, 500);
    if (typeof raw.isRequired === 'boolean') item.isRequired = raw.isRequired;
    if (typeof raw.isSecret === 'boolean') item.isSecret = raw.isSecret;
    if (typeof raw.default === 'string' && raw.default.length <= 500) item.default = raw.default;
    if (raw.choices !== undefined) {
      if (!Array.isArray(raw.choices) || raw.choices.length > 100 || raw.choices.some((choice) => typeof choice !== 'string' || choice.length > 200)) return null;
      item.choices = raw.choices;
    }
    out[key] = item;
  }
  return out;
}

function normalizeHeader(value) {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name.length > 128) return null;
  if (value.value !== undefined && (typeof value.value !== 'string' || value.value.length > 512)) return null;
  const variables = safeVariableMap(value.variables);
  if (!variables) return null;
  return {
    name: value.name,
    ...(typeof value.description === 'string' ? { description: value.description.slice(0, 500) } : {}),
    ...(typeof value.isRequired === 'boolean' ? { isRequired: value.isRequired } : {}),
    ...(typeof value.isSecret === 'boolean' ? { isSecret: value.isSecret } : {}),
    ...(value.value !== undefined ? { value: value.value } : {}),
    variables,
  };
}

function normalizeRemote(value) {
  if (!isRecord(value) || !['streamable-http', 'sse'].includes(value.type)) return null;
  if (typeof value.url !== 'string' || value.url.length > 2_048 || !isSafeHttpsUrl(value.url, true)) return null;
  if (value.headers !== undefined && (!Array.isArray(value.headers) || value.headers.length > 16)) return null;
  const headers = (value.headers ?? []).map(normalizeHeader);
  if (headers.some((header) => !header)) return null;
  const variables = safeVariableMap(value.variables);
  if (!variables) return null;
  return { type: value.type, url: value.url, headers, variables };
}

/** Validate and bound the MCP registry fields the app uses. */
export function normalizeMcpRegistryEntry(entry) {
  const server = entry?.server;
  if (!isRecord(server) || typeof server.name !== 'string' || !server.name.trim() || server.name.length > 300) return null;
  const candidates = Array.isArray(server.remotes) ? server.remotes.slice(0, 100) : [];
  let remote = null;
  for (const candidate of [
    ...candidates.filter((item) => item?.type === 'streamable-http'),
    ...candidates.filter((item) => item?.type === 'sse'),
  ]) {
    remote = normalizeRemote(candidate);
    if (remote) break;
  }
  const name = server.name.trim();
  const publisher = name.split('/')[0].split('.').reverse().join('.');
  const title = typeof server.title === 'string' && server.title.trim()
    ? server.title.trim().slice(0, 160)
    : name.split('/').pop().slice(0, 160);
  return {
    id: name,
    title,
    description: typeof server.description === 'string' ? server.description.trim().slice(0, 4_000) : '',
    version: typeof server.version === 'string' ? server.version.slice(0, 120) : '',
    publisher,
    ...(isSafeHttpsUrl(server.repository?.url) ? { repoUrl: server.repository.url } : {}),
    ...(isSafeHttpsUrl(server.websiteUrl) ? { websiteUrl: server.websiteUrl } : {}),
    ...(remote ? { remote } : {}),
  };
}

const unsupported = (reason, fields = []) => ({ supported: false, reason, fields });
const sensitiveName = (value) => {
  const compact = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact === 'key' || /(token|secret|password|passwd|credential|apikey|accesskey|authorization|authkey)/.test(compact);
};
const safeHeaderName = (name) => {
  if (typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return false;
  const lower = name.toLowerCase();
  return ![
    'accept', 'connection', 'content-length', 'content-type', 'cookie', 'host', 'mcp-session-id',
    'origin', 'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'user-agent',
  ].includes(lower) && !lower.startsWith('proxy-') && !lower.startsWith('sec-');
};
const textValue = (value) => typeof value === 'string' ? value : '';

/** Work out which fields a hosted MCP server needs, rejecting credentials in saved URLs. */
export function planMcp(listing) {
  const remote = listing?.remote;
  if (!remote) return unsupported('This server only runs as a program on a computer, so it can’t be used from a phone.');
  if (remote.type === 'sse') return unsupported('This server uses the older SSE connection, which the app doesn’t speak yet.');
  if (remote.type !== 'streamable-http' || !isSafeHttpsUrl(remote.url, true)) return unsupported('This server does not publish a safe HTTPS address.');
  const authority = /^https:\/\/[^/?#]*/i.exec(remote.url)?.[0] ?? '';
  if (/\{[A-Za-z0-9_]+\}/.test(authority)) return unsupported('This server puts a variable in its host name, which AI Hat cannot safely fill in.');

  let parsedUrl;
  try {
    parsedUrl = new URL(remote.url.replace(/\{[A-Za-z0-9_]+\}/g, 'placeholder'));
  } catch {
    return unsupported('This server does not publish a valid HTTPS address.');
  }
  for (const [name] of parsedUrl.searchParams) {
    if (sensitiveName(name)) return unsupported('This server puts a key or password in its address. AI Hat only stores credentials in the secure keystore.');
  }

  const variables = isRecord(remote.variables) ? remote.variables : {};
  const fields = [];
  for (const key of new Set(variableNames(remote.url))) {
    const variable = isRecord(variables[key]) ? variables[key] : {};
    if (variable.isSecret === true || sensitiveName(key)) {
      return unsupported('This server needs a secret in its address. AI Hat only stores credentials in the secure keystore.');
    }
    fields.push({
      key,
      label: key.replace(/_/g, ' '),
      ...(typeof variable.description === 'string' ? { hint: variable.description.slice(0, 500) } : {}),
      secret: false,
      required: variable.isRequired !== false,
      ...(Array.isArray(variable.choices) ? { choices: variable.choices.filter((choice) => typeof choice === 'string').slice(0, 100) } : {}),
      ...(typeof variable.default === 'string' ? { default: variable.default.slice(0, 500) } : {}),
    });
  }

  const headers = Array.isArray(remote.headers) ? remote.headers : [];
  const required = headers.filter((header) => header?.isRequired === true);
  if (headers.length > 1 && required.length !== 1) return unsupported('This server needs several custom headers, which the app can’t send yet.', fields);
  const header = required[0] ?? headers[0];
  let headerName;
  let headerTemplate;
  if (header) {
    if (!safeHeaderName(header.name)) return unsupported('This server requests an invalid or reserved HTTP header.', fields);
    const value = header.value;
    if (value !== undefined && (typeof value !== 'string' || /[\r\n\u0000]/.test(value) || value.length > 512)) {
      return unsupported('This server requests an invalid authentication header value.', fields);
    }
    const placeholders = value === undefined ? [] : variableNames(value);
    if (placeholders.length > 1 || (value !== undefined && (placeholders.length !== 1 || /[{}]/.test(value.replace(`{${placeholders[0] ?? ''}}`, ''))))) {
      return unsupported('This server’s sign-in needs an unsupported header value.', fields);
    }
    const key = placeholders[0];
    const headerVariables = isRecord(header.variables) ? header.variables : {};
    const variable = key && isRecord(headerVariables[key]) ? headerVariables[key] : {};
    headerName = header.name;
    headerTemplate = value === undefined ? '{token}' : value.replace(`{${key}}`, '{token}');
    fields.push({
      key: '@token',
      label: header.name.toLowerCase() === 'authorization' ? 'Access token' : header.name,
      ...(typeof variable.description === 'string' ? { hint: variable.description.slice(0, 500) } : typeof header.description === 'string' ? { hint: header.description.slice(0, 500) } : {}),
      // Authentication values are always sensitive, even if registry metadata says otherwise.
      secret: true,
      required: header.isRequired === true || variable.isRequired === true,
    });
  }
  return { supported: true, fields, headerName, headerTemplate };
}

/** Fill the selected connection fields, keeping credentials out of the persisted address. */
export function buildMcpConnection(listing, plan, values) {
  if (!plan?.supported || !listing?.remote || !isRecord(values)) throw new Error('This marketplace server cannot be configured safely.');
  const fields = Array.isArray(plan.fields) ? plan.fields : [];
  const valueFor = (field) => textValue(values[field.key] ?? field.default).trim();
  for (const field of fields) {
    if (field.required && !valueFor(field)) throw new Error(`${field.label} is required.`);
    if (field.key !== '@token' && field.secret) throw new Error('Secrets cannot be saved in a server address.');
  }
  const replacements = Object.fromEntries(fields.filter((field) => field.key !== '@token').map((field) => [field.key, valueFor(field)]));
  const url = fillSafeHttpsTemplate(listing.remote.url, replacements);
  const tokenField = fields.find((field) => field.key === '@token');
  const token = tokenField ? valueFor(tokenField) : '';
  if (token && (!safeHeaderName(plan.headerName) || typeof plan.headerTemplate !== 'string' || variableNames(plan.headerTemplate).join(',') !== 'token' || /[\r\n\u0000]/.test(plan.headerTemplate))) {
    throw new Error('This server requests an invalid authentication header.');
  }
  return {
    url,
    ...(plan.headerName ? { headerName: plan.headerName } : {}),
    ...(plan.headerTemplate ? { headerTemplate: plan.headerTemplate } : {}),
    ...(token ? { token } : {}),
  };
}
