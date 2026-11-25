// The connection to Home Assistant, read-only. One WebSocket, authenticated
// with a long-lived token of a dedicated non-admin user. It reconnects with
// backoff and keeps the registries (floors, areas, devices, entities) and the
// live states in memory.
//
// Read-only is enforced here, not trusted to the token: the only messages this
// module can send are the authentication, a ping (keep-alive) and the commands
// in READ.
// Neither the token nor the Home Assistant address is logged or returned.
import { readFileSync } from 'node:fs';
import { buildNetwork, keepNetworkRegistry } from './network.js';

/** The registry lists, loaded on every connect and every 15 minutes. */
export const LISTS = Object.freeze([
  'config/floor_registry/list',
  'config/area_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list',
]);

/**
 * Registry changes, to reload the lists at once instead of at the next refresh.
 * A non-admin user may subscribe to these (Home Assistant 2026.11.1,
 * auth/permissions/events.py, SUBSCRIBE_ALLOWLIST).
 */
export const REGISTRY_EVENTS = Object.freeze(['floor_registry_updated', 'area_registry_updated', 'device_registry_updated', 'entity_registry_updated']);

/**
 * Energy reads (step 7). None needs an admin user (Home Assistant 2026.11.1:
 * no require_admin on these handlers). Their parameters are built by
 * energy.js from Home Assistant's own Energy settings, never from a request.
 */
export const ENERGY_READ = Object.freeze(['energy/get_prefs', 'energy/solar_forecast', 'recorder/statistic_during_period']);

/** Every command this connection may send. Nothing here can change anything. */
export const READ = Object.freeze([...LISTS, 'subscribe_entities', 'subscribe_events', ...ENERGY_READ]);

// Attributes that can carry a credential never leave the backend: a camera's or
// media player's entity_picture, and a media player's entity_picture_local, hold
// an access token in their URL.
const SECRET_ATTR = /^entity_picture|token|password|secret/i;
// Attributes that identify the network or where someone is: a network
// tracker's addresses, host name, vendor prefix, access point and Wi-Fi name,
// and the coordinates of people, phones and zones. The dashboard uses none.
// A calendar event's location is an address too.
const PRIVATE_ATTR = new Set([
  'ip', 'ip_address', 'mac', 'mac_address', 'host_name', 'hostname', 'oui', 'ap_mac', 'bssid', 'essid', 'ssid', 'note',
  'latitude', 'longitude', 'altitude', 'gps_accuracy', 'vertical_accuracy', 'in_zones', 'location', 'course', 'speed',
]);
// People, their trackers and zones send their name only: a person's state is
// the zone they are in (home, not_home or a zone's name), never where in it.
// Their account id, tracker ids and a zone's radius stay here.
const ONLY_ATTR = { person: ['friendly_name'], device_tracker: ['friendly_name', 'source_type'], zone: ['friendly_name', 'icon'] };
// Entities that are a location or a network name whatever their state: a
// phone's geocoded location (its state is a street address) and its Wi-Fi name.
const PRIVATE_ID = /^sensor\..*_(geocoded_location|b?ssid)$/;
const GEOCODED_ATTR = ['Location', 'Thoroughfare', 'Postal Code', 'ISO Country Code'];
// A value that is a MAC or IP address, whatever it is called (an access point's
// uplink sensor, a thermostat's mac attribute).
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const IPV6 = /^(?=[0-9a-f:]*::|([0-9a-f]{1,4}:){7})[0-9a-f:]{2,39}(%\w+)?(\/\d{1,3})?$/i;
/** True for a string that is a MAC, IPv4 or IPv6 address. */
export const isAddress = (v) => typeof v === 'string' && (MAC.test(v.trim()) || IPV4.test(v.trim()) || IPV6.test(v.trim()));
const BATCH_MS = 500;
// A rename touches several entries; one reload after the burst is enough.
const REGISTRY_SETTLE_MS = 2000;

/**
 * One state as the browser gets it: the state, its attributes without
 * credentials, network identifiers or coordinates, and when it last changed.
 * Home Assistant's context (which user did it) is dropped. An entity that is
 * an address or a location (see PRIVATE_ID) is not sent at all: null.
 */
export function cleanState(compressed, id = '') {
  const raw = (compressed && compressed.a) || {};
  if (isAddress(compressed && compressed.s) || PRIVATE_ID.test(id) || GEOCODED_ATTR.some((k) => k in raw)) return null;
  const only = ONLY_ATTR[id.split('.')[0]];
  const attributes = {};
  for (const [key, value] of Object.entries(raw)) {
    if (only ? only.includes(key) : !SECRET_ATTR.test(key) && !PRIVATE_ATTR.has(key.toLowerCase()) && !isAddress(value)) attributes[key] = value;
  }
  return { s: String(compressed && compressed.s), a: attributes, lc: Number(compressed && (compressed.lc || compressed.lu)) || null };
}

/** Every state that may reach the browser, cleaned; the ones that may not are left out. */
function cleanAll(entries) {
  const out = {};
  for (const [id, st] of entries) {
    const clean = cleanState(st, id);
    if (clean) out[id] = clean;
  }
  return out;
}

const COMMAND_MS = 30_000;
const PING_MS = 30_000;
const REFRESH_MS = 15 * 60_000;
const RETRY_MAX_MS = 60_000;
const AUTH_RETRY_MS = 5 * 60_000; // a refused token is tried again, the Secret may have changed

/**
 * Settings for live mode: HASS_URL (http or https, the base of Home Assistant)
 * and the token from HASS_TOKEN_FILE (preferred, a mounted Secret) or HASS_TOKEN.
 * Throws with a message that names the setting, never its value.
 */
export function haSettings(env) {
  let base;
  try {
    base = new URL(env.HASS_URL || '');
  } catch {
    throw new Error('HASS_URL must be the http or https address of Home Assistant');
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('HASS_URL must be a plain http or https address of Home Assistant');
  }
  if (Boolean(env.HASS_TOKEN) === Boolean(env.HASS_TOKEN_FILE)) throw new Error('set exactly one of HASS_TOKEN_FILE and HASS_TOKEN');
  const url = new URL('api/websocket', base.href.endsWith('/') ? base.href : `${base.href}/`);
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const file = env.HASS_TOKEN_FILE;
  const token = file ? () => readFileSync(file, 'utf8').trim() : () => env.HASS_TOKEN.trim();
  if (!token()) throw new Error('the Home Assistant token is empty');
  return { url: url.href, token };
}

/** What the browser gets: the fields the dashboard uses, nothing else. */
export function shapeRegistry({ floors = [], areas = [], devices = [], entities = [] }) {
  const deviceArea = new Map(devices.map((d) => [d.id, d.area_id || null]));
  return {
    floors: floors.map((f) => ({ id: f.floor_id, name: f.name, level: f.level ?? null })),
    areas: areas.map((a) => ({ id: a.area_id, name: a.name, floor: a.floor_id || null })),
    devices: devices.length,
    entities: entities
      .filter((e) => !e.disabled_by)
      .map((e) => ({
        id: e.entity_id,
        domain: e.entity_id.split('.')[0],
        name: e.name || e.original_name || null,
        area: e.area_id || deviceArea.get(e.device_id) || null,
        hidden: Boolean(e.hidden_by),
        // config or diagnostic: an integration's settings, not something to show
        category: e.entity_category === 'config' || e.entity_category === 'diagnostic' ? e.entity_category : null,
      })),
  };
}

/**
 * `WebSocketImpl` and `timers` are for tests. `status()` and `registry()` are
 * what the API serves.
 */
export function createHa({ url, token, WebSocketImpl = globalThis.WebSocket, log = console, now = Date.now, timers = globalThis }) {
  let ws = null;
  let state = 'stopped'; // connecting, connected, auth_failed, unreachable, stopped
  let version = null;
  let since = null;
  let registry = null;
  let netRegistry = null; // UniFi and ZHA entries for the network map, never sent as they are
  const states = new Map(); // entity id -> compressed state as Home Assistant sent it
  const listeners = new Set();
  let subId = null;
  let fresh = false; // the next state message of this subscription is the full list
  let pending = null; // { reset, set: Set, remove: Set } until the next batch
  let batchTimer = null;
  let loadedAt = null;
  let nextId = 1;
  let lastSeen = 0;
  let attempt = 0;
  let retryTimer = null;
  let pingTimer = null;
  let refreshTimer = null;
  let registryTimer = null;
  const registrySubs = new Set(); // subscription ids of REGISTRY_EVENTS
  const waiting = new Map(); // id -> { done, fail, timer }

  const setState = (next) => {
    if (state !== next) since = now();
    state = next;
  };

  function send(message) {
    ws.send(JSON.stringify(message));
  }

  /** A read command. Anything not in READ is refused before it is sent. `params` cannot replace the id or the type. */
  function command(type, params = {}) {
    if (!READ.includes(type)) return Promise.reject(new Error(`refused: ${type} is not a read command`));
    if (state !== 'connected') return Promise.reject(new Error('not connected'));
    const id = nextId++;
    return new Promise((done, fail) => {
      const timer = timers.setTimeout(() => {
        waiting.delete(id);
        fail(new Error('timeout'));
        drop('timeout');
      }, COMMAND_MS);
      waiting.set(id, { done, fail, timer });
      send({ ...params, id, type });
    });
  }

  async function load() {
    try {
      const [floors, areas, devices, entities] = await Promise.all(LISTS.map(command));
      registry = shapeRegistry({ floors, areas, devices, entities });
      netRegistry = keepNetworkRegistry({ devices, entities });
      loadedAt = now();
      return true;
    } catch (error) {
      log.warn(`home assistant: registry not loaded (${error.message.startsWith('refused') ? 'refused' : error.message})`);
      return false;
    }
  }

  /** A registry changed: reload once the burst is over, then send every state again so the browser rebuilds. */
  function registryChanged() {
    timers.clearTimeout(registryTimer);
    registryTimer = timers.setTimeout(async () => {
      registryTimer = null;
      if (await load()) queue({ reset: true });
    }, REGISTRY_SETTLE_MS);
  }

  function subscribeRegistry() {
    if (!READ.includes('subscribe_events')) return;
    registrySubs.clear();
    for (const eventType of REGISTRY_EVENTS) {
      const id = nextId++;
      registrySubs.add(id);
      send({ id, type: 'subscribe_events', event_type: eventType });
    }
  }

  /** Tell the listeners what changed, at most every BATCH_MS: chatty sensors would flood a tablet. */
  function queue(change) {
    pending = pending || { reset: false, set: new Set(), remove: new Set() };
    if (change.reset) Object.assign(pending, { reset: true, set: new Set(), remove: new Set() });
    for (const id of change.set || []) { pending.set.add(id); pending.remove.delete(id); }
    for (const id of change.remove || []) { pending.remove.add(id); pending.set.delete(id); }
    if (!batchTimer) batchTimer = timers.setTimeout(flush, BATCH_MS);
  }

  function flush() {
    batchTimer = null;
    if (!pending) return;
    let out;
    if (pending.reset) out = { reset: true, set: snapshot() };
    else {
      const set = cleanAll([...pending.set].filter((id) => states.has(id)).map((id) => [id, states.get(id)]));
      // A state that turned into an address is removed, so its last value does not linger.
      const hidden = [...pending.set].filter((id) => states.has(id) && !(id in set));
      out = { set, remove: [...pending.remove, ...hidden] };
    }
    pending = null;
    for (const fn of listeners) {
      try {
        fn(out);
      } catch {
        // One broken listener must not stop the others.
      }
    }
  }

  const snapshot = () => cleanAll(states);

  /** Home Assistant's state message: a = added (full), c = changed (diff), r = removed. */
  function onStates(event) {
    if (fresh) {
      fresh = false;
      states.clear();
      for (const [id, st] of Object.entries(event.a || {})) states.set(id, st);
      return queue({ reset: true });
    }
    const set = [];
    for (const [id, st] of Object.entries(event.a || {})) { states.set(id, st); set.push(id); }
    for (const [id, diff] of Object.entries(event.c || {})) {
      const old = states.get(id);
      if (!old) continue;
      const add = diff['+'] || {};
      const next = { ...old, a: { ...(old.a || {}), ...(add.a || {}) } };
      if ('s' in add) next.s = add.s;
      if ('lc' in add) next.lc = add.lc;
      if ('lu' in add) next.lu = add.lu;
      for (const key of (diff['-'] && diff['-'].a) || []) delete next.a[key];
      states.set(id, next);
      set.push(id);
    }
    for (const id of event.r || []) states.delete(id);
    queue({ set, remove: event.r || [] });
  }

  function subscribe() {
    const type = 'subscribe_entities';
    if (!READ.includes(type)) return;
    subId = nextId++;
    fresh = true;
    send({ id: subId, type });
  }

  function clearTimers() {
    timers.clearInterval(pingTimer);
    timers.clearInterval(refreshTimer);
    timers.clearTimeout(registryTimer);
    pingTimer = null;
    refreshTimer = null;
    registryTimer = null;
    for (const [, w] of waiting) {
      timers.clearTimeout(w.timer);
      w.fail(new Error('disconnected'));
    }
    waiting.clear();
  }

  /** Close this socket and plan the next try. */
  function drop(reason) {
    if (!ws) return;
    const old = ws;
    ws = null;
    clearTimers();
    try {
      old.close();
    } catch {
      // Already closed.
    }
    if (state === 'stopped') return;
    const authFailed = reason === 'auth_invalid';
    if (state === 'connected') log.warn(`home assistant: connection lost (${reason})`);
    setState(authFailed ? 'auth_failed' : 'unreachable');
    const wait = authFailed ? AUTH_RETRY_MS : Math.min(RETRY_MAX_MS, 1000 * 2 ** attempt);
    attempt += 1;
    retryTimer = timers.setTimeout(connect, wait);
  }

  function onMessage(event) {
    lastSeen = now();
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === 'auth_required') {
      let access;
      try {
        access = token();
      } catch {
        log.warn('home assistant: token file not readable');
        return drop('token');
      }
      return send({ type: 'auth', access_token: access });
    }
    if (msg.type === 'auth_invalid') {
      log.warn('home assistant: the token was refused');
      return drop('auth_invalid');
    }
    if (msg.type === 'auth_ok') {
      attempt = 0;
      version = typeof msg.ha_version === 'string' ? msg.ha_version.slice(0, 20) : null;
      setState('connected');
      log.info(`home assistant: connected${version ? ` (version ${version})` : ''}`);
      // A connection that stops answering is dropped and made again.
      pingTimer = timers.setInterval(() => {
        if (now() - lastSeen > 2 * PING_MS) return drop('silent');
        send({ id: nextId++, type: 'ping' });
      }, PING_MS);
      refreshTimer = timers.setInterval(load, REFRESH_MS);
      load();
      subscribe();
      subscribeRegistry();
      return;
    }
    if (msg.type === 'event' && msg.id === subId && msg.event) return onStates(msg.event);
    if (msg.type === 'event' && registrySubs.has(msg.id)) return registryChanged();
    if (msg.type === 'result' && registrySubs.has(msg.id)) {
      if (!msg.success) log.warn(`home assistant: registry updates refused (${String(msg.error && msg.error.code).slice(0, 40)}), reloading every 15 minutes only`);
      return;
    }
    if (msg.type === 'result' && msg.id === subId && !msg.success) {
      log.warn(`home assistant: live states refused (${String(msg.error && msg.error.code).slice(0, 40)})`);
      return;
    }
    const w = msg.type === 'result' && waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    timers.clearTimeout(w.timer);
    if (msg.success) w.done(msg.result);
    else w.fail(new Error(`error ${String(msg.error && msg.error.code).slice(0, 40)}`));
  }

  function connect() {
    retryTimer = null;
    if (state === 'stopped') return;
    if (state !== 'auth_failed') setState('connecting');
    let socket;
    try {
      socket = new WebSocketImpl(url);
    } catch {
      ws = {};
      return drop('socket');
    }
    ws = socket;
    socket.addEventListener('message', (event) => ws === socket && onMessage(event));
    socket.addEventListener('close', () => ws === socket && drop('closed'));
    socket.addEventListener('error', () => ws === socket && drop('error'));
  }

  return {
    start() {
      if (state !== 'stopped') return;
      setState('connecting');
      connect();
    },
    stop() {
      setState('stopped');
      timers.clearTimeout(retryTimer);
      timers.clearTimeout(batchTimer);
      batchTimer = null;
      drop('stopped');
    },
    command,
    status() {
      const counts = registry && { floors: registry.floors.length, areas: registry.areas.length, devices: registry.devices, entities: registry.entities.length };
      return { state, since, version, loadedAt, counts: counts || null, states: state === 'connected' && !fresh ? states.size : null };
    },
    registry: () => registry,
    /** Every state, without credentials or context. */
    states: () => (state === 'connected' && !fresh ? snapshot() : null),
    /** The UniFi and Zigbee map (network.js): opaque ids, no addresses. */
    network: () => (state === 'connected' && !fresh && netRegistry ? buildNetwork(netRegistry, states, now()) : null),
    /** fn({ reset, set, remove }) after each batch; returns a function that stops it. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
