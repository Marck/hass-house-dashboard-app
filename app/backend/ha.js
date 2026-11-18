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

/** The registry lists, loaded on every connect and every 15 minutes. */
export const LISTS = Object.freeze([
  'config/floor_registry/list',
  'config/area_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list',
]);

/** Every command this connection may send. Nothing here can change anything. */
export const READ = Object.freeze([...LISTS, 'subscribe_entities']);

// Attributes that can carry a credential (a camera's or media player's
// entity_picture holds an access token) never leave the backend.
const SECRET_ATTR = /^entity_picture$|token|password|secret/i;
const BATCH_MS = 500;

/**
 * One state as the browser gets it: the state, its attributes without
 * credentials, and when it last changed. Home Assistant's context (which user
 * did it) is dropped.
 */
export function cleanState(compressed) {
  const attributes = {};
  for (const [key, value] of Object.entries((compressed && compressed.a) || {})) if (!SECRET_ATTR.test(key)) attributes[key] = value;
  return { s: String(compressed && compressed.s), a: attributes, lc: Number(compressed && (compressed.lc || compressed.lu)) || null };
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
  const waiting = new Map(); // id -> { done, fail, timer }

  const setState = (next) => {
    if (state !== next) since = now();
    state = next;
  };

  function send(message) {
    ws.send(JSON.stringify(message));
  }

  /** A read command. Anything not in READ is refused before it is sent. */
  function command(type) {
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
      send({ id, type });
    });
  }

  async function load() {
    try {
      const [floors, areas, devices, entities] = await Promise.all(LISTS.map(command));
      registry = shapeRegistry({ floors, areas, devices, entities });
      loadedAt = now();
    } catch (error) {
      log.warn(`home assistant: registry not loaded (${error.message.startsWith('refused') ? 'refused' : error.message})`);
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
    const out = pending.reset ? { reset: true, set: snapshot() }
      : { set: Object.fromEntries([...pending.set].filter((id) => states.has(id)).map((id) => [id, cleanState(states.get(id))])), remove: [...pending.remove] };
    pending = null;
    for (const fn of listeners) {
      try {
        fn(out);
      } catch {
        // One broken listener must not stop the others.
      }
    }
  }

  const snapshot = () => Object.fromEntries([...states].map(([id, st]) => [id, cleanState(st)]));

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
    pingTimer = null;
    refreshTimer = null;
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
      return;
    }
    if (msg.type === 'event' && msg.id === subId && msg.event) return onStates(msg.event);
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
    /** fn({ reset, set, remove }) after each batch; returns a function that stops it. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
