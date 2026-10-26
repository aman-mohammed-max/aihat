/*
 * AI Hat skill engine: a small shell, Python (Pyodide) and a Node-style runner over one virtual file system.
 *
 * Plain JavaScript on purpose: the same file runs inside a Web Worker on phones (embedded into the runner page by
 * scripts/embed-skill-engine.mjs) and in Node for tests (scripts/test-skill-engine.mjs).
 *
 * Layout: /skills/<name> holds a skill's files, /work is the working folder (inputs in, outputs out).
 */

/* eslint-disable */
// prettier-ignore
function createSkillEngine(opts) {
  'use strict';
  var py = opts.pyodide;
  var FS = py.FS;
  var MAX_OUT = 64 * 1024;
  var MAX_FILE = 20 * 1024 * 1024;
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  // Import names → Pyodide packages that bundled pure-Python wheels need, loaded before a script runs.
  var NEEDS = opts.needs || {};
  var BUNDLED = opts.bundled || [];
  var pythonReady = null;
  var jsLibs = {};

  // ---------- paths and the file system ----------

  function norm(p) {
    var parts = [];
    p.split('/').forEach(function (s) {
      if (!s || s === '.') return;
      if (s === '..') parts.pop();
      else parts.push(s);
    });
    return '/' + parts.join('/');
  }
  function abs(cwd, p) {
    if (!p) return cwd;
    if (p === '~' || p.indexOf('~/') === 0) p = '/work' + p.slice(1);
    return norm(p.charAt(0) === '/' ? p : cwd + '/' + p);
  }
  function stat(p) {
    try {
      return FS.stat(p);
    } catch (e) {
      return null;
    }
  }
  function isDir(p) {
    var s = stat(p);
    return !!s && FS.isDir(s.mode);
  }
  function isFile(p) {
    var s = stat(p);
    return !!s && FS.isFile(s.mode);
  }
  function mkdirp(p) {
    var cur = '';
    norm(p).split('/').slice(1).forEach(function (s) {
      cur += '/' + s;
      if (!stat(cur)) FS.mkdir(cur);
    });
  }
  function rmrf(p) {
    if (!stat(p)) return;
    if (isDir(p)) {
      FS.readdir(p).forEach(function (n) {
        if (n !== '.' && n !== '..') rmrf(p + '/' + n);
      });
      FS.rmdir(p);
    } else FS.unlink(p);
  }
  function walk(dir, out) {
    out = out || [];
    if (!isDir(dir)) return out;
    FS.readdir(dir).forEach(function (n) {
      if (n === '.' || n === '..') return;
      var p = dir + '/' + n;
      if (isDir(p)) walk(p, out);
      else out.push(p);
    });
    return out;
  }
  function writeFile(p, data) {
    mkdirp(p.slice(0, p.lastIndexOf('/')) || '/');
    FS.writeFile(p, typeof data === 'string' ? enc.encode(data) : data);
  }
  function snapshot(dir) {
    var m = {};
    walk(dir).forEach(function (p) {
      var s = stat(p);
      m[p] = s.size + ':' + (s.mtime && s.mtime.getTime ? s.mtime.getTime() : s.mtime);
    });
    return m;
  }

  // ---------- small text helpers ----------

  function cap(s) {
    return s.length > MAX_OUT ? s.slice(0, MAX_OUT) + '\n[… ' + (s.length - MAX_OUT) + ' more characters cut]' : s;
  }
  function globRe(g) {
    return new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
  }
  function expandGlob(cwd, w) {
    if (!/[*?]/.test(w)) return [w];
    var dirPart = w.lastIndexOf('/') >= 0 ? w.slice(0, w.lastIndexOf('/')) : '';
    var re = globRe(w.slice(w.lastIndexOf('/') + 1));
    var dir = abs(cwd, dirPart || '.');
    if (!isDir(dir)) return [w];
    var hits = FS.readdir(dir).filter(function (n) {
      return n !== '.' && n !== '..' && re.test(n);
    }).sort();
    return hits.length ? hits.map(function (n) { return dirPart ? dirPart + '/' + n : n; }) : [w];
  }

  // ---------- the shell ----------

  /** Words and operators, with quotes, escapes, $VAR and ~ handled like a simple POSIX shell. */
  function tokenize(line, env) {
    var toks = [];
    var i = 0;
    var cur = null;
    var quotedAny = false;
    function push() {
      if (cur !== null) toks.push({ t: 'w', v: cur, q: quotedAny });
      cur = null;
      quotedAny = false;
    }
    function add(s) {
      cur = (cur || '') + s;
    }
    function variable() {
      var m = /^\$(\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/.exec(line.slice(i));
      if (!m) {
        add('$');
        i++;
        return;
      }
      add(env[m[2] || m[3]] || '');
      i += m[0].length;
    }
    while (i < line.length) {
      var c = line[i];
      if (c === ' ' || c === '\t' || c === '\n') {
        push();
        i++;
      } else if (c === "'") {
        var j = line.indexOf("'", i + 1);
        if (j < 0) throw new Error('unclosed quote');
        add(line.slice(i + 1, j));
        quotedAny = true;
        i = j + 1;
      } else if (c === '"') {
        i++;
        add('');
        quotedAny = true;
        while (i < line.length && line[i] !== '"') {
          if (line[i] === '\\' && i + 1 < line.length && '"\\$`'.indexOf(line[i + 1]) >= 0) {
            add(line[i + 1]);
            i += 2;
          } else if (line[i] === '$') variable();
          else add(line[i++]);
        }
        if (line[i] !== '"') throw new Error('unclosed quote');
        i++;
      } else if (c === '\\' && i + 1 < line.length) {
        add(line[i + 1]);
        i += 2;
      } else if (c === '$') {
        if (line[i + 1] === '(') throw new Error('$( … ) is not supported here');
        variable();
      } else if (c === '`') {
        throw new Error('backquotes are not supported here');
      } else if (c === '#' && cur === null) {
        break;
      } else {
        var ops = ['&&', '||', '2>&1', '>>', '2>', '&>', '>', '<', '|', ';', '&'];
        var op = null;
        for (var k = 0; k < ops.length; k++) {
          if (line.substr(i, ops[k].length) === ops[k]) {
            op = ops[k];
            break;
          }
        }
        if (op === '2>&1' || op === '2>' || op === '&>') {
          if (cur !== null && op !== '&>') {
            add(c);
            i++;
            continue;
          }
        }
        if (op) {
          push();
          toks.push({ t: 'op', v: op });
          i += op.length;
        } else {
          if (c === '~' && cur === null && (line[i + 1] === undefined || line[i + 1] === '/' || line[i + 1] === ' ')) {
            add('/work');
            i++;
          } else add(line[i++]);
        }
      }
    }
    push();
    return toks;
  }

  /** Splits tokens into a list of { pipeline: [cmd…], join } where each cmd has argv and redirects. */
  function parse(toks) {
    var list = [];
    var pipeline = [];
    var cmd = { argv: [], out: null, append: false, errToOut: false, errNull: false, input: null };
    function endCmd() {
      if (cmd.argv.length) pipeline.push(cmd);
      cmd = { argv: [], out: null, append: false, errToOut: false, errNull: false, input: null };
    }
    function endPipe(join) {
      endCmd();
      if (pipeline.length) list.push({ pipeline: pipeline, join: join });
      pipeline = [];
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'w') {
        cmd.argv.push(t);
        continue;
      }
      switch (t.v) {
        case '|':
          endCmd();
          break;
        case '&&':
        case '||':
        case ';':
          endPipe(t.v);
          break;
        case '&':
          endPipe(';');
          break;
        case '>':
        case '>>':
        case '&>':
          var target = toks[++i];
          if (!target || target.t !== 'w') throw new Error('missing file name after ' + t.v);
          cmd.out = target.v;
          cmd.append = t.v === '>>';
          if (t.v === '&>') cmd.errToOut = true;
          break;
        case '2>':
          var t2 = toks[++i];
          if (!t2 || t2.t !== 'w') throw new Error('missing file name after 2>');
          if (t2.v === '/dev/null') cmd.errNull = true;
          else cmd.errFile = t2.v;
          break;
        case '2>&1':
          cmd.errToOut = true;
          break;
        case '<':
          var t3 = toks[++i];
          if (!t3 || t3.t !== 'w') throw new Error('missing file name after <');
          cmd.input = t3.v;
          break;
      }
    }
    endPipe(';');
    return list;
  }

  var MISSING = {
    soffice: 'soffice (LibreOffice) is not available on this phone. Make the .docx/.xlsx/.pptx file itself and skip the PDF conversion or recalculation step.',
    libreoffice: 'LibreOffice is not available on this phone. Make the .docx/.xlsx/.pptx file itself and skip the conversion step.',
    pandoc: 'pandoc is not available on this phone. Use python-docx to build the document, or write Markdown instead.',
    ffmpeg: 'ffmpeg is not available on this phone. Audio and video processing can’t run here.',
    ffprobe: 'ffprobe is not available on this phone.',
    pdftoppm: 'pdftoppm (Poppler) is not available on this phone. pypdf and pdfminer.six can read PDFs; rendering pages to images isn’t possible here.',
    pdftotext: 'pdftotext is not available on this phone. Use pdfminer.six (from pdfminer.high_level import extract_text) instead.',
    qpdf: 'qpdf is not available on this phone. Use pypdf instead.',
    convert: 'ImageMagick is not available on this phone. Use Pillow (PIL) instead.',
    magick: 'ImageMagick is not available on this phone. Use Pillow (PIL) instead.',
    git: 'git is not available on this phone.',
    npm: 'npm can’t install packages on this phone. Bundled for node scripts: pptxgenjs, docx, pdf-lib.',
    npx: 'npx is not available on this phone.',
    bun: 'bun is not available on this phone; use node.',
    playwright: 'A web browser (Playwright) is not available on this phone.',
    chromium: 'A web browser is not available on this phone.',
    'google-chrome': 'A web browser is not available on this phone.',
    tesseract: 'tesseract (OCR) is not available on this phone.',
    curl: 'curl is not available, and skill scripts have no internet access on this phone.',
    wget: 'wget is not available, and skill scripts have no internet access on this phone.',
    sudo: 'sudo is not available on this phone.',
    apt: 'Installing system packages is not possible on this phone.',
    'apt-get': 'Installing system packages is not possible on this phone.',
    brew: 'Installing system packages is not possible on this phone.',
    bash: 'bash is not available as a program here; run the commands directly (a simple shell is built in).',
    sh: 'sh is not available as a program here; run the commands directly (a simple shell is built in).',
    zip: 'zip is not available; use Python’s zipfile module.',
    unzip: 'unzip is not available; use Python’s zipfile module.',
  };

  function missing(name) {
    return (MISSING[name] || name + ': command not found. On this phone only python, node and simple file commands (ls, cat, cp, mv, rm, mkdir, echo) are available.') + '\n';
  }

  async function runCommandLine(line, ctx) {
    var list;
    try {
      list = parse(tokenize(line, ctx.env));
    } catch (e) {
      return { out: '', err: 'sh: ' + e.message + '\n', code: 2 };
    }
    var out = '';
    var err = '';
    var code = 0;
    for (var i = 0; i < list.length; i++) {
      var prevJoin = i ? list[i - 1].join : ';';
      if (prevJoin === '&&' && code !== 0) continue;
      if (prevJoin === '||' && code === 0) continue;
      var r = await runPipeline(list[i].pipeline, ctx);
      out += r.out;
      err += r.err;
      code = r.code;
      if (ctx.exited) break;
    }
    return { out: out, err: err, code: code };
  }

  async function runPipeline(cmds, ctx) {
    var stdin = null;
    var err = '';
    var res = { out: '', err: '', code: 0 };
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      var argv = [];
      c.argv.forEach(function (w) {
        if (w.q) argv.push(w.v);
        else argv.push.apply(argv, expandGlob(ctx.cwd, w.v));
      });
      var input = stdin;
      if (c.input) {
        var ip = abs(ctx.cwd, c.input);
        if (!isFile(ip)) return { out: '', err: err + 'sh: ' + c.input + ': No such file or directory\n', code: 1 };
        input = dec.decode(FS.readFile(ip));
      }
      res = await runOne(argv, input, ctx);
      if (c.errToOut) {
        res.out += res.err;
        res.err = '';
      }
      if (c.errNull) res.err = '';
      if (c.errFile) {
        writeFile(abs(ctx.cwd, c.errFile), res.err);
        res.err = '';
      }
      if (c.out) {
        var op = abs(ctx.cwd, c.out);
        if (op !== '/dev/null') {
          var prev = c.append && isFile(op) ? dec.decode(FS.readFile(op)) : '';
          writeFile(op, prev + res.out);
        }
        res.out = '';
      }
      err += res.err;
      stdin = res.out;
    }
    return { out: res.out, err: err, code: res.code };
  }

  function flags(argv) {
    var f = {};
    var rest = [];
    argv.forEach(function (a) {
      if (/^-[A-Za-z]+$/.test(a)) a.slice(1).split('').forEach(function (ch) { f[ch] = true; });
      else rest.push(a);
    });
    return { f: f, rest: rest };
  }

  function lines(s) {
    var l = s.split('\n');
    if (l[l.length - 1] === '') l.pop();
    return l;
  }

  function textOf(ctx, args, input) {
    if (!args.length) return { text: input || '' };
    var t = '';
    for (var i = 0; i < args.length; i++) {
      var p = abs(ctx.cwd, args[i]);
      if (!isFile(p)) return { error: args[i] + ': No such file or directory\n' };
      t += dec.decode(FS.readFile(p));
    }
    return { text: t };
  }

  async function runOne(argv, input, ctx) {
    var name = argv[0];
    var args = argv.slice(1);
    var ok = function (out) { return { out: out || '', err: '', code: 0 }; };
    var fail = function (msg, code) { return { out: '', err: msg, code: code == null ? 1 : code }; };
    var base = name.split('/').pop();
    if (/^python(3(\.\d+)?)?$/.test(base)) return runPython(args, ctx, input);
    if (base === 'pip' || base === 'pip3') return pip(args);
    if (base === 'node' || base === 'nodejs') return runNode(args, ctx);
    switch (base) {
      case 'cd': {
        var to = abs(ctx.cwd, args[0] || '/work');
        if (!isDir(to)) return fail('cd: ' + (args[0] || '') + ': No such file or directory\n');
        ctx.cwd = to;
        return ok();
      }
      case 'pwd':
        return ok(ctx.cwd + '\n');
      case 'echo': {
        var n = args[0] === '-n';
        var e = args[0] === '-e';
        var rest = n || e ? args.slice(1) : args;
        var s = rest.join(' ');
        if (e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        return ok(s + (n ? '' : '\n'));
      }
      case 'printf': {
        var fmt = (args[0] || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        var k = 1;
        return ok(fmt.replace(/%[sd]/g, function () { return args[k++] || ''; }));
      }
      case 'ls': {
        var lf = flags(args);
        var targets = lf.rest.length ? lf.rest : ['.'];
        var o = '';
        for (var t = 0; t < targets.length; t++) {
          var p = abs(ctx.cwd, targets[t]);
          if (!stat(p)) return fail('ls: cannot access \'' + targets[t] + '\': No such file or directory\n', 2);
          var names = isDir(p) ? FS.readdir(p).filter(function (x) { return x !== '.' && x !== '..' && (lf.f.a || x[0] !== '.'); }).sort() : [targets[t]];
          if (targets.length > 1 && isDir(p)) o += targets[t] + ':\n';
          names.forEach(function (x) {
            var full = isDir(p) ? p + '/' + x : p;
            if (lf.f.l) {
              var st = stat(full);
              o += (isDir(full) ? 'd' : '-') + ' ' + String(st.size).padStart(9) + ' ' + x + '\n';
            } else o += x + (lf.f.F && isDir(full) ? '/' : '') + '\n';
          });
        }
        return ok(o);
      }
      case 'cat': {
        var r = textOf(ctx, args.filter(function (a) { return a !== '-'; }), input);
        return r.error ? fail('cat: ' + r.error) : ok(r.text);
      }
      case 'head':
      case 'tail': {
        var hf = args.slice();
        var count = 10;
        var idx = hf.indexOf('-n');
        if (idx >= 0) {
          count = parseInt(hf[idx + 1], 10) || 10;
          hf.splice(idx, 2);
        } else if (hf[0] && /^-\d+$/.test(hf[0])) count = parseInt(hf.shift().slice(1), 10);
        var tr = textOf(ctx, hf, input);
        if (tr.error) return fail(base + ': ' + tr.error);
        var ls = lines(tr.text);
        var pick = base === 'head' ? ls.slice(0, count) : ls.slice(Math.max(0, ls.length - count));
        return ok(pick.length ? pick.join('\n') + '\n' : '');
      }
      case 'wc': {
        var wf = flags(args);
        var wr = textOf(ctx, wf.rest, input);
        if (wr.error) return fail('wc: ' + wr.error);
        var lc = lines(wr.text).length;
        if (wf.f.l) return ok(lc + '\n');
        return ok(lc + ' ' + wr.text.split(/\s+/).filter(Boolean).length + ' ' + enc.encode(wr.text).length + '\n');
      }
      case 'grep': {
        var gf = flags(args);
        var pat = gf.rest.shift();
        if (pat == null) return fail('grep: missing pattern\n', 2);
        var gr = textOf(ctx, gf.rest, input);
        if (gr.error) return fail('grep: ' + gr.error, 2);
        var re;
        try {
          re = new RegExp(pat, gf.f.i ? 'i' : '');
        } catch (x) {
          re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), gf.f.i ? 'i' : '');
        }
        var hits = lines(gr.text).filter(function (l) { return re.test(l) !== !!gf.f.v; });
        if (gf.f.c) return ok(hits.length + '\n');
        return hits.length ? ok(hits.join('\n') + '\n') : { out: '', err: '', code: 1 };
      }
      case 'sort': {
        var sr = textOf(ctx, args.filter(function (a) { return a[0] !== '-'; }), input);
        if (sr.error) return fail('sort: ' + sr.error);
        var sl = lines(sr.text).sort();
        if (args.indexOf('-r') >= 0) sl.reverse();
        return ok(sl.length ? sl.join('\n') + '\n' : '');
      }
      case 'mkdir': {
        var mf = flags(args);
        for (var m = 0; m < mf.rest.length; m++) {
          var mp = abs(ctx.cwd, mf.rest[m]);
          if (stat(mp)) {
            if (!mf.f.p) return fail('mkdir: cannot create directory \'' + mf.rest[m] + '\': File exists\n');
          } else if (mf.f.p) mkdirp(mp);
          else {
            if (!isDir(mp.slice(0, mp.lastIndexOf('/')) || '/')) return fail('mkdir: cannot create directory \'' + mf.rest[m] + '\': No such file or directory\n');
            FS.mkdir(mp);
          }
        }
        return ok();
      }
      case 'touch': {
        args.forEach(function (a) {
          var tp = abs(ctx.cwd, a);
          if (!stat(tp)) writeFile(tp, '');
        });
        return ok();
      }
      case 'rm': {
        var rf = flags(args);
        for (var q = 0; q < rf.rest.length; q++) {
          var rp = abs(ctx.cwd, rf.rest[q]);
          if (rp === '/' || rp === '/work' || rp.indexOf('/skills') === 0) return fail('rm: refusing to remove \'' + rf.rest[q] + '\'\n');
          if (!stat(rp)) {
            if (!rf.f.f) return fail('rm: cannot remove \'' + rf.rest[q] + '\': No such file or directory\n');
            continue;
          }
          if (isDir(rp) && !rf.f.r && !rf.f.R) return fail('rm: cannot remove \'' + rf.rest[q] + '\': Is a directory\n');
          rmrf(rp);
        }
        return ok();
      }
      case 'cp':
      case 'mv': {
        var cf = flags(args);
        if (cf.rest.length < 2) return fail(base + ': missing file operand\n');
        var dest = abs(ctx.cwd, cf.rest[cf.rest.length - 1]);
        var srcs = cf.rest.slice(0, -1);
        for (var s2 = 0; s2 < srcs.length; s2++) {
          var sp = abs(ctx.cwd, srcs[s2]);
          if (!stat(sp)) return fail(base + ': cannot stat \'' + srcs[s2] + '\': No such file or directory\n');
          var target = isDir(dest) ? dest + '/' + sp.split('/').pop() : dest;
          if (isDir(sp)) {
            if (base === 'cp' && !cf.f.r && !cf.f.R) return fail('cp: -r not specified; omitting directory \'' + srcs[s2] + '\'\n');
            walk(sp).forEach(function (f) { writeFile(target + f.slice(sp.length), FS.readFile(f)); });
            if (base === 'mv') rmrf(sp);
          } else {
            writeFile(target, FS.readFile(sp));
            if (base === 'mv') FS.unlink(sp);
          }
        }
        return ok();
      }
      case 'find': {
        var fdir = args[0] && args[0][0] !== '-' ? args[0] : '.';
        var ni = args.indexOf('-name');
        var nre = ni >= 0 ? globRe(args[ni + 1] || '*') : null;
        var ti = args.indexOf('-type');
        var type = ti >= 0 ? args[ti + 1] : null;
        var root = abs(ctx.cwd, fdir);
        var all = [];
        (function rec(d) {
          if (!isDir(d)) return;
          FS.readdir(d).forEach(function (x) {
            if (x === '.' || x === '..') return;
            var fp = d + '/' + x;
            var dir = isDir(fp);
            if ((!nre || nre.test(x)) && (!type || (type === 'd') === dir)) all.push(fdir.replace(/\/$/, '') + fp.slice(root.length));
            if (dir) rec(fp);
          });
        })(root);
        return ok(all.length ? all.join('\n') + '\n' : '');
      }
      case 'which':
      case 'command': {
        var w = args.filter(function (a) { return a[0] !== '-'; });
        var found = w.filter(function (x) { return /^(python3?|pip3?|node)$/.test(x); });
        return found.length === w.length ? ok(found.map(function (x) { return '/usr/bin/' + x; }).join('\n') + '\n') : { out: '', err: '', code: 1 };
      }
      case 'true':
        return ok();
      case 'false':
        return { out: '', err: '', code: 1 };
      case 'exit':
        ctx.exited = true;
        return { out: '', err: '', code: parseInt(args[0] || '0', 10) || 0 };
      case 'export': {
        args.forEach(function (a) {
          var eq = a.indexOf('=');
          if (eq > 0) ctx.env[a.slice(0, eq)] = a.slice(eq + 1);
        });
        return ok();
      }
      case 'chmod':
      case 'set':
      case 'source':
        return ok();
      default:
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(name) && !args.length) {
          ctx.env[name.slice(0, name.indexOf('='))] = name.slice(name.indexOf('=') + 1);
          return ok();
        }
        return fail(missing(base), 127);
    }
  }

  function pip(args) {
    var a = args.filter(function (x) { return x[0] !== '-'; });
    if (a[0] === 'list' || a[0] === 'freeze') return { out: BUNDLED.join('\n') + '\n', err: '', code: 0 };
    if (a[0] !== 'install') return { out: '', err: 'pip: only "pip install" and "pip list" work here.\n', code: 1 };
    var pkgs = a.slice(1).map(function (p) { return p.split(/[<>=!~\[;]/)[0]; }).filter(Boolean);
    var normal = function (n) { return n.toLowerCase().replace(/[-_.]+/g, '-'); };
    var have = BUNDLED.map(normal);
    var out = '';
    var bad = [];
    pkgs.forEach(function (p) {
      if (have.indexOf(normal(p)) >= 0) out += 'Requirement already satisfied: ' + p + ' (bundled)\n';
      else bad.push(p);
    });
    if (bad.length) {
      return { out: out, err: 'ERROR: ' + bad.join(', ') + ' is not bundled, and packages can’t be downloaded on this phone. Bundled: ' + BUNDLED.join(', ') + '\n', code: 1 };
    }
    return { out: out, err: '', code: 0 };
  }

  // ---------- Python ----------

  var PY_INIT = [
    'import sys, os, io, runpy, traceback, shlex, subprocess, builtins',
    '_AIHAT_PY = {"python", "python3", "python3.14", os.path.basename(sys.executable or "python3")}',
    'def _aihat_code(e):',
    '    c = e.code',
    '    if c is None: return 0',
    '    if isinstance(c, int): return c',
    '    print(c, file=sys.stderr)',
    '    return 1',
    'def _aihat_exec(argv, mode, payload):',
    '    sys.argv = list(argv)',
    '    code = 0',
    '    added = None',
    '    try:',
    '        if mode == "c":',
    '            exec(compile(payload, "<string>", "exec"), {"__name__": "__main__", "__builtins__": builtins})',
    '        elif mode == "m":',
    '            runpy.run_module(payload, run_name="__main__", alter_sys=True)',
    '        else:',
    '            added = os.path.dirname(os.path.abspath(payload))',
    '            sys.path.insert(0, added)',
    '            runpy.run_path(payload, run_name="__main__")',
    '    except SystemExit as e:',
    '        code = _aihat_code(e)',
    '    except BaseException:',
    '        traceback.print_exc()',
    '        code = 1',
    '    finally:',
    '        if added and added in sys.path: sys.path.remove(added)',
    '        for _n, _m in list(sys.modules.items()):',
    '            _f = getattr(_m, "__file__", None) or ""',
    '            if _f.startswith(("/work/", "/skills/")): del sys.modules[_n]',
    '    try:',
    '        sys.stdout.flush(); sys.stderr.flush()',
    '    except Exception: pass',
    '    return code',
    'def _aihat_parse(args):',
    '    i = 0',
    '    while i < len(args) and args[i] in ("-u", "-B", "-E", "-s", "-S", "-I", "-q", "-O", "-OO"): i += 1',
    '    rest = args[i:]',
    '    if not rest: return ("c", "", ["-c"])',
    '    if rest[0] == "-c": return ("c", rest[1] if len(rest) > 1 else "", ["-c"] + rest[2:])',
    '    if rest[0] == "-m": return ("m", rest[1] if len(rest) > 1 else "", [rest[1] if len(rest) > 1 else ""] + rest[2:])',
    '    return ("f", rest[0], rest)',
    'def _aihat_argv(args, shell):',
    '    if isinstance(args, bytes): args = args.decode()',
    '    if isinstance(args, str):',
    '        if shell and any(op in args for op in ("&&", "||", "|", ";", ">", "<", "`", "$(")):',
    '            raise OSError(38, "Shell pipes and redirects are not available on this phone: run one program per call")',
    '        return shlex.split(args)',
    '    return [os.fspath(a) for a in args]',
    'def _aihat_spawn(args, shell=False, cwd=None, input=None, text=None, encoding=None, errors=None, universal_newlines=None, capture_output=False, stdout=None, stderr=None, timeout=None, check=False, env=None, **kw):',
    '    argv = _aihat_argv(args, shell)',
    '    if not argv: raise ValueError("empty command")',
    '    prog = os.path.basename(argv[0])',
    '    if prog not in _AIHAT_PY and argv[0] != sys.executable:',
    '        if prog in ("node", "nodejs"): why = "node can\'t be started from inside a Python script on this phone; run it as its own command"',
    '        else: why = prog + " is not available on this phone"',
    '        raise FileNotFoundError(2, why, argv[0])',
    '    if argv[1:3] in (["-m", "pip"],):',
    '        return subprocess.CompletedProcess(argv, 0, b"" if not (text or universal_newlines or encoding) else "", None)',
    '    out, err = io.StringIO(), io.StringIO()',
    '    saved = (sys.stdout, sys.stderr, sys.stdin, os.getcwd(), list(sys.argv))',
    '    sys.stdout, sys.stderr = out, err',
    '    if input is not None: sys.stdin = io.StringIO(input if isinstance(input, str) else input.decode())',
    '    try:',
    '        if cwd: os.chdir(cwd)',
    '        mode, payload, rest = _aihat_parse(argv[1:])',
    '        code = _aihat_exec(rest, mode, payload)',
    '    finally:',
    '        sys.stdout, sys.stderr, sys.stdin = saved[0], saved[1], saved[2]',
    '        os.chdir(saved[3]); sys.argv = saved[4]',
    '    as_text = bool(text or universal_newlines or encoding)',
    '    o, e = out.getvalue(), err.getvalue()',
    '    pipe_out = capture_output or stdout == subprocess.PIPE',
    '    pipe_err = capture_output or stderr == subprocess.PIPE',
    '    if stderr == subprocess.STDOUT:',
    '        o, e = o + e, ""',
    '    if not pipe_out and stdout != subprocess.DEVNULL: sys.stdout.write(o)',
    '    if not pipe_err and stderr not in (subprocess.DEVNULL, subprocess.STDOUT): sys.stderr.write(e)',
    '    conv = (lambda s: s) if as_text else (lambda s: s.encode())',
    '    res = subprocess.CompletedProcess(argv, code, conv(o) if pipe_out else None, conv(e) if pipe_err else None)',
    '    if check and code: raise subprocess.CalledProcessError(code, argv, res.stdout, res.stderr)',
    '    return res',
    'class _AihatPopen:',
    '    def __init__(self, args, **kw):',
    '        self.args = args',
    '        self.pid = 4242',
    '        self._r = _aihat_spawn(args, **{k: v for k, v in kw.items() if k in ("shell", "cwd", "text", "encoding", "universal_newlines", "stdout", "stderr", "env")})',
    '        self.returncode = self._r.returncode',
    '        as_text = bool(kw.get("text") or kw.get("universal_newlines") or kw.get("encoding"))',
    '        mk = (lambda v: io.StringIO(v)) if as_text else (lambda v: io.BytesIO(v))',
    '        self.stdout = mk(self._r.stdout) if self._r.stdout is not None else None',
    '        self.stderr = mk(self._r.stderr) if self._r.stderr is not None else None',
    '        self.stdin = None',
    '    def communicate(self, input=None, timeout=None): return (self._r.stdout, self._r.stderr)',
    '    def wait(self, timeout=None): return self.returncode',
    '    def poll(self): return self.returncode',
    '    def kill(self): pass',
    '    terminate = kill',
    '    def __enter__(self): return self',
    '    def __exit__(self, *a): return False',
    'subprocess.run = _aihat_spawn',
    'subprocess.Popen = _AihatPopen',
    'subprocess.call = lambda *a, **k: _aihat_spawn(*a, **k).returncode',
    'def _aihat_check_call(*a, **k):',
    '    k["check"] = True',
    '    return _aihat_spawn(*a, **k).returncode',
    'subprocess.check_call = _aihat_check_call',
    'def _aihat_check_output(*a, **k):',
    '    k["check"] = True; k["stdout"] = subprocess.PIPE',
    '    return _aihat_spawn(*a, **k).stdout',
    'subprocess.check_output = _aihat_check_output',
    'def _aihat_getstatusoutput(cmd):',
    '    try:',
    '        r = _aihat_spawn(cmd, shell=True, capture_output=True, text=True)',
    '        return (r.returncode, (r.stdout + r.stderr).rstrip("\\n"))',
    '    except OSError as e:',
    '        return (127, str(e))',
    'subprocess.getstatusoutput = _aihat_getstatusoutput',
    'subprocess.getoutput = lambda cmd: _aihat_getstatusoutput(cmd)[1]',
    'def _aihat_system(cmd):',
    '    try:',
    '        return _aihat_spawn(cmd, shell=True).returncode << 8',
    '    except OSError as e:',
    '        print("sh: " + str(e), file=sys.stderr)',
    '        return 127 << 8',
    'os.system = _aihat_system',
    'os.makedirs("/work", exist_ok=True)',
  ].join('\n');

  // Programs a script imports → Pyodide packages to load first (its own imports, and the bundled wheels' native needs).
  function importsOf(src) {
    var names = {};
    var re = /^[ \t]*(?:from[ \t]+([A-Za-z_][\w]*)|import[ \t]+([A-Za-z_][\w]*(?:[ \t]*,[ \t]*[A-Za-z_][\w]*)*))/gm;
    var m;
    while ((m = re.exec(src))) {
      if (m[1]) names[m[1]] = true;
      else m[2].split(',').forEach(function (x) { names[x.trim()] = true; });
    }
    return Object.keys(names);
  }

  async function ensurePython() {
    if (!pythonReady) {
      pythonReady = (async function () {
        if (opts.installWheels) await opts.installWheels(py);
        py.runPython(PY_INIT);
      })();
    }
    return pythonReady;
  }

  async function loadFor(sources) {
    var pkgs = {};
    sources.forEach(function (src) {
      importsOf(src).forEach(function (n) { (NEEDS[n] || []).forEach(function (p) { pkgs[p] = true; }); });
    });
    var list = Object.keys(pkgs);
    if (list.length) await py.loadPackage(list, { messageCallback: function () {}, errorCallback: function () {} });
    for (var i = 0; i < sources.length; i++) await py.loadPackagesFromImports(sources[i], { messageCallback: function () {}, errorCallback: function () {} });
  }

  async function runPython(args, ctx, input) {
    await ensurePython();
    var i = 0;
    while (i < args.length && /^-[uBEsSIqO]+$/.test(args[i])) i++;
    var rest = args.slice(i);
    if (rest[0] === '-m' && rest[1] === 'pip') return pip(rest.slice(2));
    var mode = 'f';
    var payload = '';
    var argv;
    if (!rest.length) {
      if (input == null) return { out: '', err: 'python: an interactive prompt is not available; pass a script or -c code\n', code: 2 };
      mode = 'c';
      payload = input;
      argv = ['-c'];
    } else if (rest[0] === '-c') {
      mode = 'c';
      payload = rest[1] || '';
      argv = ['-c'].concat(rest.slice(2));
    } else if (rest[0] === '-m') {
      mode = 'm';
      payload = rest[1] || '';
      argv = [payload].concat(rest.slice(2));
    } else {
      var file = abs(ctx.cwd, rest[0]);
      if (!isFile(file) && ctx.skill && isFile(abs('/skills/' + ctx.skill, rest[0]))) file = abs('/skills/' + ctx.skill, rest[0]);
      if (!isFile(file)) return { out: '', err: "python3: can't open file '" + rest[0] + "': [Errno 2] No such file or directory\n", code: 2 };
      payload = file;
      argv = [file].concat(rest.slice(1));
    }
    // Load the packages the script (and the other Python files beside it) import.
    var sources = [mode === 'f' ? dec.decode(FS.readFile(payload)) : payload];
    var near = mode === 'f' ? payload.slice(0, payload.lastIndexOf('/')) : ctx.cwd;
    walk(near).concat(ctx.skill ? walk('/skills/' + ctx.skill) : []).forEach(function (p) {
      if (/\.py$/.test(p) && sources.length < 60) sources.push(dec.decode(FS.readFile(p)));
    });
    try {
      await loadFor(sources);
    } catch (e) {
      /* a package that can't load shows up as an ImportError when the script runs */
    }
    var out = '';
    var err = '';
    py.setStdout({ write: function (b) { out += dec.decode(b); return b.length; } });
    py.setStderr({ write: function (b) { err += dec.decode(b); return b.length; } });
    if (input != null && mode !== 'c') py.setStdin({ stdin: (function () { var done = false; return function () { if (done) return null; done = true; return input; }; })() });
    var code;
    try {
      FS.chdir(ctx.cwd);
      var fn = py.globals.get('_aihat_exec');
      var pyArgv = py.toPy(argv);
      code = fn(pyArgv, mode, payload);
      pyArgv.destroy();
      fn.destroy();
    } catch (e) {
      err += String(e && e.message ? e.message : e) + '\n';
      code = 1;
    } finally {
      py.setStdout({});
      py.setStderr({});
      py.setStdin({});
    }
    return { out: out, err: err, code: typeof code === 'number' ? code : 1 };
  }

  // ---------- Node-style JavaScript ----------

  function makeBuffer() {
    function B() {}
    var from = function (v, encoding) {
      var u;
      if (typeof v === 'string') {
        if (encoding === 'base64') {
          var bin = atob(v);
          u = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        } else u = enc.encode(v);
      } else if (v instanceof ArrayBuffer) u = new Uint8Array(v);
      else u = new Uint8Array(v);
      return wrap(u);
    };
    function wrap(u) {
      u.toString = function (e) {
        if (e === 'base64') {
          var s = '';
          for (var i = 0; i < this.length; i += 32768) s += String.fromCharCode.apply(null, this.subarray(i, i + 32768));
          return btoa(s);
        }
        return dec.decode(this);
      };
      return u;
    }
    B.from = from;
    B.alloc = function (n) { return wrap(new Uint8Array(n)); };
    B.isBuffer = function (x) { return x instanceof Uint8Array; };
    B.byteLength = function (s) { return typeof s === 'string' ? enc.encode(s).length : s.byteLength; };
    B.concat = function (list) {
      var n = 0;
      list.forEach(function (x) { n += x.length; });
      var u = new Uint8Array(n);
      var o = 0;
      list.forEach(function (x) { u.set(x, o); o += x.length; });
      return wrap(u);
    };
    return B;
  }

  function toBytes(data, Buf) {
    if (typeof data === 'string') return enc.encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return enc.encode(String(data));
  }

  function makeFs(ctx, Buf, track) {
    var P = function (p) { return abs(ctx.cwd, String(p)); };
    var nf = function (p) { var e = new Error("ENOENT: no such file or directory, '" + p + "'"); e.code = 'ENOENT'; return e; };
    var fs = {
      existsSync: function (p) { return !!stat(P(p)); },
      readFileSync: function (p, o) {
        var f = P(p);
        if (!isFile(f)) throw nf(p);
        var b = Buf.from(FS.readFile(f));
        var e = typeof o === 'string' ? o : o && o.encoding;
        return e ? (e === 'base64' ? b.toString('base64') : dec.decode(b)) : b;
      },
      writeFileSync: function (p, d) { writeFile(P(p), toBytes(d, Buf)); },
      appendFileSync: function (p, d) {
        var f = P(p);
        var prev = isFile(f) ? FS.readFile(f) : new Uint8Array(0);
        var add = toBytes(d, Buf);
        var u = new Uint8Array(prev.length + add.length);
        u.set(prev);
        u.set(add, prev.length);
        writeFile(f, u);
      },
      mkdirSync: function (p, o) {
        var f = P(p);
        if (o && o.recursive) mkdirp(f);
        else FS.mkdir(f);
      },
      readdirSync: function (p) {
        var f = P(p);
        if (!isDir(f)) throw nf(p);
        return FS.readdir(f).filter(function (x) { return x !== '.' && x !== '..'; });
      },
      statSync: function (p) {
        var f = P(p);
        var s = stat(f);
        if (!s) throw nf(p);
        return { size: s.size, mtime: s.mtime, isFile: function () { return FS.isFile(s.mode); }, isDirectory: function () { return FS.isDir(s.mode); } };
      },
      unlinkSync: function (p) { FS.unlink(P(p)); },
      rmSync: function (p, o) {
        var f = P(p);
        if (!stat(f)) {
          if (o && o.force) return;
          throw nf(p);
        }
        rmrf(f);
      },
      copyFileSync: function (a, b) { writeFile(P(b), FS.readFile(P(a))); },
      renameSync: function (a, b) {
        writeFile(P(b), FS.readFile(P(a)));
        FS.unlink(P(a));
      },
    };
    fs.lstatSync = fs.statSync;
    fs.promises = {};
    Object.keys(fs).forEach(function (k) {
      if (!/Sync$/.test(k)) return;
      var name = k.replace(/Sync$/, '');
      var sync = fs[k];
      fs.promises[name] = function () {
        var a = arguments;
        return track(new Promise(function (res, rej) { try { res(sync.apply(null, a)); } catch (e) { rej(e); } }));
      };
      fs[name] = function () {
        var a = Array.prototype.slice.call(arguments);
        var cb = typeof a[a.length - 1] === 'function' ? a.pop() : null;
        var r;
        var e = null;
        try { r = sync.apply(null, a); } catch (x) { e = x; }
        if (cb) track(Promise.resolve().then(function () { cb(e, r); }));
      };
    });
    fs.exists = function (p, cb) { cb(fs.existsSync(p)); };
    return fs;
  }

  var pathMod = {
    sep: '/',
    delimiter: ':',
    join: function () {
      var s = Array.prototype.slice.call(arguments).filter(function (x) { return x !== ''; }).join('/');
      var n = norm(s);
      return s.charAt(0) === '/' ? n : n.slice(1) || '.';
    },
    resolve: function () {
      var p = nodeCwd;
      Array.prototype.slice.call(arguments).forEach(function (a) { p = String(a).charAt(0) === '/' ? String(a) : p + '/' + a; });
      return norm(p);
    },
    dirname: function (p) { var i = String(p).lastIndexOf('/'); return i <= 0 ? (i === 0 ? '/' : '.') : String(p).slice(0, i); },
    basename: function (p, ext) { var b = String(p).split('/').pop(); return ext && b.slice(-ext.length) === ext ? b.slice(0, -ext.length) : b; },
    extname: function (p) { var b = String(p).split('/').pop(); var i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    relative: function (a, b) {
      var A = norm(String(a)).split('/').filter(Boolean);
      var Bp = norm(String(b)).split('/').filter(Boolean);
      while (A.length && Bp.length && A[0] === Bp[0]) { A.shift(); Bp.shift(); }
      return A.map(function () { return '..'; }).concat(Bp).join('/');
    },
    isAbsolute: function (p) { return String(p).charAt(0) === '/'; },
    normalize: function (p) { return norm(String(p)); },
  };
  pathMod.posix = pathMod;
  var nodeCwd = '/work';

  async function loadJsLib(name) {
    if (!jsLibs[name]) jsLibs[name] = opts.loadJsLib ? opts.loadJsLib(name) : Promise.reject(new Error('no libraries'));
    return jsLibs[name];
  }

  async function runNode(args, ctx) {
    var file;
    var code;
    var rest;
    if (args[0] === '-e' || args[0] === '--eval') {
      code = args[1] || '';
      file = '/work/[eval]';
      rest = args.slice(2);
    } else if (!args.length) {
      return { out: '', err: 'node: an interactive prompt is not available; pass a script file\n', code: 9 };
    } else {
      file = abs(ctx.cwd, args[0]);
      if (!isFile(file) && ctx.skill && isFile(abs('/skills/' + ctx.skill, args[0]))) file = abs('/skills/' + ctx.skill, args[0]);
      if (!isFile(file)) return { out: '', err: "node: Cannot find module '" + file + "'\n", code: 1 };
      code = dec.decode(FS.readFile(file));
      rest = args.slice(1);
    }
    nodeCwd = ctx.cwd;
    var out = '';
    var err = '';
    var pending = 0;
    var exitCode = null;
    var timers = {};
    function track(p) {
      pending++;
      var done = function () { pending--; };
      p.then(done, done);
      return p;
    }
    var Buf = makeBuffer();
    var fmt = function (a) {
      return Array.prototype.map.call(a, function (x) {
        if (typeof x === 'string') return x;
        if (x instanceof Error) return x.stack || x.message;
        try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); }
      }).join(' ');
    };
    var con = {
      log: function () { out += fmt(arguments) + '\n'; },
      info: function () { out += fmt(arguments) + '\n'; },
      warn: function () { err += fmt(arguments) + '\n'; },
      error: function () { err += fmt(arguments) + '\n'; },
      debug: function () {},
      table: function (x) { out += fmt([x]) + '\n'; },
    };
    function ExitSignal(c) { this.code = c; }
    var proc = {
      argv: ['node', file].concat(rest),
      env: Object.assign({}, ctx.env),
      platform: 'linux',
      version: 'v22.0.0-aihat',
      versions: { node: '22.0.0' },
      cwd: function () { return ctx.cwd; },
      chdir: function (d) { ctx.cwd = nodeCwd = abs(ctx.cwd, d); },
      exit: function (c) { exitCode = c == null ? 0 : c; throw new ExitSignal(exitCode); },
      on: function () { return proc; },
      once: function () { return proc; },
      stdout: { write: function (s) { out += String(s); return true; } },
      stderr: { write: function (s) { err += String(s); return true; } },
      nextTick: function (f) { track(Promise.resolve().then(f)); },
      hrtime: { bigint: function () { return BigInt(Math.round(performance.now() * 1e6)); } },
    };
    var fs = makeFs(ctx, Buf, track);
    var mySet = function (f, ms) {
      var id;
      var p = new Promise(function (res) { id = setTimeout(function () { delete timers[id]; try { f(); } finally { res(); } }, ms); });
      timers[id] = true;
      track(p);
      return id;
    };
    var cache = {};
    var LIB_NAMES = { pptxgenjs: true, docx: true, 'pdf-lib': true };
    var libs = {};
    // Load the bundled libraries a script names, before it runs (require is synchronous).
    var wanted = {};
    var reqRe = /(?:require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/g;
    function scan(src) {
      var m;
      while ((m = reqRe.exec(src))) {
        var n = m[1] || m[2] || m[3];
        if (LIB_NAMES[n]) wanted[n] = true;
      }
    }
    scan(code);
    walk(file.slice(0, file.lastIndexOf('/'))).forEach(function (p) { if (/\.(c|m)?js$/.test(p)) scan(dec.decode(FS.readFile(p))); });
    var names = Object.keys(wanted);
    for (var i = 0; i < names.length; i++) {
      try {
        libs[names[i]] = await loadJsLib(names[i]);
      } catch (e) {
        return { out: '', err: 'node: the bundled library ' + names[i] + ' could not be loaded: ' + e.message + '\n', code: 1 };
      }
    }
    function adapt(name, lib) {
      if (name === 'pptxgenjs') {
        var Ctor = lib;
        var Wrapped = function () {
          var p = new Ctor();
          var write = p.write.bind(p);
          p.write = function (o) {
            var type = (o && o.outputType) || o;
            if (type === 'nodebuffer') return track(write({ outputType: 'uint8array', compression: o && o.compression }).then(function (u) { return Buf.from(u); }));
            return track(write(o));
          };
          p.writeFile = function (o) {
            var name2 = (o && o.fileName) || (typeof o === 'string' ? o : 'Presentation.pptx');
            if (!/\.pptx$/i.test(name2)) name2 += '.pptx';
            return track(write({ outputType: 'uint8array' }).then(function (u) { writeFile(abs(ctx.cwd, name2), u); return name2; }));
          };
          return p;
        };
        Wrapped.prototype = Ctor.prototype;
        Object.keys(Ctor).forEach(function (k) { Wrapped[k] = Ctor[k]; });
        Wrapped.default = Wrapped;
        return Wrapped;
      }
      if (name === 'docx') {
        var mod = Object.assign({}, lib);
        var Packer = lib.Packer;
        mod.Packer = Object.assign(Object.create(Packer), Packer, {
          toBuffer: function (doc, pretty) {
            return track(Packer.toBlob(doc, pretty).then(function (b) { return b.arrayBuffer(); }).then(function (ab) { return Buf.from(ab); }));
          },
          toBase64String: function (doc, pretty) { return track(Packer.toBase64String(doc, pretty)); },
          toBlob: function (doc, pretty) { return track(Packer.toBlob(doc, pretty)); },
        });
        return mod;
      }
      return lib;
    }
    function req(from) {
      return function (name) {
        var n = String(name).replace(/^node:/, '');
        if (n === 'fs') return fs;
        if (n === 'fs/promises') return fs.promises;
        if (n === 'path') return pathMod;
        if (n === 'os') return { tmpdir: function () { return '/tmp'; }, homedir: function () { return '/work'; }, EOL: '\n', platform: function () { return 'linux'; }, cpus: function () { return [{}]; } };
        if (n === 'buffer') return { Buffer: Buf };
        if (n === 'util') return { format: function () { return fmt(arguments); }, promisify: function (f) { return function () { var a = Array.prototype.slice.call(arguments); return new Promise(function (r, j) { f.apply(null, a.concat([function (e, v) { e ? j(e) : r(v); }])); }); }; }, inspect: function (x) { return fmt([x]); } };
        if (n === 'process') return proc;
        if (n === 'url') return { URL: URL, pathToFileURL: function (p) { return new URL('file://' + abs(ctx.cwd, p)); }, fileURLToPath: function (u) { return String(u).replace(/^file:\/\//, ''); } };
        if (n === 'child_process') {
          var no = function () { throw new Error('child_process is not available on this phone: run other programs as their own command'); };
          return { exec: no, execSync: no, spawn: no, spawnSync: no, execFile: no, execFileSync: no, fork: no };
        }
        if (n === 'http' || n === 'https' || n === 'net' || n === 'tls' || n === 'dns') throw new Error(n + ' is not available: skill scripts have no internet access on this phone');
        if (libs[n]) return adapt(n, libs[n]);
        if (n.charAt(0) === '.' || n.charAt(0) === '/') {
          var base = abs(from, n);
          var cands = [base, base + '.js', base + '.cjs', base + '.json', base + '/index.js'];
          for (var c = 0; c < cands.length; c++) if (isFile(cands[c])) return load(cands[c]);
          throw new Error("Cannot find module '" + name + "'");
        }
        if (LIB_NAMES[n]) throw new Error('Cannot find module ' + n);
        throw new Error("Cannot find module '" + name + "'. On this phone node scripts can use: fs, path, os, buffer, util, pptxgenjs, docx, pdf-lib.");
      };
    }
    /** ES module syntax → CommonJS, for the usual import/export forms scripts use. */
    function toCjs(src) {
      if (!/^\s*(import|export)\s/m.test(src)) return src;
      var exported = [];
      var o = src
        .replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");')
        .replace(/^\s*import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm, function (_, d, names, m) { return 'const $__m_' + d + ' = require("' + m + '"); const ' + d + ' = $__m_' + d + '.default || $__m_' + d + '; const {' + names.replace(/\s+as\s+/g, ': ') + '} = $__m_' + d + ';'; })
        .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm, function (_, names, m) { return 'const {' + names.replace(/\s+as\s+/g, ': ') + '} = require("' + m + '");'; })
        .replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, function (_, d, m) { return 'const ' + d + ' = (function (x) { return x && x.default ? x.default : x; })(require("' + m + '"));'; })
        .replace(/^\s*import\s+['"]([^'"]+)['"];?/gm, 'require("$1");')
        .replace(/^\s*export\s+default\s+/gm, 'module.exports.default = ')
        .replace(/^(\s*)export\s+(async\s+function|function|class|const|let|var)\s+(\w+)/gm, function (_, sp, kind, n) { exported.push(n); return sp + kind + ' ' + n; })
        .replace(/^\s*export\s+\{([^}]+)\};?/gm, function (_, names) { names.split(',').forEach(function (x) { var pr = x.trim().split(/\s+as\s+/); if (pr[0]) exported.push(pr[0] + (pr[1] ? ':' + pr[1] : '')); }); return ''; });
      return o + '\n' + exported.map(function (x) { var pr = x.split(':'); return 'module.exports.' + (pr[1] || pr[0]) + ' = ' + pr[0] + ';'; }).join('\n');
    }
    function load(path) {
      if (cache[path]) return cache[path].exports;
      var mod = { exports: {} };
      cache[path] = mod;
      var src = dec.decode(FS.readFile(path));
      if (/\.json$/.test(path)) {
        mod.exports = JSON.parse(src);
        return mod.exports;
      }
      run(src, path, mod);
      return mod.exports;
    }
    function run(src, path, mod) {
      var dir = path.slice(0, path.lastIndexOf('/')) || '/';
      var body = toCjs(src.replace(/^#!.*\n/, '\n'));
      var f = new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', 'console', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'global', '"use strict";\n' + body + '\n//# sourceURL=' + path);
      var r = f(req(dir), mod, mod.exports, path, dir, proc, con, Buf, mySet, function () { err += 'setInterval is not supported here\n'; return 0; }, function (id) { clearTimeout(id); }, function () {}, function (fn) { return mySet(fn, 0); }, globalThis);
      return r;
    }
    var main = { exports: {} };
    var result = 0;
    try {
      var src0 = toCjs(code.replace(/^#!.*\n/, '\n'));
      var dir0 = file.slice(0, file.lastIndexOf('/')) || '/';
      var plain = null;
      try {
        plain = new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', 'console', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'global', '"use strict";\n' + src0);
      } catch (syntax) {
        plain = null;
      }
      if (plain) {
        cache[file] = main;
        run(code, file, main);
      } else {
        // Top-level await: run the script as one async function.
        var af = new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', 'console', 'Buffer', 'setTimeout', 'global', 'return (async () => {\n' + src0 + '\n})();');
        await track(af(req(dir0), main, main.exports, file, dir0, proc, con, Buf, mySet, globalThis));
      }
      // Wait for writes, timers and promises the script started.
      var idle = 0;
      while (idle < 3 && exitCode === null) {
        await new Promise(function (r) { setTimeout(r, 15); });
        idle = pending === 0 ? idle + 1 : 0;
      }
    } catch (e) {
      if (e instanceof ExitSignal) result = e.code;
      else {
        err += (e && e.stack ? e.stack : String(e)) + '\n';
        result = 1;
      }
    }
    if (exitCode !== null) result = exitCode;
    return { out: out, err: err, code: result };
  }

  // ---------- one job ----------

  /**
   * job: { command, skill?, skillFiles?: { path: Uint8Array }, files?: { name: Uint8Array } }
   * Returns { stdout, stderr, exitCode, outputFiles: { name: Uint8Array }, skipped: string[] }.
   */
  async function run(job) {
    try {
      return await runJob(job);
    } catch (e) {
      return { stdout: '', stderr: 'The script runner failed: ' + (e && e.message ? e.message : e && e.errno ? 'file system error ' + e.errno : String(e)) + '\n', exitCode: 1, outputFiles: {}, skipped: [] };
    }
  }

  async function runJob(job) {
    // Leave /work before clearing it (a folder in use can't be removed).
    FS.chdir('/');
    rmrf('/work');
    mkdirp('/work');
    if (job.skill) {
      rmrf('/skills/' + job.skill);
      Object.keys(job.skillFiles || {}).forEach(function (p) {
        var clean = norm(p).slice(1);
        if (clean) writeFile('/skills/' + job.skill + '/' + clean, job.skillFiles[p]);
      });
    }
    Object.keys(job.files || {}).forEach(function (n) {
      var clean = norm(n).slice(1);
      if (clean) writeFile('/work/' + clean, job.files[n]);
    });
    var before = snapshot('/work');
    var ctx = { cwd: '/work', skill: job.skill || null, env: { HOME: '/work', PWD: '/work', TMPDIR: '/tmp', PATH: '/usr/bin', SKILL_DIR: job.skill ? '/skills/' + job.skill : '' }, exited: false };
    var r = await runCommandLine(String(job.command || ''), ctx);
    var after = snapshot('/work');
    var outputs = {};
    var skipped = [];
    Object.keys(after).forEach(function (p) {
      if (before[p] === after[p]) return;
      var size = stat(p).size;
      var rel = p.slice('/work/'.length);
      if (size > MAX_FILE) skipped.push(rel + ' (' + Math.round(size / 1048576) + ' MB, too large)');
      else outputs[rel] = FS.readFile(p);
    });
    return { stdout: cap(r.out), stderr: cap(r.err), exitCode: r.code, outputFiles: outputs, skipped: skipped };
  }

  return { run: run, ensurePython: ensurePython, tokenize: tokenize };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createSkillEngine: createSkillEngine };
