/**
 * Markdown for chat replies, parsed into blocks (paragraphs, headings, lists, tables, code, quotes) and inline runs
 * (bold, italic, code, links, cited sources). Tolerant of half-written markdown while a reply streams in.
 */

export type Citation = { title: string; url: string };

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; level: number; text: string }
  | { t: 'code'; lang: string; text: string; open: boolean }
  | { t: 'list'; ordered: boolean; start: number; items: { text: string; task?: boolean; done?: boolean; children: Block[] }[] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'table'; head: string[]; align: ('left' | 'center' | 'right')[]; rows: string[][] }
  | { t: 'hr' };

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([^`]*)$/.exec(line);
    if (fence) {
      const close = new RegExp(`^\\s*${fence[1][0] === '`' ? '`' : '~'}{${fence[1].length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      out.push({ t: 'code', lang: fence[2].trim(), text: body.join('\n'), open: i >= lines.length });
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ t: 'quote', blocks: parseBlocks(inner.join('\n')) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left') as 'left' | 'center' | 'right');
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push({ t: 'table', head, align, rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      const { block, next } = parseList(lines, i);
      out.push(block);
      i = next;
      continue;
    }
    // A paragraph: lines until a blank line or another kind of block. Single line breaks are kept.
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !LIST_RE.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ t: 'p', text: para.join('\n') });
  }
  return out;
}

function parseList(lines: string[], from: number): { block: Block; next: number } {
  const first = LIST_RE.exec(lines[from])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const block: Extract<Block, { t: 'list' }> = { t: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items: [] };
  let i = from;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
      let text = m[3];
      const task = /^\[([ xX])\]\s+/.exec(text);
      if (task) text = text.slice(task[0].length);
      const item = { text, task: !!task, done: !!task && task[1] !== ' ', children: [] as Block[] };
      i++;
      // Lines that belong to this item: more indented ones (a nested list or a continued line).
      const inner: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          const nextLine = lines[i + 1];
          if (nextLine && /^\s+/.test(nextLine) && (nextLine.match(/^\s*/)![0].length > indent)) {
            inner.push('');
            i++;
            continue;
          }
          break;
        }
        const lead = l.match(/^\s*/)![0].length;
        if (lead > indent) {
          inner.push(l.slice(Math.min(lead, indent + 2)));
          i++;
        } else if (inner.length === 0 && !LIST_RE.test(l) && !/^\s*(```|~~~|#{1,6}\s|>|\|)/.test(l)) {
          // A line that simply continues the item's text.
          item.text += '\n' + l.trim();
          i++;
        } else break;
      }
      if (inner.length) {
        const nested = parseBlocks(inner.join('\n'));
        // A continued line joins the item's own text instead of becoming a separate paragraph.
        if (nested[0]?.t === 'p' && !LIST_RE.test(inner[0])) {
          item.text += '\n' + (nested.shift() as { text: string }).text;
        }
        item.children = nested;
      }
      block.items.push(item);
      continue;
    }
    break;
  }
  return { block, next: i };
}


export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b' | 'i' | 'bi' | 's'; kids: Inline[] }
  | { t: 'link'; href: string; kids: Inline[] }
  | { t: 'cite'; n: number };

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|(?<![*\w])\*(?!\s)([^*\n]+?)\*(?![*\w])|(?<![_\w])_(?!\s)([^_\n]+?)_(?![_\w])|!?\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]|【(\d{1,3})(?:†[^】]*)?】|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]])|<br\s*\/?>/g;

export function parseInline(src: string, cites: number): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    const at = m.index!;
    if (at > last) out.push({ t: 'text', v: src.slice(last, at) });
    last = at + m[0].length;
    if (m[1]) out.push({ t: 'code', v: m[2].replace(/^ (.*) $/, '$1') });
    else if (m[3]) out.push({ t: 'bi', kids: parseInline(m[3], cites) });
    else if (m[4] || m[5]) out.push({ t: 'b', kids: parseInline(m[4] ?? m[5], cites) });
    else if (m[6]) out.push({ t: 's', kids: parseInline(m[6], cites) });
    else if (m[7] || m[8]) out.push({ t: 'i', kids: parseInline(m[7] ?? m[8], cites) });
    else if (m[10]) out.push({ t: 'link', href: m[10], kids: m[9] ? parseInline(m[9], cites) : [{ t: 'text', v: m[10] }] });
    else if (m[11] || m[12]) {
      // [1], [2, 3], [1-3] and 【1†source】 are sources when the reply has that many; otherwise plain text.
      const nums: number[] = [];
      for (const part of (m[11] ?? m[12]).split(/\s*,\s*/)) {
        const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
        if (range) for (let k = +range[1]; k <= +range[2] && k - +range[1] < 10; k++) nums.push(k);
        else nums.push(+part);
      }
      if (cites && nums.every((n) => n >= 1 && n <= cites)) nums.forEach((n) => out.push({ t: 'cite', n }));
      else out.push({ t: 'text', v: m[0] });
    } else if (m[13]) out.push({ t: 'link', href: m[13], kids: [{ t: 'text', v: m[13].replace(/^https?:\/\/(www\.)?/, '') }] });
    else out.push({ t: 'text', v: '\n' });
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}
