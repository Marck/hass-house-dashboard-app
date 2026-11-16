import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { defaultConfig, edit } from '../../app/frontend/js/config.js';
import {
  applyConfig, roomEntities, entityArea, roomSummary, homeSummary, lightState, netModel, netStats, evStats, acPhase, commands,
} from '../../app/frontend/js/model.js';
import { resolveTheme, MODES, SUN_STATES } from '../../app/frontend/js/theme.js';
import { setup, evConfigured } from './helpers.js';

test('theme: dark only by manual choice or when the sun is known to be down', () => {
  const expected = {
    'manual/light': 'light', 'manual/dark': 'dark', 'auto/above': 'light', 'auto/below': 'dark', 'auto/unavailable': 'light', off: 'light',
  };
  MODES.forEach((mode) => {
    ['light', 'dark'].forEach((manual) => {
      SUN_STATES.forEach((sun) => {
        const key = mode === 'manual' ? `manual/${manual}` : mode === 'auto' ? `auto/${sun}` : 'off';
        assert.equal(resolveTheme({ mode, manual }, sun), expected[key], `${mode} ${manual} ${sun}`);
      });
    });
  });
  assert.equal(resolveTheme({ mode: 'nonsense' }, 'below'), 'light');
});

test('an entity inherits its area from its device unless it has its own', () => {
  const ha = { devices: { dev: { area: 'area_a' } } };
  assert.equal(entityArea(ha, { device: 'dev' }), 'area_a');
  assert.equal(entityArea(ha, { device: 'dev', area: 'area_b' }), 'area_b', 'the entity wins');
  assert.equal(entityArea(ha, { device: 'gone' }), null);
  assert.equal(entityArea(ha, {}), null);
});

test('a room shows the entities of its linked areas, directly and through devices', () => {
  const { d, cfg } = setup();
  const living = roomEntities(d, cfg.rooms.room_01);
  const by = Object.fromEntries(living.list.map((e) => [e.id, e]));
  assert.equal(by.light_01.via, 'device');
  assert.equal(by.door_01.via, 'area');
  assert.equal(by.media_01.via, 'device', 'a speaker belongs to a room like any other entity');
  assert.equal(living.list.length, 10);
  assert.equal(living.filtered, 3, 'one diagnostic entity per light is left out');
  assert.ok(!living.list.some((e) => e.kind === 'signal'));
  assert.deepEqual(living.missingAreas, []);

  // One room, two areas.
  assert.deepEqual(roomEntities(d, cfg.rooms.room_06).list.map((e) => e.id).sort(), ['light_19', 'switch_03']);
});

test('manual inclusion, exclusion and missing references', () => {
  const { d, cfg } = setup({ tweak: (c) => {
    c.rooms.room_01.include.push('switch_06');
    c.rooms.room_01.exclude.push('light_02');
  } });
  const living = roomEntities(d, cfg.rooms.room_01);
  assert.equal(living.list.find((e) => e.id === 'switch_06').via, 'manual');
  assert.ok(living.list.find((e) => e.id === 'light_02').excluded);
  assert.deepEqual(d.rooms.room_01.lights, ['light_01', 'light_03'], 'an excluded entity is not shown');
  assert.ok(d.rooms.room_01.switches.includes('switch_06'));

  assert.deepEqual(d.rooms.room_14.missingAreas, ['area_90'], 'a deleted area is reported');
  assert.deepEqual(d.rooms.room_14.lights, ['light_18'], 'and the rest of the room still works');
  assert.deepEqual(d.rooms.room_02.missingEntities, ['light_99'], 'a configured entity that does not exist is reported');
  assert.ok(roomSummary(d, 'room_02').attention);
  assert.equal(roomSummary(d, 'room_08').missing, 0);
});

test('an unlinked room is empty and unconfigured parts are simply absent', () => {
  const { d } = setup({ tweak: (c) => edit.unlinkArea(c, 'room_01', 'area_01') });
  const room = d.rooms.room_01;
  assert.deepEqual([room.lights, room.switches, room.climate], [[], [], []]);
  assert.deepEqual([room.door, room.temp, room.history], [undefined, undefined, undefined]);
  assert.deepEqual([room.missingAreas, room.missingEntities], [[], []], 'not configured is not an error');
});

test('home summary counts each light once and only lights that are in a room', () => {
  const { d } = setup();
  const sum = homeSummary(d);
  assert.equal(sum.lightsOn, 0);
  assert.equal(sum.unreachable, 4, 'three behind the wall switch plus one unreachable');
  assert.equal(lightState(d, 'light_01'), 'unavailable');
  d.switches.switch_01.on = true;
  commands.toggleLight(d, 'light_01');
  assert.equal(homeSummary(d).lightsOn, 1);
  assert.equal(commands.toggleLight(d, 'light_10'), false);
});

test('heating has the same target control as the AC', () => {
  const { d } = setup();
  const heating = d.climate.climate_01;
  assert.equal(heating.kind, 'heating');
  commands.setTarget(d, 'climate_01', 23.26);
  assert.equal(heating.target, 23.5, 'rounded to the step');
  commands.setTarget(d, 'climate_01', 99);
  assert.equal(heating.target, heating.max);
  commands.setTarget(d, 'climate_01', 'abc');
  assert.equal(heating.target, heating.max, 'a bad value changes nothing');
  heating.on = true;
  assert.equal(acPhase(heating), 'heating');
  commands.setTarget(d, 'climate_01', heating.min);
  assert.equal(acPhase(heating), 'reached');

  const plain = d.climate.climate_03;
  commands.setTarget(d, 'climate_03', 25);
  assert.equal(plain.target, undefined, 'no fake setpoint for an on/off heater');
  assert.equal(acPhase(plain), 'on');
  commands.setTarget(d, 'climate_02', 15);
  assert.equal(d.climate.climate_02.target, 16);
});

test('network: All merges the sources and shows the shared coordinator once', () => {
  const d = createFixture();
  const cfg = defaultConfig(d);
  const all = netModel(d, cfg, 'all', 'site_01');
  const ids = all.devices.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('dev_15'), 'the coordinator is not also listed as a UniFi client');
  assert.equal(all.nodes[all.nodes.length - 1].src, 'both');
  assert.deepEqual([netStats(all).unifi, netStats(all).zigbee], [18, 8]);
  assert.ok(all.devices.every((v) => all.nodes.some((n) => n.id === v.node)), 'every device hangs off a node that is shown');

  const unifi = netModel(d, cfg, 'unifi', 'site_01');
  assert.equal(unifi.devices.length, 19);
  assert.ok(unifi.wan);
  const zigbee = netModel(d, cfg, 'zigbee', 'site_01');
  assert.deepEqual([zigbee.devices.length, zigbee.nodes.length, zigbee.wan], [8, 3, null]);
  const st = netStats(zigbee);
  assert.deepEqual([st.online, st.offline, st.battery, st.lowBattery], [7, 1, 6, 2]);
  assert.equal(st.online + st.offline, zigbee.devices.length);
});

test('network: with one source, All shows just that source', () => {
  const d = createFixture();
  const cfg = defaultConfig(d);
  edit.toggleNetSource(cfg, 'unifi');
  const all = netModel(d, cfg, 'all', 'site_01');
  assert.deepEqual(all.sources, ['zigbee']);
  assert.equal(all.devices.length, 8);
  edit.toggleNetSource(cfg, 'unifi');
  edit.toggleNetSource(cfg, 'zigbee');
  assert.deepEqual(netModel(d, cfg, 'all', 'site_02').sources, ['unifi']);
});

test('EV statistics: only what is configured, with units normalized', () => {
  const { d, cfg } = setup();
  assert.deepEqual(evStats(d, cfg), {}, 'nothing configured, nothing shown');

  evConfigured(cfg);
  let stats = evStats(d, cfg);
  assert.equal(stats.status.charging, true);
  assert.ok(Math.abs(stats.power.value - 7.38) < 1e-9, 'W becomes kW');
  assert.equal(stats.energy.value, 18.6);
  assert.equal(stats.soc.value, 64);
  assert.equal(stats.duration.minutes, 151);
  assert.deepEqual(stats.cost, { id: 'sensor_99', error: 'missing' }, 'a configured entity that does not exist is an error');

  cfg.ev.map.power = 'sensor_04';
  cfg.ev.map.cost = 'sensor_08';
  cfg.ev.map.status = 'binary_01';
  cfg.ev.hide.push('soc');
  stats = evStats(d, cfg);
  assert.deepEqual(stats.power, { id: 'sensor_04', error: 'unavailable' }, 'unavailable is never reported as zero');
  assert.deepEqual(stats.cost, { id: 'sensor_08', value: 4.28, currency: 'EUR' });
  assert.equal(stats.status.charging, true);
  assert.ok(!('soc' in stats), 'a hidden statistic is absent');

  d.ev.entities.sensor_05.unit = 'Wh';
  d.ev.entities.sensor_05.state = 18600;
  d.ev.entities.sensor_07.unit = 'furlongs';
  stats = evStats(d, cfg);
  assert.equal(stats.energy.value, 18.6);
  assert.equal(stats.duration.error, 'unavailable', 'an unknown unit is not guessed');
});

test('applyConfig keeps data consistent after every kind of change', () => {
  const d = createFixture();
  const cfg = defaultConfig(d);
  edit.setRoomFloor(cfg, 'room_09', 'floor_01');
  edit.moveRoom(cfg, 'room_09', 'up');
  edit.removeRoom(cfg, 'room_12');
  applyConfig(d, cfg);
  assert.equal(d.rooms.room_09.floor, 'floor_01');
  assert.ok(!d.rooms.room_12);
  d.floors.forEach((fl) => fl.rooms.forEach((id) => {
    assert.equal(d.rooms[id].floor, fl.id);
    assert.equal(d.rooms[id].geom.length, 4);
  }));
});
