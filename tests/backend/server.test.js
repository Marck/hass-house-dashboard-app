import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, resolvePath, settings } from '../../app/backend/app.js';

const frontend = fileURLToPath(new URL('../../app/frontend', import.meta.url));

const outside = mkdtempSync(join(tmpdir(), 'hhd-'));
const root = join(outside, 'site');
let server;
let port;

before(async () => {
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(root, 'js', 'a.js'), 'export {};');
  writeFileSync(join(outside, 'secret.txt'), 'outside the site');
  server = createServer(createHandler({ mode: 'demo', root }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  port = server.address().port;
});
after(() => {
  server.close();
  rmSync(outside, { recursive: true, force: true });
});

// A raw request, so paths reach the server exactly as written.
function get(path, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('serves the frontend with the hardening headers', async () => {
  for (const path of ['/', '/index.html']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['content-security-policy'], "frame-ancestors 'none'");
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['cache-control'], 'no-cache');
  }
  assert.match((await get('/js/a.js')).headers['content-type'], /^text\/javascript/);
});

test('health, info and unknown paths', async () => {
  assert.deepEqual([(await get('/healthz')).status, (await get('/healthz')).body], [200, 'ok\n']);
  assert.deepEqual(JSON.parse((await get('/api/info')).body), { mode: 'demo', auth: 'none' });
  assert.deepEqual(JSON.parse((await get('/api/me')).body), { signedIn: false, via: 'none' });
  assert.equal((await get('/api/anything')).status, 404);
  assert.equal((await get('/missing.js')).status, 404);
  assert.equal((await get('/js')).status, 404, 'a directory is not a file');
});

// Every page a browser can land on uses the site's style (plan 2.14). Plain
// text is only for what is not shown as a page: /healthz, the API, fetches.
test('a page that does not exist is styled like the rest of the site', async () => {
  const res = await get('/no-such-page');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /^text\/html/);
  for (const asset of ['/css/tokens.css', '/css/pair.css', '/js/pair.js']) assert.ok(res.body.includes(asset), asset);
  assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  assert.match(res.body, /<h1 data-t="notFoundTitle">Page not found<\/h1>/);
  assert.match((await get('/api/anything')).headers['content-type'], /json/, 'the API still answers JSON');
});

test('every HTML file of the frontend loads the design tokens', () => {
  for (const name of readdirSync(frontend)) {
    if (!name.endsWith('.html')) continue;
    assert.match(readFileSync(join(frontend, name), 'utf8'), /href="css\/tokens\.css"/, name);
  }
});

test('HEAD has headers and no body; other methods are refused', async () => {
  const head = await get('/index.html', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await get('/', method)).status, 405, method);
});

test('nothing outside the site is served', async () => {
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/js/..%2f..%2fsecret.txt', '/%00', '/%E0%A4%A']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.ok(!res.body.includes('outside the site'), path);
  }
  assert.equal(resolvePath(root, '/../secret.txt'), null);
  assert.equal(resolvePath(root, '/%2e%2e/secret.txt'), null);
  assert.equal(resolvePath(`${root}`, '/../site-other/x'), null, 'a sibling with the same prefix is outside');
});

test('settings: demo by default, and a demo holds no Home Assistant credential', () => {
  const ok = settings({ STATIC_DIR: root });
  assert.equal(ok.mode, 'demo');
  assert.equal(ok.port, 8080);
  assert.throws(() => settings({ DASHBOARD_MODE: 'mock' }), /DASHBOARD_MODE/);
  assert.throws(() => settings({ HASS_TOKEN: 'x' }), /Home Assistant/);
  assert.throws(() => settings({ HOME_ASSISTANT_URL: 'x' }), /Home Assistant/);
  for (const port of ['0', '70000', 'abc']) assert.throws(() => settings({ PORT: port }), /PORT/, port);
});
