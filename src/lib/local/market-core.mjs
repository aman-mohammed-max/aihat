/** Parse only publisher-provided Hugging Face fields; absent metadata remains unknown. */
export function isSafeHttpsUrl(value, allowTemplate = false) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f]/.test(value)) return false;
  const candidate = allowTemplate ? value.replace(/\{[A-Za-z0-9_]+\}/g, 'template-value') : value;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Normalize a public skills site origin, rejecting insecure or credential-bearing URLs. */
export function parseSiteOrigin(input) {
  const value = typeof input === 'string' ? input.trim().replace(/\/+$/, '') : '';
  if (!value || /\s/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !/(^|\.)github\.com$/i.test(url.hostname)
        ? url.origin
        : null;
    } catch {
      return null;
    }
  }
  const host = value.split('/')[0];
  return /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?$/i.test(host) && !/^github\.com$/i.test(host)
    ? `https://${host}`
    : null;
}

/** Resolve a publisher skill URL while requiring HTTPS and rejecting embedded credentials. */
export function resolveSafeSiteUrl(value, base) {
  if (typeof value !== 'string' || value.length > 2048 || !isSafeHttpsUrl(base)) return null;
  try {
    const url = new URL(value, base).toString();
    return isSafeHttpsUrl(url) ? url : null;
  } catch {
    return null;
  }
}

export function fillSafeHttpsTemplate(template, values) {
  if (!isSafeHttpsUrl(template, true)) throw new Error('This marketplace server does not use a safe HTTPS address.');
  const authority = /^https:\/\/[^/?#]*/i.exec(template)?.[0] ?? '';
  if (/\{[A-Za-z0-9_]+\}/.test(authority)) throw new Error('This server puts a variable in its host name, which AI Hat cannot safely fill in.');
  const filled = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => encodeURIComponent(values[key] ?? ''));
  if (!isSafeHttpsUrl(filled)) throw new Error('This marketplace server does not use a safe HTTPS address.');
  return new URL(filled).toString();
}

/** Parse only publisher-provided Hugging Face fields; absent metadata remains unknown. */
export function normalizeRepoMetadata(data) {
  if (!data || typeof data !== 'object') return {};
  const config = data.config && typeof data.config === 'object' ? data.config : {};
  const card = data.cardData && typeof data.cardData === 'object' ? data.cardData : {};
  const architecture = typeof config.model_type === 'string'
    ? config.model_type
    : Array.isArray(config.architectures) && config.architectures.every((value) => typeof value === 'string')
      ? config.architectures.join(', ')
      : undefined;
  const parameterValues = data.safetensors?.parameters && typeof data.safetensors.parameters === 'object'
    ? Object.values(data.safetensors.parameters).filter((value) => typeof value === 'number' && Number.isFinite(value))
    : [];
  const summedParameters = parameterValues.length ? parameterValues.reduce((sum, count) => sum + count, 0) : undefined;
  const parameters = Number.isSafeInteger(config.num_parameters) && config.num_parameters > 0
    ? config.num_parameters
    : Number.isSafeInteger(summedParameters) && summedParameters > 0 ? summedParameters : undefined;
  return {
    ...(architecture ? { architecture: architecture.slice(0, 120) } : {}),
    ...(parameters ? { parameters } : {}),
    ...(typeof card.license === 'string' ? { license: card.license.slice(0, 80) } : {}),
    ...(typeof data.sha === 'string' && /^[0-9a-f]{7,64}$/i.test(data.sha) ? { revision: data.sha } : {}),
  };
}

/** Extract a short inert text excerpt from an untrusted model card. */
export function normalizeModelDescription(readme) {
  if (typeof readme !== 'string') return undefined;
  const body = readme.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').slice(0, 128_000);
  const paragraph = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/[>*_`~]/g, ' ').replace(/\s+/g, ' ').trim())
    .find((part) => part.length > 24);
  return paragraph?.slice(0, 500);
}
