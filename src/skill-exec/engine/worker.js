/*
 * The Web Worker that runs skill scripts on a phone. It is created from a blob by the runner page, so it inherits the
 * page's Content-Security-Policy, and it switches off every way to reach the network before any script runs.
 * Files (Pyodide, packages, libraries) come from the page, which keeps them in IndexedDB.
 * engine.js is prepended to this file by scripts/embed-skill-engine.mjs.
 */
/* eslint-disable */
(function () {
  'use strict';
  var LOCAL = 'https://runtime.aihat.invalid/';
  var asked = {};
  var seq = 0;
  var engine = null;
  var manifest = null;

  function need(name) {
    return new Promise(function (resolve) {
      var id = ++seq;
      asked[id] = resolve;
      self.postMessage({ kind: 'need', reqId: id, name: name });
    });
  }

  // No internet: fetch only answers for the runtime's own files; the other ways out are removed.
  self.fetch = function (input) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    if (url.indexOf(LOCAL) !== 0) return Promise.reject(new TypeError('Skill scripts have no internet access on this phone'));
    var name = decodeURIComponent(url.slice(LOCAL.length).split('?')[0]);
    return need(name).then(function (bytes) {
      if (!bytes) return new Response('', { status: 404, statusText: 'Not found' });
      return new Response(bytes, { status: 200, headers: { 'Content-Type': /\.wasm$/.test(name) ? 'application/wasm' : /\.json$/.test(name) ? 'application/json' : 'application/octet-stream' } });
    });
  };
  ['XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection'].forEach(function (k) {
    try {
      Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false });
    } catch (e) {
      try {
        self[k] = undefined;
      } catch (e2) {}
    }
  });

  function blobUrl(text) {
    return URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  }

  async function boot(m) {
    var t0 = Date.now();
    manifest = m.manifest;
    importScripts(blobUrl(m.loader));
    var mod;
    try {
      mod = await import(blobUrl(m.core));
    } catch (e) {
      throw new Error('This phone’s web engine could not load Python (' + (e && e.message ? e.message : e) + ').');
    }
    var py = await self.loadPyodide({ indexURL: LOCAL, packageBaseUrl: LOCAL, createPyodideModule: mod.default, stdout: function () {}, stderr: function () {} });
    // Nothing else may load code from outside after this.
    self.importScripts = function () {
      throw new Error('Loading scripts is not allowed here');
    };
    var libs = {};
    engine = createSkillEngine({
      pyodide: py,
      needs: manifest.needs,
      bundled: manifest.bundled,
      installWheels: function (p) {
        return p.loadPackage(manifest.wheels.map(function (n) { return LOCAL + n; }), { messageCallback: function () {}, errorCallback: function () {} });
      },
      loadJsLib: function (name) {
        var lib = manifest.js[name];
        if (!lib) return Promise.reject(new Error('unknown library ' + name));
        if (libs[name]) return Promise.resolve(libs[name]);
        return need(lib.file).then(function (bytes) {
          if (!bytes) throw new Error(name + ' is missing; download the add-on again');
          var src = new TextDecoder().decode(bytes);
          var load = new Function('process', 'require', 'module', 'exports', src + '\n;return typeof ' + lib.global + " !== 'undefined' ? " + lib.global + ' : self.' + lib.global + ';');
          libs[name] = load(undefined, undefined, undefined, undefined);
          return libs[name];
        });
      },
    });
    return Date.now() - t0;
  }

  self.onmessage = function (e) {
    var m = e.data;
    if (m.kind === 'file') {
      var r = asked[m.reqId];
      delete asked[m.reqId];
      if (r) r(m.bytes ? new Uint8Array(m.bytes) : null);
      return;
    }
    if (m.kind === 'boot') {
      boot(m).then(
        function (ms) { self.postMessage({ kind: 'ready', ms: ms }); },
        function (err) { self.postMessage({ kind: 'fatal', message: err && err.message ? err.message : String(err) }); },
      );
      return;
    }
    if (m.kind === 'run') {
      var t0 = Date.now();
      engine.run(m.job).then(function (res) {
        res.durationMs = Date.now() - t0;
        var transfer = Object.keys(res.outputFiles).map(function (k) { return res.outputFiles[k].buffer; });
        self.postMessage({ kind: 'done', id: m.id, result: res }, transfer);
      });
    }
  };
})();
