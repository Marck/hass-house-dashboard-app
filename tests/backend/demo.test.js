// The demo cannot read Home Assistant: run as a separate process, the way the
// image runs it, next to a reachable fake Home Assistant with a valid token.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { startFakeHa, TOKEN } from './fake-ha.js';

const MAIN = fileURLToPath(new URL('../../app/backend/main.js', import.meta.url));

const freePort = () => new Promise((done) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => done(port));
  });
});

/** The promise's value, or 'timeout' after ms. */
const within = (promise, ms) => Promise.race([promise, new Promise((done) => setTimeout(() => done('timeout'), ms))]);

/** Starts main.js with only these variables (no inherited HASS_ or HOME_ASSISTANT_ setting). */
function run(env) {
  const child = spawn(process.execPath, [MAIN], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  const exited = new Promise((done) => child.on('exit', (code) => done(code)));
  return { child, exited, output: () => out };
}

test('a demo with Home Assistant settings refuses to start and never connects, even with a valid token', async () => {
  const fake = await startFakeHa();
  try {
    for (const env of [
      { HASS_URL: `http://127.0.0.1:${fake.port}`, HASS_TOKEN: TOKEN },
      { DASHBOARD_MODE: 'demo', HASS_URL: `http://127.0.0.1:${fake.port}`, HASS_TOKEN: TOKEN },
      { HOME_ASSISTANT_URL: `http://127.0.0.1:${fake.port}` },
    ]) {
      const { child, exited, output } = run({ ...env, PORT: String(await freePort()), HOST: '127.0.0.1' });
      const code = await within(exited, 3000);
      if (code === 'timeout') child.kill();
      assert.equal(code, 1, 'the demo must exit at once');
      assert.match(output(), /demo refuses to start/);
      assert.ok(!output().includes(TOKEN), 'the token is never printed');
    }
    await new Promise((done) => setTimeout(done, 200));
    assert.deepEqual(fake.received, [], 'the fake Home Assistant received nothing');
  } finally {
    await fake.close();
  }
});

test('a running demo serves no Home Assistant data', async () => {
  const port = await freePort();
  const { child, output } = run({ PORT: String(port), HOST: '127.0.0.1' });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100 && !output().includes('listening'); i += 1) await new Promise((done) => setTimeout(done, 50));
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.equal(info.mode, 'demo');
    for (const path of ['/api/ha', '/api/ha/states', '/api/ha/registry', '/api/ha/stream']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
  } finally {
    child.kill();
  }
});
