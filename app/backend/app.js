// The dashboard backend's request handler. Phase 2 step 1: it serves the
// frontend, /healthz and /api/info. Only the demo mode exists, so nothing here
// can reach Home Assistant.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export const MODES = ['demo'];

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
  if (Object.keys(env).some((key) => /^(HASS|HOME_ASSISTANT)_/.test(key))) {
    throw new Error('a Home Assistant setting is present; the demo refuses to start with one');
  }
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a port number');
  return { mode, port, root: resolve(env.STATIC_DIR || new URL('../frontend', import.meta.url).pathname) };
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(res.req.method === 'HEAD' ? undefined : body);
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

export function createHandler({ mode, root }) {
  // The frontend names its own build (Settings, About); this says what the server runs.
  const info = JSON.stringify({ mode });
  return async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'text/plain; charset=utf-8', 'method not allowed\n', { Allow: 'GET, HEAD' });
    }
    if (pathname === '/healthz') return send(res, 200, 'text/plain; charset=utf-8', 'ok\n');
    if (pathname === '/api/info') return send(res, 200, TYPES['.json'], info);
    if (pathname.startsWith('/api/')) return send(res, 404, TYPES['.json'], '{"error":"not found"}');

    const file = resolvePath(root, pathname);
    const found = file && await stat(file).catch(() => null);
    if (!found || !found.isFile()) return send(res, 404, 'text/plain; charset=utf-8', 'not found\n');
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Length': found.size,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
}
