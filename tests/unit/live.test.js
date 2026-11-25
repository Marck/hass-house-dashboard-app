import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { createI18n } from '../../app/frontend/js/i18n/index.js';
import { defaultConfig } from '../../app/frontend/js/config.js';
import { applyConfig, homeSummary } from '../../app/frontend/js/model.js';
import { defaultLock } from '../../app/frontend/js/lock.js';
import { defaultAccess } from '../../app/frontend/js/onboard.js';
import { appView, context } from '../../app/frontend/js/views/app.js';
import { buildLive, applyStates, removeStates, kindOf, sunFrom, personOf } from '../../app/frontend/js/live.js';
import { LAYOUTS, render } from './helpers.js';
import { resolveTheme } from '../../app/frontend/js/theme.js';

const EVIL = '<img src=x onerror=1>';

// A synthetic house as the backend serves it: registry and cleaned states.
const REGISTRY = {
  floors: [{ id: 'upstairs', name: 'Upstairs', level: 1 }, { id: 'ground', name: 'Ground', level: 0 }],
  areas: [
    { id: 'living', name: 'Living room', floor: 'ground' },
    { id: 'bed', name: `Bed ${EVIL}`, floor: 'upstairs' },
    { id: 'shed', name: 'Shed', floor: null },
  ],
  devices: 3,
  entities: [
    { id: 'light.one', domain: 'light', name: `Lamp ${EVIL}`, area: 'living', hidden: false },
    { id: 'light.two', domain: 'light', name: null, area: 'bed', hidden: false },
    { id: 'light.hidden', domain: 'light', name: 'Hidden', area: 'living', hidden: true },
    { id: 'switch.one', domain: 'switch', name: 'Socket', area: 'shed', hidden: false },
    { id: 'switch.setting', domain: 'switch', name: 'Auto update', area: 'shed', hidden: false, category: 'config' },
    { id: 'binary_sensor.door', domain: 'binary_sensor', name: 'Front door', area: 'living', hidden: false },
    { id: 'binary_sensor.move', domain: 'binary_sensor', name: 'Motion', area: 'bed', hidden: false },
    { id: 'sensor.temp', domain: 'sensor', name: 'Temperature', area: 'living', hidden: false },
    { id: 'sensor.power', domain: 'sensor', name: 'Power', area: 'living', hidden: false },
    { id: 'climate.heat', domain: 'climate', name: 'Radiator', area: 'living', hidden: false },
    { id: 'media_player.spk', domain: 'media_player', name: 'Speaker', area: 'living', hidden: false },
  ],
};
const NOW = 1_000_000;
const STATES = {
  'light.one': { s: 'on', a: {}, lc: NOW },
  'light.two': { s: 'unavailable', a: { friendly_name: 'Bedside' }, lc: NOW },
  'switch.one': { s: 'off', a: {}, lc: NOW },
  'binary_sensor.door': { s: 'on', a: { device_class: 'door' }, lc: NOW },
  'binary_sensor.move': { s: 'off', a: { device_class: 'motion' }, lc: NOW - 60 },
  'sensor.temp': { s: '20.5', a: { device_class: 'temperature' }, lc: NOW },
  'sensor.power': { s: '300', a: { device_class: 'power' }, lc: NOW },
  'climate.heat': { s: 'heat', a: { hvac_modes: ['off', 'heat'], current_temperature: 19, temperature: 21, min_temp: 7, max_temp: 30 }, lc: NOW },
  'media_player.spk': { s: 'playing', a: { media_title: `Song ${EVIL}`, volume_level: 0.25, supported_features: 16384 | 4 | 32 }, lc: NOW },
  'person.b': { s: 'not_home', a: { friendly_name: 'Bo' }, lc: NOW },
  'person.a': { s: 'home', a: { friendly_name: `Al ${EVIL}` }, lc: NOW },
  'person.c': { s: `Work ${EVIL}`, a: { friendly_name: 'Cy' }, lc: NOW },
  'person.d': { s: 'unavailable', a: {}, lc: NOW },
};

function live() {
  const d = createFixture();
  buildLive(d, REGISTRY, JSON.parse(JSON.stringify(STATES)));
  applyStates(d, { 'binary_sensor.move': STATES['binary_sensor.move'] }, NOW);
  const cfg = defaultConfig(d);
  applyConfig(d, cfg);
  return { d, cfg };
}

test('the dashboard knows lights, switches, climate, speakers, doors, motion and temperatures', () => {
  assert.equal(kindOf('light.x'), 'light');
  assert.equal(kindOf('media_player.x'), 'speaker');
  assert.equal(kindOf('binary_sensor.x', { device_class: 'window' }), 'door');
  assert.equal(kindOf('binary_sensor.x', { device_class: 'occupancy' }), 'motion');
  assert.equal(kindOf('binary_sensor.x', { device_class: 'smoke' }), null);
  assert.equal(kindOf('sensor.x', { device_class: 'temperature' }), 'temp');
  assert.equal(kindOf('sensor.x', { device_class: 'power' }), null);
});

test('floors by level, areas as rooms, areas without a floor on "Other", hidden entities left out', () => {
  const { d } = live();
  assert.deepEqual(d.floors.map((fl) => fl.id), ['ground', 'upstairs', 'floor_other']);
  assert.deepEqual(d.floors.map((fl) => fl.rooms), [['living'], ['bed'], ['shed']]);
  assert.ok(!d.ha.entities['light.hidden'] && !d.ha.entities['sensor.power'] && !d.ha.entities['switch.setting'], 'hidden, unknown and settings entities left out');
  assert.deepEqual(d.rooms.living.lights, ['light.one']);
  assert.equal(d.rooms.living.temp, 20.5);
  assert.equal(d.rooms.living.door.open, true);
  assert.equal(d.rooms.bed.motion, 'recent', 'motion a minute ago');
  assert.ok(d.people.every((p) => p.id.startsWith('person.')), 'no made-up people in a real house');
  assert.ok(!Object.keys(d.lights).some((id) => id.startsWith('light_')), 'no demo lights left');
});

test('states: unavailable stays unavailable, climate and speakers are read from attributes', () => {
  const { d } = live();
  assert.equal(d.lights['light.two'].reachable, false);
  assert.equal(homeSummary(d).unreachable, 1);
  assert.deepEqual([d.climate['climate.heat'].kind, d.climate['climate.heat'].on, d.climate['climate.heat'].target], ['heating', true, 21]);
  assert.deepEqual(d.speakers['media_player.spk'].features, ['play', 'next', 'volume']);
  assert.equal(d.speakers['media_player.spk'].volume, 25);
  applyStates(d, { 'light.one': { s: 'off', a: {}, lc: NOW + 1 } });
  assert.equal(d.lights['light.one'].on, false);
  removeStates(d, ['light.one']);
  assert.equal(d.lights['light.one'].reachable, false, 'a removed entity shows as unavailable');
});

test('names from Home Assistant are shown as text, escaped, in every layout and language', () => {
  const { d, cfg } = live();
  for (const lang of ['en', 'nl']) {
    for (const layout of LAYOUTS) {
      for (const state of [{}, { room: 'living' }, { room: 'bed' }, { room: 'living', roomCfg: true }, { settings: true }, { view: 'energy' }, { view: 'network' }]) {
        const s = {
          theme: { mode: 'auto', manual: 'light' }, sun: 'above', layout, netWidth: 1000, view: 'home', room: null, roomCfg: false,
          settings: false, floor: 'ground', netTab: 'network', netView: 'all', site: 'site_01', device: null, evPeriod: 'day', menu: null,
          edit: false, planEdit: false, confirm: null, locked: false, pinPad: false, pinEntry: '', diag: null,
          grouping: false, musicSel: null, musicPick: [], onboard: null, lang, lock: defaultLock(), access: defaultAccess(), ...state,
        };
        const html = appView(context(s, d, createI18n(lang), cfg));
        assert.ok(!html.includes('<img'), `unescaped name: ${lang} ${layout} ${JSON.stringify(state)}`);
        assert.ok(!html.includes('[object Object]'), `a name object leaked: ${lang} ${layout} ${JSON.stringify(state)}`);
        assert.ok(!/NaN|undefined/.test(html.replace(/<[^>]+>/g, ' ')), `a missing value shown: ${lang} ${layout} ${JSON.stringify(state)}`);
        assert.ok(!/\[[a-z]+\.[a-zA-Z.]+\]/.test(html), `missing translation: ${lang} ${layout} ${JSON.stringify(state)}`);
      }
    }
  }
  const home = appView(context({ ...JSON.parse('{}'), theme: { mode: 'auto', manual: 'light' }, sun: 'above', layout: 'desktop', view: 'home', floor: 'ground', netTab: 'network', netView: 'all', site: 'site_01', evPeriod: 'day', musicPick: [], lang: 'en', lock: defaultLock(), access: defaultAccess() }, d, createI18n('en'), cfg));
  assert.ok(home.includes('Living room') && home.includes('still show demo data'));
});

test('Automatic theme follows the sun entity; anything else keeps the light theme', () => {
  assert.equal(sunFrom({ s: 'below_horizon' }), 'below');
  assert.equal(sunFrom({ s: 'above_horizon' }), 'above');
  for (const st of [undefined, null, { s: 'unavailable' }, { s: 'unknown' }, {}]) assert.equal(sunFrom(st), 'unavailable');
  const auto = { mode: 'auto', manual: 'light' };
  assert.equal(resolveTheme(auto, sunFrom({ s: 'below_horizon' })), 'dark');
  assert.equal(resolveTheme(auto, sunFrom(undefined)), 'light');
  assert.equal(resolveTheme({ mode: 'manual', manual: 'light' }, sunFrom({ s: 'below_horizon' })), 'light');
});

test('live: the theme menu shows the sun from Home Assistant and offers no demo switch', () => {
  const html = render({ state: { menu: 'theme', sunLive: true, sun: 'below' } });
  assert.match(html, /Sun state from Home Assistant: Sun down/);
  assert.doesNotMatch(html, /data-action="sun"/);
  assert.match(render({ state: { menu: 'theme' } }), /data-action="sun"/);
});

// Every way Home Assistant says "no value": its two states, values a broken
// integration can send, and attributes that are missing, null or of the wrong type.
const ODD = ['unavailable', 'unknown', '', ' ', 'None', 'none', 'null', 'nan', 'NaN', 'inf', '-inf', 'Infinity', '1e999', 'abc', '0x10'];
const ODD_ATTRS = [{}, null, { current_temperature: null, temperature: null }, { current_temperature: 'x', temperature: '21', hvac_modes: 'heat', min_temp: null },
  { hvac_action: 'defrosting' }, { hvac_action: 'preheating' }, { hvac_action: 'drying' }, { hvac_action: 'fan' }, { hvac_action: 'off' }, { hvac_action: 'something_new' },
  { target_temp_low: null, target_temp_high: 24 }, { volume_level: 'loud', supported_features: 'x', media_title: null }, { device_class: 'door' }];

test('no state or attribute Home Assistant can send breaks a screen or shows as 0, NaN or Infinity', () => {
  const s0 = { theme: { mode: 'auto', manual: 'light' }, sun: 'above', netWidth: 1000, view: 'home', room: null, roomCfg: false, settings: false, floor: 'ground',
    netTab: 'network', netView: 'all', site: 'site_01', device: null, evPeriod: 'day', menu: null, edit: false, planEdit: false, confirm: null, locked: false,
    pinPad: false, pinEntry: '', diag: null, grouping: false, musicSel: null, musicPick: [], onboard: null, lock: defaultLock(), access: defaultAccess() };
  const ids = Object.keys(STATES);
  for (const value of ODD) {
    for (const attrs of ODD_ATTRS) {
      const states = Object.fromEntries(ids.map((id) => [id, { s: value, a: attrs, lc: NOW }]));
      const d = createFixture();
      buildLive(d, REGISTRY, states);
      applyStates(d, states, NOW);
      const cfg = defaultConfig(d);
      applyConfig(d, cfg);
      assert.equal(d.rooms.living.temp, undefined, `a temperature of "${value}" is no temperature`);
      for (const view of ['home', 'energy']) {
        for (const [i, extra] of [{}, { room: 'living' }, { room: 'bed' }].entries()) {
          const layout = LAYOUTS[(i + ODD.indexOf(value)) % LAYOUTS.length];
          const lang = (ODD.indexOf(value) + i) % 2 ? 'nl' : 'en';
          const html = appView(context({ ...s0, view, layout, lang, ...extra }, d, createI18n(lang), cfg)).replace(/<[^>]+>/g, ' ');
          const bad = html.match(/.{0,60}(NaN|undefined|Infinity|\bnull\b).{0,20}/);
          assert.ok(!bad, `"${value}" ${JSON.stringify(attrs)} ${view} ${JSON.stringify(extra)}: ${bad && bad[0].replace(/\s+/g, ' ')}`);
        }
      }
    }
  }
});

test('the states of a whole house going unavailable (a restart) and coming back', () => {
  const { d } = live();
  const down = Object.fromEntries(Object.keys(STATES).map((id) => [id, { s: 'unavailable', a: { restored: true }, lc: NOW }]));
  applyStates(d, down, NOW);
  assert.equal(d.lights['light.one'].reachable, false);
  assert.equal(d.lights['light.one'].on, false);
  applyStates(d, JSON.parse(JSON.stringify(STATES)), NOW);
  assert.equal(d.lights['light.one'].on, true);
});

test('people show their zone only: home, away, another zone or unknown, no battery', () => {
  const { d, cfg } = live();
  assert.deepEqual(d.people.map((p) => [p.id, p.state, p.zoneKey && p.zoneKey.text]), [
    ['person.a', 'home', undefined], ['person.b', 'away', undefined], ['person.c', 'zone', `Work ${EVIL}`], ['person.d', 'unknown', undefined],
  ]);
  assert.ok(d.people.every((p) => p.battery === undefined));
  const html = appView(context({ theme: { mode: 'auto', manual: 'light' }, sun: 'above', layout: 'desktop', view: 'home', floor: 'ground', netTab: 'network', netView: 'all', site: 'site_01', evPeriod: 'day', musicPick: [], lang: 'nl', lock: defaultLock(), access: defaultAccess() }, d, createI18n('nl'), cfg));
  const people = html.slice(html.indexOf('<ul class="people"'), html.indexOf('</ul>', html.indexOf('<ul class="people"')));
  for (const word of ['thuis', 'onderweg', 'Work', 'onbekend', 'is-home', 'is-away', 'is-zone', 'is-unknown']) assert.ok(people.includes(word), word);
  assert.ok(!people.includes('person-batt') && !people.includes('<img'));
  applyStates(d, { 'person.b': { s: 'Shop', a: { friendly_name: 'Bo' } } });
  assert.equal(d.people.find((p) => p.id === 'person.b').zoneKey.text, 'Shop');
  removeStates(d, ['person.a']);
  assert.deepEqual(['state', 'nameKey'].map((k) => d.people.find((p) => p.id === 'person.a')[k]), ['unknown', { text: `Al ${EVIL}` }], 'a removed person shows as unknown, under their name');
  assert.equal(personOf('person.x', null).nameKey.text, 'x');
});
