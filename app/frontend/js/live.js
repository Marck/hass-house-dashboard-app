// Live mode: turns the backend's Home Assistant registry and states into the
// same data shape as the demo fixture (see model.js), so the views do not
// change. Areas become rooms and Home Assistant floors become floors. Names
// come from Home Assistant as literal text (lit), not translation keys.
//
// Read-only: nothing here sends anything. Parts that are not live yet
// (energy, network, weather, watering) keep the demo data and the
// views say so.

/** A name that is shown as is, not looked up as a translation key. */
export const lit = (text) => ({ text: String(text) });

const DOOR = ['door', 'window', 'opening', 'garage_door'];
const MOTION = ['motion', 'occupancy', 'presence'];
const OFF = ['unavailable', 'unknown'];
// A person state that names no zone: Home Assistant's own two and what a broken tracker sends.
const NO_VALUE = /^(unavailable|unknown|none|null|undefined|nan|[-+]?inf(inity)?)?$/i;
const RECENT_S = 10 * 60;

// media_player supported_features bits (Home Assistant MediaPlayerEntityFeature).
// Home Assistant's media player states (2026.11.1 MediaPlayerState) in the card's words; anything else is unavailable.
const PLAYER = { playing: 'playing', buffering: 'playing', paused: 'paused', idle: 'idle', on: 'idle', off: 'off', standby: 'off' };
const FEATURE = { play: 16384 | 1, prev: 16, next: 32, volume: 4, stop: 4096, group: 524288 };

/** What the dashboard does with an entity, or null when it shows nothing for it. */
export function kindOf(id, attrs) {
  const attributes = attrs || {}; // Home Assistant may send no attributes at all
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
 * A state as a number, or undefined. Strict: Number('') and Number(' ') are 0 and
 * Number('0x10') is 16, but none of those is a reading.
 */
export const numeric = (s) => {
  if (typeof s !== 'string' || !/^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(s)) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
};

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
    if (!kind || e.hidden || e.category) return;
    d.ha.entities[e.id] = { kind, area: e.area, name: nameOf(e, st) };
  });
  // Not live yet: no camera event or weather in a real house.
  d.live = true;
  d.people = [];
  d.camera = { roomId: null };
  applyStates(d, states);
}

/**
 * A person as the dashboard shows them: their name and the zone they are in,
 * nothing else. Home Assistant's person state is home, not_home or the name of
 * another zone; the backend sends no coordinates.
 */
export function personOf(id, st) {
  const s = st && st.s;
  const name = (st && st.a && st.a.friendly_name) || id.split('.')[1];
  const base = { id, nameKey: lit(name) };
  if (s === 'home') return { ...base, state: 'home' };
  if (s === 'not_home') return { ...base, state: 'away' };
  if (typeof s !== 'string' || NO_VALUE.test(s.trim())) return { ...base, state: 'unknown' };
  return { ...base, state: 'zone', zoneKey: lit(s) };
}

function setPerson(d, id, st) {
  const p = personOf(id, st);
  const at = d.people.findIndex((x) => x.id === id);
  if (at < 0) d.people.push(p);
  // A state without a name (a removed person) keeps the name shown so far.
  else d.people[at] = st && st.a && st.a.friendly_name ? p : { ...p, nameKey: d.people[at].nameKey };
  d.people.sort((a, b) => a.nameKey.text.localeCompare(b.nameKey.text));
}

/** Update every live entity from the states (all of them, or the ones that changed). */
export function applyStates(d, states, now = Date.now() / 1000) {
  Object.keys(states).forEach((id) => {
    if (id.startsWith('person.')) return setPerson(d, id, states[id]);
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
        kind: modes.includes('cool') ? 'ac' : 'heating', nameKey, on: ok && st.s !== 'off', unavailable: !ok,
        mode: st && st.s !== 'off' ? st.s : (modes.find((m) => m !== 'off') || 'heat'),
        current: num(a.current_temperature), target: num(a.temperature), min: num(a.min_temp) ?? 7, max: num(a.max_temp) ?? 35,
        step: num(a.target_temp_step) || 0.5, settable: num(a.temperature) !== undefined, fan: a.fan_mode, presets: {},
        // What the device does right now, and a low/high range for devices that keep one (heat_cool).
        action: ok && typeof a.hvac_action === 'string' ? a.hvac_action : null,
        range: num(a.target_temp_low) !== undefined && num(a.target_temp_high) !== undefined ? [a.target_temp_low, a.target_temp_high] : null,
      };
    } else if (e.kind === 'speaker') {
      const bits = Number(a.supported_features) || 0;
      d.speakers[id] = {
        kind: 'speaker', nameKey, state: ok ? (PLAYER[st.s] || 'unavailable') : 'unavailable',
        titleKey: a.media_title ? lit(a.media_title) : null, artistKey: a.media_artist ? lit(a.media_artist) : null, art: null,
        volume: Math.round((num(a.volume_level) || 0) * 100),
        features: Object.keys(FEATURE).filter((f) => bits & FEATURE[f]),
      };
    } else if (e.kind === 'door') e.door = { nameKey, open: on };
    else if (e.kind === 'motion') e.motion = on ? 'now' : (ok && st.lc && now - st.lc < RECENT_S ? 'recent' : null);
    else if (e.kind === 'temp') e.temp = ok ? numeric(st.s) : undefined;
  });
}

/** Entities the stream says are gone: shown as unavailable, never silently kept as they were. */
export function removeStates(d, ids) {
  const gone = {};
  ids.forEach((id) => { gone[id] = { s: 'unavailable', a: {} }; });
  applyStates(d, gone);
}

const SUN = { above_horizon: 'above', below_horizon: 'below' };

/** The theme's sun state from Home Assistant's sun entity: above, below, or unavailable (light theme). */
export const sunFrom = (state) => SUN[state && state.s] || 'unavailable';
