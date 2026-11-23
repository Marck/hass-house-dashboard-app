import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigSync } from '../../app/frontend/js/sync.js';

/** A backend with one stored configuration and revisions, as app/backend/config-store.js answers. */
function backend(stored = null) {
  const server = { revision: stored ? 1 : 0, config: stored, puts: 0, delay: null };
  async function fetch(url, opts = {}) {
    assert.equal(url, '/api/config');
    const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
    if (!opts.method) return reply(200, { revision: server.revision, config: server.config });
    server.puts += 1;
    if (server.delay) await server.delay;
    const body = JSON.parse(opts.body);
    if (body.revision !== server.revision) return reply(409, { revision: server.revision, config: server.config });
    server.revision += 1;
    server.config = body.config;
    return reply(200, { revision: server.revision });
  }
  return { server, fetch };
}

/** One browser: its own configuration, who is signed in, what it was told. */
function device(api, { kind = 'person', local = null, editing = false } = {}) {
  const dev = { config: local, adopted: [], toasts: [], kind, editing };
  dev.sync = createConfigSync({
    fetch: api.fetch,
    canWrite: () => dev.kind === 'person',
    editing: () => dev.editing,
    hasLocal: () => Boolean(local),
    current: () => dev.config,
    adopt: (config) => { dev.config = config; dev.adopted.push(config); },
    toast: (key) => dev.toasts.push(key),
  });
  return dev;
}

test('the first person to sign in brings this browser\'s configuration along, once', async () => {
  const api = backend();
  const phone = device(api, { local: { version: 1, label: 'mine' } });
  await phone.sync.pull();
  assert.deepEqual(api.server.config, { version: 1, label: 'mine' });
  await phone.sync.pull();
  assert.equal(api.server.puts, 1);
});

test('a fresh tablet takes the stored configuration and never writes', async () => {
  const api = backend({ version: 1, label: 'house' });
  const tablet = device(api, { kind: 'device', local: { version: 1, label: 'stale' } });
  await tablet.sync.pull();
  assert.deepEqual(tablet.config, { version: 1, label: 'house' });
  tablet.config = { version: 1, label: 'changed on the tablet' };
  await tablet.sync.push();
  assert.equal(api.server.puts, 0);
  assert.deepEqual(api.server.config, { version: 1, label: 'house' });
});

test('a save on one device reaches the other at its next check; an unchanged revision is not applied again', async () => {
  const api = backend({ version: 1, label: 'v1' });
  const phone = device(api);
  const tablet = device(api, { kind: 'device' });
  await phone.sync.pull();
  await tablet.sync.pull();
  phone.config = { version: 1, label: 'v2' };
  await phone.sync.push();
  await tablet.sync.pull();
  assert.deepEqual(tablet.config, { version: 1, label: 'v2' });
  const seen = tablet.adopted.length;
  await tablet.sync.pull();
  assert.equal(tablet.adopted.length, seen);
});

test('a stale save is refused, the newer configuration shown and the user told', async () => {
  const api = backend({ version: 1, label: 'v1' });
  const phone = device(api);
  const laptop = device(api);
  await phone.sync.pull();
  await laptop.sync.pull();
  phone.config = { version: 1, label: 'from the phone' };
  await phone.sync.push();
  laptop.config = { version: 1, label: 'from an old laptop view' };
  await laptop.sync.push();
  assert.deepEqual(api.server.config, { version: 1, label: 'from the phone' });
  assert.deepEqual(laptop.config, { version: 1, label: 'from the phone' });
  assert.deepEqual(laptop.toasts, ['toast.configNewer']);
});

test('saves are sent one at a time and the last edit wins', async () => {
  const api = backend({ version: 1, label: 'v1' });
  const phone = device(api);
  await phone.sync.pull();
  let release;
  api.server.delay = new Promise((done) => { release = done; });
  phone.config = { version: 1, label: 'first' };
  const first = phone.sync.push();
  phone.config = { version: 1, label: 'second' };
  phone.sync.push();
  phone.config = { version: 1, label: 'third' };
  phone.sync.push();
  release();
  api.server.delay = null;
  await first;
  assert.equal(api.server.puts, 2, 'the edits made while saving go out as one save');
  assert.deepEqual(api.server.config, { version: 1, label: 'third' });
  assert.deepEqual(phone.toasts, []);
});

test('nothing is swapped under an open editor; without sign-in nothing is sent', async () => {
  const api = backend({ version: 1, label: 'house' });
  const phone = device(api, { editing: true, local: { version: 1, label: 'editing' } });
  await phone.sync.pull();
  assert.deepEqual(phone.config, { version: 1, label: 'editing' });
  const offline = device({ fetch: async () => ({ ok: false, status: 401, json: async () => null }) }, { local: { version: 1 } });
  await offline.sync.pull();
  await offline.sync.push();
  assert.equal(offline.sync.on(), false);
});

test('a failed save says so and keeps the edit', async () => {
  const phone = device({
    fetch: async (url, opts = {}) => (opts.method ? Promise.reject(new Error('offline')) : { ok: true, status: 200, json: async () => ({ revision: 0, config: null }) }),
  });
  await phone.sync.pull();
  phone.config = { version: 1, label: 'kept' };
  await phone.sync.push();
  assert.deepEqual(phone.toasts, ['toast.configNotSaved']);
  assert.deepEqual(phone.config, { version: 1, label: 'kept' });
});
