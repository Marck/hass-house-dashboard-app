// Synthetic demo data for the mocked Phase 1 dashboard.
// Every label is a translation key and every id is generated. Nothing here is
// derived from a real household, floor plan, network or location.
import { rng } from '../util.js';

function series(seed, count, base, spread) {
  const rand = rng(seed);
  const out = [];
  let value = base;
  for (let i = 0; i < count; i += 1) {
    value = value * 0.8 + base * 0.2 + (rand() - 0.5) * spread;
    out.push(Math.round(value * 100) / 100);
  }
  return out;
}

const light = (nameKey, extra = {}) => ({ nameKey, on: false, reachable: true, feed: null, ...extra });

const dev = (id, nameKey, icon, node, band, online, extra = {}) => ({ id, nameKey, icon, node, band, online, ...extra });

const zdev = (id, nameKey, icon, node, online, extra = {}) => dev(id, nameKey, icon, node, 'zb', online, { type: 'end', ...extra });

function motionHistory(seed, tail) {
  const rand = rng(seed);
  const slots = Array.from({ length: 36 }, () => (rand() > 0.82 ? 1 : 0));
  for (let i = 0; i < tail; i += 1) slots[35 - i] = 1;
  return slots;
}

/**
 * Build synthetic area, device and entity registries. Lights, switches,
 * speakers and climate units are devices whose entities inherit the device's area; the
 * sensors are assigned to their area directly. Every light device also has a
 * diagnostic entity, which the dashboard filters out.
 */
function buildRegistry(seed) {
  const areas = {};
  const devices = {};
  const entities = {};
  let count = 0;
  Object.keys(seed).forEach((key) => {
    const a = seed[key];
    const areaId = key === 'none' ? null : key;
    const num = key.slice(-2);
    if (areaId) areas[areaId] = { nameKey: a.nameKey };
    const viaDevice = (id, kind) => {
      count += 1;
      const tail = String(count).padStart(2, '0');
      devices[`hadev_${tail}`] = { area: areaId };
      entities[id] = { kind, device: `hadev_${tail}` };
      if (kind === 'light') entities[`diag_${tail}`] = { kind: 'signal', device: `hadev_${tail}`, category: 'diagnostic' };
    };
    (a.lights || []).forEach((id) => viaDevice(id, 'light'));
    (a.switches || []).forEach((id) => viaDevice(id, 'switch'));
    (a.climate || []).forEach((id) => viaDevice(id, 'climate'));
    (a.speakers || []).forEach((id) => viaDevice(id, 'speaker'));
    if (a.door) entities[`door_${num}`] = { kind: 'door', area: areaId, door: a.door };
    if (a.history) entities[`motion_${num}`] = { kind: 'motion', area: areaId, motion: a.motion || null, history: a.history };
    if (a.temp !== undefined) entities[`temp_${num}`] = { kind: 'temp', area: areaId, temp: a.temp };
  });
  return { areas, devices, entities };
}

/** Returns a fresh, mutable copy of the demo state. */
export function createFixture() {
  const hours = Array.from({ length: 60 }, (_, i) => (i / 59) * 14.93);
  return {
    now: { h: 14, m: 56 },
    weather: { temp: 21, conditionKey: 'weather.sunny' },
    guardKey: 'guard.nobody',
    people: [
      { id: 'person_01', nameKey: 'person.a', state: 'away', battery: 45 },
      { id: 'person_02', nameKey: 'person.b', state: 'away', battery: 95 },
    ],
    camera: { roomId: 'room_12', eventKey: 'camera.person', at: { h: 14, m: 33 } },

    // Defaults only. The user's configuration decides the real floors, rooms and order.
    floorDefs: {
      floor_01: { nameKey: 'floor.ground', tabKey: 'floor.tab.ground', rooms: ['room_01', 'room_02', 'room_03', 'room_04', 'room_05', 'room_06'] },
      floor_02: { nameKey: 'floor.upper', tabKey: 'floor.tab.upper', rooms: ['room_07', 'room_08', 'room_09', 'room_10', 'room_11'] },
      floor_03: { nameKey: 'floor.outside', tabKey: 'floor.tab.outside', rooms: ['room_12', 'room_14', 'room_13'] },
    },

    // size is [width, depth] on an abstract grid; the plan is generated, not a real floor plan.
    // areas are the Home Assistant areas a room links to by default. area_90 and light_99 do
    // not exist: they demonstrate the "area missing" and "entity not found" warnings.
    roomDefs: {
      room_01: { nameKey: 'room.living', icon: 'sofa', size: [4, 3], areas: ['area_01'] },
      room_02: { nameKey: 'room.kitchen', icon: 'pot', size: [3, 3], areas: ['area_02'], include: ['light_99'] },
      room_03: { nameKey: 'room.dining', icon: 'utensils', size: [4, 3], areas: ['area_03'] },
      room_04: { nameKey: 'room.hall', icon: 'door', size: [3, 3], areas: ['area_04'] },
      room_05: { nameKey: 'room.bath', icon: 'bath', size: [2, 2], areas: ['area_05'] },
      room_06: { nameKey: 'room.utility', icon: 'washer', size: [2, 2], areas: ['area_06', 'area_15'] },
      room_07: { nameKey: 'room.bedroom1', icon: 'bed', size: [4, 3], areas: ['area_07'] },
      room_08: { nameKey: 'room.bedroom2', icon: 'bed', size: [3, 3], areas: ['area_08'] },
      room_09: { nameKey: 'room.office', icon: 'laptop', size: [3, 3], areas: ['area_09'] },
      room_10: { nameKey: 'room.landing', icon: 'stairs', size: [1.6, 3], areas: ['area_10'] },
      room_11: { nameKey: 'room.bath2', icon: 'bath', size: [2.4, 3], areas: ['area_11'] },
      room_12: { nameKey: 'room.patio', icon: 'sun', outdoor: true, size: [4, 2.6], areas: ['area_12'] },
      room_13: { nameKey: 'room.garden', icon: 'tree', outdoor: true, size: [7, 3.4], areas: ['area_13'] },
      room_14: { nameKey: 'room.carport', icon: 'car', outdoor: true, size: [3, 2.6], areas: ['area_14', 'area_90'] },
    },
    floors: [], // filled by applyConfig()
    rooms: {}, // filled by applyConfig()

    // Stand-in for the Home Assistant area, device and entity registries.
    ha: buildRegistry({
      area_01: {
        nameKey: 'room.living', temp: 21, motion: 'now', history: motionHistory(11, 2), door: { nameKey: 'door.patio', open: false, battery: 42 },
        climate: ['climate_01', 'climate_02'], lights: ['light_01', 'light_02', 'light_03'], switches: ['switch_01'], speakers: ['media_01'],
      },
      area_02: { nameKey: 'room.kitchen', temp: 20, motion: null, history: motionHistory(12, 0), lights: ['light_04', 'light_05'], switches: ['switch_02'], speakers: ['media_02'] },
      area_03: { nameKey: 'room.dining', temp: 18, motion: 'now', history: motionHistory(13, 3), door: { nameKey: 'door.side', open: true, battery: 88 }, lights: ['light_06'], speakers: ['media_08'] },
      area_04: { nameKey: 'room.hall', motion: null, history: motionHistory(14, 0), lights: ['light_07'] },
      area_05: { nameKey: 'room.bath', temp: 19, motion: 'now', history: motionHistory(15, 1), lights: ['light_08'], climate: ['climate_03'], speakers: ['media_07'] },
      area_06: { nameKey: 'area.laundry', switches: ['switch_03'] },
      area_07: { nameKey: 'room.bedroom1', temp: 19, motion: null, history: motionHistory(17, 0), lights: ['light_09', 'light_10'], climate: ['climate_04'], speakers: ['media_03'] },
      area_08: { nameKey: 'room.bedroom2', temp: 19, motion: null, history: motionHistory(18, 0), lights: ['light_11'] },
      area_09: { nameKey: 'room.office', temp: 20, motion: 'recent', history: motionHistory(19, 0), lights: ['light_12'], switches: ['switch_04'], speakers: ['media_04'] },
      area_10: { nameKey: 'room.landing', temp: 20, lights: ['light_13'] },
      area_11: { nameKey: 'room.bath2', temp: 20, motion: null, history: motionHistory(21, 0), lights: ['light_14'] },
      area_12: { nameKey: 'room.patio', motion: 'recent', history: motionHistory(22, 0), lights: ['light_15', 'light_16'], speakers: ['media_05'] },
      area_13: { nameKey: 'room.garden', lights: ['light_17'] },
      area_14: { nameKey: 'room.carport', lights: ['light_18'], switches: ['switch_05'] },
      area_15: { nameKey: 'area.meter', lights: ['light_19'] },
      area_16: { nameKey: 'area.attic', temp: 17, lights: ['light_20'] },
      // No area: only reachable by adding the entity to a room by hand.
      // A permanent speaker group is a media player of its own, without an area.
      none: { switches: ['switch_06'], speakers: ['media_06'] },
    }),

    lights: {
      light_01: light('light.left', { feed: 'switch_01' }),
      light_02: light('light.right', { feed: 'switch_01' }),
      light_03: light('light.accent', { feed: 'switch_01' }),
      light_04: light('light.ceiling'),
      light_05: light('light.counter'),
      light_06: light('light.table'),
      light_07: light('light.ceiling'),
      light_08: light('light.mirror'),
      light_09: light('light.ceiling'),
      light_10: light('light.bedside', { reachable: false }),
      light_11: light('light.ceiling'),
      light_12: light('light.desk'),
      light_13: light('light.ceiling'),
      light_14: light('light.mirror'),
      light_15: light('light.wall'),
      light_16: light('light.string'),
      light_17: light('light.path'),
      light_18: light('light.ceiling'),
      light_19: light('light.cupboard'),
      light_20: light('light.ceiling'),
    },

    switches: {
      switch_01: { nameKey: 'switch.wall', on: false, noteKey: 'switch.feedsLights' },
      switch_02: { nameKey: 'switch.socket', on: true, noteKey: 'switch.socketNote' },
      switch_03: { nameKey: 'switch.washer', on: true, noteKey: 'switch.socketNote' },
      switch_04: { nameKey: 'switch.desk', on: true, noteKey: 'switch.socketNote' },
      switch_05: { nameKey: 'switch.charger', on: false, noteKey: 'switch.socketNote' },
      switch_06: { nameKey: 'switch.pump', on: false, noteKey: 'switch.socketNote' },
    },

    climate: {
      climate_01: { kind: 'heating', nameKey: 'climate.heating', on: false, mode: 'heat', current: 21, target: 21.5, min: 12, max: 28, step: 0.5 },
      climate_02: {
        kind: 'ac', nameKey: 'climate.ac', on: true, mode: 'heat', fan: 'auto', current: 17, target: 22, min: 16, max: 30, step: 0.5,
        presets: { night: false, quiet: false, turbo: false, swing: false },
      },
      // A plain on/off heater: Home Assistant offers no target temperature for it.
      climate_03: { kind: 'heating', nameKey: 'climate.towelRail', on: true, mode: 'heat', current: 19, settable: false },
      climate_04: {
        kind: 'ac', nameKey: 'climate.ac', on: false, mode: 'cool', fan: 'low', current: 19, target: 24, min: 16, max: 30, step: 0.5,
        presets: { night: true, quiet: false, turbo: false, swing: false },
      },
    },

    // Media players as Home Assistant would report them. Capabilities differ per
    // speaker: only some can be grouped from here, and one has sound settings.
    speakers: {
      media_01: { kind: 'speaker', nameKey: 'spk.living', state: 'paused', titleKey: 'music.track', artistKey: 'music.artist', art: 'a', volume: 13, battery: 100, loudness: true, playlistKey: 'music.playlist', features: ['play', 'prev', 'next', 'volume', 'stop', 'sound', 'playlist'] },
      // No artist: some sources report a title only.
      media_02: { kind: 'speaker', nameKey: 'spk.kitchen', state: 'playing', titleKey: 'music.radio', artistKey: null, art: null, volume: 30, features: ['play', 'volume', 'stop'] },
      // The next two mirror the group they belong to, as members do while a group plays.
      media_03: { kind: 'speaker', nameKey: 'spk.bedroom', state: 'playing', titleKey: 'music.track2', artistKey: 'music.artist2', art: 'b', volume: 22, features: ['play', 'prev', 'next', 'volume', 'stop'] },
      media_04: { kind: 'speaker', nameKey: 'spk.office', state: 'playing', titleKey: 'music.track2', artistKey: 'music.artist2', art: 'b', volume: 18, features: ['play', 'prev', 'next', 'volume', 'stop'] },
      media_05: { kind: 'speaker', nameKey: 'spk.patio', state: 'unavailable', titleKey: null, artistKey: null, art: null, volume: 0, features: ['play', 'volume', 'stop', 'group'] },
      media_06: { kind: 'group', nameKey: 'spk.groupUpper', members: ['media_03', 'media_04'], state: 'playing', titleKey: 'music.track2', artistKey: 'music.artist2', art: 'b', volume: 20, features: ['play', 'prev', 'next', 'volume', 'stop'] },
      media_07: { kind: 'speaker', nameKey: 'spk.bath', state: 'idle', titleKey: 'music.track3', artistKey: 'music.artist3', art: 'c', volume: 25, features: ['play', 'prev', 'next', 'volume', 'stop', 'group'] },
      media_08: { kind: 'speaker', nameKey: 'spk.dining', state: 'idle', titleKey: 'music.track3', artistKey: 'music.artist3', art: 'c', volume: 28, features: ['play', 'prev', 'next', 'volume', 'stop', 'group'] },
    },
    tempGroups: [], // temporary groups made in the dashboard: [{ id, members }]

    irrigation: {
      moisture: 19,
      lastWatered: { h: 11, m: 7 },
      running: null,
      zones: [
        { id: 'zone_01', nameKey: 'irr.zone1', minutes: 5 },
        { id: 'zone_02', nameKey: 'irr.zone2', minutes: 5 },
        { id: 'zone_03', nameKey: 'irr.zone3', minutes: 5 },
        { id: 'zone_04', nameKey: 'irr.zone4', minutes: 3 },
      ],
    },

    tonight: { sunset: { h: 17, m: 47 }, outside: false, stringLights: false },

    energy: {
      house: 277,
      solar: 337,
      solarPotential: 1.62,
      frequency: 51.4,
      free: 1.28,
      untilSunset: 2.3,
      generator: 'ready',
      battery: {
        soc: 100, power: 60, capacity: 16, usable: 15.8, stored: 15.8, health: 99, lastsDays: 2, lastsHours: 1, temp: 22, startAt: 15,
        history: hours.map((h) => (h < 8 ? 92 - (6 * h) / 8 : Math.min(100, 86 + (14 * (h - 8)) / 5))),
        historyUntil: 14.93,
      },
      balance: { autarky: 100, solarUsed: 70, curtailed: 2.9, forecastPct: 45, forecastDone: 6.5, forecastTotal: 14.4, consumed: 3.7 },
      consumption: {
        today: 3.7,
        base: 170,
        series: series(7, 48, 240, 90).map((v, i) => (i > 5 && i < 9 ? v + 420 : v)),
        top: [
          { nameKey: 'cons.uplink', watts: 60 },
          { nameKey: 'cons.infra', watts: 55 },
          { nameKey: 'cons.fridge', watts: 45 },
        ],
      },
    },

    // Candidate entities for the EV charging pickers, with the history a statistics
    // query would return. Phase 2 lists real entities from Home Assistant instead.
    ev: {
      entities: {
        sensor_01: { nameKey: 'ev.ent.status', cls: 'status', state: 'charging' },
        binary_01: { nameKey: 'ev.ent.plugged', cls: 'binary', state: 'on' },
        sensor_02: { nameKey: 'ev.ent.power', cls: 'power', unit: 'kW', state: 7.4 },
        sensor_03: { nameKey: 'ev.ent.meterPower', cls: 'power', unit: 'W', state: 7380 },
        sensor_04: { nameKey: 'ev.ent.oldPower', cls: 'power', unit: 'kW', state: 'unavailable' },
        sensor_05: { nameKey: 'ev.ent.energy', cls: 'energy', unit: 'kWh', state: 18.6 },
        sensor_06: { nameKey: 'ev.ent.soc', cls: 'battery', unit: '%', state: 64 },
        sensor_07: { nameKey: 'ev.ent.duration', cls: 'duration', unit: 'min', state: 151 },
        sensor_08: { nameKey: 'ev.ent.cost', cls: 'monetary', unit: 'EUR', state: 4.28 },
      },
      history: {
        day: series(31, 24, 0.9, 1.6).map((v, i) => (i > 9 && i < 15 ? Math.round(Math.max(0, v + 3) * 10) / 10 : 0)),
        week: [12.4, 0, 18.6, 7.2, 0, 22.1, 18.6],
        month: series(33, 30, 9, 14).map((v) => Math.round(Math.max(0, v) * 10) / 10),
      },
    },

    network: {
      // One Zigbee network, read through Home Assistant like everything else.
      // Its coordinator is the same physical device as the UniFi client dev_15.
      zigbee: {
        coordinatorDevice: 'dev_15',
        nodes: [
          { id: 'znode_01', nameKey: 'zb.coordinator', typeKey: 'zb.type.coordinator', link: null },
          { id: 'znode_02', nameKey: 'zb.router1', typeKey: 'zb.type.router', link: 'zigbee' },
          { id: 'znode_03', nameKey: 'zb.router2', typeKey: 'zb.type.router', link: 'zigbee' },
        ],
        devices: [
          zdev('dev_41', 'zb.motion', 'walk', 'znode_02', true, { lqi: 180, battery: 87 }),
          zdev('dev_42', 'zb.contact', 'door', 'znode_02', true, { lqi: 142, battery: 71 }),
          zdev('dev_43', 'zb.bulb', 'bulb', 'znode_02', true, { lqi: 212, type: 'router' }),
          zdev('dev_44', 'zb.climate', 'gauge', 'znode_03', true, { lqi: 96, battery: 58 }),
          zdev('dev_45', 'zb.button', 'power', 'znode_03', false, { battery: 4 }),
          zdev('dev_46', 'zb.plug', 'plug', 'znode_03', true, { lqi: 201, type: 'router' }),
          zdev('dev_47', 'zb.leak', 'drop', 'znode_01', true, { lqi: 230, battery: 64 }),
          zdev('dev_48', 'zb.valve', 'radiator', 'znode_01', true, { lqi: 188, battery: 12 }),
        ],
      },
      sites: [
        { id: 'site_01', nameKey: 'net.siteA' },
        { id: 'site_02', nameKey: 'net.siteB' },
      ],
      bySite: {
        site_01: {
          wan: {
            nameKey: 'net.wan', ping: 20, loss: 0, reach: 99.98, down: 0.2, up: 0, upHours: 3, upMinutes: 50, healthy: true,
            pingSeries: series(3, 120, 20, 5),
            pingLimit: 25,
            outages: [12, 0, 5, 12, 0, 12, 0],
            dataDown: 506, dataUp: 565, dataMonth: 13.4,
            watts: 33, kwhDay: 0.6, kwhYear: 230,
          },
          nodes: [
            { id: 'node_01', nameKey: 'net.node.main', typeKey: 'net.type.router', link: null },
            { id: 'node_02', nameKey: 'net.node.two', typeKey: 'net.type.wired', link: 'wired' },
            { id: 'node_03', nameKey: 'net.node.three', typeKey: 'net.type.mesh', link: 'mesh' },
          ],
          devices: [
            dev('dev_01', 'dev.plug', 'plug', 'node_02', 'g24', false),
            dev('dev_02', 'dev.speaker', 'speaker', 'node_02', 'unknown', true),
            dev('dev_03', 'dev.ac2', 'ac', 'node_02', 'g24', true),
            dev('dev_04', 'dev.lamp', 'bulb', 'node_02', 'g24', true),
            dev('dev_05', 'dev.ac1', 'ac', 'node_02', 'g24', true),
            dev('dev_06', 'dev.fridge', 'fridge', 'node_02', 'g24', true),
            dev('dev_07', 'dev.ac3', 'ac', 'node_02', 'g5', true, { down: 0.13, up: 0 }),
            dev('dev_08', 'dev.media', 'music', 'node_02', 'g5', true),
            dev('dev_09', 'dev.unknown', 'help', 'node_02', 'g5', true),
            dev('dev_10', 'dev.meter', 'gauge', 'node_03', 'wired', true, { down: 0, up: 0 }),
            dev('dev_11', 'dev.camera', 'camera', 'node_03', 'g24', true, { down: 0, up: 0 }),
            dev('dev_12', 'dev.pv', 'sun', 'node_03', 'wired', false),
            dev('dev_13', 'dev.batteryInverter', 'battery', 'node_03', 'wired', false),
            dev('dev_14', 'dev.esp', 'chip', 'node_01', 'g24', true),
            dev('dev_15', 'dev.zigbee', 'chip', 'node_01', 'wired', true),
            dev('dev_16', 'dev.host', 'server', 'node_01', 'wired', true, { group: 'cluster', tagKey: 'net.tag.host' }),
            dev('dev_17', 'dev.ha', 'home', 'node_01', 'wired', true, { group: 'cluster', tagKey: 'net.tag.pod', down: 1.25, up: 2 }),
            dev('dev_18', 'dev.vpn', 'lock', 'node_01', 'wired', false, { group: 'cluster', tagKey: 'net.tag.pod' }),
            dev('dev_19', 'dev.mediaServer', 'network', 'node_01', 'wired', false, { group: 'cluster', tagKey: 'net.tag.pod' }),
          ],
          active: ['dev_17', 'dev_07', 'dev_10', 'dev_11'],
        },
        site_02: {
          wan: {
            nameKey: 'net.wan', ping: 12, loss: 0, reach: 99.9, down: 1.4, up: 0.3, upHours: 41, upMinutes: 5, healthy: true,
            pingSeries: series(5, 120, 12, 4),
            pingLimit: 25,
            outages: [0, 0, 4, 0, 0, 0, 0],
            dataDown: 1210, dataUp: 240, dataMonth: 38.2,
            watts: 11, kwhDay: 0.3, kwhYear: 95,
          },
          nodes: [
            { id: 'node_11', nameKey: 'net.node.main', typeKey: 'net.type.router', link: null },
            { id: 'node_12', nameKey: 'net.node.two', typeKey: 'net.type.mesh', link: 'mesh' },
          ],
          devices: [
            dev('dev_31', 'dev.speaker', 'speaker', 'node_12', 'g5', true, { down: 0.4, up: 0.1 }),
            dev('dev_32', 'dev.lamp', 'bulb', 'node_12', 'g24', true),
            dev('dev_33', 'dev.plug', 'plug', 'node_12', 'g24', false),
            dev('dev_34', 'dev.camera', 'camera', 'node_11', 'wired', true, { down: 0, up: 0 }),
          ],
          active: ['dev_31', 'dev_34'],
        },
      },
      availability: {
        lastBackupHours: 10,
        items: [
          { key: 'avail.backup', open: true },
          { key: 'avail.tunnel', open: true },
          { key: 'avail.ups', open: true },
          { key: 'avail.dns', open: true },
          { key: 'avail.offsite', open: true },
          { key: 'avail.failover', open: true },
          { key: 'avail.restart', open: false },
          { key: 'avail.health', open: false },
        ],
      },
    },
  };
}
