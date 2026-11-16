import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, LANGS, missing, createI18n } from '../../app/frontend/js/i18n/index.js';
import { NET_SOURCES } from '../../app/frontend/js/config.js';
import { defaultLock, hashPin } from '../../app/frontend/js/lock.js';
import { LAYOUTS, DIAG, setup, render, evConfigured } from './helpers.js';

const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');

test('English and Dutch have the same keys and placeholders', () => {
  const en = Object.keys(dictionaries.en).sort();
  const nl = Object.keys(dictionaries.nl).sort();
  assert.deepEqual(nl, en);
  en.forEach((key) => assert.equal(placeholders(dictionaries.nl[key]), placeholders(dictionaries.en[key]), key));
});

test('values are non-empty plain text and plurals come in pairs', () => {
  LANGS.forEach((lang) => {
    Object.entries(dictionaries[lang]).forEach(([key, value]) => {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}:${key} is empty`);
      assert.ok(!/[<>]/.test(value), `${lang}:${key} contains markup`);
      if (key.endsWith('.one')) assert.ok(`${key.slice(0, -4)}.other` in dictionaries[lang], `${lang}:${key} has no .other`);
    });
  });
});

test('no German text is left from the reference design', () => {
  const words = /\b(und|nicht|oder|mit|für|auf|aus|ein|eine|heute|wohnzimmer|küche|schlafzimmer|heizung|klimaanlage|garten|geräte|übersicht|verbrauch|speicher|netzwerk|einstellungen)\b/i;
  LANGS.forEach((lang) => {
    Object.entries(dictionaries[lang]).forEach(([key, value]) => {
      assert.ok(!words.test(value) && !/[ßäü]/i.test(value), `${lang}:${key} looks German: ${value}`);
    });
  });
});

test('a missing key is reported instead of failing silently', () => {
  const before = missing.size;
  assert.equal(createI18n('en').t('no.such.key'), '[no.such.key]');
  assert.equal(missing.size, before + 1);
  missing.delete('en:no.such.key');
});

test('money uses the currency of the entity and survives a bad code', () => {
  const f = createI18n('en');
  assert.match(f.money(4.28, 'EUR'), /4\.28/);
  assert.match(f.money(4.28, 'USD'), /\$/);
  assert.equal(f.money(4.28, 'not a currency'), '4.28 not a currency');
  assert.equal(f.money(4.28, undefined), '4.28');
});

/** Every screen, sheet, menu and edit mode the app can show. */
function states(d) {
  const rooms = Object.keys(d.rooms);
  return [
    { view: 'home' }, { view: 'energy' }, { view: 'network' },
    { view: 'home', floor: 'floor_02' }, { view: 'home', floor: 'floor_03' },
    { view: 'home', menu: 'lang' }, { view: 'home', menu: 'theme' },
    { view: 'home', menu: 'theme', theme: { mode: 'manual', manual: 'dark' } },
    { view: 'home', menu: 'theme', sun: 'unavailable' },
    { view: 'home', edit: true, planEdit: true }, { view: 'energy', edit: true }, { view: 'network', edit: true },
    { view: 'network', netTab: 'availability' }, { view: 'network', site: 'site_02' },
    ...['all', ...NET_SOURCES].map((netView) => ({ view: 'network', netView })),
    { view: 'network', netView: 'unifi', device: 'dev_07' }, { view: 'network', netView: 'zigbee', device: 'dev_45' }, { view: 'network', device: 'dev_48' },
    ...['day', 'week', 'month'].map((evPeriod) => ({ view: 'energy', evPeriod })),
    { view: 'energy', settings: true }, { view: 'home', settings: true, confirm: 'config' },
    { view: 'home', settings: true, diag: DIAG, lock: { ...defaultLock(), enabled: true, method: 'pin' } },
    { view: 'home', settings: true, diag: DIAG, lock: { ...defaultLock(), enabled: true, method: 'pin', pin: hashPin('1234'), scope: 'nolights', idle: 10 } },
    { view: 'home', locked: true, lock: { ...defaultLock(), enabled: true } },
    { view: 'network', locked: true, pinPad: true, pinEntry: '12', lock: { ...defaultLock(), enabled: true, method: 'pin', pin: hashPin('1234') } },
    { view: 'home', room: 'room_01', locked: true, lock: { ...defaultLock(), enabled: true, scope: 'settings' } },
    ...rooms.map((room) => ({ view: 'home', room })),
    ...rooms.map((room) => ({ view: 'home', room, roomCfg: true, confirm: `room:${room}` })),
  ];
}

test('every screen renders in both languages and all layouts without gaps', () => {
  const tweak = (cfg) => {
    evConfigured(cfg);
    cfg.ev.map.power = 'sensor_04'; // unavailable
    cfg.rooms.room_01.include.push('switch_06');
    cfg.rooms.room_01.exclude.push('light_02');
  };
  let count = 0;
  LANGS.forEach((lang) => {
    LAYOUTS.forEach((layout) => {
      states(setup().d).forEach((state) => {
        const html = render({ lang, tweak, state: { ...state, layout } });
        const where = `${lang} ${layout} ${JSON.stringify(state)}`;
        assert.ok(html.length > 500, where);
        assert.ok(!/\[[a-z]+\.[\w.]+\]/.test(html), `untranslated key in ${where}`);
        assert.ok(!/undefined|NaN|\[object/.test(html), `broken value in ${where}`);
        assert.ok(!/\sstyle="/.test(html) && !/<script/i.test(html), `inline style or script in ${where}`);
        count += 1;
      });
    });
  });
  assert.deepEqual([...missing], []);
  assert.ok(count > 300);
});
