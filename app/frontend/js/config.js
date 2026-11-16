// The user's dashboard configuration: floors, rooms, links to Home Assistant
// areas and entities, card layout and optional features. Home Assistant stays
// the source of truth for areas, devices and entities; this only decides how
// they are grouped and presented.
//
// Phase 1 keeps it in this browser. Phase 2 moves it to the dashboard backend.
// Everything here is pure, so it runs in tests without a browser.

export const CONFIG_VERSION = 1;
export const LABEL_MAX = 40;
export const CARDS = {
  home: ['lights', 'music', 'irrigation', 'tonight'],
  energy: ['battery', 'balance', 'consumption', 'ev'],
  network: ['stats', 'map', 'wan'],
};
/** Optional cards start hidden. */
const OFF_BY_DEFAULT = ['ev'];
export const EV_SLOTS = ['status', 'power', 'energy', 'soc', 'duration', 'cost'];
/** Which kind of entity fits each EV statistic. */
export const EV_ACCEPTS = {
  status: ['status', 'binary'],
  power: ['power'],
  energy: ['energy'],
  soc: ['battery'],
  duration: ['duration'],
  cost: ['monetary'],
};
export const NET_SOURCES = ['unifi', 'zigbee'];
/** Playback details on the music card that can be switched off. */
export const MUSIC_SHOW = ['artwork', 'artist', 'room'];
export const MUSIC_FLAGS = ['multi', 'overview'];

// Shaped like Home Assistant ids: "area_id" or "domain.object_id".
const ID = /^[a-z0-9_]{1,60}(\.[a-z0-9_]{1,60})?$/;
const isId = (v) => typeof v === 'string' && ID.test(v);
const ids = (list) => (Array.isArray(list) ? [...new Set(list.filter(isId))] : []);

/** Trim, drop control characters and cap the length of a user-entered label. */
// The control-character range in the pattern is deliberate: removing them is the point.
export const cleanLabel = (value) => String(value === undefined || value === null ? '' : value)
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);

export function defaultConfig(d) {
  const rooms = {};
  Object.keys(d.roomDefs).forEach((id) => {
    rooms[id] = { label: '', areas: [...d.roomDefs[id].areas], include: [...(d.roomDefs[id].include || [])], exclude: [] };
  });
  const cards = {};
  Object.keys(CARDS).forEach((view) => {
    cards[view] = CARDS[view].filter((id) => !OFF_BY_DEFAULT.includes(id));
  });
  return {
    version: CONFIG_VERSION,
    floors: Object.keys(d.floorDefs).map((id) => ({ id, label: '', rooms: [...d.floorDefs[id].rooms] })),
    rooms,
    cards,
    ev: { map: Object.fromEntries(EV_SLOTS.map((slot) => [slot, null])), hide: [] },
    net: { unifi: true, zigbee: true },
    music: defaultMusic(d),
  };
}

/**
 * Every discovered player is managed at first. Home Assistant does not say
 * which speakers a permanent group contains, so the members are part of the
 * configuration; the demo fills them in.
 */
function defaultMusic(d) {
  const all = Object.keys(d.speakers);
  const members = {};
  all.filter((id) => d.speakers[id].kind === 'group').forEach((id) => {
    members[id] = [...d.speakers[id].members];
  });
  return { multi: true, overview: true, players: all, names: {}, preferred: null, show: [...MUSIC_SHOW], members };
}

/**
 * Turn anything (stored text, an imported file) into a valid configuration.
 * Unknown or malformed parts fall back to the defaults instead of throwing,
 * and every room ends up on exactly one floor.
 */
export function normalizeConfig(raw, d) {
  const base = defaultConfig(d);
  if (!raw || typeof raw !== 'object' || raw.version !== CONFIG_VERSION) return base;

  const rawRooms = raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {};
  const rooms = {};
  const floors = [];
  const placed = new Set();
  (Array.isArray(raw.floors) ? raw.floors : []).forEach((fl) => {
    if (!fl || !isId(fl.id) || floors.some((x) => x.id === fl.id)) return;
    const label = cleanLabel(fl.label);
    if (!label && !d.floorDefs[fl.id]) return; // a custom floor needs a name
    const own = ids(fl.rooms).filter((id) => !placed.has(id) && rawRooms[id] && typeof rawRooms[id] === 'object');
    own.forEach((id) => placed.add(id));
    floors.push({ id: fl.id, label, rooms: own });
  });
  if (!floors.length) return base;

  floors.forEach((fl) => {
    fl.rooms = fl.rooms.filter((id) => {
      const r = rawRooms[id];
      const label = cleanLabel(r.label);
      if (!label && !d.roomDefs[id]) return false; // a custom room needs a name
      rooms[id] = { label, areas: ids(r.areas), include: ids(r.include), exclude: ids(r.exclude) };
      return true;
    });
  });

  const cards = {};
  Object.keys(CARDS).forEach((view) => {
    const list = raw.cards && Array.isArray(raw.cards[view]) ? raw.cards[view] : base.cards[view];
    cards[view] = [...new Set(list.filter((id) => CARDS[view].includes(id)))];
  });

  const rawEv = raw.ev && typeof raw.ev === 'object' ? raw.ev : {};
  const rawMap = rawEv.map && typeof rawEv.map === 'object' ? rawEv.map : {};
  const ev = {
    map: Object.fromEntries(EV_SLOTS.map((slot) => [slot, isId(rawMap[slot]) ? rawMap[slot] : null])),
    hide: (Array.isArray(rawEv.hide) ? rawEv.hide : []).filter((slot) => EV_SLOTS.includes(slot)),
  };
  const rawNet = raw.net && typeof raw.net === 'object' ? raw.net : {};
  const net = { unifi: rawNet.unifi !== false, zigbee: rawNet.zigbee !== false };

  // A configuration saved before the music settings existed keeps the defaults.
  let music = base.music;
  if (raw.music && typeof raw.music === 'object') {
    const m = raw.music;
    const players = ids(m.players);
    const names = {};
    Object.keys(m.names && typeof m.names === 'object' ? m.names : {}).forEach((id) => {
      const label = cleanLabel(m.names[id]);
      if (isId(id) && label) names[id] = label;
    });
    const members = {};
    Object.keys(m.members && typeof m.members === 'object' ? m.members : {}).forEach((id) => {
      if (isId(id)) members[id] = ids(m.members[id]).filter((x) => x !== id);
    });
    music = {
      multi: m.multi !== false,
      overview: m.overview !== false,
      players,
      names,
      preferred: players.includes(m.preferred) ? m.preferred : null,
      show: Array.isArray(m.show) ? MUSIC_SHOW.filter((key) => m.show.includes(key)) : base.music.show,
      members,
    };
  }

  return { version: CONFIG_VERSION, floors, rooms, cards, ev, net, music };
}

/** Parse exported or stored text. Returns null when it is not a configuration at all. */
export function parseConfig(text, d) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw.version !== CONFIG_VERSION || !Array.isArray(raw.floors)) return null;
  return normalizeConfig(raw, d);
}

export const serializeConfig = (cfg) => JSON.stringify(cfg, null, 2);

// ---------- Queries ----------

export const floorOf = (cfg, roomId) => cfg.floors.find((fl) => fl.rooms.includes(roomId)) || null;
export const hiddenCards = (cfg, view) => CARDS[view].filter((id) => !cfg.cards[view].includes(id));
export const netSources = (cfg) => NET_SOURCES.filter((src) => cfg.net[src]);
/** All shows whatever is configured; a source's own view exists only when it is configured. */
export const netViews = (cfg) => (netSources(cfg).length ? ['all', ...netSources(cfg)] : []);

function nextId(prefix, taken) {
  let n = 1;
  while (taken.includes(`${prefix}_${String(n).padStart(2, '0')}`)) n += 1;
  return `${prefix}_${String(n).padStart(2, '0')}`;
}

function shift(list, item, dir) {
  const from = list.indexOf(item);
  const to = from + (dir === 'up' ? -1 : 1);
  if (from < 0 || to < 0 || to >= list.length) return false;
  list.splice(to, 0, list.splice(from, 1)[0]);
  return true;
}

function toggleIn(list, item) {
  const at = list.indexOf(item);
  if (at < 0) list.push(item);
  else list.splice(at, 1);
}

// ---------- Changes. Each mutates cfg and returns whether anything changed. ----------

export const edit = {
  addFloor(cfg, label) {
    const clean = cleanLabel(label);
    if (!clean) return null;
    const id = nextId('floor', cfg.floors.map((fl) => fl.id));
    cfg.floors.push({ id, label: clean, rooms: [] });
    return id;
  },
  /** An empty label is allowed only for a default floor, which then shows its built-in name. */
  renameFloor(cfg, d, id, label) {
    const fl = cfg.floors.find((x) => x.id === id);
    const clean = cleanLabel(label);
    if (!fl || (!clean && !d.floorDefs[id])) return false;
    fl.label = clean;
    return true;
  },
  moveFloor: (cfg, id, dir) => shift(cfg.floors, cfg.floors.find((fl) => fl.id === id), dir),
  /** Only an empty floor can go, and one floor always remains. Rooms are never deleted with it. */
  removeFloor(cfg, id) {
    const fl = cfg.floors.find((x) => x.id === id);
    if (!fl || fl.rooms.length || cfg.floors.length < 2) return false;
    cfg.floors.splice(cfg.floors.indexOf(fl), 1);
    return true;
  },
  addRoom(cfg, floorId, label) {
    const fl = cfg.floors.find((x) => x.id === floorId);
    const clean = cleanLabel(label);
    if (!fl || !clean) return null;
    const id = nextId('room', Object.keys(cfg.rooms));
    cfg.rooms[id] = { label: clean, areas: [], include: [], exclude: [] };
    fl.rooms.push(id);
    return id;
  },
  renameRoom(cfg, d, id, label) {
    const clean = cleanLabel(label);
    if (!cfg.rooms[id] || (!clean && !d.roomDefs[id])) return false;
    cfg.rooms[id].label = clean;
    return true;
  },
  moveRoom(cfg, id, dir) {
    const fl = floorOf(cfg, id);
    return Boolean(fl) && shift(fl.rooms, id, dir);
  },
  setRoomFloor(cfg, id, floorId) {
    const from = floorOf(cfg, id);
    const to = cfg.floors.find((fl) => fl.id === floorId);
    if (!from || !to || from === to) return false;
    from.rooms.splice(from.rooms.indexOf(id), 1);
    to.rooms.push(id);
    return true;
  },
  removeRoom(cfg, id) {
    const fl = floorOf(cfg, id);
    if (!fl) return false;
    fl.rooms.splice(fl.rooms.indexOf(id), 1);
    delete cfg.rooms[id];
    return true;
  },
  linkArea(cfg, roomId, areaId) {
    const room = cfg.rooms[roomId];
    if (!room || !isId(areaId) || room.areas.includes(areaId)) return false;
    room.areas.push(areaId);
    return true;
  },
  unlinkArea(cfg, roomId, areaId) {
    const room = cfg.rooms[roomId];
    if (!room || !room.areas.includes(areaId)) return false;
    room.areas.splice(room.areas.indexOf(areaId), 1);
    return true;
  },
  includeEntity(cfg, roomId, entityId) {
    const room = cfg.rooms[roomId];
    if (!room || !isId(entityId) || room.include.includes(entityId)) return false;
    room.include.push(entityId);
    return true;
  },
  dropEntity(cfg, roomId, entityId) {
    const room = cfg.rooms[roomId];
    if (!room || !room.include.includes(entityId)) return false;
    room.include.splice(room.include.indexOf(entityId), 1);
    return true;
  },
  toggleEntity(cfg, roomId, entityId) {
    if (!cfg.rooms[roomId] || !isId(entityId)) return false;
    toggleIn(cfg.rooms[roomId].exclude, entityId);
    return true;
  },
  moveCard: (cfg, view, id, dir) => Boolean(cfg.cards[view]) && shift(cfg.cards[view], id, dir),
  hideCard(cfg, view, id) {
    const list = cfg.cards[view];
    if (!list || !list.includes(id)) return false;
    list.splice(list.indexOf(id), 1);
    return true;
  },
  showCard(cfg, view, id) {
    if (!CARDS[view] || !CARDS[view].includes(id) || cfg.cards[view].includes(id)) return false;
    cfg.cards[view].push(id);
    return true;
  },
  resetCards(cfg, d) {
    cfg.cards = defaultConfig(d).cards;
    return true;
  },
  setEvEntity(cfg, slot, entityId) {
    if (!EV_SLOTS.includes(slot)) return false;
    cfg.ev.map[slot] = isId(entityId) ? entityId : null;
    return true;
  },
  toggleEvStat(cfg, slot) {
    if (!EV_SLOTS.includes(slot)) return false;
    toggleIn(cfg.ev.hide, slot);
    return true;
  },
  toggleNetSource(cfg, src) {
    if (!NET_SOURCES.includes(src)) return false;
    cfg.net[src] = !cfg.net[src];
    return true;
  },
  toggleMusicFlag(cfg, flag) {
    if (!MUSIC_FLAGS.includes(flag)) return false;
    cfg.music[flag] = !cfg.music[flag];
    return true;
  },
  toggleMusicShow(cfg, key) {
    if (!MUSIC_SHOW.includes(key)) return false;
    toggleIn(cfg.music.show, key);
    return true;
  },
  /** Manage a player or stop managing it. Its name and group members are kept for when it comes back. */
  togglePlayer(cfg, id) {
    if (!isId(id)) return false;
    toggleIn(cfg.music.players, id);
    if (!cfg.music.players.includes(cfg.music.preferred)) cfg.music.preferred = null;
    return true;
  },
  /** An empty name goes back to the name Home Assistant gives the player. */
  renamePlayer(cfg, id, label) {
    if (!isId(id)) return false;
    const clean = cleanLabel(label);
    if (clean) cfg.music.names[id] = clean;
    else delete cfg.music.names[id];
    return true;
  },
  setPreferredPlayer(cfg, id) {
    if (id && !cfg.music.players.includes(id)) return false;
    cfg.music.preferred = id || null;
    return true;
  },
  toggleGroupMember(cfg, groupId, memberId) {
    if (!isId(groupId) || !isId(memberId) || groupId === memberId) return false;
    if (!cfg.music.members[groupId]) cfg.music.members[groupId] = [];
    toggleIn(cfg.music.members[groupId], memberId);
    return true;
  },
};
