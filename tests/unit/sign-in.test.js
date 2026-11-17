import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccess, SIGNIN_MODES } from '../../app/frontend/js/onboard.js';
import { render } from './helpers.js';

test('settings show who is signed in, with a way to sign out, only when the backend says so', () => {
  const html = render({ state: { settings: true, me: { signedIn: true, name: 'Person <b>' } } });
  assert.ok(html.includes('data-action="sign-out"'));
  assert.ok(html.includes('Person &lt;b&gt;'), 'the name is escaped');
  assert.ok(!render({ state: { settings: true } }).includes('sign-out'), 'no backend sign-in: no sign-out');
});

test('a signed-in person pairs a tablet and sees the paired devices; a tablet only sees that it is paired', () => {
  const devices = [{ id: 'd1', name: 'Hall <tablet>', created: 0, lastSeen: 0 }];
  const person = render({ state: { settings: true, me: { signedIn: true, kind: 'person', name: 'A' }, devices, pairForm: { code: 'ab', name: '' } } });
  assert.ok(person.includes('data-input="pair-code"') && person.includes('data-input="pair-name"'));
  assert.ok(person.includes('data-action="device-approve"'));
  assert.ok(person.includes('data-action="device-revoke" data-arg="d1"'));
  assert.ok(person.includes('Hall &lt;tablet&gt;'), 'device names are escaped');
  assert.ok(!person.includes('access-pair'), 'no demo pairing next to the real one');
  const tablet = render({ state: { settings: true, me: { signedIn: true, kind: 'device', name: 'Hall' }, devices: null, pairForm: { code: '', name: '' } } });
  assert.ok(!tablet.includes('device-approve') && !tablet.includes('device-revoke'), 'a tablet cannot pair or remove');
  assert.ok(tablet.includes('Hall'));
});

test('the identity provider is offered as OIDC; the old proxy choice becomes OIDC', () => {
  assert.deepEqual(SIGNIN_MODES, ['oidc', 'hass']);
  assert.equal(normalizeAccess({ signin: 'proxy' }).signin, 'oidc');
  assert.equal(normalizeAccess({ signin: 'hass' }).signin, 'hass');
  assert.equal(normalizeAccess({ signin: 'other' }).signin, 'oidc');
});
