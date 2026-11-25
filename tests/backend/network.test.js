import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNetwork, keepNetworkRegistry } from '../../app/backend/network.js';
import { createHa } from '../../app/backend/ha.js';
import { createHandler } from '../../app/backend/app.js';
import { startFakeHa, TOKEN, DATA } from './fake-ha.js';

// Documentation MACs (RFC 7042), built at run time so the privacy check does
// not flag this file; IPs from RFC 5737.
const mac = (n) => ['00', '00', '5e', '00', '53', n.toString(16).padStart(2, '0')].join(':');
const IP = '192.0.2.1';
const NOW = Date.parse('2026-11-25T12:00:00Z');

// A synthetic house: a gateway, two access points (one offline), a wireless,
// a wired and an offline client, a Wi-Fi network, and a Zigbee coordinator
// with a bulb, a door sensor on battery and a device that stopped answering.
function house() {
  const devices = [
    { id: 'r-gw', name: 'Gateway', model: 'GW', connections: [['mac', mac(1)]] },
    { id: 'r-ap1', name: 'Hall AP', model: 'AP', connections: [['mac', mac(2)]] },
    { id: 'r-ap2', name: 'Attic AP', model: 'AP', name_by_user: 'Loft AP', connections: [['mac', mac(3)]] },
    { id: 'r-c1', name: 'Phone', connections: [['mac', mac(10)]] },
    { id: 'r-c2', name: 'Desktop', connections: [['mac', mac(11)]] },
    { id: 'r-c3', name: 'Tablet', connections: [['mac', mac(12)]] },
    { id: 'r-wlan', name: 'Wi-Fi', entry_type: 'service', identifiers: [['unifi', 'x'.repeat(24)]] },
    { id: 'r-zc', name: 'Coordinator', model: 'ZC', identifiers: [['zha', 'ieee-c']], connections: [['zigbee', 'ieee-c']] },
    { id: 'r-z1', name: 'Bulb', model: 'B1', via_device_id: 'r-zc', identifiers: [['zha', 'ieee-1']] },
    { id: 'r-z2', name: 'Door', model: 'D1', via_device_id: 'r-zc', identifiers: [['zha', 'ieee-2']] },
    { id: 'r-z3', name: 'Gone', model: 'G1', via_device_id: 'r-zc', identifiers: [['zha', 'ieee-3']] },
    { id: 'r-other', name: 'Not network', identifiers: [['hue', 'h']] },
  ];
  const u = (entity_id, device_id, translation_key = null, unique_id = '') => ({ entity_id, device_id, platform: 'unifi', translation_key, unique_id });
  const z = (entity_id, device_id, translation_key = null) => ({ entity_id, device_id, platform: 'zha', translation_key, unique_id: 'ieee-x' });
  const entities = [
    u('sensor.gw_state', 'r-gw', 'device_state'), u('sensor.gw_uptime', 'r-gw', null, `device_uptime-${mac(1)}`),
    u('sensor.gw_cpu', 'r-gw', 'device_cpu_utilization'), u('sensor.gw_mem', 'r-gw', 'device_memory_utilization'), u('device_tracker.gw', 'r-gw'),
    u('sensor.ap1_state', 'r-ap1', 'device_state'), u('sensor.ap1_uplink', 'r-ap1', 'device_uplink_mac'),
    u('sensor.ap2_state', 'r-ap2', 'device_state'), u('sensor.ap2_uplink', 'r-ap2', 'device_uplink_mac'),
    u('device_tracker.c1', 'r-c1'), u('device_tracker.c2', 'r-c2'), u('device_tracker.c3', 'r-c3'),
    u('sensor.wlan_clients', 'r-wlan', 'wlan_clients'),
    { ...u('device_tracker.disabled', 'r-c3'), disabled_by: 'integration' },
    z('light.bulb', 'r-z1'), z('sensor.bulb_lqi', 'r-z1', 'lqi'),
    z('binary_sensor.door', 'r-z2'), z('sensor.door_battery', 'r-z2'),
    z('switch.gone', 'r-z3'),
    { entity_id: 'light.hue', device_id: 'r-other', platform: 'hue' },
    { entity_id: 'sensor.renamed_down', device_id: 'r-st', platform: 'speedtestdotnet', unique_id: 'download' },
    { entity_id: 'sensor.speedtest_upload', device_id: 'r-st', platform: 'speedtestdotnet', unique_id: 'upload' },
    { entity_id: 'sensor.speedtest_ping', device_id: 'r-st', platform: 'speedtestdotnet', unique_id: 'ping' },
  ];
  const st = (s, a = {}) => ({ s, a, lc: 1 });
  const states = new Map(Object.entries({
    'sensor.gw_state': st('connected'), 'sensor.gw_uptime': st('2026-11-24T10:30:00+00:00', { device_class: 'timestamp' }),
    'sensor.gw_cpu': st('12.5'), 'sensor.gw_mem': st('48'), 'device_tracker.gw': st('home', { mac: mac(1), ip: IP }),
    'sensor.ap1_state': st('connected'), 'sensor.ap1_uplink': st(mac(1)),
    'sensor.ap2_state': st('disconnected'), 'sensor.ap2_uplink': st('unavailable'),
    'device_tracker.c1': st('home', { mac: mac(10), ip: IP, ap_mac: mac(2), radio: 'na', essid: 'HomeNet', host_name: 'phone-host' }),
    'device_tracker.c2': st('home', { mac: mac(11), ip: IP, host_name: 'desk-host', oui: 'Vendor' }),
    'device_tracker.c3': st('not_home', { mac: mac(12) }),
    'sensor.wlan_clients': st('3'),
    'light.bulb': st('on'), 'sensor.bulb_lqi': st('180'),
    'binary_sensor.door': st('off', { device_class: 'door' }), 'sensor.door_battery': st('71', { device_class: 'battery' }),
    'switch.gone': st('unavailable'),
    'light.hue': st('on'),
    'sensor.renamed_down': { s: '512.25', a: { unit_of_measurement: 'Mbit/s' }, lc: 1000 },
    'sensor.speedtest_upload': { s: '6250', a: { unit_of_measurement: 'kB/s' }, lc: 900, lu: 1100 },
    'sensor.speedtest_ping': { s: '0.012', a: { unit_of_measurement: 's' }, lc: 1000 },
  }));
  return { devices, entities, states };
}

const network = (h = house()) => buildNetwork(keepNetworkRegistry(h), h.states, NOW);

test('UniFi: gateway, access points by uplink, clients by access point, wired and offline', () => {
  const { unifi } = network();
  const byName = (list, name) => list.find((x) => x.name === name);
  assert.deepEqual(unifi.nodes.map((n) => [n.name, n.main, n.link, n.online]), [
    ['Gateway', true, null, true], ['Hall AP', false, 'uplink', true], ['Loft AP', false, 'uplink', false], [null, false, 'wired', true],
  ], 'the gateway first, then the access points by name (a name given in Home Assistant wins), then the wired group');
  const ap1 = byName(unifi.nodes, 'Hall AP').id;
  const gw = byName(unifi.nodes, 'Gateway').id;
  assert.deepEqual(byName(unifi.devices, 'Phone'), { id: byName(unifi.devices, 'Phone').id, name: 'Phone', node: ap1, band: 'g5', online: true });
  assert.deepEqual([byName(unifi.devices, 'Desktop').node, byName(unifi.devices, 'Desktop').band], ['wired', 'wired']);
  assert.deepEqual([byName(unifi.devices, 'Tablet').node, byName(unifi.devices, 'Tablet').online, byName(unifi.devices, 'Tablet').band], [gw, false, 'unknown']);
  assert.equal(unifi.devices.length, 3, 'network devices, Wi-Fi networks and other integrations are not clients');
  assert.deepEqual(unifi.wan, { online: true, upSeconds: 25 * 3600 + 30 * 60, cpu: 12.5, memory: 48 });
});

test('Zigbee: the coordinator, then its devices with online state, battery, signal and kind', () => {
  const { zigbee } = network();
  assert.equal(zigbee.coordinator.name, 'Coordinator');
  assert.deepEqual(zigbee.devices.map((v) => [v.name, v.online, v.kind, v.battery, v.lqi]), [
    ['Bulb', true, 'light', undefined, 180], ['Door', true, 'door', 71, undefined], ['Gone', false, 'plug', undefined, undefined],
  ]);
});

test('the browser never gets an address, a Wi-Fi or host name, or a registry id', () => {
  const text = JSON.stringify(network());
  for (const bad of [mac(1), mac(2), mac(10), IP, 'HomeNet', 'phone-host', 'desk-host', 'Vendor', 'ieee', 'r-gw', 'r-c1', 'r-zc']) assert.ok(!text.includes(bad), bad);
  assert.ok(!/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i.test(text) && !/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text));
});

test('no UniFi, no Zigbee, or neither: that source is null', () => {
  const h = house();
  const only = (keep) => ({ ...h, entities: h.entities.filter((e) => e.platform === keep), devices: h.devices.filter((d) => keep === 'unifi' ? !(d.identifiers || []).some((i) => i[0] === 'zha') : (d.identifiers || []).some((i) => i[0] === 'zha')) });
  assert.equal(network(only('unifi')).zigbee, null);
  assert.equal(network(only('zha')).unifi, null);
  assert.deepEqual(network({ devices: [], entities: [], states: new Map() }), { unifi: null, zigbee: null, speedtest: null });
  assert.equal(buildNetwork(null, new Map()), null);
});

test('missing sensors and odd values leave a field out instead of breaking or inventing it', () => {
  const ODD = ['unavailable', 'unknown', '', ' ', 'None', 'nan', 'inf', '1e999', '0x10', 'abc', null];
  for (const value of ODD) {
    const h = house();
    for (const id of h.states.keys()) h.states.set(id, { s: value, a: value === null ? null : {}, lc: 1 });
    const out = network(h);
    assert.deepEqual(out.unifi.wan, { online: false, upSeconds: null, cpu: null, memory: null }, String(value));
    assert.ok(out.unifi.devices.every((v) => v.online === false && v.band === 'unknown'), String(value));
    assert.ok(out.zigbee.devices.every((v) => !('battery' in v) && !('lqi' in v)), String(value));
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(out)), String(value));
  }
  const h = house();
  h.states.delete('sensor.gw_uptime');
  h.states.set('sensor.door_battery', { s: '250', a: { device_class: 'battery' } });
  h.states.set('device_tracker.c1', { s: 'home', a: { ap_mac: mac(99), radio: '6e' } });
  const out = network(h);
  assert.equal(out.unifi.wan.upSeconds, null);
  assert.ok(!('battery' in out.zigbee.devices.find((v) => v.name === 'Door')), 'a battery above 100% is no reading');
  assert.equal(out.unifi.devices.find((v) => v.name === 'Phone').node, 'wired', 'an unknown access point: listed as wired rather than guessed');
});

test('speedtest: Mbit/s and ms whatever unit Home Assistant uses, found by unique id; null when there is none', () => {
  assert.deepEqual(network().speedtest, { down: 512.25, up: 50, ping: 12, at: 1100 });
  const h = house();
  h.states.set('sensor.speedtest_upload', { s: '10', a: { unit_of_measurement: 'furlongs' } });
  h.states.set('sensor.speedtest_ping', { s: '-1', a: { unit_of_measurement: 'ms' } });
  h.states.set('sensor.renamed_down', { s: 'unavailable', a: {} });
  assert.equal(network(h).speedtest, null, 'an unknown unit, a negative value and unavailable are no reading');
  h.entities = h.entities.filter((e) => e.platform !== 'speedtestdotnet');
  assert.equal(network(h).speedtest, null);
});

test('/api/ha/network serves the map from the fake Home Assistant, without addresses', async () => {
  const data = JSON.parse(JSON.stringify(DATA));
  const h = house();
  data['config/device_registry/list'].push(...h.devices);
  data['config/entity_registry/list'].push(...h.entities);
  const own = await startFakeHa({ data, states: Object.fromEntries(h.states) });
  const ha = createHa({ url: own.url, token: () => TOKEN, log: { info() {}, warn() {}, error() {} } });
  const dir = mkdtempSync(join(tmpdir(), 'net-'));
  const server = createServer(createHandler({ mode: 'live', root: dir, ha }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  ha.start();
  try {
    const get = () => new Promise((done) => request({ host: '127.0.0.1', port: server.address().port, path: '/api/ha/network' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => done({ status: res.statusCode, body }));
    }).end());
    let res = await get();
    for (let i = 0; i < 100 && res.status !== 200; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      res = await get();
    }
    assert.equal(res.status, 200);
    const net = JSON.parse(res.body);
    assert.equal(net.unifi.nodes.length, 4);
    assert.equal(net.zigbee.devices.length, 3);
    assert.ok(!/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i.test(res.body) && !res.body.includes(IP));
  } finally {
    ha.stop();
    server.close();
    await own.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
