import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHa as makeHa, haSettings, READ, REGISTRY_EVENTS, shapeRegistry } from '../../app/backend/ha.js';

// Every client a test makes is stopped at the end, also when an assertion
// fails half way: a running client would keep the test process alive.
const made = [];
const createHa = (options) => {
  const ha = makeHa(options);
  made.push(ha);
  return ha;
};
import { createHandler, settings } from '../../app/backend/app.js';
import { startFakeHa, TOKEN, DATA } from './fake-ha.js';
import { cleanState } from '../../app/backend/ha.js';

// Backoff and timeouts run 100 times faster here.
const fast = {
  setTimeout: (f, ms) => setTimeout(f, ms / 100),
  clearTimeout,
  setInterval: (f, ms) => setInterval(f, ms / 100),
  clearInterval,
};
const quiet = () => {
  const lines = [];
  const add = (m) => lines.push(m);
  return { lines, log: { info: add, warn: add, error: add } };
};
const until = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 10));
  }
};

let fake;
const dir = mkdtempSync(join(tmpdir(), 'hhd-ha-'));
before(async () => { fake = await startFakeHa(); });
after(async () => { made.forEach((ha) => ha.stop()); await fake.close(); rmSync(dir, { recursive: true, force: true }); });

test('settings: the address becomes the WebSocket URL; one token source; values never in errors', () => {
  const file = join(dir, 'token');
  writeFileSync(file, `${TOKEN}\n`);
  const s = haSettings({ HASS_URL: 'http://ha.example:8123', HASS_TOKEN_FILE: file });
  assert.equal(s.url, 'ws://ha.example:8123/api/websocket');
  assert.equal(s.token(), TOKEN, 'read from the file, trimmed');
  assert.equal(haSettings({ HASS_URL: 'https://ha.example/base/', HASS_TOKEN: 'x' }).url, 'wss://ha.example/base/api/websocket');
  for (const env of [
    { HASS_TOKEN: 'x' },
    { HASS_URL: 'ftp://ha.example', HASS_TOKEN: 'x' },
    { HASS_URL: ['http://user:pw', 'ha.example'].join(String.fromCharCode(64)), HASS_TOKEN: 'x' }, // credentials in the address
    { HASS_URL: 'http://ha.example' },
    { HASS_URL: 'http://ha.example', HASS_TOKEN: 'x', HASS_TOKEN_FILE: file },
    { HASS_URL: 'http://ha.example', HASS_TOKEN: '  ' },
  ]) {
    assert.throws(() => haSettings(env), (error) => !error.message.includes('pw') && !error.message.includes(TOKEN), JSON.stringify(Object.keys(env)));
  }
});

test('settings: a demo refuses Home Assistant settings; live needs sign-in unless it only listens locally', () => {
  assert.throws(() => settings({ HASS_URL: 'http://ha.example' }), /demo refuses/);
  assert.throws(() => settings({ DASHBOARD_MODE: 'live', HASS_URL: 'http://ha.example' }), /needs AUTH_MODE=oidc/);
  assert.equal(settings({ DASHBOARD_MODE: 'live', AUTH_MODE: 'oidc' }).mode, 'live');
  assert.equal(settings({ DASHBOARD_MODE: 'live', HOST: '127.0.0.1' }).host, '127.0.0.1');
});

test('the browser gets areas per entity, also through the device, and no disabled entities', () => {
  const r = shapeRegistry({
    floors: DATA['config/floor_registry/list'], areas: DATA['config/area_registry/list'],
    devices: DATA['config/device_registry/list'], entities: DATA['config/entity_registry/list'],
  });
  assert.deepEqual(r.entities, [
    { id: 'light.lamp_one', domain: 'light', name: 'Lamp one', area: 'living', hidden: false, category: null },
    { id: 'sensor.temp_one', domain: 'sensor', name: 'Temperature', area: 'kitchen', hidden: true, category: null },
    { id: 'switch.setting_one', domain: 'switch', name: 'Auto update', area: 'living', hidden: false, category: 'config' },
  ]);
  assert.deepEqual(r.areas[0], { id: 'living', name: 'Living room', floor: 'ground' });
  assert.equal(r.devices, 1);
});

test('connects, loads the registries and sends nothing but reads', async () => {
  fake.received.length = 0;
  const { lines, log } = quiet();
  const ha = createHa({ url: fake.url, token: () => TOKEN, log, timers: fast });
  ha.start();
  await until(() => ha.registry());
  const status = ha.status();
  assert.equal(status.state, 'connected');
  assert.equal(status.version, '2026.11.1');
  assert.deepEqual(status.counts, { floors: 1, areas: 2, devices: 1, entities: 3 });
  await assert.rejects(ha.command('call_service'), /refused/);
  await assert.rejects(ha.command('config/area_registry/create'), /refused/);
  ha.stop();
  assert.deepEqual([...new Set(fake.received)].sort(), ['auth', ...READ].sort(), 'only the auth and the read commands reached Home Assistant');
  assert.ok(lines.every((l) => !l.includes(TOKEN) && !l.includes(String(fake.port))), 'no token or address in the log');
});

test('a refused token is reported, not retried at once, and not logged', async () => {
  const { lines, log } = quiet();
  const ha = createHa({ url: fake.url, token: () => 'wrong-token', log, timers: fast });
  ha.start();
  await until(() => ha.status().state === 'auth_failed');
  assert.equal(ha.registry(), null);
  ha.stop();
  assert.ok(lines.some((l) => /token was refused/.test(l)));
  assert.ok(lines.every((l) => !l.includes('wrong-token')));
});

test('reconnects after Home Assistant drops the connection, and loads again', async () => {
  const { log } = quiet();
  const ha = createHa({ url: fake.url, token: () => TOKEN, log, timers: fast });
  ha.start();
  await until(() => ha.status().state === 'connected');
  const first = ha.status().loadedAt;
  await until(() => ha.registry());
  fake.dropAll();
  await until(() => ha.status().state !== 'connected');
  await until(() => ha.status().state === 'connected' && ha.status().loadedAt > first, 5000);
  ha.stop();
});

test('an unreachable Home Assistant is reported and retried', async () => {
  const closed = createServer();
  await new Promise((done) => closed.listen(0, '127.0.0.1', done));
  const port = closed.address().port;
  await new Promise((done) => closed.close(done));
  const { log } = quiet();
  const ha = createHa({ url: `ws://127.0.0.1:${port}/api/websocket`, token: () => TOKEN, log, timers: fast });
  ha.start();
  await until(() => ha.status().state === 'unreachable');
  ha.stop();
  assert.equal(ha.status().state, 'stopped');
});

test('/api/ha serves status and registry without the token or address', async () => {
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet().log, timers: fast });
  const server = createServer(createHandler({ mode: 'live', root: dir, ha }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const get = (path) => new Promise((done) => request({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => done({ status: res.statusCode, body }));
  }).end());
  assert.equal((await get('/api/ha/registry')).status, 503, 'not loaded yet');
  ha.start();
  await until(() => ha.registry());
  const status = await get('/api/ha');
  const registry = await get('/api/ha/registry');
  ha.stop();
  server.close();
  assert.equal(JSON.parse(status.body).state, 'connected');
  assert.equal(JSON.parse(registry.body).entities.length, 3);
  for (const body of [status.body, registry.body]) {
    assert.ok(!body.includes(TOKEN) && !body.includes(String(fake.port)) && !body.includes('127.0.0.1'));
  }
});

test('live states: loaded, kept current, and never with a credential or who did it', async () => {
  const changes = [];
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet().log, timers: fast });
  ha.onChange((c) => changes.push(c));
  ha.start();
  await until(() => ha.states());
  const all = ha.states();
  assert.deepEqual(Object.keys(all).sort(), ['camera.door_one', 'light.lamp_one']);
  assert.deepEqual(all['camera.door_one'], { s: 'idle', a: {}, lc: 2 }, 'picture with token, access token and context dropped');
  assert.equal(ha.status().states, 2);
  await until(() => changes.some((c) => c.reset));
  fake.pushStates({ c: { 'light.lamp_one': { '+': { s: 'off', a: { brightness: 0 }, lc: 3 }, '-': { a: ['friendly_name'] } } } });
  fake.pushStates({ a: { 'sensor.new_one': { s: '21', a: {}, lc: 4 } }, r: ['camera.door_one'] });
  await until(() => changes.some((c) => c.remove && c.remove.length));
  const last = changes.filter((c) => !c.reset);
  const set = Object.assign({}, ...last.map((c) => c.set));
  assert.deepEqual(set['light.lamp_one'], { s: 'off', a: { brightness: 0 }, lc: 3 });
  assert.deepEqual(set['sensor.new_one'], { s: '21', a: {}, lc: 4 });
  assert.ok(last.some((c) => c.remove.includes('camera.door_one')));
  assert.ok(!ha.states()['camera.door_one']);
  ha.stop();
  const text = JSON.stringify(changes);
  assert.ok(!text.includes('cam-token-not-real') && !text.includes('user-not-real'));
});

test('after a reconnect the browser gets every state again', async () => {
  const changes = [];
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet().log, timers: fast });
  ha.onChange((c) => changes.push(c));
  ha.start();
  await until(() => changes.some((c) => c.reset));
  changes.length = 0;
  fake.dropAll();
  await until(() => changes.some((c) => c.reset), 5000);
  ha.stop();
});

test('cleanState keeps ordinary attributes and drops anything that looks like a credential', () => {
  const st = cleanState({ s: 'playing', a: { volume_level: 0.4, entity_picture: '/x?token=y', entity_picture_local: '/p?token=y', api_token: 'z', Password: 'p' }, c: 'ctx', lu: 9 });
  assert.deepEqual(st, { s: 'playing', a: { volume_level: 0.4 }, lc: 9 });
});

test('/api/ha/stream sends every state, then the changes', async () => {
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet().log, timers: fast });
  const server = createServer(createHandler({ mode: 'live', root: dir, ha }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  ha.start();
  await until(() => ha.states());
  let text = '';
  const req = request({ host: '127.0.0.1', port: server.address().port, path: '/api/ha/stream' }, (res) => {
    assert.match(res.headers['content-type'], /^text\/event-stream/);
    res.on('data', (c) => { text += c; });
  });
  req.end();
  await until(() => text.includes('event: states'));
  fake.pushStates({ a: { 'switch.one': { s: 'on', a: {}, lc: 5 } } });
  await until(() => text.includes('event: change'));
  req.destroy();
  ha.stop();
  server.close();
  assert.ok(!text.includes('cam-token-not-real'));
  assert.match(text, /event: change\ndata: \{"set":\{"switch\.one"/);
});

test('/api/ha/stream ends as soon as its session is gone', async () => {
  let signedIn = true;
  const auth = { handle: async () => false, handleApi: async () => false, session: () => (signedIn ? { kind: 'device', name: 'tablet', id: 'd1' } : null) };
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet().log, timers: fast });
  const server = createServer(createHandler({ mode: 'live', root: dir, ha, auth }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  ha.start();
  await until(() => ha.states());
  let text = '';
  let ended = false;
  const req = request({ host: '127.0.0.1', port: server.address().port, path: '/api/ha/stream' }, (res) => {
    res.on('data', (c) => { text += c; });
    res.on('end', () => { ended = true; });
  });
  req.end();
  try {
    await until(() => text.includes('event: states'));
    signedIn = false; // the device was removed under Settings
    fake.pushStates({ a: { 'switch.two': { s: 'on', a: {}, lc: 6 } } });
    await until(() => ended);
  } finally {
    req.destroy();
    ha.stop();
    server.close();
  }
  assert.ok(!text.includes('switch.two'));
});

test('a registry change reloads the registry and sends every state again', async () => {
  const data = JSON.parse(JSON.stringify(DATA));
  const own = await startFakeHa({ data });
  const ha = createHa({ url: own.url, token: () => TOKEN, log: quiet().log, timers: fast });
  const changes = [];
  ha.onChange((c) => changes.push(c));
  ha.start();
  try {
    await until(() => ha.registry() && ha.states() && own.eventTypes.length === REGISTRY_EVENTS.length);
    assert.deepEqual([...own.eventTypes].sort(), [...REGISTRY_EVENTS].sort(), 'only the registry events are watched');
    await until(() => changes.some((c) => c.reset)); // the first full list
    const before = changes.length;
    data['config/area_registry/list'][0].name = 'Renamed area';
    own.pushEvent('area_registry_updated');
    own.pushEvent('area_registry_updated'); // a burst reloads once
    await until(() => ha.registry().areas.some((a) => a.name === 'Renamed area'));
    await until(() => changes.slice(before).some((c) => c.reset));
    assert.equal(changes.slice(before).filter((c) => c.reset).length, 1);
    assert.ok(changes.slice(before).find((c) => c.reset).set['light.lamp_one'], 'every state is sent again');
  } finally {
    ha.stop();
    await own.close();
  }
});
