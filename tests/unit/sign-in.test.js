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

test('the identity provider is offered as OIDC; the old proxy choice becomes OIDC', () => {
  assert.deepEqual(SIGNIN_MODES, ['oidc', 'hass']);
  assert.equal(normalizeAccess({ signin: 'proxy' }).signin, 'oidc');
  assert.equal(normalizeAccess({ signin: 'hass' }).signin, 'hass');
  assert.equal(normalizeAccess({ signin: 'other' }).signin, 'oidc');
});
