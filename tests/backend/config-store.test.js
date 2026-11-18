import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../../app/backend/app.js';
import { createConfigStore, CONFIG_MAX_BYTES } from '../../app/backend/config-store.js';
import { jsonFile } from '../../app/backend/devices.js';

const dir = mkdtempSync(join(tmpdir(), 'hhd-config-'));
const file = join(dir, 'config.json');
let server;
let store;

// A stand-in for the sign-in: the test says who is asking, and whether the request is cross-site.
const fakeAuth = {
  handle: async () => false,
  handleApi: async () => false,
  session: (req) => ({ person: { kind: 'person', name: 'A' }, device: { kind: 'device', name: 'T' } })[req.headers['x-who']] || null,
  foreign: (req) => req.headers['x-foreign'] === '1',
};

function start() {
  store = createConfigStore({ store: jsonFile(file) });
  server = createServer(createHandler({ mode: 'demo', root: dir, auth: fakeAuth, configStore: store }));
  return new Promise((done) => server.listen(0, '127.0.0.1', done));
}
before(start);
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

function call(method, who, body, headers = {}) {
  return new Promise((done) => {
    const req = request({
      host: '127.0.0.1', port: server.address().port, path: '/api/config', method,
      headers: { ...(who ? { 'x-who': who } : {}), 'content-type': 'application/json', ...headers },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => done({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', () => done({ status: 0, body: null }));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const cfg = (label) => ({ version: 1, floors: [], label });

test('needs a session; empty at first', async () => {
  assert.equal((await call('GET', null)).status, 401);
  assert.deepEqual((await call('GET', 'device')).body, { revision: 0, config: null });
});

test('a person saves; a device reads but may not write; a cross-site write is refused', async () => {
  assert.deepEqual((await call('PUT', 'person', { revision: 0, config: cfg('one') })).body, { revision: 1 });
  assert.deepEqual((await call('GET', 'device')).body, { revision: 1, config: cfg('one') });
  assert.equal((await call('PUT', 'device', { revision: 1, config: cfg('tablet') })).status, 403);
  assert.equal((await call('PUT', 'person', { revision: 1, config: cfg('x') }, { 'x-foreign': '1' })).status, 403);
  assert.equal((await call('GET', 'person')).body.config.label, 'one');
});

test('a save based on an older revision is refused with the current state', async () => {
  const stale = await call('PUT', 'person', { revision: 0, config: cfg('old') });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.config.label, 'one', 'the newer configuration is returned, not overwritten');
});

test('only a configuration object with a version, within the size limit', async () => {
  for (const bad of [{ revision: 1 }, { revision: 1, config: [] }, { revision: 1, config: { floors: [] } }, { revision: 1, config: 'x' }]) {
    assert.equal((await call('PUT', 'person', bad)).status, 400, JSON.stringify(bad));
  }
  const huge = await call('PUT', 'person', { revision: 1, config: { version: 1, pad: 'x'.repeat(CONFIG_MAX_BYTES) } });
  assert.notEqual(huge.status, 200);
  assert.equal(store.get().revision, 1);
});

test('kept across a restart, in a file only the backend may read', async () => {
  server.close();
  await start();
  assert.deepEqual((await call('GET', 'person')).body, { revision: 1, config: cfg('one') });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).config);
});
