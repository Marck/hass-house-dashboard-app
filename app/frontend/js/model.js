// Pure helpers over the normalized dashboard data. The views never read raw
// payloads, so Phase 2 only has to produce this same shape from Home Assistant.
import { clamp } from './util.js';
import { layoutFloor } from './art/planlayout.js';
import { netSources, EV_SLOTS } from './config.js';

/** The area an entity belongs to: its own, or else the area of its device. */
export const entityArea = (ha, e) => e.area || (e.device && ha.devices[e.device] ? ha.devices[e.device].area : null) || null;

/**
 * What a room shows: the entities of its linked areas plus the ones added by
 * hand. Diagnostic, hidden and disabled entities are left out. Linked areas
 * and added entities that do not exist are reported, not silently dropped.
 */
export function roomEntities(d, roomConfig) {
  const { ha } = d;
  const linked = roomConfig.areas.filter((id) => ha.areas[id]);
  const list = [];
  let filtered = 0;
  Object.keys(ha.entities).forEach((id) => {
    const e = ha.entities[id];
    const area = entityArea(ha, e);
    const inArea = linked.includes(area);
    if (!inArea && !roomConfig.include.includes(id)) return;
    if (e.category || e.hidden || e.disabled) {
      filtered += 1;
      return;
    }
    const via = e.area ? 'area' : 'device';
    list.push({ id, kind: e.kind, area, via: inArea ? via : 'manual', excluded: roomConfig.exclude.includes(id) });
  });
  return {
    list,
    filtered,
    missingAreas: roomConfig.areas.filter((id) => !ha.areas[id]),
    missingEntities: roomConfig.include.filter((id) => !ha.entities[id]),
  };
}

/** Rebuild d.floors and d.rooms from the configuration and the registries. */
export function applyConfig(d, cfg) {
  d.rooms = {};
  d.floors = cfg.floors.map((fl) => {
    const rooms = fl.rooms.map((id) => {
      const found = roomEntities(d, cfg.rooms[id]);
      const shown = found.list.filter((e) => !e.excluded);
      const refs = (kind) => shown.filter((e) => e.kind === kind).map((e) => e.id);
      const first = (kind) => {
        const hit = shown.find((e) => e.kind === kind);
        return hit ? d.ha.entities[hit.id] : null;
      };
      const door = first('door');
      const motion = first('motion');
      const temp = first('temp');
      d.rooms[id] = {
        icon: 'door',
        size: [3, 3],
        ...d.roomDefs[id],
        label: cfg.rooms[id].label,
        floor: fl.id,
        lights: refs('light'),
        switches: refs('switch'),
        climate: refs('climate'),
        speakers: refs('speaker'),
        door: door ? door.door : undefined,
        motion: motion ? motion.motion : null,
        history: motion ? motion.history : undefined,
        temp: temp ? temp.temp : undefined,
        missingAreas: found.missingAreas,
        missingEntities: found.missingEntities,
      };
      return d.rooms[id];
    });
    layoutFloor(rooms);
    return { ...d.floorDefs[fl.id], id: fl.id, label: fl.label, rooms: [...fl.rooms] };
  });
}

export function lightState(d, id) {
  const l = d.lights[id];
  if (!l.reachable || (l.feed && !d.switches[l.feed].on)) return 'unavailable';
  return l.on ? 'on' : 'off';
}

export function roomSummary(d, id) {
  const room = d.rooms[id];
  const states = room.lights.map((lid) => lightState(d, lid));
  const unavailable = states.filter((s) => s === 'unavailable').length;
  const doorOpen = Boolean(room.door && room.door.open);
  const missing = room.missingAreas.length + room.missingEntities.length;
  return {
    on: states.filter((s) => s === 'on').length,
    total: states.length,
    unavailable,
    available: states.length - unavailable,
    doorOpen,
    missing,
    attention: unavailable > 0 || doorOpen || missing > 0,
  };
}

export function homeSummary(d) {
  const ids = Object.keys(d.rooms);
  const unique = (key) => [...new Set(ids.reduce((all, id) => all.concat(d.rooms[id][key]), []))];
  const lights = unique('lights').map((id) => lightState(d, id));
  const climate = unique('climate').map((id) => d.climate[id]);
  return {
    doorsOpen: ids.filter((id) => d.rooms[id].door && d.rooms[id].door.open),
    doors: ids.filter((id) => d.rooms[id].door),
    motionNow: ids.filter((id) => d.rooms[id].motion === 'now'),
    lightsOn: lights.filter((s) => s === 'on').length,
    unreachable: lights.filter((s) => s === 'unavailable').length,
    acOn: climate.some((c) => c.kind === 'ac' && c.on),
    heatingOn: climate.some((c) => c.kind === 'heating' && c.on),
  };
}

const withSource = (list, src) => list.map((item) => ({ ...item, src }));

/**
 * The nodes and devices one network view shows. "All" merges the configured
 * sources. The Zigbee coordinator is also a UniFi client; Home Assistant knows
 * it as one device, so it appears once, as the root of the Zigbee devices.
 */
export function netModel(d, cfg, view, siteId) {
  const sources = netSources(cfg);
  const site = d.network.bySite[siteId];
  const zb = d.network.zigbee;
  const only = sources.length === 1 ? sources[0] : null;
  const kind = view === 'all' && only ? only : view;
  if (kind === 'unifi') {
    return { view, sources: ['unifi'], wan: site.wan, nodes: withSource(site.nodes, 'unifi'), devices: withSource(site.devices, 'unifi'), active: site.active };
  }
  if (kind === 'zigbee') {
    return { view, sources: ['zigbee'], wan: null, nodes: withSource(zb.nodes, 'zigbee'), devices: withSource(zb.devices, 'zigbee'), active: [] };
  }
  const shared = site.devices.some((v) => v.id === zb.coordinatorDevice);
  const root = { ...zb.nodes[0], nameKey: 'zb.network', link: 'wired', src: shared ? 'both' : 'zigbee' };
  return {
    view,
    sources: ['unifi', 'zigbee'],
    wan: site.wan,
    nodes: [...withSource(site.nodes, 'unifi'), root],
    devices: [
      ...withSource(site.devices.filter((v) => v.id !== zb.coordinatorDevice), 'unifi'),
      ...zb.devices.map((v) => ({ ...v, src: 'zigbee', node: root.id })),
    ],
    active: site.active,
  };
}

export function netStats(model) {
  const online = model.devices.filter((v) => v.online);
  const band = (name) => online.filter((v) => v.band === name).length;
  const from = (src) => model.devices.filter((v) => v.src === src).length;
  const battery = model.devices.filter((v) => v.battery !== undefined);
  return {
    online: online.length,
    offline: model.devices.length - online.length,
    wired: band('wired'),
    g5: band('g5'),
    g24: band('g24'),
    unknown: band('unknown'),
    unifi: from('unifi'),
    zigbee: from('zigbee'),
    battery: battery.length,
    lowBattery: battery.filter((v) => v.battery < 15).length,
    nodes: model.nodes.length,
  };
}

const UNAVAILABLE = ['unavailable', 'unknown', '', null, undefined];
const TO_KILO = { W: 0.001, kW: 1, Wh: 0.001, kWh: 1, MWh: 1000 };
const TO_MINUTES = { s: 1 / 60, min: 1, h: 60 };

/**
 * Normalized EV charging statistics for the configured entities. A statistic
 * without an entity, or one the user hid, is absent. A configured entity that
 * does not exist gives { error: 'missing' }; one without a usable state gives
 * { error: 'unavailable' }. Nothing is ever reported as zero by default.
 */
export function evStats(d, cfg) {
  const out = {};
  EV_SLOTS.forEach((slot) => {
    const id = cfg.ev.map[slot];
    if (!id || cfg.ev.hide.includes(slot)) return;
    const e = d.ev.entities[id];
    if (!e) {
      out[slot] = { id, error: 'missing' };
      return;
    }
    if (slot === 'status') {
      out[slot] = UNAVAILABLE.includes(e.state) ? { id, error: 'unavailable' } : { id, charging: e.cls === 'binary' ? e.state === 'on' : e.state === 'charging' };
      return;
    }
    const value = Number(e.state);
    if (UNAVAILABLE.includes(e.state) || !Number.isFinite(value)) {
      out[slot] = { id, error: 'unavailable' };
    } else if (slot === 'power' || slot === 'energy') {
      const factor = TO_KILO[e.unit];
      out[slot] = factor === undefined ? { id, error: 'unavailable' } : { id, value: value * factor };
    } else if (slot === 'duration') {
      const factor = TO_MINUTES[e.unit];
      out[slot] = factor === undefined ? { id, error: 'unavailable' } : { id, minutes: Math.round(value * factor) };
    } else if (slot === 'cost') {
      out[slot] = { id, value, currency: e.unit };
    } else {
      out[slot] = { id, value };
    }
  });
  return out;
}

/** What a climate unit is doing right now, as a translation-key suffix. */
export function acPhase(c) {
  if (!c.on) return 'off';
  // Home Assistant says what the device is doing; that wins over a guess from the temperatures.
  if (c.action === 'heating' || c.action === 'cooling') return c.target === undefined ? 'on' : c.action;
  if (c.action === 'idle' && c.settable !== false) return 'reached';
  if (c.settable === false) return 'on';
  if (c.mode === 'heat') return c.current < c.target ? 'heating' : 'reached';
  if (c.mode === 'cool') return c.current > c.target ? 'cooling' : 'reached';
  return c.mode;
}

// Mock commands. In Phase 2 these become allowlisted service calls on the backend.
export const commands = {
  toggleClimate(d, id) {
    d.climate[id].on = !d.climate[id].on;
  },
  /** Works for every climate unit with a settable target, AC and heating alike. */
  setTarget(d, id, value) {
    const c = d.climate[id];
    if (c.settable === false) return;
    const stepped = Math.round(Number(value) / c.step) * c.step;
    if (Number.isFinite(stepped)) c.target = clamp(stepped, c.min, c.max);
  },
  setAcMode(d, id, mode) {
    if (['auto', 'cool', 'dry', 'heat', 'fan'].includes(mode)) {
      d.climate[id].mode = mode;
      d.climate[id].on = true;
    }
  },
  setAcFan(d, id, fan) {
    if (['auto', 'low', 'medium', 'high'].includes(fan)) d.climate[id].fan = fan;
  },
  toggleAcPreset(d, id, preset) {
    const { presets } = d.climate[id];
    if (preset in presets) presets[preset] = !presets[preset];
  },
  toggleSwitch(d, id) {
    d.switches[id].on = !d.switches[id].on;
  },
  /** Returns false when the light cannot be reached, so the UI can say so. */
  toggleLight(d, id) {
    if (lightState(d, id) === 'unavailable') return false;
    d.lights[id].on = !d.lights[id].on;
    return true;
  },
  setRoomLights(d, roomId, on) {
    d.rooms[roomId].lights.forEach((id) => {
      if (lightState(d, id) !== 'unavailable') d.lights[id].on = on;
    });
  },
  allLightsOff(d) {
    Object.values(d.lights).forEach((l) => {
      l.on = false;
    });
  },
  setClimateKind(d, kind, on) {
    Object.values(d.climate).forEach((c) => {
      if (c.kind === kind) c.on = on;
    });
  },
  setOutside(d, on) {
    d.tonight.outside = on;
    Object.values(d.rooms).forEach((room) => {
      if (room.outdoor) room.lights.forEach((id) => {
        if (lightState(d, id) !== 'unavailable') d.lights[id].on = on;
      });
    });
  },
  toggleZone(d, id) {
    d.irrigation.running = d.irrigation.running === id ? null : id;
  },
};
