import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOCK_SCOPES, defaultLock, normalizeLock, kindOf, isBlocked, isPin, hashPin, checkPin, unlockMethod,
} from '../../app/frontend/js/lock.js';
import { BUILD } from '../../app/frontend/js/build-info.js';
import { defaultConfig, serializeConfig } from '../../app/frontend/js/config.js';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { fromEnv, moduleSource } from '../../scripts/build-info.mjs';
import { render, evConfigured, DIAG } from './helpers.js';

const on = (extra = {}) => ({ ...defaultLock(), enabled: true, ...extra });
const mainSource = readFileSync(new URL('../../app/frontend/js/main.js', import.meta.url), 'utf8');

test('an unlocked device blocks nothing', () => {
  ['light', 'scene', 'settings', 'room-remove', 'anything'].forEach((name) => assert.equal(isBlocked(on(), false, name), false));
});

test('each level blocks what it says, and looking around always works', () => {
  const expected = {
    //            view   light  control settings
    all: [false, true, true, true],
    nolights: [false, false, true, true],
    settings: [false, false, false, true],
  };
  const samples = ['room', 'light', 'climate', 'edit-layout'];
  LOCK_SCOPES.forEach((scope) => {
    samples.forEach((name, i) => assert.equal(isBlocked(on({ scope }), true, name), expected[scope][i], `${scope}: ${name}`));
  });
  ['floor', 'close-sheet', 'net-view', 'device', 'ev-period'].forEach((name) => LOCK_SCOPES.forEach((scope) => assert.equal(isBlocked(on({ scope }), true, name), false, name)));
  ['unlock', 'pin-digit', 'pin-back', 'pin-cancel'].forEach((name) => assert.equal(isBlocked(on(), true, name), false, 'the way out is never blocked'));
});

test('settings, editing, language and theme are blocked at every level', () => {
  const always = ['settings', 'edit-layout', 'plan-edit', 'menu', 'lang', 'theme-mode', 'theme-manual', 'room-config', 'room-remove', 'floor-add',
    'card-hide', 'config-export', 'config-reset', 'config-import', 'lock-toggle', 'lock-scope', 'lock-pin', 'net-source', 'ev-map', 'room-label'];
  always.forEach((name) => LOCK_SCOPES.forEach((scope) => assert.equal(isBlocked(on({ scope }), true, name), true, `${scope}: ${name}`)));
});

test('an action the lock does not know is blocked (fail closed)', () => {
  assert.equal(kindOf('some-future-action'), 'settings');
  assert.equal(isBlocked(on({ scope: 'settings' }), true, 'some-future-action'), true);
});

test('every action and input the app emits has been classified on purpose', () => {
  const tweak = (cfg) => {
    evConfigured(cfg);
    cfg.rooms.room_01.include.push('switch_06');
  };
  const lock = on({ method: 'pin', pin: hashPin('1234') });
  const html = [
    { edit: true, planEdit: true, menu: 'lang' }, { menu: 'theme', theme: { mode: 'manual', manual: 'light' } }, { menu: 'theme' },
    { view: 'energy', edit: true }, { view: 'network', edit: true }, { room: 'room_01' }, { room: 'room_02', roomCfg: true },
    { settings: true, diag: DIAG, lock }, { locked: true, lock }, { locked: true, pinPad: true, lock },
  ].map((state) => render({ tweak, state })).join('');
  const names = [...new Set((html.match(/data-(?:action|input)="([\w-]+)"/g) || []).map((m) => m.split('"')[1]))];
  // Changing or looking: both are fine, as long as nobody forgot to decide.
  const changesThings = /^(light|lights-all|power-on|climate|ac-|switch|zone|music|scene|climate-target|volume)/;
  names.forEach((name) => {
    const kind = kindOf(name);
    if (changesThings.test(name)) assert.ok(kind === 'light' || kind === 'control', `${name} controls a device but is classified as ${kind}`);
    assert.ok(new RegExp(`'?${name}'?\\s*[:(]|=== '${name}'`).test(mainSource), `no handler for ${name}`);
  });
  assert.ok(names.includes('unlock') && names.includes('pin-digit') && names.includes('lock-toggle'));
});

test('lock settings from the device are validated', () => {
  assert.deepEqual(normalizeLock(null), defaultLock());
  assert.deepEqual(normalizeLock({ enabled: 'yes', scope: 'x', method: 'y', pin: '1234', idle: 3 }), defaultLock());
  const stored = { enabled: true, scope: 'nolights', method: 'pin', pin: hashPin('0420'), idle: 10 };
  assert.deepEqual(normalizeLock(stored), stored);
  assert.equal(defaultLock().enabled, false, 'off until someone switches it on');
});

test('PIN: four digits, stored as a fingerprint, with hold as the fallback', () => {
  ['1234', '0000'].forEach((pin) => assert.ok(isPin(pin)));
  ['123', '12345', 'abcd', '', '12 4', null].forEach((pin) => assert.ok(!isPin(pin), String(pin)));
  const lock = on({ method: 'pin', pin: hashPin('2468') });
  assert.ok(checkPin(lock, '2468'));
  assert.ok(!checkPin(lock, '2469'));
  assert.ok(!checkPin(on({ method: 'pin' }), '0000'), 'no PIN set means no PIN matches');
  assert.ok(!lock.pin.includes('2468'), 'the digits are not stored');
  assert.match(hashPin('2468'), /^[0-9a-f]{8}$/);
  assert.equal(unlockMethod(lock), 'pin');
  assert.equal(unlockMethod(on({ method: 'pin' })), 'hold', 'a PIN method without a PIN can still be unlocked');
  assert.equal(unlockMethod(on()), 'hold');
});

test('a locked device shows only the way to unlock in the top bar', () => {
  const locked = render({ state: { locked: true, lock: on() } });
  assert.ok(locked.includes('data-hold="unlock"'));
  ['edit-layout', 'menu', 'settings', 'plan-edit', 'lock-now'].forEach((name) => assert.ok(!locked.includes(`data-action="${name}"`), `${name} is still shown`));
  assert.ok(locked.includes('class="plan-art"'), 'the dashboard itself stays visible');
  const pin = render({ state: { locked: true, lock: on({ method: 'pin', pin: hashPin('1234') }) } });
  assert.ok(!pin.includes('data-hold='), 'a PIN lock is not opened by holding');
  const pad = render({ state: { locked: true, pinPad: true, pinEntry: '12', lock: on({ method: 'pin', pin: hashPin('1234') }) } });
  assert.equal((pad.match(/data-action="pin-digit"/g) || []).length, 10);
  assert.equal((pad.match(/<i class="is-on">/g) || []).length, 2);
  assert.ok(!pad.includes('1234') && !pad.includes(hashPin('1234')), 'the PIN is never rendered');
});

test('locked: no settings and no room settings, whatever the state says', () => {
  const html = render({ state: { locked: true, settings: true, lock: on() } });
  assert.ok(!html.includes('data-action="lock-toggle"'));
  const room = render({ state: { locked: true, room: 'room_01', roomCfg: true, lock: on() } });
  assert.ok(!room.includes('data-input="room-label"'));
  assert.ok(room.includes('data-input="climate-target"'), 'the room itself can still be looked at');
});

test('unlocked: gear button, lock settings and a lock-now button when the lock is on', () => {
  const html = render();
  const lang = html.indexOf('data-action="menu" data-arg="lang"');
  assert.ok(html.indexOf('data-action="edit-layout"') < lang && lang < html.indexOf('data-action="settings"'), 'edit layout, language, then the gear');
  assert.ok(!html.includes('data-action="lock-now"'));
  assert.ok(render({ state: { lock: on() } }).includes('data-action="lock-now"'));
  const settings = render({ state: { settings: true, diag: DIAG, lock: on({ method: 'pin' }) } });
  ['lock-toggle', 'lock-scope', 'lock-method', 'lock-idle', 'lock-now'].forEach((name) => assert.ok(settings.includes(`data-action="${name}"`), name));
  assert.ok(settings.includes('data-input="lock-pin"') && settings.includes('type="password"'));
  assert.ok(!render({ state: { settings: true, lock: defaultLock() } }).includes('data-action="lock-scope"'), 'options appear once the lock is on');
});

test('the child lock belongs to the device, not to the exported configuration', () => {
  const text = serializeConfig(defaultConfig(createFixture()));
  assert.ok(!/lock|pin/i.test(text));
});

test('diagnostics show the browser and each check, escaped', () => {
  const html = render({ state: { settings: true, diag: DIAG } });
  assert.ok(html.includes('Test browser &lt;1.0&gt;'));
  assert.equal((html.match(/class="is-ok"/g) || []).length, 9);
  assert.equal((html.match(/class="is-fail"/g) || []).length, 1);
  assert.match(html, /some checks fail/);
  assert.ok(!render({ state: { settings: true } }).includes('diag-list'), 'no diagnostics without data from the browser');
});

test('about: the committed build info matches package.json and describes a checkout', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(BUILD.version, pkg.version, 'the version is written in package.json and mirrored here');
  assert.deepEqual([BUILD.channel, BUILD.commit, BUILD.tag], ['dev', '', '']);
  const html = render({ state: { settings: true } });
  assert.ok(html.includes(`Home dashboard ${pkg.version}`));
  assert.match(html, /development copy/);
  assert.match(html, /between releases/);
});

test('build info for an image: short commit, tag only when valid, nothing malformed', () => {
  const info = fromEnv({ GIT_SHA: 'a'.repeat(40), GIT_TAG: 'v1.2.3', GIT_MODIFIED: 'true', BUILD_CHANNEL: 'stable', BUILT_ON: '2026-11-16' }, '1.2.3');
  assert.deepEqual(info, { version: '1.2.3', channel: 'stable', commit: 'a'.repeat(12), modified: true, tag: 'v1.2.3', builtOn: '2026-11-16' });
  const bad = fromEnv({ GIT_SHA: '"; alert(1)//', GIT_TAG: '<script>', BUILD_CHANNEL: 'x', BUILT_ON: 'today' }, '0.1.0', '2026-01-02');
  assert.deepEqual(bad, { version: '0.1.0', channel: 'preview', commit: '', modified: false, tag: '', builtOn: '2026-01-02' });
  const source = moduleSource(info);
  assert.match(source, /^\/\/ Generated/);
  assert.deepEqual(JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1)), info);
});
