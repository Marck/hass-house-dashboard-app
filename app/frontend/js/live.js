// Live mode: turns the backend's Home Assistant registry and states into the
// same data shape as the demo fixture (see model.js), so the views do not
// change. Areas become rooms and Home Assistant floors become floors. Names
// come from Home Assistant as literal text (lit), not translation keys.
//
// Read-only: nothing here sends anything. Parts that are not live yet
// (energy, network, people, weather, watering) keep the demo data and the
// views say so.

/** A name that is shown as is, not looked up as a translation key. */
export const lit = (text) => ({ text: String(text) });

const DOOR = ['door', 'window', 'opening', 'garage_door'];
const MOTION = ['motion', 'occupancy', 'presence'];
const OFF = ['unavailable', 'unknown'];
const RECENT_S = 10 * 60;

// media_player supported_features bits (Home Assistant MediaPlayerEntityFeature).
const FEATURE = { play: 16384 | 1, prev: 16, next: 32, volume: 4, stop: 4096, group: 524288 };

/** What the dashboard does with an entity, or null when it shows nothing for it. */
export function kindOf(id, attributes = {}) {
  const domain = id.split('.')[0];
  const cls = attributes.device_class;
  if (domain === 'light' || domain === 'switch' || domain === 'climate') return domain;
  if (domain === 'media_player') return 'speaker';
  if (domain === 'binary_sensor' && DOOR.includes(cls)) return 'door';
  if (domain === 'binary_sensor' && MOTION.includes(cls)) return 'motion';
  if (domain === 'sensor' && cls === 'temperature') return 'temp';
  return null;
}

const nameOf = (entity, state) => entity.name || (state && state.a && state.a.friendly_name) || entity.id;
const usable = (st) => Boolean(st) && !OFF.includes(st.s);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Replace the Home Assistant parts of d with the registry and states. Floors
 * are ordered by level; areas without a floor go on one more floor at the end.
 */
export function buildLive(d, registry, states) {
  const floors = [...registry.floors].sort((a, b) => (a.level ?? 99) - (b.level ?? 99));
  d.floorDefs = {};
  floors.forEach((fl) => {
    d.floorDefs[fl.id] = { nameKey: lit(fl.name), tabKey: lit(fl.name), rooms: [] };
  });
  d.roomDefs = {};
  d.ha = { areas: {}, devices: {}, entities: {} };
  d.lights = {};
  d.switches = {};
  d.climate = {};
  d.speakers = {};
  d.tempGroups = [];
  registry.areas.forEach((a) => {
    d.ha.areas[a.id] = { nameKey: lit(a.name) };
    d.roomDefs[a.id] = { nameKey: lit(a.name), icon: 'door', size: [3, 3], areas: [a.id] };
    const floor = a.floor && d.floorDefs[a.floor] ? a.floor : 'floor_other';
    if (!d.floorDefs[floor]) d.floorDefs[floor] = { nameKey: 'floor.other', tabKey: 'floor.other', rooms: [] };
    d.floorDefs[floor].rooms.push(a.id);
  });
  Object.keys(d.floorDefs).forEach((id) => {
    if (!d.floorDefs[id].rooms.length) delete d.floorDefs[id];
  });
  registry.entities.forEach((e) => {
    const st = states[e.id];
    const kind = kindOf(e.id, st && st.a);
    if (!kind || e.hidden) return;
    d.ha.entities[e.id] = { kind, area: e.area, name: nameOf(e, st) };
  });
  // Not live yet: no made-up people, camera event or weather in a real house.
  d.live = true;
  d.people = [];
  d.camera = { roomId: null };
  applyStates(d, states);
}

/** Update every live entity from the states (all of them, or the ones that changed). */
export function applyStates(d, states, now = Date.now() / 1000) {
  Object.keys(states).forEach((id) => {
    const e = d.ha.entities[id];
    if (!e) return;
    const st = states[id];
    const a = (st && st.a) || {};
    const nameKey = lit(e.name);
    const ok = usable(st);
    const on = ok && st.s === 'on';
    if (e.kind === 'light') d.lights[id] = { nameKey, on, reachable: ok, feed: null };
    else if (e.kind === 'switch') d.switches[id] = { nameKey, on, noteKey: ok ? 'switch.live' : 'light.state.unavailable' };
    else if (e.kind === 'climate') {
      const modes = Array.isArray(a.hvac_modes) ? a.hvac_modes : [];
      d.climate[id] = {
        kind: modes.includes('cool') ? 'ac' : 'heating', nameKey, on: ok && st.s !== 'off',
        mode: st && st.s !== 'off' ? st.s : (modes.find((m) => m !== 'off') || 'heat'),
        current: num(a.current_temperature), target: num(a.temperature), min: num(a.min_temp) ?? 7, max: num(a.max_temp) ?? 35,
        step: num(a.target_temp_step) || 0.5, settable: num(a.temperature) !== undefined, fan: a.fan_mode, presets: {},
      };
    } else if (e.kind === 'speaker') {
      const bits = Number(a.supported_features) || 0;
      d.speakers[id] = {
        kind: 'speaker', nameKey, state: ok ? st.s : 'unavailable',
        titleKey: a.media_title ? lit(a.media_title) : null, artistKey: a.media_artist ? lit(a.media_artist) : null, art: null,
        volume: Math.round((num(a.volume_level) || 0) * 100),
        features: Object.keys(FEATURE).filter((f) => bits & FEATURE[f]),
      };
    } else if (e.kind === 'door') e.door = { nameKey, open: on };
    else if (e.kind === 'motion') e.motion = on ? 'now' : (ok && st.lc && now - st.lc < RECENT_S ? 'recent' : null);
    else if (e.kind === 'temp') e.temp = ok && Number.isFinite(Number(st.s)) ? Number(st.s) : undefined;
  });
}

/** Entities the stream says are gone: shown as unavailable, never silently kept as they were. */
export function removeStates(d, ids) {
  const gone = {};
  ids.forEach((id) => { gone[id] = { s: 'unavailable', a: {} }; });
  applyStates(d, gone);
}
