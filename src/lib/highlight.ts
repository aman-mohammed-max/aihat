/**
 * Code colouring for replies, with Prism (pure JavaScript, so it works on phones, in Expo Go and on computers).
 * The languages load once, in the order Prism needs (a language after the ones it builds on).
 */
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-zig';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-regex';

/** What people write after ``` → Prism's name for it. */
const ALIAS: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', mts: 'typescript',
  py: 'python', python3: 'python', py3: 'python',
  golang: 'go', rs: 'rust', kt: 'kotlin', kts: 'kotlin',
  'c++': 'cpp', cc: 'cpp', hpp: 'cpp', h: 'c', cs: 'csharp', 'c#': 'csharp', objc: 'objectivec',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', ps1: 'powershell', pwsh: 'powershell',
  yml: 'yaml', html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
  rb: 'ruby', dockerfile: 'docker', md: 'markdown', patch: 'diff', ex: 'elixir', exs: 'elixir', jsonc: 'json', json5: 'json',
};

/** The language's display name for the code block's header. */
const LABEL: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX', python: 'Python', go: 'Go', rust: 'Rust', bash: 'Shell', markup: 'HTML', csharp: 'C#', cpp: 'C++', objectivec: 'Objective-C', powershell: 'PowerShell', yaml: 'YAML', json: 'JSON', sql: 'SQL', css: 'CSS', php: 'PHP', toml: 'TOML', graphql: 'GraphQL' };

export type Segment = { text: string; type?: string };

export function languageOf(info: string) {
  const raw = info.trim().split(/[\s{]/)[0].toLowerCase();
  const name = ALIAS[raw] ?? raw;
  return { name: Prism.languages[name] ? name : null, label: LABEL[name] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '') };
}

/** Code split into coloured pieces. Unknown languages come back as one plain piece. */
export function highlight(code: string, language: string | null): Segment[] {
  const grammar = language ? Prism.languages[language] : null;
  if (!grammar || code.length > 60_000) return [{ text: code }];
  const out: Segment[] = [];
  const walk = (tokens: (string | Prism.Token)[], parent?: string) => {
    for (const t of tokens) {
      if (typeof t === 'string') out.push({ text: t, type: parent });
      else {
        const type = [t.type, ...(Array.isArray(t.alias) ? t.alias : t.alias ? [t.alias] : [])].find((k) => COLOR_KEYS.has(k)) ?? parent;
        if (typeof t.content === 'string') out.push({ text: t.content, type });
        else walk(Array.isArray(t.content) ? t.content : [t.content], type);
      }
    }
  };
  try {
    walk(Prism.tokenize(code, grammar));
  } catch {
    return [{ text: code }];
  }
  return out;
}

/** Token kinds that get a colour (the rest use the code's normal colour). */
const COLOR_KEYS = new Set(['comment', 'prolog', 'doctype', 'cdata', 'string', 'template-string', 'char', 'regex', 'url', 'number', 'boolean', 'constant', 'keyword', 'important', 'atrule', 'builtin', 'function', 'class-name', 'tag', 'attr-name', 'attr-value', 'property', 'selector', 'operator', 'punctuation', 'variable', 'symbol', 'inserted', 'deleted', 'namespace', 'annotation', 'decorator', 'macro', 'title', 'parameter']);

/** Colours for each kind, in the app's palette (lilac keywords, green strings, sky functions, peach numbers). */
export function codeColors(dark: boolean): Record<string, string> {
  const d = dark;
  const keyword = d ? '#C4B5FD' : '#6D28D9';
  const string = d ? '#B9E87C' : '#3F7A12';
  const fn = d ? '#7DD3FC' : '#0369A1';
  const num = d ? '#FDBA74' : '#B45309';
  const type = d ? '#F9A8D4' : '#BE185D';
  const comment = d ? '#6F747C' : '#9A9FA7';
  const punct = d ? '#9BA0A8' : '#5E636B';
  return {
    comment, prolog: comment, doctype: comment, cdata: comment,
    string, 'template-string': string, char: string, regex: d ? '#FCA5A5' : '#B91C1C', url: string, 'attr-value': string, inserted: string,
    number: num, boolean: num, constant: num, symbol: num, important: num,
    keyword, atrule: keyword, selector: keyword, macro: keyword, deleted: d ? '#FCA5A5' : '#B91C1C',
    builtin: fn, function: fn, title: fn,
    'class-name': type, tag: type, namespace: type, annotation: type, decorator: type,
    'attr-name': num, property: d ? '#ECEDEF' : '#17181A', variable: d ? '#ECEDEF' : '#17181A', parameter: d ? '#E5E7EB' : '#27272A',
    operator: punct, punctuation: punct,
  };
}
