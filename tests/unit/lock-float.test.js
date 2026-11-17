import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLock } from '../../app/frontend/js/lock.js';
import { icon } from '../../app/frontend/js/icons.js';
import { render } from './helpers.js';

test('with the lock on, the lock control is on every screen and above every sheet', () => {
  const lock = { ...defaultLock(), enabled: true };
  [{}, { view: 'energy' }, { view: 'network' }, { room: 'room_01' }, { settings: true }, { grouping: true }, { layout: 'phone' }].forEach((state) => {
    [false, true].forEach((locked) => {
      const html = render({ state: { ...state, lock, locked } });
      const at = html.indexOf('class="lock-float"');
      const where = `${JSON.stringify(state)} locked=${locked}`;
      assert.ok(at > 0, `${where}: no lock control`);
      // Rendered after any sheet, so a sheet never covers it.
      assert.ok(at > html.lastIndexOf('class="sheet'), `${where}: the lock is under a sheet`);
      assert.ok(html.includes(locked ? 'data-action="unlock"' : 'data-action="lock-now"'), where);
    });
  });
  assert.ok(!render().includes('lock-float'), 'no lock control while the lock is off');
});

test('the settings icon is a toothed wheel, not the sun', () => {
  assert.notEqual(icon('gear'), icon('sun'));
  assert.ok((icon('gear').match(/L/g) || []).length >= 24, 'a wheel with teeth');
});
