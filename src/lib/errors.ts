/**
 * Errors from AI endpoints, in words: servers answer with JSON ({"error":{"message":…}}), FastAPI's {"detail":…},
 * plain text or a whole HTML page. This finds the actual message, names the problem, and keeps the original for
 * "Details".
 */
export type Explained = { title: string; message: string; hint?: string; status?: number; details?: string };

function messageFrom(body: string): { message: string; details?: string } {
  const text = body.trim();
  if (!text) return { message: '' };
  if (/^[[{]/.test(text)) {
    try {
      const j = JSON.parse(text);
      const pick = (v: any): string | undefined =>
        typeof v === 'string' ? v : v && typeof v === 'object' ? pick(v.message) ?? pick(v.error) ?? pick(v.detail) ?? pick(v.msg) ?? (Array.isArray(v) ? pick(v[0]) : undefined) : undefined;
      const m = pick(j) ?? '';
      return { message: m, details: JSON.stringify(j, null, 2) };
    } catch {
      /* not JSON after all */
    }
  }
  if (/<html|<!doctype/i.test(text)) {
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
    return { message: title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), details: text.slice(0, 2000) };
  }
  return { message: text.length > 400 ? `${text.slice(0, 400)}…` : text, details: text.length > 400 ? text : undefined };
}

const BY_STATUS: Record<number, [string, string?]> = {
  400: ['The endpoint didn’t accept the request', 'The model may not support something in this chat (pictures, tools or a setting).'],
  401: ['The API key was rejected', 'Check the key in Settings › Providers.'],
  402: ['Out of credits', 'Add credit with the provider, or switch to another model.'],
  403: ['Not allowed', 'This key may not have access to this model.'],
  404: ['Model or address not found', 'Check the model name and the endpoint address (it usually ends in /v1).'],
  408: ['The endpoint took too long', 'Try again, or use a faster model.'],
  413: ['The message is too large', 'Remove a file or a picture, or start a new chat.'],
  422: ['The endpoint didn’t accept the request', 'A setting or the message format isn’t supported by this model.'],
  429: ['Too many requests', 'You’ve hit the provider’s rate limit. Wait a moment and try again.'],
  500: ['The endpoint had a problem', 'It’s on the provider’s side. Try again in a moment.'],
  502: ['The endpoint is unavailable', 'The provider’s server didn’t answer properly. Try again soon.'],
  503: ['The endpoint is busy or down', 'Try again in a moment, or switch model.'],
  504: ['The endpoint took too long', 'Try again, or use a faster model.'],
};

/** Turn an error line saved on a message ("Endpoint error 429: {…}" or a plain sentence) into a friendly one. */
export function explainError(raw: string): Explained {
  const m = /^Endpoint error (\d{3}):\s*([\s\S]*)$/.exec(raw.trim());
  if (!m) {
    if (/rejected the key \(401\)/.test(raw)) return { title: BY_STATUS[401][0], message: '', hint: BY_STATUS[401][1], status: 401 };
    // Already a sentence written by the app (network, empty reply…): keep it, with a short title.
    const network = /reach the endpoint/i.test(raw);
    return { title: network ? 'Couldn’t reach the endpoint' : 'Couldn’t get a reply', message: raw.replace(/^Could not reach the endpoint\s*/i, '').replace(/^\((.*)\)\.\s*/, 'Reason: $1. ') };
  }
  const status = Number(m[1]);
  const { message, details } = messageFrom(m[2]);
  let [title, hint] = BY_STATUS[status] ?? [status >= 500 ? 'The endpoint had a problem' : `The endpoint answered ${status}`, undefined];
  if (/context|too many tokens|maximum.*length|token limit|too long/i.test(message)) {
    title = 'The chat is too long for this model';
    hint = 'Start a new chat, use /compact, or pick a model with a bigger context.';
  } else if (/rate.?limit|quota/i.test(message) && status !== 402) {
    title = 'Too many requests';
    hint = BY_STATUS[429][1];
  } else if (/not.*(support|found).*model|\bmodel\b.*\b(not found|not exist|does not exist|doesn’t exist|unavailable)|unknown model|no such model/i.test(message)) {
    title = 'This model isn’t available';
    hint = 'Pick another model, or refresh the model list.';
  }
  return { title, message: message && message !== title ? message : '', hint, status, details: details ?? (m[2].trim() || undefined) };
}
