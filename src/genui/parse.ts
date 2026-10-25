import { compileSpecStream, type Spec } from '@json-render/core';

export type ParsedReply = {
  /** The reply with the UI block removed. */
  text: string;
  spec: Spec | null;
  /** The raw UI block (JSONL), for the "View spec" screen. */
  raw: string;
  /** True while the closing fence hasn't arrived yet. */
  open: boolean;
};

const FENCE = /```(?:spec|json-render|jsonrender|jsonl|ui)[^\n]*\n([\s\S]*?)(```|$)/;
const isPatchLine = (l: string) => /^\s*\{\s*"op"\s*:/.test(l);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Make a model-written spec safe for the renderer, which assumes every element has `props` and `children`.
 * Fills those in, drops elements with no (or, if `allowed` is given, an unknown) type, and prunes children that
 * point at elements that don't exist. Returns null when nothing renderable is left.
 */
export function normalizeSpec(spec: Spec | null, allowed?: ReadonlySet<string>): Spec | null {
  const raw = spec as unknown as { root?: unknown; elements?: unknown; state?: unknown } | null;
  if (!raw || typeof raw.root !== 'string' || !isObj(raw.elements)) return null;

  const ok = new Map<string, Record<string, unknown>>();
  for (const [id, el] of Object.entries(raw.elements)) {
    if (!isObj(el) || typeof el.type !== 'string' || (allowed && !allowed.has(el.type))) continue;
    ok.set(id, el);
  }
  if (!ok.has(raw.root)) return null;

  const elements: Record<string, unknown> = {};
  for (const [id, el] of ok) {
    const children = Array.isArray(el.children) ? el.children.filter((c): c is string => typeof c === 'string' && ok.has(c)) : [];
    elements[id] = { ...el, props: isObj(el.props) ? el.props : {}, children };
  }
  return { ...raw, root: raw.root, elements, state: isObj(raw.state) ? raw.state : {} } as unknown as Spec;
}

/** A spec is only worth rendering once it has a root and at least one element (the first streamed line sets only /root). */
function usable<T>(spec: T): (T & Spec) | null {
  const s = spec as { root?: unknown; elements?: Record<string, unknown> } | null;
  return s && s.root && s.elements && typeof s.elements === 'object' && Object.keys(s.elements).length ? (normalizeSpec(spec as unknown as Spec) as (T & Spec) | null) : null;
}

function compile(raw: string, base?: Spec | null): Spec | null {
  const body = raw.trim();
  if (!body) return null;
  // A whole spec object ({root, elements}) is accepted too.
  if (body.startsWith('{') && !isPatchLine(body.split('\n')[0])) {
    try {
      const o = JSON.parse(body);
      if (usable(o)) return o as Spec;
    } catch {
      /* fall through to JSONL */
    }
  }
  // Drop lines that aren't complete patches (a half-streamed last line, stray prose).
  const lines = body.split('\n').filter((l) => {
    if (!isPatchLine(l)) return false;
    try {
      JSON.parse(l);
      return true;
    } catch {
      return false;
    }
  });
  if (!lines.length) return null;
  try {
    const initial = base ? (JSON.parse(JSON.stringify(base)) as Record<string, unknown>) : undefined;
    const spec = compileSpecStream<Record<string, unknown>>(lines.join('\n'), initial) as unknown as Spec;
    return usable(spec);
  } catch {
    return null;
  }
}

/** Split an assistant reply into chat text and an optional generated UI. */
export function parseReply(content: string, base?: Spec | null): ParsedReply {
  const m = content.match(FENCE);
  if (m) {
    return { text: content.replace(m[0], '').trim(), spec: compile(m[1], base), raw: m[1].trim(), open: m[2] !== '```' };
  }
  // Some models skip the fence and emit bare patch lines after their sentence.
  const lines = content.split('\n');
  if (lines.filter(isPatchLine).length >= (base ? 1 : 2)) {
    const raw = lines.filter(isPatchLine).join('\n');
    return { text: lines.filter((l) => !isPatchLine(l)).join('\n').trim(), spec: compile(raw, base), raw, open: false };
  }
  // Standalone replies are bare patch lines; base lets a revision patch the current UI.
  return { text: content, spec: null, raw: '', open: false };
}

/** Does the user's message ask for something that should be an interface? Used by "Automatic" mode. */
export const wantsUI = (text: string) =>
  /\b(ui|interface|form|checklist|check-list|dashboard|calculator|tracker|planner|widget|mini[- ]?app|screen|settings page|table|survey|quiz|to-?do list|compare .* (side by side|in a table))\b/i.test(text) ||
  /\b(build|make|create|generate|design|show)\b.{0,30}\b(app|tool|card|form|list|panel)\b/i.test(text);
