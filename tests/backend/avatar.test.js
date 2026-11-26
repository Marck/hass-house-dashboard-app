import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avatarPath, createAvatars, AVATAR_MAX_BYTES } from '../../app/backend/avatar.js';
import { cleanState, createHa } from '../../app/backend/ha.js';
import { createHandler } from '../../app/backend/app.js';
import { startFakeHa, TOKEN, DATA } from './fake-ha.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const quiet = { info() {}, warn() {}, error() {} };

test('avatarPath: only the path, only where Home Assistant serves pictures from', () => {
  assert.equal(avatarPath('/local/images/one.png'), '/local/images/one.png');
  assert.equal(avatarPath('https://ha.example.invalid/local/images/one.png'), '/local/images/one.png', 'a full external address: its path only');
  assert.equal(avatarPath('//elsewhere.invalid/local/x.png'), '/local/x.png', 'another host is dropped, never fetched');
  assert.equal(avatarPath('/api/image/serve/0123abcd/512x512'), '/api/image/serve/0123abcd/512x512');
  for (const bad of ['/api/states', '/api/config', '/local/../secrets.yaml', '/local/%2e%2e/x', '/local/a%2Fb', '/local/', '/local', 'javascript:alert(1)',
    'data:image/png;base64,AAAA', '/local/a b.png', '', ' ', null, 7, {}]) {
    assert.equal(avatarPath(bad), null, String(bad));
  }
  assert.equal(avatarPath('/local/x.png?token=1#y'), '/local/x.png', 'a query or fragment is dropped, not passed on');
});

function fakeFetch(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, redirect: init.redirect });
    const { status = 200, type = 'image/png', body = PNG, length } = answer();
    return {
      ok: status >= 200 && status < 300,
      headers: { get: (k) => (k === 'content-type' ? type : k === 'content-length' ? (length ?? String(body.length)) : null) },
      arrayBuffer: async () => body,
    };
  };
  return { calls, fetchImpl };
}

test('createAvatars: fetched from Home Assistant with the token, raster images up to 1 MB, cached 10 minutes', async () => {
  let now = 0;
  let answer = {};
  const { calls, fetchImpl } = fakeFetch(() => answer);
  const avatars = createAvatars({ base: 'http://ha-backend.example.invalid:8123/', token: () => 'tok', fetchImpl, now: () => now });
  assert.deepEqual(await avatars.get('/local/a.png'), { type: 'image/png', body: PNG });
  assert.deepEqual(calls[0], { url: 'http://ha-backend.example.invalid:8123/local/a.png', auth: 'Bearer tok', redirect: 'error' });
  await avatars.get('/local/a.png');
  assert.equal(calls.length, 1, 'cached');
  now += 11 * 60_000;
  await avatars.get('/local/a.png');
  assert.equal(calls.length, 2, 'fetched again after 10 minutes');
  for (const [i, a] of [{ type: 'image/svg+xml' }, { type: 'text/html' }, { status: 404 }, { length: String(AVATAR_MAX_BYTES + 1) }, { body: Buffer.alloc(AVATAR_MAX_BYTES + 1), length: '' }, { body: Buffer.alloc(0) }].entries()) {
    answer = a;
    assert.equal(await avatars.get(`/local/b${i}.png`), null, JSON.stringify({ ...a, body: undefined }));
  }
  assert.equal(await avatars.get('/api/states'), null);
  assert.equal(calls.filter((c) => c.url.endsWith('/api/states')).length, 0, 'a path that is not a picture is never fetched');
});

test('cleanState: a person gets picture: true, never the address', () => {
  const st = cleanState({ s: 'home', a: { friendly_name: 'P', entity_picture: 'https://ha.example.invalid/local/images/p.png' } }, 'person.p');
  assert.deepEqual(st.a, { friendly_name: 'P', picture: true });
  assert.deepEqual(cleanState({ s: 'home', a: { friendly_name: 'P', entity_picture: '/api/states' } }, 'person.p').a, { friendly_name: 'P' });
  assert.deepEqual(cleanState({ s: 'home', a: { friendly_name: 'P' } }, 'person.p').a, { friendly_name: 'P' });
  assert.ok(!('picture' in cleanState({ s: 'on', a: { entity_picture: '/local/x.png' } }, 'light.x').a));
});

test('/api/ha/avatar: the picture from Home Assistant, 404 without one, 401 signed out', async () => {
  const seen = [];
  const states = {
    'person.one': { s: 'home', a: { friendly_name: 'One', entity_picture: 'https://elsewhere.invalid/local/images/one.png' }, lc: 1 },
    'person.two': { s: 'home', a: { friendly_name: 'Two' }, lc: 1 },
    'person.three': { s: 'home', a: { friendly_name: 'Three', entity_picture: '/api/config' }, lc: 1 },
  };
  const own = await startFakeHa({ data: DATA, states, http: (req, res) => {
    seen.push({ url: req.url, host: req.headers.host, auth: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
    res.end(PNG);
  } });
  const ha = createHa({ url: own.url, token: () => TOKEN, log: quiet });
  const avatars = createAvatars({ base: own.url.replace(/^ws/, 'http').replace(/api\/websocket$/, ''), token: () => TOKEN });
  let signedIn = true;
  const auth = { handle: async () => false, handleApi: async () => false, session: () => (signedIn ? { kind: 'device', name: 'tablet', id: 'd1' } : null) };
  const dir = mkdtempSync(join(tmpdir(), 'avatar-'));
  const server = createServer(createHandler({ mode: 'live', root: dir, ha, avatars, auth, log: quiet }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  ha.start();
  const get = (path) => new Promise((done) => request({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'], cache: res.headers['cache-control'], body: Buffer.concat(chunks) }));
  }).end());
  try {
    for (let i = 0; i < 200 && !ha.states(); i += 1) await new Promise((r) => setTimeout(r, 10));
    const one = await get('/api/ha/avatar/person.one');
    assert.deepEqual([one.status, one.type, one.cache], [200, 'image/png', 'private, max-age=600']);
    assert.ok(one.body.equals(PNG));
    assert.deepEqual(seen, [{ url: '/local/images/one.png', host: new URL(own.url).host, auth: `Bearer ${TOKEN}` }], 'fetched from Home Assistant itself, with the token');
    for (const id of ['person.two', 'person.three', 'person.nobody', 'light.lamp_one', '..%2Fapi%2Fstates']) assert.equal((await get(`/api/ha/avatar/${id}`)).status, 404, id);
    assert.equal(seen.length, 1, 'nothing else was fetched');
    signedIn = false;
    assert.equal((await get('/api/ha/avatar/person.one')).status, 401);
  } finally {
    ha.stop();
    server.close();
    await own.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
