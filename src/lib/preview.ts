/** Plain text for a banner: no markdown, no reasoning block, no UI spec. */
export function previewOf(markdown: string, max = 140) {
  const t = markdown
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/```spec[\s\S]*?(```|$)/g, '')
    .replace(/```[\s\S]*?(```|$)/g, ' [code] ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
