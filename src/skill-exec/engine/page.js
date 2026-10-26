/*
 * The hidden runner page on phones (inside a 1×1 WebView). It keeps the downloaded runtime in IndexedDB, starts the
 * worker that runs scripts, enforces timeouts by stopping the worker, and talks to the app over postMessage.
 * WORKER_SRC is filled in by scripts/embed-skill-engine.mjs.
 */
/* eslint-disable */
(function () {
  'use strict';
  var WORKER_SRC = '__WORKER_SRC__';
  var db = null;
  var worker = null;
  var workerReady = null;
  var bootMs = 0;
  var current = null;
  var parts = {};

  function send(m) {
    window.ReactNativeWebView.postMessage(JSON.stringify(m));
  }

  // ---------- base64 (fast, table based) ----------
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var LOOK = new Uint8Array(256);
  for (var i = 0; i < ABC.length; i++) LOOK[ABC.charCodeAt(i)] = i;
  function fromB64(s) {
    var n = s.length;
    var pad = s[n - 1] === '=' ? (s[n - 2] === '=' ? 2 : 1) : 0;
    var out = new Uint8Array((n * 3) / 4 - pad);
    for (var a = 0, b = 0; a < n; a += 4) {
      var x = (LOOK[s.charCodeAt(a)] << 18) | (LOOK[s.charCodeAt(a + 1)] << 12) | (LOOK[s.charCodeAt(a + 2)] << 6) | LOOK[s.charCodeAt(a + 3)];
      if (b < out.length) out[b++] = x >> 16;
      if (b < out.length) out[b++] = (x >> 8) & 255;
      if (b < out.length) out[b++] = x & 255;
    }
    return out;
  }
  function toB64(u) {
    var s = '';
    for (var k = 0; k < u.length; k += 32768) s += String.fromCharCode.apply(null, u.subarray(k, k + 32768));
    return btoa(s);
  }

  // ---------- IndexedDB: file bytes and their checksums ----------
  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open('aihat-runtime', 1);
      r.onupgradeneeded = function () {
        r.result.createObjectStore('files');
        r.result.createObjectStore('meta');
      };
      r.onsuccess = function () {
        db = r.result;
        resolve(db);
      };
      r.onerror = function () { reject(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode);
        var out = fn(t);
        t.oncomplete = function () { resolve(out && 'result' in out ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('storage aborted')); };
      });
    });
  }
  function getFile(name) {
    return tx(['files'], 'readonly', function (t) { return t.objectStore('files').get(name); });
  }
  function putFile(name, sha, bytes) {
    return tx(['files', 'meta'], 'readwrite', function (t) {
      t.objectStore('files').put(bytes, name);
      t.objectStore('meta').put(sha, name);
    });
  }
  function listMeta() {
    return openDb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var have = {};
        var c = d.transaction('meta', 'readonly').objectStore('meta').openCursor();
        c.onsuccess = function () {
          var cur = c.result;
          if (!cur) return resolve(have);
          have[cur.key] = cur.value;
          cur.continue();
        };
        c.onerror = function () { reject(c.error); };
      });
    });
  }
  function clearAll() {
    return tx(['files', 'meta'], 'readwrite', function (t) {
      t.objectStore('files').clear();
      t.objectStore('meta').clear();
    });
  }

  // ---------- the worker ----------
  function kill() {
    if (worker) worker.terminate();
    worker = null;
    workerReady = null;
  }

  function ensureWorker(manifest) {
    if (workerReady) return workerReady;
    workerReady = new Promise(function (resolve, reject) {
      var w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
      worker = w;
      w.onmessage = function (e) {
        var m = e.data;
        if (m.kind === 'need') {
          getFile(m.name).then(
            function (bytes) {
              var buf = bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : null;
              w.postMessage({ kind: 'file', reqId: m.reqId, bytes: buf }, buf ? [buf] : []);
            },
            function () { w.postMessage({ kind: 'file', reqId: m.reqId, bytes: null }); },
          );
        } else if (m.kind === 'ready') {
          bootMs = m.ms;
          resolve(m.ms);
        } else if (m.kind === 'fatal') {
          kill();
          reject(new Error(m.message));
        } else if (m.kind === 'done' && current && current.id === m.id) {
          finish(m.result);
        }
      };
      w.onerror = function (e) {
        var msg = (e && e.message) || 'The script runner stopped unexpectedly';
        if (current) finish({ stdout: '', stderr: msg + '\n', exitCode: 1, outputFiles: {}, skipped: [] });
        kill();
        reject(new Error(msg));
      };
      Promise.all([getFile('pyodide.js'), getFile('pyodide.asm.mjs')]).then(function (f) {
        if (!f[0] || !f[1]) throw new Error('The add-on’s files are missing. Download it again.');
        var td = new TextDecoder();
        w.postMessage({ kind: 'boot', loader: td.decode(f[0]), core: td.decode(f[1]), manifest: manifest });
      }).catch(function (err) {
        kill();
        reject(err);
      });
    });
    return workerReady;
  }

  function finish(result) {
    var c = current;
    if (!c) return;
    current = null;
    clearTimeout(c.timer);
    var files = {};
    Object.keys(result.outputFiles || {}).forEach(function (k) { files[k] = toB64(new Uint8Array(result.outputFiles[k])); });
    send({ t: 'result', id: c.id, result: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, outputFiles: files, skipped: result.skipped || [], durationMs: Date.now() - c.started } });
  }

  function decodeFiles(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (k) { out[k] = fromB64(map[k]); });
    return out;
  }

  function onMessage(raw) {
    var m;
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!m || !m.t) return;
    if (m.t === 'hello') {
      listMeta().then(function (have) { send({ t: 'hello', have: have }); }, function (e) { send({ t: 'hello', have: {}, error: String(e) }); });
    } else if (m.t === 'put') {
      var p = (parts[m.name] = parts[m.name] || []);
      p[m.i] = m.data;
      var got = p.filter(function (x) { return x !== undefined; }).length;
      if (got === m.n) {
        var bytes = fromB64(p.join(''));
        delete parts[m.name];
        putFile(m.name, m.sha, bytes).then(
          function () { send({ t: 'put-ok', name: m.name }); },
          function (e) { send({ t: 'put-error', name: m.name, error: String(e && e.message ? e.message : e) }); },
        );
      } else send({ t: 'part-ok', name: m.name, i: m.i });
    } else if (m.t === 'prune') {
      // Files of an older version of the add-on.
      listMeta().then(function (have) {
        var gone = Object.keys(have).filter(function (n) { return m.keep.indexOf(n) < 0; });
        return tx(['files', 'meta'], 'readwrite', function (t2) {
          gone.forEach(function (n) {
            t2.objectStore('files').delete(n);
            t2.objectStore('meta').delete(n);
          });
        });
      }).then(function () { send({ t: 'pruned' }); }, function () { send({ t: 'pruned' }); });
    } else if (m.t === 'drop') {
      kill();
      clearAll().then(function () { send({ t: 'dropped' }); });
    } else if (m.t === 'warm') {
      var cold = !workerReady;
      var t0 = Date.now();
      ensureWorker(m.manifest).then(
        function () { send({ t: 'warm', ms: cold ? Date.now() - t0 : 0, cold: cold, bootMs: bootMs }); },
        function (e) { send({ t: 'warm', error: String(e && e.message ? e.message : e) }); },
      );
    } else if (m.t === 'run') {
      if (current) {
        send({ t: 'result', id: m.id, result: { stdout: '', stderr: 'Another script is still running.\n', exitCode: 1, outputFiles: {}, skipped: [], durationMs: 0 } });
        return;
      }
      var started = Date.now();
      var job = { command: m.job.command, skill: m.job.skill, skillFiles: decodeFiles(m.job.skillFiles), files: decodeFiles(m.job.files) };
      current = { id: m.id, started: started, timer: null };
      var mine = current;
      ensureWorker(m.manifest).then(
        function () {
          if (current !== mine) return;
          mine.timer = setTimeout(function () {
            if (current !== mine) return;
            kill();
            finish({ stdout: '', stderr: 'Stopped: the script ran longer than ' + Math.round(m.timeoutMs / 1000) + ' seconds.\n', exitCode: 124, outputFiles: {}, skipped: [] });
          }, m.timeoutMs);
          worker.postMessage({ kind: 'run', id: m.id, job: job });
        },
        function (e) {
          finish({ stdout: '', stderr: String(e && e.message ? e.message : e) + '\n', exitCode: 1, outputFiles: {}, skipped: [] });
        },
      );
    } else if (m.t === 'cancel') {
      if (current && current.id === m.id) {
        kill();
        finish({ stdout: '', stderr: 'Stopped by you.\n', exitCode: 130, outputFiles: {}, skipped: [] });
      }
    }
  }

  window.addEventListener('message', function (e) { onMessage(e.data); });
  document.addEventListener('message', function (e) { onMessage(e.data); });
  send({ t: 'loaded' });
})();
