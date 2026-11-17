import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ONBOARD_STEPS, needsOnboarding, startOnboarding, isLastStep, moveStep, toggleRoom, applyOnboarding, defaultAccess, normalizeAccess } from '../../app/frontend/js/onboard.js';
import { isBlocked, defaultLock } from '../../app/frontend/js/lock.js';
import { LANGS } from '../../app/frontend/js/i18n/index.js';
import { render, setup, LAYOUTS } from './helpers.js';

const mainSource = readFileSync(new URL('../../app/frontend/js/main.js', import.meta.url), 'utf8');
const at = (step, { skipRooms = [], ...access } = {}) => ({ onboard: { step: ONBOARD_STEPS.indexOf(step), skipRooms }, access: { ...defaultAccess(), ...access } });

test('only a clean device gets the setup, and an interrupted one comes back', () => {
  assert.equal(needsOnboarding(null, null), true);
  assert.equal(needsOnboarding({ version: 1 }, null), false, 'a device with a configuration was set up before');
  assert.equal(needsOnboarding({ version: 1 }, { started: true }), true, 'the first choices are stored before the setup ends');
  assert.equal(needsOnboarding(null, { done: true }), false);
  assert.equal(needsOnboarding({ version: 1 }, { started: true, done: true }), false);
  assert.equal(needsOnboarding(null, 'nonsense'), true);
});

test('steps stay within bounds', () => {
  const o = startOnboarding();
  moveStep(o, 'back');
  assert.equal(o.step, 0);
  ONBOARD_STEPS.forEach(() => moveStep(o, 'next'));
  assert.equal(o.step, ONBOARD_STEPS.length - 1);
  assert.equal(isLastStep(o), true);
});

test('rooms switched off in the setup are removed, the others are untouched', () => {
  const { cfg } = setup();
  const before = Object.keys(cfg.rooms);
  const o = startOnboarding();
  toggleRoom(o, before[0]);
  toggleRoom(o, before[1]);
  toggleRoom(o, before[1]); // changed their mind
  assert.equal(applyOnboarding(cfg, o), 1);
  assert.deepEqual(Object.keys(cfg.rooms), before.slice(1));
  assert.ok(cfg.floors.every((fl) => !fl.rooms.includes(before[0])));
  assert.equal(applyOnboarding(cfg, startOnboarding()), 0);
});

test('every step renders in both languages and layouts, with its own controls', () => {
  const expect = {
    welcome: ['data-action="lang"', 'data-action="theme-mode"'],
    connection: ['data-action="access-connect"'],
    signin: ['data-action="access-signin"', 'data-action="access-pair"'],
    rooms: ['data-action="onboard-room"'],
    features: ['data-action="speakers-flag"', 'data-action="card-toggle"', 'data-action="net-source"'],
    lock: ['data-action="lock-toggle"'],
  };
  LANGS.forEach((lang) => LAYOUTS.forEach((layout) => ONBOARD_STEPS.forEach((step) => {
    [{}, { connected: true, paired: true, signin: 'proxy', skipRooms: ['room_01'] }].forEach((extra) => {
      const html = render({ lang, state: { ...at(step, extra), layout } });
      assert.ok(!/\[[a-z]+\.[\w.]+\]|undefined|NaN|\[object/.test(html), `${lang} ${layout} ${step}`);
      assert.match(html, /class="sheet onboard"/);
      ['onboard-back', 'onboard-skip', 'onboard-next'].forEach((a) => assert.ok(html.includes(`data-action="${a}"`), `${step} ${a}`));
      // Once paired, the approve button is gone: there is nothing left to approve.
      expect[step].filter((mark) => !(extra.paired && mark.includes('access-pair'))).forEach((mark) => assert.ok(html.includes(mark), `${step} lacks ${mark}`));
    });
  })));
});

test('the steps that are only designs say so', () => {
  ['connection', 'signin'].forEach((step) => assert.match(render({ state: at(step) }), /connects to nothing and protects nothing/, step));
  ['welcome', 'rooms', 'features', 'lock'].forEach((step) => assert.ok(!render({ state: at(step) }).includes('protects nothing'), step));
  assert.ok(!render({ state: at('connection') }).includes('type="password"'), 'no credential is asked for');
});

test('a locked device shows no setup', () => {
  const locked = render({ state: { ...at('welcome'), locked: true, lock: { ...defaultLock(), enabled: true } } });
  assert.ok(!locked.includes('class="sheet onboard"'));
  assert.equal(isBlocked({ ...defaultLock(), enabled: true }, true, 'onboard-next'), true);
  assert.ok(!render().includes('class="sheet onboard"'), 'no setup unless it was started');
});

test('every setup action has a handler', () => {
  const html = ONBOARD_STEPS.map((step) => render({ state: at(step) })).join('') + render({ state: { settings: true } });
  const names = [...new Set((html.match(/data-action="((?:onboard|access|rooms)-[\w-]+)"/g) || []).map((m) => m.split('"')[1]))];
  assert.ok(names.length >= 8, names.join());
  names.forEach((name) => assert.ok(new RegExp(`'${name}'\\s*[:(]`).test(mainSource), `no handler for ${name}`));
});

test('everything the setup offers is in the settings, and nothing there restarts it', () => {
  const settings = render({ state: { settings: true } });
  const inSetup = new Set();
  ONBOARD_STEPS.forEach((step) => (render({ state: at(step) }).split('class="sheet onboard"')[1].match(/data-action="([\w-]+)"/g) || [])
    .forEach((m) => inSetup.add(m.split('"')[1])));
  // Navigation belongs to the setup itself; rooms are picked there and edited from the settings.
  ['onboard-back', 'onboard-skip', 'onboard-next', 'onboard-room'].forEach((name) => inSetup.delete(name));
  assert.ok(inSetup.size >= 8, [...inSetup].join());
  inSetup.forEach((name) => assert.ok(settings.includes(`data-action="${name}"`), `${name} is in the setup but not in the settings`));
  assert.match(settings, /data-action="rooms-edit"/);
  assert.ok(!/onboard-start|Run setup again/.test(settings));
  ONBOARD_STEPS.forEach((step) => assert.match(render({ state: at(step) }), /also in the settings/, step));
});

test('the connection and sign-in choices are validated when read back', () => {
  assert.deepEqual(normalizeAccess(null), defaultAccess());
  assert.deepEqual(normalizeAccess({ connected: 'yes', signin: 'magic', paired: 1 }), defaultAccess());
  const stored = { connected: true, signin: 'proxy', paired: true };
  assert.deepEqual(normalizeAccess(stored), stored);
});
