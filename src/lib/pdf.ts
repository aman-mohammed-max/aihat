import { inflateSync, unzlibSync, zlibSync } from 'fflate';

/**
 * Minimal PDF text extractor in plain JavaScript (no native code).
 *
 * It scans the file for objects (including those packed in compressed object streams), walks the page tree,
 * decompresses each page's content stream and reads the text-showing operators, mapping character codes to
 * Unicode through each font's ToUnicode map or simple encoding. It handles normal text PDFs. It cannot read
 * password-protected files or fonts that carry no text map. For a scanned page (no text layer) it returns the page's
 * picture instead (see pageImage), for a model that can see images to read.
 */

type Name = { name: string };
type Ref = { ref: number };
type Str = { bytes: Uint8Array };
type Op = { op: string };
type Dict = Record<string, any>;
type Stream = { dict: Dict; start: number; end: number };

export class PdfError extends Error {
  constructor(public code: 'encrypted' | 'invalid', message: string) {
    super(message);
  }
}

const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
const isDigit = (c: number) => c >= 48 && c <= 57;
const isNum = (c: number) => isDigit(c) || c === 43 || c === 45 || c === 46;
const latin1 = (b: Uint8Array, s = 0, e = b.length) => {
  let out = '';
  for (let i = s; i < e; i += 8192) out += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + 8192, e)) as unknown as number[]);
  return out;
};
const hexVal = (c: number) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);
const isName = (v: any): v is Name => !!v && typeof v === 'object' && 'name' in v;
const isRef = (v: any): v is Ref => !!v && typeof v === 'object' && 'ref' in v;
const isStr = (v: any): v is Str => !!v && typeof v === 'object' && 'bytes' in v;
const isOp = (v: any): v is Op => !!v && typeof v === 'object' && 'op' in v;
const isStream = (v: any): v is Stream => !!v && typeof v === 'object' && 'dict' in v && 'start' in v;

// ---------- object parser ----------

function skipWs(b: Uint8Array, p: number) {
  while (p < b.length) {
    const c = b[p];
    if (isWhite(c)) p++;
    else if (c === 37) while (p < b.length && b[p] !== 10 && b[p] !== 13) p++; // % comment
    else break;
  }
  return p;
}

/** Parse one PDF object (or, in content streams, one operator) starting at `p`. */
function parseObject(b: Uint8Array, p: number): [any, number] {
  p = skipWs(b, p);
  if (p >= b.length) return [undefined, p];
  const c = b[p];

  if (c === 47) { // /Name
    let q = p + 1;
    let s = '';
    while (q < b.length && !isWhite(b[q]) && !isDelim(b[q])) {
      if (b[q] === 35 && hexVal(b[q + 1]) >= 0 && hexVal(b[q + 2]) >= 0) {
        s += String.fromCharCode(hexVal(b[q + 1]) * 16 + hexVal(b[q + 2]));
        q += 3;
      } else s += String.fromCharCode(b[q++]);
    }
    return [{ name: s } as Name, q];
  }

  if (c === 40) { // (literal string)
    let q = p + 1, depth = 1;
    const out: number[] = [];
    while (q < b.length && depth > 0) {
      let ch = b[q++];
      if (ch === 92) { // backslash
        const n = b[q++];
        if (n === 110) ch = 10; else if (n === 114) ch = 13; else if (n === 116) ch = 9; else if (n === 98) ch = 8; else if (n === 102) ch = 12;
        else if (n >= 48 && n <= 55) {
          let v = n - 48;
          for (let k = 0; k < 2 && b[q] >= 48 && b[q] <= 55; k++) v = v * 8 + (b[q++] - 48);
          ch = v & 255;
        } else if (n === 13) { if (b[q] === 10) q++; continue; } else if (n === 10) continue;
        else ch = n;
        out.push(ch);
      } else if (ch === 40) { depth++; out.push(ch); }
      else if (ch === 41) { depth--; if (depth > 0) out.push(ch); }
      else out.push(ch);
    }
    return [{ bytes: Uint8Array.from(out) } as Str, q];
  }

  if (c === 60 && b[p + 1] === 60) { // << dict >>
    const d: Dict = Object.create(null);
    let q = p + 2;
    for (;;) {
      q = skipWs(b, q);
      if (q >= b.length || (b[q] === 62 && b[q + 1] === 62)) { q += 2; break; }
      const [k, q2] = parseObject(b, q);
      if (!isName(k)) { q = q2 > q ? q2 : q + 1; continue; }
      const [v, q3] = parseObject(b, q2);
      d[k.name] = v;
      q = q3;
    }
    return [d, q];
  }

  if (c === 60) { // <hex string>
    const out: number[] = [];
    let q = p + 1, hi = -1;
    while (q < b.length && b[q] !== 62) {
      const v = hexVal(b[q++]);
      if (v < 0) continue;
      if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
    }
    if (hi >= 0) out.push(hi * 16);
    return [{ bytes: Uint8Array.from(out) } as Str, q + 1];
  }

  if (c === 91) { // [ array ]
    const arr: any[] = [];
    let q = p + 1;
    for (;;) {
      q = skipWs(b, q);
      if (q >= b.length || b[q] === 93) { q++; break; }
      const [v, q2] = parseObject(b, q);
      if (v === undefined || q2 <= q) { q++; continue; }
      arr.push(v);
      q = q2;
    }
    return [arr, q];
  }

  if (isNum(c)) {
    let q = p;
    while (q < b.length && isNum(b[q])) q++;
    const n = parseFloat(latin1(b, p, q));
    // indirect reference: "12 0 R"
    if (Number.isInteger(n) && n >= 0 && isDigit(c)) {
      let r = skipWs(b, q);
      if (isDigit(b[r])) {
        let r2 = r;
        while (isDigit(b[r2])) r2++;
        const r3 = skipWs(b, r2);
        if (b[r3] === 82 && (r3 + 1 >= b.length || isWhite(b[r3 + 1]) || isDelim(b[r3 + 1]))) return [{ ref: n } as Ref, r3 + 1];
      }
    }
    return [Number.isNaN(n) ? 0 : n, q];
  }

  // keyword / operator
  let q = p;
  while (q < b.length && !isWhite(b[q]) && !isDelim(b[q])) q++;
  if (q === p) return [undefined, p + 1];
  const w = latin1(b, p, q);
  if (w === 'true') return [true, q];
  if (w === 'false') return [false, q];
  if (w === 'null') return [null, q];
  return [{ op: w } as Op, q];
}

// ---------- document ----------

class Doc {
  objs = new Map<number, any>();
  trailers: Dict[] = [];
  constructor(public buf: Uint8Array) {}

  resolve(v: any): any {
    for (let i = 0; i < 20 && isRef(v); i++) v = this.objs.get(v.ref);
    return v;
  }
  dict(v: any): Dict | undefined {
    const r = this.resolve(v);
    return isStream(r) ? r.dict : r && typeof r === 'object' && !Array.isArray(r) && !isName(r) && !isStr(r) ? (r as Dict) : undefined;
  }
  arr(v: any): any[] {
    const r = this.resolve(v);
    return Array.isArray(r) ? r : [];
  }

  /** Find "N G obj" markers in order, parsing each object and skipping stream bodies (later definitions win). */
  scan() {
    const b = this.buf;
    const n = b.length;
    for (let i = 0; i < n - 3; i++) {
      // trailer dictionaries (classic files)
      if (b[i] === 116 && b[i + 1] === 114 && b[i + 2] === 97 && b[i + 3] === 105 && b[i + 4] === 108 && b[i + 5] === 101 && b[i + 6] === 114) {
        const [d] = parseObject(b, i + 7);
        if (d && typeof d === 'object' && !Array.isArray(d) && !isOp(d)) this.trailers.push(d);
        i += 6;
        continue;
      }
      if (!(b[i] === 111 && b[i + 1] === 98 && b[i + 2] === 106) || b[i - 1] === 100) continue; // "obj", not "endobj"
      // walk back over "<num> <gen> "
      let q = i - 1;
      while (q >= 0 && isWhite(b[q])) q--;
      let ge = q + 1;
      while (q >= 0 && isDigit(b[q])) q--;
      if (q + 1 === ge) continue;
      while (q >= 0 && isWhite(b[q])) q--;
      const ne = q + 1;
      while (q >= 0 && isDigit(b[q])) q--;
      if (q + 1 === ne) continue;
      const num = parseInt(latin1(b, q + 1, ne), 10);

      let [value, p] = parseObject(b, i + 3);
      const after = skipWs(b, p);
      if (latin1(b, after, after + 6) === 'stream' && value && typeof value === 'object' && !Array.isArray(value) && !isOp(value)) {
        let s = after + 6;
        if (b[s] === 13) s++;
        if (b[s] === 10) s++;
        const e = this.streamEnd(value as Dict, s);
        value = { dict: value as Dict, start: s, end: e } as Stream;
        p = e;
        const dict = (value as Stream).dict;
        if (isName(dict.Type) && dict.Type.name === 'XRef') this.trailers.push(dict);
        this.objs.set(num, value);
        if (isName(dict.Type) && dict.Type.name === 'ObjStm') this.readObjStm(value as Stream);
      } else {
        this.objs.set(num, value);
      }
      i = Math.max(i + 2, p - 1);
    }
  }

  private streamEnd(dict: Dict, s: number) {
    const b = this.buf;
    const len = dict.Length;
    if (typeof len === 'number' && len >= 0 && s + len <= b.length) {
      const k = skipWs(b, s + len);
      if (latin1(b, k, k + 9) === 'endstream') return s + len;
    }
    // search for "endstream"
    for (let k = s; k < b.length - 8; k++) {
      if (b[k] === 101 && latin1(b, k, k + 9) === 'endstream') {
        let e = k;
        if (b[e - 1] === 10) e--;
        if (b[e - 1] === 13) e--;
        return e;
      }
    }
    return b.length;
  }

  private readObjStm(st: Stream) {
    const data = this.decode(st);
    const n = this.resolve(st.dict.N);
    const first = this.resolve(st.dict.First);
    if (!data || typeof n !== 'number' || typeof first !== 'number') return;
    let p = 0;
    const entries: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const [a, p1] = parseObject(data, p);
      const [o, p2] = parseObject(data, p1);
      if (typeof a !== 'number' || typeof o !== 'number') break;
      entries.push([a, o]);
      p = p2;
    }
    for (const [num, off] of entries) {
      const [v] = parseObject(data, first + off);
      if (v !== undefined) this.objs.set(num, v);
    }
  }

  /** Decompress a stream. Returns null for filters that can't be decoded. */
  decode(st: Stream): Uint8Array | null {
    let data = this.buf.subarray(st.start, st.end);
    const f = this.resolve(st.dict.Filter);
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => (isName(this.resolve(x)) ? (this.resolve(x) as Name).name : ''));
    for (const name of filters) {
      if (name === 'FlateDecode' || name === 'Fl') {
        try {
          data = unzlibSync(data);
        } catch {
          try {
            data = inflateSync(data.subarray(2)); // tolerate a bad header / checksum
          } catch {
            return null;
          }
        }
      } else if (name === 'ASCIIHexDecode' || name === 'AHx') {
        data = asciiHex(data);
      } else if (name === 'ASCII85Decode' || name === 'A85') {
        data = ascii85(data);
      } else {
        return null; // images (DCT, JPX, CCITT…), LZW, crypt: not text we can read
      }
    }
    return data;
  }
}

function asciiHex(d: Uint8Array) {
  const out: number[] = [];
  let hi = -1;
  for (const c of d) {
    if (c === 62) break;
    const v = hexVal(c);
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
  }
  if (hi >= 0) out.push(hi * 16);
  return Uint8Array.from(out);
}

function ascii85(d: Uint8Array) {
  const out: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === 126) break; // ~>
    if (isWhite(c)) continue;
    if (c === 122 && group.length === 0) { out.push(0, 0, 0, 0); continue; }
    if (c < 33 || c > 117) continue;
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const k = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, k - 1));
  }
  return Uint8Array.from(out);
}

// ---------- fonts ----------

type Font = { bytes: 1 | 2; map?: Map<number, string>; table?: string[]; unreadable?: boolean };

const CP1252_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const winAnsi = () => Array.from({ length: 256 }, (_, i) => CP1252_HIGH[i] ?? (i < 32 ? '' : String.fromCharCode(i)));

const GLYPHS: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", quoteright: '’', quoteleft: '‘',
  parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '−', period: '.', slash: '/', colon: ':', semicolon: ';',
  less: '<', equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_',
  grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', bullet: '•', endash: '–', emdash: '—', ellipsis: '…', quotedblleft: '“',
  quotedblright: '”', quotesinglbase: '‚', quotedblbase: '„', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', Euro: '€', copyright: '©', registered: '®',
  trademark: '™', degree: '°', section: '§', paragraph: '¶', dagger: '†', daggerdbl: '‡', guillemotleft: '«', guillemotright: '»', multiply: '×', divide: '÷',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', nbspace: ' ', nonbreakingspace: ' ',
  Adieresis: 'Ä', adieresis: 'ä', Odieresis: 'Ö', odieresis: 'ö', Udieresis: 'Ü', udieresis: 'ü', germandbls: 'ß', eacute: 'é', egrave: 'è', aacute: 'á',
  agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedilla: 'ç', Eacute: 'É', acircumflex: 'â', ecircumflex: 'ê', ocircumflex: 'ô',
};

function glyphToUnicode(n: string): string {
  if (GLYPHS[n]) return GLYPHS[n];
  if (n.length === 1) return n;
  const m = n.match(/^uni([0-9A-Fa-f]{4})/) ?? n.match(/^u([0-9A-Fa-f]{4,6})$/);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return '';
}

function parseCMap(text: string) {
  const map = new Map<number, string>();
  let bytes: 1 | 2 = 2;
  const hexToStr = (h: string) => {
    let s = '';
    for (let i = 0; i + 3 < h.length + 1; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return h.length <= 2 ? String.fromCharCode(parseInt(h, 16)) : s;
  };
  const cs = text.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
  if (cs) {
    const first = cs[1].match(/<([0-9A-Fa-f]+)>/);
    if (first && first[1].length <= 2) bytes = 1;
  }
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(m[1], 16), hexToStr(m[2]));
  }
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]*>)/g)) {
      const lo = parseInt(m[1], 16), hi = Math.min(parseInt(m[2], 16), lo + 65535);
      if (m[3].startsWith('[')) {
        let c = lo;
        for (const d of m[3].matchAll(/<([0-9A-Fa-f]*)>/g)) map.set(c++, hexToStr(d[1]));
      } else {
        const base = hexToStr(m[3].slice(1, -1));
        for (let c = lo; c <= hi; c++) map.set(c, base.length ? base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)) : '');
      }
    }
  }
  return { map, bytes };
}

function buildFont(doc: Doc, fd: Dict | undefined): Font {
  if (!fd) return { bytes: 1, table: winAnsi() };
  const subtype = isName(doc.resolve(fd.Subtype)) ? (doc.resolve(fd.Subtype) as Name).name : '';
  const font: Font = { bytes: subtype === 'Type0' ? 2 : 1 };
  const tu = doc.resolve(fd.ToUnicode);
  if (isStream(tu)) {
    const data = doc.decode(tu);
    if (data) {
      const cm = parseCMap(latin1(data));
      if (cm.map.size) {
        font.map = cm.map;
        font.bytes = subtype === 'Type0' ? cm.bytes : 1;
      }
    }
  }
  if (subtype !== 'Type0') {
    const table = winAnsi();
    const enc = doc.resolve(fd.Encoding);
    const diffs = isName(enc) ? undefined : doc.arr(doc.dict(enc)?.Differences);
    if (diffs?.length) {
      let code = 0;
      for (const d of diffs) {
        const v = doc.resolve(d);
        if (typeof v === 'number') code = v;
        else if (isName(v)) table[code++] = glyphToUnicode(v.name);
      }
    }
    font.table = table;
  } else if (!font.map) {
    font.unreadable = true; // CID font with no text map: glyph ids only
  }
  return font;
}

function decodeText(font: Font, s: Uint8Array): { text: string; lost: number } {
  let out = '';
  let lost = 0;
  if (font.bytes === 2) {
    for (let i = 0; i + 1 < s.length; i += 2) {
      const code = (s[i] << 8) | s[i + 1];
      const t = font.map?.get(code);
      if (t !== undefined) out += t; else lost++;
    }
    return { text: out, lost };
  }
  for (const c of s) {
    const t = font.map?.get(c) ?? font.table?.[c] ?? String.fromCharCode(c);
    out += t;
  }
  return { text: out, lost };
}

// ---------- content streams ----------

type Ctx = { doc: Doc; fonts: Map<string, Font>; lost: number; depth: number; seen: Set<Stream> };

function pageText(ctx: Ctx, content: Uint8Array, resources: Dict | undefined): string {
  const { doc } = ctx;
  const fontRes = doc.dict(resources?.Font);
  const xobjs = doc.dict(resources?.XObject);
  const getFont = (name: string): Font => {
    const ref = fontRes?.[name];
    const key = isRef(ref) ? `r${ref.ref}` : `n${name}${fontRes ? '' : '?'}`;
    let f = ctx.fonts.get(key);
    if (!f) {
      f = buildFont(doc, doc.dict(ref));
      ctx.fonts.set(key, f);
    }
    return f;
  };

  const lines: string[] = [];
  let line = '';
  let font: Font = { bytes: 1, table: winAnsi() };
  let size = 12, leading = 0;
  let y = 0, lx = 0, ly = 0, lastY: number | null = null, moved = false;

  const flush = () => {
    if (line.trim()) lines.push(line.replace(/\s+$/, ''));
    line = '';
  };
  const show = (bytes: Uint8Array) => {
    const { text, lost } = decodeText(font, bytes);
    ctx.lost += lost;
    if (!text) return;
    if (lastY !== null && Math.abs(y - lastY) > Math.max(size, 1) * 0.3) {
      flush();
      if (Math.abs(y - lastY) > Math.max(size, 1) * 1.9) lines.push(''); // paragraph gap
    } else if (moved && line && !line.endsWith(' ') && !text.startsWith(' ')) line += ' ';
    line += text;
    lastY = y;
    moved = false;
  };

  let p = 0;
  const stack: any[] = [];
  const num = (v: any) => (typeof v === 'number' ? v : 0);
  while (p < content.length) {
    const [tok, q] = parseObject(content, p);
    if (q <= p) { p++; continue; }
    p = q;
    if (tok === undefined) continue;
    if (!isOp(tok)) { stack.push(tok); if (stack.length > 200) stack.shift(); continue; }
    const a = stack;
    switch (tok.op) {
      case 'BT': y = lx = ly = 0; break;
      case 'Tf': if (a.length >= 2 && isName(a[a.length - 2])) { font = getFont((a[a.length - 2] as Name).name); size = num(a[a.length - 1]) || size; } break;
      case 'TL': leading = num(a[a.length - 1]); break;
      case 'Td': case 'TD': {
        const tx = num(a[a.length - 2]), ty = num(a[a.length - 1]);
        if (tok.op === 'TD') leading = -ty;
        lx += tx; ly += ty; y = ly;
        if (tx !== 0) moved = true;
        break;
      }
      case 'Tm': {
        const nx = num(a[a.length - 2]), ny = num(a[a.length - 1]);
        if (nx !== lx) moved = true;
        lx = nx; ly = y = ny;
        break;
      }
      case 'T*': ly -= leading; y = ly; break;
      case 'Tj': { const s = a[a.length - 1]; if (isStr(s)) show(s.bytes); break; }
      case "'": { ly -= leading; y = ly; const s = a[a.length - 1]; if (isStr(s)) show(s.bytes); break; }
      case '"': { ly -= leading; y = ly; const s = a[a.length - 1]; if (isStr(s)) show(s.bytes); break; }
      case 'TJ': {
        const arr = a[a.length - 1];
        if (Array.isArray(arr)) {
          for (const el of arr) {
            if (isStr(el)) show(el.bytes);
            else if (typeof el === 'number' && el < -180 && line && !line.endsWith(' ')) line += ' '; // wide kerning gap = word space
          }
        }
        break;
      }
      case 'Do': {
        const n = a[a.length - 1];
        if (isName(n) && ctx.depth < 4) {
          const xo = doc.resolve(xobjs?.[n.name]);
          if (isStream(xo) && !ctx.seen.has(xo) && isName(doc.resolve(xo.dict.Subtype)) && (doc.resolve(xo.dict.Subtype) as Name).name === 'Form') {
            ctx.seen.add(xo);
            const data = doc.decode(xo);
            if (data) {
              ctx.depth++;
              const inner = pageText(ctx, data, doc.dict(xo.dict.Resources) ?? resources);
              ctx.depth--;
              if (inner) { flush(); lines.push(inner); lastY = null; }
            }
          }
        }
        break;
      }
      case 'BI': { // inline image: skip to "EI"
        let k = p;
        while (k < content.length - 2 && !(content[k] === 69 && content[k + 1] === 73 && isWhite(content[k - 1]) && (k + 2 >= content.length || isWhite(content[k + 2])))) k++;
        p = k + 2;
        break;
      }
      default: break;
    }
    stack.length = 0;
  }
  flush();
  return lines.join('\n');
}

// ---------- entry ----------

// ---------- page pictures (scans) ----------

export type PdfImage = { page: number; mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array };

const MAX_SCAN_PAGES = 20;
const MAX_SCAN_BYTES = 20 * 1024 * 1024;

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A PNG from rows that already start with a PNG filter byte (bit depth 1 or 8; gray or RGB). */
function png(width: number, height: number, depth: number, rgb: boolean, rows: Uint8Array): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = depth;
  ihdr[9] = rgb ? 2 : 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(rows)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) { out.set(x, at); at += x.length; }
  return out;
}

const filterNames = (doc: Doc, f: any) => (Array.isArray(doc.resolve(f)) ? doc.arr(f) : f ? [f] : []).map((x) => (isName(doc.resolve(x)) ? (doc.resolve(x) as Name).name : ''));

/**
 * One image XObject as a file a model can look at: JPEG data as it is, 8-bit gray / RGB and 1-bit gray (Flate
 * compressed) wrapped as PNG. Null for kinds that would need a real image decoder (CCITT fax, JBIG2, JPEG 2000,
 * indexed or CMYK colour).
 */
function imageFile(doc: Doc, st: Stream): Omit<PdfImage, 'page'> | null {
  const d = st.dict;
  const filters = filterNames(doc, d.Filter);
  if (filters.length === 1 && (filters[0] === 'DCTDecode' || filters[0] === 'DCT')) return { mime: 'image/jpeg', bytes: doc.buf.slice(st.start, st.end) };
  if (!(filters.length === 1 && (filters[0] === 'FlateDecode' || filters[0] === 'Fl'))) return null;

  const w = doc.resolve(d.Width), h = doc.resolve(d.Height);
  const mask = doc.resolve(d.ImageMask) === true;
  const bpc = mask ? 1 : doc.resolve(d.BitsPerComponent);
  let cs = doc.resolve(d.ColorSpace);
  if (Array.isArray(cs) && isName(doc.resolve(cs[0])) && doc.resolve(cs[0]).name === 'ICCBased') {
    const n = doc.dict(cs[1])?.N;
    cs = { name: n === 1 ? 'DeviceGray' : n === 3 ? 'DeviceRGB' : '' };
  }
  const space = mask ? 'DeviceGray' : isName(cs) ? cs.name : '';
  const colors = space === 'DeviceGray' || space === 'G' ? 1 : space === 'DeviceRGB' || space === 'RGB' ? 3 : 0;
  if (typeof w !== 'number' || typeof h !== 'number' || !colors || !(bpc === 8 || (bpc === 1 && colors === 1))) return null;

  const data = doc.decode(st);
  if (!data) return null;
  const rowBytes = Math.ceil((w * colors * bpc) / 8);
  const predictor = doc.dict(Array.isArray(doc.resolve(d.DecodeParms)) ? doc.arr(d.DecodeParms)[0] : d.DecodeParms)?.Predictor;
  let rows: Uint8Array;
  if (typeof predictor === 'number' && predictor >= 10) {
    if (data.length < (rowBytes + 1) * h) return null;
    rows = data.subarray(0, (rowBytes + 1) * h); // already one PNG filter byte per row
  } else {
    if (data.length < rowBytes * h) return null;
    rows = new Uint8Array((rowBytes + 1) * h);
    for (let y = 0; y < h; y++) rows.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  // In PDF and PNG alike 0 is black; a Decode array of [1 0] (or a stencil mask) flips that.
  const decode = doc.arr(d.Decode);
  if (bpc === 1 && (decode[0] === 1) !== mask) {
    if (predictor >= 10) return null; // flipping filtered rows would need unfiltering first
    for (let y = 0; y < h; y++) for (let x = 1; x <= rowBytes; x++) rows[y * (rowBytes + 1) + x] ^= 0xff;
  }
  return { mime: 'image/png', bytes: png(w, h, bpc, colors === 3, rows) };
}

/** The biggest picture on a page (looking one level into form XObjects), which on a scanned page is the scan. */
function pageImage(doc: Doc, resources: Dict | undefined, depth = 0): Stream | null {
  let best: Stream | null = null;
  let area = 0;
  const xobjects = doc.dict(resources?.XObject) ?? {};
  for (const key of Object.keys(xobjects)) {
    const st = doc.resolve(xobjects[key]);
    if (!isStream(st)) continue;
    const sub = isName(doc.resolve(st.dict.Subtype)) ? (doc.resolve(st.dict.Subtype) as Name).name : '';
    let cand: Stream | null = null;
    if (sub === 'Image') cand = st;
    else if (sub === 'Form' && depth < 1) cand = pageImage(doc, doc.dict(st.dict.Resources), depth + 1);
    if (!cand) continue;
    const a = (Number(doc.resolve(cand.dict.Width)) || 0) * (Number(doc.resolve(cand.dict.Height)) || 0);
    if (a > area) { best = cand; area = a; }
  }
  return best;
}

export type PdfResult = {
  text: string;
  pages: number;
  unreadable: number;
  /** Pictures of pages that have no text (scans), up to MAX_SCAN_PAGES pages and MAX_SCAN_BYTES in all. */
  images: PdfImage[];
  /** Pages with no text whose picture couldn't be used (an image kind we can't convert, or over the limits). */
  scansLeftOut: number;
};

/** Extract the text of every page. Throws PdfError for encrypted or non-PDF input. */
export function extractPdf(bytes: Uint8Array): PdfResult {
  if (latin1(bytes, 0, Math.min(1024, bytes.length)).indexOf('%PDF') < 0) throw new PdfError('invalid', 'This file is not a PDF.');
  const doc = new Doc(bytes);
  doc.scan();
  if (doc.trailers.some((t) => t.Encrypt !== undefined)) throw new PdfError('encrypted', 'This PDF is password-protected. Remove the password and try again.');

  // page list: follow Catalog → Pages → Kids, falling back to every /Type /Page object
  const pages: { dict: Dict; resources?: Dict }[] = [];
  const visit = (node: any, inherited: Dict | undefined, depth: number) => {
    const d = doc.dict(node);
    if (!d || depth > 40) return;
    const res = doc.dict(d.Resources) ?? inherited;
    const type = isName(doc.resolve(d.Type)) ? (doc.resolve(d.Type) as Name).name : '';
    if (type === 'Pages' || (d.Kids !== undefined && type !== 'Page')) for (const k of doc.arr(d.Kids)) visit(k, res, depth + 1);
    else pages.push({ dict: d, resources: res });
  };
  const root = [...doc.trailers].reverse().find((t) => t.Root !== undefined)?.Root;
  const cat = doc.dict(root);
  if (cat?.Pages) visit(cat.Pages, undefined, 0);
  if (!pages.length) {
    for (const v of doc.objs.values()) {
      const d = isStream(v) ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : undefined;
      if (d && isName(d.Type) && d.Type.name === 'Page') pages.push({ dict: d, resources: doc.dict(d.Resources) });
    }
  }
  if (!pages.length) throw new PdfError('invalid', 'No pages found. The file may be damaged.');

  const ctx: Ctx = { doc, fonts: new Map(), lost: 0, depth: 0, seen: new Set() };
  const out: string[] = [];
  const images: PdfImage[] = [];
  let imageBytes = 0;
  let scansLeftOut = 0;
  pages.forEach((pg, i) => {
    const parts = Array.isArray(doc.resolve(pg.dict.Contents)) ? doc.arr(pg.dict.Contents) : [pg.dict.Contents];
    const chunks: Uint8Array[] = [];
    for (const c of parts) {
      const st = doc.resolve(c);
      const data = isStream(st) ? doc.decode(st) : null;
      if (data) chunks.push(data);
    }
    const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length + 1, 0));
    let at = 0;
    for (const c of chunks) { joined.set(c, at); at += c.length; joined[at++] = 10; }
    ctx.seen = new Set();
    const text = pageText(ctx, joined, pg.resources).trim();
    out.push(text ? `[Page ${i + 1}]\n${text}` : `[Page ${i + 1}]`);
    if (!text) {
      const st = pageImage(doc, pg.resources);
      const file = st && images.length < MAX_SCAN_PAGES ? imageFile(doc, st) : null;
      if (file && imageBytes + file.bytes.length <= MAX_SCAN_BYTES) {
        images.push({ page: i + 1, ...file });
        imageBytes += file.bytes.length;
      } else if (st) scansLeftOut++;
    }
  });
  const text = out.join('\n\n');
  return { text, pages: pages.length, unreadable: ctx.lost, images, scansLeftOut };
}
