import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import {
  CARDS, LABEL_MAX, defaultConfig, normalizeConfig, parseConfig, serializeConfig, cleanLabel, edit, floorOf, hiddenCards, netViews,
} from '../../app/frontend/js/config.js';
import { applyConfig } from '../../app/frontend/js/model.js';

const fresh = () => {
  const d = createFixture();
  return { d, cfg: defaultConfig(d) };
};

/** The invariants every configuration must keep, whatever was done to it. */
function assertValid(cfg) {
  assert.ok(cfg.floors.length >= 1);
  const placed = cfg.floors.reduce((all, fl) => all.concat(fl.rooms), []);
  assert.equal(new Set(placed).size, placed.length, 'a room is on two floors');
  assert.deepEqual([...placed].sort(), Object.keys(cfg.rooms).sort(), 'rooms and floors disagree');
  Object.keys(CARDS).forEach((view) => cfg.cards[view].forEach((id) => assert.ok(CARDS[view].includes(id))));
}

test('defaults: every room on one floor, optional cards off', () => {
  const { cfg } = fresh();
  assertValid(cfg);
  assert.equal(cfg.floors.length, 3);
  assert.ok(!cfg.cards.energy.includes('ev'));
  assert.deepEqual(hiddenCards(cfg, 'energy'), ['ev']);
  assert.deepEqual(Object.values(cfg.ev.map), [null, null, null, null, null, null]);
});

test('normalizeConfig turns anything into a valid configuration', () => {
  const { d, cfg } = fresh();
  const garbage = [
    null, undefined, 'text', 42, [], {}, { version: 99 }, { version: 1 }, { version: 1, floors: 'x' }, { version: 1, floors: [] },
    { version: 1, floors: [{ id: 'floor_01', rooms: ['room_01', 'nope', 7] }], rooms: { room_01: 'x' } },
    { version: 1, floors: [{ id: 'floor_09', label: '', rooms: [] }] }, // a custom floor without a name
    { version: 1, floors: [{ id: 'floor_01', rooms: ['room_01'] }, { id: 'floor_01', rooms: ['room_02'] }], rooms: { room_01: {}, room_02: {} } },
    { version: 1, floors: [{ id: '../x', rooms: [] }], rooms: {}, cards: { home: ['nope', 'music', 'music'] }, ev: { map: { power: {} }, hide: ['x'] }, net: 1 },
  ];
  garbage.forEach((raw) => assertValid(normalizeConfig(raw, d)));
  assert.deepEqual(normalizeConfig(null, d), cfg);

  const twice = normalizeConfig({
    version: 1,
    floors: [{ id: 'floor_01', rooms: ['room_01'] }, { id: 'floor_02', rooms: ['room_01', 'room_02'] }],
    rooms: { room_01: { areas: ['area_01', 'area_01', 'BAD ID'] }, room_02: {}, room_03: {} },
    cards: { home: ['music', 'nope', 'music'] },
  }, d);
  assert.deepEqual(twice.floors.map((fl) => fl.rooms), [['room_01'], ['room_02']]);
  assert.deepEqual(Object.keys(twice.rooms), ['room_01', 'room_02'], 'a room on no floor is dropped');
  assert.deepEqual(twice.rooms.room_01.areas, ['area_01']);
  assert.deepEqual(twice.cards.home, ['music']);
});

test('labels are trimmed, cleaned and capped', () => {
  assert.equal(cleanLabel('  Attic\u0007\n room  '), 'Attic room');
  assert.equal(cleanLabel('x'.repeat(200)).length, LABEL_MAX);
  assert.equal(cleanLabel(null), '');
});

test('export and import round trip, and bad files are refused', () => {
  const { d, cfg } = fresh();
  edit.addFloor(cfg, 'Attic');
  edit.hideCard(cfg, 'home', 'music');
  assert.deepEqual(parseConfig(serializeConfig(cfg), d), cfg);
  ['not json', '[]', '{}', '{"version":99,"floors":[]}', '{"version":1}', 'null'].forEach((text) => assert.equal(parseConfig(text, d), null, text));
});

test('floors: add, rename, reorder, and remove only when empty', () => {
  const { d, cfg } = fresh();
  const attic = edit.addFloor(cfg, '  Attic ');
  assert.equal(attic, 'floor_04');
  assert.equal(cfg.floors[3].label, 'Attic');
  assert.equal(edit.addFloor(cfg, '   '), null, 'a floor needs a name');
  assert.ok(edit.renameFloor(cfg, d, attic, 'Loft'));
  assert.ok(!edit.renameFloor(cfg, d, attic, ''), 'a custom floor cannot lose its name');
  assert.ok(edit.renameFloor(cfg, d, 'floor_01', ''), 'a default floor falls back to its built-in name');
  assert.ok(edit.moveFloor(cfg, attic, 'up'));
  assert.deepEqual(cfg.floors.map((fl) => fl.id), ['floor_01', 'floor_02', 'floor_04', 'floor_03']);
  assert.ok(!edit.moveFloor(cfg, 'floor_01', 'up'));
  assert.ok(!edit.removeFloor(cfg, 'floor_01'), 'a floor with rooms stays');
  assert.equal(Object.keys(cfg.rooms).length, 14, 'no room was deleted');
  assert.ok(edit.removeFloor(cfg, attic));
  assertValid(cfg);

  const one = fresh().cfg;
  one.floors = [{ id: 'floor_01', label: '', rooms: [] }];
  one.rooms = {};
  assert.ok(!edit.removeFloor(one, 'floor_01'), 'the last floor stays');
});

test('rooms: add, rename, reorder, move between floors, remove', () => {
  const { d, cfg } = fresh();
  assert.ok(edit.moveRoom(cfg, 'room_02', 'up'));
  assert.deepEqual(cfg.floors[0].rooms.slice(0, 2), ['room_02', 'room_01']);
  assert.ok(!edit.moveRoom(cfg, 'room_02', 'up'));
  assert.ok(edit.setRoomFloor(cfg, 'room_09', 'floor_01'));
  assert.equal(floorOf(cfg, 'room_09').id, 'floor_01');
  assert.ok(!edit.setRoomFloor(cfg, 'room_09', 'floor_01'));
  assert.ok(!edit.setRoomFloor(cfg, 'room_09', 'floor_99'));
  const id = edit.addRoom(cfg, 'floor_02', 'Studio');
  assert.equal(id, 'room_15');
  assert.ok(!edit.renameRoom(cfg, d, id, ' '), 'a custom room cannot lose its name');
  assert.ok(edit.renameRoom(cfg, d, 'room_01', ''));
  assert.equal(edit.addRoom(cfg, 'floor_99', 'X'), null);
  assert.ok(edit.removeRoom(cfg, id));
  assert.ok(!edit.removeRoom(cfg, id));
  assertValid(cfg);
});

test('acceptance: an Attic floor with a room linked to an area, using only edit operations', () => {
  const { d, cfg } = fresh();
  const floor = edit.addFloor(cfg, 'Attic');
  const room = edit.addRoom(cfg, floor, 'Storage');
  assert.ok(edit.linkArea(cfg, room, 'area_16'));
  assert.ok(!edit.linkArea(cfg, room, 'area_16'), 'no duplicate link');
  applyConfig(d, cfg);
  assert.equal(d.floors[3].label, 'Attic');
  assert.deepEqual(d.rooms[room].lights, ['light_20']);
  assert.equal(d.rooms[room].temp, 17);
  // It survives a reload, which is a serialize and parse.
  const again = parseConfig(serializeConfig(cfg), d);
  assert.deepEqual(again, cfg);
});

test('entities: include, exclude and drop', () => {
  const { cfg } = fresh();
  assert.ok(edit.includeEntity(cfg, 'room_01', 'switch_06'));
  assert.ok(!edit.includeEntity(cfg, 'room_01', 'switch_06'));
  assert.ok(edit.toggleEntity(cfg, 'room_01', 'light_01'));
  assert.deepEqual(cfg.rooms.room_01.exclude, ['light_01']);
  assert.ok(edit.toggleEntity(cfg, 'room_01', 'light_01'));
  assert.deepEqual(cfg.rooms.room_01.exclude, []);
  assert.ok(edit.dropEntity(cfg, 'room_01', 'switch_06'));
  assert.ok(edit.unlinkArea(cfg, 'room_01', 'area_01'));
  assert.ok(!edit.unlinkArea(cfg, 'room_01', 'area_01'));
});

test('cards: reorder, remove, restore, reset', () => {
  const { d, cfg } = fresh();
  assert.ok(edit.moveCard(cfg, 'home', 'music', 'up'));
  assert.deepEqual(cfg.cards.home, ['music', 'lights', 'irrigation', 'tonight']);
  assert.ok(edit.hideCard(cfg, 'home', 'music'));
  assert.deepEqual(hiddenCards(cfg, 'home'), ['music']);
  assert.ok(!edit.hideCard(cfg, 'home', 'music'));
  assert.ok(edit.showCard(cfg, 'home', 'music'));
  assert.ok(!edit.showCard(cfg, 'home', 'music'));
  assert.ok(!edit.showCard(cfg, 'home', 'ev'), 'a card belongs to its own screen');
  assert.ok(edit.showCard(cfg, 'energy', 'ev'));
  edit.resetCards(cfg, d);
  assert.deepEqual(cfg.cards, defaultConfig(d).cards);
});

test('network views follow the configured sources', () => {
  const { cfg } = fresh();
  assert.deepEqual(netViews(cfg), ['all', 'unifi', 'zigbee']);
  edit.toggleNetSource(cfg, 'zigbee');
  assert.deepEqual(netViews(cfg), ['all', 'unifi']);
  edit.toggleNetSource(cfg, 'unifi');
  assert.deepEqual(netViews(cfg), [], 'no source means no network screen');
  edit.toggleNetSource(cfg, 'zigbee');
  assert.deepEqual(netViews(cfg), ['all', 'zigbee']);
  assert.ok(!edit.toggleNetSource(cfg, 'other'));
});

test('EV mapping accepts ids only and unknown statistics are refused', () => {
  const { cfg } = fresh();
  assert.ok(edit.setEvEntity(cfg, 'power', 'sensor_02'));
  assert.equal(cfg.ev.map.power, 'sensor_02');
  assert.ok(edit.setEvEntity(cfg, 'power', ''));
  assert.equal(cfg.ev.map.power, null);
  assert.ok(!edit.setEvEntity(cfg, 'speed', 'sensor_02'));
  assert.ok(edit.toggleEvStat(cfg, 'cost'));
  assert.deepEqual(cfg.ev.hide, ['cost']);
});
