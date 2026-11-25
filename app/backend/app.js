// The dashboard backend's request handler: the frontend, /healthz, /api/info,
// /api/me, with OIDC on the sign-in routes and, in live mode, the read-only
// Home Assistant status and registry (/api/ha, /api/ha/registry).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { NOTICE_CSP, notice } from './notice.js';

export const MODES = ['demo', 'live'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

// The page sets its own Content-Security-Policy in a meta tag. These are the
// parts a meta tag cannot express, plus the usual hardening headers.
// no-cache: always ask whether a file changed, so a wall tablet never runs an old build.
const HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-cache',
};

/** Read the settings from the environment. Throws on anything not allowed. */
export function settings(env) {
  const mode = env.DASHBOARD_MODE || 'demo';
  if (!MODES.includes(mode)) throw new Error(`DASHBOARD_MODE must be one of: ${MODES.join(', ')}`);
  // A demo must not hold a Home Assistant credential, not even an unused one.
  if (mode === 'demo' && Object.keys(env).some((key) => /^(HASS|HOME_ASSISTANT)_/.test(key))) {
    throw new Error('a Home Assistant setting is present; the demo refuses to start with one');
  }
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a port number');
  // No HOST: Node's default, every interface (IPv6 when the kernel has it).
  const host = env.HOST || undefined;
  // Live data never goes out without sign-in, except to this machine itself.
  if (mode === 'live' && (env.AUTH_MODE || 'none') === 'none' && !['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('live mode needs AUTH_MODE=oidc, or HOST=127.0.0.1 for local development');
  }
  return { mode, port, host, root: resolve(env.STATIC_DIR || new URL('../frontend', import.meta.url).pathname) };
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

// A page a browser may land on is styled like the rest of the site.
const page = (res, status, title, body) => send(res, status, TYPES['.html'], notice(title, body, { link: 'toDashboard', href: '/' }),
  { 'Content-Security-Policy': NOTICE_CSP, 'Cache-Control': 'no-store' });

// Live states to the browser as server-sent events (EventSource works in
// Safari 15): "states" with every state first and after a reconnect to Home
// Assistant, then "change" with what changed. A comment line keeps proxies from
// closing a quiet stream. Capped, as every open tab holds one. `allowed()` is
// asked before every write, so a removed device or an ended session stops
// receiving at once instead of keeping an open stream.
const STREAM_MAX = 20;
const KEEPALIVE_MS = 25_000;
let streams = 0;

function stream(req, res, ha, allowed) {
  if (streams >= STREAM_MAX) return send(res, 503, TYPES['.json'], '{"error":"too many streams"}');
  streams += 1;
  res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  let stop = () => {};
  let keepalive = null;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    streams -= 1;
    stop();
    clearInterval(keepalive);
  };
  const out = (text) => {
    if (!open) return;
    if (!allowed()) {
      close();
      return res.end();
    }
    res.write(text);
  };
  const write = (event, data) => out(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const all = ha.states();
  if (all) write('states', all);
  stop = ha.onChange((change) => (change.reset ? write('states', change.set) : write('change', { set: change.set, remove: change.remove })));
  keepalive = setInterval(() => out(': keepalive\n\n'), KEEPALIVE_MS);
  req.on('close', close);
  res.on('close', close);
}

/** The file a URL path names inside root, or null when it would leave root. */
export function resolvePath(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const file = resolve(join(root, path.endsWith('/') ? `${path}index.html` : path));
  return file === root || file.startsWith(root + sep) ? file : null;
}

// Open without a session: the page that offers sign-in or pairing, the pairing
// page and what they load. None of them holds dashboard data.
export const PUBLIC_PATHS = new Set(['/welcome.html', '/pair.html', '/js/pair.js', '/css/tokens.css', '/css/pair.css']);

/**
 * `auth` is null (no sign-in: the local demo) or the object from createAuth().
 * With it, everything but /healthz, the sign-in routes and PUBLIC_PATHS needs a
 * person or a paired device.
 */
export function createHandler({ mode, root, auth = null, ha = null, energy = null, configStore = null, log = console }) {
  // The frontend names its own build (Settings, About); this says what the server runs.
  const info = JSON.stringify({ mode, auth: auth ? 'oidc' : 'none' });
  async function serve(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const read = req.method === 'GET' || req.method === 'HEAD';
    if (pathname === '/healthz' && read) return send(res, 200, 'text/plain; charset=utf-8', 'ok\n');
    if (auth && await auth.handle(req, res, url)) return;
    const who = auth ? auth.session(req, res) : null;
    if (auth && !who && !(read && PUBLIC_PATHS.has(pathname))) {
      if (pathname.startsWith('/api/') || !read) return send(res, 401, TYPES['.json'], '{"error":"sign in"}');
      res.writeHead(302, { ...HEADERS, 'Cache-Control': 'no-store', Location: '/welcome.html' });
      return res.end();
    }
    if (who && await auth.handleApi(req, res, url, who)) return;
    if (who && configStore && await configStore.handle(req, res, url, who, auth.foreign)) return;
    if (!read) return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed\n', { Allow: 'GET, HEAD' });
    if (pathname === '/api/info') return send(res, 200, TYPES['.json'], info);
    if (pathname === '/api/me') {
      const me = who ? { signedIn: true, via: 'oidc', kind: who.kind, name: who.name } : { signedIn: false, via: 'none' };
      return send(res, 200, TYPES['.json'], JSON.stringify(me), { 'Cache-Control': 'no-store' });
    }
    if (ha && pathname === '/api/ha') return send(res, 200, TYPES['.json'], JSON.stringify(ha.status()), { 'Cache-Control': 'no-store' });
    if (ha && pathname === '/api/ha/states') {
      const all = ha.states();
      if (!all) return send(res, 503, TYPES['.json'], '{"error":"not loaded"}', { 'Cache-Control': 'no-store' });
      return send(res, 200, TYPES['.json'], JSON.stringify(all), { 'Cache-Control': 'no-store' });
    }
    if (ha && pathname === '/api/ha/stream') return stream(req, res, ha, () => !auth || Boolean(auth.session(req)));
    if (ha && pathname === '/api/ha/registry') {
      const registry = ha.registry();
      if (!registry) return send(res, 503, TYPES['.json'], '{"error":"not loaded"}', { 'Cache-Control': 'no-store' });
      return send(res, 200, TYPES['.json'], JSON.stringify(registry), { 'Cache-Control': 'no-store' });
    }
    if (energy && pathname === '/api/ha/energy') {
      const snap = energy.snapshot();
      if (!snap) return send(res, 503, TYPES['.json'], '{"error":"not loaded"}', { 'Cache-Control': 'no-store' });
      return send(res, 200, TYPES['.json'], JSON.stringify(snap), { 'Cache-Control': 'no-store' });
    }
    if (pathname.startsWith('/api/')) return send(res, 404, TYPES['.json'], '{"error":"not found"}');

    const file = resolvePath(root, pathname);
    const found = file && await stat(file).catch(() => null);
    if (!found || !found.isFile()) return page(res, 404, 'notFoundTitle', 'notFoundBody');
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Length': found.size,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  // One failing request (a full disk, a bug) answers 500 instead of taking the
  // process down. Only the error's name is logged: messages can carry values.
  return function handle(req, res) {
    return serve(req, res).catch((error) => {
      log.error(`request failed (${error.code || error.name})`);
      if (res.headersSent) return res.destroy();
      if (req.url.startsWith('/api/')) return send(res, 500, TYPES['.json'], '{"error":"error"}');
      return page(res, 500, 'errorTitle', 'errorBody');
    });
  };
}
