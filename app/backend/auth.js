// Sign-in. People: OpenID Connect, authorization code flow with PKCE, a nonce
// and a state bound to the browser by a cookie. Devices (a wall tablet): a
// pairing code that a signed-in person approves. The backend keeps every
// session; the browser holds only a random id in an HttpOnly cookie. No token
// from the identity provider is kept, logged or sent to the browser.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as oauth from 'oauth4webapi';
import { NOTICE_CSP, notice } from './notice.js';

const LOGIN_TTL = 10 * 60 * 1000;
const PAIR_TTL = 5 * 60 * 1000;
const MAX_PENDING = 200;
const MAX_PAIRING = 50;
// Failed approvals per person per pairing window: with 32^8 codes this keeps a
// guess out of reach, and a typo or two costs nothing.
const MAX_MISSES = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
  const dataDir = env.DATA_DIR || '/data';
  return { mode, issuer, publicUrl, clientId: env.OIDC_CLIENT_ID, clientSecret: env.OIDC_CLIENT_SECRET, sessionMs: hours * 3600 * 1000, dataDir };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

/** A pairing code as typed: case and separators do not matter. */
export const normalizeCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

function readJson(req, limit = 2048) {
  return new Promise((done) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on('end', () => {
      try {
        done(JSON.parse(body));
      } catch {
        done(null);
      }
    });
    req.on('error', () => done(null));
  });
}

const HOME = { link: 'toDashboard', href: '/' };
const html = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': NOTICE_CSP };

/**
 * The sign-in routes, the session check and the device API. `devices` is from
 * createDevices(). `insecure` allows plain http to the identity provider and
 * drops the Secure cookie flag; tests only.
 */
export function createAuth({ issuer, publicUrl, clientId, clientSecret, devices, sessionMs = 12 * 3600 * 1000, insecure = false, now = Date.now, log = console }) {
  const client = { client_id: clientId };
  const clientAuth = oauth.ClientSecretBasic(clientSecret);
  const redirectUri = new URL('/auth/callback', publicUrl).href;
  const options = insecure ? { [oauth.allowInsecureRequests]: true } : {};
  const secure = !insecure;
  const name = (base) => (secure ? `__Host-${base}` : base);
  const SESSION = name('hhd_session');
  const LOGIN = name('hhd_login');
  const PAIR = name('hhd_pair');
  const DEVICE = name('hhd_device');
  const pending = new Map();
  const sessions = new Map();
  const pairing = new Map(); // hash of the tablet's pairing secret -> { code, expires, approved }
  const misses = new Map(); // person session hash -> { count, until }
  let server = null;

  async function discover() {
    if (!server) server = await oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer, { ...options, algorithm: 'oidc' }));
    return server;
  }

  const cookie = (key, value, maxAge) => `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  function prune() {
    const t = now();
    for (const map of [pending, sessions, pairing]) for (const [key, value] of map) if (value.expires <= t) map.delete(key);
    for (const [key, value] of misses) if (value.until <= t) misses.delete(key);
  }

  /** Who is asking: a person, a paired device, or null. A device's use may renew its cookie. */
  function session(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const id = cookies[SESSION];
    const person = id && sessions.get(hash(id));
    if (person && person.expires > now()) return { ...person, key: hash(id) };
    const found = devices.check(cookies[DEVICE]);
    if (!found) return null;
    if (found.touched && res) res.setHeader('Set-Cookie', cookie(DEVICE, cookies[DEVICE], Math.floor(devices.ttlMs / 1000)));
    return { kind: 'device', name: found.device.name, id: found.device.id };
  }

  function send(res, status, headers, body = '') {
    res.writeHead(status, {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      // Nothing may load, except where a notice page sets its own policy.
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...headers,
    });
    res.end(body);
  }
  const json = (res, status, value, headers = {}) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }, JSON.stringify(value));
  const fail = (res, status = 400) => send(res, status, html, notice('failedTitle', 'failedBody'));
  // A state-changing request from another site is refused. SameSite=Lax already
  // keeps the cookies off it; this also covers requests that carry none.
  const foreign = (req) => Boolean(req.headers.origin) && req.headers.origin !== publicUrl.origin;

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
    if (foreign(req)) return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'forbidden\n');
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[SESSION]) sessions.delete(hash(cookies[SESSION]));
    // A device signs out by being removed under Settings, not here: a child
    // pressing "sign out" on the wall tablet should not undo the pairing.
    send(res, 204, { 'Set-Cookie': cookie(SESSION, '', 0) });
  }

  /** The tablet asks for a code. Its pairing secret goes into a cookie only it holds. */
  function pairStart(req, res) {
    if (foreign(req)) return json(res, 403, { error: 'forbidden' });
    prune();
    while (pairing.size >= MAX_PAIRING) pairing.delete(pairing.keys().next().value);
    let code = newCode();
    const codes = new Set([...pairing.values()].map((p) => p.code));
    while (codes.has(code)) code = newCode();
    const secret = randomBytes(32).toString('base64url');
    pairing.set(hash(secret), { code, expires: now() + PAIR_TTL, approved: null });
    json(res, 200, { code, expiresIn: PAIR_TTL / 1000 }, { 'Set-Cookie': cookie(PAIR, secret, PAIR_TTL / 1000) });
  }

  /** The tablet waits. Once approved, the device session is made here, for the browser that holds the secret. */
  function pairPoll(req, res) {
    prune();
    const secret = parseCookies(req.headers.cookie)[PAIR];
    const key = secret && hash(secret);
    const entry = key && pairing.get(key);
    if (!entry) return json(res, 200, { status: 'expired' });
    if (!entry.approved) return json(res, 200, { status: 'pending' });
    pairing.delete(key);
    const { token } = devices.add(entry.approved);
    json(res, 200, { status: 'approved' }, {
      'Set-Cookie': [cookie(DEVICE, token, Math.floor(devices.ttlMs / 1000)), cookie(PAIR, '', 0)],
    });
  }

  async function approve(req, res, who) {
    const miss = misses.get(who.key);
    if (miss && miss.count >= MAX_MISSES && miss.until > now()) return json(res, 429, { error: 'too many tries' });
    const body = await readJson(req);
    const code = normalizeCode(body && body.code);
    const label = String((body && body.name) || '').trim().slice(0, 40);
    if (!label) return json(res, 400, { error: 'name' });
    prune();
    const entry = [...pairing.values()].find((p) => p.code === code && !p.approved);
    if (!entry) {
      const m = miss && miss.until > now() ? miss : { count: 0, until: now() + PAIR_TTL };
      m.count += 1;
      misses.set(who.key, m);
      return json(res, 404, { error: 'code' });
    }
    entry.approved = label;
    json(res, 200, { ok: true });
  }

  /** Handles /auth/*. Returns true when the request was answered. */
  async function handle(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /auth/login') return login(req, res).then(() => true);
    if (route === 'GET /auth/callback') return callback(req, res, url).then(() => true);
    if (route === 'POST /auth/logout') return logout(req, res), true;
    if (route === 'POST /auth/pair/start') return pairStart(req, res), true;
    if (route === 'GET /auth/pair/poll') return pairPoll(req, res), true;
    if (route === 'GET /auth/signed-out') {
      return send(res, 200, html, notice('signedOutTitle', 'signedOutBody')), true;
    }
    if (url.pathname.startsWith('/auth/')) return send(res, 404, html, notice('notFoundTitle', 'notFoundBody', HOME)), true;
    return false;
  }

  /**
   * /api/devices for a signed-in person. A device session may not pair or
   * remove devices. Returns true when the request was answered.
   */
  async function handleApi(req, res, url, who) {
    if (!url.pathname.startsWith('/api/devices')) return false;
    if (who.kind !== 'person') return json(res, 403, { error: 'a person must be signed in' }), true;
    if (req.method !== 'GET' && foreign(req)) return json(res, 403, { error: 'forbidden' }), true;
    if (req.method === 'GET' && url.pathname === '/api/devices') return json(res, 200, { devices: devices.list() }), true;
    if (req.method === 'POST' && url.pathname === '/api/devices/approve') return approve(req, res, who).then(() => true);
    const m = /^\/api\/devices\/([\w-]{1,32})$/.exec(url.pathname);
    if (req.method === 'DELETE' && m) return json(res, devices.revoke(m[1]) ? 200 : 404, {}), true;
    return json(res, 404, { error: 'not found' }), true;
  }

  return { handle, handleApi, session, sessionCount: () => sessions.size };
}
