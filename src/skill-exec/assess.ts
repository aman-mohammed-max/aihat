/**
 * How well a skill can run here: everything (its scripts only use what is bundled), partly (some steps need programs
 * or packages this device doesn't have), or it is instructions only (nothing to run, works everywhere).
 * A quick look at the skill's text and scripts, not a guarantee: the model may still find a way, or hit a wall.
 */
import { SCRIPT_FILE } from '@/lib/skills';

export type Fit = 'full' | 'partly' | 'text';
export type Assessment = { fit: Fit; reasons: string[] };

const STDLIB = new Set('abc antigravity argparse array ast asyncio atexit base64 bdb binascii bisect builtins bz2 cProfile calendar cmath cmd code codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars copy copyreg csv ctypes curses dataclasses datetime dbm decimal difflib dis doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib importlib inspect io ipaddress itertools json keyword linecache locale logging lzma mailbox marshal math mimetypes mmap modulefinder msvcrt multiprocessing netrc nt ntpath nturl2path numbers opcode operator optparse os pathlib pdb pickle pickletools pkgutil platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtplib socket socketserver sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess symtable sys sysconfig syslog tabnanny tarfile tempfile termios textwrap this threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types typing unicodedata unittest urllib uuid venv warnings wave weakref webbrowser winreg winsound wsgiref xml xmlrpc zipapp zipfile zipimport zlib zoneinfo'.split(' '));
/** Import names of the Python packages in the phone's add-on. */
const BUNDLED_PY = new Set(['docx', 'pptx', 'openpyxl', 'xlsxwriter', 'pypdf', 'pdfminer', 'pdfplumber', 'defusedxml', 'et_xmlfile', 'numpy', 'pandas', 'lxml', 'PIL', 'cryptography', 'charset_normalizer', 'typing_extensions', 'dateutil', 'pytz', 'six', 'cffi', 'pycparser', 'js', 'pyodide', 'micropip']);
const NODE_OK = new Set(['fs', 'fs/promises', 'path', 'os', 'buffer', 'util', 'url', 'process', 'pptxgenjs', 'docx', 'pdf-lib']);

/** Programs and services a phone can't run, as people would name them. */
const BLOCKERS: [RegExp, string][] = [
  [/\b(soffice|libreoffice)\b/i, 'LibreOffice (PDF conversion, formula recalculation)'],
  [/\bpandoc\b/i, 'pandoc'],
  [/\bff(mpeg|probe)\b/i, 'ffmpeg (audio and video)'],
  [/\b(playwright|puppeteer|chromium|selenium|headless (chrome|browser))\b/i, 'a web browser'],
  [/\b(pdftoppm|pdftotext|poppler|pdf2image)\b/i, 'Poppler (PDF to images)'],
  [/\btesseract\b/i, 'tesseract (reading text in pictures)'],
  [/\b(imagemagick|magick)\b/i, 'ImageMagick'],
  [/\bgit (clone|commit|push|pull)\b/i, 'git'],
  [/\b(npm (install|i|run)|npx|yarn add|pnpm add)\b/i, 'installing Node packages'],
  [/\bpip3? install\b(?![^\n]*(python-docx|python-pptx|openpyxl|pypdf|pdfplumber|pandas|numpy|lxml|pillow))/i, 'installing other Python packages'],
  [/\b(docker|apt-get|brew install|sudo)\b/i, 'system tools'],
  [/require\(['"]sharp['"]\)|from ['"]sharp['"]/i, 'the sharp image library'],
];

function pythonImports(src: string) {
  const out = new Set<string>();
  for (const m of src.matchAll(/^[ \t]*(?:from[ \t]+([A-Za-z_]\w*)|import[ \t]+([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*))/gm)) {
    if (m[1]) out.add(m[1]);
    else m[2].split(',').forEach((x) => out.add(x.trim()));
  }
  return out;
}

function nodeRequires(src: string) {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"])/g)) {
    const n = (m[1] ?? m[2]).replace(/^node:/, '');
    if (!n.startsWith('.') && !n.startsWith('/')) out.add(n.split('/')[0].startsWith('@') ? n.split('/').slice(0, 2).join('/') : n === 'fs/promises' ? n : n.split('/')[0]);
  }
  return out;
}

/**
 * phone: the downloaded sandbox (bundled packages only, no other programs, no internet).
 * computer: the computer's own Python and Node; only what can't be known is mentioned.
 */
export function assessSkill(body: string, files: { path: string; text: string }[], where: 'phone' | 'computer'): Assessment {
  const scripts = files.filter((f) => SCRIPT_FILE.test(f.path));
  const mentionsRun = /\b(python3?|node)\s+[\w./-]+\.(py|js|mjs|cjs)\b|\bpython3? -c\b/.test(body);
  if (!scripts.length && !mentionsRun) return { fit: 'text', reasons: [] };
  if (where === 'computer') return { fit: 'full', reasons: [] };
  const all = [body, ...files.map((f) => f.text)].join('\n');
  const reasons = new Set<string>();
  for (const [re, what] of BLOCKERS) if (re.test(all)) reasons.add(`needs ${what}`);
  const ownModules = new Set(files.filter((f) => f.path.endsWith('.py')).map((f) => f.path.split('/').pop()!.replace(/\.py$/, '')));
  const missingPy = new Set<string>();
  const missingJs = new Set<string>();
  for (const f of scripts) {
    if (f.path.endsWith('.py')) for (const n of pythonImports(f.text)) if (!STDLIB.has(n) && !BUNDLED_PY.has(n) && !ownModules.has(n)) missingPy.add(n);
    if (/\.(js|mjs|cjs)$/.test(f.path)) for (const n of nodeRequires(f.text)) if (!NODE_OK.has(n)) missingJs.add(n);
  }
  if (missingPy.size) reasons.add(`uses Python packages that aren’t in the add-on: ${[...missingPy].slice(0, 4).join(', ')}`);
  if (missingJs.size) reasons.add(`uses Node packages that aren’t in the add-on: ${[...missingJs].slice(0, 4).join(', ')}`);
  if (/\b(requests|httpx|urllib\.request|aiohttp|fetch\()\b/.test(all) && !reasons.size) reasons.add('may need the internet, which scripts don’t have here');
  return { fit: reasons.size ? 'partly' : 'full', reasons: [...reasons] };
}
