import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../../app/backend/app.js';
import { authSettings, createAuth, normalizeCode } from '../../app/backend/auth.js';
import { createDevices, jsonFile } from '../../app/backend/devices.js';

// A fake identity provider: discovery, an authorization step the test drives
// by hand, and a token endpoint that checks the client secret and PKCE.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const SECRET = randomBytes(16).toString('hex'); // made per run, so no secret-shaped value is in the file
const idp = { codes: new Map(), nonceOverride: null, tokenCalls: 0, accessToken: randomBytes(16).toString('hex') };
let idpServer;
let issuer;

function jwt(claims) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' });
  const body = b64(claims);
  return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

function idpHandler(req, res) {
  const url = new URL(req.url, issuer);
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/o/.well-known/openid-configuration') {
    return json(200, {
      issuer: issuer.href, authorization_endpoint: `${issuer.origin}/o/authorize`, token_endpoint: `${issuer.origin}/o/token`,
      jwks_uri: `${issuer.origin}/o/jwks`, response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'],
    });
  }
  if (url.pathname === '/o/token' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      idp.tokenCalls += 1;
      const form = new URLSearchParams(body);
      // RFC 6749 2.3.1: id and secret are form-encoded before Basic encoding.
      const basic = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      const [id, secret] = basic.split(':').map((part) => decodeURIComponent(part.replace(/\+/g, ' ')));
      if (id !== 'dashboard' || secret !== SECRET) return json(401, { error: 'invalid_client' });
      const code = idp.codes.get(form.get('code'));
      idp.codes.delete(form.get('code'));
      const challenge = createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
      if (!code || code.challenge !== challenge) return json(400, { error: 'invalid_grant' });
      const t = Math.floor(Date.now() / 1000);
      json(200, {
        access_token: idp.accessToken, token_type: 'Bearer', expires_in: 300,
        id_token: jwt({ iss: issuer.href, aud: 'dashboard', sub: 'user-1', name: 'Test Person', iat: t, exp: t + 300, nonce: idp.nonceOverride || code.nonce }),
      });
    });
    return undefined;
  }
  return json(404, {});
}

const site = mkdtempSync(join(tmpdir(), 'hhd-auth-'));
const warnings = [];
let devices;
let clock = Date.now();
let server;
let port;

before(async () => {
  idpServer = createServer(idpHandler);
  await new Promise((done) => idpServer.listen(0, '127.0.0.1', done));
  issuer = new URL(`http://127.0.0.1:${idpServer.address().port}/o/`);
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(site, 'welcome.html'), '<!doctype html><title>w</title>');
  writeFileSync(join(site, 'pair.html'), '<!doctype html><title>p</title>');
  devices = createDevices({ store: jsonFile(join(site, 'data', 'devices.json')), now: () => clock });
  const auth = createAuth({
    devices,
    issuer, publicUrl: new URL('http://dashboard.test'), clientId: 'dashboard', clientSecret: SECRET,
    sessionMs: 60_000, insecure: true, now: () => clock, log: { warn: (m) => warnings.push(m) },
  });
  server = createServer(createHandler({ mode: 'demo', root: site, auth }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(() => {
  server.close();
  idpServer.close();
  rmSync(site, { recursive: true, force: true });
});
beforeEach(() => {
  idp.nonceOverride = null;
  clock = Date.now();
});

function call(path, { method = 'GET', cookie = '', headers = {}, body } = {}) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { ...(cookie ? { cookie } : {}), ...headers } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const cookieOf = (res, name) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
const valueOf = (setCookie) => setCookie.split(';')[0];

/** Start a login and let the fake provider "sign the person in". */
async function startLogin() {
  const res = await call('/auth/login');
  assert.equal(res.status, 302);
  const to = new URL(res.headers.location);
  const q = to.searchParams;
  const code = `code-${Math.random()}`;
  idp.codes.set(code, { challenge: q.get('code_challenge'), nonce: q.get('nonce') });
  return { to, q, code, loginCookie: valueOf(cookieOf(res, 'hhd_login')) };
}

async function signIn() {
  const { q, code, loginCookie } = await startLogin();
  const res = await call(`/auth/callback?code=${code}&state=${q.get('state')}`, { cookie: loginCookie });
  assert.equal(res.status, 303, warnings.join(' | '));
  return valueOf(cookieOf(res, 'hhd_session'));
}

test('without a session: pages go to sign-in, the API answers 401, health stays open', async () => {
  assert.equal((await call('/')).headers.location, '/welcome.html');
  assert.equal((await call('/welcome.html')).status, 200, 'the sign-in choice is open');
  assert.equal((await call('/pair.html')).status, 200, 'the pairing page is open');
  assert.equal((await call('/api/devices')).status, 401);
  assert.equal((await call('/index.html')).status, 302);
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/info')).status, 401);
  assert.equal((await call('/healthz')).status, 200);
});

test('the login request uses PKCE S256, a state, a nonce and the fixed redirect URI', async () => {
  const { to, q, loginCookie } = await startLogin();
  assert.equal(to.origin + to.pathname, `${issuer.origin}/o/authorize`);
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('redirect_uri'), 'http://dashboard.test/auth/callback');
  assert.ok(q.get('state').length >= 32 && q.get('nonce').length >= 32);
  assert.ok(!q.has('client_secret'));
  assert.equal(loginCookie, `hhd_login=${q.get('state')}`);
});

test('a full sign-in gives an HttpOnly session that opens the dashboard', async () => {
  const { q, code, loginCookie } = await startLogin();
  const res = await call(`/auth/callback?code=${code}&state=${q.get('state')}`, { cookie: loginCookie });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/');
  const set = cookieOf(res, 'hhd_session');
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /Max-Age=60/);
  assert.match(cookieOf(res, 'hhd_login'), /Max-Age=0/, 'the login cookie is cleared');
  assert.ok(!res.body.includes('token'));
  const session = valueOf(set);
  assert.equal((await call('/', { cookie: session })).status, 200);
  const me = await call('/api/me', { cookie: session });
  assert.deepEqual(JSON.parse(me.body), { signedIn: true, via: 'oidc', kind: 'person', name: 'Test Person' });
  assert.ok(!me.body.includes('user-1') && !me.body.includes(idp.accessToken), 'no subject id or token reaches the browser');
});

test('a callback is refused without the login cookie, with another state, or a second time', async () => {
  const a = await startLogin();
  const b = await startLogin();
  assert.equal((await call(`/auth/callback?code=${a.code}&state=${a.q.get('state')}`)).status, 400, 'no cookie');
  assert.equal((await call(`/auth/callback?code=${a.code}&state=${b.q.get('state')}`, { cookie: a.loginCookie })).status, 400, 'state of another login');
  const c = await startLogin();
  const path = `/auth/callback?code=${c.code}&state=${c.q.get('state')}`;
  assert.equal((await call(path, { cookie: c.loginCookie })).status, 303);
  assert.equal((await call(path, { cookie: c.loginCookie })).status, 400, 'used once');
});

test('a wrong nonce, a wrong PKCE verifier or an error from the provider is refused', async () => {
  idp.nonceOverride = 'another-nonce';
  const a = await startLogin();
  assert.equal((await call(`/auth/callback?code=${a.code}&state=${a.q.get('state')}`, { cookie: a.loginCookie })).status, 400, 'nonce');
  idp.nonceOverride = null;
  const b = await startLogin();
  idp.codes.set(b.code, { challenge: 'not-the-challenge', nonce: b.q.get('nonce') });
  assert.equal((await call(`/auth/callback?code=${b.code}&state=${b.q.get('state')}`, { cookie: b.loginCookie })).status, 400, 'pkce');
  const c = await startLogin();
  assert.equal((await call(`/auth/callback?error=access_denied&state=${c.q.get('state')}`, { cookie: c.loginCookie })).status, 400, 'denied');
});

test('a forged or expired session is refused', async () => {
  assert.equal((await call('/api/me', { cookie: 'hhd_session=forged' })).status, 401);
  const session = await signIn();
  assert.equal((await call('/api/me', { cookie: session })).status, 200);
  clock += 61_000;
  assert.equal((await call('/api/me', { cookie: session })).status, 401, 'expired');
});

test('logout ends the session; a cross-site logout is refused', async () => {
  const session = await signIn();
  assert.equal((await call('/auth/logout', { method: 'POST', cookie: session, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/api/me', { cookie: session })).status, 200, 'still signed in');
  const out = await call('/auth/logout', { method: 'POST', cookie: session, headers: { origin: 'http://dashboard.test' } });
  assert.equal(out.status, 204);
  assert.match(cookieOf(out, 'hhd_session'), /Max-Age=0/);
  assert.equal((await call('/api/me', { cookie: session })).status, 401);
  assert.equal((await call('/auth/signed-out')).status, 200);
});

test('the notice pages are styled, translatable and load only this site', async () => {
  for (const [path, status, title] of [['/auth/signed-out', 200, 'Signed out'], ['/auth/callback?code=x&state=y', 400, 'Sign-in failed']]) {
    const res = await call(path);
    assert.equal(res.status, status, path);
    const csp = res.headers['content-security-policy'];
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe|\*/);
    const page = res.body;
    assert.match(page, new RegExp(`<h1 data-t="\\w+">${title}</h1>`));
    for (const asset of ['/css/pair.css', '/js/pair.js']) assert.ok(page.includes(asset), `${path} loads ${asset}`);
  }
});

test('unfinished logins are capped, the oldest goes first', async () => {
  const first = await startLogin();
  for (let i = 0; i < 200; i += 1) await call('/auth/login');
  const res = await call(`/auth/callback?code=${first.code}&state=${first.q.get('state')}`, { cookie: first.loginCookie });
  assert.equal(res.status, 400);
});

test('settings: https only, all values required, none by default', () => {
  assert.deepEqual(authSettings({}), { mode: 'none' });
  const ok = { AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://id.example/o/', OIDC_CLIENT_ID: 'c', OIDC_CLIENT_SECRET: 's', PUBLIC_URL: 'https://dash.example' };
  assert.equal(authSettings(ok).sessionMs, 12 * 3600 * 1000);
  assert.throws(() => authSettings({ ...ok, OIDC_ISSUER: 'http://id.example/o/' }), /https/);
  assert.throws(() => authSettings({ ...ok, PUBLIC_URL: 'http://dash.example' }), /https/);
  assert.throws(() => authSettings({ ...ok, OIDC_CLIENT_SECRET: '' }), /OIDC_CLIENT_SECRET/);
  assert.throws(() => authSettings({ ...ok, SESSION_HOURS: '0' }), /SESSION_HOURS/);
  assert.throws(() => authSettings({ AUTH_MODE: 'proxy' }), /AUTH_MODE/);
});

// ── Pairing ──────────────────────────────────────────────────────────────────
const ORIGIN = { origin: 'http://dashboard.test' };

async function startPairing() {
  const res = await call('/auth/pair/start', { method: 'POST', headers: ORIGIN });
  assert.equal(res.status, 200);
  return { code: JSON.parse(res.body).code, pairCookie: valueOf(cookieOf(res, 'hhd_pair')) };
}
const approve = (session, code, name = 'Wall tablet') =>
  call('/api/devices/approve', { method: 'POST', cookie: session, headers: ORIGIN, body: { code, name } });

async function pairDevice(person, name = 'Wall tablet') {
  const { code, pairCookie } = await startPairing();
  assert.equal((await approve(person, code.toLowerCase().replace(/(.{4})/, '$1-'), name)).status, 200, 'case and separators do not matter');
  const poll = await call('/auth/pair/poll', { cookie: pairCookie });
  assert.deepEqual(JSON.parse(poll.body), { status: 'approved' });
  return { device: valueOf(cookieOf(poll, 'hhd_device')), poll, pairCookie, code };
}

test('a tablet gets a code, waits, and is let in once a person approves it', async () => {
  const { code, pairCookie } = await startPairing();
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/, 'eight characters without 0, O, 1 or I');
  assert.deepEqual(JSON.parse((await call('/auth/pair/poll', { cookie: pairCookie })).body), { status: 'pending' });
  const person = await signIn();
  assert.equal((await approve(person, code)).status, 200);
  const poll = await call('/auth/pair/poll', { cookie: pairCookie });
  const set = cookieOf(poll, 'hhd_device');
  assert.match(set, /HttpOnly/);
  assert.match(set, new RegExp(`Max-Age=${30 * 24 * 3600}`));
  const device = valueOf(set);
  assert.equal((await call('/', { cookie: device })).status, 200);
  assert.deepEqual(JSON.parse((await call('/api/me', { cookie: device })).body), { signedIn: true, via: 'oidc', kind: 'device', name: 'Wall tablet' });
  assert.deepEqual(JSON.parse((await call('/auth/pair/poll', { cookie: pairCookie })).body), { status: 'expired' }, 'the code is used once');
  assert.equal((await approve(person, code)).status, 404, 'and cannot be approved again');
});

test('only a signed-in person approves; a device cannot pair or remove devices', async () => {
  const { code } = await startPairing();
  assert.equal((await approve('', code)).status, 401);
  const person = await signIn();
  const { device } = await pairDevice(person);
  assert.equal((await approve(device, code)).status, 403);
  assert.equal((await call('/api/devices', { cookie: device })).status, 403);
  const id = JSON.parse((await call('/api/devices', { cookie: person })).body).devices[0].id;
  assert.equal((await call(`/api/devices/${id}`, { method: 'DELETE', cookie: device, headers: ORIGIN })).status, 403);
});

test('a wrong code is refused, and guessing stops after five misses', async () => {
  const person = await signIn();
  const { code } = await startPairing();
  for (let i = 0; i < 5; i += 1) assert.equal((await approve(person, 'AAAAAAAA')).status, 404);
  assert.equal((await approve(person, code)).status, 429, 'even the right code, for this person, for a while');
  assert.equal((await approve(await signIn(), code)).status, 200, 'another person is not blocked');
});

test('a code expires after five minutes; a name is required; other sites are refused', async () => {
  const person = await signIn();
  const { code, pairCookie } = await startPairing();
  assert.equal((await approve(person, code, '  ')).status, 400);
  assert.equal((await call('/auth/pair/start', { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/api/devices/approve', { method: 'POST', cookie: person, headers: { origin: 'https://evil.example' }, body: { code, name: 'x' } })).status, 403);
  clock += 5 * 60 * 1000 + 1;
  const fresh = await signIn();
  assert.equal((await approve(fresh, code)).status, 404);
  assert.deepEqual(JSON.parse((await call('/auth/pair/poll', { cookie: pairCookie })).body), { status: 'expired' });
});

test('removing a device ends its session at once', async () => {
  const person = await signIn();
  const { device } = await pairDevice(person, 'Tablet to remove');
  const list = JSON.parse((await call('/api/devices', { cookie: person })).body).devices;
  const mine = list.find((d) => d.name === 'Tablet to remove');
  assert.ok(!JSON.stringify(list).includes('tokenHash'), 'no token hash leaves the server');
  assert.equal((await call(`/api/devices/${mine.id}`, { method: 'DELETE', cookie: person, headers: ORIGIN })).status, 200);
  assert.equal((await call('/api/me', { cookie: device })).status, 401);
});

test('a device session lasts 30 days from its last use, and survives a restart', async () => {
  const person = await signIn();
  const { device } = await pairDevice(person);
  clock += 29 * 24 * 3600 * 1000;
  const used = await call('/api/me', { cookie: device });
  assert.equal(used.status, 200);
  assert.match(cookieOf(used, 'hhd_device') || '', /Max-Age=2592000/, 'the cookie is renewed with the session');
  clock += 29 * 24 * 3600 * 1000;
  assert.equal((await call('/api/me', { cookie: device })).status, 200, 'still in: used 29 days ago');
  const reloaded = createDevices({ store: jsonFile(join(site, 'data', 'devices.json')), now: () => clock });
  assert.ok(reloaded.check(device.split('=')[1]), 'a new process reads the same device');
  clock += 31 * 24 * 3600 * 1000;
  assert.equal((await call('/api/me', { cookie: device })).status, 401, 'unused for 31 days');
});

test('a person can still sign out on a tablet without undoing its pairing', async () => {
  const person = await signIn();
  const { device } = await pairDevice(person);
  assert.equal((await call('/auth/logout', { method: 'POST', cookie: device, headers: ORIGIN })).status, 204);
  assert.equal((await call('/api/me', { cookie: device })).status, 200);
});

test('codes are read without case or separators', () => {
  assert.equal(normalizeCode(' abcd-ef 23 '), 'ABCDEF23');
  assert.equal(normalizeCode(undefined), '');
});

test('a request that fails answers 500 and the server keeps running', async () => {
  const broken = { handle: async () => { throw Object.assign(new Error('secret detail'), { code: 'EROFS' }); }, session: () => null };
  const logged = [];
  const handler = createHandler({ mode: 'demo', root: site, auth: broken, log: { error: (m) => logged.push(m) } });
  const other = createServer(handler);
  await new Promise((done) => other.listen(0, '127.0.0.1', done));
  const status = await new Promise((done) => request({ host: '127.0.0.1', port: other.address().port, path: '/' }, (res) => { res.resume(); done(res.statusCode); }).end());
  other.close();
  assert.equal(status, 500);
  assert.deepEqual(logged, ['request failed (EROFS)'], 'the error name only, not its message');
});
