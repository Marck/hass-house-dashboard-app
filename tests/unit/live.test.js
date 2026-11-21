import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { createI18n } from '../../app/frontend/js/i18n/index.js';
import { defaultConfig } from '../../app/frontend/js/config.js';
import { applyConfig, homeSummary } from '../../app/frontend/js/model.js';
import { defaultLock } from '../../app/frontend/js/lock.js';
import { defaultAccess } from '../../app/frontend/js/onboard.js';
import { appView, context } from '../../app/frontend/js/views/app.js';
import { buildLive, applyStates, removeStates, kindOf } from '../../app/frontend/js/live.js';
import { LAYOUTS } from './helpers.js';

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
  assert.ok(!d.ha.entities['light.hidden'] && !d.ha.entities['sensor.power']);
  assert.deepEqual(d.rooms.living.lights, ['light.one']);
  assert.equal(d.rooms.living.temp, 20.5);
  assert.equal(d.rooms.living.door.open, true);
  assert.equal(d.rooms.bed.motion, 'recent', 'motion a minute ago');
  assert.deepEqual(d.people, [], 'no made-up people in a real house');
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
