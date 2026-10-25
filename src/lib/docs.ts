import { unzipSync } from 'fflate';

import { extractPdf, PdfError } from './pdf';

export type ReadResult = { text: string; meta: string };

const dec = new TextDecoder('utf-8');
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return entities[e.toLowerCase()] ?? '';
  });
const files = (zip: Record<string, Uint8Array>) => Object.keys(zip);
const numericSort = (a: string, b: string) => parseInt(a.match(/(\d+)\.xml$/)?.[1] ?? '0', 10) - parseInt(b.match(/(\d+)\.xml$/)?.[1] ?? '0', 10);

/** Word: paragraphs, tabs and line breaks from word/document.xml (plus headers/footnotes are skipped). */
function readDocx(zip: Record<string, Uint8Array>): string {
  const xml = zip['word/document.xml'];
  if (!xml) throw new Error('This does not look like a Word document.');
  return unescapeXml(
    dec
      .decode(xml)
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** PowerPoint: the text of each slide, in slide order. */
function readPptx(zip: Record<string, Uint8Array>): { text: string; count: number } {
  const slides = files(zip).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort(numericSort);
  if (!slides.length) throw new Error('This does not look like a PowerPoint file.');
  const out = slides.map((f, i) => {
    const t = unescapeXml(dec.decode(zip[f]).replace(/<\/a:p>/g, '\n').replace(/<a:br\s*\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{2,}/g, '\n').trim();
    return `[Slide ${i + 1}]\n${t}`;
  });
  return { text: out.join('\n\n'), count: slides.length };
}

/** Excel: every worksheet as tab-separated rows (text and numbers; formulas show their last value). */
function readXlsx(zip: Record<string, Uint8Array>): { text: string; count: number } {
  const sheets = files(zip).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort(numericSort);
  if (!sheets.length) throw new Error('This does not look like an Excel file.');
  const shared: string[] = [];
  if (zip['xl/sharedStrings.xml']) {
    for (const si of dec.decode(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(unescapeXml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
    }
  }
  const names = zip['xl/workbook.xml'] ? [...dec.decode(zip['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => unescapeXml(m[1])) : [];
  const col = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const out = sheets.map((f, i) => {
    const rows: string[] = [];
    for (const row of dec.decode(zip[f]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const type = attrs.match(/t="(\w+)"/)?.[1];
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const inline = c[2]?.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        const value = type === 's' && v !== undefined ? shared[parseInt(v, 10)] ?? '' : inline !== undefined ? unescapeXml(inline) : v !== undefined ? unescapeXml(v) : '';
        if (ref) cells[col(ref)] = value;
      }
      if (cells.some((x) => x)) rows.push(Array.from(cells, (x) => x ?? '').join('\t'));
    }
    return `[Sheet: ${names[i] ?? i + 1}]\n${rows.join('\n')}`;
  });
  return { text: out.join('\n\n'), count: sheets.length };
}

const kb = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n));

export const DOC_EXT = /\.(pdf|docx|pptx|xlsx)$/i;

/**
 * Turn a PDF, Word, PowerPoint or Excel file into plain text. Throws an Error with a message fit to show the user
 * (for example for a password-protected or scanned PDF).
 */
export function readDocument(bytes: Uint8Array, name: string): ReadResult {
  const ext = name.toLowerCase().match(/\.(\w+)$/)?.[1];

  if (ext === 'pdf') {
    const r = extractPdf(bytes);
    const body = r.text.replace(/\[Page \d+\]/g, '').trim();
    if (!body) throw new Error(`No selectable text in ${r.pages} page${r.pages === 1 ? '' : 's'}. This looks like a scan, and reading scans needs OCR, which isn’t built yet. Try a PDF with real text.`);
    const note = r.unreadable > 0 ? ` · ${r.unreadable} characters couldn’t be decoded` : '';
    return { text: r.text, meta: `${r.pages} page${r.pages === 1 ? '' : 's'} · ${kb(r.text.length)} chars${note}` };
  }

  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error(`Couldn’t open ${name}. The file may be damaged or password-protected.`);
  }
  if (ext === 'docx') {
    const text = readDocx(zip);
    if (!text) throw new Error('This Word document has no text.');
    return { text, meta: `${kb(text.length)} chars` };
  }
  if (ext === 'pptx') {
    const r = readPptx(zip);
    return { text: r.text, meta: `${r.count} slide${r.count === 1 ? '' : 's'} · ${kb(r.text.length)} chars` };
  }
  if (ext === 'xlsx') {
    const r = readXlsx(zip);
    return { text: r.text, meta: `${r.count} sheet${r.count === 1 ? '' : 's'} · ${kb(r.text.length)} chars` };
  }
  throw new Error(`Can’t read .${ext ?? 'unknown'} files yet.`);
}

export { PdfError };
