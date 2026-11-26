import test from 'node:test';
import assert from 'node:assert/strict';
import { edit, entityOption, normalizeConfig, parseConfig, serializeConfig } from '../../app/frontend/js/config.js';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { homeSummary, roomSummary, commands } from '../../app/frontend/js/model.js';
import { personOf } from '../../app/frontend/js/live.js';
import { LAYOUTS, setup, render } from './helpers.js';

// A room with lights and one with switches, whatever the fixture calls them.
const pick = () => {
  const { d } = setup();
  const lightRoom = Object.keys(d.rooms).find((id) => d.rooms[id].lights.length >= 2);
  const switchRoom = Object.keys(d.rooms).find((id) => d.rooms[id].switches.length);
  return { lightRoom, light: d.rooms[lightRoom].lights[0], other: d.rooms[lightRoom].lights[1], switchRoom, sw: d.rooms[switchRoom].switches[0] };
};
const P = pick();

test('entity options: only known options, only true, only valid ids; kept through export and import', () => {
  const d = createFixture();
  const raw = { ...JSON.parse(serializeConfig(setup().cfg)), entities: {
    'switch.fuse_box': { readOnly: true, ignoreOffline: false, extra: true },
    'light.strip': { ignoreOffline: true },
    'Bad Id': { readOnly: true }, 'light.none': { readOnly: 'yes' }, 'light.null': null,
  } };
  const cfg = normalizeConfig(raw, d);
  assert.deepEqual(cfg.entities, { 'switch.fuse_box': { readOnly: true }, 'light.strip': { ignoreOffline: true } });
  assert.deepEqual(parseConfig(serializeConfig(cfg), d).entities, cfg.entities);
  assert.deepEqual(normalizeConfig({ ...raw, entities: 'x' }, d).entities, {});
  const old = { ...raw };
  delete old.entities;
  assert.deepEqual(normalizeConfig(old, d).entities, {}, 'a configuration from before this keeps working');
});

test('setEntityOption switches one option and removes an entity with none left', () => {
  const { cfg } = setup();
  assert.ok(edit.setEntityOption(cfg, 'switch.x', 'readOnly', true));
  assert.ok(edit.setEntityOption(cfg, 'switch.x', 'ignoreOffline', true));
  assert.deepEqual(cfg.entities['switch.x'], { readOnly: true, ignoreOffline: true });
  edit.setEntityOption(cfg, 'switch.x', 'readOnly', false);
  edit.setEntityOption(cfg, 'switch.x', 'ignoreOffline', false);
  assert.ok(!('switch.x' in cfg.entities));
  assert.ok(!edit.setEntityOption(cfg, 'switch.x', 'other', true) && !edit.setEntityOption(cfg, 'Bad Id', 'readOnly', true));
  assert.equal(entityOption(cfg, 'switch.x', 'readOnly'), false);
});

test('room settings: both options after each entity; read-only only where something could be switched', () => {
  const html = render({ state: { view: 'home', room: P.lightRoom, roomCfg: true } });
  assert.match(html, new RegExp(`data-action="entity-readonly" data-arg="${P.light.replace('.', '\\.')}"`));
  assert.match(html, new RegExp(`data-action="entity-ignore" data-arg="${P.light.replace('.', '\\.')}"`));
  const { d } = setup();
  const sensor = Object.keys(d.ha.entities).find((id) => ['door', 'motion', 'temp'].includes(d.ha.entities[id].kind));
  if (sensor) assert.ok(!html.includes(`data-action="entity-readonly" data-arg="${sensor}"`), 'a sensor cannot be locked');
  const confirming = render({ state: { room: P.lightRoom, roomCfg: true, confirm: `ro:${P.light}` }, tweak: (cfg) => edit.setEntityOption(cfg, P.light, 'readOnly', true) });
  assert.match(confirming, /Tap again to allow switching/);
});

test('a read-only light or switch is a tile without a control, and no action switches it', () => {
  const tweak = (cfg) => { edit.setEntityOption(cfg, P.light, 'readOnly', true); edit.setEntityOption(cfg, P.sw, 'readOnly', true); };
  for (const lang of ['en', 'nl']) {
    for (const room of [P.lightRoom, P.switchRoom]) {
      const html = render({ lang, state: { room }, tweak });
      assert.ok(!new RegExp(`data-action="(light|switch|power-on)" data-arg="${P.light}"`).test(html) && !new RegExp(`data-action="(light|switch|power-on)" data-arg="${P.sw}"`).test(html), `${lang} ${room}`);
      assert.match(html, /is-locked/);
    }
  }
  const { d } = setup({ tweak });
  const before = d.lights[P.light].on;
  assert.equal(commands.toggleLight(d, P.light), false);
  commands.setRoomLights(d, P.lightRoom, !before);
  commands.allLightsOff(d);
  assert.equal(d.lights[P.light].on, before, 'bulk actions leave it alone');
  const swBefore = d.switches[P.sw].on;
  commands.toggleSwitch(d, P.sw);
  assert.equal(d.switches[P.sw].on, swBefore);
});

test('an ignored entity that is unavailable is greyed, not counted and not a warning', () => {
  const down = (cfg, d) => { d.lights[P.light].reachable = false; };
  const counted = setup({ tweak: down }).d;
  const ignored = setup({ tweak: (cfg, d) => { down(cfg, d); edit.setEntityOption(cfg, P.light, 'ignoreOffline', true); } }).d;
  assert.equal(homeSummary(ignored).unreachable, homeSummary(counted).unreachable - 1);
  assert.equal(roomSummary(ignored, P.lightRoom).unavailable, roomSummary(counted, P.lightRoom).unavailable - 1);
  assert.equal(roomSummary(ignored, P.lightRoom).available, roomSummary(counted, P.lightRoom).available, 'still not available to switch');
  const html = render({ state: { room: P.lightRoom }, tweak: (cfg, d) => { down(cfg, d); edit.setEntityOption(cfg, P.light, 'ignoreOffline', true); } });
  assert.match(html, /is-unavailable is-quiet/);
});

test('every layout and language renders with options set, escaped and translated', () => {
  const tweak = (cfg, d) => Object.keys(d.lights).concat(Object.keys(d.switches)).forEach((id, i) => {
    edit.setEntityOption(cfg, id, i % 2 ? 'readOnly' : 'ignoreOffline', true);
    if (i % 3 === 0) d.lights[id] && (d.lights[id].reachable = false);
  });
  for (const lang of ['en', 'nl']) {
    for (const layout of LAYOUTS) {
      for (const state of [{}, { room: P.lightRoom }, { room: P.switchRoom }, { room: P.lightRoom, roomCfg: true }]) {
        const html = render({ lang, tweak, state: { layout, ...state } });
        assert.ok(!/\[[a-z]+\.[a-zA-Z.]+\]/.test(html), `missing translation ${lang} ${layout} ${JSON.stringify(state)}`);
        assert.ok(!/NaN|undefined|\[object/.test(html.replace(/<[^>]+>/g, ' ')), `${lang} ${layout} ${JSON.stringify(state)}`);
      }
    }
  }
});

test('a person with a picture gets it from the backend; without one, or with an odd id, the icon', () => {
  const people = [personOf('person.one', { s: 'home', a: { friendly_name: 'One', picture: true } }), personOf('person.two', { s: 'home', a: { friendly_name: 'Two' } }),
    { ...personOf('person.x', { s: 'home', a: { picture: true } }), id: 'person.x"><script>' }];
  const html = render({ tweak: (cfg, d) => { d.people = people; } });
  assert.match(html, /<img src="\/api\/ha\/avatar\/person\.one" alt=""/);
  assert.equal((html.match(/\/api\/ha\/avatar\//g) || []).length, 1, 'only for a valid id with a picture');
  assert.ok(!html.includes('<script>'));
});
