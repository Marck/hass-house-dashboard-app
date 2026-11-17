// Sign-in with OpenID Connect: authorization code flow with PKCE, a nonce and a
// state bound to the browser by a cookie. The backend keeps the session; the
// browser only holds a random id in an HttpOnly cookie. No token from the
// identity provider is kept, logged or sent to the browser.
import { createHash, randomBytes } from 'node:crypto';
import * as oauth from 'oauth4webapi';

const LOGIN_TTL = 10 * 60 * 1000;
const MAX_PENDING = 200;
const hash = (id) => createHash('sha256').update(id).digest('base64url');

/** Read the OIDC settings. Throws on anything missing or unsafe. */
export function authSettings(env) {
  const mode = env.AUTH_MODE || 'none';
  if (mode === 'none') return { mode };
  if (mode !== 'oidc') throw new Error('AUTH_MODE must be none or oidc');
  const missing = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'PUBLIC_URL'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`AUTH_MODE=oidc needs ${missing.join(', ')}`);
  const issuer = new URL(env.OIDC_ISSUER);
  const publicUrl = new URL(env.PUBLIC_URL);
  if (issuer.protocol !== 'https:' || publicUrl.protocol !== 'https:') throw new Error('OIDC_ISSUER and PUBLIC_URL must use https');
  const hours = Number(env.SESSION_HOURS || 12);
  if (!(hours > 0 && hours <= 24 * 7)) throw new Error('SESSION_HOURS must be between 0 and 168');
  return { mode, issuer, publicUrl, clientId: env.OIDC_CLIENT_ID, clientSecret: env.OIDC_CLIENT_SECRET, sessionMs: hours * 3600 * 1000 };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

const PAGE = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="/auth/login">Sign in</a></p></main></body></html>`;

/**
 * The sign-in routes and the session check. `insecure` allows plain http to the
 * identity provider and drops the Secure cookie flag; tests only.
 */
export function createAuth({ issuer, publicUrl, clientId, clientSecret, sessionMs = 12 * 3600 * 1000, insecure = false, now = Date.now, log = console }) {
  const client = { client_id: clientId };
  const clientAuth = oauth.ClientSecretBasic(clientSecret);
  const redirectUri = new URL('/auth/callback', publicUrl).href;
  const options = insecure ? { [oauth.allowInsecureRequests]: true } : {};
  const secure = !insecure;
  const name = (base) => (secure ? `__Host-${base}` : base);
  const SESSION = name('hhd_session');
  const LOGIN = name('hhd_login');
  const pending = new Map();
  const sessions = new Map();
  let server = null;

  async function discover() {
    if (!server) server = await oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer, { ...options, algorithm: 'oidc' }));
    return server;
  }

  const cookie = (key, value, maxAge) => `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  function prune() {
    const t = now();
    for (const [key, value] of pending) if (value.expires <= t) pending.delete(key);
    for (const [key, value] of sessions) if (value.expires <= t) sessions.delete(key);
  }

  function session(req) {
    const id = parseCookies(req.headers.cookie)[SESSION];
    if (!id) return null;
    const found = sessions.get(hash(id));
    if (!found || found.expires <= now()) return null;
    return found;
  }

  function send(res, status, headers, body = '') {
    res.writeHead(status, {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      // These pages have no script, style or image: nothing may load.
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...headers,
    });
    res.end(body);
  }
  const fail = (res, status = 400) => send(res, status, { 'Content-Type': 'text/html; charset=utf-8' },
    PAGE('Sign-in failed', 'The sign-in did not complete. Please try again.'));

  async function login(req, res) {
    prune();
    let as;
    try {
      as = await discover();
    } catch (error) {
      log.warn(`sign-in: identity provider not reachable (${error.code || error.name})`);
      return fail(res, 503);
    }
    // An anonymous visitor can start logins; the oldest unfinished one goes first.
    while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
    const state = oauth.generateRandomState();
    const nonce = oauth.generateRandomNonce();
    const verifier = oauth.generateRandomCodeVerifier();
    pending.set(state, { nonce, verifier, expires: now() + LOGIN_TTL });
    const url = new URL(as.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'openid profile',
      state, nonce, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
    }).toString();
    send(res, 302, { Location: url.href, 'Set-Cookie': cookie(LOGIN, state, LOGIN_TTL / 1000) });
  }

  async function callback(req, res, url) {
    prune();
    const state = parseCookies(req.headers.cookie)[LOGIN];
    const started = state && pending.get(state);
    // The state must be the one this browser started, and is used once.
    if (!started || url.searchParams.get('state') !== state) return fail(res);
    pending.delete(state);
    try {
      const as = await discover();
      const params = oauth.validateAuthResponse(as, client, url.searchParams, state);
      const response = await oauth.authorizationCodeGrantRequest(as, client, clientAuth, params, redirectUri, started.verifier, options);
      const result = await oauth.processAuthorizationCodeResponse(as, client, response, { expectedNonce: started.nonce, requireIdToken: true });
      const claims = oauth.getValidatedIdTokenClaims(result);
      const id = randomBytes(32).toString('base64url');
      const label = String(claims.name || claims.preferred_username || '').slice(0, 80);
      sessions.set(hash(id), { sub: claims.sub, name: label, kind: 'person', expires: now() + sessionMs });
      send(res, 303, { Location: '/', 'Set-Cookie': [cookie(SESSION, id, Math.floor(sessionMs / 1000)), cookie(LOGIN, '', 0)] });
    } catch (error) {
      // The error name only: messages can carry values from the provider.
      log.warn(`sign-in: rejected (${error.code || error.name})`);
      fail(res);
    }
  }

  function logout(req, res) {
    // A cross-site page cannot send the session cookie on a POST (SameSite=Lax);
    // a wrong Origin is refused as well.
    const origin = req.headers.origin;
    if (origin && origin !== publicUrl.origin) return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'forbidden\n');
    const id = parseCookies(req.headers.cookie)[SESSION];
    if (id) sessions.delete(hash(id));
    send(res, 204, { 'Set-Cookie': cookie(SESSION, '', 0) });
  }

  /** Handles /auth/*. Returns true when the request was answered. */
  async function handle(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /auth/login') return login(req, res).then(() => true);
    if (route === 'GET /auth/callback') return callback(req, res, url).then(() => true);
    if (route === 'POST /auth/logout') return logout(req, res), true;
    if (route === 'GET /auth/signed-out') {
      return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, PAGE('Signed out', 'You are signed out of the dashboard.')), true;
    }
    if (url.pathname.startsWith('/auth/')) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'not found\n'), true;
    return false;
  }

  return { handle, session, sessionCount: () => sessions.size };
}
