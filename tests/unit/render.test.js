import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edit } from '../../app/frontend/js/config.js';
import { ICON_NAMES, icon } from '../../app/frontend/js/icons.js';
import { render, setup, evConfigured, LAYOUTS } from './helpers.js';

const ARTWORK = /class="plan-art"|class="property-art"|id="netmap"/;
const mainSource = readFileSync(new URL('../../app/frontend/js/main.js', import.meta.url), 'utf8');

test('phones get no large artwork, tablets and desktops do', () => {
  ['home', 'energy', 'network'].forEach((view) => {
    assert.ok(!ARTWORK.test(render({ state: { view, layout: 'phone' } })), `${view} renders artwork on a phone`);
    ['tablet', 'desktop'].forEach((layout) => assert.ok(ARTWORK.test(render({ state: { view, layout } })), `${view} has no artwork on ${layout}`));
  });
  assert.match(render({ state: { layout: 'phone' } }), /class="room-list"/);
});

test('the Edit layout button sits directly left of the language button', () => {
  const html = render();
  const editAt = html.indexOf('data-action="edit-layout"');
  const langAt = html.indexOf('data-action="menu" data-arg="lang"');
  const themeAt = html.indexOf('data-action="menu" data-arg="theme"');
  assert.ok(editAt > 0 && editAt < langAt && langAt < themeAt);
  // The only button that starts between the two markers is the language button itself.
  assert.equal(html.slice(editAt, langAt).split('<button').length, 2, 'another button sits between them');
});

test('the floor plan card has floor tabs and an Edit button to their right', () => {
  const html = render();
  const head = html.slice(html.indexOf('class="plan-head"'), html.indexOf('class="plan-art"'));
  assert.ok(head.indexOf('data-action="floor"') < head.indexOf('data-action="plan-edit"'));
  assert.ok(!html.includes('class="editor"'));
  const editing = render({ state: { planEdit: true } });
  ['floor-label', 'room-floor'].forEach((input) => assert.ok(editing.includes(`data-input="${input}"`)));
  ['floor-add', 'floor-move', 'floor-remove', 'room-add', 'room-move', 'room-config'].forEach((action) => assert.ok(editing.includes(`data-action="${action}"`), action));
});

test('heating can be set like the AC; an on/off heater says why it cannot', () => {
  const html = render({ state: { room: 'room_01' } });
  ['climate_01', 'climate_02'].forEach((id) => assert.ok(html.includes(`data-input="climate-target" data-arg="${id}"`), `${id} has no target control`));
  const bath = render({ state: { room: 'room_05' } });
  assert.ok(!bath.includes('data-input="climate-target"'));
  assert.match(bath, /no target temperature/);
});

test('not configured is hidden, configured but missing is an error', () => {
  const kitchen = render({ state: { room: 'room_02' } });
  assert.match(kitchen, /Entity not found/);
  assert.match(kitchen, /light-99/);
  const carport = render({ state: { room: 'room_14' } });
  assert.match(carport, /Linked area no longer exists/);
  assert.match(carport, /area-90/);
  const guest = render({ state: { room: 'room_08' } });
  assert.ok(!/not found|no longer exists/.test(guest));
  assert.ok(!guest.includes('data-action="switch"'), 'a room without switches shows no power section');

  assert.ok(!render({ state: { view: 'energy' } }).includes('id="card-ev"'), 'the EV card is off by default');
  const ev = render({ state: { view: 'energy' }, tweak: evConfigured });
  assert.ok(ev.includes('id="card-ev"'));
  assert.match(ev, /Entity not found/);
  assert.match(ev, /sensor-99/);
  const empty = render({ state: { view: 'energy' }, tweak: (cfg) => cfg.cards.energy.push('ev') });
  assert.match(empty, /No entities selected yet/);
  assert.ok(!/>0[,.]0|>0 kW/.test(empty.slice(empty.indexOf('id="card-ev"'))), 'no made-up zero values');
});

test('removed cards disappear and edit mode offers to add them back', () => {
  const tweak = (cfg) => edit.hideCard(cfg, 'home', 'music');
  const html = render({ tweak });
  assert.ok(!html.includes('class="card mini music"'));
  assert.ok(!html.includes('data-action="card-move"'), 'no edit controls outside edit mode');
  const editing = render({ tweak, state: { edit: true } });
  assert.ok(editing.includes('data-action="card-show" data-arg="music"'));
  ['card-move', 'card-hide', 'layout-reset', 'settings'].forEach((action) => assert.ok(editing.includes(`data-action="${action}"`), action));
});

test('network views follow the sources and the screen goes away without any', () => {
  const views = (html) => (html.match(/data-action="net-view" data-arg="(\w+)"/g) || []).map((m) => /data-arg="(\w+)"/.exec(m)[1]);
  assert.deepEqual(views(render({ state: { view: 'network' } })), ['all', 'unifi', 'zigbee']);
  assert.deepEqual(views(render({ state: { view: 'network' }, tweak: (cfg) => edit.toggleNetSource(cfg, 'unifi') })), ['all', 'zigbee']);
  const none = render({ tweak: (cfg) => {
    edit.toggleNetSource(cfg, 'unifi');
    edit.toggleNetSource(cfg, 'zigbee');
  } });
  assert.ok(!none.includes('href="#/network"'), 'the nav entry is gone');
  assert.ok(render().includes('href="#/network"'));
  const zigbee = render({ state: { view: 'network', netView: 'zigbee' } });
  assert.ok(!zigbee.includes('class="card wan"'), 'no uplink card without UniFi');
});

test('names the user typed are escaped everywhere', () => {
  const evil = '<img src=x onerror=1>"\'';
  const tweak = (cfg, d) => {
    edit.renameFloor(cfg, d, 'floor_01', evil);
    edit.renameRoom(cfg, d, 'room_01', evil);
  };
  LAYOUTS.forEach((layout) => {
    [{}, { planEdit: true }, { room: 'room_01' }, { room: 'room_01', roomCfg: true }].forEach((state) => {
      const html = render({ tweak, state: { ...state, layout } });
      assert.ok(!html.includes('<img'), `unescaped label in ${layout} ${JSON.stringify(state)}`);
      assert.ok(html.includes('&lt;img'));
    });
  });
});

test('every action and input the views emit is handled by the controller', () => {
  const tweak = (cfg) => {
    evConfigured(cfg);
    cfg.rooms.room_01.include.push('switch_06');
  };
  const html = [
    { edit: true, planEdit: true, menu: 'lang' }, { menu: 'theme', theme: { mode: 'manual', manual: 'light' } }, { menu: 'theme' },
    { view: 'energy', edit: true }, { view: 'network', edit: true }, { view: 'network', netTab: 'availability' },
    { room: 'room_01' }, { room: 'room_02' }, { room: 'room_02', roomCfg: true }, { room: 'room_14', roomCfg: true }, { room: 'room_01', roomCfg: true }, { settings: true },
    { layout: 'phone' }, { view: 'energy', layout: 'phone' }, { view: 'network', layout: 'phone' },
  ].map((state) => render({ tweak, state })).join('');
  const found = (attr) => [...new Set((html.match(new RegExp(`data-${attr}="([\\w-]+)"`, 'g')) || []).map((m) => m.split('"')[1]))];
  const actions = found('action');
  const inputs = found('input');
  assert.ok(actions.length > 40 && inputs.length >= 9);
  actions.concat(inputs).forEach((name) => {
    const handled = new RegExp(`(^|[\\s{,])'?${name}'?\\s*[:(]|=== '${name}'`, 'm').test(mainSource);
    assert.ok(handled, `no handler for "${name}" in main.js`);
  });
});

test('icons: unknown names fail loudly', () => {
  assert.ok(ICON_NAMES.length > 60);
  assert.throws(() => icon('no-such-icon'));
});

test('room settings list linked areas by id and offer the unlinked ones', () => {
  const { c } = setup();
  assert.equal(Object.keys(c.d.ha.areas).length, 16);
  const html = render({ state: { room: 'room_06', roomCfg: true } });
  assert.match(html, /area-06/);
  assert.match(html, /area-15/);
  assert.ok(html.includes('<option value="area_16">'), 'the unlinked area can be picked');
  assert.ok(!html.includes('<option value="area_06">'), 'a linked area is not offered again');
  assert.ok(html.includes('data-action="entity-toggle" data-arg="room_06" data-val="light_19"'));
});
