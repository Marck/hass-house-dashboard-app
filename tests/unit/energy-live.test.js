import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnergy, energySensors, reading } from '../../app/frontend/js/energy-live.js';
import { acPhase } from '../../app/frontend/js/model.js';
import { appView } from '../../app/frontend/js/views/app.js';
import { climateStatus } from '../../app/frontend/js/views/room.js';
import { createI18n } from '../../app/frontend/js/i18n/index.js';
import { LAYOUTS, setup } from './helpers.js';

const AUTO = { solar: 'auto', grid: 'auto', house: 'auto', battSoc: 'auto', battPower: 'auto' };
const st = (s, unit, extra = {}) => ({ s: String(s), a: { unit_of_measurement: unit, ...extra } });

// Like a house with solar, two grid tariffs, gas and water and no battery. Synthetic ids.
const SNAP = {
  solar: [{ energy: 'sensor.solar_total', power: null, forecast: true }],
  grid: [{ import: ['sensor.in_t1', 'sensor.in_t2'], export: ['sensor.out_t1'], power: null }],
  battery: [], home: [],
  gas: [{ energy: 'sensor.gas_total', rate: null }],
  water: [{ energy: 'sensor.water_total', rate: 'sensor.water_flow' }],
  devices: [{ energy: 'sensor.a', power: null, name: null }, { energy: 'sensor.b', power: null, name: 'Desk' }, { energy: 'sensor.c', power: null, name: null }, { energy: 'sensor.d', power: null, name: null }],
  today: { 'sensor.solar_total': 6, 'sensor.in_t1': 1, 'sensor.in_t2': 1, 'sensor.out_t1': 4, 'sensor.gas_total': 1.5, 'sensor.water_total': 0.2, 'sensor.a': 0.5, 'sensor.b': 1.2, 'sensor.c': 0.1, 'sensor.d': null },
  forecast: { '2026-11-24T10:00:00': 2000, '2026-11-24T14:00:00': 3000, '2026-11-25T10:00:00': 9000 },
};
const STATES = {
  'sensor.pv_power': st(1500, 'W', { device_class: 'power' }),
  'sensor.grid_power': st(-0.4, 'kW', { device_class: 'power' }),
  'sensor.gas_total': st(1200, 'm³', { device_class: 'gas' }),
  'sensor.water_flow': st(6, 'L/min'),
};
const NOW = new Date('2026-11-24T12:00:00');

test('a house without a battery: totals, shares and power from the chosen sensors', () => {
  const { energy, utilities } = buildEnergy(SNAP, STATES, { ...AUTO, solar: 'sensor.pv_power', grid: 'sensor.grid_power' }, { 'sensor.a': 'Fridge' }, NOW);
  assert.equal(energy.solar, 1500);
  assert.equal(energy.grid, -400, 'kW is converted to W; negative is export');
  assert.equal(energy.house, 1100, 'house = solar + grid when no sensor of its own exists');
  assert.equal(energy.battery, null, 'no battery card without a battery');
  assert.deepEqual(energy.today, { solar: 6, imported: 2, exported: 4, consumed: 4 });
  assert.equal(energy.balance.autarky, 50);
  assert.equal(energy.balance.solarUsed, (100 * 2) / 6);
  assert.equal(energy.balance.forecastTotal, 5, 'only today\'s forecast hours');
  assert.equal(energy.balance.forecastDone, 2);
  assert.deepEqual(energy.consumption.top, [{ name: 'Desk', kwh: 1.2 }, { name: 'Fridge', kwh: 0.5 }, { name: 'sensor.c', kwh: 0.1 }], 'unknown totals are left out');
  assert.deepEqual(utilities.gas, { today: 1.5, unit: 'm³' });
  assert.deepEqual(utilities.water, { today: 0.2, unit: 'm³', flow: { value: 6, unit: 'L/min' } });
});

test('unavailable is never 0: one missing part makes a total unknown', () => {
  const snap = { ...SNAP, today: { ...SNAP.today, 'sensor.out_t1': null } };
  const states = { ...STATES, 'sensor.pv_power': st('unavailable', 'W', { device_class: 'power' }) };
  const { energy } = buildEnergy(snap, states, { ...AUTO, solar: 'sensor.pv_power', grid: 'sensor.grid_power' }, {}, NOW);
  assert.equal(energy.solar, null);
  assert.equal(energy.house, null);
  assert.equal(energy.today.exported, null);
  assert.equal(energy.today.consumed, null);
  assert.equal(energy.balance.autarky, null);
  assert.equal(energy.balance.solarUsed, null);
  assert.equal(reading({ x: st(5, 'BTU/h') }, 'x'), null, 'an unknown power unit is not guessed');
});

test('slots: nothing means nothing, auto uses the Energy settings in every power form', () => {
  const snap = {
    ...SNAP,
    grid: [{ import: [], export: [], power: { rate: 'sensor.g', inverted: true } }],
    battery: [{ in: 'sensor.bi', out: 'sensor.bo', power: { from: 'sensor.dis', to: 'sensor.chg' }, soc: 'sensor.soc', capacity: 10 }],
  };
  const states = { 'sensor.g': st(300, 'W'), 'sensor.dis': st(0, 'W'), 'sensor.chg': st(500, 'W'), 'sensor.soc': st(80, '%'), 'sensor.pv_power': st(900, 'W') };
  const auto = buildEnergy(snap, states, AUTO, {}, NOW).energy;
  assert.equal(auto.grid, -300, 'inverted');
  assert.deepEqual(auto.battery, { soc: 80, power: -500, capacity: 10 }, 'charging is negative');
  const off = buildEnergy(snap, states, { ...AUTO, grid: null, battSoc: null, battPower: null, solar: 'sensor.pv_power' }, {}, NOW).energy;
  assert.equal(off.grid, null);
  assert.equal(off.battery, null);
  assert.equal(off.solar, 900);
});

test('without the backend totals nothing is invented', () => {
  const { energy, utilities } = buildEnergy(null, {}, AUTO, {}, NOW);
  assert.deepEqual([energy.house, energy.solar, energy.grid, energy.battery], [null, null, null, null]);
  assert.deepEqual(energy.today, { solar: null, imported: null, exported: null, consumed: null });
  assert.equal(utilities, null);
});

test('the pickers offer power and battery sensors only', () => {
  const list = energySensors({ ...STATES, 'sensor.soc': st(50, '%', { device_class: 'battery' }), 'light.x': st('on', '', { device_class: 'power' }) }, { 'sensor.pv_power': 'Solar now' });
  assert.deepEqual(Object.keys(list).sort(), ['sensor.grid_power', 'sensor.pv_power', 'sensor.soc']);
  assert.equal(list['sensor.pv_power'].name, 'Solar now');
});

test('the live energy screen renders in both languages and every layout, with and without data', () => {
  const full = buildEnergy(SNAP, STATES, { ...AUTO, solar: 'sensor.pv_power', grid: 'sensor.grid_power' }, {}, NOW);
  const empty = buildEnergy(null, {}, AUTO, {}, NOW);
  for (const lang of ['en', 'nl']) {
    for (const layout of LAYOUTS) {
      for (const [name, data] of [['full', full], ['empty', empty]]) {
        const { c, d } = setup({ lang, state: { view: 'energy', layout } });
        Object.assign(d, data);
        const html = appView(c);
        const home = appView({ ...c, s: { ...c.s, view: 'home' } });
        assert.doesNotMatch(home, /NaN|undefined|null/, `home ${lang} ${layout} ${name}: no battery line without a battery`);
        assert.doesNotMatch(html, /NaN|undefined|null|\{[a-z]+\}/, `${lang} ${layout} ${name}`);
        assert.doesNotMatch(html, /id="card-battery"/, 'no battery, no battery card');
        assert.equal(/id="card-utilities"/.test(html), name === 'full', `${lang} ${layout} ${name}: gas and water only with data`);
      }
    }
  }
});

test('climate: what Home Assistant says the device does wins; a range is shown as a range', () => {
  const base = { on: true, mode: 'heat', current: 22, target: 20, settable: true };
  assert.equal(acPhase(base), 'reached');
  assert.equal(acPhase({ ...base, action: 'heating' }), 'heating');
  assert.equal(acPhase({ ...base, action: 'idle', current: 18 }), 'reached');
  const i18n = createI18n('en');
  const c = { t: i18n.t, f: i18n };
  assert.equal(climateStatus(c, { ...base, target: undefined, settable: false, range: [19, 24] }), 'Keeps it between 19.0° and 24.0°');
});

test('every odd state Home Assistant can send is no reading', () => {
  for (const value of ['unavailable', 'unknown', '', ' ', 'None', 'nan', 'NaN', 'inf', '-inf', 'Infinity', '1e999', 'abc', '0x10', '1,5']) {
    assert.equal(reading({ x: st(value, 'W') }, 'x'), null, value);
    const { energy } = buildEnergy(SNAP, { 'sensor.pv_power': st(value, 'W') }, { ...AUTO, solar: 'sensor.pv_power' }, {}, NOW);
    assert.equal(energy.solar, null, value);
  }
  assert.equal(reading({ x: { s: '12', a: null } }, 'x'), null, 'no unit, no reading');
  assert.equal(reading({ x: st(' 1.5e3 ', 'W') }, 'x'), 1500);
});
