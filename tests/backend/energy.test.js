import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHa } from '../../app/backend/ha.js';
import { createEnergy, shapePrefs, statIds, shapeForecast } from '../../app/backend/energy.js';
import { createHandler } from '../../app/backend/app.js';
import { startFakeHa, TOKEN, DATA } from './fake-ha.js';

const fast = { setTimeout: (f, ms) => setTimeout(f, ms / 100), clearTimeout, setInterval: (f, ms) => setInterval(f, ms / 100), clearInterval };
const quiet = { info() {}, warn() {}, error() {} };
const until = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 10));
  }
};

// Synthetic Energy settings: two grid tariffs (older shape), solar with a forecast,
// gas, water, devices; no battery. Ids are made up.
const PREFS = {
  energy_sources: [
    { type: 'solar', stat_energy_from: 'sensor.solar_total', config_entry_solar_forecast: ['entry_01'] },
    { type: 'grid', flow_from: [{ stat_energy_from: 'sensor.import_t1' }, { stat_energy_from: 'sensor.import_t2' }], flow_to: [{ stat_energy_to: 'sensor.export_t1' }], cost_adjustment_day: 0 },
    { type: 'gas', stat_energy_from: 'sensor.gas_total' },
    { type: 'water', stat_energy_from: 'sensor.water_total', stat_rate: 'sensor.water_flow' },
  ],
  device_consumption: [{ stat_consumption: 'sensor.fridge_energy' }, { stat_consumption: 'sensor.desk_energy', name: 'Desk' }],
};
const CHANGE = { 'sensor.solar_total': 6.5, 'sensor.import_t1': 1.25, 'sensor.import_t2': 0.75, 'sensor.export_t1': 3.1, 'sensor.gas_total': 1.8, 'sensor.water_total': 0.21, 'sensor.fridge_energy': 0.9 };

test('Energy settings in the current and the older shape, batteries in every power form', () => {
  const shape = shapePrefs({
    energy_sources: [
      { type: 'grid', stat_energy_from: 'sensor.in', stat_energy_to: 'sensor.out', stat_rate: 'sensor.grid_power' },
      { type: 'grid', flow_from: [{ stat_energy_from: 'sensor.in_t1' }], flow_to: [], power: [{ stat_rate: 'sensor.legacy_power' }] },
      { type: 'battery', stat_energy_from: 'sensor.b_out', stat_energy_to: 'sensor.b_in', stat_soc: 'sensor.b_soc', capacity: 10, power_config: { stat_rate_inverted: 'sensor.b_power' } },
      { type: 'battery', stat_energy_from: 'sensor.c_out', stat_energy_to: 'sensor.c_in', power_config: { stat_rate_from: 'sensor.c_dis', stat_rate_to: 'sensor.c_chg' } },
      { type: 'home', stat_energy_to: 'sensor.home_total', stat_rate: 'sensor.home_power' },
    ],
  });
  assert.deepEqual(shape.grid, [
    { import: ['sensor.in'], export: ['sensor.out'], power: { rate: 'sensor.grid_power' } },
    { import: ['sensor.in_t1'], export: [], power: { rate: 'sensor.legacy_power' } },
  ]);
  assert.deepEqual(shape.battery[0], { out: 'sensor.b_out', in: 'sensor.b_in', power: { rate: 'sensor.b_power', inverted: true }, soc: 'sensor.b_soc', capacity: 10 });
  assert.deepEqual(shape.battery[1].power, { from: 'sensor.c_dis', to: 'sensor.c_chg' });
  assert.deepEqual(shape.home, [{ energy: 'sensor.home_total', power: { rate: 'sensor.home_power' } }]);
  assert.deepEqual(shapePrefs(null), { solar: [], grid: [], battery: [], gas: [], water: [], home: [], devices: [] });
});

test('only statistic ids in the entity id format are used; anything else is dropped', () => {
  const shape = shapePrefs({
    energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.a","type":"call_service' }, { type: 'gas', stat_energy_from: 'Sensor.Upper' }, { type: 'water', stat_energy_from: '../etc' }],
    device_consumption: [{ stat_consumption: 'sensor.ok', name: 'x'.repeat(200) }, { stat_consumption: 42 }],
  });
  assert.deepEqual(statIds(shape), ['sensor.ok']);
  assert.equal(shape.devices[0].name.length, 80);
});

test('the forecast adds its entries per hour and ignores broken values', () => {
  assert.deepEqual(shapeForecast({ a: { wh_hours: { '2026-11-24T10:00:00+01:00': 300, bad: 5 } }, b: { wh_hours: { '2026-11-24T10:00:00+01:00': 200, '2026-11-24T11:00:00+01:00': 'x' } } }),
    { '2026-11-24T10:00:00+01:00': 500 });
  assert.equal(shapeForecast({}), null);
});

test("today's totals come from Home Assistant with fixed parameters, and are served at /api/ha/energy", async () => {
  const data = {
    ...DATA,
    'energy/get_prefs': PREFS,
    'energy/solar_forecast': { entry_01: { wh_hours: { '2026-11-24T12:00:00+01:00': 900 } } },
    'recorder/statistic_during_period': (msg) => (msg.statistic_id in CHANGE ? { change: CHANGE[msg.statistic_id] } : new Error('no_statistics')),
  };
  const fake = await startFakeHa({ data });
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet, timers: fast });
  const energy = createEnergy({ ha, timers: fast, log: quiet });
  const dir = mkdtempSync(join(tmpdir(), 'hhd-energy-'));
  const server = createServer(createHandler({ mode: 'live', root: dir, ha, energy }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const get = (path) => new Promise((done) => request({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => done({ status: res.statusCode, body }));
  }).end());
  try {
    assert.equal((await get('/api/ha/energy')).status, 503, 'not loaded yet');
    ha.start();
    energy.start();
    await until(() => energy.snapshot());
    const snap = JSON.parse((await get('/api/ha/energy')).body);
    assert.equal(snap.today['sensor.import_t2'], 0.75);
    assert.equal(snap.today['sensor.desk_energy'], null, 'a statistic without data is unavailable, not 0');
    assert.deepEqual(snap.forecast, { '2026-11-24T12:00:00+01:00': 900 });
    assert.deepEqual(snap.battery, []);
    assert.equal(snap.water[0].rate, 'sensor.water_flow');
    const stats = fake.sent.filter((m) => m.type === 'recorder/statistic_during_period');
    assert.deepEqual(stats.map((m) => m.statistic_id).sort(), statIds(shapePrefs(PREFS)).sort(), 'only statistics named in the Energy settings');
    for (const m of stats) {
      assert.deepEqual(Object.keys(m).sort(), ['calendar', 'id', 'statistic_id', 'type', 'types', 'units']);
      assert.deepEqual(m.types, ['change']);
      assert.deepEqual(m.calendar, { period: 'day' });
      assert.deepEqual(m.units, { energy: 'kWh', volume: 'm³' });
    }
    assert.ok(!JSON.stringify(snap).includes(TOKEN) && !JSON.stringify(snap).includes(String(fake.port)));
  } finally {
    energy.stop();
    ha.stop();
    server.close();
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a read command cannot be turned into another command by its parameters', async () => {
  const fake = await startFakeHa({ data: { ...DATA, 'energy/get_prefs': () => ({}) } });
  const ha = createHa({ url: fake.url, token: () => TOKEN, log: quiet, timers: fast });
  ha.start();
  try {
    await until(() => ha.status().state === 'connected');
    await ha.command('energy/get_prefs', { type: 'call_service', id: 999, domain: 'light' });
    const m = fake.sent.find((x) => x.type === 'energy/get_prefs');
    assert.ok(m && m.id !== 999, 'the id and the type are set last, by the connection');
    assert.ok(!fake.received.includes('call_service'));
  } finally {
    ha.stop();
    await fake.close();
  }
});
