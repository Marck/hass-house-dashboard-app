// Live network (step 8): the backend's /api/ha/network in the demo's data
// shape (fixtures/synthetic.js, network), so the network screen does not
// change. Only what Home Assistant provides is filled in: no traffic, WAN
// speed, ping, outages, router/end device type or second site.

// The same as live.js's lit; not imported, live.js imports this file.
const lit = (text) => ({ text: String(text) });

export const SITE = 'site_01';

const ZB_ICON = { light: 'bulb', climate: 'radiator', door: 'door', motion: 'walk', leak: 'drop', plug: 'plug', climate_sensor: 'gauge', other: 'chip' };
const BANDS = ['wired', 'g5', 'g24', 'unknown'];
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Nothing yet, or nothing in Home Assistant: no source, and no demo data either. */
export function emptyNetwork() {
  return {
    live: true,
    present: { unifi: false, zigbee: false },
    zigbee: { coordinatorDevice: null, nodes: [], devices: [] },
    sites: [{ id: SITE, nameKey: 'net.src.unifi' }],
    bySite: { [SITE]: { wan: null, nodes: [], devices: [], active: [] } },
    availability: { lastBackupHours: null, items: [] },
  };
}

/** The last speedtest, Mbit/s and ms; undefined when Home Assistant has none, so nothing is shown. */
function speed(t, now) {
  if (!t) return undefined;
  const out = { down: finite(t.down), up: finite(t.up), ping: finite(t.ping) };
  if (out.down === undefined && out.up === undefined && out.ping === undefined) return undefined;
  const at = finite(t.at);
  // When it ran, if within the last day; an older result says so instead of a time.
  if (at !== undefined && at * 1000 <= now) out.at = now - at * 1000 < 86_400_000 ? new Date(at * 1000) : 'old';
  return out;
}

function unifi(u, t, now) {
  if (!u || !Array.isArray(u.nodes) || !u.nodes.length) return null;
  const nodes = u.nodes.map((n) => ({
    id: String(n.id),
    nameKey: n.id === 'wired' ? 'net.node.wiredClients' : lit(text(n.name) || String(n.id)),
    typeKey: n.id === 'wired' ? 'net.type.portUnknown' : n.main ? 'net.type.router' : (text(n.model) ? lit(n.model) : 'net.type.device'),
    link: n.main ? null : (n.id === 'wired' ? 'wired' : 'uplink'),
    online: n.online !== false,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const main = nodes.find((n) => !n.link) || nodes[0];
  main.link = null;
  nodes.sort((a, b) => Number(Boolean(a.link)) - Number(Boolean(b.link)));
  const devices = (u.devices || []).map((v) => ({
    id: String(v.id), nameKey: lit(text(v.name) || String(v.id)), icon: 'network',
    node: ids.has(String(v.node)) ? String(v.node) : main.id,
    band: BANDS.includes(v.band) ? v.band : 'unknown', online: v.online === true, traffic: false,
  }));
  const w = u.wan || {};
  const up = finite(w.upSeconds);
  const wan = {
    live: true, nameKey: 'net.wan', healthy: w.online === true,
    upHours: up === undefined ? undefined : Math.floor(up / 3600), upMinutes: up === undefined ? undefined : Math.floor((up % 3600) / 60),
    cpu: finite(w.cpu), memory: finite(w.memory), speed: speed(t, now),
  };
  return { wan, nodes, devices, active: [] };
}

function zigbee(z) {
  if (!z || !z.coordinator) return null;
  const root = { id: 'zb_coordinator', nameKey: lit(text(z.coordinator.name) || 'Zigbee'), typeKey: 'zb.type.coordinator', link: null };
  // Home Assistant does not say which router a device uses, so the devices hang
  // off one group instead of a made-up mesh.
  const group = { id: 'zb_devices', nameKey: 'zb.devices', typeKey: 'zb.type.routesUnknown', link: 'zigbee' };
  const devices = (z.devices || []).map((v) => {
    const out = {
      id: String(v.id), nameKey: lit(text(v.name) || String(v.id)), icon: ZB_ICON[v.kind] || 'chip',
      node: group.id, band: 'zb', online: v.online === true,
    };
    if (text(v.model)) out.modelKey = lit(v.model);
    if (finite(v.battery) !== undefined) out.battery = v.battery;
    if (finite(v.lqi) !== undefined) out.lqi = v.lqi;
    return out;
  });
  return { coordinatorDevice: null, nodes: devices.length ? [root, group] : [root], devices };
}

/** d.network from the backend's map; null or junk gives the empty network. */
export function buildNetworkLive(net, now = Date.now()) {
  const out = emptyNetwork();
  const u = unifi(net && net.unifi, net && net.speedtest, now);
  const z = zigbee(net && net.zigbee);
  if (u) {
    out.present.unifi = true;
    out.bySite[SITE] = u;
  }
  if (z) {
    out.present.zigbee = true;
    out.zigbee = z;
  }
  return out;
}
