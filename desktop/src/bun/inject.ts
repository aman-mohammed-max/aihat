/**
 * The script the desktop app puts at the top of the page, before the app's own code runs. It makes the web build
 * behave like the phone app in the ways a web page normally can't:
 *
 *  - requests to other sites (AI endpoints, MCP servers, marketplaces) go through the local backend, so the
 *    browser's cross-site (CORS) limits don't apply; a server that can't be reached still fails the way fetch does
 *  - the app's own /api calls carry the per-launch token
 *  - links and window.open go to the system browser instead of replacing the app inside the window
 *  - files dropped on the window are handed to the app instead of opening in the window
 */
const CLIENT = String.raw`(function (cfg) {
  var origin = location.origin;
  var realFetch = window.fetch.bind(window);
  window.__AIHAT__ = { desktop: true, platform: cfg.platform, version: cfg.version };

  function post(path, body) {
    return realFetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aihat-token': cfg.token }, body: JSON.stringify(body) });
  }
  function openOutside(href) {
    post('/api/open', { url: href }).catch(function () {});
  }

  window.fetch = function (input, init) {
    var raw = typeof input === 'string' ? input : input && typeof input.url === 'string' ? input.url : String(input);
    var u;
    try { u = new URL(raw, location.href); } catch (e) { return realFetch(input, init); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return realFetch(input, init);
    var req = new Request(typeof input === 'string' || input instanceof URL ? u.href : input, init);
    var headers = new Headers(req.headers);
    headers.set('x-aihat-token', cfg.token);
    if (u.origin === origin) {
      if (u.pathname.indexOf('/api/') !== 0) return realFetch(input, init);
      return realFetch(new Request(req, { headers: headers }));
    }
    var bodyless = req.method === 'GET' || req.method === 'HEAD';
    return (bodyless ? Promise.resolve(undefined) : req.arrayBuffer()).then(function (body) {
      return realFetch('/proxy?url=' + encodeURIComponent(u.href), { method: req.method, headers: headers, body: body, signal: req.signal, cache: 'no-store' });
    }).then(function (res) {
      if (res.headers.get('x-aihat-proxy-error')) {
        return res.text().then(function (msg) { throw new TypeError('Network request failed: ' + msg); });
      }
      try { Object.defineProperty(res, 'url', { value: res.headers.get('x-aihat-url') || u.href }); } catch (e) {}
      return res;
    });
  };

  window.open = function (url) {
    if (!url) return null;
    try {
      var u = new URL(String(url), location.href);
      if (u.origin !== origin) openOutside(u.href);
    } catch (e) {}
    return null;
  };

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el || !el.href) return;
    var u;
    try { u = new URL(el.href, location.href); } catch (err) { return; }
    if (u.origin === origin || !/^(https?|mailto):$/.test(u.protocol)) return;
    e.preventDefault();
    openOutside(u.href);
  });

  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
})`;

export type BootConfig = { token: string; platform: string; version: string };

export function bootstrap(cfg: BootConfig) {
  // `<` is escaped so nothing in the values can end the script element early.
  return `<script>${CLIENT}(${JSON.stringify(cfg).replace(/</g, '\\u003c')});</script>`;
}
