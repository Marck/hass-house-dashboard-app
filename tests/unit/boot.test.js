import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/frontend/js/boot.js', import.meta.url), 'utf8');

/** Run boot.js against a stand-in window and return its error handler and the banner. */
function boot() {
  const handlers = {};
  const banner = { textContent: '', className: 'fatal' };
  const window = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    localStorage: { getItem: () => null },
  };
  const document = { getElementById: (id) => (id === 'fatal' ? banner : null), documentElement: { setAttribute() {} } };
  window.window = window;
  vm.runInNewContext(source, { window, document, JSON, String });
  return { onError: (event) => handlers.error({ target: window, ...event }), banner, handlers, window };
}

test('an error from a dashboard script is shown with its file and line', () => {
  const { onError, banner } = boot();
  onError({ message: 'TypeError: x is undefined', filename: 'https://host.example/js/views/music.js?v=1', lineno: 42 });
  assert.equal(banner.textContent, 'TypeError: x is undefined (music.js:42)');
  assert.match(banner.className, /is-visible/);
});

test('an opaque error from a script that is not ours is not shown', () => {
  const { onError, banner } = boot();
  onError({ message: 'Script error.', filename: '', lineno: 0 });
  onError({ message: '', lineno: 0 });
  assert.equal(banner.textContent, '');
  assert.ok(!/is-visible/.test(banner.className), 'a working dashboard got a red bar');
});

test('a file that does not load is still reported', () => {
  const { handlers, banner } = boot();
  handlers.error({ target: { src: 'https://host.example/js/main.js' } });
  assert.equal(banner.textContent, 'Could not load main.js');
});
